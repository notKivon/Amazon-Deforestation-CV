// Worker entry: POST /api/imagery goes to the proxy; everything else is a static asset.
import { handleImagery } from './imagery.js';

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export default {
  async fetch(request, env, ctx) {
    const { pathname } = new URL(request.url);
    if (pathname === '/api/imagery') {
      if (request.method !== 'POST') {
        return new Response(JSON.stringify({ error: 'method_not_allowed' }), {
          status: 405,
          headers: { 'Content-Type': 'application/json', Allow: 'POST' },
        });
      }
      return handleImagery(request, env, ctx);
    }
    if (pathname.startsWith('/api/')) return json(404, { error: 'not_found' });
    return env.ASSETS.fetch(request);
  },
};
