import { describe, it, expect, vi } from 'vitest';
import worker from '../worker/index.js';

const env = () => ({ ASSETS: { fetch: vi.fn(async () => new Response('asset')) } });

describe('worker routing', () => {
  it('sends non-API paths to ASSETS', async () => {
    const e = env();
    const res = await worker.fetch(new Request('https://x.test/index.html'), e, {});
    expect(e.ASSETS.fetch).toHaveBeenCalledOnce();
    expect(await res.text()).toBe('asset');
  });

  it('rejects GET on /api/imagery with 405', async () => {
    const e = env();
    const res = await worker.fetch(new Request('https://x.test/api/imagery'), e, {});
    expect(res.status).toBe(405);
    expect(e.ASSETS.fetch).not.toHaveBeenCalled();
  });

  it('routes POST /api/imagery to the proxy', async () => {
    const e = env();
    const req = new Request('https://x.test/api/imagery', { method: 'POST', body: '{}' });
    const res = await worker.fetch(req, e, {});
    expect(e.ASSETS.fetch).not.toHaveBeenCalled();
    expect(res.headers.get('Content-Type')).toBe('application/json');
  });

  it('returns 404 JSON for unknown API paths', async () => {
    const res = await worker.fetch(new Request('https://x.test/api/nope'), env(), {});
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'not_found' });
  });
});
