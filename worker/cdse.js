// Copernicus Data Space: OAuth token (cached per isolate) and Process API request.
export const TOKEN_URL =
  'https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token';
export const PROCESS_URL = 'https://sh.dataspace.copernicus.eu/api/v1/process';

export class UpstreamError extends Error {
  constructor(error, upstreamStatus) {
    super(error);
    this.error = error;
    this.upstreamStatus = upstreamStatus;
  }
}

let cached = null; // { token, expiresAt }
let pending = null; // shared in-flight token request

export function resetTokenCache() {
  cached = null;
  pending = null;
}

export async function getToken(env) {
  if (cached && Date.now() < cached.expiresAt) return cached.token;
  if (!pending) pending = requestToken(env).finally(() => { pending = null; });
  return pending;
}

async function requestToken(env) {
  let res;
  try {
    res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: env.CDSE_CLIENT_ID,
        client_secret: env.CDSE_CLIENT_SECRET,
      }),
    });
  } catch {
    throw new UpstreamError('auth_unreachable', 0);
  }
  if (!res.ok) throw new UpstreamError('auth_failed', res.status);
  const body = await res.json();
  if (!body.access_token) throw new UpstreamError('auth_failed', res.status);
  const ttl = Number(body.expires_in) || 300;
  cached = { token: body.access_token, expiresAt: Date.now() + (ttl - 60) * 1000 };
  return cached.token;
}

export function buildProcessRequest({ box, window, evalscript }) {
  return {
    input: {
      bounds: {
        bbox: [box.minX, box.minY, box.maxX, box.maxY],
        properties: { crs: `http://www.opengis.net/def/crs/EPSG/0/${box.epsg}` },
      },
      data: [
        {
          type: 'sentinel-2-l2a',
          dataFilter: { timeRange: window, mosaickingOrder: 'leastCC', maxCloudCoverage: 80 },
        },
      ],
    },
    output: {
      width: box.width,
      height: box.height,
      responses: [{ identifier: 'default', format: { type: 'image/png' } }],
    },
    evalscript,
  };
}

export async function fetchImage(env, request) {
  const token = await getToken(env);
  let res;
  try {
    res = await fetch(PROCESS_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'image/png' },
      body: JSON.stringify(request),
    });
  } catch {
    throw new UpstreamError('upstream_unreachable', 0);
  }
  if (!res.ok) {
    if (res.status === 401) resetTokenCache();
    throw new UpstreamError('upstream_error', res.status);
  }
  return res.arrayBuffer();
}
