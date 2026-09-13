// techbench.js — Technological Bench recipes for the OHWikiGuide Twitch Extension.
// The wiki page keeps its data in four JS objects (survivalData, productionData,
// combatData, buildData): { key: { title, lines: ["<b>Tech Level 1 (H):</b> 29 Copper Ore + 17 Gravel", ...] } }.
// Served at GET /api/techbench (list) and /api/techbench/:id (levels + materials).

const vm = require("vm");
const WIKI_BASE = process.env.WIKI_BASE || "https://ohwikiguide.com";
const PAGE = process.env.TECHBENCH_PAGE || "Technological Bench";
const TTL_MS = 10 * 60 * 1000;
const UA = "OHWikiGuideExtension/1.0 (+https://ohwikiguide.com)";
const SOURCES = { survivalData: "Survival", productionData: "Production", combatData: "Combat", buildData: "Build" };

let cache = { ts: 0, items: [], byId: new Map(), error: null };
let inflight = null;

const stripTags = (s) => String(s).replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();

async function fetchWikitext() {
  const url = new URL(`${WIKI_BASE}/api.php`);
  url.search = new URLSearchParams({ action: "parse", page: PAGE, prop: "wikitext", format: "json", formatversion: "2" });
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`Wiki API ${res.status}`);
  const text = (await res.json())?.parse?.wikitext;
  if (!text) throw new Error("no wikitext");
  return text;
}

function extract(wikitext, name) {
  const start = wikitext.indexOf(`const ${name} = {`);
  if (start < 0) return null;
  const end = wikitext.indexOf("\n};", start);
  if (end < 0) return null;
  try { return vm.runInNewContext(`(${wikitext.slice(start + `const ${name} = `.length, end + 2)})`, {}, { timeout: 1000 }); }
  catch (e) { console.error(`[techbench] could not parse ${name}:`, e.message); return null; }
}

// "<b>Tech Level 12 (H):</b> 68 Steel Ingot + 30 Parts" -> { label: "Tech Level 12 (H)", materials: ["68 Steel Ingot", "30 Parts"] }
function parseLine(line) {
  const m = String(line).match(/^(?:<b>([\s\S]*?):?<\/b>)?\s*([\s\S]*)$/);
  const label = stripTags(m?.[1] || "").replace(/:$/, "");
  const materials = stripTags(m?.[2] || "").split(" + ").map((s) => s.trim()).filter(Boolean);
  return { label, materials };
}

async function refresh() {
  const text = await fetchWikitext();
  const items = [];
  const byId = new Map();
  for (const [src, category] of Object.entries(SOURCES)) {
    const data = extract(text, src);
    if (!data) continue;
    for (const [key, entry] of Object.entries(data)) {
      const id = `${category.toLowerCase()}_${key}`;
      const levels = (entry.lines || []).map(parseLine).filter((l) => l.materials.length);
      const full = { id, name: stripTags(entry.title || key), category, levels, url: `${WIKI_BASE}/Technological_Bench` };
      byId.set(id, full);
      items.push({ id, name: full.name, category, levels: levels.length, first: levels[0] ? levels[0].label : "" });
    }
  }
  items.sort((a, b) => a.name.localeCompare(b.name));
  cache = { ts: Date.now(), items, byId, error: null };
  console.log(`[techbench] loaded ${items.length} recipes`);
  return cache;
}

async function ensureFresh() {
  if (Date.now() - cache.ts < TTL_MS && cache.items.length) return cache;
  if (!inflight) {
    inflight = refresh().catch((e) => {
      console.error("[techbench] refresh failed:", e.message);
      cache.error = e.message;
      cache.ts = cache.items.length ? Date.now() - TTL_MS + 60 * 1000 : 0;
      return cache;
    }).finally(() => { inflight = null; });
  }
  return cache.items.length ? cache : inflight;
}

async function list() { const c = await ensureFresh(); return { updated: c.ts, count: c.items.length, items: c.items }; }
async function get(id) { const c = await ensureFresh(); return c.byId.get(String(id)) || null; }
async function status() { return { count: cache.items.length, updated: cache.ts, error: cache.error }; }

module.exports = { list, get, refresh, status };
