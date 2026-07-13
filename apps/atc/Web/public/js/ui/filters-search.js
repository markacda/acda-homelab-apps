function followRandomPlane() {
    if (showTrace)
        return;
    let this_one = null;
    let tired = 0;
    do {
        this_one = g.planesOrdered[Math.floor(Math.random()*g.planesOrdered.length)];
        if (!this_one || tired++ > 1000)
            break;
    } while ((this_one.isFiltered() && !onlySelected) || !this_one.position || (now - this_one.position_time > 30));
    //console.log(this_one.icao);
    if (this_one)
        selectPlaneByHex(this_one.icao, {follow: true});
}

function toggleTableInView(arg) {
    if (arg == 'enable') {
        tableInView = true;
    } else if (arg == 'disable') {
        tableInView = false;
    } else if (!globeIndex) {
        tableInView = !tableInView;
    }

    TAR.planeMan.refresh();

    if (!globeIndex) {
        loStore['tableInView'] = tableInView;
    }

    jQuery('#with_positions').text(tableInView ? "On Screen:" : "With Position:");

    buttonActive('#V', tableInView);
}

function toggleLabels() {
    g.enableLabels = !g.enableLabels;
    loStore['enableLabels'] = g.enableLabels;
    for (let key in g.planesOrdered) {
        g.planesOrdered[key].updateMarker();
    }
    refreshFeatures();
    buttonActive('#L', g.enableLabels);

    if (showTrace)
        remakeTrails();
}

function toggleBandGround() {
    showBandGround = !showBandGround;
    loStore['bandGround'] = showBandGround;
    refreshFeatures();
    buttonActive('#band_G', showBandGround);
}

function toggleBandTower() {
    showBandTower = !showBandTower;
    loStore['bandTower'] = showBandTower;
    refreshFeatures();
    buttonActive('#band_T', showBandTower);
}

function toggleBandApproach() {
    showBandApproach = !showBandApproach;
    loStore['bandApproach'] = showBandApproach;
    refreshFeatures();
    buttonActive('#band_A', showBandApproach);
}

function toggleBandArea() {
    showBandArea = !showBandArea;
    loStore['bandArea'] = showBandArea;
    refreshFeatures();
    buttonActive('#band_C', showBandArea);
}

function toggleExtendedLabels(options) {
    if (isNaN(g.extendedLabels))
        g.extendedLabels = 0;

    options = options || {};
    if (!options.noIncrement) {
        g.extendedLabels++;
    }
    g.extendedLabels %= 4;
    //console.log(extendedLabels);
    loStore['extendedLabels'] = g.extendedLabels;
    for (let key in g.planesOrdered) {
        g.planesOrdered[key].updateMarker();
    }
    buttonActive('#O', g.extendedLabels);
}

function toggleTrackLabels() {
    trackLabels = !trackLabels;
    loStore['trackLabels'] = trackLabels;

    remakeTrails();

    buttonActive('#K', trackLabels);
}

function toggleAtcStyle() {
    atcStyle = !atcStyle;
    loStore['atcStyle'] = atcStyle;

    for (let key in g.planesOrdered) {
        g.planesOrdered[key].updateMarker();
    }

    remakeTrails();     // rebuild trail features so they pick up the dots/line style
    refreshSelected();

    buttonActive('#A', atcStyle);
}

function toggleMultiSelect(newState) {
    let prevState = multiSelect;
    multiSelect = !multiSelect;

    if (newState == "on")
        multiSelect = true;
    if (newState == "off")
        multiSelect = false;

    if (!multiSelect) {
        if (!SelectedPlane)
            toggleIsolation("off");
        if (prevState != multiSelect)
            deselectAllPlanes("keepMain");
    }

    buttonActive('#M', multiSelect);
}

function onJump(e) {
    toggleFollow(false);
    if (e) {
        e.preventDefault();
        onJumpInput = jQuery("#jump_input").val();
        jQuery("#jump_input").val("");
        jQuery("#jump_input").blur();
    }
    let coords = null;
    let airport = null;
    if (onJumpInput.indexOf(",") >= 0) {
        let values = onJumpInput.split(',');
        if (!values || values.length != 2) {
            showSearchWarning('Input format decimal coordinates: LATI.TUDE, LONGI.TUDE');
        }
        coords = [parseFloat(values[0]), parseFloat(values[1])];
    } else {
        airport = onJumpInput.trim().toUpperCase();
    }
    if (airport) {
        if (!g.airport_cache) {
            jQuery.getJSON('api/globe-airplanes-live/' + databaseFolder + "/airport-coords.js")
                .done(function(data) {
                    g.airport_cache = data;
                    onJump();
                });
            return;
        }
        coords = g.airport_cache[airport];
    }
    if (coords) {
        console.log("jumping to: " + coords[0] + " " + coords[1]);
        OLMap.getView().setCenter(ol.proj.fromLonLat([coords[1], coords[0]]));

        if (g.zoomLvl >= 7) {
            fetchData({force: true});
        }

        refreshFilter();
        hideSearchWarning();
    } else {
        showSearchWarning('Failed to find airport ' + airport);
    }
}

function hideSearchWarning() {
    const searchWarning = jQuery('#search_warning');
    if (searchWarning.css('display') !== 'none') {
        searchWarning.hide('slow');
    }
}

function showSearchWarning(message) {
    const searchWarning = jQuery('#search_warning');
    searchWarning.text(message)
    if (searchWarning.css('display') === 'none') {
        searchWarning.show();
    }

    //auto hide after 15 seconds
    setTimeout(() => hideSearchWarning(), 15000);
}

function onSearch(e) {
    e.preventDefault();
    const searchTerm = jQuery("#search_input").val().trim();
    jQuery("#search_input").val("");
    jQuery("#search_input").blur();
    let results = [];
    if (searchTerm)
        results = findPlanes(searchTerm, "byIcao", "byCallsign", "byReg", "byType", true);
    if (results.length > 0 && haveTraces) {
        toggleIsolation("on");
        if (results.length < 100) {
            getTrace(null, null, {list: results});
        }
    }
    return false;
}
function onSearchClear(e) {
    deselectAllPlanes();
    toggleIsolation("off");
    toggleMultiSelect("off");
    jQuery("#search_input").val("");
    jQuery("#search_input").blur();
}

function onResetAltitudeFilter(e) {
    jQuery("#altitude_filter_min").val("");
    jQuery("#altitude_filter_max").val("");
    jQuery("#altitude_filter_min").blur();
    jQuery("#altitude_filter_max").blur();

    updateAltFilter();
    refreshFilter();
}

function updateAltFilter() {
    let minAltitude = parseFloat(jQuery("#altitude_filter_min").val().trim());
    let maxAltitude = parseFloat(jQuery("#altitude_filter_max").val().trim());
    let enabled = false;

    if (minAltitude < -1e6 || minAltitude > 1e6 || isNaN(minAltitude))
        minAltitude = -1e6;
    else
        enabled = true;
    if (maxAltitude < -1e6 || maxAltitude > 1e6 || isNaN(maxAltitude))
        maxAltitude = 1e6;
    else
        enabled = true;

    if (!enabled) {
        PlaneFilter.enabled = false;
        PlaneFilter.minAltitude = undefined;
        PlaneFilter.maxAltitude = undefined;
    }

    PlaneFilter.enabled = enabled;

    if (DisplayUnits == "metric") {
        PlaneFilter.minAltitude = minAltitude * 3.2808;
        PlaneFilter.maxAltitude = maxAltitude * 3.2808;
    } else {
        PlaneFilter.minAltitude = minAltitude;
        PlaneFilter.maxAltitude = maxAltitude;
    }
}

function getFlightAwareIdentLink(ident, linkText) {
    if (ident !== null && ident !== "") {
        if (!linkText) {
            linkText = ident;
        }
        return '<a class="link" target="_blank" href="https://flightaware.com/live/flight/' + ident.trim() + '" rel="noreferrer">' + linkText + '</a>';
    }

    return "";
}

function onResetSourceFilter(e) {
    jQuery('#sourceFilter .ui-selected').removeClass('ui-selected');

    sourcesFilter = null;

    updateSourceFilter();
}

function updateSourceFilter(e) {
    if (e)
        e.preventDefault();

    PlaneFilter.sources = sourcesFilter;

    refreshFilter();
}

function onResetFlagFilter(e) {
    jQuery('#flagFilter .ui-selected').removeClass('ui-selected');

    flagFilter = null;

    updateFlagFilter();
}

function updateFlagFilter(e) {
    if (e)
        e.preventDefault();

    PlaneFilter.flagFilter = flagFilter;

    refreshFilter();
}

const filters = {};
const filter_list = [];
const filters_active = [];

function Filter(arg) {
    this.key = arg.key;
    this.field = arg.field;
    this.name = arg.name;
    this.tbody = document.getElementById(arg.table).getElementsByTagName('tbody')[0];

    this.id = 'filters_' + this.key;
    this.sid = '#' + this.id;

    filters[this.key] = this;
    filter_list.push(this);

    this.init();
}

Filter.prototype.update = function(e) {
    if (e) {
        e.preventDefault();
    }

    this.input.blur();
    const val = this.input.val().trim();

    this.set(val);

    return false;
}
Filter.prototype.set = function(val) {

    this.input.val(val);
    this.pattern = val;
    this.PATTERN = this.pattern.toUpperCase();

    const list_index = filters_active.indexOf(this);
    if (val && list_index < 0) {
        filters_active.push(this);
    }
    if (!val && list_index >= 0) {
        filters_active.splice(list_index);
    }

    refreshFilter();
}

Filter.prototype.reset = function(e) {
    if (e) {
        e.preventDefault();
    }
    this.set("");
    return false;
}

Filter.prototype.init = function() {
    // don't F directly with the innerhtml of the body because it will drop event listeners / recreate dom elements
    const row = this.tbody.insertRow();
    row.innerHTML =
        `<td><form id="${this.id}">`
        + '<div class="infoBlockTitleText">Filter by '+ this.name +':</div>'
        + `<input id="${this.id}_input" name="${this.id}_name" type="text" class="searchInput" maxlength="1024">`
        + '<button class="formButton" type="submit">Filter</button>'
        + `<button class="formButton" id="${this.id}_reset">Reset</button>`
        + '</form></td>'
    ;
    this.input = jQuery(this.sid + '_input');
    this.form = document.getElementById(this.id)
    this.form.onsubmit = (e) => { return this.update(e); };
    jQuery(this.sid + '_reset').click((e) => { return this.reset(e); });
}

function initFilters() {
    initSourceFilter(tableColors.unselected);
    initFlagFilter(tableColors.unselected);
    new Filter({
        key: 'callsign',
        field: 'name',
        name: 'callsign',
        table: "filterTable",
    });
    new Filter({
        key: 'squawk',
        field: 'squawk',
        name: 'squawk',
        table: "filterTable",
    });
    new Filter({
        key: 'type',
        field: 'icaoType',
        name: 'type code',
        table: "filterTable",
    });
    new Filter({
        key: 'description',
        field: 'typeDescription',
        name: 'type description',
        table: "filterTable",
    });
    new Filter({
        key: 'icao',
        field: 'icao',
        name: 'ICAO hex id',
        table: "filterTable",
    });


    new Filter({
        key: 'registration',
        field: 'registration',
        name: 'registration',
        table: 'filterTable3'
    });
    if (routeApiUrl) {
        new Filter({
            key: 'route',
            field: 'routeString',
            name: 'route',
            table: 'filterTable3'
        });
    }
    new Filter({
        key: 'country',
        field: 'country',
        name: 'country of registration',
        table: 'filterTable3'
    });
    new Filter({
        key: 'category',
        field: 'category',
        name: 'category (A3,B0,..)',
        table: 'filterTable3'
    });

    if (PlaneFilter) {
        if (PlaneFilter.minAltitude && PlaneFilter.minAltitude > -1000000) {
            jQuery('#altitude_filter_min').val(PlaneFilter.minAltitude);
        }
        if (PlaneFilter.maxAltitude && PlaneFilter.maxAltitude < 1000000) {
            jQuery('#altitude_filter_max').val(PlaneFilter.maxAltitude);
        }

        for (const filter of filter_list) {
            if (usp.has(`filter${filter.key}`)) {
                filter.set(usp.get(`filter${filter.key}`));
            }
        }

        if (PlaneFilter.sources) {
            sourcesFilter = PlaneFilter.sources
            sourcesFilter.map((f) => jQuery('#source-filter-' + f).addClass('ui-selected'))
        }

        if (PlaneFilter.flagFilter) {
            flagFilter = PlaneFilter.flagFilter
            flagFilter.map((f) => jQuery('#flag-filter-' + f).addClass('ui-selected'))
        }
    }
}





function getFlightAwareModeSLink(code, ident, linkText) {
    if (code !== null && code.length > 0 && code[0] !== '~' && code !== "000000") {
        if (!linkText) {
            linkText = "FlightAware: " + code.toUpperCase();
        }

        let linkHtml = "<a class=\"link\" target=\"_blank\" href=\"https://flightaware.com/live/modes/" + code ;
        if (ident != null && ident !== "") {
            linkHtml += "/ident/" + ident.trim();
        }
        linkHtml += "/redirect\" rel=\"noreferrer\">" + linkText + "</a>";
        return linkHtml;
    }

    return "";
}

function getPhotoLink(ac) {
    if (jetphotoLinks) {
        if (ac.registration == null || ac.registration == "")
            return "";
        return "<a class=\"link\" target=\"_blank\" href=\"https://www.jetphotos.com/photo/keyword/" + ac.registration.replace(/[^0-9a-z]/ig,'') + "\" rel=\"noreferrer\">Jetphotos</a>";
    } else if (flightawareLinks) {
        if (ac.registration == null || ac.registration == "")
            return "";
        return "<a class=\"link\" target=\"_blank\" href=\"https://flightaware.com/photos/aircraft/" + ac.registration.replace(/[^0-9a-z]/ig,'') + "\" rel=\"noreferrer\">FA Photos</a>";
    } else if (showPictures) {
        return "<a class=\"link\" target=\"_blank\" href=\"https://www.planespotters.net/hex/" + ac.icao.toUpperCase() + "\" rel=\"noreferrer\">View on g.planespotters</a>";
    }
}

// takes in an elemnt jQuery path and the OL3 layer name and toggles the visibility based on clicking it
function toggleLayer(element, layer) {
    // set initial checked status
    ol.control.LayerSwitcher.forEachRecursive(layers_group, function(lyr) {
        if (lyr.get('name') === layer && lyr.getVisible()) {
            jQuery(element).addClass('settingsCheckboxChecked');
        }
    });
    jQuery(element).on('click', function() {
        let visible = false;
        if (jQuery(element).hasClass('settingsCheckboxChecked')) {
            visible = true;
        }
        ol.control.LayerSwitcher.forEachRecursive(layers_group, function(lyr) {
            if (lyr.get('name') === layer) {
                if (visible) {
                    lyr.setVisible(false);
                    jQuery(element).removeClass('settingsCheckboxChecked');
                } else {
                    lyr.setVisible(true);
                    jQuery(element).addClass('settingsCheckboxChecked');
                }
            }
        });
    });
}
