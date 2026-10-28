// Nominatim place search (submit only, ≤ 1 request per second). Results outside the
// Amazon outline are listed but greyed out and can't be chosen.
import { h } from './dom.js';
import { pointInAmazon } from '../geo/region.js';

export const NOMINATIM = 'https://nominatim.openstreetmap.org/search';
const MIN_INTERVAL_MS = 1000;

export function createSearch(container, { onChoose = () => {}, fetchImpl = (...a) => fetch(...a), now = () => Date.now() } = {}) {
  const input = h('input', { type: 'search', id: 'place-search', placeholder: 'e.g. Novo Progresso', autocomplete: 'off', required: true });
  const button = h('button', { type: 'submit' }, 'Search');
  const results = h('ul', { class: 'search-results', 'aria-live': 'polite' });
  const message = h('p', { class: 'search-message', hidden: true });
  const form = h('form', { class: 'search', role: 'search', onsubmit: (e) => { e.preventDefault(); run(); } },
    h('label', { for: 'place-search' }, 'Search for a place'),
    h('div', { class: 'search-row' }, input, button),
  );
  container.append(form, message, results,
    h('p', { class: 'attribution-note' }, 'Search © OpenStreetMap contributors'));

  let last = -Infinity;
  let busy = false;

  function say(text) {
    message.hidden = !text;
    message.textContent = text || '';
  }

  async function run() {
    const q = input.value.trim();
    if (!q || busy) return;
    if (now() - last < MIN_INTERVAL_MS) {
      say('Please wait a moment before searching again.');
      return;
    }
    last = now();
    busy = true;
    button.disabled = true;
    results.replaceChildren();
    say('Searching…');
    try {
      const url = `${NOMINATIM}?format=jsonv2&limit=5&q=${encodeURIComponent(q)}`;
      const res = await fetchImpl(url, { headers: { Accept: 'application/json' } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const places = (await res.json()).slice(0, 5);
      say(places.length ? '' : 'No places found.');
      for (const p of places) results.append(resultItem(p));
    } catch {
      say('Search is unavailable right now. You can still click the map.');
    } finally {
      busy = false;
      button.disabled = false;
    }
  }

  function resultItem(p) {
    const lon = Number(p.lon), lat = Number(p.lat), name = String(p.display_name ?? 'Unnamed place');
    const inside = pointInAmazon(lon, lat);
    const btn = h('button', {
      type: 'button',
      class: inside ? 'result' : 'result result-outside',
      disabled: !inside,
      'aria-disabled': String(!inside),
      onclick: () => onChoose({ lon, lat, name: name.split(',')[0] }),
    }, name, inside ? null : h('span', { class: 'outside-tag' }, ' — outside the Amazon'));
    return h('li', {}, btn);
  }

  return { input, results, run };
}
