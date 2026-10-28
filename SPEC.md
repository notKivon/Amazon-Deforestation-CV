# Amazon Forest Watch — Build Spec

Implementation detail for each part. Core domain rules live in **CLAUDE.md** — follow those exactly; this file doesn't restate them. Step order and live status are in **PROGRESS.md**.

## Repository layout
```
index.html
src/
  main.js              app wiring, state
  geo/grid.js          UTM zone, square bbox, tile grid, tile corners → lat/lon
  geo/years.js         available years for "today" and zone
  geo/season.js        zone from latitude; base / extended window dates for a year
  geo/region.js        point-in-polygon against the Amazon outline; areaInsideAmazon()
  api/client.js        calls /api/imagery, concurrency limit 3, decodes PNG → ImageData
  model/load.js        loads public/model, reads labels + imageSize from metadata.json
  model/preprocess.js  Teachable Machine preprocessing (crop, resize, scale −1…1)
  model/classify.js    slice scene into tiles, batch predict, returns per-tile probs
  analysis/report.js   validity, cover %, loss, NBR/dNBR, burn flags (pure functions)
  ui/map.js            Leaflet map, click-to-select, area square + grid overlay
  ui/search.js         Nominatim search box
  ui/report.js         chart, year slider, true-colour view, counts
  ui/model-view.js     false-colour view, tile inspector, model info + limitations
  ui/status.js         loading / error / warning banners
functions/api/imagery.js   Pages Function proxy
shared/evalscripts.js      the three evalscripts (server-only import)
shared/geo.js              re-exports grid, season, years and region modules for the function (the function imports the outline GeoJSON at build time)
public/model/              v2 TF.js export (user-supplied)
public/data/amazon-biome.geojson   simplified Amazon outline (generated in step 3 from reference/amazon-limit/)
reference/                 build_dataset.py (or its evalscript) from the training repo (user-supplied)
reference/amazon-limit/    source Amazon biome boundary file (user-supplied; shapefile .zip or GeoJSON)
scripts/build-outline.mjs  converts + simplifies reference/amazon-limit/ → public/data/amazon-biome.geojson
fixtures/test_tiles/       v2 held-out 128 px test tiles + manifest.json (user-supplied)
fixtures/mock/             synthetic PNGs for MOCK mode (generated in step 4)
scripts/setup.sh           cloud setup script
.claude/settings.json      SessionStart hook → scripts/setup.sh
docs/verification.md       results of the [local] live verification
```

## Geometry (`src/geo/grid.js`)
- `utmEpsg(lon, lat)` → 32600 + zone (north) or 32700 + zone (south), zone = floor((lon + 180) / 6) + 1.
- `areaBox(lon, lat, tilesPerSide)` → `{ epsg, minX, minY, maxX, maxY, width, height }` in UTM metres; side = tilesPerSide × 1280 m; centre snapped to a 10 m grid; width = height = tilesPerSide × 128 px.
- `tileGrid(box)` → array of `{ row, col, minX, minY, maxX, maxY, cornersLatLon }` (row 0 = north).
- Unit tests: zone/EPSG at known points (e.g. Manaus → 32720), side lengths exact, corner round-trip error < 1 m.

## Seasons and years (`src/geo/season.js`, `src/geo/years.js`)
- `zoneFor(lat)` → `"north"` if lat ≥ 2.0, else `"south"`.
- `windowFor(zone, year, kind)` with kind ∈ `base | extended` → `{ from, to }` ISO strings per CLAUDE.md → Seasons.
- `availableYears(zone, nowUtc)` → [2017 … Y] per CLAUDE.md → Imagery.
- Tests: zone at 1.999 / 2.0; all four window combinations for 2025 (north windows start in 2024); availableYears south at 2026-09-30 vs 2026-10-01, north at 2026-04-30 vs 2026-05-01.

## Amazon outline (`scripts/build-outline.mjs`, `src/geo/region.js`)
- Build script (dev dependency `mapshaper` from npm): read `reference/amazon-limit/raisg_biomes_2025.zip` (shapefile `Biomas_2025/Biomas.shp`, SIRGAS 2000 — treat as WGS 84), keep only the feature with `id_bioma = 1` (Amazonía; see `reference/amazon-limit/SOURCE.md`), dissolve to one (multi)polygon, simplify to ≤ 2,000 vertices keeping shapes (`-simplify keep-shapes`), write `public/data/amazon-biome.geojson`, and print vertex count + bounding box. Run once in step 3 and commit the output; `npm run outline` re-runs it.
- Sanity checks in the script (fail if wrong): exactly one feature kept; bbox roughly within lon −80…−43, lat −19…+10; Manaus (−3.10, −60.02) inside; Brasília (−15.79, −47.88) outside.
- If `reference/amazon-limit/` is missing or can't be parsed, stop: blocker.
- `region.js`: `pointInAmazon(lon, lat)` (ray casting, handles multipolygons and holes); `areaInsideAmazon(box)` → true only if centre and all four corner lat/lons are inside. Shared with the proxy via `shared/`.
- Tests: Manaus inside, Brasília outside, an Atlantic point outside, a box straddling the edge rejected.

## Proxy (`functions/api/imagery.js`)
- `POST /api/imagery` body `{ lon, lat, tilesPerSide, year, product, window }`. Validate types and ranges (lon/lat finite, tilesPerSide integer 2–8, product ∈ truecolor|falsecolor|nbr, window ∈ base|extended, year ∈ availableYears(zoneFor(lat), now)); else 400 JSON `{ error }`. Also 400 `{ error: "outside_amazon" }` if `areaInsideAmazon(box)` is false.
- Compute the box with the shared grid module and the dates with `windowFor(zoneFor(lat), year, window)` — the server, not the client, decides dates. Build a Process API request: `input.bounds.bbox` in UTM with `properties.crs = http://www.opengis.net/def/crs/EPSG/0/<epsg>`, `timeRange` from that window, `mosaickingOrder` / `maxCloudCoverage` per CLAUDE.md, `output.width/height` = pixels, `responses: [{ identifier: "default", format: { type: "image/png" } }]`.
- Token: client-credentials grant to the CDSE token URL with `CDSE_CLIENT_ID` / `CDSE_CLIENT_SECRET`; cache in module scope until `expires_in − 60 s`.
- Cache: Cloudflare Cache API, key `imagery:<product>:<window>:<lon 5dp>:<lat 5dp>:<tiles>:<year>`, `Cache-Control: public, max-age=2592000`.
- Upstream errors → 502 JSON `{ error, upstreamStatus }`. Never log or echo credentials.
- `MOCK=1` env: skip CDSE, return `fixtures/mock/<product>.png` resized/cropped to the requested size (or pre-generated at 512 × 512 and 1024 × 1024 and served as-is for those sizes; other sizes may use the nearest and the client crops). Mock `nbr` for `base` in odd years has ~70% of pixels masked so the fallback path is exercised; `extended` is always mostly clear.

## Evalscripts (`shared/evalscripts.js`)
- `truecolor`: input B02, B03, B04, SCL; output 3 bands UINT8; `[2.5 * B04, 2.5 * B03, 2.5 * B02] * 255`, clamped.
- `falsecolor`: **copy band order, gain, clamping and output format exactly from `reference/build_dataset.py`** (R = B11, G = B8A, B = B04). If `reference/` is missing or ambiguous, stop: this is a blocker, not a judgement call — a mismatch silently breaks the model.
- `nbr`: input B8A, B12, SCL; output 3 bands UINT8: R = round((NBR + 1) × 127.5) clamped 0–254, G = 255 if SCL ∈ {4,5,6,7} else 0, B = 0. Decode NBR = R / 127.5 − 1.
- All use `units: "DN"` or reflectance consistently with the reference script; record which in Decisions.

## Client (`src/api/client.js`)
- Per year: (1) fetch `nbr` with `window: "base"` and compute the valid-tile fraction (from the SCL mask channel, via `tileValidity`); (2) if < 50%, fetch `nbr` again with `window: "extended"` and use that; (3) fetch `falsecolor` and `truecolor` with the window chosen in steps 1–2. Return `{ year, window, nbr, falsecolor, truecolor }`.
- At most 3 requests in flight across years. Decode PNG via `createImageBitmap` → OffscreenCanvas → ImageData (no colour-space conversion: `colorSpaceConversion: "none"`, `premultiplyAlpha: "none"`).
- Progress callback per completed request; the total grows by one when a year falls back.
- Tests (MOCK): a clear year makes 3 requests with `base`; a cloudy-base year makes 4 requests and returns `window: "extended"`; a year cloudy in both still returns `extended` and is later marked too cloudy.

## Model (`src/model/*`)
- `load.js`: `tf.loadLayersModel('/model/model.json')`; read `labels` and `imageSize` from `metadata.json`; expose `forestIndex = labels.indexOf('Forest')` (throw if absent).
- `preprocess.js`: centre-crop to square (no-op for 128 × 128), bilinear resize to `imageSize`, `x / 127.5 − 1`. Must match the previous evaluation script (`eval.js`) behaviour.
- `classify.js`: slice the scene ImageData into 128 px tiles in grid order, batch of 16, return `{ pForest, pNotForest }` per tile. Use the WebGL backend when available, else CPU.
- **Parity test** (Vitest, `@tensorflow/tfjs` CPU backend, loads model from `public/model/` via file handler): classify all images in `fixtures/test_tiles/` with labels from its `manifest.json`; must score ≥ 140/143. If the user supplied an eval.js predictions CSV, per-tile predicted class must match it for ≥ 141/143.

## Analysis (`src/analysis/report.js`)
- `tileValidity(nbrImage, grid)` → valid fraction per tile.
- `tileNbr(nbrImage, grid)` → mean NBR over valid pixels per tile.
- `buildReport(years, perYear)` → per year: window used, valid tile count, reported flag, forest count, cover %, per-tile class, loss flags, dNBR, burn flags (previous *valid* year used for both loss and dNBR).
- Unit tests with hand-built synthetic arrays covering: cloudy tile excluded, too-cloudy year gap, loss across a cloudy gap year, burn threshold exactly 0.27 (not flagged) vs 0.28 (flagged).

## UI
- `ui/map.js`: Leaflet map centred on (−3.5, −60) zoom 5; attribution includes "Amazon boundary © RAISG 2025"; Amazon outline drawn as a light line with the area outside it dimmed; click sets centre; size control (select 2–8 tiles per side showing km); draws the area polygon (red and Run disabled with the "only covers the Amazon" message if `areaInsideAmazon` fails) and, after a run, a tile grid coloured by the selected year. Shows the zone and its base window under the controls (e.g. "North zone: dry season Dec–Mar").
- `ui/search.js`: submit-only (no type-ahead) query to `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&q=…`; show up to 5 results; results outside the outline are greyed out with "outside the Amazon" and can't be chosen; choosing one recentres the map and sets the centre. At most one request per second; attribution "Search © OpenStreetMap contributors".
- `ui/report.js`: Chart.js line chart (extended-window years drawn as hollow points, legend explains), year slider, true-colour image (scaled to fit, pixelated rendering off), image date range for the year shown, counts table (window / valid / forest / not forest / loss / burn).
- `ui/model-view.js`: false-colour image with grid; click tile → inspector card with both crops at 4× (`image-rendering: pixelated`), probabilities as bars, burn status; static model info panel and Known limitations text from CLAUDE.md.
- Responsive down to 375 px wide; keyboard-reachable controls; colours not the only carrier of meaning (grid uses pattern for invalid, icons for loss/burn).

## External service setup (all ⏸️ user actions, batched in step 1)
- **CDSE:** rotate the OAuth client secret (the old one has been pasted into chats). Keep the new ID/secret for Cloudflare and `.dev.vars` only.
- **GitHub:** create the repo, commit the planning files to `main`, create branch `build`.
- **Cloudflare Pages:** create project connected to the repo; production branch `main`; build command `npm run build`; output `dist`; add secrets `CDSE_CLIENT_ID`, `CDSE_CLIENT_SECRET`; Node 20.
- **Claude Code cloud environment:** point at the repo; no secret environment variables; default network (npm + GitHub).
- **Files to add to the repo** (commit to `main` before branching): `public/model/` (v2 TF.js export), `reference/build_dataset.py`, `fixtures/test_tiles/` (v2 `Images_128/test/` contents + `manifest.json`, and the eval.js predictions CSV if available), and `reference/amazon-limit/` containing one Amazon biome boundary file covering all nine countries (e.g. the biogeographic Amazon limit published by RAISG, as a shapefile .zip or GeoJSON). The cloud sandbox can't download it, so it must be in the repo.

## Cloud setup (`scripts/setup.sh` + `.claude/settings.json`)
- `setup.sh`: `npm ci`; idempotent; exit non-zero on failure.
- SessionStart hook runs `bash scripts/setup.sh`.

## Verification per area
- Geometry, seasons, years, outline, analysis: Vitest unit tests.
- Proxy: Vitest with mocked `fetch` (token caching, validation 400s, upstream 502, MOCK mode); never a live call in cloud.
- Model: parity test above.
- UI: jsdom smoke tests (modules mount, controls fire callbacks) + `npm run build`.
- Live (step 12, `[local]`): run the acceptance locations below with real credentials and record results in `docs/verification.md`:
  - Frontier: Novo Progresso, Pará (centre −7.05, −55.42), 8 tiles per side → cover % shows a net decline 2017 → latest.
  - Control: Jaú National Park (centre −2.0, −62.0), 8 tiles per side → every reported year ≥ 90% cover.
  - Burn: pick one 2024 fire location near Lábrea (centre −7.26, −64.80) → at least one burn flag appears in 2024 or 2025, or record that none did.
  - North zone: Iwokrama Forest, Guyana (centre 4.50, −58.80), 8 tiles per side → requests use the Dec–Mar window; record how many years were reported, how many needed the extended window, and the cover range.
  - Outside: Brasília (−15.79, −47.88) → Run disabled in the UI and a direct POST to `/api/imagery` returns 400 `outside_amazon`.
  - Fallback: record at least one real year where the extended window was used, with its valid-tile % before and after.
  - First full 8 × 8 run completes within 90 s; repeat run (cached) within 10 s.
