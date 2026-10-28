# Project: Amazon Forest Watch

A website for a school AI/ML project. The user picks a location in the Amazon (search bar or map click) and an area size; the site fetches one Sentinel-2 dry-season image per year from Copernicus (dry season chosen by latitude, widened automatically when too cloudy), cuts each year into 128 px tiles, classifies every tile Forest / Not Forest with the user's Teachable Machine **v2** model running in the browser, and shows a year-by-year forest cover report with burn flags. A second section explains the model: the false-colour tiles it sees and its confidence per tile.

This file loads every session. Implementation detail is in **SPEC.md**; live build status and "where to resume" is in **PROGRESS.md**. **Read all three at the start of every session.**

## Tech stack
- Node 20, Vite 5, **plain JavaScript (ES modules), no TypeScript, no UI framework**.
- Hosting: **Cloudflare Pages** (static site from `dist/`) + **Pages Functions** in `functions/` for the Copernicus proxy. One project, one deploy. Wrangler 3 for local dev.
- Map: Leaflet 1.9.x with OpenStreetMap tiles (attribution shown). Search: OSM Nominatim.
- Projection: proj4 2.x (UTM maths for exact 10 m pixel grids).
- Model: `@tensorflow/tfjs` 4.x in the browser; v2 Teachable Machine export in `public/model/` (`model.json`, `weights.bin`, `metadata.json`).
- Charts: Chart.js 4.x.
- Tests: Vitest (+ jsdom for DOM modules). Commands: `npm test`, `npm run build`, `npm run dev` (Vite), `npm run dev:full` (wrangler pages dev, needs `.dev.vars`).
- Imagery: Copernicus Data Space Ecosystem (CDSE) Sentinel Hub Process API, collection `sentinel-2-l2a`.

## Code rules
- Plain JS; small modules (~200 lines/file max); pure functions for geometry and analysis so they can be unit-tested.
- Every network action has a loading state and a readable error state (including "too cloudy" and "outside the Amazon").
- All dates are **UTC**. Years are calendar years.
- Model labels are read from `metadata.json` by name, **never by output index** (v1 and v2 have reversed output order).
- Never remove or reword the "Known limitations" text in the model section without a spec change.
- Ask before deleting any file.

## Core domain logic (must match exactly — do not drift)

**Area selection**
- User selects a centre point (map click or search result). Area is a square of `tilesPerSide × tilesPerSide` tiles, `tilesPerSide` ∈ {2,…,8}, default 4.
- Pixel size 10 m; tile = 128 × 128 px = 1.28 km. So the area side is 2.56–10.24 km; maximum 64 tiles.
- The square is laid out in the WGS 84 / UTM zone containing the centre point (EPSG 326xx north, 327xx south), centred on the point and snapped so its edges are whole multiples of 10 m.
- **Amazon only (hard limit).** A selection is allowed only if the centre and all four corners of the area lie inside the simplified Amazon biome outline (`public/data/amazon-biome.geojson`). Otherwise show "This tool only covers the Amazon, where the model was trained" and do not run. Search results outside the outline are still listed but greyed out and not selectable. The proxy repeats the check server-side and returns 400 for areas outside it.
- The outline is drawn on the map so users can see the covered area before clicking.

**Seasons (dry-season windows by zone)**
- **South zone:** centre latitude < 2.0° (i.e. south of 2°N). **North zone:** centre latitude ≥ 2.0°N. The whole area uses the centre's zone.
- **Base window for report year Y:** south Y-06-01 → Y-08-31; north (Y−1)-12-01 → Y-03-31.
- **Extended window for report year Y:** south Y-05-01 → Y-09-30; north (Y−1)-11-01 → Y-04-30.
- Every window runs from 00:00:00Z on its first day to 23:59:59Z on its last day.

**Imagery**
- Years: 2017 through the latest year Y whose **extended** window has ended (south: today UTC ≥ Y-10-01; north: today UTC ≥ Y-05-01).
- Every request uses `mosaickingOrder: leastCC`, `maxCloudCoverage: 80`.
- Products per year: `truecolor` (B04, B03, B02), `falsecolor` (B11, B8A, B04 — **must reproduce the training dataset's evalscript exactly**, see SPEC.md), `nbr` (burn ratio + validity mask).
- A pixel is **valid** if its SCL class is 4, 5, 6 or 7. A tile is **valid for a year** if ≥ 70% of its pixels are valid. Invalid tiles are excluded from that year's statistics and shown hatched.
- **Fallback:** for each year, use the base window first. If fewer than 50% of tiles are valid, refetch that year with the extended window and use the extended result for all three products (never mix windows within a year). A year that used the extended window is marked **"extended window"** in the chart (hollow point) and the counts table.
- A year is **reported** if ≥ 50% of tiles are valid in the window finally used; otherwise it shows as "too cloudy" and has no cover value.
- Whole-year or wet-season windows are **not** used: they don't match the dry-season imagery the model was trained on.

**Classification**
- Each valid tile's false-colour 128 px crop goes through Teachable Machine preprocessing (centre-crop to square, resize to the model's `imageSize`, scale pixels to −1…1).
- Tile is **Forest** if P(Forest) ≥ 0.5, else **Not Forest**. Confidence shown = probability of the predicted class, as a percentage to 1 dp.
- **Forest cover %** for a reported year = Forest tiles ÷ valid tiles × 100, 1 dp.
- **Forest loss**: a tile that was Forest in its previous valid year and is Not Forest this year.

**Burn detection**
- NBR = (B8A − B12) ÷ (B8A + B12), per pixel; tile NBR = mean over valid pixels.
- dNBR = tile NBR (previous valid year) − tile NBR (this year).
- **Burn detected** if dNBR > 0.27. A tile with both forest loss and burn detected is labelled "loss — burn detected". The UI must state that a burn flag cannot distinguish wildfire from fire used to clear land.

**Report contents**
- Line chart of forest cover % by year (too-cloudy years shown as gaps).
- Year slider driving: true-colour image, tile grid overlay (Forest / Not Forest / invalid, loss and burn markers), per-year counts.
- "What the model sees": false-colour image of the same year with the tile grid; clicking a tile shows its 128 px false-colour crop, matching true-colour crop, P(Forest) and P(Not Forest), and burn status.
- Model info panel: Teachable Machine (MobileNet transfer learning), trained on 128 px SWIR false-colour tiles (R = B11, G = B8A, B = B04), v2 held-out test accuracy 141/143 (98.6%) vs v1 126/143 (88%); colour key (forest green, cleared pink/magenta, water dark blue, burn scars dark red/brown).
- Known limitations (must appear): cannot tell burned or degraded canopy from clear-cutting; a burn flag cannot tell wildfire from fire used to clear land; B11 and B8A are 20 m bands upsampled to 10 m; tiles with a small cleared patch (~7% or more) can flip to Not Forest; Amazon only, dry-season images only; thin haze, smoke and cloud edges can slip past the cloud mask and look like cleared land; natural savannas and grasslands (e.g. in Roraima and the Guiana Shield) show as Not Forest even though nothing was cut; "extended window" years are a month wider on each side, so they are slightly less comparable with other years.

## Secrets policy
- **Never in repo, bundle, logs, or cloud environment variables:** the CDSE client ID and client secret.
- They live only as Cloudflare Pages secrets `CDSE_CLIENT_ID` and `CDSE_CLIENT_SECRET`, and locally in `.dev.vars` (gitignored).
- The browser never talks to CDSE. It calls `/api/imagery`, which builds the request server-side from validated inputs; clients cannot send evalscripts, bounding boxes or dates (they choose only `base` or `extended`).
- Before any deploy step: `npm run build` then `grep -rE "sh-[0-9a-f]{8}|CDSE_CLIENT" dist/` must return nothing.

## Project values
- GitHub repo: `<fill in: owner/repo>`; build branch `build`; Cloudflare Pages production deploys from `main`.
- Cloudflare Pages project name: `<fill in>`.
- Non-secret endpoints: token `https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token`, process `https://sh.dataspace.copernicus.eu/api/v1/process`.

## Run environment
- **Cloud** (Claude Code on the web) for most steps: plain agent, no orchestrator, no secrets. `/api/imagery` runs in `MOCK=1` mode against synthetic fixtures. Network: npm registry and GitHub only.
- **Local** for steps tagged `[local]`: live CDSE calls via `npm run dev:full` with `.dev.vars`, and browser checks. Needs CDSE, Nominatim and OSM tile hosts.
- Push to `origin build` at every checkpoint. Unfinished work at a stop goes on a pushed `wip/<step>` branch, never a commit on `build`.

## Autonomy
- Runs are unattended overnight. Continue through PROGRESS.md until a ⏸️ step, a `[local]` step while in cloud, a real blocker, or the end.
- Work in one session. Do not fan out parallel subagents; `∥` tags are ordering hints only. **Exception:** at the end of each milestone, spawn one fresh review subagent to check the milestone against this file and SPEC.md; fix what it finds before continuing.
- At each milestone, write a short summary under that milestone in PROGRESS.md.
- **Decide alone:** layout, styling, copy wording (except Known limitations), internal module structure, patch/minor library versions.
- **Must stop and ask:** any change to Core domain logic or Secrets policy, adding an external service or paid dependency, deleting files, anything that would need a secret in the cloud.

## Working agreement
- Build in the order in PROGRESS.md. A step ends with: tests pass + `npm run build` succeeds → tick PROGRESS.md (note decisions) → commit → push. Never commit a half-finished step.
- At session start: read the three planning files; reconcile PROGRESS.md against `git log` and the working tree (trust git + working tree > PROGRESS.md > anything else); run `npm test` and `npm run build` before writing.
- Log every mid-build decision as a dated one-liner in PROGRESS.md → Decisions & gotchas.
- Spec changes are their own planning-only commit to this file / SPEC.md, made only between steps.
