// Copernicus proxy for POST /api/imagery. Implemented in step 4.
export async function handleImagery() {
  return new Response(JSON.stringify({ error: 'not_implemented' }), {
    status: 501,
    headers: { 'Content-Type': 'application/json' },
  });
}
