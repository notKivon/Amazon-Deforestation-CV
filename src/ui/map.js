// Leaflet map: Amazon outline (outside dimmed), click to choose the centre, the selected
// area square (red when outside the Amazon), and the tile grid after a run.
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { amazonOutline } from '../geo/region.js';
import { geometryPolygons } from '../geo/polygon.js';

const OSM = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
export const ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors | ' +
  'Amazon boundary &copy; <a href="https://www.raisg.org/">RAISG</a> 2025';

const toLatLngs = (ring) => ring.map(([lon, lat]) => [lat, lon]);
const WORLD = [[-89, -179.9], [-89, 179.9], [89, 179.9], [89, -179.9]];

export function createMap(el, { onSelect = () => {} } = {}) {
  const map = L.map(el, { center: [-3.5, -60], zoom: 5, worldCopyJump: true });
  L.tileLayer(OSM, { maxZoom: 18, attribution: ATTRIBUTION }).addTo(map);

  const polys = geometryPolygons(amazonOutline.features[0].geometry);
  // Dim everything outside the outline: world rectangle with the Amazon as holes.
  L.polygon([WORLD, ...polys.map((p) => toLatLngs(p[0]))], {
    stroke: false, fillColor: '#1d1d1d', fillOpacity: 0.35, interactive: false,
  }).addTo(map);
  L.polygon(polys.map((p) => p.map(toLatLngs)), {
    color: '#f4f1de', weight: 1.5, fill: false, interactive: false,
  }).addTo(map);

  let area = null, centre = null;
  const gridLayer = L.layerGroup().addTo(map);

  map.on('click', (e) => onSelect({ lon: e.latlng.lng, lat: e.latlng.lat }));

  return {
    map,
    /** corners: [[lat, lon] × 4] or null. */
    setArea(point, corners, inside) {
      area?.remove();
      centre?.remove();
      gridLayer.clearLayers();
      if (!point) return;
      centre = L.circleMarker([point.lat, point.lon], { radius: 4, color: '#fff', weight: 2, fillOpacity: 1 }).addTo(map);
      area = L.polygon(corners, {
        color: inside ? '#ffd166' : '#e63946', weight: 2, fillOpacity: inside ? 0.05 : 0.2, interactive: false,
      }).addTo(map);
    },
    /** tiles: [{ cornersLatLon, style: Leaflet path options, title }] */
    setGrid(tiles) {
      gridLayer.clearLayers();
      for (const t of tiles) {
        const p = L.polygon(t.cornersLatLon, { weight: 0.5, color: '#ffffff', ...t.style });
        if (t.title) p.bindTooltip(t.title);
        gridLayer.addLayer(p);
      }
    },
    flyTo(point, zoom = 12) {
      map.flyTo([point.lat, point.lon], zoom, { duration: 0.8 });
    },
    fitArea(corners) {
      map.fitBounds(L.latLngBounds(corners), { padding: [30, 30], maxZoom: 14 });
    },
  };
}
