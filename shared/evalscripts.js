// The three Sentinel Hub evalscripts. Server-only: imported by the Worker, never the browser.
// All use the default reflectance units (0–1), as reference/build_dataset.py did.

// True colour for people: 2.5 × reflectance, 0–255.
export const TRUECOLOR = `//VERSION=3
function setup() {
  return { input: ["B02", "B03", "B04", "SCL"], output: { bands: 3, sampleType: "UINT8" } };
}
function px(v) {
  return Math.round(Math.min(255, Math.max(0, 2.5 * v * 255)));
}
function evaluatePixel(s) {
  return [px(s.B04), px(s.B03), px(s.B02)];
}
`;

// False colour for the model. Reproduces reference/build_dataset.py exactly:
//   evalscript returns band × 10000 as UINT16 (an integer DN), Python casts to float32 and
//   applies to_rgb = clip(GAIN × DN / 10000 × 255, 0, 255).astype(uint8)  [GAIN = 2.5,
//   float32 maths, astype truncates]. Math.fround repeats each float32 step and Math.floor
//   the truncation, so the integer we return is unchanged by UINT8 output conversion.
export const FALSECOLOR = `//VERSION=3
function setup() {
  return { input: ["B11", "B8A", "B04"], output: { bands: 3, sampleType: "UINT8" } };
}
function px(v) {
  var dn = Math.min(65535, Math.max(0, Math.round(v * 10000)));
  var x = Math.fround(Math.fround(Math.fround(2.5 * dn) / 10000) * 255);
  return Math.floor(Math.min(255, Math.max(0, x)));
}
function evaluatePixel(s) {
  return [px(s.B11), px(s.B8A), px(s.B04)];
}
`;

// Burn ratio + validity: R = round((NBR + 1) × 127.5) in 0–254, G = 255 if SCL ∈ {4,5,6,7}.
export const NBR = `//VERSION=3
function setup() {
  return { input: ["B8A", "B12", "SCL"], output: { bands: 3, sampleType: "UINT8" } };
}
function evaluatePixel(s) {
  var sum = s.B8A + s.B12;
  var nbr = sum > 0 ? (s.B8A - s.B12) / sum : 0;
  var r = Math.min(254, Math.max(0, Math.round((nbr + 1) * 127.5)));
  var valid = s.SCL === 4 || s.SCL === 5 || s.SCL === 6 || s.SCL === 7;
  return [r, valid ? 255 : 0, 0];
}
`;

export const EVALSCRIPTS = { truecolor: TRUECOLOR, falsecolor: FALSECOLOR, nbr: NBR };
