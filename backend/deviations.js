// deviations.js — read-only Deviation data for the OHWikiGuide Twitch Extension.
// Pulls the JS data objects out of the wiki's "Deviation Main Page" (the same
// objects the page's dropdowns use), turns each entry into structured JSON and
// caches the result. Served by server.js at GET /api/deviations and /api/deviations/:id.

const vm = require("vm");
const WIKI_BASE = process.env.WIKI_BASE || "https://ohwikiguide.com";

const PAGE = process.env.DEVIATION_PAGE || "Deviation Main Page";
const TTL_MS = 10 * 60 * 1000; // re-read the wiki every 10 min
const UA = "OHWikiGuideExtension/1.0 (+https://ohwikiguide.com)";

const CATEGORY_SOURCES = { craftingData: "Crafting", combatData: "Combat", territoryData: "Territory" };
const SECTION_LABELS = new Set(["securement environment", "attacks", "drops from", "variations", "trait", "notes", "skins"]);

let cache = { ts: 0, items: [], byId: new Map(), error: null };
let inflight = null;

async function fetchWikitext() {
  const url = new URL(`${WIKI_BASE}/api.php`);
  url.search = new URLSearchParams({ action: "parse", page: PAGE, prop: "wikitext", format: "json", formatversion: "2" });
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`Wiki API ${res.status}`);
  const data = await res.json();
  const text = data?.parse?.wikitext;
  if (!text) throw new Error("no wikitext in response");
  return text;
}

// Extract `const name = { ... };` object literals from the page's <script> and evaluate them in a sandbox.
function extractDataObjects(wikitext, names) {
  const out = {};
  for (const name of names) {
    const start = wikitext.indexOf(`const ${name} = {`);
    if (start < 0) continue;
    const end = wikitext.indexOf("\n};", start);
    if (end < 0) continue;
    const literal = wikitext.slice(start + `const ${name} = `.length, end + 2);
    try {
      out[name] = vm.runInNewContext(`(${literal})`, {}, { timeout: 1000 });
    } catch (e) {
      console.error(`[deviations] could not parse ${name}:`, e.message);
    }
  }
  return out;
}

const stripTags = (s) => String(s)
  .replace(/<br\s*\/?>/gi, " ")
  .replace(/<[^>]+>/g, "")
  .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
  .replace(/\s+/g, " ").trim();

// lines: ["<img...>", "<b>Function:</b> text", "<b>Drops From:</b>", "Manibus: X", ...]
function structure(id, entry, categories) {
  const images = [];
  const fields = [];   // { label, value }
  const sections = []; // { label, rows: [{ k, v } | { text }] }
  let func = "";
  let current = null;

  for (const raw of entry.lines || []) {
    const imgRx = /src=['"]([^'"]+)['"]/g;
    let m;
    let hadImg = false;
    while ((m = imgRx.exec(raw))) { images.push(m[1]); hadImg = true; }
    if (hadImg && !/<b>/.test(raw)) continue;

    const labeled = raw.match(/^<b>(.*?):<\/b>\s*([\s\S]*)$/);
    if (labeled) {
      const label = stripTags(labeled[1]);
      const value = stripTags(labeled[2]);
      const low = label.toLowerCase();
      if (low === "function") { func = value; current = null; continue; }
      if (SECTION_LABELS.has(low) || !value) {
        current = { label, rows: [] };
        sections.push(current);
        if (value) current.rows.push({ text: value });
      } else {
        current = null;
        fields.push({ label, value });
      }
      continue;
    }
    const text = stripTags(raw);
    if (!text) continue;
    const row = (() => {
      const i = text.indexOf(": ");
      return i > 0 && i < 40 ? { k: text.slice(0, i), v: text.slice(i + 2) } : { text };
    })();
    if (current) current.rows.push(row);
    else fields.push({ label: "", value: text });
  }

  return {
    id,
    name: stripTags(entry.title || id),
    image: images[0] || null,
    images,
    categories,
    function: func,
    fields,
    sections,
    url: `${WIKI_BASE}/Deviation_Main_Page`,
  };
}

async function refresh() {
  const wikitext = await fetchWikitext();
  const objs = extractDataObjects(wikitext, ["deviationsData", ...Object.keys(CATEGORY_SOURCES)]);
  const main = objs.deviationsData;
  if (!main || !Object.keys(main).length) throw new Error("deviationsData not found on page");

  const items = [];
  const byId = new Map();
  for (const [id, entry] of Object.entries(main)) {
    const categories = Object.entries(CATEGORY_SOURCES).filter(([k]) => objs[k] && objs[k][id]).map(([, label]) => label);
    const item = structure(id, entry, categories);
    items.push(item);
    byId.set(id, item);
  }
  items.sort((a, b) => a.name.localeCompare(b.name));
  cache = { ts: Date.now(), items, byId, error: null };
  console.log(`[deviations] loaded ${items.length} deviations from "${PAGE}"`);
  return cache;
}

async function ensureFresh() {
  if (Date.now() - cache.ts < TTL_MS && cache.items.length) return cache;
  if (!inflight) {
    inflight = refresh().catch((e) => {
      console.error("[deviations] refresh failed:", e.message);
      cache.error = e.message;
      cache.ts = cache.items.length ? Date.now() - TTL_MS + 60 * 1000 : 0; // retry in 1 min
      return cache;
    }).finally(() => { inflight = null; });
  }
  return cache.items.length ? cache : inflight; // serve stale immediately if we have anything
}

async function list() {
  const c = await ensureFresh();
  return {
    updated: c.ts,
    count: c.items.length,
    items: c.items.map((d) => ({ id: d.id, name: d.name, image: d.image, categories: d.categories, function: d.function })),
  };
}

async function get(id) {
  const c = await ensureFresh();
  return c.byId.get(String(id).toLowerCase()) || null;
}

async function status() {
  return { count: cache.items.length, updated: cache.ts, error: cache.error };
}

module.exports = { list, get, refresh, status };
