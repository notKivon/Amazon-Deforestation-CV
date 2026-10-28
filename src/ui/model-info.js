// Static model description and Known limitations. The limitation wording comes from
// CLAUDE.md → Report contents and must not be reworded without a spec change.
import { h } from './dom.js';

export const KNOWN_LIMITATIONS = [
  'Cannot tell burned or degraded canopy from clear-cutting.',
  'A burn flag cannot tell wildfire from fire used to clear land.',
  'B11 and B8A are 20 m bands upsampled to 10 m.',
  'Tiles with a small cleared patch (~7% or more) can flip to Not Forest.',
  'Amazon only, dry-season images only.',
  'Thin haze, smoke and cloud edges can slip past the cloud mask and look like cleared land.',
  'Natural savannas and grasslands (e.g. in Roraima and the Guiana Shield) show as Not Forest even though nothing was cut.',
  '"extended window" years are a month wider on each side, so they are slightly less comparable with other years.',
];

const COLOUR_KEY = [
  ['#46a019', 'Forest', 'green'],
  ['#cd87a5', 'Cleared land', 'pink / magenta'],
  ['#0c122d', 'Water', 'dark blue'],
  ['#5f2d1e', 'Burn scars', 'dark red / brown'],
];

export function modelInfo() {
  return h('div', { class: 'model-info' },
    h('div', {},
      h('h3', {}, 'About the model'),
      h('ul', {},
        h('li', {}, 'Made with Google Teachable Machine: transfer learning on MobileNet, running in your browser with TensorFlow.js.'),
        h('li', {}, 'Trained on 128 px SWIR false-colour tiles (R = B11, G = B8A, B = B04) from Sentinel-2 dry-season images, each covering 1.28 km.'),
        h('li', {}, 'Held-out test accuracy: v2 (this model) 141/143 (98.6%), compared with v1 126/143 (88%).'),
        h('li', {}, 'Each tile is labelled Forest when P(Forest) is 50% or more. Cover % = Forest tiles ÷ tiles with clear data.'),
      ),
      h('h3', {}, 'Colour key for the false-colour images'),
      h('ul', { class: 'colour-key' }, COLOUR_KEY.map(([c, name, desc]) =>
        h('li', {}, h('span', { class: 'key-swatch', style: { background: c }, 'aria-hidden': 'true' }), `${name}: ${desc}`))),
    ),
    h('div', { class: 'limitations' },
      h('h3', {}, 'Known limitations'),
      h('ul', {}, KNOWN_LIMITATIONS.map((t) => h('li', {}, t))),
      h('p', { class: 'note' }, 'Amazon boundary: RAISG (2025), Biomas. Imagery: Copernicus Sentinel-2, processed by ESA.'),
    ),
  );
}
