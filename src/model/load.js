// Loads the Teachable Machine v2 export. Labels are always looked up by name.
import * as tf from '@tensorflow/tfjs';

export async function initBackend() {
  for (const name of ['webgl', 'cpu']) {
    try {
      if (await tf.setBackend(name)) {
        await tf.ready();
        // float16-only WebGL can shift probabilities near 0.5; use the CPU instead.
        if (name === 'webgl' && !tf.env().getBool('WEBGL_RENDER_FLOAT32_CAPABLE')) continue;
        return name;
      }
    } catch {
      /* try the next backend */
    }
  }
  throw new Error('No TensorFlow.js backend available');
}

export function readMetadata(metadata) {
  const { labels, imageSize } = metadata ?? {};
  if (!Array.isArray(labels)) throw new Error('metadata.json has no labels');
  const forestIndex = labels.indexOf('Forest');
  const notForestIndex = labels.indexOf('Not Forest');
  if (forestIndex < 0 || notForestIndex < 0) throw new Error('metadata.json must label "Forest" and "Not Forest"');
  if (!Number.isInteger(imageSize) || imageSize <= 0) throw new Error('metadata.json has no valid imageSize');
  return { labels, imageSize, forestIndex, notForestIndex };
}

/**
 * source: a URL to model.json (browser) or a tf.io IOHandler (tests).
 * metadata: the parsed metadata.json, or omitted to fetch it next to the model.
 */
export async function loadModel({ source = '/model/model.json', metadata } = {}) {
  let meta = metadata;
  if (!meta) {
    const res = await fetch(new URL('metadata.json', new URL(source, location.href)));
    if (!res.ok) throw new Error(`Could not load the model metadata (HTTP ${res.status})`);
    meta = await res.json();
  }
  const info = readMetadata(meta);
  const model = await tf.loadLayersModel(source);
  return { model, ...info };
}
