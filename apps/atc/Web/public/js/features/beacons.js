'use strict';

//
// Schiphol (EHAM) navigation beacons.
//
// Draws the well-known Amsterdam-area navigation fixes on the map as static
// reference markers, grouped into four categories that each become their own
// toggleable overlay layer:
//
//   iaf  - Initial Approach Fixes (ARTIP / RIVER / SUGOL); every arrival funnels
//          to one of these. Shown by default.
//   star - STAR / TMA entry fixes; the "arrival gates" on the FIR boundary where
//          each standard arrival route enters. Shown by default.
//   vor  - VOR/DME ground navaids (SPL / PAM / SPY). Hidden by default.
//   sid  - SID / departure fixes. Hidden by default.
//
// Like the ILS beams (js/features/ils.js), the layers are only visible in ATC
// mode (atcStyle) and only when their per-category toggle is on. Coordinates are
// static aeronautical reference data that only change per AIRAC cycle, so they
// are baked in here rather than fetched. Values are from public navdata
// (opennav.com) consistent with the LVNL eAIP; each carries its source DMS as a
// comment. There is no polling: the features are drawn once at map init.
//

// --- Static beacon table -----------------------------------------------------
// lat/lon are signed decimal degrees; the DMS comment is the eAIP-style source.
const SCHIPHOL_BEACONS = {
  iaf: {
    title: 'IAF (approach fixes)',
    layerName: 'schipholIaf',
    toggleKey: 'schipholIaf',
    color: '#00e5ff',
    shape: 'dot',
    enabledByDefault: true,
    points: [
      { name: 'ARTIP', lat: 52.5112, lon: 5.5691 }, // 52 30 40.37N 005 34 08.69E
      { name: 'RIVER', lat: 51.9128, lon: 4.1326 }, // 51 54 45.95N 004 07 57.34E
      { name: 'SUGOL', lat: 52.5255, lon: 3.9674 }, // 52 31 31.84N 003 58 02.46E
    ],
  },
  star: {
    title: 'STAR entry fixes',
    layerName: 'schipholStar',
    toggleKey: 'schipholStar',
    color: '#ffd740',
    shape: 'dot',
    enabledByDefault: true,
    points: [
      { name: 'NORKU', lat: 52.2156, lon: 6.9764 }, // 52 12 56.00N 006 58 35.00E
      { name: 'DENUT', lat: 51.2361, lon: 3.6575 }, // 51 14 10.00N 003 39 27.00E
      { name: 'EEL', lat: 53.1639, lon: 6.6667 }, // 53 09 50.06N 006 40 00.03E
      { name: 'HELEN', lat: 51.2353, lon: 3.8697 }, // 51 14 07.13N 003 52 10.96E
      { name: 'LAMSO', lat: 52.7329, lon: 2.9944 }, // 52 43 58.43N 002 59 39.68E
      { name: 'MOLIX', lat: 52.822, lon: 3.0687 }, // 52 49 19.20N 003 04 07.21E
      { name: 'PESER', lat: 51.6146, lon: 4.5268 }, // 51 36 52.73N 004 31 36.53E
      { name: 'NARSO', lat: 52.7153, lon: 6.7095 }, // 52 42 55.15N 006 42 34.36E
    ],
  },
  vor: {
    title: 'VOR/DME beacons',
    layerName: 'schipholVor',
    toggleKey: 'schipholVor',
    color: '#ff8a65',
    shape: 'ring',
    enabledByDefault: false,
    points: [
      { name: 'SPL', lat: 52.3319, lon: 4.7497 }, // 52 19 55.00N 004 44 59.00E (Schiphol)
      { name: 'PAM', lat: 52.3347, lon: 5.0925 }, // 52 20 05.00N 005 05 31.00E (Pampus)
      { name: 'SPY', lat: 52.5403, lon: 4.8536 }, // 52 32 25.00N 004 51 13.00E (Spijkerboor)
    ],
  },
  sid: {
    title: 'SID departure fixes',
    layerName: 'schipholSid',
    toggleKey: 'schipholSid',
    color: '#b0bec5',
    shape: 'dot',
    enabledByDefault: false,
    points: [
      { name: 'ANDIK', lat: 52.7394, lon: 5.2705 }, // 52 44 21.85N 005 16 13.76E
      { name: 'LOPIK', lat: 51.9308, lon: 5.1291 }, // 51 55 50.98N 005 07 44.96E
      { name: 'OGINA', lat: 52.0975, lon: 5.0546 }, // 52 05 50.92N 005 03 16.68E
      { name: 'RENDI', lat: 52.0615, lon: 5.6754 }, // 52 03 41.56N 005 40 31.53E
      { name: 'BERGI', lat: 52.7487, lon: 4.3589 }, // 52 44 55.50N 004 21 32.15E
      { name: 'VALKO', lat: 52.0713, lon: 3.8398 }, // 52 04 16.84N 003 50 23.39E
      { name: 'LEKKO', lat: 51.9242, lon: 4.7673 }, // 51 55 27.03N 004 46 02.39E
      { name: 'GORLO', lat: 51.924, lon: 3.1713 }, // 51 55 26.64N 003 10 18.61E
      { name: 'EDUPO', lat: 51.9755, lon: 5.8359 }, // 51 58 31.89N 005 50 09.37E
    ],
  },
};

// --- Runtime state (mirrors the ils.js pattern) ------------------------------
// Per-category vector source (holds the point features), the OL layer wrapping
// it (created in initMap, map-setup.js), and the user toggle state (combined
// with atcStyle for visibility).
const beaconSources = {};
const beaconLayers = {};
const beaconEnabled = {};
for (const key in SCHIPHOL_BEACONS) {
  beaconSources[key] = new ol.source.Vector();
  beaconLayers[key] = null;
  beaconEnabled[key] = SCHIPHOL_BEACONS[key].enabledByDefault;
}

// Build the marker style for one beacon: a small glyph plus an always-on,
// black-outlined name label to its right (cf. the distance-measurement label in
// map-setup.js). The vendored OpenLayers build only ships ol.style.Circle (no
// RegularShape), so VOR navaids use a hollow ring and fixes use a filled dot.
function makeBeaconStyle(name, cat) {
  const image =
    cat.shape === 'ring'
      ? new ol.style.Circle({
          radius: 5,
          stroke: new ol.style.Stroke({ color: cat.color, width: 2 }),
          fill: new ol.style.Fill({ color: 'rgba(0, 0, 0, 0)' }),
        })
      : new ol.style.Circle({
          radius: 3.5,
          stroke: new ol.style.Stroke({ color: '#000000', width: 1 }),
          fill: new ol.style.Fill({ color: cat.color }),
        });

  return new ol.style.Style({
    image: image,
    text: new ol.style.Text({
      text: name,
      font: 'bold 11px "Helvetica Neue", Helvetica, Arial, sans-serif',
      textAlign: 'left',
      offsetX: 8,
      offsetY: 0,
      fill: new ol.style.Fill({ color: cat.color }),
      stroke: new ol.style.Stroke({ color: '#000000', width: 3 }),
    }),
  });
}

// (Re)build all beacon features into their per-category sources. Static data, so
// this is called once from initMap() after the layers exist.
function drawBeacons() {
  for (const key in SCHIPHOL_BEACONS) {
    const cat = SCHIPHOL_BEACONS[key];
    const src = beaconSources[key];
    src.clear();
    for (const p of cat.points) {
      const feature = new ol.Feature({
        geometry: new ol.geom.Point(ol.proj.fromLonLat([p.lon, p.lat])),
      });
      feature.setStyle(makeBeaconStyle(p.name, cat));
      src.addFeature(feature);
    }
  }
}

// Beacons are shown only in ATC mode, and only for categories toggled on.
function updateBeaconVisibility() {
  for (const key in beaconLayers) {
    const layer = beaconLayers[key];
    if (layer) layer.setVisible(!!atcStyle && !!beaconEnabled[key]);
  }
}
