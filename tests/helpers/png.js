// Test-only PNG decoder: 8-bit RGB / RGBA, non-interlaced, all five filter types.
// Returns RGB bytes (alpha dropped).
function paeth(a, b, c) {
  const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

export async function decodePng(bytes) {
  const u8 = new Uint8Array(bytes);
  const view = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  let o = 8, width = 0, height = 0, colorType = 2;
  const idat = [];
  while (o < u8.length) {
    const len = view.getUint32(o);
    const type = String.fromCharCode(...u8.subarray(o + 4, o + 8));
    if (type === 'IHDR') {
      width = view.getUint32(o + 8);
      height = view.getUint32(o + 12);
      const [depth, ct, , , interlace] = u8.subarray(o + 16, o + 21);
      if (depth !== 8 || (ct !== 2 && ct !== 6) || interlace) throw new Error('unsupported PNG');
      colorType = ct;
    }
    if (type === 'IDAT') idat.push(u8.subarray(o + 8, o + 8 + len));
    o += 12 + len;
  }
  const stream = new Blob(idat).stream().pipeThrough(new DecompressionStream('deflate'));
  const raw = new Uint8Array(await new Response(stream).arrayBuffer());
  const bpp = colorType === 6 ? 4 : 3, stride = width * bpp;
  const px = new Uint8Array(height * stride);
  for (let y = 0; y < height; y++) {
    const f = raw[y * (stride + 1)], src = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? px[y * stride + i - bpp] : 0;
      const b = y ? px[(y - 1) * stride + i] : 0;
      const c = y && i >= bpp ? px[(y - 1) * stride + i - bpp] : 0;
      const pred = f === 0 ? 0 : f === 1 ? a : f === 2 ? b : f === 3 ? (a + b) >> 1 : paeth(a, b, c);
      px[y * stride + i] = (src[i] + pred) & 255;
    }
  }
  if (bpp === 3) return { width, height, rgb: px };
  const rgb = new Uint8Array(width * height * 3);
  for (let i = 0; i < width * height; i++) rgb.set(px.subarray(i * 4, i * 4 + 3), i * 3);
  return { width, height, rgb };
}
