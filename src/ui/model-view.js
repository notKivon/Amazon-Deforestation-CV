// "What the model sees": how the false-colour image is made, model info, colour key, and
// Known limitations. The images themselves are in the report's side-by-side viewer.
import { h } from './dom.js';
import { modelInfo } from './model-info.js';

export function renderModelView(section) {
  section.replaceChildren(
    h('h2', { id: 'model-title' }, 'What the model sees'),
    h('p', {}, 'The model never sees the true-colour picture. It sees the false-colour image shown on the right in the report above, made from short-wave infrared (B11), narrow near-infrared (B8A), and red (B04). Healthy forest is green, cleared land is pink or magenta. Each 1.28 km square is classified on its own; select a square on either image to see the model\'s confidence for it.'),
    modelInfo(),
  );
  section.hidden = false;
}
