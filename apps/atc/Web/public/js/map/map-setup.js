function webglAddLayer() {
  let success = false;

  const icao = 'c0ffee';

  if (icaoFilter != null) {
    icaoFilter.push(icao);
  }

  processAircraft({ hex: icao, lat: CenterLat, lon: CenterLon, type: 'tisb_other', seen: 0, seen_pos: 0, alt_baro: 25000 });
  let plane = g.planes[icao];

  if (spritesDataURL) {
    spriteSrc = spritesDataURL;
  }
  //console.log(spriteSrc);
  try {
    let glStyle = {
      'icon-src': spriteSrc,
      'icon-color': ['color', ['get', 'r'], ['get', 'g'], ['get', 'b'], 1],
      'icon-size': [glIconSize, glIconSize],
      'icon-offset': ['array', ['get', 'sx'], ['get', 'sy']],
      'icon-rotation': ['get', 'rotation'],
      'icon-rotate-with-view': false,
      //'icon-scale': [ 'array', ['get', 'scale'], ['get', 'scale'] ],
      'icon-scale': ['abs', ['get', 'scale']],
    };
    if (heatmap) {
      glStyle = {
        'circle-radius': heatmap.radius * globalScale * 1.25,
        'circle-displacement': [0, 0],
        'circle-opacity': heatmap.alpha || webglIconOpacity,
        'circle-fill-color': ['color', ['get', 'r'], ['get', 'g'], ['get', 'b'], 1],
      };
    }

    webglLayer = new ol.layer.WebGLPoints({
      name: 'webglLayer',
      type: 'overlay',
      title: 'Aircraft pos. webGL',
      source: webglFeatures,
      declutter: false,
      zIndex: 200,
      style: glStyle,
      renderBuffer: renderBuffer,
    });
    if (!webglLayer) return false;
    if (loStore['webglTested'] != 'true' && !webglLayer.getRenderer()) {
      return false;
    }

    layers.push(webglLayer);

    webgl = true;

    // only test webgl once in every browser
    // after that assume that it's working

    if (loStore['webglTested'] != 'true') {
      plane.visible = true;
      plane.updateMarker();
      OLMap.renderSync();
    }

    loStore['webglTested'] = 'true';
    success = true;
  } catch (error) {
    try {
      layers.remove(webglLayer);
    } catch (error) {
      console.error(error);
    }
    console.error(error);
    success = false;
  }
  delete g.planes[plane.icao];
  g.planesOrdered.splice(g.planesOrdered.indexOf(plane), 1);
  plane.destroy();

  if (icaoFilter != null) {
    icaoFilter.pop(icao);
  }

  return success;
}

function webglInit() {
  let init = true;

  new Toggle({
    key: 'webgl',
    display: 'WebGL',
    container: '#settingsRight',
    init: init,
    setState: function (state) {
      if (state) {
        if (webglLayer) {
          webgl = true;
        } else {
          webgl = webglAddLayer();
        }

        if (!webgl) {
          console.error('Unable to initialize the webGL Layer! Falling back to non-webGL icons, performance will be reduced significantly!');
          webglLayer = null;
        }
        if (!webgl) return false;
        // returning false means the toggle will flip back as the activation of the webgl layer was unsuccessful.
      } else {
        webgl = false;
        if (loadFinished) {
          webglFeatures && webglFeatures.clear();
          for (let i in g.planesOrdered) {
            const plane = g.planesOrdered[i];
            delete plane.glMarker;
          }
        }
      }
      if (loadFinished) {
        refreshFilter();
        checkPointermove();
      }
    },
  });
}

function ol_map_init() {
  if (0) {
    let canvas = iconTest();
    spritesDataURL = canvas.toDataURL();
    jQuery('#iconTestCanvas').remove();
    console.log(spritesDataURL);
  }

  OLMap = new ol.Map({
    target: 'map_canvas',
    layers: layers_group,
    view: new ol.View({
      center: ol.proj.fromLonLat([CenterLon, CenterLat]),
      zoom: g.zoomLvl,
      multiWorld: true,
    }),
    controls: [
      new ol.control.Zoom({ delta: 1, duration: 0, target: 'map_canvas' }),
      new ol.control.Attribution({ collapsed: true }),
      new ol.control.ScaleLine({ units: DisplayUnits }),
    ],
    interactions: new ol.interaction.defaults({ altShiftDragRotate: false, pinchRotate: false }),
    maxTilesLoading: 4,
  });

  console.time('webglInit');
  webglInit();
  console.timeEnd('webglInit');

  let foundType = false;
  ol.control.LayerSwitcher.forEachRecursive(layers_group, function (lyr) {
    if (lyr.get('name') && lyr.get('type') == 'base') {
      if (MapType_tar1090 == lyr.get('name')) {
        foundType = true;
      }
    }
  });
  if (!foundType) {
    MapType_tar1090 = 'osm';
  }

  ol.control.LayerSwitcher.forEachRecursive(layers_group, function (lyr) {
    if (!lyr.get('name')) return;

    if (lyr.get('type') == 'base') {
      if (MapType_tar1090 == lyr.get('name')) {
        foundType = true;
        lyr.setVisible(true);

        mapTypeSettings();
        const onVisible = lyr.get('onVisible');
        onVisible && onVisible(lyr);
      } else {
        lyr.setVisible(false);
      }

      lyr.on('change:visible', function (evt) {
        if (evt.target.getVisible()) {
          MapType_tar1090 = loStore['MapType_tar1090'] = evt.target.get('name');
          mapTypeSettings();
          const onVisible = lyr.get('onVisible');
          onVisible && onVisible(lyr);
        }
      });
    } else if (lyr.get('type') === 'overlay') {
      if (
        loStore['layer_' + lyr.get('name')] == 'true' ||
        enableOverlays.indexOf(lyr.get('name')) >= 0 ||
        (loStore['layer_' + lyr.get('name')] != 'false' && defaultOverlays.indexOf(lyr.get('name')) >= 0)
      ) {
        lyr.setVisible(true);
      }
      if (loStore['layer_' + lyr.get('name')] == 'false') {
        lyr.setVisible(false);
      }

      lyr.on('change:visible', function (evt) {
        loStore['layer_' + evt.target.get('name')] = evt.target.getVisible();
      });
    }
  });

  if (!foundType) {
    ol.control.LayerSwitcher.forEachRecursive(layers_group, function (lyr) {
      if (foundType) return;
      if (lyr.get('type') === 'base') {
        lyr.setVisible(true);
        foundType = true;
      }
    });
  }

  OLProj = OLMap.getView().getProjection();
  OLProjExtent = OLProj.getExtent();

  OLMap.getView().setRotation(g.mapOrientation); // adjust orientation

  OLMap.addControl(
    new ol.control.LayerSwitcher({
      groupSelectStyle: 'none',
      activationMode: 'click', // click sucks in the current implementation
      target: 'map_canvas',
    })
  );

  OLMap.on('movestart', function (event) {
    if (webgl) {
      if (TrackedAircraftPositions > webglIconMapMoveOpacityCrowdedThreshold) {
        webglLayer.setOpacity(webglIconMapMoveOpacityCrowded);
      } else {
        webglLayer.setOpacity(webglIconMapMoveOpacity);
      }
    }
  });

  OLMap.on('moveend', function (event) {
    checkMovement();
    webgl && webglLayer.setOpacity(webglIconOpacity);
  });

  OLMap.on(['click', 'dblclick'], function (evt) {
    // A long-press just toggled a speed vector; swallow the trailing click.
    if (longPressFired) {
      longPressFired = false;
      evt.stopPropagation();
      return;
    }

    let trailHex = null;
    let trailTS = null;
    let planeHex = null;

    let source = webgl ? webglFeatures : PlaneIconFeatures;
    let evtCoords = evt.map.getCoordinateFromPixel(evt.pixel);
    let feature = source.getClosestFeatureToCoordinate(evtCoords);
    if (feature) {
      let fPixel = evt.map.getPixelFromCoordinate(feature.getGeometry().getCoordinates());
      let a = fPixel[0] - evt.pixel[0];
      let b = fPixel[1] - evt.pixel[1];
      let c = globalScale * (onMobile ? 30 : 20);
      if (a ** 2 + b ** 2 < c ** 2) {
        planeHex = feature.hex;
      } else {
        feature = null;
      }
    }

    // Distance-measure mode: taps drive the measurement instead of selecting.
    if (distanceMode) {
      if (planeHex && planeHex.indexOf('_vector') < 0) {
        let plane = g.planes[planeHex];
        if (plane && plane.position) {
          if (!distanceMeasurementState.isActive) {
            startDistanceMeasurement(plane);
          } else {
            completeDistanceMeasurement(plane);
          }
        }
      } else {
        // Tap empty space (or a non-plane feature) to clear the measurement.
        clearDistanceMeasurement();
      }
      evt.stopPropagation();
      return;
    }

    if (!planeHex || showTrace) {
      let features = [];
      let trailFeature = null;
      if (1) {
        for (const layer of trailGroup.getArray()) {
          if (!layer.getVisible()) {
            continue;
          }
          const source = layer.getSource();
          trailFeature = source.getClosestFeatureToCoordinate(evtCoords);
          if (trailFeature) {
            features.push(trailFeature);
          }
        }
      } else {
        // old variant, slower in most cases
        features = evt.map.getFeaturesAtPixel(evt.pixel, {
          layerFilter: function (layer) {
            return layer.get('isTrail') == true;
          },
          hitTolerance: globalScale * (onMobile ? 30 : 20),
        });
      }
      if (features.length > 0) {
        let hitTolerance = globalScale * (onMobile ? 30 : 20);
        // just rubber band to the closest trace for showTrace
        if (showTrace) {
          hitTolerance = 10000;
        }
        let close2 = hitTolerance * hitTolerance;
        let closest = null;
        for (let j in features) {
          let feature = features[j];
          let coords;
          if (feature.isLabel) coords = [feature.getGeometry().getCoordinates()];
          else coords = feature.getGeometry().getCoordinates();

          for (let k in coords) {
            let fPixel = evt.map.getPixelFromCoordinate(coords[k]);
            let a = fPixel[0] - evt.pixel[0];
            let b = fPixel[1] - evt.pixel[1];
            let distance2 = a ** 2 + b ** 2;
            if (distance2 < close2) {
              closest = feature;
              close2 = distance2;
            }
          }
        }
        if (closest) {
          if (showTrace) trailTS = closest.timestamp;
          else trailHex = closest.hex;
        }
      }
    }

    const dblclick = evt.type === 'dblclick' && !showTrace;

    if (showTrace && trailTS) {
      planeHex = null;
      gotoTime(trailTS);
    }
    //console.log(`planeHex: ${planeHex} trailHex: ${trailHex}`);
    if (planeHex) {
      selectPlaneByHex(planeHex, { noDeselect: dblclick, follow: dblclick });
    } else if (trailHex) {
      selectPlaneByHex(trailHex, { noDeselect: true });
    }

    if (!planeHex && !trailHex && !multiSelect && !showTrace) {
      if (onlySelected) toggleIsolation();
      deselect(SelectedPlane);
      refreshFilter();
    }
    evt.stopPropagation();
  });

  // Handle right-click (contextmenu) to toggle speed vector
  OLMap.on('contextmenu', function (evt) {
    evt.preventDefault(); // Prevent default browser context menu

    let planeHex = null;
    let source = webgl ? webglFeatures : PlaneIconFeatures;
    let evtCoords = evt.map.getCoordinateFromPixel(evt.pixel);
    let feature = source.getClosestFeatureToCoordinate(evtCoords);

    if (feature) {
      let fPixel = evt.map.getPixelFromCoordinate(feature.getGeometry().getCoordinates());
      let a = fPixel[0] - evt.pixel[0];
      let b = fPixel[1] - evt.pixel[1];
      let c = globalScale * (onMobile ? 30 : 20);
      if (a ** 2 + b ** 2 < c ** 2) {
        planeHex = feature.hex;
      }
    }

    if (planeHex && planeHex.indexOf('_vector') < 0) {
      // Right-click directly on a plane: toggle its speed vector.
      let plane = g.planes[planeHex];
      if (plane) {
        plane.showSpeedVector = !plane.showSpeedVector;
        plane.updateMarker();
      }
    } else if (SelectedPlane && SelectedPlane.position) {
      // Right-click on empty map with a plane selected: reposition its label
      // to the compass corner matching the bearing plane -> click point.
      const clickLonLat = ol.proj.toLonLat(evtCoords);
      const brg = bearingFromLonLat(SelectedPlane.position, clickLonLat);
      SelectedPlane.labelPos = LABEL_DIRS[Math.floor(((brg + 22.5) % 360) / 45)];
      SelectedPlane.updateMarker();
    }

    evt.stopPropagation();
  });

  // Handle middle-mouse-click for distance measurement
  OLMap.on('pointerdown', function (evt) {
    if (!atcStyle || evt.originalEvent.button !== 1) return; // Only handle middle button
    evt.preventDefault();
    evt.stopPropagation();

    let planeHex = null;
    let evtCoords = evt.map.getCoordinateFromPixel(evt.pixel);

    // Check if clicking on a plane FIRST (priority over line)
    let source = webgl ? webglFeatures : PlaneIconFeatures;
    let feature = source.getClosestFeatureToCoordinate(evtCoords);

    if (feature) {
      let fPixel = evt.map.getPixelFromCoordinate(feature.getGeometry().getCoordinates());
      let a = fPixel[0] - evt.pixel[0];
      let b = fPixel[1] - evt.pixel[1];
      let c = globalScale * (onMobile ? 30 : 20);
      if (a ** 2 + b ** 2 < c ** 2) {
        planeHex = feature.hex;
      }
    }

    if (planeHex) {
      // Clicked on a plane
      let plane = g.planes[planeHex];
      if (plane && plane.position) {
        if (!distanceMeasurementState.isActive) {
          // First click - start measuring
          startDistanceMeasurement(plane);
        } else {
          // Second click - complete measurement
          completeDistanceMeasurement(plane);
        }
      }
      return; // Don't check for line click
    }

    // No plane clicked, check if clicking on the distance line
    let clickedLine = false;
    if (distanceMeasurementState.line) {
      let lineGeom = distanceMeasurementState.line.getGeometry();
      let closestPoint = lineGeom.getClosestPoint(evtCoords);
      let pixelDist = Math.sqrt(
        Math.pow(evt.pixel[0] - evt.map.getPixelFromCoordinate(closestPoint)[0], 2) +
          Math.pow(evt.pixel[1] - evt.map.getPixelFromCoordinate(closestPoint)[1], 2)
      );
      if (pixelDist < 20) {
        clickedLine = true;
      }
    }

    if (clickedLine) {
      // Remove the distance measurement
      clearDistanceMeasurement();
      return;
    }

    // Clicked on empty space
    if (distanceMeasurementState.isActive) {
      // Clicked on empty space while measuring - cancel
      clearDistanceMeasurement();
    }
  });

  // Handle mouse move to update distance line to cursor
  OLMap.on('pointermove', function (evt) {
    if (distanceMeasurementState.isActive && distanceMeasurementState.firstPlaneIcao) {
      distanceMeasurementState.mouseCoordinate = evt.coordinate;
      updateDistanceLineToMouse(evt.coordinate);
    }
  });

  // Speed vector toggle is handled by the map 'contextmenu' handler above, which
  // fires for both a desktop right-click and a mobile touch-hold (Chrome Android
  // synthesizes contextmenu from a long-press). A single path = a single toggle,
  // so the vector no longer flickers on mobile.

  // show the hover box
  checkPointermove();
}

// Header "D" button: toggle distance-measure interaction mode on/off.
function toggleDistanceMode() {
  distanceMode = !distanceMode;
  if (!distanceMode) clearDistanceMeasurement();
  buttonActive('#D', distanceMode);
}

function toggleSiteCircles() {
  SiteCircles = !SiteCircles;
  if (siteCircleLayer) siteCircleLayer.setVisible(SiteCircles);
  buttonActive('#C', SiteCircles);
}

function startDistanceMeasurement(plane) {
  clearDistanceMeasurement();

  distanceMeasurementState.firstPlaneIcao = plane.icao; // Store hex ID
  distanceMeasurementState.isActive = true;

  // Create line feature (initially from plane to plane position)
  let planePos = ol.proj.fromLonLat(plane.position);
  let lineGeom = new ol.geom.LineString([planePos, planePos]);

  distanceMeasurementState.line = new ol.Feature({
    geometry: lineGeom,
  });

  distanceMeasurementState.line.setStyle(
    new ol.style.Style({
      stroke: new ol.style.Stroke({
        color: '#FFFF00',
        width: 2,
        lineDash: [5, 5],
      }),
    })
  );

  distanceMeasurementFeatures.addFeature(distanceMeasurementState.line);
}

function updateDistanceLineToMouse(coordinate) {
  if (!distanceMeasurementState.line || !distanceMeasurementState.firstPlaneIcao) return;

  // Get the actual plane object from icao
  let plane = g.planes[distanceMeasurementState.firstPlaneIcao];
  if (!plane || !plane.position) return;

  let planePos = ol.proj.fromLonLat(plane.position);
  let lineGeom = distanceMeasurementState.line.getGeometry();
  lineGeom.setCoordinates([planePos, coordinate]);

  // Remove old label if exists
  if (distanceMeasurementState.label) {
    distanceMeasurementFeatures.removeFeature(distanceMeasurementState.label);
  }

  // Calculate and display distance
  let endLonLat = ol.proj.toLonLat(coordinate);
  let distanceMeters = ol.sphere.getDistance(plane.position, endLonLat);
  let distanceNM = (distanceMeters / 1852).toFixed(1);

  // Create label at midpoint
  let midpoint = [(planePos[0] + coordinate[0]) / 2, (planePos[1] + coordinate[1]) / 2];

  distanceMeasurementState.label = new ol.Feature({
    geometry: new ol.geom.Point(midpoint),
  });

  distanceMeasurementState.label.setStyle(
    new ol.style.Style({
      text: new ol.style.Text({
        text: distanceNM + ' NM',
        font: 'bold 14px sans-serif',
        fill: new ol.style.Fill({ color: '#FFFF00' }),
        stroke: new ol.style.Stroke({ color: '#000000', width: 3 }),
        offsetY: -10,
        backgroundFill: new ol.style.Fill({ color: 'rgba(0, 0, 0, 0.7)' }),
        padding: [2, 4, 2, 4],
      }),
    })
  );

  distanceMeasurementFeatures.addFeature(distanceMeasurementState.label);
}

function completeDistanceMeasurement(plane) {
  if (!distanceMeasurementState.isActive || !distanceMeasurementState.firstPlaneIcao) return;

  // Store the second plane icao ID
  distanceMeasurementState.secondPlaneIcao = plane.icao;

  // Get the first plane object
  let plane1 = g.planes[distanceMeasurementState.firstPlaneIcao];
  if (!plane1 || !plane1.position) {
    clearDistanceMeasurement();
    return;
  }

  let plane1Pos = ol.proj.fromLonLat(plane1.position);
  let plane2Pos = ol.proj.fromLonLat(plane.position);

  // Update line to connect the two planes
  let lineGeom = distanceMeasurementState.line.getGeometry();
  lineGeom.setCoordinates([plane1Pos, plane2Pos]);

  // Update line style to solid (not dashed)
  distanceMeasurementState.line.setStyle(
    new ol.style.Style({
      stroke: new ol.style.Stroke({
        color: '#FFFF00',
        width: 2,
      }),
    })
  );

  // Calculate final distance
  let distanceMeters = ol.sphere.getDistance(plane1.position, plane.position);
  let distanceNM = (distanceMeters / 1852).toFixed(1);

  // Update label
  if (distanceMeasurementState.label) {
    distanceMeasurementFeatures.removeFeature(distanceMeasurementState.label);
  }

  let midpoint = [(plane1Pos[0] + plane2Pos[0]) / 2, (plane1Pos[1] + plane2Pos[1]) / 2];

  distanceMeasurementState.label = new ol.Feature({
    geometry: new ol.geom.Point(midpoint),
  });

  distanceMeasurementState.label.setStyle(
    new ol.style.Style({
      text: new ol.style.Text({
        text: distanceNM + ' NM',
        font: 'bold 14px sans-serif',
        fill: new ol.style.Fill({ color: '#FFFF00' }),
        stroke: new ol.style.Stroke({ color: '#000000', width: 3 }),
        offsetY: -10,
        backgroundFill: new ol.style.Fill({ color: 'rgba(0, 0, 0, 0.7)' }),
        padding: [2, 4, 2, 4],
      }),
    })
  );

  distanceMeasurementFeatures.addFeature(distanceMeasurementState.label);

  // Keep references but mark as inactive
  distanceMeasurementState.isActive = false;
}

function clearDistanceMeasurement() {
  if (distanceMeasurementState.line) {
    distanceMeasurementFeatures.removeFeature(distanceMeasurementState.line);
    distanceMeasurementState.line = null;
  }
  if (distanceMeasurementState.label) {
    distanceMeasurementFeatures.removeFeature(distanceMeasurementState.label);
    distanceMeasurementState.label = null;
  }
  distanceMeasurementState.firstPlaneIcao = null;
  distanceMeasurementState.secondPlaneIcao = null;
  distanceMeasurementState.mouseCoordinate = null;
  distanceMeasurementState.isActive = false;
}

function updateDistanceMeasurementLine() {
  // Update line position when planes move
  if (!distanceMeasurementState.line) {
    return; // No line to update
  }

  // Handle active measurement (line following mouse)
  if (distanceMeasurementState.isActive) {
    if (!distanceMeasurementState.firstPlaneIcao) {
      clearDistanceMeasurement();
      return;
    }

    // Get the first plane object from icao
    let plane = g.planes[distanceMeasurementState.firstPlaneIcao];
    if (!plane || !plane.position) {
      clearDistanceMeasurement();
      return;
    }

    if (distanceMeasurementState.mouseCoordinate) {
      // Update line from plane to mouse cursor
      updateDistanceLineToMouse(distanceMeasurementState.mouseCoordinate);
    }
    return;
  }

  // Handle completed measurement (line between two planes)
  if (!distanceMeasurementState.firstPlaneIcao || !distanceMeasurementState.secondPlaneIcao) {
    return;
  }

  // Get both plane objects from icao
  let plane1 = g.planes[distanceMeasurementState.firstPlaneIcao];
  let plane2 = g.planes[distanceMeasurementState.secondPlaneIcao];

  // Check if planes still exist and have valid positions
  if (!plane1 || !plane1.position || !plane2 || !plane2.position) {
    clearDistanceMeasurement();
    return;
  }

  // Update line coordinates
  let plane1Pos = ol.proj.fromLonLat(plane1.position);
  let plane2Pos = ol.proj.fromLonLat(plane2.position);

  let lineGeom = distanceMeasurementState.line.getGeometry();
  lineGeom.setCoordinates([plane1Pos, plane2Pos]);

  // Update label position and distance
  let midpoint = [(plane1Pos[0] + plane2Pos[0]) / 2, (plane1Pos[1] + plane2Pos[1]) / 2];
  let distanceMeters = ol.sphere.getDistance(plane1.position, plane2.position);
  let distanceNM = (distanceMeters / 1852).toFixed(1);

  if (distanceMeasurementState.label) {
    let labelGeom = distanceMeasurementState.label.getGeometry();
    labelGeom.setCoordinates(midpoint);

    // Update label text
    distanceMeasurementState.label.setStyle(
      new ol.style.Style({
        text: new ol.style.Text({
          text: distanceNM + ' NM',
          font: 'bold 14px sans-serif',
          fill: new ol.style.Fill({ color: '#FFFF00' }),
          stroke: new ol.style.Stroke({ color: '#000000', width: 3 }),
          offsetY: -10,
          backgroundFill: new ol.style.Fill({ color: 'rgba(0, 0, 0, 0.7)' }),
          padding: [2, 4, 2, 4],
        }),
      })
    );
  }
}

function initMapEarly() {
  // Load stored map settings if present
  if (overrideMapType) MapType_tar1090 = overrideMapType;
  else if (loStore['MapType_tar1090']) {
    MapType_tar1090 = loStore['MapType_tar1090'];
  }

  mapTypeSettings();

  // Initialize OpenLayers

  layers_group = createBaseLayers();
  layers = layers_group.getLayers();

  //add_kml_overlay('https://developers.google.com/kml/documentation/KML_Samples.kml', 'samples', 0.8);

  siteCircleLayer = new ol.layer.Vector({
    name: 'siteCircles',
    type: 'overlay',
    title: 'Range rings',
    source: siteCircleFeatures,
    visible: SiteCircles,
    zIndex: 100,
    renderOrder: null,
    renderBuffer: renderBuffer,
  });
  layers.push(siteCircleLayer);

  siteCircleLayer.on('change:visible', function (evt) {
    if (evt.target.getVisible()) {
      runAfterLoad(geoFindMe);
    }
  });
}

function showHideButtons() {
  if (hideButtons) {
    jQuery('#header_top').hide();
    jQuery('#header_side').hide();
    jQuery('#splitter').hide();
    jQuery('#tabs').hide();
    jQuery('#filterButton').hide();
    jQuery('.ol-zoom').hide();
    jQuery('.layer-switcher').hide();
  } else {
    jQuery('#header_top').show();
    jQuery('#header_side').show();
    jQuery('#splitter').show();
    jQuery('#tabs').show();
    jQuery('#filterButton').show();
    jQuery('.ol-zoom').show();
    jQuery('.layer-switcher').show();
  }
}

// Initalizes the map and starts up our timers to call various functions
function initMap() {
  CenterLon = Number(lopaStore['CenterLon']) || DefaultCenterLon;
  CenterLat = Number(lopaStore['CenterLat']) || DefaultCenterLat;
  //console.log("initMap Centerlat: " + CenterLat);
  g.zoomLvl = Number(lopaStore['zoomLvl']) || DefaultZoomLvl;
  g.zoomLvlCache = g.zoomLvl;

  // always hide this, it really only shows the number of positions saved
  jQuery('#dump1090_total_history_td').hide();

  if (globeIndex && aggregator) {
    jQuery('#dump1090_message_rate_td').hide();
  }

  locationDotLayer = new ol.layer.Vector({
    name: 'locationDot',
    type: 'overlay',
    title: receiverJson && receiverJson.lat != null ? 'Site position' : 'Your position',
    source: locationDotFeatures,
    visible: SiteShow,
    zIndex: 100,
    renderOrder: null,
    renderBuffer: renderBuffer,
  });
  layers.push(locationDotLayer);

  locationDotLayer.on('change:visible', function (evt) {
    if (evt.target.getVisible()) {
      runAfterLoad(geoFindMe);
    }
  });

  distanceMeasurementLayer = new ol.layer.Vector({
    name: 'distanceMeasurement',
    type: 'overlay',
    title: 'Distance Measurement',
    source: distanceMeasurementFeatures,
    visible: true,
    zIndex: 200,
    renderOrder: null,
  });
  layers.push(distanceMeasurementLayer);

  actualOutline.enabled = multiOutline || (receiverJson && receiverJson.outlineJson);

  if (actualOutline.enabled) {
    actualOutline.refresh = 15000;
    actualOutline.url = multiOutline ? 'data/multiOutline.json' : 'data/outline.json';

    actualOutline.features = new ol.source.Vector();
    actualOutline.style = new ol.style.Style({
      fill: null,
      stroke: new ol.style.Stroke({
        color: actual_range_outline_color,
        width: actual_range_outline_width,
        lineDash: actual_range_outline_dash,
      }),
    });
    actualOutline.layer = new ol.layer.Vector({
      name: 'actualRangeOutline',
      type: 'overlay',
      title: 'actual range outline',
      source: actualOutline.features,
      zIndex: 101,
      renderBuffer: renderBuffer,
      style: actualOutline.style,
      visible: actual_range_show,
    });
    layers.push(actualOutline.layer);
  }
  if (calcOutlineData) {
    calcOutlineLayer = new ol.layer.Vector({
      name: 'calcOutline',
      type: 'overlay',
      title: 'terrain-based range outline',
      source: calcOutlineFeatures,
      zIndex: 100,
      renderOrder: null,
      renderBuffer: renderBuffer,
    });
    layers.push(calcOutlineLayer);
    drawUpintheair();
  }

  const dummyLayer = new ol.layer.Vector({
    name: 'dummy',
    renderOrder: null,
    source: new ol.source.Vector(),
  });

  trailGroup.push(dummyLayer);

  trailLayers = new ol.layer.Group({
    name: 'ac_trail',
    title: 'Aircraft trails',
    type: 'overlay',
    layers: trailGroup,
    zIndex: 150,
  });

  layers.push(trailLayers);

  iconLayer = new ol.layer.Vector({
    name: 'iconLayer',
    type: 'overlay',
    title: 'Aircraft positions',
    source: PlaneIconFeatures,
    declutter: false,
    // Above webglLayer (200) so labels/leaders render on top of the WebGL
    // aircraft icons. In non-webgl mode this layer also holds the icons, and
    // the per-style zIndex keeps each label above the icons within the layer.
    zIndex: 250,
    renderBuffer: renderBuffer,
  });
  layers.push(iconLayer);

  ol_map_init();

  // handle the layer settings pane checkboxes
  //OLMap.once('postrender', function(e) {
  //toggleLayer('#nexrad_checkbox', 'nexrad');
  //toggleLayer('#sitepos_checkbox', 'site_pos');
  //toggleLayer('#actrail_checkbox', 'ac_trail');
  //toggleLayer('#acpositions_checkbox', 'webglLayer');
  //});

  jQuery('#infoblock_close').on('click', function () {
    if (showTrace) toggleShowTrace();
    if (onlySelected) toggleIsolation();

    deselect(SelectedPlane);
    refreshFilter();
  });

  new Toggle({
    key: 'darkerColors',
    display: 'Darker Colors',
    container: '#settingsLeft',
    init: darkerColors,
    setState: function (state) {
      darkerColors = state;
      if (loadFinished) {
        refreshFeatures();
        remakeTrails();
      }
    },
  });

  tableColorsLight = tableColors;
  tableColorsDark = JSON.parse(JSON.stringify(tableColors));
  let darkVals = Object.values(tableColorsDark);
  for (let i in ['selected', 'unselected']) {
    let obj = darkVals[i];
    let keys = Object.keys(obj);
    for (let j in keys) {
      let key = keys[j];
      let hsl = hexToHSL(obj[key]);
      hsl[1] *= 0.4;
      hsl[2] *= 0.3;
      obj[key] = hslToRgb(hsl);
    }
  }
  new Toggle({
    key: 'darkMode',
    display: 'Dark Mode',
    container: '#settingsLeft',
    init: darkModeDefault,
    setState: function (state) {
      let root = document.documentElement;
      jQuery('.layer-switcher .panel').css('background', 'var(--BGCOLOR1)');
      jQuery('.layer-switcher .panel').css('border', '4px solid var(--BGCOLOR1)');
      if (state) {
        root.style.setProperty('--BGCOLOR1', '#313131');
        root.style.setProperty('--BGCOLOR2', '#242424');
        root.style.setProperty('--TXTCOLOR1', '#BFBFBF');
        root.style.setProperty('--TXTCOLOR2', '#D8D8D8');
        root.style.setProperty('--TXTCOLOR3', '#a8a8a8');
        //invert the "x" images
        jQuery('.infoblockCloseBox').css('filter', 'invert(100%)');
        jQuery('.infoblockCloseBox').css(' -webkit-filter', 'invert(100%)');
        jQuery('.settingsCloseBox').css('filter', 'invert(100%)');
        jQuery('.settingsCloseBox').css(' -webkit-filter', 'invert(100%)');
        tableColors = tableColorsDark;
      } else {
        root.style.setProperty('--BGCOLOR1', '#F8F8F8');
        root.style.setProperty('--BGCOLOR2', '#CCCCCC');
        root.style.setProperty('--TXTCOLOR1', '#003f4b');
        root.style.setProperty('--TXTCOLOR2', '#050505');
        root.style.setProperty('--TXTCOLOR3', '#003f4b');
        jQuery('.infoblockCloseBox').css('filter', 'invert(0%)');
        jQuery('.infoblockCloseBox').css(' -webkit-filter', 'invert(0%)');
        jQuery('.settingsCloseBox').css('filter', 'invert(0%)');
        jQuery('.settingsCloseBox').css(' -webkit-filter', 'invert(0%)');

        tableColors = tableColorsLight;
      }
      if (loadFinished) {
        TAR.planeMan.redraw();
        refreshFilter();
        initLegend(tableColors.unselected);
        initSourceFilter(tableColors.unselected);
        initFlagFilter(tableColors.unselected);
      }
    },
  });

  initLegend(tableColors.unselected);

  initFilters();

  ol.control.LayerSwitcher.forEachRecursive(layers_group, function (lyr) {
    if (lyr.get('type') != 'base') return;
    lyr.dimKey = lyr.on('postrender', dim);
  });

  new Toggle({
    key: 'MapDim',
    display: 'Dim Map',
    container: '#settingsLeft',
    init: MapDim,
    setState: function (state) {
      /*
            if (!state) {
                ol.control.LayerSwitcher.forEachRecursive(layers_group, function(lyr) {
                    if (lyr.get('type') != 'base')
                        return;
                    ol.Observable.unByKey(lyr.dimKey);
                });
            } else {
                ol.control.LayerSwitcher.forEachRecursive(layers_group, function(lyr) {
                    if (lyr.get('type') != 'base')
                        return;
                    lyr.dimKey = lyr.on('postrender', dim);
                });
            }
            */
      if (loadFinished) {
        OLMap.render();
      }
      buttonActive('#B', state);
    },
  });

  window.addEventListener(
    'keydown',
    function (e) {
      active();
      if (e.defaultPrevented) {
        return; // Do nothing if the event was already processed
      }
      if (e.target.type == 'text') {
        return;
      }
      if (e.srcElement.nodeName == 'INPUT') {
        return;
      }

      if (e.ctrlKey || e.altKey || e.metaKey) {
        return;
      }
      let oldCenter, extent, newCenter;
      switch (e.key) {
        case 'c':
        case 'Esc':
        case 'Escape':
          deselectAllPlanes();
          break;
        // zoom and movement
        case 'q':
        case '-':
        case 'Subtract':
          zoomOut();
          break;
        case 'e':
        case '+':
        case 'Add':
          zoomIn();
          break;
        case 'ArrowUp':
        case 'w':
          oldCenter = OLMap.getView().getCenter();
          extent = OLMap.getView().calculateExtent(OLMap.getSize());
          newCenter = [oldCenter[0], (oldCenter[1] + extent[3]) / 2];
          OLMap.getView().setCenter(newCenter);
          toggleFollow(false);
          break;
        case 'ArrowDown':
        case 's':
          oldCenter = OLMap.getView().getCenter();
          extent = OLMap.getView().calculateExtent(OLMap.getSize());
          newCenter = [oldCenter[0], (oldCenter[1] + extent[1]) / 2];
          OLMap.getView().setCenter(newCenter);
          toggleFollow(false);
          break;
        case 'ArrowLeft':
        case 'a':
          oldCenter = OLMap.getView().getCenter();
          extent = OLMap.getView().calculateExtent(OLMap.getSize());
          newCenter = [(oldCenter[0] + extent[0]) / 2, oldCenter[1]];
          OLMap.getView().setCenter(newCenter);
          toggleFollow(false);
          break;
        case 'ArrowRight':
        case 'd':
          oldCenter = OLMap.getView().getCenter();
          extent = OLMap.getView().calculateExtent(OLMap.getSize());
          newCenter = [(oldCenter[0] + extent[2]) / 2, oldCenter[1]];
          OLMap.getView().setCenter(newCenter);
          toggleFollow(false);
          break;
        // misc
        case 'b':
          toggles['MapDim'].toggle();
          break;
        case 'm':
          toggleMultiSelect();
          break;
        case 'v':
          toggleTableInView();
          break;
        case 'r':
          if (heatmap) drawHeatmap();
          else followRandomPlane();
          break;
        case 'R':
          fetchData();
          break;
        case 't':
          selectAllPlanes();
          break;
        case 'G':
          nogpsOnly = !nogpsOnly;
          refreshFilter();
          break;
        case 'h':
          resetMap();
          break;
        case 'H':
          hideButtons = !hideButtons;
          showHideButtons();
          break;
        case 'f':
          toggleFollow();
          break;
        // filters
        case 'T':
          filterTISB = !filterTISB;
          refreshFilter();
          break;
        case 'u':
          toggleMilitary();
          break;
        case 'i':
          toggleIsolation();
          break;
        // persistence mode
        case 'p':
          togglePersistence();
          break;
        // Labels
        case 'l':
          toggleLabels();
          break;
        case 'o':
          toggleExtendedLabels();
          break;
        case 'k':
          toggleTrackLabels();
          break;
        // debug stuff
        case 'L':
          toggles['lastLeg'].toggle();
          break;
        case 'D':
          debug = !debug;
          loStore['debug'] = debug;
          console.log('debug = ' + debug);
          break;
        case 'P':
          debugPosFilter = !debugPosFilter;
          loStore['debugPosFilter'] = debugPosFilter;
          console.log('debugPosFilter = ' + debugPosFilter);
          break;
        case '?':
          if (!SelectedPlane) {
            console.log('No plane selected');
            break;
          }
          console.log(SelectedPlane.icao + ': ' + SelectedPlane.baseMarkerKey + '  ' + SelectedPlane.shape);
          console.log(SelectedPlane);
          console.log(SelectedPlane.milRange());
          break;
        case 'j':
          selectPlaneByHex(jumpTo, { follow: true });
          break;
        case 'J':
          debugJump = !debugJump;
          loStore['debugJump'] = debugJump;
          console.log('debugJump = ' + debugJump);
          break;
        case 'N':
          noMLAT = !noMLAT;
          loStore['noMLAT'] = noMLAT;
          console.log('noMLAT = ' + noMLAT);
          break;
      }
    },
    true
  );

  if (!usp.has('icao') && !usp.has('lat') && !usp.has('lon') && !usp.has('airport')) {
    runAfterLoad(geoFindMe);
  } else {
    runAfterLoad(initSitePos);
  }
}
