'use strict';

//
// ILS approach beams for active landing runways (EHAM / Schiphol).
//
// Fetches the current runway configuration from the atc backend
// (`GET api/runways`, fed over MQTT from Home Assistant) and, for every active
// LANDING runway, draws the final-approach centerline on the map: a 10 NM
// radar-green very-thin line from the runway threshold extending in the
// direction traffic approaches from, with a small perpendicular tick every 2 NM.
//
// Runway threshold coordinates and true bearings are baked in from the eAIP
// (EHAM AD 2.12, AIRAC AMDT 05-2026). This is stable infrastructure data that
// only changes per AIRAC cycle; only the active-runway list comes from the API.
//

// --- Static EHAM runway geometry (from eAIP EHAM AD 2.12) --------------------
// thr: threshold coordinate as raw eAIP DMS strings (lat DDMMSS.ss[N/S],
//      lon DDDMMSS.ss[E/W]); trueBrg: runway true bearing in degrees (landing
//      direction of travel).
const EHAM_RUNWAYS_RAW = {
  '04': { lat: '521801.35N', lon: '0044700.55E', trueBrg: 41.25 },
  22: { lat: '521850.51N', lon: '0044810.89E', trueBrg: 221.27 },
  '06': { lat: '521720.78N', lon: '0044414.01E', trueBrg: 57.92 },
  24: { lat: '521815.66N', lon: '0044636.93E', trueBrg: 237.95 },
  '09': { lat: '521900.09N', lon: '0044451.57E', trueBrg: 86.78 },
  27: { lat: '521906.16N', lon: '0044748.88E', trueBrg: 266.82 },
  '18C': { lat: '521953.04N', lon: '0044424.11E', trueBrg: 183.22 },
  '36C': { lat: '521820.99N', lon: '0044415.69E', trueBrg: 3.22 },
  '18L': { lat: '521858.19N', lon: '0044646.89E', trueBrg: 183.25 },
  '36R': { lat: '521726.97N', lon: '0044638.45E', trueBrg: 3.25 },
  '18R': { lat: '522136.93N', lon: '0044242.21E', trueBrg: 183.2 },
  '36L': { lat: '521942.88N', lon: '0044231.81E', trueBrg: 3.2 },
};

// Parse an eAIP DMS coordinate into signed decimal degrees.
// `degDigits` is 2 for latitude (DDMMSS.ss) and 3 for longitude (DDDMMSS.ss).
function parseDMS(value, degDigits) {
  const hemisphere = value.slice(-1);
  const numeric = value.slice(0, -1);
  const deg = Number(numeric.slice(0, degDigits));
  const min = Number(numeric.slice(degDigits, degDigits + 2));
  const sec = Number(numeric.slice(degDigits + 2));
  let dec = deg + min / 60 + sec / 3600;
  if (hemisphere === 'S' || hemisphere === 'W') dec = -dec;
  return dec;
}

// Resolve the raw table into { lon, lat, trueBrg } decimals, keyed by designator.
const EHAM_RUNWAYS = (function () {
  const out = {};
  for (const desig in EHAM_RUNWAYS_RAW) {
    const r = EHAM_RUNWAYS_RAW[desig];
    out[desig] = { lat: parseDMS(r.lat, 2), lon: parseDMS(r.lon, 3), trueBrg: r.trueBrg };
  }
  return out;
})();

const ILS_NM_IN_METERS = 1852;
const ILS_BEAM_LENGTH_NM = 10;
const ILS_TICK_INTERVAL_NM = 2;
const ILS_TICK_HALF_LENGTH_NM = 0.2;

const ILS_STYLE = new ol.style.Style({
  stroke: new ol.style.Stroke({ color: '#00e676', width: 1 }),
});

// Vector overlay holding the ILS beam + tick features.
let ilsBeamFeatures = new ol.source.Vector();
// The OL layer wrapping ilsBeamFeatures; created in initMap() (map-setup.js).
let ilsBeamLayer = null;
// User toggle state ("ILS approach"); combined with atcStyle for visibility.
let ilsBeamsEnabled = true;
// Sorted+joined key of the last-drawn landing set, to skip redundant redraws.
let ilsLastLandingKey = null;
// Designators we've already warned about being unknown, to avoid log spam.
const ilsUnknownWarned = {};

// Great-circle destination point given a start [lon, lat], a true bearing in
// degrees and a distance in meters. Mirrors the forward formula used by
// TAR.utils.make_geodesic_circle (timers-drones-ais.js).
function destinationPoint(lonLat, bearingDeg, distanceMeters) {
  const R = 6378137.0;
  const angularDistance = distanceMeters / R;
  const bearing = (bearingDeg * Math.PI) / 180.0;
  const lon1 = (lonLat[0] * Math.PI) / 180.0;
  const lat1 = (lonLat[1] * Math.PI) / 180.0;

  const lat2 = Math.asin(Math.sin(lat1) * Math.cos(angularDistance) + Math.cos(lat1) * Math.sin(angularDistance) * Math.cos(bearing));
  const lon2 =
    lon1 + Math.atan2(Math.sin(bearing) * Math.sin(angularDistance) * Math.cos(lat1), Math.cos(angularDistance) - Math.sin(lat1) * Math.sin(lat2));

  return [(lon2 * 180.0) / Math.PI, (lat2 * 180.0) / Math.PI];
}

// Add a lon/lat LineString (array of [lon, lat]) to the ILS overlay.
function addIlsLine(lonLatCoords) {
  const geom = new ol.geom.LineString(lonLatCoords);
  geom.transform('EPSG:4326', 'EPSG:3857');
  const feature = new ol.Feature(geom);
  feature.setStyle(ILS_STYLE);
  ilsBeamFeatures.addFeature(feature);
}

// Redraw all ILS beams for the given active landing runway designators.
function drawIlsBeams(landingDesignators) {
  ilsBeamFeatures.clear();
  if (!Array.isArray(landingDesignators)) return;

  for (const desig of landingDesignators) {
    const rwy = EHAM_RUNWAYS[desig];
    if (!rwy) {
      if (!ilsUnknownWarned[desig]) {
        ilsUnknownWarned[desig] = true;
        console.warn('ILS: unknown runway designator, skipping: ' + desig);
      }
      continue;
    }

    const thr = [rwy.lon, rwy.lat];
    // Traffic approaches from the reciprocal of the landing direction.
    const beamBearing = (rwy.trueBrg + 180) % 360;

    // Main centerline.
    const beamEnd = destinationPoint(thr, beamBearing, ILS_BEAM_LENGTH_NM * ILS_NM_IN_METERS);
    addIlsLine([thr, beamEnd]);

    // Perpendicular distance ticks every 2 NM.
    const halfMeters = ILS_TICK_HALF_LENGTH_NM * ILS_NM_IN_METERS;
    for (let d = ILS_TICK_INTERVAL_NM; d <= ILS_BEAM_LENGTH_NM; d += ILS_TICK_INTERVAL_NM) {
      const center = destinationPoint(thr, beamBearing, d * ILS_NM_IN_METERS);
      const left = destinationPoint(center, (beamBearing + 90) % 360, halfMeters);
      const right = destinationPoint(center, (beamBearing + 270) % 360, halfMeters);
      addIlsLine([left, right]);
    }
  }
}

// Beams are shown only in ATC mode, and only when the user toggle is on.
function updateIlsVisibility() {
  if (ilsBeamLayer) ilsBeamLayer.setVisible(!!atcStyle && !!ilsBeamsEnabled);
}

// Poll the backend for the active runway configuration and redraw on change.
// Self-schedules; the first call is kicked off from initMap() after the map
// is created.
function refreshRunways() {
  jQuery
    .getJSON('api/runways')
    .done(function (data) {
      const landing = data && Array.isArray(data.landing) ? data.landing : [];
      const key = landing.slice().sort().join(',');
      if (key !== ilsLastLandingKey) {
        ilsLastLandingKey = key;
        drawIlsBeams(landing);
      }
    })
    .fail(function (jqXHR) {
      // 503 = backend has no configuration yet -> clear beams. Transient network
      // errors keep the last-known configuration on screen.
      if (jqXHR && jqXHR.status === 503 && ilsLastLandingKey !== '') {
        ilsLastLandingKey = '';
        drawIlsBeams([]);
      }
    })
    .always(function () {
      setTimeout(refreshRunways, 30000);
    });
}
