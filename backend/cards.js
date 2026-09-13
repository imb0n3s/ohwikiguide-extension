// cards.js — generic reader for the wiki's "tile + pop-up card" pages
// (Settlements, Securement Silo, Monolith). Each page has scenario headings
// (Manibus / Way of Winter / Isles of Abyss), a tile grid under each heading, and one
// collapsible detail card per tile (mw-customcollapsible-<id>).
//
//   makeSource({ page: "Securement Silo", idPrefix: "silo", tag: "silos" })
//     -> { list(), get(id), refresh(), status() }

const WIKI_BASE = process.env.WIKI_BASE || "https://ohwikiguide.com";
const TTL_MS = 10 * 60 * 1000;
const UA = "OHWikiGuideExtension/1.0 (+https://ohwikiguide.com)";
const SCENARIOS = ["Manibus", "Way of Winter", "Isles of Abyss"];
const TIERS = ["Normal", "Hard", "Pro", "Nightmare"];

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

async function resolveImages(fileNames) {
  const missing = [...new Set(fileNames.filter(Boolean))].filter((f) => !imageUrlCache.has(f));
  for (let i = 0; i < missing.length; i += 50) {
    const batch = missing.slice(i, i + 50);
    const data = await api({ action: "query", titles: batch.join("|"), prop: "imageinfo", iiprop: "url", iiurlwidth: "300" });
    for (const p of data.query?.pages || []) {
      const ii = p.imageinfo?.[0];
      if (ii) imageUrlCache.set(p.title, { url: ii.url, thumb: ii.thumburl || ii.url });
      for (const asked of batch) if (asked.replace(/_/g, " ").toLowerCase() === p.title.replace(/_/g, " ").toLowerCase()) imageUrlCache.set(asked, imageUrlCache.get(p.title) || null);
    }
    for (const asked of batch) if (!imageUrlCache.has(asked)) imageUrlCache.set(asked, null);
  }
  return (name) => (name && imageUrlCache.get(name)) || null;
}

// Split the page into scenario blocks: heading -> tiles (until the next heading or the first detail card).
function parseScenarios(wikitext, idPrefix) {
  const firstCard = wikitext.search(/<div id="mw-customcollapsible-/);
  const top = firstCard > 0 ? wikitext.slice(0, firstCard) : wikitext;
  const heads = [...top.matchAll(/<div style="[^"]*">(Manibus|Way of Winter|Isles of Abyss)<\/div>/g)];
  const scenarios = [];
  heads.forEach((h, i) => {
    const body = top.slice(h.index + h[0].length, i + 1 < heads.length ? heads[i + 1].index : undefined);
    const items = [];
    const tileRx = new RegExp(`mw-customtoggle-(${idPrefix}[\\w-]+)"[^>]*>(?:\\[\\[File:([^|\\]]+)\\|[^\\]]*\\]\\])?<div class="mpb-tile-label">([^<]+)<\\/div>`, "g");
    let t;
    while ((t = tileRx.exec(body))) items.push({ id: t[1], file: t[2] ? `File:${t[2].trim()}` : null, name: stripTags(t[3]) });
    const note = items.length ? null : stripTags((body.match(/<div[^>]*>([^<]*(?:No [a-z]+ added yet|added yet)[^<]*)<\/div>/i) || [, "Nothing added yet."])[1]);
    scenarios.push({ name: h[1], items, note });
  });
  for (const s of SCENARIOS) if (!scenarios.find((x) => x.name === s)) scenarios.push({ name: s, items: [], note: "Nothing added yet." });
  scenarios.sort((a, b) => SCENARIOS.indexOf(a.name) - SCENARIOS.indexOf(b.name));
  return scenarios;
}

// One detail card -> { file, fields:[{label,value}], sections:[{label, items}] }
function parseCard(html, name) {
  const file = (html.match(/\[\[File:([^|\]]+)\|/) || [])[1];
  const divs = [...html.matchAll(/<div style="[^"]*">([\s\S]*?)<\/div>/g)].map((d) => stripTags(d[1])).filter(Boolean);
  const fields = [];
  const sections = [];
  let current = null;
  let tier = null, tierLevel = "";
  const tierLabel = (sub) => `${tier}${tierLevel ? ` (Lv ${tierLevel})` : ""}${sub ? ` · ${sub}` : ""}`;
  for (const text of divs) {
    if (!text || /^\[\[File:/.test(text) || /^(Tap anywhere|Video Guide$)/i.test(text) || text === name) continue;
    if (TIERS.includes(text)) { tier = text; tierLevel = ""; current = null; continue; }
    if (tier && /^Recommended Level:/i.test(text)) { tierLevel = text.replace(/^Recommended Level:\s*/i, ""); continue; }
    if (tier && /^(Challenge Rewards|Weekly (Bonus )?Rewards)$/i.test(text)) { current = { label: tierLabel(/Weekly/i.test(text) ? "Weekly Bonus" : ""), items: [] }; sections.push(current); continue; }
    if (/^[A-Za-z0-9' ]+:$/.test(text)) { current = { label: text.slice(0, -1), items: [] }; sections.push(current); continue; }
    const kv = text.match(/^([A-Za-z0-9' ]{2,40}):\s*(.+)$/);
    if (kv && !tier) { fields.push({ label: kv[1].trim(), value: kv[2].trim() }); current = null; continue; }
    if (current) current.items.push(text);
    else if (kv) fields.push({ label: kv[1].trim(), value: kv[2].trim() });
  }
  return { file: file ? `File:${file.trim()}` : null, fields, sections: sections.filter((s) => s.items.length) };
}

function makeSource({ page, idPrefix, tag, urlPath }) {
  let cache = { ts: 0, scenarios: [], byId: new Map(), error: null };
  let inflight = null;

  async function refresh() {
    const data = await api({ action: "parse", page, prop: "wikitext" });
    const text = data?.parse?.wikitext;
    if (!text) throw new Error("no wikitext");
    const scenarios = parseScenarios(text, idPrefix);
    const nameById = new Map();
    for (const s of scenarios) for (const it of s.items) nameById.set(it.id, it.name);
    const details = new Map();
    const cardRx = new RegExp(`<div id="mw-customcollapsible-(${idPrefix}[\\w-]+)"[\\s\\S]*?Tap anywhere to close\\.`, "g");
    let c;
    while ((c = cardRx.exec(text))) details.set(c[1], parseCard(c[0], nameById.get(c[1])));

    const files = [];
    for (const s of scenarios) for (const it of s.items) { files.push(it.file); files.push(details.get(it.id)?.file); }
    const img = await resolveImages(files);

    const byId = new Map();
    for (const s of scenarios) {
      s.items = s.items.map((it) => {
        const d = details.get(it.id) || { fields: [], sections: [] };
        const im = img(it.file) || img(d.file);
        const sub = d.fields.find((f) => /^(Boss|Zone)$/i.test(f.label));
        const full = {
          id: it.id, name: it.name, scenario: s.name,
          image: im?.url || null, thumb: im?.thumb || null,
          zone: d.fields.find((f) => f.label === "Zone")?.value || null,
          location: d.fields.find((f) => f.label === "Location")?.value || null,
          fields: d.fields, sections: d.sections,
          url: `${WIKI_BASE}/${urlPath}`,
        };
        // a card that already exists under another scenario (same id) keeps one entry per scenario in the list
        if (!byId.has(it.id)) byId.set(it.id, full); else byId.get(it.id).scenario += ` / ${s.name}`;
        return { id: full.id, name: full.name, scenario: s.name, thumb: full.thumb, zone: full.zone, location: full.location, sub: sub ? `${sub.label}: ${sub.value}` : null };
      });
    }
    cache = { ts: Date.now(), scenarios, byId, error: null };
    console.log(`[${tag}] loaded ${byId.size} cards from "${page}"`);
    return cache;
  }

  async function ensureFresh() {
    if (Date.now() - cache.ts < TTL_MS && cache.byId.size) return cache;
    if (!inflight) {
      inflight = refresh().catch((e) => {
        console.error(`[${tag}] refresh failed:`, e.message);
        cache.error = e.message;
        cache.ts = cache.byId.size ? Date.now() - TTL_MS + 60 * 1000 : 0;
        return cache;
      }).finally(() => { inflight = null; });
    }
    return cache.byId.size ? cache : inflight;
  }

  return {
    list: async () => { const c = await ensureFresh(); return { updated: c.ts, count: c.byId.size, scenarios: c.scenarios }; },
    get: async (id) => { const c = await ensureFresh(); return c.byId.get(String(id)) || null; },
    refresh,
    status: async () => ({ count: cache.byId.size, updated: cache.ts, error: cache.error }),
  };
}

module.exports = { makeSource };
