// Test-only PNG decoder for the RGB, filter-0 PNGs that worker/png.js writes.
export async function decodePng(bytes) {
  const u8 = new Uint8Array(bytes);
  const view = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  let o = 8, width = 0, height = 0;
  const idat = [];
  while (o < u8.length) {
    const len = view.getUint32(o);
    const type = String.fromCharCode(...u8.subarray(o + 4, o + 8));
    const data = u8.subarray(o + 8, o + 8 + len);
    if (type === 'IHDR') { width = view.getUint32(o + 8); height = view.getUint32(o + 12); }
    if (type === 'IDAT') idat.push(data);
    o += 12 + len;
  }
  const stream = new Blob(idat).stream().pipeThrough(new DecompressionStream('deflate'));
  const raw = new Uint8Array(await new Response(stream).arrayBuffer());
  const rgb = new Uint8Array(width * height * 3);
  for (let y = 0; y < height; y++) rgb.set(raw.subarray(y * (width * 3 + 1) + 1, (y + 1) * (width * 3 + 1)), y * width * 3);
  return { width, height, rgb };
}
