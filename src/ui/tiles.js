// Draws a scene (ImageData) with the tile grid overlay on a canvas. Shared by the
// true-colour and false-colour images in the report's side-by-side viewer.
import { TILE_PX } from '../geo/grid.js';

export const TILE_COLOURS = { forest: '#00ff00', not_forest: '#ff0000' };
export const SELECTED_COLOUR = '#ffff00';
const SELECT_W = 3; // selection outline width, in line units
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
 *
 * Each tile, from its edge inwards: a thin separator line (yellow when selected), then the
 * class border (green Forest, red Not Forest). Line widths scale with the image size so
 * they look about the same on screen for every area size.
 */
export function drawScene(canvas, image, grid, yearReport, opts = {}) {
  canvas.width = image.width;
  canvas.height = image.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return; // no canvas support (tests)
  ctx.putImageData(new ImageData(new Uint8ClampedArray(image.data), image.width, image.height), 0, 0);
  const u = Math.max(1, image.width / 512); // one "line unit" in canvas pixels
  if (opts.grid !== false && yearReport) drawGrid(ctx, grid, yearReport, u);
  const sel = opts.selected != null ? grid[opts.selected] : null;
  if (sel) {
    // Yellow band on the outer edge, with a dark hairline inside it for contrast.
    const x = sel.col * TILE_PX, y = sel.row * TILE_PX, w = SELECT_W * u;
    ctx.strokeStyle = SELECTED_COLOUR;
    ctx.lineWidth = w;
    ctx.strokeRect(x + w / 2, y + w / 2, TILE_PX - w, TILE_PX - w);
    ctx.strokeStyle = 'rgba(0,0,0,0.8)';
    ctx.lineWidth = u;
    ctx.strokeRect(x + w + u / 2, y + w + u / 2, TILE_PX - 2 * w - u, TILE_PX - 2 * w - u);
  }
}

function drawGrid(ctx, grid, yearReport, u) {
  const pattern = hatch(ctx);
  // Class border sits inside the space reserved for the selection outline (+ hairline).
  const border = 2 * u, inset = (SELECT_W + 1) * u + border / 2;
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
      ctx.lineWidth = border;
      ctx.strokeRect(x + inset, y + inset, TILE_PX - 2 * inset, TILE_PX - 2 * inset);
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#000';
      ctx.fillStyle = '#fff';
      if (tile.loss) { ctx.strokeText(LOSS_MARK, x + 10, y + 10); ctx.fillText(LOSS_MARK, x + 10, y + 10); }
      if (tile.burn) ctx.fillText(BURN_MARK, x + TILE_PX - 36, y + 10);
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.6)';
    ctx.lineWidth = u;
    ctx.strokeRect(x + u / 2, y + u / 2, TILE_PX - u, TILE_PX - u);
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
