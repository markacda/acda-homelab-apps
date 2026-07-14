function zeroPad(num, size) {
  var s = num + '';
  while (s.length < size) s = '0' + s;
  return s;
}

// Converts "hiccup"-style structures (https://github.com/weavejester/hiccup)
// to XML.
function hiccup(node) {
  if (Array.isArray(node)) {
    const [tag, attribs, ...children] = node;
    let attribStrings = [];
    for (const prop in attribs) {
      if (!attribs.hasOwnProperty(prop) || attribs[prop] === undefined) {
        continue;
      }
      attribStrings.push(`${prop}="${attribs[prop]}"`);
    }
    let xml = `<${tag} ${attribStrings.join(' ')}>`;
    for (const child of children) {
      xml += hiccup(child);
    }
    xml += `</${tag}>\n`;
    return xml;
  } else {
    return '' + node;
  }
}

// Prompts a browser to download a data: URL.
function download(name, contentType, data) {
  var link = document.createElement('a');
  link.download = name;
  link.href = 'data:' + contentType + ',' + encodeURIComponent(data);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

function baseExportFilenameForAircrafts(aircrafts) {
  return aircrafts.map((a) => (a.registration || a.icao).toUpperCase()).join('-');
}

// Returns an array of {pos, alt, ts} for an aircraft.
function coordsForExport(plane) {
  let coords = [];
  let numSegs = plane.track_linesegs.length;
  let segs = plane.track_linesegs;
  let runningAverage = 0;
  let lastTimestamp = 0;
  let delta;
  //console.log(kmlStyle);
  if (kmlStyle == 'geom_avg') {
    //console.log('averaging');
    const avgWindow = 8;
    for (let i = 0; i < numSegs; i++) {
      const seg = segs[i];
      const geom = seg.alt_geom;
      const baro = seg.alt_real;
      let geomOffset = null;
      if (!seg.ground && baro != null && geom != null) {
        seg.geomOffset = geom - baro;
        delta = seg.geomOffset - runningAverage;
        if (delta <= 50) {
          runningAverage += delta * Math.min(1, (seg.ts - lastTimestamp) / avgWindow);
        } else {
          runningAverage = seg.geomOffset;
        }
        seg.geomOffAverage = runningAverage;
        lastTimestamp = seg.ts;
      }
    }
    lastTimestamp = 1e12;
    for (let i = numSegs - 1; i >= 0; i--) {
      const seg = segs[i];
      const geom = seg.alt_geom;
      const baro = seg.alt_real;
      let geomOffset = null;
      if (seg.geomOffset != null) {
        delta = seg.geomOffset - runningAverage;
        if (delta <= 50) {
          runningAverage += delta * Math.min(1, (lastTimestamp - seg.ts) / avgWindow);
        } else {
          runningAverage = seg.geomOffset;
        }
        //console.log(seg.geomOffAverage + ' ' + runningAverage);
        seg.geomOffAverage = (seg.geomOffAverage + runningAverage) / 2;
        lastTimestamp = seg.ts;
      }
    }
  }
  for (let i = 0; i < numSegs; i++) {
    const seg = segs[i];
    const pos = seg.position;
    if (pos) {
      let alt = null;
      const baro = seg.alt_real;
      const geom = seg.alt_geom;
      const geomOffAverage = seg.geomOffAverage;
      let using_baro = false;
      if (kmlStyle == 'geom_avg' && geomOffAverage != null) {
        const betterGeom = baro + geomOffAverage;
        alt = Math.round(betterGeom * 0.3048); // convert ft to m
      } else if (kmlStyle != 'baro' && geom != null) {
        alt = Math.round(geom * 0.3048); // convert ft to m
      } else if (kmlStyle == 'baro' && baro != null && baro != 'ground') {
        alt = Math.round(baro * 0.3048);
        using_baro = true;
      }
      if (seg.ground) {
        alt = 'ground';
      } else if (alt != null && egmLoaded && !using_baro) {
        // alt is in meters at this point
        alt = Math.round(egm96.ellipsoidToEgm96(pos[1], pos[0], alt));
      }

      const ts = new Date(seg.ts * 1000.0);
      if (alt == null) {
        console.log(`Skipping, no altitude: ${i} ${pos} ${ts}`);
        continue;
      }
      //console.log(`exporting coord: ${i} ${pos} ${alt} ${ts}`);
      coords.push({ pos: pos, alt: alt, ts: ts });
    } else {
      console.log(`Skipping ${i}`);
    }
  }
  return coords;
}

// We use this to give each aircraft a different color track in a
// multi-select export scenario. From colorbrewer, but I moved the red
// to be first.
const EXPORT_RGB_COLORS = ['e31a1c', 'a6cee3', '1f78b4', 'b2df8a', '33a02c', 'fb9a99', 'fdbf6f', 'ff7f00', 'cab2d6', '6a3d9a', 'ffff99', 'b15928'];

// Converts "rrggbb" colors to KML format, "aabbggrr".
let RGBColorToKMLColor = function (c) {
  return 'ff' + c.substring(4, 6) + c.substring(2, 4) + c.substring(0, 2);
};

// Returns an array of selected planes, ordered by registration-or-ICAO.
function selectedPlanes() {
  const planes = [];
  for (let key in SelPlanes) {
    let plane = SelPlanes[key];
    if (plane.selected) {
      planes.push(plane);
    }
  }
  planes.sort((a, b) => {
    const keyA = (a.registration || a.icao).toUpperCase();
    const keyB = (b.registration || b.icao).toUpperCase();
    if (keyA < keyB) return -1;
    if (keyA > keyB) return 1;
    return 0;
  });
  return planes;
}

// Exports currently selected aircraft as KML.

let egmScript = null;
let egmLoaded = false;
function loadEGM() {
  if (egmScript) {
    return null;
  }
  egmScript = document.createElement('script');
  egmScript.src = 'libs/egm96-universal-1.1.0.min.js';
  egmScript.addEventListener('load', function () {
    egmLoaded = true;
  });
  document.body.appendChild(egmScript);
  return egmScript;
}
function adjust_geom_alt(alt, pos) {
  if (geomUseEGM && egmLoaded) {
    if (alt == null) {
      return alt;
    }
    return egm96.ellipsoidToEgm96(pos[1], pos[0], alt * 0.3048) / 0.3048;
  } else {
    return alt;
  }
}
let kmlStyle = '';
function exportKML(altStyle) {
  if (altStyle) {
    kmlStyle = altStyle;
  }
  if (!egmLoaded) {
    let egm = loadEGM();
    if (egm) {
      egm.addEventListener('load', function () {
        exportKML();
      });
    }
    return;
  }

  const planes = selectedPlanes();
  const folders = [];
  for (let planeIndex = 0; planeIndex < planes.length; planeIndex++) {
    const plane = planes[planeIndex];
    let folder = ['Folder', {}, ['name', {}, `${(plane.registration || plane.icao).toUpperCase()} track`]];
    const coords = coordsForExport(plane);
    let sections = [];
    let currentSection = null;
    let lastGround = null;
    let lastC = null;
    for (let i in coords) {
      const c = coords[i];
      const ground = c.alt == 'ground';
      if (ground !== lastGround) {
        // when changing between airborne and ground, create new section
        if (lastC && currentSection) {
          // double up last coordinate to work around strange google earth transparency
          currentSection.coords.push(lastC);
        }
        currentSection = { ground: ground, coords: [] };
        sections.push(currentSection);
      }
      lastGround = ground;
      if (ground) {
        c.alt = 0; // set KML altitude to zero
      }
      currentSection.coords.push(c);
      lastC = c;
    }
    if (lastC && currentSection) {
      // double up last coordinate to work around strange google earth transparency
      currentSection.coords.push(lastC);
    }
    for (let i in sections) {
      console.log('section ' + i);
      const s = sections[i];
      const coords = s.coords;
      const ground = s.ground;
      const whenObjs = coords.map((c) => {
        const date = `${c.ts.getUTCFullYear()}-${zeroPad(c.ts.getUTCMonth() + 1, 2)}-${zeroPad(c.ts.getUTCDate(), 2)}`;
        const time = `T${zeroPad(c.ts.getUTCHours(), 2)}:${zeroPad(c.ts.getUTCMinutes(), 2)}:${zeroPad(c.ts.getUTCSeconds(), 2)}.${zeroPad(c.ts.getUTCMilliseconds(), 3)}Z`;
        return ['when', {}, date + time];
      });
      const coordObjs = coords.map((c) => {
        return ['gx:coord', {}, `${c.pos[0]} ${c.pos[1]} ${c.alt}`];
      });
      // splice together the xml track with / without altitude mode
      // clamptoground is google earth default while other programs error on having that option set specifically
      // so let google earth default to clamp to ground for ground track
      let xmlTrack = ['gx:Track', {}];
      if (!ground) {
        xmlTrack.push(['altitudeMode', {}, 'absolute']);
      }
      xmlTrack = xmlTrack.concat([['extrude', {}, ground ? '0' : '1'], ...whenObjs, ...coordObjs]);
      folder.push([
        'Placemark',
        {},
        ['name', {}, (plane.registration || plane.icao).toUpperCase()],
        [
          'Style',
          {},
          ['LineStyle', {}, ['color', {}, RGBColorToKMLColor(EXPORT_RGB_COLORS[planeIndex % EXPORT_RGB_COLORS.length])], ['width', {}, 4]],
          ['IconStyle', {}, ['Icon', {}, ['href', {}, 'http://maps.google.com/mapfiles/kml/shapes/airports.png']]],
        ],
        xmlTrack,
      ]);
    }
    folders.push(folder);
  }
  const filename = baseExportFilenameForAircrafts(planes);
  const prologue = '<?xml version="1.0" encoding="UTF-8"?>\n';
  const xmlObj = [
    'kml',
    {
      xmlns: 'http://www.opengis.net/kml/2.2',
      'xmlns:gx': 'http://www.google.com/kml/ext/2.2',
    },
    ['Folder', {}, ...folders],
  ];
  const xml = prologue + hiccup(xmlObj);
  let styleName = '';
  if (kmlStyle == 'geom') {
    styleName = 'EGM96';
  }
  if (kmlStyle == 'geom_avg') {
    styleName = 'EGM96_avg';
  }
  if (kmlStyle == 'baro') {
    styleName = 'press_alt_uncorrected';
  }
  //console.log(kmlStyle + ' ' + styleName);
  download(filename + '-track-' + styleName + '.kml', 'application/vnd.google-earth.kml+xml', xml);
}

function deleteTraces() {
  for (let i in g.planesOrdered) {
    let plane = g.planesOrdered[i];
    delete plane.recentTrace;
    delete plane.fullTrace;
  }
}

function setPictureVisibility() {
  showPictures = planespottersAPI || planespottingAPI;
  if (showPictures) {
    jQuery('#photo_container').removeClass('hidden');
  } else {
    jQuery('#photo_container').addClass('hidden');
  }
  if (planespottersLinks && !showPictures) {
    jQuery('#photoLinkRow').removeClass('hidden');
  } else {
    jQuery('#photoLinkRow').addClass('hidden');
  }
}

// just an idea, unused
let infoBits = {
  type: {
    head: 'Type:',
    title: '4 character ICAO type code (i.e.: A320,B738,G550)',
    value: function (plane) {
      return plane.icaoType || 'n/a';
    },
  },
};

function geoFindEnabled() {
  return (
    !disableGeoLocation && !SiteOverride && (globeIndex || uuid || askLocation) && window && window.location && window.location.protocol == 'https:'
  );
}

function _printTrace(trace) {
  for (let i = 0; i < trace.length; i++) {
    const state = trace[i];
    const timestamp = state[0];
    let stale = state[6] & 1;
    const leg_marker = state[6] & 2;
    console.log(
      zuluTime(new Date(timestamp * 1000)) +
        ' ' +
        (state[1] + ',' + state[2]).padStart(26, ' ') +
        ' ' +
        String(state[3]).padStart(6, ' ') +
        ' ' +
        state[6]
    );
  }
}

function printTrace() {
  console.log('full trace');
  _printTrace(SelectedPlane.fullTrace.trace);
  console.log('recent trace');
  _printTrace(SelectedPlane.recentTrace.trace);
}

function copyShareLink() {
  navigator.clipboard.writeText(shareLink);

  copyLinkTime = new Date().getTime();
  copiedIcao = SelectedPlane.icao;
  setSelectedIcao();
}

let copyLinkTime = 0;
let copiedIcao = null;

function setSelectedIcao() {
  const selected = SelectedPlane;
  if (selected.icao == selIcao && copiedIcao == null) {
    return;
  }
  selIcao = selected.icao;
  let hex_html = "<span style='font-family: monospace;' class=identSmall>Hex:" + NBSP + selected.icao.toUpperCase() + '</span>';
  if (globeIndex || shareBaseUrl) {
    if (copiedIcao && (copiedIcao != selected.icao || new Date().getTime() - copyLinkTime > 2000)) {
      copiedIcao = null;
    }
    let copy_link_text = copiedIcao != null ? 'Copied' : 'Copy' + NBSP + 'Link';
    let icao_link =
      '<span  class=identSmall><a class=\'link identSmall\' target="_blank" href="' +
      shareLink +
      '" onclick="copyShareLink(); return false;">' +
      copy_link_text +
      '</a></span>';
    hex_html = hex_html + NBSP + NBSP + NBSP + icao_link;
  }
  jQuery('#selected_icao').html(hex_html);

  jQuery('a.identSmall').prop('href', shareLink);
}

function mapTypeSettings() {
  if (MapType_tar1090.startsWith('maptiler_sat') || MapType_tar1090.startsWith('maptiler_hybrid')) {
    layerDimFactor = 0.25;
  } else if (MapType_tar1090 == 'esri') {
    layerDimFactor = 0.5;
  } else if (MapType_tar1090 == 'gibs') {
    layerDimFactor = 0.5;
  } else if (MapType_tar1090.startsWith('carto_raster')) {
    layerDimFactor = 0.7;
    layerExtraContrast = 0.6;
  } else if (MapType_tar1090.startsWith('carto_light')) {
    layerDimFactor = 0.8;
    layerExtraContrast = 0.2;
  } else if (MapType_tar1090.startsWith('carto_dark')) {
    layerDimFactor = 0.25;
    layerExtraContrast = 0.05;
  } else {
    layerDimFactor = 1;
    layerExtraContrast = 0;
  }
}

function getViewOversize(factor) {
  factor || (factor = 1);
  let mapSize = OLMap.getSize();
  let size = [mapSize[0] * factor, mapSize[1] * factor];
  return myExtent(OLMap.getView().calculateExtent(size));
}

function getRenderExtent(extra) {
  extra || (extra = 0);
  const mapSize = OLMap.getSize();
  const over = renderBuffer + extra;
  const size = [mapSize[0] + over, mapSize[1] + over];
  return myExtent(OLMap.getView().calculateExtent(size));
}

function requestBoxString() {
  if (!mapIsVisible && lastRequestBox) {
    return lastRequestBox;
  }
  let extent = getRenderExtent(80);
  let minLon = extent.minLon.toFixed(6);
  let maxLon = extent.maxLon.toFixed(6);
  if (Math.abs(extent.extent[2] - extent.extent[0]) > 40075016) {
    // all longtitudes in view
    ((minLon = -180), (maxLon = 180));
  }
  return `${extent.minLat.toFixed(6)},${extent.maxLat.toFixed(6)},${minLon},${maxLon}`;
}

if (aggregator && window.location.hostname.startsWith('inaccurate')) {
  jQuery('#inaccurate_warning').removeClass('hidden');
  document.getElementById('inaccurate_warning').innerHTML = `
<br>
This map includes inaccurate / very approximate positions, errors of 200 nmi or more are not unusual.
<br>
If no ADS-B / MLAT info is available but at least 1 receiver is receiving ModeS data from a hex, the aircraft is placed where the receiving station on average receives planes which do have a location.
<br>
Please add a disclaimer to any screenshots of this website or better yet just report that an aircraft was spotted in the approximate area WITHOUT using screenshots.
<br>
<br>
        `;
}

function getn(n) {
  limitUpdates = n;
  RefreshInterval = 0;
  fetchCalls = 0;
}

function onAltimeterSetStandard(e) {
  e.preventDefault();
  jQuery('#altimeter_input').val(1013.25);
  onAltimeterChange(e);
}
function onAltimeterSetSelected(e) {
  e.preventDefault();
  if (!SelectedPlane || !SelectedPlane.nav_qnh) {
    return;
  }
  jQuery('#altimeter_input').val(SelectedPlane.nav_qnh);
  onAltimeterChange(e);
}
function onAltimeterChange(e) {
  e.preventDefault();
  jQuery('#altimeter_input').blur();
  let altimeter = parseFloat(jQuery('#altimeter_input').val().trim());

  if (altimeter < 100) {
    // assume inHg, convert to mbar
    baroCorrectQNH = 33.8639 * altimeter;
  } else {
    // assume mbar / hPa
    baroCorrectQNH = altimeter;
  }

  remakeTrails();
  refreshSelected();
  refreshFeatures();
  TAR.planeMan.redraw();
  refresh();
}

// Using formula from: https://www.weather.gov/media/epz/wxcalc/pressureAltitude.pdf
// See also: https://en.wikipedia.org/wiki/Pressure_altitude
// Inverse equation on wikipedia seems imprecise,
// used the the weather.gov pdf and inverted the equation myself
// This uses ISA atmosphere (should be the same as altimeters in planes)
function adjust_baro_alt(alt) {
  if (!baroUseQNH || alt == null || alt == 'ground') {
    return alt;
  }
  let station_pressure = Math.pow(1 - alt / 145366.45, 5.2553026) * 1013.25;

  let res = (1 - Math.pow(station_pressure / baroCorrectQNH, 0.190284)) * 145366.45;
  return res;
}

parseURLIcaos();
initialize();
