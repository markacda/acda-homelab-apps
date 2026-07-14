function initHeatmap() {
  heatmap.init = false;
  if (heatFeatures.length == 0) {
    for (let i = 0; i < heatFeaturesSpread; i++) {
      heatFeatures.push(new ol.source.Vector());
      heatLayers.push(
        new ol.layer.Vector({
          name: 'heatLayer' + i,
          isTrail: true,
          source: heatFeatures[i],
          declutter: heatmap.declutter ? true : false,
          zIndex: 150,
          renderOrder: null,
          renderBuffer: 5,
        })
      );
      trailGroup.push(heatLayers[i]);
    }
  }
  realHeat = new ol.layer.Heatmap({
    source: realHeatFeatures,
    name: realHeat,
    isTrail: true,
    zIndex: 150,
    weight: (x) => heatmap.weight,
    radius: heatmap.radius,
    blur: heatmap.blur,
  });
  trailGroup.push(realHeat);
}

function setSize(set) {
  let count = 0;
  for (const i in set.values()) count++;
  return count;
}

function drawHeatmap() {
  if (!heatmap) return;
  if (heatmap.init) {
    initHeatmap();
  }

  console.time('drawHeat');

  let ext = myExtent(OLMap.getView().calculateExtent(OLMap.getSize()));
  let maxLat = ext.maxLat * 1000000;
  let minLat = ext.minLat * 1000000;

  webglFeatures.clear();
  for (let i = 0; i < heatFeaturesSpread; i++) heatFeatures[i].clear();
  realHeatFeatures.clear();

  let pointCount = 0;
  let features = [];
  if (lineStyleCache['scale'] != globalScale) {
    lineStyleCache = {};
    lineStyleCache['scale'] = globalScale;
  }
  let done = new Set();
  let iterations = 0;
  let maxIter = 1000 * 1000;

  let tempPoints = [];
  for (let k = 0; k < heatChunks.length; k++) {
    if (heatPoints[k] != null) {
      true; // do nothing
    } else if (heatChunks[k] != null) {
      if (heatChunks[k].byteLength % 16 != 0) {
        console.log('Invalid heatmap file (byteLength): ' + k);
        continue;
      }
      let points = (heatPoints[k] = new Int32Array(heatChunks[k]));
      let found = 0;
      for (let i = 0; i < points.length; i += 4) {
        if (points[i] == 0xe7f7c9d) {
          found = 1;
          break;
        }
      }
      if (!found) {
        heatPoints[k] = heatChunks[k] = null;
        console.log('Invalid heatmap file (magic number): ' + k);
      }
    } else {
      continue;
    }
    tempPoints.push(heatPoints[k]);
  }

  //console.log('tempPoints.length: ' + tempPoints.length);
  let myPoints = [];
  if (tempPoints.length <= 2) {
    myPoints = tempPoints;
  } else {
    let len = tempPoints.length;
    let arr1 = tempPoints.splice(0, Math.round(tempPoints.length / 3));
    let arr2 = tempPoints.splice(0, Math.round(tempPoints.length / 2));
    let arr3 = tempPoints;
    myPoints.push(arr2.splice(0, 1));
    myPoints.push(arr3.splice(0, 1));
    myPoints.push(arr1.splice(0, 1));
    len -= 3;
    for (let i = 0; i < Math.ceil(len / 3); i++) {
      myPoints.push(arr2.splice(0, 1));
      myPoints.push(arr3.splice(0, 1));
      myPoints.push(arr1.splice(0, 1));
    }
  }
  myPoints = myPoints.flat();

  //console.log('myPoints.length: ' + myPoints.length);

  let indexes = [];
  for (let k = 0; k < myPoints.length; k++) {
    let points = myPoints[k];
    let index = [];
    let i = 0;
    if (!points) continue;
    while (points[i] != 0xe7f7c9d && i < points.length) {
      index.push(points[i]);
      //console.log(points[i]);
      i += 4;
    }
    if (!heatmap.lines) index.sort((a, b) => Math.random() - 0.5);
    indexes.push(index);
  }

  let offsets = Array(myPoints.length).fill(0);

  while (pointCount < heatmap.max && done.size < myPoints.length && iterations++ < maxIter) {
    for (let k = 0; k < myPoints.length && pointCount < heatmap.max; k++) {
      if (offsets[k] > indexes[k].length) {
        continue;
      }
      if (offsets[k] == indexes[k].length) {
        done.add(k);
        offsets[k]++;
        continue;
      }

      let points = myPoints[k];
      let pointsU = new Uint32Array(points.buffer);

      let i = 4 * indexes[k][offsets[k]];

      if (points[i] == 0xe7f7c9d) i += 4;

      if (i < 0) {
        console.log('wat ' + i);
        break;
      }
      for (; i < points.length; i += 4) {
        if (points[i] == 0xe7f7c9d) break;
        let lat = points[i + 1];
        if (lat > maxLat || lat < minLat) continue;

        lat /= 1000000;
        let lon = points[i + 2] / 1000000;
        let pos = [lon, lat];

        if (!inView(pos, ext)) continue;

        let alt = points[i + 3] & 65535;
        if (alt & 32768) alt |= -65536;
        if (alt == -123) alt = 'ground';
        else if (alt == -124) alt = null;
        else alt *= 25;

        let gs = points[i + 3] >> 16;
        if (gs == -1) gs = null;
        else gs /= 10;

        if (PlaneFilter.enabled && altFiltered(alt)) continue;

        if (heatmap.filters) {
          let type = (pointsU[i] >> 27) & 0x1f;
          let dataSource;
          switch (type) {
            case 0:
              dataSource = 'adsb';
              break;
            case 1:
              dataSource = 'modeS';
              break;
            case 2:
              dataSource = 'adsr';
              break;
            case 3:
              dataSource = 'tisb';
              break;
            case 4:
              dataSource = 'adsc';
              break;
            case 5:
              dataSource = 'mlat';
              break;
            case 6:
              dataSource = 'other';
              break;
            case 7:
              dataSource = 'modeS';
              break;
            case 8:
              dataSource = 'adsb';
              break;
            case 9:
              dataSource = 'adsr';
              break;
            case 10:
              dataSource = 'tisb';
              break;
            case 11:
              dataSource = 'tisb';
              break;
            default:
              dataSource = 'unknown';
          }
          let hex = (pointsU[i] & 0xffffff).toString(16).padStart(6, '0');
          hex = pointsU[i] & 0x1000000 ? '~' + hex : hex;
          let plane = g.planes[hex] || new PlaneObject(hex);
          plane.dataSource = dataSource;
          if (plane.isFiltered()) {
            continue;
          }
        }

        pointCount++;
        //console.log(pos);

        alt = calcAltitudeRounded(alt);
        let projHere = ol.proj.fromLonLat(pos);
        let style = lineStyleCache[alt];
        let hsl = altitudeColor(alt);
        hsl[1] = hsl[1] * 0.85;
        hsl[2] = hsl[2] * 0.8;
        if (!style) {
          let col;
          if (heatmap.alpha == null) col = hslToRgb(hsl);
          else col = hslToRgb(hsl, heatmap.alpha);

          style = new ol.style.Style({
            image: new ol.style.Circle({
              radius: heatmap.radius * globalScale,
              fill: new ol.style.Fill({
                color: col,
              }),
            }),
            zIndex: i,
          });
          lineStyleCache[alt] = style;
        }
        let feat = new ol.Feature(new ol.geom.Point(projHere));
        if (webgl) {
          let rgb = hslToRgb(hsl, 'array');
          feat.set('r', rgb[0]);
          feat.set('g', rgb[1]);
          feat.set('b', rgb[2]);
        } else {
          feat.setStyle(style);
        }
        features.push(feat);
        //console.log(alt);
      }
      offsets[k] += 1;
    }
  }
  if (iterations >= maxIter) console.log('drawHeatmap: MAX_ITERATIONS!');
  //console.log(setSize(done));
  console.log('files: ' + myPoints.length + ', points drawn: ' + pointCount);
  if (heatmap.real) {
    realHeatFeatures.addFeatures(features);
  } else {
    if (webgl) {
      webglFeatures.addFeatures(features);
    } else {
      for (let i = 0; i < heatFeaturesSpread; i++) {
        heatFeatures[i].addFeatures(features.splice(0, pointCount / heatFeaturesSpread + 1));
        //console.log(features.length);
      }
    }
  }
  console.timeEnd('drawHeat');
  jQuery('#loader').hide();
}

function currentExtent(factor) {
  let size = OLMap.getSize();
  if (factor != null) size = [size[0] * factor, size[1] * factor];
  return myExtent(OLMap.getView().calculateExtent(size));
}

function replayDefaults(ts) {
  jQuery('#replayPlay').html('Pause');
  let playing = true;
  let speed = 30;
  if (usp.has('replaySpeed')) {
    speed = usp.getFloat('replaySpeed');
  }
  if (speed == 0) {
    speed = 30;
    playing = false;
  }
  if (usp.has('replayPaused')) {
    playing = false;
  }
  return {
    playing: playing,
    ts: ts,
    ival: 60 * 1000,
    speed: speed,
    dateText: zDateString(ts),
    hours: ts.getUTCHours(),
    minutes: ts.getUTCMinutes(),
  };
}

function replayClear() {
  clearTimeout(refreshId);
  reaper(true);
  refreshFilter();
  replayPlanes = {};
}

function replayGetChunk(ts) {
  let time = new Date(ts);
  let sDate = sDateString(time);
  let index = 2 * time.getUTCHours() + Math.floor(time.getUTCMinutes() / 30);
  let key = `${sDate} chunk ${index}`;
  let url = 'globe_history/' + sDate + '/heatmap/' + index.toString().padStart(2, '0') + '.bin.ttf';
  return { date: sDate, index: index, key: key, url: url };
}

function loadReplay(ts) {
  if (isNaN(ts.getTime())) {
    ts = new Date();
  }
  let lastAvailable = new Date();
  lastAvailable.setUTCMinutes(Math.floor(lastAvailable.getUTCMinutes() / 30) * 30);
  lastAvailable.setUTCSeconds(0);
  lastAvailable = lastAvailable.getTime() - 10 * 1000;
  if (ts.getTime() > lastAvailable) {
    ts = new Date(lastAvailable);
    ts.setUTCMinutes(Math.floor(ts.getUTCMinutes() / 30) * 30 + 1);
    ts.setUTCSeconds(0);
    console.log('not available, using this time: ' + ts);
    replayClear();
  }

  replay.ts = ts;
  replaySetTimeHint();

  if (!g.replayCache) {
    g.replayCache = new ItemCache(onMobile ? 12 : 24);
  }

  let chunk = replayGetChunk(ts);

  let rKey = chunk.key;
  let data = g.replayCache.get(rKey);

  if (data) {
    initReplay(chunk, data);
  } else {
    if (rKey == replay.loadingKey) {
      // console.log('if (rKey == replay.loadingKey) {');
      // download already in progress, do nothing
      return;
    }
    if (replay.abortController) {
      replay.abortController.abort();
    }

    replay.loadingKey = rKey;

    jQuery('#replayLoading').text('Loading ...');

    replay.abortController = new AbortController();

    jQuery('#update_error').css('display', 'none');
    clearTimeout(replay.errorTimeout);

    const ff = () => {
      //console.log(`finally ${rKey}`);
      delete replay.loadingKey;
      jQuery('#replayLoading').text('');
    };

    const errorFunc = (error) => {
      ff();
      if (error.name == 'AbortError') {
        //console.log(`aborted: ${rKey}`);
        return;
      }
      jQuery('#update_error_detail').text(error.message + ' --> No data for this timestamp!');
      jQuery('#update_error').css('display', 'block');
      replay.errorTimeout = setTimeout(() => {
        jQuery('#update_error').css('display', 'none');
      }, 5000);
    };

    fetch(chunk.url, { signal: replay.abortController.signal })
      .then((response) => {
        if (!response.ok) {
          throw new Error(`HTTP error, status = ${response.status}`);
        }
        response
          .arrayBuffer()
          .then((data) => {
            delete replay.abortController;
            g.replayCache.add(rKey, data);
            initReplay(chunk, data);
            //console.log(`loaded: ${rKey}`);
            ff();
          })
          .catch(errorFunc);
      }, errorFunc)
      .catch(errorFunc);
  }
}
function initReplay(chunk, data) {
  if (data.byteLength % 16 != 0) {
    console.log('Invalid heatmap file (byteLength)');
    return;
  }

  replay.loadedKey = chunk.key;

  let points = new Int32Array(data);
  let pointsU = new Uint32Array(data);
  let pointsU8 = new Uint8Array(data);
  let found = 0;
  replay.slices = [];
  for (let i = 0; i < points.length; i += 4) {
    if (points[i] == 0xe7f7c9d) {
      found = 1;
      replay.slices.push(i);
    }
  }
  if (!found) {
    console.log('Invalid heatmap file (magic number)');
    replay.points = null;
    replay.pointsU = null;
    replay.pointsU8 = null;
    return;
  }
  replay.points = points;
  replay.pointsU = pointsU;
  replay.pointsU8 = pointsU8;

  refreshFilter();

  replay.ival = (replay.pointsU[replay.slices[0] + 3] & 65535) / 1000;
  replay.halfHour = replay.ts.getUTCMinutes() >= 30 ? 1 : 0;
  let index = Math.round(((replay.ts.getUTCMinutes() % 30) * 60 + replay.ts.getUTCSeconds()) / replay.ival);
  //console.log("init with index" + replay.index);
  if (index > 0) {
    if (false && index > 1) {
      replay.index = 0;
      replayStep('fast');
    }
    replay.index = index - 1;
    replayStep('fast');
  }
  replay.index = index;
  replayStep();
}

function setReplayTimeHint(date) {
  if (true || utcTimesHistoric) {
    jQuery('#replayDateHintLocal').html(TIMEZONE + ' Date: ' + lDateString(date));
    jQuery('#replayDateHint').html('' + zDateString(date));
    jQuery('#replayTimeHint').html('UTC:' + NBSP + zuluTime(date) + ' / ' + TIMEZONE + ':' + NBSP + localTime(date));
  } else {
    jQuery('#replayDateHintLocal').html('');
    jQuery('#replayDateHint').html('Date: ' + lDateString(date));
    jQuery('#replayTimeHint').html('Time: ' + localTime(date) + NBSP + TIMEZONE);
  }
}
function replayOnSliderMove() {
  clearTimeout(refreshId);

  let date = new Date(replay.dateText);
  date.setUTCHours(Number(replay.hours));
  date.setUTCMinutes(Number(replay.minutes));
  replay.seconds = 0;
  date.setUTCSeconds(Number(replay.seconds));

  setReplayTimeHint(date);
}
let replayJumpEnabled = true;
function replayJump() {
  if (!showingReplayBar) return;
  if (!replayJumpEnabled) return;
  let date = new Date(replay.dateText);
  date.setUTCHours(Number(replay.hours));
  date.setUTCMinutes(Number(replay.minutes));
  date.setUTCSeconds(Number(replay.seconds));

  let ts = new Date(replay.ts.getTime());

  // diff less 10 seconds
  if (Math.abs(date.getTime() - ts.getTime()) < 10000) {
    return;
  }
  //console.log(replay.minutes.toString() + ' ' + ts.toString() + ' ' + (date.getTime() - ts.getTime()).toString());

  //console.trace();
  console.log('jump: ' + date.toUTCString());

  replayClear();
  loadReplay(date);
}
function replaySetTimeHint(arg) {
  replayJumpEnabled = false;
  let dateString;
  let timeString;

  dateString = zDateString(replay.ts);
  timeString = zuluTime(replay.ts) + NBSP + 'Z';

  setReplayTimeHint(replay.ts);

  if (replay.datepickerDate != dateString) {
    replay.datepickerDate = dateString;
    jQuery('#replayDatepicker').datepicker('setDate', dateString);
  }

  let hours = replay.ts.getUTCHours();
  jQuery('#hourSelect').slider('option', 'value', hours);

  let minutes = replay.ts.getUTCMinutes();
  jQuery('#minuteSelect').slider('option', 'value', minutes);
  replayJumpEnabled = true;
}

function replayStep(arg) {
  if (!replay || showTrace) {
    return;
  }
  if (replay.loadedKey != replayGetChunk(replay.ts).key) {
    console.error("no data loaded for current timestamp, can't play!");
    return;
  }

  if (replay.playing) {
    clearTimeout(refreshId);
    refreshId = setTimeout(replayStep, (replay.ival / replay.speed) * 1000);
  }

  if (isNaN(replay.ts.getTime())) {
    loadReplay(new Date());
    return;
  }
  let index = replay.index;
  if (index >= replay.slices.length) {
    console.log('next half hour');
    let date = new Date(replay.ts.getTime() + 30 * 60 * 1000);
    date.setUTCMinutes(Math.floor(date.getUTCMinutes() / 30) * 30);
    date.setUTCSeconds(0);
    clearTimeout(refreshId);
    loadReplay(date);
    return;
  }

  let minutes = replay.halfHour * 30 + Math.floor((replay.ival * index) / 60);
  let seconds = (replay.ival * index) % 60;
  //console.log(minutes.toString() + ' ' + seconds.toString());
  replay.ts.setUTCMinutes(minutes);
  replay.ts.setUTCSeconds(seconds);

  replay.hours = replay.ts.getUTCHours();
  replay.minutes = minutes;
  replay.seconds = seconds;

  let points = replay.points;
  let pointsU = replay.pointsU;
  let i = replay.slices[index];

  //console.log('index: ' + index + ', i: ' + i);

  last = now;
  now = replay.pointsU[i + 2] / 1000 + replay.pointsU[i + 1] * 4294967.296;
  g.now = now;

  traceOpts.endStamp = now + replay.ival;

  replay.ival = (replay.pointsU[i + 3] & 65535) / 1000;

  if (arg != 'fast') {
    replaySetTimeHint();
    if (replay.addressMinutes != replay.minutes) {
      replay.addressMinutes = replay.minutes;
      updateAddressBar();
    }
    //console.log(replay.ts.toUTCString());
    if (now - lastReap > 60) {
      reaper();
    }
  }

  i += 4;

  let ext;
  if (g.zoomLvl > 10) {
    ext = currentExtent(1.6);
  } else if (g.zoomLvl > 8) {
    ext = currentExtent(1.2);
  } else {
    ext = currentExtent(1.1);
  }
  ext.maxLat *= 1e6;
  ext.maxLon *= 1e6;
  ext.minLat *= 1e6;
  ext.minLon *= 1e6;
  for (; i < points.length && points[i] != 0xe7f7c9d; i += 4) {
    let lat = points[i + 1];
    let lon = points[i + 2];
    let pos = [lon, lat];
    if (lat >= 1073741824) {
      let hex = (points[i] & ((1 << 24) - 1)).toString(16).padStart(6, '0');
      hex = points[i] & (1 << 24) ? '~' + hex : hex;
      let ac = { hex: hex, seen: 0, seen_pos: 0 };
      if (replay.pointsU8[4 * (i + 2)] != 0) {
        ac.flight = '';
        for (let j = 0; j < 8; j++) {
          ac.flight += String.fromCharCode(replay.pointsU8[4 * (i + 2) + j]);
        }
      }
      ac.squawk = (lat & 0xffff).toString(10).padStart(4, '0');
      if (!g.planes[hex]) {
        replayPlanes[hex] = ac;
        continue;
      }
      processAircraft(ac, false, false);
      continue;
    }
    if (!inView(pos, ext)) {
      continue;
    }

    lat /= 1e6;
    lon /= 1e6;
    pos = [lon, lat];

    let type = (pointsU[i] >> 27) & 0x1f;
    switch (type) {
      case 0:
        type = 'adsb_icao';
        break;
      case 1:
        type = 'adsb_icao_nt';
        break;
      case 2:
        type = 'adsr_icao';
        break;
      case 3:
        type = 'tisb_icao';
        break;
      case 4:
        type = 'adsc';
        break;
      case 5:
        type = 'mlat';
        break;
      case 6:
        type = 'other';
        break;
      case 7:
        type = 'mode_s';
        break;
      case 8:
        type = 'adsb_other';
        break;
      case 9:
        type = 'adsr_other';
        break;
      case 10:
        type = 'tisb_trackfile';
        break;
      case 11:
        type = 'tisb_other';
        break;
      case 12:
        type = 'mode_ac';
        break;
      default:
        type = 'unknown';
    }
    let hex = (pointsU[i] & 0xffffff).toString(16).padStart(6, '0');
    hex = pointsU[i] & 0x1000000 ? '~' + hex : hex;

    if (icaoFilter && !icaoFilter.includes(hex)) continue;

    let alt = points[i + 3] & 65535;
    if (alt & 32768) alt |= -65536;
    if (alt == -123) alt = 'ground';
    else if (alt == -124) alt = null;
    else alt *= 25;

    let gs = points[i + 3] >> 16;
    if (gs == -1) gs = null;
    else gs /= 10;

    let ac = {
      seen: 0,
      seen_pos: 0,
    };

    if (!g.planes[hex]) {
      const cached = replayPlanes[hex];
      if (cached) {
        ac = cached;
        //delete replayPlanes[hex];
      }
    }

    ac.hex = hex;
    ac.lat = lat;
    ac.lon = lon;
    ac.alt_baro = alt;
    ac.gs = gs;
    ac.type = type;

    processAircraft(ac, false, false);
  }

  if (arg != 'fast') {
    triggerRefresh = 1;
    checkMovement();
    checkRefresh();
  }
  replay.index = index + 1;
}

function updateIconCache() {
  let item;
  let tryAgain = [];
  while ((item = addToIconCache.pop())) {
    let svgKey = item[0];
    let element = item[1];
    if (iconCache[svgKey] != undefined) {
      continue;
    }
    if (!element) {
      element = new Image();
      element.src = item[2];
      item[1] = element;
      tryAgain.push(item);
      continue;
    }
    if (!element.complete) {
      console.log('moep');
      tryAgain.push(item);
      continue;
    }

    iconCache[svgKey] = element;
  }
  addToIconCache = tryAgain;
}

function getInactive() {
  return (new Date().getTime() - lastActive) / 1000;
}

function active() {
  lastActive = new Date().getTime();
}

function drawTileBorder(data) {
  let southWest = ol.proj.fromLonLat([data.west, data.south]);
  let south180p = ol.proj.fromLonLat([180, data.south]);
  let south180m = ol.proj.fromLonLat([-180, data.south]);
  let southEast = ol.proj.fromLonLat([data.east, data.south]);
  let northEast = ol.proj.fromLonLat([data.east, data.north]);
  let north180p = ol.proj.fromLonLat([180, data.north]);
  let north180m = ol.proj.fromLonLat([-180, data.north]);
  let northWest = ol.proj.fromLonLat([data.west, data.north]);
  const estimateStyle = new ol.style.Style({
    stroke: new ol.style.Stroke({
      color: '#303030',
      width: 1.5,
    }),
  });
  if (data.west < data.east) {
    let tile = new ol.geom.LineString([southWest, southEast, northEast, northWest, southWest]);
    let tileFeature = new ol.Feature(tile);
    tileFeature.setStyle(estimateStyle);
    siteCircleFeatures.addFeature(tileFeature);
  } else {
    let west = new ol.geom.LineString([south180p, southWest, northWest, north180p]);
    let east = new ol.geom.LineString([south180m, southEast, northEast, north180m]);
    let westF = new ol.Feature(west);
    let eastF = new ol.Feature(east);
    westF.setStyle(estimateStyle);
    eastF.setStyle(estimateStyle);
    siteCircleFeatures.addFeature(westF);
    siteCircleFeatures.addFeature(eastF);
  }
}

function updateMessageRate(data) {
  if (data.messageRate && data.messageRate > 0) {
    MessageRate = data.messageRate;
  } else if (data.messages && data.messages > 1) {
    // Detect stats reset
    if (MessageCountHistory.length > 0 && MessageCountHistory[MessageCountHistory.length - 1].messages > data.messages) {
      MessageCountHistory = [];
    }

    // Note the message count in the history
    MessageCountHistory.push({ time: data.now, messages: data.messages });

    if (MessageCountHistory.length > 1) {
      // .. and clean up any old values
      while (now - MessageCountHistory[0].time > 10.5) {
        MessageCountHistory.shift();
      }
      let message_time_delta = MessageCountHistory[MessageCountHistory.length - 1].time - MessageCountHistory[0].time;
      let message_count_delta = MessageCountHistory[MessageCountHistory.length - 1].messages - MessageCountHistory[0].messages;
      if (message_time_delta > 0) {
        MessageRate = message_count_delta / message_time_delta;
      }
      //console.log(message_time_delta);
    }
  } else if (uuid != null && data.messages == 1) {
    const cache = uuidCache[data.urlIndex] || { now: 0 };
    let time_delta = now - cache.now;
    if (time_delta > 0.5) {
      let newCache = (uuidCache[data.urlIndex] = { now: now });
      let message_delta = 0;
      let acs = data.aircraft;
      for (let j = 0; j < acs.length; j++) {
        const hex = acs[j].hex;
        const messages = acs[j].messages;
        let cachedMessages = cache[hex];
        if (cachedMessages) {
          message_delta += messages - cachedMessages;
        }
        newCache[hex] = messages;
      }
      newCache.rate = message_delta / time_delta;
    }
    MessageRate = 0;
    for (let i in uuidCache) {
      const c = uuidCache[i];
      MessageRate += c ? c.rate : 0;
    }
  } else {
    MessageRate = null;
  }
}
function playReplay(state) {
  if (!replay) {
    return;
  }
  if (state) {
    if (replay.loadedKey != replayGetChunk(replay.ts).key) {
      console.error("no data loaded for current timestamp, can't play!");
      return;
    }
    replay.playing = true;
    jQuery('#replayPlay').html('Pause');
    replayStep();
  } else {
    replay.playing = false;
    jQuery('#replayPlay').html('Play');
    clearTimeout(refreshId);
  }
}

function showReplayBar() {
  console.log('showReplayBar()');
  showingReplayBar = !showingReplayBar;
  if (!showingReplayBar) {
    jQuery('#replayBar').hide();
    replay = null;
    jQuery('#map_canvas').height('100%');
    jQuery('#sidebar_canvas').height('100%');
    jQuery('#selected_showTrace_hide').show();
  } else {
    jQuery('#replayBar').show();
    jQuery('#replayBar').css('display', 'grid');
    jQuery('#replayBar').height('100px');
    jQuery('#map_canvas').height('calc(100% - 100px)');
    jQuery('#sidebar_canvas').height('calc(100% - 110px)');
    if (!replay) {
      replay = replayDefaults(new Date());
      replay.playing = false;
    }
    //ts.setUTCMinutes((parseInt((ts.getUTCMinutes() + 7.5)/15) * 15) % 60);
    let datepickerOptions = {
      maxDate: '+1d',
      dateFormat: 'yy-mm-dd',
      autoSize: true,
      onSelect: function (dateText) {
        replay.dateText = dateText;
        replayJump();
      },
    };
    if (onMobile) {
      datepickerOptions.onClose = function (dateText, inst) {
        jQuery('replayDatepicker').attr('disabled', false);
      };
      datepickerOptions.beforeShow = function (input, inst) {
        jQuery('replayDatepicker').attr('disabled', true);
      };
    } else {
      //
    }

    jQuery('#replayDatepicker').datepicker(datepickerOptions);

    jQuery('#hourSelect').slider({
      step: 1,
      min: 0,
      max: 23,
      slide: function (event, ui) {
        replay.hours = ui.value;
        replayOnSliderMove();
      },
      change: function () {
        replayJump();
      },
    });
    jQuery('#minuteSelect').slider({
      step: 1,
      min: 0,
      max: 59,
      slide: function (event, ui) {
        replay.minutes = ui.value;
        replayOnSliderMove();
      },
      change: function () {
        replayJump();
      },
    });
    const slideBase = 3.0;
    jQuery('#replaySpeedSelect').slider({
      value: Math.pow(replay.speed, 1 / slideBase),
      step: 0.07,
      min: Math.pow(1, 1 / slideBase),
      max: Math.pow(1000, 1 / slideBase),
      slide: function (event, ui) {
        replay.speed = Math.pow(ui.value, slideBase).toFixed(1);
        jQuery('#replaySpeedHint').text('Speed: ' + replay.speed + 'x');
      },
      change: function (event, ui) {
        replayStep();
      },
    });
    jQuery('#replaySpeedHint').text('Speed: ' + replay.speed + 'x');

    jQuery('#selected_showTrace_hide').hide();
  }
}

function timeoutFetch() {
  console.log('timeoutFetch ' + localTime(new Date()));
  fetchData();
  if (timers.timeoutFetch) {
    clearTimeout(timers.checkMove);
  }
  timers.timeoutFetch = setTimeout(timeoutFetch, Math.max(RefreshInterval, 10000));
  if (now - lastReap > 120) {
    reaper();
  }
}

function refreshHistory() {
  if (heatmap || replay || globeIndex || pTracks || uuid || !HistoryChunks) {
    noLongerHidden();
    return;
  }

  if (1 && (new Date().getTime() - g.hideStamp) / 1000 < 5) {
    console.log('short tab change, not loading history');
    noLongerHidden();
    return;
  }

  jQuery('#loader_progress').attr('value', 0);

  setTimeout(() => {
    if (!timersActive) {
      jQuery('#loader').show();
    }
  }, 200);

  chunksDefer()
    .done(function (data) {
      console.log(localTime(new Date()) + ' tab change, loading history');
      g.refreshHistory = true;
      HistoryChunks = true;
      chunkNames = [];
      jQuery('#loader_progress').attr('value', 1);
      try {
        for (let i = data.chunks.length - 1; i >= 0; i--) {
          let f = data.chunks[i];
          chunkNames.push(f);

          // break after we found a chunk that's older than now
          // chunk timestamp is the start of its data, not the end
          // so we need to include the first chunk that's older
          // which is done above

          let parts = f.split('.')[0].split('_');
          if (parts[0] == 'chunk') {
            if (now > parts[1] / 1e3) {
              break;
            }
          }
        }
        //console.log(chunkNames);
        nHistoryItems = chunkNames.length;
        get_history();
        push_history();
      } catch (e) {
        console.error(e);
        noLongerHidden();
      }
    })
    .fail(function () {
      setTimeout(refreshHistory, 500);
    });
}

function handleVisibilityChange() {
  const prevHidden = tabHidden;
  if (document[hideName]) tabHidden = true;
  else tabHidden = false;

  if (tabHidden && timersActive) {
    g.hideStamp = new Date().getTime();
    clearIntervalTimers();
    if (!globeIndex) {
      //timeoutFetch();
    }

    replay_was_active = replay.playing;
    if (replay.playing) {
      playReplay(false);
    }
  }

  // tab is no longer hidden
  if (!tabHidden && !timersActive) {
    loadFinished && jQuery('#timers_paused').css('display', 'none');
    if (heatmap || replay || globeIndex || pTracks) {
      noLongerHidden();
    } else {
      refreshHistory();
    }
  }
}

function noLongerHidden() {
  active();
  setIntervalTimers();

  jQuery('#loader').hide();

  refresh();

  if (replay_was_active) {
    playReplay(true);
  }

  if (showTrace) return;
  if (heatmap) return;

  if (!haveTraces) return;

  let count = 0;
  if (multiSelect && !SelectedAllPlanes) {
    for (let i = 0; i < g.planesOrdered.length; ++i) {
      let plane = g.planesOrdered[i];
      if (plane.selected) {
        getTrace(plane, plane.icao, {});
        if (count++ > 20) break;
      }
    }
  } else if (SelectedPlane) {
    getTrace(SelectedPlane, SelectedPlane.icao, {});
  }
}

let hideName;
function initVisibilityChange() {
  // Set the name of the hidden property and the change event for visibility
  let visibilityChange;
  if (typeof document.hidden !== 'undefined') {
    // Opera 12.10 and Firefox 18 and later support
    hideName = 'hidden';
    visibilityChange = 'visibilitychange';
  } else if (typeof document.msHidden !== 'undefined') {
    hideName = 'msHidden';
    visibilityChange = 'msvisibilitychange';
  } else if (typeof document.webkitHidden !== 'undefined') {
    hideName = 'webkitHidden';
    visibilityChange = 'webkitvisibilitychange';
  }
  // Warn if the browser doesn't support addEventListener or the Page Visibility API
  if (typeof document.addEventListener === 'undefined' || hideName === undefined) {
    console.log('hidden tab handler requires a browser that supports the Page Visibility API.');
  } else {
    // Handle page visibility change
    document.addEventListener(visibilityChange, handleVisibilityChange, false);
  }
  handleVisibilityChange();
}
// for debugging visibilitychange:
function testHide() {
  Object.defineProperty(window.document, 'hidden', {
    get: function () {
      return true;
    },
    configurable: true,
  });
  Object.defineProperty(window.document, 'visibilityState', {
    get: function () {
      return 'hidden';
    },
    configurable: true,
  });
  window.document.dispatchEvent(new Event('visibilitychange'));
}
function testUnhide() {
  Object.defineProperty(window.document, 'hidden', {
    get: function () {
      return false;
    },
    configurable: true,
  });
  Object.defineProperty(window.document, 'visibilityState', {
    get: function () {
      return 'visible';
    },
    configurable: true,
  });
  window.document.dispatchEvent(new Event('visibilitychange'));
}

function autoSelectClosest() {
  if (!loadFinished) return;
  let closest = null;
  let closestDistance = null;
  checkMovement();
  for (let key in g.planesOrdered) {
    const plane = g.planesOrdered[key];
    if (!plane.visible) continue;
    if (!closest) closest = plane;
    if (plane.position == null || plane.seen_pos > 20) continue;
    let refLoc = [CenterLon, CenterLat];
    if (autoselectCoords && autoselectCoords.length == 2) {
      refLoc = [autoselectCoords[1], autoselectCoords[0]];
    }
    const dist = ol.sphere.getDistance(refLoc, plane.position);
    if (dist == null || isNaN(dist)) continue;
    if (closestDistance == null || dist < closestDistance) {
      closestDistance = dist;
      closest = plane;
    }
  }
  if (!closest) return;
  selectPlaneByHex(closest.icao, { noDeselect: true, follow: FollowSelected });
}
function setAutoselect() {
  clearInterval(timers.autoselect);
  if (!autoselect) return;
  timers.autoselect = window.setInterval(autoSelectClosest, 5000);
  autoSelectClosest();
}
function registrationLink(plane) {
  if (plane.country === 'Brazil') {
    return `https://sistemas.anac.gov.br/aeronaves/cons_rab_resposta_en.asp?textMarca=${plane.registration}`;
  } else {
    return '';
  }
}

//simple jquery plugin to only update the text when it changes
jQuery.fn.updateText = function (text) {
  this.text() !== String(text) && this.text(text);
};
