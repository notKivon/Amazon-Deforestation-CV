// Converts the RAISG Biomes 2025 shapefile (reference/amazon-limit/) into the simplified
// Amazon outline at public/data/amazon-biome.geojson. Run with `npm run outline`.
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { unzipSync } from 'fflate';
import mapshaper from 'mapshaper';
import { indexGeometry, pointInIndex, geometryPolygons } from '../src/geo/polygon.js';

const ZIP = 'reference/amazon-limit/raisg_biomes_2025.zip';
const OUT = 'public/data/amazon-biome.geojson';
const MAX_VERTICES = 2000;
const PARTS = ['shp', 'shx', 'dbf', 'prj', 'cpg'];

function fail(msg) {
  console.error(`build-outline: ${msg}`);
  process.exit(1);
}

function extract() {
  if (!existsSync(ZIP)) fail(`${ZIP} is missing (blocker: the Amazon boundary must be in the repo)`);
  const files = unzipSync(readFileSync(ZIP), {
    filter: (f) => /^Biomas_2025\/Biomas\.(shp|shx|dbf|prj|cpg)$/i.test(f.name),
  });
  const dir = mkdtempSync(join(tmpdir(), 'biomes-'));
  for (const ext of PARTS) {
    const name = Object.keys(files).find((n) => n.toLowerCase() === `biomas_2025/biomas.${ext}`);
    if (!name) fail(`Biomas.${ext} not found in ${ZIP}`);
    writeFileSync(join(dir, `Biomas.${ext}`), files[name]);
  }
  return dir;
}

// Vertices excluding each ring's closing duplicate.
function vertexCount(geometry) {
  return geometryPolygons(geometry).flat().reduce((n, ring) => n + ring.length - 1, 0);
}

// SPEC sanity check: the filter must keep exactly one source feature (before dissolving).
async function countAmazonFeatures(shp) {
  const out = await mapshaper.applyCommands(`-i "${shp}" encoding=utf8 -filter "id_bioma === 1" -o out.json format=geojson`);
  return JSON.parse(out['out.json']).features.length;
}

async function run(shp, pct) {
  const cmd =
    `-i "${shp}" encoding=utf8 -filter "id_bioma === 1" -dissolve ` +
    `-simplify ${pct}% keep-shapes -clean ` +
    `-each "name='Amazonía', source='RAISG 2025 – Biomas'" ` +
    `-o out.geojson format=geojson precision=0.00001`;
  const out = await mapshaper.applyCommands(cmd);
  return JSON.parse(out['out.geojson']);
}

const dir = extract();
try {
  const shp = join(dir, 'Biomas.shp');
  const kept = await countAmazonFeatures(shp);
  if (kept !== 1) fail(`expected exactly 1 feature with id_bioma = 1, got ${kept}`);
  // Binary-search the largest retained percentage that stays within the vertex budget.
  let lo = 0.001, hi = 5, best = null;
  for (let i = 0; i < 25; i++) {
    const mid = (lo + hi) / 2;
    const gj = await run(shp, mid.toFixed(4));
    if (vertexCount(gj.features[0].geometry) <= MAX_VERTICES) { best = gj; lo = mid; } else hi = mid;
  }
  if (!best) fail(`could not simplify to ≤ ${MAX_VERTICES} vertices`);

  const geom = best.features[0].geometry;
  const idx = indexGeometry(geom);
  const xs = idx.flatMap((p) => [p.minX, p.maxX]);
  const ys = idx.flatMap((p) => [p.minY, p.maxY]);
  const bbox = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
  // SPEC: "roughly within lon −80…−43, lat −19…+10"; the true outline reaches 10.02°N.
  const TOL = 0.5;
  if (bbox[0] < -80 - TOL || bbox[2] > -43 + TOL || bbox[1] < -19 - TOL || bbox[3] > 10 + TOL) {
    fail(`bbox out of range: ${bbox}`);
  }
  if (!pointInIndex(idx, -60.02, -3.1)) fail('Manaus is not inside the outline');
  if (pointInIndex(idx, -47.88, -15.79)) fail('Brasília is inside the outline');

  writeFileSync(OUT, JSON.stringify(best) + '\n');
  console.log(`wrote ${OUT}: ${vertexCount(geom)} vertices, ${idx.length} polygon(s), bbox ${bbox.map((v) => v.toFixed(3)).join(', ')}`);
} finally {
  rmSync(dir, { recursive: true, force: true });
}
