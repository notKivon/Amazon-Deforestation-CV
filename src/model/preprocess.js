// Teachable Machine preprocessing: centre-crop to square, bilinear resize to imageSize,
// scale 0–255 → −1…1. Input tiles are ImageData-like RGBA.
import * as tf from '@tensorflow/tfjs';

export const SCALE = 127.5;

function centreCrop(t) {
  const [h, w] = t.shape;
  const s = Math.min(h, w);
  return h === w ? t : t.slice([Math.floor((h - s) / 2), Math.floor((w - s) / 2), 0], [s, s, 3]);
}

/** One RGBA tile → float tensor [size, size, 3] in −1…1. */
export function tileTensor(tile, imageSize) {
  return tf.tidy(() => {
    const rgba = tf.tensor3d(tile.data, [tile.height, tile.width, 4], 'int32');
    const rgb = centreCrop(rgba.slice([0, 0, 0], [tile.height, tile.width, 3])).toFloat();
    return tf.image.resizeBilinear(rgb, [imageSize, imageSize]).div(SCALE).sub(1);
  });
}

export function batchTensor(tiles, imageSize) {
  return tf.tidy(() => tf.stack(tiles.map((t) => tileTensor(t, imageSize))));
}
