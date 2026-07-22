let lastSelected = null;
function deselect(plane) {
  if (!plane || !plane.selected) return;
  plane.selected = false;
  const index = SelPlanes.indexOf(plane);
  if (index > -1) {
    SelPlanes.splice(index, 1);
  }
  lastSelected = plane;
  if (plane == SelectedPlane) {
    if (SelPlanes.length > 0) {
      sp = SelectedPlane = SelPlanes[0];
    } else {
      sp = SelectedPlane = null;
    }
    refreshSelected();
  }

  // Trim the long (historical) trail loaded on selection back to the recent
  // window right away, instead of waiting for the next periodic trailReaper.
  if (!now) now = new Date().getTime() / 1000;
  plane.reapTrail();

  plane.updateTick('redraw');
  updateAddressBar();
}
let scount = 0;
function select(plane, options) {
  if (!plane) return;
  options = options || {};
  //console.log("select()", plane.icao, options);
  plane.selected = true;
  if (!SelPlanes.includes(plane)) SelPlanes.push(plane);

  sp = SelectedPlane = plane;
  updateAddressBar();
  refreshSelected();
  plane.updateTick('redraw');

  if (options.follow) {
    toggleFollow(true);
    if (!options.zoom) options.zoom = 'follow';
  } else {
    toggleFollow(false);
  }
}

function selectPlaneByHex(hex, options) {
  active();
  options = options || {};
  console.log(`SELECTING ${hex} follow: ${options.follow}`);
  //console.log("select: " + hex);
  // If SelectedPlane has something in it, clear out the selected
  if (SelectedAllPlanes) {
    deselectAllPlanes();
  }
  // already selected plane
  let oldPlane = SelectedPlane;
  // plane to be selected
  let newPlane = g.planes[hex];

  const multiDeselect = multiSelect && newPlane && newPlane.selected && !onlySelected;

  if (!options.noFetch && (globeIndex || showTrace || haveTraces) && hex) {
    newPlane = getTrace(newPlane, hex, options);
  }

  // If we are clicking the same plane, we are deselecting it unless noDeselect is specified
  if (oldPlane == newPlane && (options.noDeselect || showTrace)) {
    oldPlane = null;
  } else {
    if (multiSelect) {
      // multiSelect deselect
      if (multiDeselect) {
        deselect(newPlane);
        newPlane = null;
        hex = null;
      }
    } else if (oldPlane) {
      // normal deselect
      if (oldPlane != newPlane) {
        deselect(oldPlane);
        oldPlane = null;
      }
      if (oldPlane == newPlane) {
        console.log('oldplane == newplane');
        deselect(newPlane);
        oldPlane = null;
        newPlane = null;
        hex = null;
      }
    }
  }

  // Assign the new selected
  select(newPlane, options);

  if (!newPlane) {
    toggleFollow(false);
  }

  if (options.zoom == 'follow') {
    //if (OLMap.getView().getZoom() < 8)
    //    OLMap.getView().setZoom(8);
  } else if (options.zoom) {
    OLMap.getView().setZoom(options.zoom);
  }

  pTracks || TAR.planeMan.refresh();

  return newPlane !== undefined;
}

// loop through the planes and mark them as selected to show the paths for all planes
function selectAllPlanes() {
  HighlightedPlane = null;
  // if all planes are already selected, deselect them all
  if (SelectedAllPlanes) {
    deselectAllPlanes();
    return;
  }
  buttonActive('#T', true);
  // If SelectedPlane has something in it, clear out the selected
  if (SelectedPlane) deselect(SelectedPlane);

  toggleIsolation('off');

  SelectedAllPlanes = true;

  // disable this for the moment
  if (0 && globeIndex) {
    for (let i in g.planesOrdered) {
      let plane = g.planesOrdered[i];
      if (plane.visible && plane.inView) {
        plane.processTrace();
      }
    }
  }
  refreshFeatures();

  refreshSelected();
  refreshHighlighted();
  pTracks || TAR.planeMan.refresh();
}

// deselect all the planes
function deselectAllPlanes(keepMain) {
  if (showTrace && !keepMain) return;
  if (!multiSelect && SelectedPlane) toggleIsolation('off');

  clearTimeout(getTraceTimeout);

  if (SelectedAllPlanes) {
    buttonActive('#T', false);
    jQuery('#selectall_checkbox').removeClass('settingsCheckboxChecked');
    SelectedAllPlanes = false;
    refreshFilter();
    return;
  }

  let bounce = [];
  for (let i in SelPlanes) {
    const plane = SelPlanes[i];
    if (keepMain && plane == SelectedPlane) continue;
    bounce.push(plane);
  }
  for (let i in bounce) {
    deselect(bounce[i]);
  }
  refreshFilter();
  updateAddressBar();
}

function toggleFollow(override) {
  if (override == true) FollowSelected = true;
  else if (override == false) FollowSelected = false;
  else FollowSelected = !FollowSelected;

  traceOpts.follow = FollowSelected;

  if (FollowSelected) {
    if (!SelectedPlane || !SelectedPlane.position) FollowSelected = false;
  }
  if (FollowSelected) {
    //if (override == undefined && OLMap.getView().getZoom() < 8)
    //    OLMap.getView().setZoom(8);
    SelectedPlane.setProjection('follow');
  }
  buttonActive('#F', FollowSelected);
}

function resetMap() {
  geoFindMe().always(function () {
    if (SitePosition) {
      CenterLon = SiteLon;
      CenterLat = SiteLat;
    } else {
      CenterLon = DefaultCenterLon;
      CenterLat = DefaultCenterLat;
    }
    // Reset loStore values and map settings
    lopaStore['CenterLat'] = CenterLat;
    lopaStore['CenterLon'] = CenterLon;
    //lopaStore['zoomLvl']   = g.zoomLvl = DefaultZoomLvl;

    // Set and refresh
    //OLMap.getView().setZoom(g.zoomLvl);

    //console.log('resetMap setting center ' + [CenterLat, CenterLon]);
    OLMap.getView().setCenter(ol.proj.fromLonLat([CenterLon, CenterLat]));
    OLMap.getView().setRotation(g.mapOrientation);

    //selectPlaneByHex(null,false);
    jQuery('#update_error').css('display', 'none');
  });
}

function updateMapSize() {
  if (OLMap) OLMap.updateSize();
}

function expandSidebar(e) {
  e.preventDefault();
  jQuery('#map_container').hide();
  mapIsVisible = false;
  jQuery('#toggle_sidebar_control').hide();
  jQuery('#splitter').hide();
  jQuery('#shrink_sidebar_button').show();
  jQuery('#sidebar_container').width('100%');
  TAR.planeMan.redraw();
  updateMapSize();
  adjustInfoBlock();
}

function showMap() {
  jQuery('#sidebar_container').width(loStore['sidebar_width']).css('margin-left', '0');
  jQuery('#map_container').show();
  mapIsVisible = true;
  jQuery('#toggle_sidebar_control').show();
  jQuery('#splitter').show();
  jQuery('#shrink_sidebar_button').hide();
  TAR.planeMan.redraw();
  updateMapSize();
}

let selectedPhotoCache = null;

function setPhotoHtml(source) {
  if (selectedPhotoCache == source) return;
  //console.log(source + ' ' + selectedPhotoCache);
  selectedPhotoCache = source;
  jQuery('#selected_photo').html(source);
}

function adjustInfoBlock() {
  if (wideInfoBlock) {
    infoBlockWidth = baseInfoBlockWidth + 40;
  } else {
    infoBlockWidth = baseInfoBlockWidth;
  }
  jQuery('#selected_infoblock').css('width', infoBlockWidth * globalScale + 'px');

  jQuery('.ol-scale-line').css('left', infoBlockWidth * globalScale + 8 + 'px');
  jQuery('#replayBar').css('left', infoBlockWidth * globalScale + 8 + 'px');

  if (SelectedPlane && toggles['enableInfoblock'].state) {
    if (!mapIsVisible) jQuery('#sidebar_container').css('margin-left', '140pt');
    //jQuery('#sidebar_canvas').css('margin-bottom', jQuery('#selected_infoblock').height() + 'px');
    //
    if (mapIsVisible && document.getElementById('map_canvas').clientWidth < parseFloat(jQuery('#selected_infoblock').css('width')) * 3) {
      jQuery('#selected_infoblock').css('height', '290px');
      jQuery('#selected_typedesc').parent().parent().hide();
    } else {
      jQuery('#selected_infoblock').css('height', '100%');
    }

    jQuery('#selected_infoblock').show();
  } else {
    if (!mapIsVisible) jQuery('#sidebar_container').css('margin-left', '0');
    //jQuery('#sidebar_canvas').css('margin-bottom', 0);

    jQuery('.ol-scale-line').css('left', '8px');
    jQuery('#replayBar').css('left', '0px');

    jQuery('#selected_infoblock').hide();
  }

  let photoWidth = document.getElementById('photo_container').clientWidth;
  let refWidth = infoBlockWidth * globalScale - 29;
  if (Math.abs(photoWidth / refWidth - 1) > 0.05) photoWidth = refWidth;

  jQuery('#airplanePhoto').css('width', photoWidth + 'px');
  jQuery('#selected_photo').css('width', photoWidth + 'px');

  if (showPictures) {
    if (planespottersAPI || planespottingAPI) {
      jQuery('#photo_container').css('height', photoWidth * 0.883 + 'px');
    } else {
      jQuery('#photo_container').css('height', '40px');
    }
  }
}

function initializeUnitsSelector() {
  // Get display unit preferences from local storage otherwise use value previously set defaults.js or config.js
  if (loStore.getItem('displayUnits')) {
    DisplayUnits = loStore['displayUnits'];
  }

  // Initialize drop-down
  jQuery('#units_selector').val(DisplayUnits).on('change', onDisplayUnitsChanged);

  jQuery('.altitudeUnit').text(get_unit_label('altitude', DisplayUnits));
  jQuery('.speedUnit').text(get_unit_label('speed', DisplayUnits));
  jQuery('.distanceUnit').text(get_unit_label('distance', DisplayUnits));
  jQuery('.verticalRateUnit').text(get_unit_label('verticalRate', DisplayUnits));
}

function onDisplayUnitsChanged(e) {
  loStore['displayUnits'] = DisplayUnits = e.target.value;

  TAR.altitudeChart.render();

  // Update filters
  updateAltFilter();

  // Refresh data
  refreshFilter();

  // Draw range rings
  drawSiteCircle();

  // Reset map scale line units
  OLMap.getControls().forEach(function (control) {
    if (control instanceof ol.control.ScaleLine) {
      control.setUnits(DisplayUnits);
    }
  });

  jQuery('.altitudeUnit').text(get_unit_label('altitude', DisplayUnits));
  jQuery('.speedUnit').text(get_unit_label('speed', DisplayUnits));
  jQuery('.distanceUnit').text(get_unit_label('distance', DisplayUnits));
  jQuery('.verticalRateUnit').text(get_unit_label('verticalRate', DisplayUnits));
  TAR.planeMan.redraw();

  remakeTrails();
  refreshSelected();
}

function onFilterByAltitude(e) {
  e.preventDefault();
  jQuery('#altitude_filter_min').blur();
  jQuery('#altitude_filter_max').blur();

  updateAltFilter();
  refreshFilter();
}

function filterGroundVehicles(switchFilter) {
  if (typeof loStore['groundVehicleFilter'] === 'undefined') {
    loStore['groundVehicleFilter'] = 'not_filtered';
  }
  let groundFilter = loStore['groundVehicleFilter'];
  if (switchFilter === true) {
    groundFilter = groundFilter === 'not_filtered' ? 'filtered' : 'not_filtered';
  }
  if (groundFilter === 'not_filtered') {
    jQuery('#groundvehicle_filter').addClass('settingsCheckboxChecked');
  } else {
    jQuery('#groundvehicle_filter').removeClass('settingsCheckboxChecked');
  }
  loStore['groundVehicleFilter'] = groundFilter;
  PlaneFilter.groundVehicles = groundFilter;
}

function filterBlockedMLAT(switchFilter) {
  if (typeof loStore['blockedMLATFilter'] === 'undefined') {
    loStore['blockedMLATFilter'] = 'not_filtered';
  }
  let blockedMLATFilter = loStore['blockedMLATFilter'];
  if (switchFilter === true) {
    blockedMLATFilter = blockedMLATFilter === 'not_filtered' ? 'filtered' : 'not_filtered';
  }
  if (blockedMLATFilter === 'not_filtered') {
    jQuery('#blockedmlat_filter').addClass('settingsCheckboxChecked');
  } else {
    jQuery('#blockedmlat_filter').removeClass('settingsCheckboxChecked');
  }
  loStore['blockedMLATFilter'] = blockedMLATFilter;
  PlaneFilter.blockedMLAT = blockedMLATFilter;
}

function buttonActive(id, state) {
  if (state) {
    jQuery(id).addClass('activeButton');
    jQuery(id).removeClass('inActiveButton');
  } else {
    jQuery(id).addClass('inActiveButton');
    jQuery(id).removeClass('activeButton');
  }
}

function toggleIsolation(state, noRefresh) {
  let prevState = onlySelected;
  if (showTrace && state !== 'on') return;
  onlySelected = !onlySelected;
  if (state === 'on') onlySelected = true;
  if (state === 'off') onlySelected = false;

  buttonActive('#I', onlySelected);

  if (prevState != onlySelected && noRefresh != 'noRefresh') refreshFilter();

  fetchData({ force: true });
}

function toggleMilitary() {
  onlyMilitary = !onlyMilitary;
  buttonActive('#U', onlyMilitary);

  refreshFilter();
  active();
  fetchData({ force: true });
}

function togglePersistence() {
  noVanish = !noVanish;
  //filterTracks = noVanish;

  buttonActive('#P', noVanish);

  remakeTrails();

  if (!noVanish) reaper();
  loStore['noVanish'] = noVanish;
  console.log('noVanish = ' + noVanish);

  refreshFilter();
}

function dim(evt) {
  try {
    let currentDimPercentage = mapDimPercentage * layerDimFactor;
    let currentContrastPercentage = mapContrastPercentage + layerExtraContrast;

    if (!toggles['MapDim'].state) {
      // slight dim even if disabled
      currentDimPercentage /= 4;
      currentContrastPercentage /= 4;
    }

    const dim = currentDimPercentage * (1 + 0.25 * toggles['darkerColors'].state);
    const contrast = currentContrastPercentage * (1 + 0.1 * toggles['darkerColors'].state);
    if (dim > 0.0001) {
      evt.context.globalCompositeOperation = 'multiply';
      evt.context.fillStyle = 'rgba(0,0,0,' + dim + ')';
      evt.context.fillRect(0, 0, evt.context.canvas.width, evt.context.canvas.height);
    } else if (dim < -0.0001) {
      evt.context.globalCompositeOperation = 'screen';
      console.log(evt.context.globalCompositeOperation);
      evt.context.fillStyle = 'rgba(255, 255, 255,' + -dim + ')';
      evt.context.fillRect(0, 0, evt.context.canvas.width, evt.context.canvas.height);
    }
    if (contrast > 0.0001) {
      evt.context.globalCompositeOperation = 'overlay';
      evt.context.fillStyle = 'rgba(0,0,0,' + contrast + ')';
      evt.context.fillRect(0, 0, evt.context.canvas.width, evt.context.canvas.height);
    } else if (contrast < -0.0001) {
      evt.context.globalCompositeOperation = 'overlay';
      evt.context.fillStyle = 'rgba(255, 255, 255,' + -contrast + ')';
      evt.context.fillRect(0, 0, evt.context.canvas.width, evt.context.canvas.height);
    }
    evt.context.globalCompositeOperation = 'source-over';
  } catch (error) {
    console.error(error);
  }
}
function invertMap(evt) {
  const ctx = evt.context;
  ctx.globalCompositeOperation = 'difference';
  ctx.fillStyle = 'white';
  ctx.globalAlpha = alpha; // alpha 0 = no effect 1 = full effect
  ctx.fillRect(0, 0, evt.ctx.canvas.width, ctx.canvas.height);
}
//
// Altitude Chart begin
//
(function (global, jQuery, TAR) {
  let altitudeChart = (TAR.altitudeChart = TAR.altitudeChart || {});

  function createLegendGradientStops() {
    const mapOffsetToAltitude = [
      [0.033, 500],
      [0.066, 1000],
      [0.126, 2000],
      [0.19, 4000],
      [0.253, 6000],
      [0.316, 8000],
      [0.38, 10000],
      [0.59, 20000],
      [0.79, 30000],
      [1, 40000],
    ];

    let stops = '';
    for (let i in mapOffsetToAltitude) {
      let map = mapOffsetToAltitude[i];
      const color = altitudeColor(map[1]);
      stops += '<stop offset="' + map[0] + '" stop-color="hsl(' + color[0] + ',' + color[1] + '%,' + color[2] + '%)" />';
    }
    return stops;
  }

  function createLegendUrl(data) {
    jQuery(data).find('#linear-gradient').html(createLegendGradientStops());

    const svg = jQuery('svg', data).prop('outerHTML');

    return 'url("data:image/svg+xml;base64,' + global.btoa(svg) + '")';
  }

  function loadLegend() {
    let baseLegend = DisplayUnits === 'metric' ? 'images/alt_legend_m.svg' : 'images/alt_legend_ft.svg';

    jQuery.get(baseLegend, function (data) {
      jQuery('#altitude_chart_button').css('background-image', createLegendUrl(data));
      jQuery('#altitude_chart').show();
    });
  }

  altitudeChart.render = function () {
    if (toggles['altitudeChart'].state) {
      runAfterLoad(loadLegend);
    } else {
      jQuery('#altitude_chart').hide();
    }
  };

  altitudeChart.init = function () {
    let chartOn = onMobile ? false : altitudeChartDefaultState;
    if (usp.has('altitudeChart')) {
      chartOn = Boolean(parseInt(usp.get('altitudeChart')));
    }
    new Toggle({
      key: 'altitudeChart',
      display: 'Altitude Chart',
      container: '#settingsRight',
      init: chartOn,
      setState: altitudeChart.render,
    });
  };

  return TAR;
})(window, jQuery, TAR || {});
//
// Altitude Chart end
//
