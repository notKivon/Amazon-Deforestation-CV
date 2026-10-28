// Amazon-only hard limit, against the simplified RAISG outline.
import outlineText from '../../public/data/amazon-biome.geojson';
import { indexGeometry, pointInIndex } from './polygon.js';
import { boxCentreLatLon, boxCornersLatLon } from './grid.js';

export const amazonOutline = JSON.parse(outlineText);
const index = indexGeometry(amazonOutline.features[0].geometry);

export function pointInAmazon(lon, lat) {
  return pointInIndex(index, lon, lat);
}

/** True only if the box centre and all four corners are inside the outline. */
export function areaInsideAmazon(box) {
  return [boxCentreLatLon(box), ...boxCornersLatLon(box)].every(([lat, lon]) => pointInAmazon(lon, lat));
}
