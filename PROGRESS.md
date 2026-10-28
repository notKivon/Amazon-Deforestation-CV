# Amazon Forest Watch — Build Progress

**Current step:** 1 — Setup batch
**Next step:** 2 — Scaffold
**Last verified healthy:** — (no code yet; no package.json, so `npm test` / `npm run build` not applicable)

**Waiting on (step 1, user):** remote repo had no commits and no branches before the planning files were pushed. Still missing from the repo: `public/model/` (v2 export), `reference/build_dataset.py`, `fixtures/test_tiles/` (+ `manifest.json`, optional eval.js CSV), `reference/amazon-limit/`; `main` and `build` branches; Cloudflare Pages project name; confirmation the CDSE secret was rotated.

## Checklist

### M0 — Setup (user)
- [ ] 1. ⏸️ **Setup batch.** User does everything in SPEC.md → "External service setup": rotate CDSE secret; create GitHub repo + `build` branch; add `public/model/`, `reference/build_dataset.py`, `fixtures/test_tiles/`, `reference/amazon-limit/` (Amazon biome boundary file); create Cloudflare Pages project with the two secrets; create the Claude Code cloud environment. Report back: repo `owner/name`, Pages project name, and whether the eval.js predictions CSV was included. Agent then fills Project values in CLAUDE.md (planning-only commit).

### M1 — Foundation (cloud)
- [ ] 2. Scaffold: Vite + plain JS, `functions/`, `wrangler.toml`, Vitest + jsdom, `.gitignore` (incl. `.dev.vars`, `dist/`), `scripts/setup.sh`, `.claude/settings.json` SessionStart hook, npm scripts from CLAUDE.md. Test: `npm test` (one placeholder test) + `npm run build`.
- [ ] 3. Geometry, seasons/years and Amazon outline: `grid.js`, `season.js`, `years.js`, `region.js`, `scripts/build-outline.mjs` → commit generated `public/data/amazon-biome.geojson`; unit tests (SPEC.md → Geometry, Seasons and years, Amazon outline). Blocker if `reference/amazon-limit/` is missing.
- [ ] M1 review: fresh review subagent; summary here.

### M2 — Data pipeline (cloud)
- [ ] 4. Evalscripts + `/api/imagery` proxy with validation (incl. `window` and server-side `outside_amazon` check), server-chosen dates by zone, token cache, Cache API, MOCK mode, generated synthetic fixtures in `fixtures/mock/` (cloudy-base odd years); mocked-fetch tests. Falsecolor evalscript copied from `reference/` (blocker if missing).
- [ ] 5. Client fetch + PNG decode with base → extended fallback, concurrency limit and progress callback; tests for the three fallback cases against MOCK responses.
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
- [ ] 13. `[local]` Pre-deploy secret grep on `dist/`; merge `build` → `main`; confirm Cloudflare production deploy loads and completes one live run.
- [ ] 14. ⏸️ Final hand-back: user checks the production site against the acceptance list and signs off.

## Milestone summaries
<!-- one short paragraph per milestone, written by the run -->

## Decisions & gotchas
- 2026-10-28: Hosting = Cloudflare Pages + Pages Functions (one project) rather than Vercel; keeps the site and the secret-holding proxy together.
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
