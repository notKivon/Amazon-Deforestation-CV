// Loading / error / warning / info banner with an optional progress bar.
import { h } from './dom.js';

export const OUTSIDE_AMAZON = 'This tool only covers the Amazon, where the model was trained';

const ERROR_TEXT = {
  outside_amazon: OUTSIDE_AMAZON,
  network: 'Could not reach the server. Check your connection and try again.',
  upstream_error: 'The Copernicus imagery service returned an error. Please try again in a minute.',
  upstream_unreachable: 'The Copernicus imagery service could not be reached. Please try again later.',
  auth_failed: 'The imagery service rejected the server\'s credentials. The site owner needs to check the setup.',
  auth_unreachable: 'The Copernicus login service could not be reached. Please try again later.',
  not_configured: 'The imagery service is not configured on this server.',
  invalid_year: 'That year is not available for this location.',
};

/** Readable text for an error code from the client (ImageryError.code) or any Error. */
export function errorMessage(err) {
  if (err?.code && ERROR_TEXT[err.code]) return ERROR_TEXT[err.code];
  if (err?.code?.startsWith?.('http_')) return `The server returned an error (${err.code.slice(5)}). Please try again.`;
  if (err?.code?.startsWith?.('invalid_')) return 'The request was not accepted. Please reselect the area and try again.';
  return err?.message || 'Something went wrong. Please try again.';
}

export function createStatus(container) {
  const text = h('span', { class: 'status-text' });
  const bar = h('progress', { class: 'status-progress', max: 1, value: 0, hidden: true });
  const el = h('div', { class: 'status', role: 'status', 'aria-live': 'polite', hidden: true }, text, bar);
  container.append(el);

  return {
    el,
    /** kind: 'loading' | 'error' | 'warning' | 'info'; progress: { done, total } (optional). */
    show(kind, message, progress) {
      el.hidden = false;
      el.className = `status status-${kind}`;
      el.setAttribute('role', kind === 'error' ? 'alert' : 'status');
      text.textContent = message;
      bar.hidden = !progress;
      if (progress) {
        bar.max = progress.total;
        bar.value = progress.done;
        bar.setAttribute('aria-label', `${progress.done} of ${progress.total} done`);
      }
    },
    error(err) {
      this.show('error', errorMessage(err));
    },
    clear() {
      el.hidden = true;
      text.textContent = '';
    },
  };
}
