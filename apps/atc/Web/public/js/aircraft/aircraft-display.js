// This looks for planes to reap out of the master g.planes variable
let lastReap = 0;
let reapInProgress = false;
function reaper(all) {
  //console.log("Reaping started..");

  if (reapInProgress) {
    return;
  }

  lastReap = now;

  if (noVanish && !all) {
    return;
  }

  reapInProgress = true;

  if (!all) {
    releaseMem();
  }

  // Look for planes where we have seen no messages for >300 seconds
  let plane;
  let length = g.planesOrdered.length;
  let temp = [];
  for (let i in g.planesOrdered) {
    plane = g.planesOrdered[i];
    if (plane == null) continue;
    plane.seen = now - plane.last_message_time;
    if (
      all ||
      (!plane.selected &&
        plane.seen > reapTimeout &&
        (plane.dataSource != 'adsc' || plane.seen > jaeroTimeout) &&
        (plane.dataSource != 'ais' || plane.seen > aisTimeout))
    ) {
      // Reap it.
      //console.log("Removed " + plane.icao);
      delete g.planes[plane.icao];
      plane.destroy();
      continue;
    }

    // Keep it.
    temp.push(plane);

    if (globeIndex) {
      if (plane.clearTraceAfter) {
        //console.log(now - plane.clearTraceAfter);
        if (now > plane.clearTraceAfter) {
          plane.clearTrace();
          //console.log("clearTrace: " + plane.icao);
        }
      } else if (!plane.linesDrawn) {
        plane.clearTraceAfter = now + 300;
      }
    }
  }
  g.planesOrdered = temp;

  reapInProgress = false;
  const removed = length - g.planesOrdered.length;
  if (removed > 0) {
    //console.log(`reaper removed ${removed} planes.`);
  }

  return removed;
}

// Page Title update function
function refreshPageTitle() {
  if (pTracks) return;
  if (!PlaneCountInTitle && !MessageRateInTitle) {
    return;
  }

  let subtitle = '';

  if (PlaneCountInTitle) {
    if (globeIndex) {
      subtitle += 'tracking ' + globeTrackedAircraft + ' aircraft';
    } else {
      subtitle += TrackedAircraftPositions + '/' + TrackedAircraft;
    }
  }

  if (MessageRateInTitle && MessageRate != null) {
    if (subtitle) subtitle += ' | ';
    subtitle += MessageRate.toFixed(1) + '/s';
  }

  if (PageName) {
    document.title = PageName + ' - ' + subtitle;
  } else {
    document.title = subtitle;
  }
}

function displaySil() {
  jQuery('#copyrightInfo').html('');
  if (!showSil) {
    setPhotoHtml('');
    return;
  }
  let selected = SelectedPlane;
  let new_html = '';
  let type = selected.icaoType ? selected.icaoType : 'ZZZZ';
  let hex = selected.icao.toUpperCase();
  new_html = "<img id='silhouette' width='" + 151 * globalScale + "' src='aircraft_sil/" + type + ".png' />";
  setPhotoHtml(new_html);
  selected.icao.toUpperCase();
}

function displayPhoto() {
  if (!SelectedPlane) return;
  if (!SelectedPlane.psAPIresponse) {
    displaySil();
    return;
  }
  let photos = SelectedPlane.psAPIresponse['photos'] || SelectedPlane.psAPIresponse['images'];
  if (!photos || photos.length == 0) {
    displaySil();
    adjustInfoBlock();
    return;
  }
  let new_html = '';
  let photoToPull = photos[0]['thumbnail']['src'] || photos[0]['thumbnail'];
  let linkToPicture = photos[0]['link'];
  //console.log(linkToPicture);
  new_html =
    '<a class=\"link\" href="' + linkToPicture + '" target="_blank" rel="noopener noreferrer"><img id="airplanePhoto" src=' + photoToPull + '></a>';
  let copyright = photos[0]['photographer'] || photos[0]['user'];
  jQuery('#copyrightInfo').html('<span>Image © ' + copyright + '</span>');
  setPhotoHtml(new_html);
  adjustInfoBlock();
}

function refreshPhoto(selected) {
  if (!showPictures || selected.icao[0] == '~' || (!planespottingAPI && !planespottersAPI)) {
    displaySil();
    return;
  }
  let urlTail;
  let param;
  if (!selected.dbinfoLoaded) {
    displaySil();
    return;
  } else if (false && selected.registration != null && selected.registration.match(/^[0-9]{0,2}\+?[0-9]{0,2}$/)) {
    urlTail = '/hex/' + selected.icao.toUpperCase();
  } else if (selected.registration != null) {
    urlTail = '/hex/' + selected.icao.toUpperCase() + '?reg=' + selected.registration;
    const type = selected.icaoType;
    // && type != 'E170' && !type.startsWith('E75')
    if (type) {
      urlTail += '&icaoType=' + type;
    }
    param = 'DB';
  } else {
    urlTail = 'hex/' + selected.icao.toUpperCase();
    param = 'hex';
  }

  const ts = new Date().getTime();
  if (param == selected.psAPIparam) {
    if (selected.psAPIresponse) {
      displayPhoto();
      return;
    }
    if (selected.psAPIresponseTS && selected.psAPIresponseTS - ts < 10000) {
      return;
    }
  }
  selected.psAPIparam = param;

  setPhotoHtml('<p>Loading image...</p>');
  jQuery('#copyrightInfo').html('<span></span>');
  //console.log(ts/1000 + 'sending psAPI request');
  selected.psAPIresponseTS = ts;

  if (planespottersAPI) {
    let req = jQuery.ajax({
      url: planespottersAPIurl + urlTail,
      dataType: 'json',
      plane: selected,
    });

    req.done(function (data) {
      this.plane.psAPIresponse = data;
      if (SelectedPlane == this.plane) {
        displayPhoto();
      }
    });
  } else if (planespottingAPI) {
    let req = jQuery.ajax({
      url: 'https://www.planespotting.be/api/objects/imagesRegistration.php?registration=' + selected.registration,
      dataType: 'json',
      plane: selected,
    });

    req.done(function (data) {
      this.plane.psAPIresponse = data;
      if (SelectedPlane == this.plane) {
        displayPhoto();
      }
    });
    req.fail(function () {
      this.plane.psAPIresponse = { photos: [] };
      if (SelectedPlane == this.plane) {
        displayPhoto();
      }
    });
  }
}

let selCall = null;
let selIcao = null;
let selReg = null;

let somethingSelected = false;
// Refresh the detail window about the plane
function refreshSelected() {
  const selected = SelectedPlane;

  if (!selected || !selected.nav_qnh) {
    jQuery('#altimeter_set_selected').prop('disabled', true);
  } else {
    jQuery('#altimeter_set_selected').prop('disabled', false);
  }

  if (!selected) {
    if (somethingSelected) {
      adjustInfoBlock();
      buttonActive('#F', FollowSelected);
    }
    somethingSelected = false;
    return;
  }
  somethingSelected = true;
  buttonActive('#F', FollowSelected);

  selected.updateVisible();
  selected.checkForDB();

  refreshPhoto(selected);

  jQuery('#selected_callsign').updateText(selected.name);

  if (showTrace) {
    if (selected.position_time) {
      const date = new Date(selected.position_time * 1000);
      let timestamp = utcTimesHistoric ? zuluTime(date) + NBSP + 'Z' : lDateString(date) + ' ' + localTime(date) + NBSP + TIMEZONE;
      jQuery('#trace_time').updateText('Time:\n' + timestamp);
    } else {
      jQuery('#trace_time').updateText('Time:\n');
    }
  }

  if (flightawareLinks) {
    jQuery('#selected_flightaware_link').html(getFlightAwareModeSLink(selected.icao, selected.flight, 'Visit Flight Page'));
  }

  if (selected.isNonIcao() && selected.source != 'mlat') {
    jQuery('#anon_mlat_info').addClass('hidden');
    jQuery('#reg_info').addClass('hidden');
    jQuery('#tisb_info').removeClass('hidden');
  } else if (selected.isNonIcao() && selected.source == 'mlat') {
    jQuery('#reg_info').addClass('hidden');
    jQuery('#tisb_info').addClass('hidden');
    jQuery('#anon_mlat_info').removeClass('hidden');
  } else {
    jQuery('#tisb_info').addClass('hidden');
    jQuery('#anon_mlat_info').addClass('hidden');
    jQuery('#reg_info').removeClass('hidden');
  }

  let checkReg = selected.registration + ' ' + selected.dbinfoLoaded;
  if (checkReg != selReg) {
    selReg = checkReg;
    if (selected.registration) {
      if (flightawareLinks) {
        jQuery('#selected_registration').html(getFlightAwareIdentLink(selected.registration, selected.registration));
      } else if (registrationLinks && registrationLink(selected)) {
        jQuery('#selected_registration').html(`<a class="link" target="_blank" href="${registrationLink(selected)}">${selected.registration}</a>`);
      } else {
        jQuery('#selected_registration').updateText(selected.registration);
      }
    } else {
      jQuery('#selected_registration').updateText('n/a');
    }
  }
  let dbFlags = '';
  if (selected.ladd) dbFlags += ' <a class="link" target="_blank" href="https://www.faa.gov/pilots/ladd/" rel="noreferrer">LADD</a> / ';
  if (selected.pia)
    dbFlags += '<a class="link" target="_blank" href="https://www.faa.gov/air_traffic/technology/equipadsb/privacy/" rel="noreferrer">PIA</a> / ';
  if (selected.military) dbFlags += 'military / ';
  if (dbFlags.length == 0) {
    jQuery('#selected_dbFlags').updateText('none');
  } else {
    jQuery('#selected_dbFlags').html(dbFlags.slice(0, -3));
  }

  if (selected.icaoType) {
    jQuery('#selected_icaotype').updateText(selected.icaoType);
  } else {
    jQuery('#selected_icaotype').updateText('n/a');
  }
  if (selected.typeDescription) jQuery('#selected_typedesc').updateText(selected.typeDescription);
  else jQuery('#selected_typedesc').updateText('n/a');

  let typeLine = '';
  if (selected.year) typeLine += selected.year + ' ';
  if (selected.typeLong) typeLine += selected.typeLong;
  if (!typeLine) typeLine = 'n/a';

  jQuery('#selected_typelong').updateText(typeLine);

  if (selected.ownOp) jQuery('#selected_ownop').updateText(selected.ownOp);
  else jQuery('#selected_ownop').updateText('');

  if (selected.rId && show_rId) {
    jQuery('#receiver_id').updateText(selected.rId);
    jQuery('#receiver_id_div').removeClass('hidden');
  } else {
    jQuery('#receiver_id_div').addClass('hidden');
  }

  jQuery('#selected_altitude1').updateText(format_altitude_long(adjust_baro_alt(selected.altitude), selected.vert_rate, DisplayUnits));
  jQuery('#selected_altitude2').updateText(format_altitude_long(adjust_baro_alt(selected.altitude), selected.vert_rate, DisplayUnits));

  jQuery('#selected_onground').updateText(format_onground(selected.altitude));

  if (selected.squawk == null || selected.squawk == '0000') {
    jQuery('#selected_squawk1').updateText('n/a');
    jQuery('#selected_squawk2').updateText('n/a');
  } else {
    jQuery('#selected_squawk1').updateText(selected.squawk);
    jQuery('#selected_squawk2').updateText(selected.squawk);
  }

  if (useRouteAPI) {
    if (selected.routeString) {
      jQuery('#selected_route').updateText(selected.routeString);
      jQuery('#selected_route').attr('title', selected.routeVerbose);
    } else {
      jQuery('#selected_route').updateText('n/a');
    }
  }

  let magResult = null;

  if (geoMag && selected.position != null) {
    let lon = selected.position[0];
    let lat = selected.position[1];
    let alt = selected.altitude == 'ground' ? 0 : selected.altitude;
    magResult = geoMag(lat, lon, alt);
    jQuery('#selected_mag_declination').updateText(format_track_brief(magResult.dec));
  } else {
    jQuery('#selected_mag_declination').updateText('n/a');
  }

  let heading = null;
  if (selected.true_heading != null && selected.track != null) {
    heading = selected.true_heading;
  } else if (magResult && selected.mag_heading != null && selected.track != null) {
    heading = selected.mag_heading + magResult.dec;
  }
  if (heading != null && heading < 0) heading += 360;
  if (heading != null && heading > 360) heading -= 360;

  jQuery('#selected_mag_heading').updateText(format_track_brief(selected.mag_heading));

  if (selected.wd != null && selected.ws != null) {
    jQuery('#selected_wd').updateText(format_track_brief(selected.wd, true));
    jQuery('#selected_ws').updateText(format_speed_long(selected.ws, DisplayUnits));
  } else if (!globeIndex && magResult && selected.gs != null && selected.tas != null && selected.track != null && selected.mag_heading != null) {
    const trk = (Math.PI / 180) * selected.track;
    const hdg = (Math.PI / 180) * heading;
    const tas = selected.tas;
    const gs = selected.gs;
    const ws = Math.round(Math.sqrt(Math.pow(tas - gs, 2) + 4 * tas * gs * Math.pow(Math.sin((hdg - trk) / 2), 2)));
    let wd = trk + Math.atan2(tas * Math.sin(hdg - trk), tas * Math.cos(hdg - trk) - gs);
    if (wd < 0) {
      wd = wd + 2 * Math.PI;
    }
    if (wd > 2 * Math.PI) {
      wd = wd - 2 * Math.PI;
    }
    wd = Math.round((180 / Math.PI) * wd);
    jQuery('#selected_wd').updateText(format_track_brief(wd, true));
    jQuery('#selected_ws').updateText(format_speed_long(ws, DisplayUnits));
  } else {
    jQuery('#selected_wd').updateText('n/a');
    jQuery('#selected_ws').updateText('n/a');
  }

  if (!globeIndex && selected.true_heading == null && heading != null) jQuery('#selected_true_heading').updateText(format_track_brief(heading));
  else jQuery('#selected_true_heading').updateText(format_track_brief(selected.true_heading));

  let oat = null;
  let tat = null;

  if (selected.tat != null && selected.oat != null) {
    oat = selected.oat;
    tat = selected.tat;
  } else if (!globeIndex && selected.mach != null && selected.tas != null && selected.mach > 0.395) {
    oat = Math.pow(selected.tas / 661.47 / selected.mach, 2) * 288.15 - 273.15;
    tat = -273.15 + (oat + 273.15) * (1 + 0.2 * selected.mach * selected.mach);
  }

  if (oat != null) jQuery('#selected_temp').updateText(Math.round(tat) + ' / ' + Math.round(oat) + ' °C');
  else jQuery('#selected_temp').updateText('n/a');

  jQuery('#selected_speed1').updateText(format_speed_long(selected.gs, DisplayUnits));
  jQuery('#selected_speed2').updateText(format_speed_long(selected.gs, DisplayUnits));
  jQuery('#selected_ias').updateText(format_speed_long(selected.ias, DisplayUnits));
  jQuery('#selected_tas').updateText(format_speed_long(selected.tas, DisplayUnits));
  jQuery('#selected_vert_rate').updateText(format_vert_rate_long(selected.vert_rate, DisplayUnits));
  jQuery('#selected_baro_rate').updateText(format_vert_rate_long(selected.baro_rate, DisplayUnits));
  jQuery('#selected_geom_rate').updateText(format_vert_rate_long(selected.geom_rate, DisplayUnits));

  setSelectedIcao();

  jQuery('#selected_pf_info').updateText(selected.pfRoute ? selected.pfRoute : '');
  //+" "+ (selected.pfFlightno ? selected.pfFlightno : "")
  jQuery('#airframes_post_icao').attr('value', selected.icao);
  jQuery('#selected_track1').updateText(format_track_brief(selected.track));
  jQuery('#selected_track2').updateText(format_track_brief(selected.track));

  if (selected.seen != null && selected.seen < 1000000) {
    jQuery('#selected_seen').updateText(format_duration(selected.seen));
  } else {
    jQuery('#selected_seen').updateText('n/a');
  }
  if (selected.position_time != null) {
    jQuery('#selected_pos_epoch').updateText(Math.round(selected.position_time));
  } else {
    jQuery('#selected_pos_epoch').updateText('n/a');
  }
  if (selected.seen_pos != null && selected.seen_pos < 1000000) {
    jQuery('#selected_seen_pos').updateText(format_duration(selected.seen_pos));
  } else {
    jQuery('#selected_seen_pos').updateText('n/a');
  }

  jQuery('#selected_country').updateText(selected.country.replace('special use', 'special'));

  if (selected.position == null) {
    jQuery('#selected_position').updateText('n/a');
  } else {
    if (selected.seen_pos > -1) {
      jQuery('#selected_position').updateText(format_latlng(selected.position));
    } else {
      jQuery('#selected_position').updateText(format_latlng(selected.position));
    }
  }
  let sitedist;
  if (selected.position && SitePosition) {
    sitedist = ol.sphere.getDistance(SitePosition, selected.position);
  }
  jQuery('#selected_source').updateText(format_data_source(selected.dataSource));
  jQuery('#selected_category').updateText(selected.category ? selected.category : 'n/a');
  jQuery('#selected_category_label').updateText(get_category_label(selected.category));
  jQuery('#selected_sitedist1').updateText(format_distance_long(sitedist, DisplayUnits));
  jQuery('#selected_sitedist2').updateText(format_distance_long(sitedist, DisplayUnits));
  jQuery('#selected_rssi1').updateText(selected.rssi != null ? selected.rssi.toFixed(1) : 'n/a');
  if (selected.messages == undefined && selected.receiverCount && !showTrace) {
    jQuery('#selected_message_count').prev().updateText('Receivers:');
    jQuery('#selected_message_count').prop('title', 'Number of receivers receiving this aircraft');
    if (selected.receiverCount >= 5 && selected.dataSource != 'mlat') {
      jQuery('#selected_message_count').updateText('> ' + selected.receiverCount);
    } else {
      jQuery('#selected_message_count').updateText(selected.receiverCount);
    }
  } else {
    jQuery('#selected_message_count').prev().updateText('Messages:');
    jQuery('#selected_message_count').prop('title', 'The total number of messages received from this aircraft');
    jQuery('#selected_message_count').updateText(selected.messages);
  }
  jQuery('#selected_message_rate').updateText(selected.messageRate != null ? selected.messageRate.toFixed(1) : 'n/a');
  jQuery('#selected_photo_link').html(getPhotoLink(selected));

  jQuery('#selected_altitude_geom1').updateText(
    format_altitude_long(adjust_geom_alt(selected.alt_geom, selected.position), selected.geom_rate, DisplayUnits)
  );
  jQuery('#selected_altitude_geom2').updateText(
    format_altitude_long(adjust_geom_alt(selected.alt_geom, selected.position), selected.geom_rate, DisplayUnits)
  );
  jQuery('#selected_ias').updateText(format_speed_long(selected.ias, DisplayUnits));
  jQuery('#selected_tas').updateText(format_speed_long(selected.tas, DisplayUnits));
  if (selected.mach == null) {
    jQuery('#selected_mach').updateText('n/a');
  } else {
    jQuery('#selected_mach').updateText(selected.mach.toFixed(3));
  }
  if (selected.roll == null) {
    jQuery('#selected_roll').updateText('n/a');
  } else {
    jQuery('#selected_roll').updateText(selected.roll.toFixed(1));
  }
  if (selected.track_rate == null) {
    jQuery('#selected_trackrate').updateText('n/a');
  } else {
    jQuery('#selected_trackrate').updateText(selected.track_rate.toFixed(2));
  }
  jQuery('#selected_geom_rate').updateText(format_vert_rate_long(selected.geom_rate, DisplayUnits));
  if (selected.nav_qnh == null) {
    jQuery('#selected_nav_qnh').updateText('n/a');
  } else {
    jQuery('#selected_nav_qnh').updateText(selected.nav_qnh.toFixed(1) + ' hPa');
  }
  jQuery('#selected_nav_altitude').updateText(format_altitude_long(selected.nav_altitude, 0, DisplayUnits));
  jQuery('#selected_nav_heading').updateText(format_track_brief(selected.nav_heading));
  if (selected.nav_modes == null) {
    jQuery('#selected_nav_modes').updateText('n/a');
  } else {
    jQuery('#selected_nav_modes').updateText(selected.nav_modes.join());
  }
  if (selected.nic_baro == null) {
    jQuery('#selected_nic_baro').updateText('n/a');
  } else {
    if (selected.nic_baro == 1) {
      jQuery('#selected_nic_baro').updateText('cross-checked');
    } else {
      jQuery('#selected_nic_baro').updateText('not cross-checked');
    }
  }

  jQuery('#selected_nac_p').updateText(format_nac_p(selected.nac_p));
  jQuery('#selected_nac_v').updateText(format_nac_v(selected.nac_v));
  if (selected.rc == null) {
    jQuery('#selected_rc').updateText('n/a');
  } else if (selected.rc == 0) {
    jQuery('#selected_rc').updateText('unknown');
  } else {
    jQuery('#selected_rc').updateText(format_distance_short(selected.rc, DisplayUnits));
  }

  if (selected.sil == null || selected.sil_type == null) {
    jQuery('#selected_sil').updateText('n/a');
  } else {
    let sampleRate = '';
    let silDesc = '';
    if (selected.sil_type == 'perhour') {
      sampleRate = ' per flight hour';
    } else if (selected.sil_type == 'persample') {
      sampleRate = ' per sample';
    }

    switch (selected.sil) {
      case 0:
        silDesc = '&gt; 1e-3';
        break;
      case 1:
        silDesc = '≤ 1e-3';
        break;
      case 2:
        silDesc = '≤ 1e-5';
        break;
      case 3:
        silDesc = '≤ 1e-7';
        break;
      default:
        silDesc = 'n/a';
        sampleRate = '';
        break;
    }
    jQuery('#selected_sil').html(silDesc + sampleRate);
  }

  if (selected.version == null) {
    jQuery('#selected_version').updateText('none');
  } else if (selected.version == 0) {
    jQuery('#selected_version').updateText('v0 (DO-260)');
  } else if (selected.version == 1) {
    jQuery('#selected_version').updateText('v1 (DO-260A)');
  } else if (selected.version == 2) {
    jQuery('#selected_version').updateText('v2 (DO-260B)');
  } else {
    jQuery('#selected_version').updateText('v' + selected.version);
  }

  adjustInfoBlock();
}

let somethingHighlighted = false;
function refreshHighlighted() {
  // this is following nearly identical logic, etc, as the refreshSelected function, but doing less junk for the highlighted pane
  let highlighted = HighlightedPlane;

  if (!highlighted) {
    if (somethingHighlighted) jQuery('#highlighted_infoblock').hide();
    somethingHighlighted = false;
    return;
  }
  somethingHighlighted = true;

  highlighted.checkVisible();

  jQuery('#highlighted_infoblock').show();

  let infoBox = jQuery('#highlighted_infoblock');

  let marker = highlighted.marker || highlighted.glMarker;
  let geom;
  let markerCoordinates;
  if (!marker || !(geom = marker.getGeometry()) || !(markerCoordinates = geom.getCoordinates())) {
    jQuery('#highlighted_infoblock').hide();
    return;
  }
  let markerPosition = OLMap.getPixelFromCoordinate(markerCoordinates);
  if (!markerPosition) return;

  let mapSize = OLMap.getSize();
  let infoBoxLeft = markerPosition[0];
  let infoBoxTop = markerPosition[1];
  if (infoBoxLeft + 20 + infoBox.width() < mapSize[0]) infoBoxLeft += 20;
  else if (infoBoxLeft - 20 - infoBox.width() > 0) infoBoxLeft -= 20 + infoBox.width();
  else infoBoxLeft = 0;
  if (infoBoxTop + 20 + infoBox.height() < mapSize[1]) infoBoxTop += 20;
  else if (infoBoxTop - (20 + infoBox.height()) > 0) infoBoxTop -= 20 + infoBox.height();
  else infoBoxTop = 0;
  infoBox.css('left', infoBoxLeft);
  infoBox.css('top', infoBoxTop);

  jQuery('#highlighted_callsign').text(highlighted.name);

  if (highlighted.icaoType !== null) {
    jQuery('#highlighted_icaotype').text(highlighted.icaoType);
  } else {
    jQuery('#highlighted_icaotype').text('n/a');
  }

  if (useRouteAPI) {
    if (highlighted.routeString) {
      jQuery('#highlighted_route').updateText(highlighted.routeString);
    } else {
      jQuery('#highlighted_route').updateText('n/a');
    }
  }

  jQuery('#highlighted_source').text(format_data_source(highlighted.getDataSource()));

  if (highlighted.registration !== null) {
    jQuery('#highlighted_registration').text(highlighted.registration);
  } else {
    jQuery('#highlighted_registration').text('n/a');
  }

  jQuery('#highlighted_speed').text(format_speed_long(highlighted.gs, DisplayUnits));

  jQuery('#highlighted_altitude').text(format_altitude_long(adjust_baro_alt(highlighted.altitude), highlighted.vert_rate, DisplayUnits));

  jQuery('#highlighted_pf_route').text(highlighted.pfRoute ? highlighted.pfRoute : highlighted.icao.toUpperCase());

  jQuery('#highlighted_rssi').text(highlighted.rssi != null ? highlighted.rssi.toFixed(1) + ' dBFS' : 'n/a');
}

function removeHighlight() {
  HighlightedPlane = null;
  refreshHighlighted();
}

function mstime() {
  return new Date().getTime();
}

// recreating all OpenLayers Features for the planes every now and then releases some retained memory
// Haven't been able to create a reproducer ... regardless let's stick with this workaround
// in other words: probably not an issue with OpenLayers.

let nextCacheClear = mstime() + 300 * 1000;

function releaseMem() {
  if (!loadFinished || mstime() < nextCacheClear) {
    return;
  }

  nextCacheClear = mstime() + 300 * 1000;
  lineStyleCache = {};
  iconCache = {};

  //console.trace();
  //console.log('releaseMem()');
  for (let i in g.planesOrdered) {
    let plane = g.planesOrdered[i];
    plane.clearMarker();
    plane.destroyTR();
  }
  refreshFeatures();
  TAR.planeMan.redraw();
  refresh();
}

function refreshFeatures() {
  if (!loadFinished) {
    return;
  }
  updateVisible();
  for (let i in g.planesOrdered) {
    g.planesOrdered[i].updateFeatures(true);
  }
  updateDistanceMeasurementLine();
}
