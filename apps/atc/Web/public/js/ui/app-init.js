// this function is called from index.html on body load
// kicks off the whole rabbit hole
function initialize() {
    if (usp.has('iconTest') || usp.has('iconTestLabels')) {
        jQuery('#iconTestCanvas').show();
        iconTest();
        return;
    }

    // things that can run without receiver json being known
    earlyInitPage();
    initMapEarly();

    jQuery.when(configureReceiver, heatmapDefer).done(function() {

        if (receiverJson) {
            if (receiverJson.trace_hist_only)
                trace_hist_only = true;
            if (receiverJson.json_trace_interval < 2)
                traces_high_res = true;
            if (receiverJson.lat != null && !SiteOverride) {
                //console.log("receiver.json lat: " + receiverJson.lat)
                SiteLat = receiverJson.lat;
                SiteLon = receiverJson.lon;
            }
            if (receiverJson.jaeroTimeout) {
                jaeroTimeout = receiverJson.jaeroTimeout * 60;
            }


            if (receiverJson.readsb) {
                positionFilter = false;
                altitudeFilter = false;
            }
        }

        if (SiteLat && SiteLon) {
            SitePosition = [SiteLon, SiteLat];
            DefaultCenterLat = SiteLat;
            DefaultCenterLon = SiteLon;
        }

        configureReceiver = null;

        // Initialize stuff
        initPage();
        initMap();

        processQueryToggles();

        jQuery.when(historyQueued).done(push_history);

        if (!nHistoryItems) {
            historyLoaded.resolve();
        }

        jQuery.when(historyLoaded).done(startPage);
    });
}


function processQueryToggles() {
    if (!usp.has('toggles')) {
        return;
    }
    let todo;
    try {
        todo = usp.get('toggles').split(',');;
    } catch (e) {
        console.error(e);
        return;
    }
    while (todo.length >= 2) {
        let key = todo.shift();
        let value = todo.shift();
        let state = true;
        if (value == 'false' || value == '0') {
            state = false;
        }
        try {
            toggles[key].toggle(state, "init");
            console.log((state ? "Enabled" : "Disabled") + " setting: " + key);
        } catch (e) {
            console.error(e);
        }
    }
}

function replaySpeedChange(arg) {
    traceOpts.replaySpeed = arg;
    console.log(arg);
    if (traceOpts.animate)
        return;
    legShift(0);
};

function initPage() {

    if (globeIndex) {
        function setGlobeTableLimit() {
            let mult = 1 + 4 * toggles['moreTableLines1'].state + 16 * (toggles['moreTableLines2'] && toggles['moreTableLines2'].state);
            globeTableLimit = globeTableLimitBase * mult;
            if (toggles['allTableLines'] && toggles['allTableLines'].state)
                globeTableLimit = 1e9;
            if (onMobile)
                globeTableLimit /= 2;
        };
        new Toggle({
            key: "moreTableLines1",
            display: "More Table Lines",
            container: "#sidebar-table",
            init: false,
            setState: setGlobeTableLimit,
        });
        new Toggle({
            key: "moreTableLines2",
            display: "Even More Table Lines",
            container: "#sidebar-table",
            init: false,
            setState: setGlobeTableLimit,
        });
        new Toggle({
            key: "allTableLines",
            display: "All Table Lines",
            container: "#sidebar-table",
            init: false,
            setState: setGlobeTableLimit,
        });
    }


    if (!globeIndex && !haveTraces) {
        jQuery("#lastLeg_cb").parent().hide();
        jQuery('#show_trace').hide();
    }
    if (globeIndex) {
        toggleTableInView('enable');
        if (icaoFilter) {
            toggleTableInView('disable');
        }
    } else {
        jQuery('#V').show();
    }

    if (usp.has('SiteLat') && usp.has('SiteLon')) {
        let lat = parseFloat(usp.get('SiteLat'));
        let lon = parseFloat(usp.get('SiteLon'));
        if (!isNaN(lat) && !isNaN(lon)) {
            SiteLat = CenterLat = DefaultCenterLat = lat;
            SiteLon = CenterLon = DefaultCenterLon = lon;
            SiteOverride = true;
            loStore['SiteLat'] = lat;
            loStore['SiteLon'] = lon;
        }
    }
    if (loStore['SiteLat'] != null && loStore['SiteLon'] != null) {
        if (usp.has('SiteClear')) {
            loStore.removeItem('SiteLat');
            loStore.removeItem('SiteLon');
        }
    } else {
        CenterLat = DefaultCenterLat;
        CenterLon = DefaultCenterLon;
    }

}

function earlyInitPage() {
    // things that can run without receiver json being known
    if (audio_url) {
        if (!Array.isArray(audio_url)) {
            audio_url = [ audio_url ];
        }
        let html = "";
        for (const entry of audio_url) {
            let url = entry;
            let title = entry;
            if (Array.isArray(url)) {
                url = entry[0];
                title = entry[1];
            }
            if (url) {
                html += `
                    <tr><td style="text-align: center">${title}</td></tr>
                    <tr><td style="text-align: center">
                    <audio crossorigin="anonymous" preload="none" src="${url}" type="audio/mp3" controls="controls" autoplay="false"></audio>
                    </td></tr>
                `;
            }
        }
        if (html) {
            document.getElementById('mp3player').innerHTML = html;
            jQuery('#mp3player').show();
        }
    }

    let value;

    if (uk_advisory) {
        defaultOverlays.push('uka_airports');
        defaultOverlays.push('uka_airspaces');
        defaultOverlays.push('uka_runways');
        defaultOverlays.push('uka_shoreham');
        atcStyle = true;
    }

    if (atcStyle) {
        labels_top = true;
        tempTrails = true;
        tempTrailsTimeout = 45;
        SiteCirclesDistances = new Array(5, 10, 20);
        SiteCirclesLineDash = [5, 5];
        SiteCirclesColors = ['#2b3436', '#2b3436', '#2b3436'];
        MapType_tar1090 = 'carto_light_all';
        lineWidth=4;
    }

    if (usp.has('debugFetch')) {
        debugFetch = true;
    }

    if (usp.has('rangeRings')) {
        SiteCircles = Boolean(parseInt(usp.get('rangeRings')));
    }

    if (usp.has('limitUpdates')) {
        let tmp = parseInt(usp.get('limitUpdates'));
        if (!isNaN(tmp))
            limitUpdates = tmp;
    }

    if (usp.has('screenshot')) {
        limitUpdates = 0;
    }

    if (usp.has('nowebgl')) {
        loStore['webgl'] = "false";
    }

    if (usp.has('showGrid')) {
        showGrid = true;
        loStore['layer_site_pos'] = 'true';
    }

    if (usp.has('halloween'))
        halloween = true;

    if (usp.has('outlineWidth')) {
        let tmp = parseInt(usp.get('outlineWidth'));
        if (!isNaN(tmp))
            outlineWidth = tmp;
    }

    if (usp.has('kiosk')) {
        tempTrails = true;
        hideButtons = true;
        userScale = 2;
    }

    if (pTracks) {
        noVanish = true;
        buttonActive('#P', noVanish);
        filterTracks = true;
        selectAllPlanes();
    }

    if (usp.has('mobile'))
        onMobile = true;
    if (usp.has('desktop'))
        onMobile = false;

    if (usp.has('hideSidebar'))
        loStore['sidebar_visible'] = "false";
    if (usp.has('sidebarWidth')) {
        loStore['sidebar_width'] = usp.get('sidebarWidth');
        loStore['sidebar_visible'] = "true";
    }

    if (usp.has('allTracks')) {
        SelectedAllPlanes = true;
        buttonActive('#T', SelectedAllPlanes);
    }
    if (usp.has('tempTrails')) {
        tempTrails = true;
        let tmp = parseInt(usp.get('tempTrails'));
        if (tmp > 0)
            tempTrailsTimeout = tmp;
    }
    if (usp.has('squareMania')) {
        squareMania = true;
    }

    if (usp.has('darkerColors')) {
        darkerColors = true;
    }

    if (usp.has('mapDim')) {
        let dim = parseFloat(usp.get('mapDim'));
        if (!isNaN(dim))
            mapDimPercentage = dim;
    } else if (heatmap) {
        mapDimPercentage = 0.6;
        MapDim = true;
    }

    if (usp.has('noRegOnly'))
        noRegOnly = true;

    if (usp.has('nogpsOnly') || usp.has('badgps'))
        nogpsOnly = true;

    if (usp.has('mapContrast')) {
        let contrast = parseFloat(usp.get('mapContrast'));
        if (!isNaN(contrast))
            mapContrastPercentage = contrast;
    }

    if (value = usp.getFloat('labelScale')) {
        labelScale = value;
    }

    if (value = usp.getFloat('largeMode')) {
        userScale = Math.pow(1.2, value) / 1.2;
        iconScale = 1;
    }

    if (value = usp.getFloat('iconScale')) {
        iconScale = value;
    } else if (loStore['iconScale'] != null) {
        iconScale = loStore['iconScale'];
    }

    if (value = usp.getFloat('scale')) {
        userScale = value;
    } else if (loStore['userScale'] != null) {
        userScale = loStore['userScale'];
    }

    const slideBase = 0.6;
    jQuery('#iconScaleSlider').slider({
        value: Math.pow(iconScale, 1 / slideBase),
        step: 0.02,
        min: 0.1,
        max: 3,
        change: function(event, ui) {
            iconScale = Math.pow(ui.value, slideBase);
            checkScale();
            mapRefresh();
            loStore['iconScale'] = iconScale;
        },
    });

    jQuery('#userScaleSlider').slider({
        value: Math.pow(userScale, 1 / slideBase),
        step: 0.02,
        min: 0.5,
        max: 3,
        change: function(event, ui) {
            userScale = Math.pow(ui.value, slideBase);
            checkScale();
            mapRefresh();
            loStore['userScale'] = userScale;

            setGlobalScale(userScale);
        },
    });
    setGlobalScale(userScale, "init");

    if (loStore['speedVectorMinutes'] != null)
        speedVectorMinutes = parseInt(loStore['speedVectorMinutes']) || 2;
    jQuery('#speedVectorValue').text(speedVectorMinutes + ' min');
    jQuery('#speedVectorSlider').slider({
        value: speedVectorMinutes,
        step: 1,
        min: 1,
        max: 10,
        slide: function(event, ui) {
            jQuery('#speedVectorValue').text(ui.value + ' min');
        },
        change: function(event, ui) {
            speedVectorMinutes = ui.value;
            loStore['speedVectorMinutes'] = speedVectorMinutes;
            jQuery('#speedVectorValue').text(ui.value + ' min');
        },
    });

    if (usp.has('hideButtons'))
        hideButtons = true;

    if (usp.has('baseMap')) {
        overrideMapType = usp.get('baseMap');
    }

    if (usp.has('offlineMap')) {
        overrideMapType = 'osm_tiles_offline';
    }

    if (usp.has('overlays'))
        enableOverlays = usp.get('overlays').split(',');

    if (value = usp.get('icaoFilter')) {
        icaoFilter = value.toLowerCase().split(',');
    }

    if (value = usp.get('icaoBlacklist')) {
        icaoBlacklist = value.toLowerCase().split(',');
    }

    if (value = usp.getFloat('filterMaxRange')) {
        filterMaxRange = value;
    }
    filterMaxRange *= 1852; // convert from nmi to meters


    if (value = usp.getFloat('mapOrientation')) {
        g.mapOrientation = value;
    }
    g.mapOrientation *= (Math.PI/180); // adjust to radians

    if (usp.has('r') || usp.has('replay')) {
        let numbers = (usp.get('r') || usp.get('replay') || "").split(/(?:-|:)/);
        let ts = new Date();
        if (numbers.length == 5) {
            ts.setUTCFullYear(numbers[0]);
            ts.setUTCMonth(numbers[1] - 1);
            ts.setUTCDate(numbers[2]);
            ts.setUTCHours(numbers[3]);
            ts.setUTCMinutes(numbers[4]);
        }
        if (isNaN(ts)) {
            ts = new Date();
        }
        console.log(ts);
        replay = replayDefaults(ts);
    }

    //Pulling filters from params
    if (usp.has('filterAltMin')) {
        const minAlt = usp.getInt('filterAltMin');
        if (minAlt !== null)  {
            PlaneFilter.minAltitude = minAlt;
            PlaneFilter.enabled = true;
            PlaneFilter.maxAltitude = 1000000;
        }
    }
    if (usp.has('filterAltMax')) {
        const maxAlt = usp.getInt('filterAltMax');
        if (maxAlt !== null)  {
            PlaneFilter.maxAltitude = maxAlt;
            PlaneFilter.enabled = true;
            if (PlaneFilter.minAltitude === undefined) {
                PlaneFilter.minAltitude = -1000000;
            }
        }
    }

    if (usp.has('filterSources')) {
        PlaneFilter.sources = usp.get('filterSources').split(',');
        shareFiltersParam = true;
    }
    if (usp.has('filterDbFlag')) {
        PlaneFilter.flagFilter = usp.get('filterDbFlag').split(',');
        shareFiltersParam = true;
    }


    if (false && iOSVersion() <= 12 && !('PointerEvent' in window)) {
        jQuery("#generic_error_detail").text("Enable Settings - Safari - Advanced - Experimental features - Pointer Events");
        jQuery("#generic_error").css('display','block');
        setTimeout(function() {
            jQuery("#generic_error").css('display','none');
        }, 30000);
    }

    if (loStore['enableLabels'] != 'false') {
        toggleLabels();
    }
    if (usp.has('extendedLabels')) {
        g.extendedLabels = parseInt(usp.getFloat('extendedLabels'));
        toggleExtendedLabels({ noIncrement: true });
    } else if (loStore['extendedLabels']) {
        g.extendedLabels = parseInt(loStore['extendedLabels']);
        toggleExtendedLabels({ noIncrement: true });
    }
    if (loStore['trackLabels'] == "true" || usp.has('trackLabels')) {
        toggleTrackLabels();
    }
    buttonActive('#A', atcStyle);
    if (loStore['tableInView'] == "true" || usp.has('tableInView')) {
        toggleTableInView('enable');
    }
    if (loStore['debug'] == "true")
        debug = true;
    if (loStore['debugPosFilter'] == "true")
        debugPosFilter = true;

    if (loStore['noVanish'] == "true" || usp.has('noVanish')) {
        noVanish = true;
        //filterTracks = noVanish;
        //loStore['noVanish'] = "false";
        buttonActive('#P', noVanish);
    }

    jQuery('#tabs').tabs({
        active: loStore['active_tab'],
        activate: function (event, ui) {
            loStore['active_tab'] = jQuery("#tabs").tabs("option", "active");
        },
        collapsible: true
    });

    // Set page basics
    document.title = PageName;

    initializeUnitsSelector();
    TAR.planeMan.init();

    if (loStore['sidebar_width'] != null)
        jQuery('#sidebar_container').width(loStore['sidebar_width']);
    else
        jQuery('#sidebar_container').width('25%');

    if (jQuery('#sidebar_container').width() > jQuery(window).innerWidth() *0.8)
        jQuery('#sidebar_container').width('30%');

    loStore['sidebar_width'] = jQuery('#sidebar_container').width();

    jQuery('#sidebar_container').on('resize', function() {
        loStore['sidebar_width'] = jQuery('#sidebar_container').width();
    });

    // Set up event handlers for buttons
    jQuery("#expand_sidebar_button").click(expandSidebar);
    jQuery("#shrink_sidebar_button").click(showMap);

    jQuery("#altimeter_form").submit(onAltimeterChange);
    jQuery("#altimeter_set_standard").click(onAltimeterSetStandard);
    jQuery("#altimeter_set_selected").click(onAltimeterSetSelected);

    // Set up altitude filter button event handlers and validation options
    jQuery("#altitude_filter_form").submit(onFilterByAltitude);
    jQuery("#source_filter_form").submit(updateSourceFilter);
    jQuery("#flag_filter_form").submit(updateFlagFilter);

    jQuery("#altitude_filter_reset_button").click(onResetAltitudeFilter);
    jQuery("#source_filter_reset_button").click(onResetSourceFilter);
    jQuery("#flag_filter_reset_button").click(onResetFlagFilter);

    // Initialize other controls
    jQuery("#search_form").submit(onSearch);
    jQuery("#search_clear_button").click(onSearchClear);
    jQuery("#jump_clear_button").click(function() {
        jQuery("#jump_input").val("");
        jQuery("#jump_input").blur();
    });
    jQuery("#jump_form").submit(onJump);

    jQuery("#show_trace").click(toggleShowTrace);
    jQuery("#trace_back_1d").click(function() {shiftTrace(-1)});
    jQuery("#trace_jump_1d").click(function() {shiftTrace(1)});

    jQuery("#histDatePicker").datepicker({
        maxDate: '+1d',
        dateFormat: "yy-mm-dd",
        onSelect: function(date){
            setTraceDate({string: date});
            shiftTrace();
            jQuery("#histDatePicker").blur();
        },
        autoSize: true,
        onClose: !onMobile ? null : function(dateText, inst){
            jQuery("#histDatePicker").attr("disabled", false);
        },
        beforeShow: !onMobile ? null : function(input, inst){
            jQuery("#histDatePicker").attr("disabled", true);
        },
    });

    jQuery("#replayPlay").click(function(){

        if (replay.playing){
            //if playing, pause.
            playReplay(false);

        } else {
            //if paused, play.
            playReplay(true);
        }
    });

    jQuery("#leg_prev").click(function() {legShift(-1)});
    jQuery("#leg_next").click(function() {legShift(1)});

    jQuery('#settingsCog').on('click', function() {
        jQuery('#settings_infoblock').toggle();
    });

    if (onMobile) {
        jQuery('#fullscreenButton').on('click', function() {
            if (!document.fullscreenElement) {
                document.documentElement.requestFullscreen();
            } else if (document.exitFullscreen) {
                document.exitFullscreen();
            }
        });
    } else {
        jQuery('#fullscreenButton').hide();
    }

    jQuery('#settings_close').on('click', function() {
        jQuery('#settings_infoblock').hide();
    });

    jQuery('#groundvehicle_filter').on('click', function() {
        filterGroundVehicles(true);
        refresh();
    });

    jQuery('#blockedmlat_filter').on('click', function() {
        filterBlockedMLAT(true);
        refresh();
    });

    new Toggle({
        key: "lastLeg",
        display: "Last Leg only",
        container: "#settingsLeft",
        init: true,
        setState: function(state) {
            lastLeg = state;
            if (loadFinished && !showTrace) {
                for (let i in SelPlanes) {
                    SelPlanes[i].processTrace();
                }
            }
        }
    });
    new Toggle({
        key: "labelsGeom",
        display: "Labels: geom. alt. (WGS84)",
        container: "#settingsLeft",
        init: labelsGeom,
        setState: function(state) {
            labelsGeom = state;
            if (loadFinished) {
                remakeTrails();
                refreshSelected();
            }
        }
    });
    new Toggle({
        key: "geomUseEGM",
        display: "Geom. alt.: WGS84 -> EGM conversion (long load)",
        container: "#settingsLeft",
        init: geomUseEGM,
        setState: function(state) {
            geomUseEGM = state;
            if (geomUseEGM) {
jQuery('#selected_altitude_geom1')
                jQuery('#selected_altitude_geom1_title').updateText('EGM96 altitude');
                jQuery('#selected_altitude_geom2_title').updateText('Geom. EGM96');
                let egm = loadEGM();
                if (egm) {
                    egm.addEventListener('load', function() {
                        remakeTrails();
                        refreshSelected();
                    });
                    return;
                }
            } else {
                jQuery('#selected_altitude_geom1_title').updateText('WGS84 altitude');
                jQuery('#selected_altitude_geom2_title').updateText('Geom. WGS84');
            }
            if (loadFinished) {
                remakeTrails();
                refreshSelected();
            }
        }
    });

    new Toggle({
        key: "baroUseQNH",
        display: "Baro. alt.: correct for QNH",
        container: "#settingsLeft",
        init: baroUseQNH,
        setState: function(state) {
            baroUseQNH = state;
            if (baroUseQNH) {
                jQuery('#selected_altitude1_title').updateText('Corr. baro-alt');
                jQuery('#selected_altitude2_title').updateText('Corr. baro.');
                jQuery('#infoblock_altimeter').removeClass('hidden');
            } else {
                jQuery('#selected_altitude1_title').updateText('Baro. altitude');
                jQuery('#selected_altitude2_title').updateText('Barometric');
                jQuery('#infoblock_altimeter').addClass('hidden');
            }
            if (loadFinished) {
                remakeTrails();
                refreshSelected();
            }
        }
    });

    if (usp.has('labelsGeom')) {
        toggles['labelsGeom'].toggle(true, 'init');
    }

    if (usp.has('geomEGM')) {
        toggles['geomUseEGM'].toggle(true, 'init');
    }

    new Toggle({
        key: "utcTimesLive",
        display: "Live track labels: UTC",
        container: "#settingsLeft",
        init: utcTimesLive,
        setState: function(state) {
            utcTimesLive = state;
            remakeTrails();
            refreshSelected();
        }
    });

    new Toggle({
        key: "utcTimesHistoric",
        display: "Historic track labels: UTC",
        container: "#settingsLeft",
        init: utcTimesHistoric,
        setState: function(state) {
            utcTimesHistoric = state;
            remakeTrails();
            refreshSelected();
        }
    });

    new Toggle({
        key: "windLabelsSlim",
        display: "Smaller wind labels",
        container: "#settingsLeft",
        init: windLabelsSlim,
        setState: function(state) {
            windLabelsSlim = state;
            if (!loadFinished)
                return;
            for (let key in g.planesOrdered) {
                g.planesOrdered[key].updateMarker();
            }
        }
    });

    new Toggle({
        key: "showLabelUnits",
        display: "Label units",
        container: "#settingsLeft",
        init: showLabelUnits,
        setState: function(state) {
            showLabelUnits = state;
            if (!loadFinished)
                return;
            for (let key in g.planesOrdered) {
                g.planesOrdered[key].updateMarker();
            }
            remakeTrails();
            refreshSelected();
        }
    });


    jQuery('#tStop').on('click', function() { traceOpts.replaySpeed = 0; gotoTime(traceOpts.showTime); });
    jQuery('#t1x').on('click', function() { replaySpeedChange(1); });
    jQuery('#t5x').on('click', function() { replaySpeedChange(5); });
    jQuery('#t10x').on('click', function() { replaySpeedChange(10); });
    jQuery('#t20x').on('click', function() { replaySpeedChange(20); });
    jQuery('#t40x').on('click', function() { replaySpeedChange(40); });

    new Toggle({
        key: "shareFilters",
        display: "Include Filters In URLs",
        container: "#settingsRight",
        init: false,
        setState: function(state) {
            updateAddressBar();
        }
    });

    new Toggle({
        key: "debugTracks",
        display: "Debug Tracks",
        container: "#settingsRight",
        init: false,
        setState: function(state) {
            debugTracks = state;
            remakeTrails();
        }
    });

    new Toggle({
        key: "debugAll",
        display: "Debug show all",
        container: "#settingsRight",
        init: false,
        setState: function(state) {
            if (state)
                debugAll = true;
            else
                debugAll = false;
        }
    });

    /*
    new Toggle({
        key: "SiteCircles",
        display: "Distance Circles",
        container: "#settingsRight",
        init: SiteCircles,
        setState: function(state) {
            SiteCircles = state;
            if (loadFinished)
                initSitePos();
        }
    });
    */

    new Toggle({
        key: "updateLocation",
        display: "Update GPS location",
        container: "#settingsRight",
        init: updateLocation,
        setState: function(state) {
            updateLocation = state;
            runAfterLoad(watchPosition);
        }
    });

    new Toggle({
        key: "autoselect",
        display: "Auto-select plane",
        container: "#settingsRight",
        init: autoselect,
        setState: function(state) {
            autoselect = state;
            setAutoselect();
        }
    });
    if (usp.has('autoselect')) {
        autoselect = true;
        setAutoselect();
    }

    new Toggle({
        key: "ColoredPlanes",
        display: "Colored Planes",
        container: "#settingsRight",
        init: true,
        setState: function(state) {
            if (state)
                monochromeMarkers = null;
            else
                monochromeMarkers = "#EEEEEE";

            refreshFeatures();
        }
    });

    new Toggle({
        key: "ColoredTrails",
        display: "Colored Trails",
        container: "#settingsRight",
        init: true,
        setState: function(state) {
            if (state)
                monochromeTracks = null;
            else
                monochromeTracks = "#000000";

            remakeTrails();
        }
    });

    new Toggle({
        key: "sidebar_visible",
        display: "Sidebar visible",
        container: null,
        checkbox: null,
        button: '#toggle_sidebar_button',
        init: (onMobile ? false : true),
        setState: function (state) {
            if (state) {
                jQuery("#sidebar_container").show();
                jQuery("#expand_sidebar_button").show();
                jQuery("#toggle_sidebar_button").removeClass("show_sidebar");
                jQuery("#toggle_sidebar_button").addClass("hide_sidebar");
                if (!g.sidebar_initiated) {
                    g.sidebar_initiated = true;
                    // Set up map/sidebar splitter
                    jQuery("#sidebar_container").resizable({
                        handles: {
                            w: '#splitter'
                        },
                        minWidth: 150,
                        maxWidth: (jQuery(window).innerWidth() *0.8),
                    });

                    jQuery("#splitter").dblclick(function() {
                        jQuery('#legend').hide();
                        jQuery('#sidebar_container').width('auto');
                        updateMapSize();
                        loStore['sidebar_width'] = jQuery('#sidebar_container').width();
                        jQuery('#sidebar_container').width(loStore['sidebar_width']);
                        jQuery('#legend').show();
                    });

                }
                if (!hideButtons) {
                    jQuery('#splitter').show();
                }
            } else {
                if (loadFinished) {
                    jQuery("#sidebar_container").hide();
                    jQuery("#expand_sidebar_button").hide();
                    jQuery("#toggle_sidebar_button").removeClass("hide_sidebar");
                    jQuery("#toggle_sidebar_button").addClass("show_sidebar");
                }
            }
            if (loadFinished) {
                updateMapSize();
            }
        },
    });

    if (!showPictures) {
        planespottingAPI = false;
        planespottersAPI = false;
    }
    new Toggle({
        key: "planespottingAPI",
        display: "Pictures planespotting.be",
        container: "#settingsRight",
        init: planespottingAPI,
        setState: function(state) {
            planespottingAPI = state;
            if (state) {
                toggles['planespottersAPI'] && toggles['planespottersAPI'].toggle(false);
            }
            setPictureVisibility();
            refreshSelected();
        }
    });
    new Toggle({
        key: "planespottersAPI",
        display: "Pictures planespotters.net",
        container: "#settingsRight",
        init: planespottersAPI,
        setState: function(state) {
            planespottersAPI = state;
            if (state) {
                toggles['planespottingAPI'] && toggles['planespottingAPI'].toggle(false);
            }
            setPictureVisibility();
            refreshSelected();
        }
    });

    if (routeApiUrl) {
        if (location.protocol == 'http:' && routeApiUrl == "https://adsb.im/api/0/routeset") {
            // adsb.im API provider kindly asks that tar1090 uses http for the route API if possible
            routeApiUrl = "http://adsb.im/api/0/routeset";
        }
        new Toggle({
            key: "useRouteAPI",
            display: "Lookup route",
            container: "#settingsRight",
            init: useRouteAPI,
            setState: function(state) {
                useRouteAPI = state;
                if (useRouteAPI) {
                    jQuery('#routeRow').show();
                    jQuery('#routeRowHighlighted').show();
                } else {
                    jQuery('#routeRow').hide();
                    jQuery('#routeRowHighlighted').hide();
                }
            }
        });
        if (useIataAirportCodes == false) {
            routeDisplay = 'icao'; // cope with deprecated useIata var
        }
        if (usp.has('routeDisplay')) {
            routeDisplay = usp.get('routeDisplay');
        }
        routeDisplay = routeDisplay.split(',');
    } else {
        useRouteAPI = false;
    }


    new Toggle({
        key: "enableInfoblock",
        display: "Enable Infoblock",
        container: "#settingsRight",
        init: true,
        setState: function(state) {
            adjustInfoBlock();
        }
    });

    new Toggle({
        key: "wideInfoblock",
        display: "Wide Infoblock",
        container: "#settingsRight",
        init: wideInfoBlock,
        setState: function(state) {
            wideInfoBlock = state;
            adjustInfoBlock();
        }
    });

    if (onMobile) {
        enableMouseover = false;
        (typeof hideById != 'undefined') && (hideById) && (hideById('tracking_leaderboard_container'));
    }

    new Toggle({
        key: "enableMouseover",
        display: "Enable mouse-over block",
        container: "#settingsRight",
        init: enableMouseover,
        setState: function(state) {
            enableMouseover = state;
            if (loadFinished) {
                checkPointermove();
            }
        }
    });



    jQuery('#selectall_checkbox').on('click', function() {
        if (jQuery('#selectall_checkbox').hasClass('settingsCheckboxChecked')) {
            deselectAllPlanes();
        } else {
            selectAllPlanes();
        }
    })

    // Force map to redraw if sidebar container is resized - use a timer to debounce
    jQuery("#sidebar_container").on("resize", function() {
        clearTimeout(mapResizeTimeout);
        mapResizeTimeout = setTimeout(updateMapSize, 20);
    });

    filterGroundVehicles(false);
    filterBlockedMLAT(false);

    TAR.altitudeChart.init();

    if (aggregator) {
        jQuery('#aggregator_header').show();
        jQuery('#credits').show();
        if (!onMobile) {
            jQuery('#creditsSelected').show();
        }
        jQuery('#selected_infoblock').addClass('aggregator-selected-bg');

        // activate to prevent iframe use
        if (inhibitIframe && window.self != window.top) {
            window.top.location.href = "https://airplanes.live/";
            return;
        }
    }
    if (imageConfigLink != "") {
        let host = window.location.hostname;
        let configLink = imageConfigLink.replace('HOSTNAME', host);
        jQuery('#imageConfigLink').attr('href',configLink)
        jQuery('#imageConfigLink').text(imageConfigText)
        jQuery('#imageConfigHeader').show();
    }
    if (aiscatcher_server) {
        aiscatcher_server = aiscatcher_server.replace('HOSTNAME', window.location.hostname);
    }

    if (hideButtons) {
        showHideButtons();
        runAfterLoad(showHideButtons);
    }
}
