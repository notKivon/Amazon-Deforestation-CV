// Draws a scene (ImageData) with the tile grid overlay on a canvas. Shared by the
// true-colour report view and the false-colour model view.
import { TILE_PX } from '../geo/grid.js';

export const TILE_COLOURS = { forest: '#2d6a4f', not_forest: '#c9184a' };
export const LOSS_MARK = '▼';
export const BURN_MARK = '🔥';

function hatch(ctx) {
  const c = document.createElement('canvas');
  c.width = c.height = 12;
  const g = c.getContext('2d');
  g.strokeStyle = 'rgba(255,255,255,0.85)';
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(0, 12); g.lineTo(12, 0);
  g.stroke();
  return ctx.createPattern(c, 'repeat');
}

/**
 * canvas: target; image: ImageData-like; yearReport: buildReport() entry or null;
 * opts: { grid: true|false, selected: tile index or null }
 */
export function drawScene(canvas, image, grid, yearReport, opts = {}) {
  canvas.width = image.width;
  canvas.height = image.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return; // no canvas support (tests)
  ctx.putImageData(new ImageData(new Uint8ClampedArray(image.data), image.width, image.height), 0, 0);
  if (opts.grid === false || !yearReport) return;

  const pattern = hatch(ctx);
  ctx.font = `${Math.round(TILE_PX / 5)}px system-ui, sans-serif`;
  ctx.textBaseline = 'top';
  grid.forEach((t, i) => {
    const x = t.col * TILE_PX, y = t.row * TILE_PX;
    const tile = yearReport.tiles[i];
    if (!tile?.valid) {
      ctx.fillStyle = 'rgba(40,40,40,0.35)';
      ctx.fillRect(x, y, TILE_PX, TILE_PX);
      if (pattern) { ctx.fillStyle = pattern; ctx.fillRect(x, y, TILE_PX, TILE_PX); }
    } else {
      ctx.strokeStyle = TILE_COLOURS[tile.cls];
      ctx.lineWidth = 6;
      ctx.strokeRect(x + 3, y + 3, TILE_PX - 6, TILE_PX - 6);
      if (tile.loss) { ctx.fillStyle = '#fff'; ctx.fillText(LOSS_MARK, x + 10, y + 10); }
      if (tile.burn) ctx.fillText(BURN_MARK, x + TILE_PX - 36, y + 10);
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.6)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, TILE_PX - 1, TILE_PX - 1);
    if (opts.selected === i) {
      ctx.strokeStyle = '#ffd166';
      ctx.lineWidth = 8;
      ctx.strokeRect(x + 4, y + 4, TILE_PX - 8, TILE_PX - 8);
    }
  });
}

/** Tile index under a click on a canvas scaled by CSS. */
export function tileAt(canvas, event, grid) {
  const r = canvas.getBoundingClientRect();
  if (!r.width || !r.height) return null;
  const x = ((event.clientX - r.left) / r.width) * canvas.width;
  const y = ((event.clientY - r.top) / r.height) * canvas.height;
  const i = grid.findIndex((t) => t.col === Math.floor(x / TILE_PX) && t.row === Math.floor(y / TILE_PX));
  return i < 0 ? null : i;
}

/** Plain-language description of a tile for titles and screen readers. */
export function describeTile(tile) {
  if (!tile?.valid) return 'No data (cloud or shadow)';
  const cls = tile.cls === 'forest' ? 'Forest' : 'Not Forest';
  return `${cls} (${tile.confidencePct.toFixed(1)}%)${tile.label ? ` — ${tile.label}` : ''}`;
}
