// OHWikiGuide Twitch Extension — backend (EBS)
// Standalone service. Reads ohwikiguide.com, caches it, and serves JSON to the
// extension views (panel / video component / mobile). Completely independent of
// the OH Wiki Guide chat bot.
//
//   GET /health                 -> counts per data source
//   GET /api/deviations[/:id]   -> Deviation Main Page
//   GET /api/settlements[/:id]  -> Settlements
//   GET /api/silos[/:id]        -> Securement Silo
//   GET /api/monoliths[/:id]    -> Monolith
//   GET /api/techbench[/:id]    -> Technological Bench

const express = require("express");
const deviations = require("./deviations");
const settlements = require("./settlements");
const techbench = require("./techbench");
const { makeSource } = require("./cards");

const silos = makeSource({ page: "Securement Silo", idPrefix: "silo", tag: "silos", urlPath: "Securement_Silo" });
const monoliths = makeSource({ page: "Monolith", idPrefix: "mono", tag: "monoliths", urlPath: "Monolith" });

const PORT = process.env.PORT || 3000;
const app = express();
app.disable("x-powered-by");
app.set("trust proxy", 1);

// The views run on https://<client-id>.ext-twitch.tv, so CORS must allow it. Public wiki data -> wildcard.
app.use((req, res, next) => {
  res.set({
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  });
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

app.get("/", (req, res) => res.type("text").send("OHWikiGuide Twitch Extension backend. See /api/deviations, /api/settlements, /api/silos, /api/monoliths, /api/techbench"));

app.get("/health", async (req, res) => {
  const [d, s, si, mo, tb] = await Promise.all([deviations.status(), settlements.status(), silos.status(), monoliths.status(), techbench.status()]);
  res.json({ ok: d.count > 0, deviations: d.count, settlements: s.count, silos: si.count, monoliths: mo.count, techbench: tb.count, updated: d.updated,
    error: d.error || s.error || si.error || mo.error || tb.error || undefined });
});

function mount(path, source) {
  app.get(`/api/${path}`, async (req, res) => {
    try { res.set("Cache-Control", "public, max-age=300"); res.json(await source.list()); }
    catch (e) { res.status(503).json({ error: e.message }); }
  });
  app.get(`/api/${path}/:id`, async (req, res) => {
    try {
      const d = await source.get(req.params.id);
      if (!d) return res.status(404).json({ error: "not found" });
      res.set("Cache-Control", "public, max-age=300");
      res.json(d);
    } catch (e) { res.status(503).json({ error: e.message }); }
  });
}
mount("deviations", deviations);
mount("settlements", settlements);
mount("silos", silos);
mount("monoliths", monoliths);
mount("techbench", techbench);

app.listen(PORT, () => {
  console.log(`[ohwikiguide-ext] listening on ${PORT}`);
  for (const [name, src] of Object.entries({ deviations, settlements, silos, monoliths, techbench })) {
    src.refresh().catch((e) => console.error(`[ohwikiguide-ext] ${name} initial load failed:`, e.message));
  }
});
