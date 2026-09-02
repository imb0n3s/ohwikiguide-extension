// OHWikiGuide Twitch Extension — backend (EBS)
// Standalone service. Reads the Deviation data from ohwikiguide.com, caches it,
// and serves it as JSON to the extension panel. Completely independent of the
// OH Wiki Guide chat bot.
//
//   GET /health              -> { ok: true, deviations: 61, updated: <ms> }
//   GET /api/deviations      -> list  (id, name, image, categories, function)
//   GET /api/deviations/:id  -> full card (fields + sections)

const express = require("express");
const deviations = require("./deviations");

const PORT = process.env.PORT || 3000;
const app = express();
app.disable("x-powered-by");
app.set("trust proxy", 1);

// The panel runs on https://<client-id>.ext-twitch.tv, so CORS must allow it.
// The data is public wiki content, so a wildcard is fine.
app.use((req, res, next) => {
  res.set({
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  });
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

app.get("/", (req, res) => res.type("text").send("OHWikiGuide Twitch Extension backend. See /api/deviations"));

app.get("/health", async (req, res) => {
  const c = await deviations.status();
  const s = await settlements.status();
  res.json({ ok: c.count > 0, deviations: c.count, settlements: s.count, updated: c.updated, error: c.error || s.error || undefined });
});

app.get("/api/deviations", async (req, res) => {
  try {
    res.set("Cache-Control", "public, max-age=300");
    res.json(await deviations.list());
  } catch (e) { res.status(503).json({ error: e.message }); }
});

app.get("/api/deviations/:id", async (req, res) => {
  try {
    const d = await deviations.get(req.params.id);
    if (!d) return res.status(404).json({ error: "not found" });
    res.set("Cache-Control", "public, max-age=300");
    res.json(d);
  } catch (e) { res.status(503).json({ error: e.message }); }
});

const settlements = require("./settlements");
app.get("/api/settlements", async (req, res) => {
  try {
    res.set("Cache-Control", "public, max-age=300");
    res.json(await settlements.list());
  } catch (e) { res.status(503).json({ error: e.message }); }
});
app.get("/api/settlements/:id", async (req, res) => {
  try {
    const d = await settlements.get(req.params.id);
    if (!d) return res.status(404).json({ error: "not found" });
    res.set("Cache-Control", "public, max-age=300");
    res.json(d);
  } catch (e) { res.status(503).json({ error: e.message }); }
});

app.listen(PORT, () => {
  console.log(`[ohwikiguide-ext] listening on ${PORT}`);
  deviations.refresh().catch((e) => console.error("[ohwikiguide-ext] initial load failed:", e.message));
  settlements.refresh().catch((e) => console.error("[ohwikiguide-ext] settlements load failed:", e.message));
});
