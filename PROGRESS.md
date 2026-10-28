# Amazon Forest Watch — Build Progress

**Current step:** M2 review
**Next step:** 6 — Model
**Last verified healthy:** 2026-10-28 after step 5 — `npm test` 88/88, `npm run build` OK

## Checklist

### M0 — Setup (user)
- [x] 1. ⏸️ **Setup batch.** User does everything in SPEC.md → "External service setup": rotate CDSE secret; create GitHub repo + `build` branch; add `public/model/`, `reference/build_dataset.py`, `fixtures/test_tiles/`, `reference/amazon-limit/` (Amazon biome boundary file); create the Cloudflare Worker (Workers Builds from Git) with the two Secrets; create the Claude Code cloud environment. Report back: repo `owner/name`, Worker name, and whether the eval.js predictions CSV was included. Agent then fills Project values in CLAUDE.md (planning-only commit).

### M1 — Foundation (cloud)
- [x] 2. Scaffold: Vite + plain JS, `wrangler.jsonc`, `worker/` (index.js routing `/api/imagery` + ASSETS fallthrough, stub imagery.js), `.node-version`, Vitest + jsdom, `.gitignore` (incl. `.dev.vars`, `dist/`), `scripts/setup.sh`, `.claude/settings.json` SessionStart hook, npm scripts from CLAUDE.md. Test: `npm test` (one placeholder test) + `npm run build`.
- [x] 3. Geometry, seasons/years and Amazon outline: `grid.js`, `season.js`, `years.js`, `region.js`, `scripts/build-outline.mjs` → commit generated `public/data/amazon-biome.geojson`; unit tests (SPEC.md → Geometry, Seasons and years, Amazon outline). Blocker if `reference/amazon-limit/` is missing.
- [x] M1 review: fresh review subagent; summary here.

### M2 — Data pipeline (cloud)
- [x] 4. Evalscripts + `/api/imagery` proxy in `worker/imagery.js` with validation (incl. `window` and server-side `outside_amazon` check), server-chosen dates by zone, token cache, Cache API, MOCK mode, generated synthetic fixtures in `fixtures/mock/` (cloudy-base odd years); mocked-fetch tests. Falsecolor evalscript copied from `reference/` (blocker if missing).
- [x] 5. Client fetch + PNG decode with base → extended fallback, concurrency limit and progress callback; tests for the three fallback cases against MOCK responses.
- [ ] M2 review.

### M3 — Model and analysis (cloud)  ∥B
- [ ] 6. ∥B (files: `src/model/*`, model tests) Model load, preprocessing, tile slicing, batch classify; parity test on `fixtures/test_tiles/` (≥ 140/143).
- [ ] 7. ∥B (files: `src/analysis/*`, analysis tests) Validity, NBR/dNBR, cover %, loss, burn flags; synthetic tests incl. 0.27 / 0.28 threshold.
- [ ] M3 review.

### M4 — Interface (cloud)
- [ ] 8. Map with Amazon outline, hard limit (Run disabled outside), zone/window label, area size control, Nominatim search with outside results greyed out (`ui/map.js`, `ui/search.js`, `ui/status.js`); jsdom smoke tests.
- [ ] 9. Report section: run pipeline end to end in MOCK mode, chart with hollow extended-window points, year slider, true-colour view with date range, grid overlay, counts table incl. window column (`ui/report.js`, `main.js`).
- [ ] 10. "What the model sees": false-colour view, tile inspector, model info panel, Known limitations (`ui/model-view.js`).
- [ ] 11. Polish: loading/error/too-cloudy states, 375 px layout, keyboard access, pattern/icon markers.
- [ ] M4 review.

### M5 — Live verification and launch (local)
- [ ] 12. `[local]` Create `.dev.vars` (user pastes values), run `npm run dev:full`, run every acceptance check in SPEC.md → Verification (incl. north zone, outside rejection and a real fallback year), check the falsecolor tiles visually match training tiles, fix bugs (each fix a tested commit), write `docs/verification.md`.
- [ ] 13. `[local]` Pre-deploy secret grep on `dist/` and on `npx wrangler deploy --dry-run --outdir .wrangler-dry` output; merge `build` → `main`, which triggers the Workers Build; confirm the workers.dev URL loads and completes one live run; fill in the Worker URL in CLAUDE.md → Project values.
- [ ] 14. ⏸️ Final hand-back: user checks the production site against the acceptance list and signs off.

## Milestone summaries
<!-- one short paragraph per milestone, written by the run -->
**M1 — Foundation (2026-10-28).** Scaffolded a Worker with static assets (`wrangler.jsonc`, `worker/index.js` routing, stub proxy), Vite 5, Vitest 3 + jsdom, and the cloud setup hook. Built UTM geometry, dry-season windows, available years, and the RAISG Amazon outline (1,999 vertices) with the centre + corners hard-limit check. Review confirmed all core rules (windows, 2.0° boundary, year cutoffs, EPSG, 10 m snapping, corners) and found no bugs; fixed its hardening items (`areaBox` rejects bad sizes/coordinates, `zoneFor` rejects non-numbers, outline script now counts features before dissolving). One review finding (stale Pages wording in CLAUDE.md) was a false positive — the reviewer read a pre-edit copy. Open: the outline ships twice (static file at the spec path + inlined in JS, 42 KB); Node 20 compatibility is untested here (the sandbox has Node 22).

## Decisions & gotchas
- 2026-10-28: Amazon outline = RAISG Biomes 2025, Amazonía feature only (excludes Cerrado and Andes), rather than the broader RAISG Limits layer. Credit RAISG in the map attribution and model info panel.
- 2026-10-28: `reference/build_dataset.py` fetches raw UINT16 bands (DN × 10000) and converts to 8-bit in Python (`to_rgb`: clip(GAIN × refl / 10000 × 255)). The falsecolor evalscript must reproduce that whole chain, including GAIN, not just the band order.
- 2026-10-28: v2 `metadata.json`: labels ["Forest", "Not Forest"], imageSize 224. Test-tile expected predictions are in `fixtures/test_tiles/model_v2_predictions.csv` (eval.js output).
- 2026-10-28: Hosting = Cloudflare Pages + Pages Functions (one project) rather than Vercel; keeps the site and the secret-holding proxy together. *(Superseded below.)*
- 2026-10-28: Model input is the v2 SWIR false-colour composite (B11/B8A/B04) at 128 px; labels read from metadata.json by name.
- 2026-10-28: Area capped at 8 × 8 tiles (10.24 km side, 64 tiles).
- 2026-10-28: Burn detection via dNBR > 0.27 using B12 (extra band); labelled "burn detected", not "fire clearing".
- 2026-10-28: Dry-season window by zone: south of 2°N June–August, at or north of 2°N December–March; one image per year from 2017.
- 2026-10-28: Fallback: if < 50% of tiles are valid in the base window, refetch the year with a window one month wider on each side and mark it "extended window". Whole-year windows rejected (don't match training imagery, more flooding and haze).
- 2026-10-28: Amazon only, hard limit: centre and all four corners must be inside the simplified biome outline; checked in the UI and again in the proxy. Replaces the earlier lat/lon box warning.
- 2026-10-28: Known caveats kept in the UI: haze can slip past the cloud mask; natural savannas read as Not Forest.
- 2026-10-28: Single Opus session, no parallel subagents; one fresh review subagent per milestone.
- 2026-10-28: Cloud runs use MOCK mode only; every live CDSE call happens in `[local]` steps.
- 2026-10-28: Session reconcile: git log = planning-files commit only; working tree has no code or user-supplied files. PROGRESS.md status (step 1 open) confirmed correct; run stopped at ⏸️ step 1.
- 2026-10-28: Plain JS + Vite (no framework, no TypeScript) chosen for simplicity; change via a spec-change step before step 2 if wanted.
- 2026-10-28: Hosting switched from Pages to a Worker with static assets, since Cloudflare created the project as a Worker. Cache API is a no-op on workers.dev.
- 2026-10-28: Step 1 done (user report): CDSE OAuth client rotated (old client deleted); new values stored as encrypted Secrets `CDSE_CLIENT_ID` / `CDSE_CLIENT_SECRET` on Worker `amazon-deforestation-cv`; Workers Builds connected to this repo, deploying from `main`; cloud environment runs on `build`. eval.js predictions CSV included (`fixtures/test_tiles/model_v2_predictions.csv`).
- 2026-10-28: Wrangler pinned to exactly 4.86.0: it is the last 4.x release that runs on Node 20 (4.87.0+ require Node ≥ 22 because Node 20 reached end-of-life on 2026-04-30). Still the current major, so it fits both "current Wrangler major" and `.node-version` = 20. `compatibility_date` = 2026-04-26, the newest its bundled workerd supports. Recommend moving to Node 22 + latest Wrangler (needs the user's OK, since Node 20 is in the spec).
- 2026-10-28: jsdom pinned to ^26.1.0 (jsdom 27+ need Node ≥ 20.19 / 22.12, and 30 needs Node 22.22). Vitest 3.2 runs with Vite 5.
- 2026-10-28: `npm audit` reports advisories only in dev tooling (esbuild dev server, vitest/tinypool, sharp via miniflare). None of it ships in `dist/` or the Worker bundle; left as is.
- 2026-10-28: Tests live in `tests/*.test.js`; Node environment by default, DOM tests opt in with `// @vitest-environment jsdom`. `.dev.vars.example` (names only, no values) documents the local file.
- 2026-10-28: Outline: RAISG Amazonía dissolves to a single polygon (the source's one zero-area hole is removed by `-clean`); simplified to 1,999 vertices, bbox −79.469, −18.157, −43.618, 10.019. The build script's bbox check allows 0.5° of tolerance because the true outline reaches 10.02°N (the spec says "roughly").
- 2026-10-28: The outline is imported as raw text everywhere (wrangler `Text` rule for `*.geojson`, matching Vite plugin in `vite.config.js`), so browser, Worker, and tests share one file at the spec path. Pure ray casting lives in `src/geo/polygon.js` so the Node build script can use it without the bundler.
- 2026-10-28: `areaInsideAmazon` checks the snapped box centre (within 5 m of the clicked point) plus the four box corners. Tile and box corners are `[lat, lon]` in NW, NE, SE, SW order.
- 2026-10-28: Units: all evalscripts use the default reflectance units, like `reference/build_dataset.py`. Falsecolor recovers the training DN as `round(v × 10000)`, then repeats `to_rgb` in float32 with `Math.fround` and truncates with `Math.floor` (numpy `.astype(uint8)` truncates). It returns exact integers so UINT8 output conversion can't change them. A test checks every DN 0–20000 against a Float32Array emulation of the Python chain. Assumes Sentinel Hub rounds float → UINT16 (B × 10000 is an integer ± float noise, so this only matters at noise level); check in step 12 by comparing a live falsecolor tile with a training tile.
- 2026-10-28: Resampling left at the Sentinel Hub default (nearest), as in training; `harmonizeValues` left at its default, as in training.
- 2026-10-28: Proxy rounds lon/lat to 5 dp (~1 m) before computing the box, so the cache key and the request always agree. Unknown body fields → 400 `unexpected_field`; bodies over 1 KB → 400. Missing secrets (non-mock) → 500 `not_configured`. Token-endpoint errors → 502 `auth_failed`; network errors → 502 `*_unreachable` with `upstreamStatus: 0`. A 401 from the Process API clears the token cache.
- 2026-10-28: MOCK mode generates synthetic scenes procedurally at the exact requested size (`worker/mock.js` + a tiny PNG encoder over `CompressionStream`), instead of resizing stored PNGs. `npm run mock` writes sample images from the same generator to `fixtures/mock/` for viewing. Mock clearings grow 3 points a year; new clearings in even years get burn scars; nbr base is ~70% masked in odd years (fallback path), extended always clear. Mock responses are `no-store`.
- 2026-10-28: Pre-deploy grep of `.wrangler-dry/` matches only the binding names `env.CDSE_CLIENT_ID` / `env.CDSE_CLIENT_SECRET` in the Worker code (expected; no values). `dist/` is clean.
- 2026-10-28: `wrangler dev` in this sandbox serves fine but can't reach workers.cloudflare.com (blocked by egress); harmless.
- 2026-10-28: `tileValidity` / `validTileShare` were written in step 5 (in `src/analysis/report.js`) because the client's fallback needs them; step 7 extends that module. A mask pixel counts as valid if G ≥ 128.
- 2026-10-28: Client: the first failure (or the caller's AbortSignal) aborts every outstanding request; error codes come from the proxy's JSON `error` (`outside_amazon`, `upstream_error`, …), else `http_<status>` or `network`. Client tests drive the real Worker handler in MOCK mode. `src/api/decode.js` (createImageBitmap) is browser-only; it gets a browser check in step 9.
