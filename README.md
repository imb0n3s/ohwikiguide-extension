# OHWikiGuide — Twitch Extension

A Twitch **panel** extension for Once Human streamers, powered by ohwikiguide.com.
Separate from the OH Wiki Guide chat bot: its own repo, its own backend service.

```
backend/     Node/Express service (EBS). Reads the wiki, serves JSON. Deploy to Railway.
extension/   panel.html — the files you upload to the Twitch Developer Console.
```

## 1. Deploy the backend (Railway)

1. Create a new GitHub repo (e.g. `ohwikiguide-extension`) and upload the contents of this folder.
2. Railway → **New Project → Deploy from GitHub repo** → pick that repo.
3. Settings → **Root Directory**: `backend`. Railway uses `backend/Dockerfile` automatically.
4. Settings → Networking → **Generate Domain**. Copy the URL, e.g. `https://ohwikiguide-extension-production.up.railway.app`.
5. Open `<that URL>/health` — you should see `{"ok":true,"deviations":61,...}`.

No environment variables are required. (Optional: `WIKI_BASE`, `DEVIATION_PAGE`.)

## 2. Point the panel at the backend

In `extension/panel.html` find the line

```js
const API = "https://YOUR-BACKEND.up.railway.app";
```

and replace the URL with the Railway domain from step 4 (no trailing slash).
Then zip `panel.html` on its own (the zip must contain the file at the top level, not inside a folder).

## 3. Create the extension on Twitch

https://dev.twitch.tv/console/extensions → **Create Extension**

- **Name**: OHWikiGuide · **Type**: Panel
- **Asset Hosting**: Panel Viewer Path `panel.html`, Panel Height `496`
- **Capabilities**:
  - Allowlist for URL Fetching Domains: your Railway URL (e.g. `https://ohwikiguide-extension-production.up.railway.app`)
  - Allowlist for Image Domains: `https://ohwikiguide.com`
- **Files** → upload the zip → **Move to Hosted Test**
- **Hosted Test** → install the extension on your own channel and activate it as a panel.

Twitch review is only needed when other streamers should be able to install it.

## API

| Route | Returns |
|---|---|
| `GET /health` | `{ ok, deviations, updated }` |
| `GET /api/deviations` | `{ updated, count, items: [{ id, name, image, categories, function }] }` |
| `GET /api/deviations/:id` | full card: `fields[]`, `sections[]` (Securement Environment, Drops From, Variations, …) |

Data comes from the wiki's **Deviation Main Page** (the `deviationsData` / `craftingData` / `combatData` / `territoryData` objects) and is cached for 10 minutes, so wiki edits show up in the panel within about 10 minutes.
