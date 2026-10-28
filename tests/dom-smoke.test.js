// @vitest-environment jsdom
import { it, expect } from 'vitest';

it('jsdom environment is available for DOM tests', () => {
  document.body.innerHTML = '<main id="app"></main>';
  expect(document.getElementById('app')).not.toBeNull();
});
