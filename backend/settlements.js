// settlements.js — Settlement data for the OHWikiGuide Twitch Extension.
// Parses the wiki's "Settlements" page: scenario headings (Manibus, Way of Winter,
// Isles of Abyss), the tile grid under each, and the collapsible detail card for
// every tile (location, zone, mystical crate, confirmed facility drops).
// Served by server.js at GET /api/settlements and /api/settlements/:id.

const WIKI_BASE = process.env.WIKI_BASE || "https://ohwikiguide.com";
const PAGE = process.env.SETTLEMENTS_PAGE || "Settlements";
const TTL_MS = 10 * 60 * 1000;
const UA = "OHWikiGuideExtension/1.0 (+https://ohwikiguide.com)";
const SCENARIOS = ["Manibus", "Way of Winter", "Isles of Abyss"];

let cache = { ts: 0, scenarios: [], byId: new Map(), error: null };
let inflight = null;
const imageUrlCache = new Map(); // "File:X.png" -> { url, thumb }

async function api(params) {
  const url = new URL(`${WIKI_BASE}/api.php`);
  url.search = new URLSearchParams({ format: "json", formatversion: "2", ...params });
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`Wiki API ${res.status}`);
  return res.json();
}

const stripTags = (s) => String(s)
  .replace(/<br\s*\/?>/gi, " ").replace(/<[^>]+>/g, "")
  .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
  .replace(/\s+/g, " ").trim();

// Resolve [[File:...]] names to real URLs (originals + 300px thumbs) in batches of 50.
async function resolveImages(fileNames) {
  const missing = [...new Set(fileNames)].filter((f) => !imageUrlCache.has(f));
  for (let i = 0; i < missing.length; i += 50) {
    const batch = missing.slice(i, i + 50);
    const data = await api({ action: "query", titles: batch.join("|"), prop: "imageinfo", iiprop: "url", iiurlwidth: "300" });
    for (const p of data.query?.pages || []) {
      const ii = p.imageinfo?.[0];
      if (ii) imageUrlCache.set(p.title, { url: ii.url, thumb: ii.thumburl || ii.url });
      // Also key by the exact name we asked for (MediaWiki normalises underscores/case).
      for (const asked of batch) if (asked.replace(/_/g, " ").toLowerCase() === p.title.replace(/_/g, " ").toLowerCase()) imageUrlCache.set(asked, imageUrlCache.get(p.title) || null);
    }
  }
  return (name) => imageUrlCache.get(name) || null;
}

function parse(wikitext) {
  // 1) Scenario sections: heading div followed by the tile grid (or a "none yet" note).
  const scenarios = [];
  const headRx = /<div style="[^"]*">(Manibus|Way of Winter|Isles of Abyss)<\/div>([\s\S]*?)(?=<div style="[^"]*">(?:Manibus|Way of Winter|Isles of Abyss)<\/div>|<div class="mpb-foot)/g;
  let m;
  while ((m = headRx.exec(wikitext))) {
    const name = m[1];
    const body = m[2];
    const items = [];
    const tileRx = /mw-customtoggle-(setl[\w-]+)"[^>]*>\[\[File:([^|\]]+)\|[^\]]*\]\]<div class="mpb-tile-label">([^<]+)<\/div>/g;
    let t;
    while ((t = tileRx.exec(body))) items.push({ id: t[1], file: `File:${t[2].trim()}`, name: stripTags(t[3]) });
    const note = items.length ? null : stripTags((body.match(/<div[^>]*>([^<]*No settlements[^<]*)<\/div>/i) || [, "No settlements added yet."])[1]);
    scenarios.push({ name, items, note });
  }
  for (const s of SCENARIOS) if (!scenarios.find((x) => x.name === s)) scenarios.push({ name: s, items: [], note: "No settlements added yet." });
  scenarios.sort((a, b) => SCENARIOS.indexOf(a.name) - SCENARIOS.indexOf(b.name));

  // 2) Detail cards: <div id="mw-customcollapsible-ID" ...> ... </div></div></div>
  const details = new Map();
  const cardRx = /<div id="mw-customcollapsible-(setl[\w-]+)"[\s\S]*?Tap anywhere to close\./g;
  let c;
  while ((c = cardRx.exec(wikitext))) {
    const id = c[1];
    const html = c[0];
    const file = (html.match(/\[\[File:([^|\]]+)\|/) || [])[1];
    // Walk the divs in order; labels end with ":" and are uppercase-styled.
    const divs = [...html.matchAll(/<div style="[^"]*">([\s\S]*?)<\/div>/g)].map((d) => stripTags(d[1])).filter(Boolean);
    const fields = [];
    const sections = [];
    let current = null;
    for (const text of divs) {
      if (/^(Location|Zone):/i.test(text)) { const [k, ...v] = text.split(":"); fields.push({ label: k.trim(), value: v.join(":").trim() }); current = null; continue; }
      if (/^[A-Za-z ]+:$/.test(text)) { current = { label: text.slice(0, -1), items: [] }; sections.push(current); continue; }
      if (/^Tap anywhere/i.test(text) || text === "") continue;
      if (current) current.items.push(text);
    }
    // The card title is the first plain div after the image (no colon); skip it via fields/sections logic above.
    details.set(id, { file: file ? `File:${file.trim()}` : null, fields, sections: sections.filter((s) => s.items.length) });
  }
  return { scenarios, details };
}

async function refresh() {
  const data = await api({ action: "parse", page: PAGE, prop: "wikitext" });
  const text = data?.parse?.wikitext;
  if (!text) throw new Error("no wikitext");
  const { scenarios, details } = parse(text);
  const files = [];
  for (const s of scenarios) for (const it of s.items) { files.push(it.file); const d = details.get(it.id); if (d?.file) files.push(d.file); }
  const img = await resolveImages(files);

  const byId = new Map();
  for (const s of scenarios) {
    s.items = s.items.map((it) => {
      const d = details.get(it.id) || { fields: [], sections: [] };
      const tileImg = img(it.file) || img(d.file);
      const full = {
        id: it.id, name: it.name, scenario: s.name,
        image: tileImg?.url || null, thumb: tileImg?.thumb || null,
        zone: d.fields.find((f) => f.label === "Zone")?.value || null,
        location: d.fields.find((f) => f.label === "Location")?.value || null,
        fields: d.fields, sections: d.sections,
        url: `${WIKI_BASE}/Settlements`,
      };
      byId.set(it.id, full);
      return { id: full.id, name: full.name, scenario: full.scenario, thumb: full.thumb, zone: full.zone, location: full.location };
    });
  }
  cache = { ts: Date.now(), scenarios, byId, error: null };
  console.log(`[settlements] loaded ${byId.size} settlements across ${scenarios.length} scenarios`);
  return cache;
}

async function ensureFresh() {
  if (Date.now() - cache.ts < TTL_MS && cache.byId.size) return cache;
  if (!inflight) {
    inflight = refresh().catch((e) => {
      console.error("[settlements] refresh failed:", e.message);
      cache.error = e.message;
      cache.ts = cache.byId.size ? Date.now() - TTL_MS + 60 * 1000 : 0;
      return cache;
    }).finally(() => { inflight = null; });
  }
  return cache.byId.size ? cache : inflight;
}

async function list() {
  const c = await ensureFresh();
  return { updated: c.ts, count: c.byId.size, scenarios: c.scenarios };
}
async function get(id) {
  const c = await ensureFresh();
  return c.byId.get(String(id)) || null;
}
async function status() { return { count: cache.byId.size, updated: cache.ts, error: cache.error }; }

module.exports = { list, get, refresh, status };
