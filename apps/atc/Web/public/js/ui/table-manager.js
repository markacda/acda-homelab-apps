//
// g.planes table begin
//
(function (global, jQuery, TAR) {
    let planeMan = TAR.planeMan = TAR.planeMan || {};

    function compareAlpha(xa,ya) {
        if (xa === ya)
            return 0;
        if (xa < ya)
            return -1;
        return 1;
    }

    function compareBeta(xa, ya) {
        if (xa === ya)
            return 0;
        if (planeMan.sortAscending && xa < ya)
            return -1;
        if (!planeMan.sortAscending && (xa.replace(/ /g, "").split("").reverse().join("") > ya.replace(/ /g, "").split("").reverse().join("")))
            return -1;
        return 1;
    }

    function compareNumeric(xf,yf) {
        if (Math.abs(xf - yf) < 1e-9)
            return 0;

        return xf - yf;
    }

    const cols = planeMan.cols = {};

    cols.icao = {
        text: 'Hex ID',
        sort: function () { sortBy('icao', compareAlpha, function(x) { return x.icao; }); },
        value: function(plane) { return plane.icao; },
        td: '<td class="icaoCodeColumn">',
    };
    cols.country = {
        text: 'Flag',
        header: function() { return ""; },
        sort: function () { sortBy('country', compareAlpha, function(x) { return x.country; }); },
        value: function(plane) { return (plane.country_code ? ('<img width="18" height="12" style="display: block;margin: auto;" src="flags/3x2/' + plane.country_code.toUpperCase() + '.svg" title="' + plane.country + '"></img>') : ''); },
        hStyle: 'style="width: 18px; padding: 3px;"',
        html: true,
    };
    cols.flight = {
        sort: function () { sortBy('flight', compareAlpha, function(x) { return x.flight }); },
        value: function(plane) {
            if (flightawareLinks)
                return getFlightAwareModeSLink(plane.icao, plane.flight, plane.name);
            return (plane.flight || '');
        },
        html: flightawareLinks,
        text: 'Callsign' };
    if (routeApiUrl) {
        cols.route = {
            sort: function () { sortBy('route', compareAlpha, function(x) { return x.routeColumn }); },
            value: function(plane) {
                if (!useRouteAPI) return '';
                if (plane.routeString) {
                    return '<span title="' + plane.routeVerbose + '">' + plane.routeColumn + '</span>';
                } else {
                    return '';
                }
            },
            html: true,
            text: 'Route' };
    }
    cols.registration = {
        sort: function () { sortBy('registration', compareAlpha, function(x) { return x.registration; }); },
        value: function(plane) { return (flightawareLinks ? getFlightAwareIdentLink(plane.registration, plane.registration) : (plane.registration ? plane.registration : "")); },
        html: flightawareLinks,
        text: 'Registration' };
    cols.type = {
        sort: function () { sortBy('type', compareAlpha, function(x) { return x.icaoType; }); },
        value: function(plane) { return (plane.icaoType != null ? plane.icaoType : ""); },
        text: 'Type' };
    cols.squawk = {
        text: 'Squawk',
        sort: function () { sortBy('squawk', compareAlpha, function(x) { return x.squawk; }); },
        value: function(plane) { return (plane.squawk != null ? plane.squawk : ""); },
        align: 'right' };
    cols.altitude = {
        text: 'Altitude',
        sort: function () { sortBy('altitude',compareNumeric, function(x) { return (x.altitude == "ground" ? -100000 : x.altitude); }); },
        value: function(plane) { return format_altitude_brief(adjust_baro_alt(plane.altitude), plane.vert_rate, DisplayUnits); },
        align: 'right',
        header: function () { return 'Alt.' + NBSP + '(' + get_unit_label("altitude", DisplayUnits) + ')';},
    };
    cols.speed = {
        text: pTracks ? 'Max. Speed' : 'Speed',
        sort: function () { sortBy('speed', compareNumeric, function(x) { return x.speed; }); },
        value: function(plane) { return format_speed_brief(plane.speed, DisplayUnits); },
        align: 'right',
        header: function () { return (pTracks ? 'Max. ' : '') + 'Spd.' + NBSP + '(' + get_unit_label("speed", DisplayUnits) + ')';},
    };
    cols.vert_rate = {
        text: 'Vertical Rate',
        sort: function () { sortBy('vert_rate', compareNumeric, function(x) { return x.vert_rate; }); },
        value: function(plane) { return format_vert_rate_brief(plane.vert_rate, DisplayUnits); },
        align: 'right',
        header: function () { return 'V. Rate(' + get_unit_label("verticalRate", DisplayUnits) + ')';},
    };
    cols.sitedist = {
        text: pTracks ? 'Max. Distance' : 'Distance',
        sort: function () { sortBy('sitedist',compareNumeric, function(x) { return x.sitedist; }); },
        value: function(plane) { return format_distance_brief(plane.sitedist, DisplayUnits); },
        align: 'right',
        header: function () { return (pTracks ? 'Max. ' : '') + 'Dist.' + NBSP + '(' + get_unit_label("distance", DisplayUnits) + ')';},
    };
    cols.track = {
        text: 'Track',
        sort: function () { sortBy('track', compareNumeric, function(x) { return x.track; }); },
        value: function(plane) { return format_track_brief(plane.track); },
        align: 'right' };
    cols.msgs = {
        text: 'Messages',
        sort: function () { sortBy('msgs', compareNumeric, function(x) { return x.messages; }); },
        value: function(plane) { return plane.messages; },
        align: 'right' };
    cols.seen = {
        text: 'Seen',
        sort: function () { sortBy('seen', compareNumeric, function(x) { return x.seen; }); },
        value: function(plane) { return plane.seen.toFixed(0); },
        align: 'right' };
    cols.rssi = {
        text: 'RSSI',
        sort: function () { sortBy('rssi', compareNumeric, function(x) { return x.rssi; }); },
        value: function(plane) { return (plane.rssi != null ? plane.rssi.toFixed(1) : ""); },
        align: 'right' };
    cols.lat = {
        text: 'Latitude',
        sort: function () { sortBy('lat', compareNumeric, function(x) { return (x.position !== null ? x.position[1] : null); }); },
        value: function(plane) { return (plane.position != null ? plane.position[1].toFixed(4) : ""); },
        align: 'right' };
    cols.lon = {
        text: 'Longitude',
        sort: function () { sortBy('lon', compareNumeric, function(x) { return (x.position !== null ? x.position[0] : null); }); },
        value: function(plane) { return (plane.position != null ? plane.position[0].toFixed(4) : ""); },
        align: 'right' };
    cols.data_source = {
        text: 'Source',
        sort: function () { sortBy('data_source', compareNumeric, function(x) { return x.getDataSourceNumber(); } ); },
        value: function(plane) { return format_data_source(plane.getDataSource()); },
        align: 'right' };
    cols.military = {
        text: 'Mil.',
        sort: function () { sortBy('military', compareAlpha, function(x) { return (x.military ? 'yes' : 'no'); } ); },
        value: function(plane) { return (plane.military ? 'yes' : 'no'); },
        align: 'right' };
    cols.wd = {
        text: 'Wind D.',
        sort: function () { sortBy('wd', compareNumeric, function(x) { return x.wd; }); },
        value: function(plane) { return plane.wd != null ? (plane.wd + '°') : ''; },
        align: 'right' };
    cols.ws = {
        text: 'Wind S.',
        sort: function () { sortBy('ws', compareNumeric, function(x) { return x.ws; }); },
        value: function(plane) { return format_speed_brief(plane.ws, DisplayUnits); },
        align: 'right',
        header: function () { return 'Wind' + NBSP + '(' + get_unit_label("speed", DisplayUnits) + ')'; },
    };

    const colsEntries = Object.entries(cols);
    for (let i in colsEntries) {
        let key = colsEntries[i][0];
        let value = colsEntries[i][1];
        value.id = key;
        value.text = value.text ? value.text : "";
        value.header = value.header ? value.header : function() { return value.text; };
        value.hStyle = value.hStyle ? value.hStyle : "";
        if (!value.td)
            value.td = value.align ? ('<td style="text-align: ' + value.align + '">') : '<td>';
    }

    let columns = createOrderedColumns();
    let activeCols = null;

    let initializing = true;

    let planeRowTemplate = null;
    let htmlTable = null;
    let tbody = null;

    planeMan.init = function () {
        // initialize columns
        htmlTable = document.getElementById('planesTable');
        for (let i in columns) {
            let col = columns[i];
            col.visible = true;
            col.toggleKey = 'column_' + col.id;

            if (HideCols.includes('#' + col.id)) {
                planeMan.setColumnVis(col.id, false);
            }
        }

        createColumnToggles();

        if (!ShowFlags) {
            planeMan.setColumnVis('flag', false);
        }
    }

    planeMan.redraw = function () {
        activeCols = [];
        for (let i in columns) {
            let col = columns[i];
            if (col.visible || !mapIsVisible) {
                activeCols.push(col);
            }
        }
        for (let i = 0; i < g.planesOrdered.length; ++i) {
            g.planesOrdered[i].destroyTR();
        }
        let table = '';
        table += '<thead class="aircraft_table_header">';
        table += '  <tr>';
        for (let i in activeCols) {
            let col = activeCols[i];
            table += '<td id="' + col.id + '" onclick="TAR.planeMan.cols.' + col.id + '.sort();"' + col.hStyle + '>'+ col.header() +'</td>';
        }
        table += '  </tr>';
        table += '</thead>';
        table += '<tbody>';
        table += '</tbody>';
        htmlTable.innerHTML = table;
        tbody = htmlTable.tBodies[0];

        planeRowTemplate = document.createElement('tr');
        let template = ''
        for (let i in activeCols) {
            let col = activeCols[i];
            template += col.td;
            template += '</td>';
        }
        planeRowTemplate.innerHTML = template;

        if (!initializing) {
            planeMan.refresh();
        }
    }

    planeMan.setColumnVis = function (col, visible) {
        cols[col].visible = visible;

        if (!initializing)
            planeMan.redraw();
    }

    // Refreshes the larger table of all the planes
    planeMan.refresh = function () {
        if (!loadFinished)  {
            return;
        }
        //console.trace();

        if (initializing) {
            planeMan.redraw();
            initializing = false;
        }

        const atime = false;
        atime && console.time("planeMan.refresh()");

        const ctime = false; // gets enabled for debugging table refresh speed
        // globeTableLimit = 1000; for testing performance

        ctime && console.time("planeMan.refresh()");


        TrackedAircraft = 0;
        TrackedAircraftPositions = 0;
        TrackedHistorySize = 0;

        ctime && console.time("inView");
        let pList = []; // list of planes that might go in the table and need sorting
        for (let i = 0; i < g.planesOrdered.length; ++i) {
            const plane = g.planesOrdered[i];

            TrackedHistorySize += plane.history_size;

            if (tableInView) {
                if (plane.visible)
                    TrackedAircraft++;
                if ((plane.inView && plane.visible) || plane.selected) {
                    pList.push(plane);
                    TrackedAircraftPositions++;
                }
            } else {
                if (plane.visible) {
                    TrackedAircraft++;
                    pList.push(plane);
                    if (plane.position != null)
                        TrackedAircraftPositions++;
                }
            }
        }

        ctime && console.timeEnd("inView");

        ctime && console.time("resortTable");
        resortTable(pList);
        ctime && console.timeEnd("resortTable");

        const sidebarVisible = toggles['sidebar_visible'].state;

        let inTable = []; // list of planes that will actually be displayed in the table

        ctime && console.time("modTRs");
        for (let i in pList) {
            const plane = pList[i];

            if (!sidebarVisible || (inTable.length > globeTableLimit && mapIsVisible && globeIndex)) {
                break;
            }
            inTable.push(plane);

            if (plane.tr == null) {
                plane.makeTR(planeRowTemplate.cloneNode(true));
                plane.tr.id = plane.icao;
                plane.refreshTR = 0;
            }

            if (now - plane.refreshTR > 5 || plane.selected != plane.selectCache) {
                plane.refreshTR = now;
                let colors = tableColors.unselected;
                let bgColor = "#F8F8F8"

                plane.selectCache = plane.selected;
                if (plane.selected)
                    colors = tableColors.selected;

                if (plane.dataSource && plane.dataSource in colors)
                    bgColor = colors[plane.dataSource];

                if (plane.squawk in tableColors.special) {
                    bgColor = tableColors.special[plane.squawk];
                    plane.bgColorCache = bgColor;
                    plane.tr.style = "background-color: " + bgColor + "; color: black;";
                } else if (plane.bgColorCache != bgColor) {
                    plane.bgColorCache = bgColor;
                    plane.tr.style = "background-color: " + bgColor + ";";
                }

                for (let cell in activeCols) {
                    let col = activeCols[cell];
                    if (!col.value)
                        continue;
                    let newValue = col.value(plane);
                    if (newValue != plane.trCache[cell]) {
                        plane.trCache[cell] = newValue;
                        if (col.html) {
                            plane.tr.cells[cell].innerHTML = newValue;
                        } else {
                            plane.tr.cells[cell].textContent = newValue;
                        }
                    }
                }
            }
        }
        ctime && console.timeEnd("modTRs");

        global.refreshPageTitle();
        jQuery('#dump1090_total_history').updateText(TrackedHistorySize);
        jQuery('#dump1090_message_rate').updateText(MessageRate === null ? 'n/a' : MessageRate.toFixed(1));
        jQuery('#dump1090_total_ac').updateText(globeIndex ? globeTrackedAircraft : TrackedAircraft);
        jQuery('#dump1090_total_ac_positions').updateText(TrackedAircraftPositions);



        ctime && console.time("DOM1");

        let newBody = document.createElement('tbody');
        for (let i in inTable) {
            const plane = inTable[i];
            newBody.appendChild(plane.tr);
        }

        ctime && console.timeEnd("DOM1");
        ctime && console.time("DOM2");

        htmlTable.replaceChild(newBody, tbody);
        tbody.remove();
        tbody = newBody;

        ctime && console.timeEnd("DOM2");

        ctime && console.timeEnd("planeMan.refresh()");
        atime && console.timeEnd("planeMan.refresh()");
    }

    //
    // ---- table sorting begin ----
    //

    planeMan.sortId = '';
    planeMan.sortCompare = null;
    planeMan.sortExtract = null;
    planeMan.sortAscending = true;

    function sortFunction(x,y) {
        const xv = x._sort_value;
        const yv = y._sort_value;

        // always sort missing values at the end, regardless of
        // ascending/descending sort
        if (xv == null && yv == null) return x._sort_pos - y._sort_pos;
        if (xv == null) return 1;
        if (yv == null) return -1;

        const c = planeMan.sortAscending ? planeMan.sortCompare(xv,yv) : planeMan.sortCompare(yv,xv);
        if (c !== 0) return c;

        return x._sort_pos - y._sort_pos;
    }

    function resortTable(pList) {
        if (!planeMan.sortExtract)
            return;
        if (globeIndex) {
            // don't presort for globeIndex
        }
        // presort by dataSource
        else if (planeMan.sortId == "sitedist") {
            for (let i = 0; i < pList.length; ++i) {
                pList[i]._sort_pos = i;
            }
            pList.sort(function(x,y) {
                const a = x.getDataSourceNumber();
                const b = y.getDataSourceNumber();
                if (a == b)
                    return (x._sort_pos - y._sort_pos);

                return (a-b);
            });
        }
        // or distance
        else if (planeMan.sortId == "data_source") {
            pList.sort(function(x,y) {
                return (x.sitedist - y.sitedist);
            });
        }
        // or longitude
        else {
            pList.sort(function(x,y) {
                return (x.position ? x.position[0] : 500) - (y.position ? y.position[0] : 500);
            });
        }

        // number the existing rows so we can do a stable sort
        // regardless of whether sort() is stable or not.
        // Also extract the sort comparison value.
        if (globeIndex) {
            for (let i = 0; i < pList.length; ++i) {
                pList[i]._sort_pos = pList[i].numHex;
                pList[i]._sort_value = planeMan.sortExtract(pList[i]);
            }
        } else {
            for (let i = 0; i < pList.length; ++i) {
                pList[i]._sort_pos = i;
                pList[i]._sort_value = planeMan.sortExtract(pList[i]);
            }
        }

        pList.sort(sortFunction);

        // In multiSelect put selected planes on top, do a stable sort!
        if (multiSelect) {
            for (let i = 0; i < pList.length; ++i) {
                pList[i]._sort_pos = i;
            }
            pList.sort(function(x,y) {
                if (x.selected && y.selected) {
                    return (x._sort_pos - y._sort_pos);
                }
                if (x.selected)
                    return -1;
                if (y.selected)
                    return 1;

                return (x._sort_pos - y._sort_pos);
            });
        }
    }

    function sortBy(id, sc, se) {
        loStore['sortCol'] = id;

        if (id === planeMan.sortId) {
            planeMan.sortAscending = !planeMan.sortAscending;
            g.planesOrdered.reverse(); // this correctly flips the order of rows that compare equal
        }

        loStore['sortAscending'] = planeMan.sortAscending ? 'true' : '';

        planeMan.sortId = id;
        planeMan.sortCompare = sc;
        planeMan.sortExtract = se;

        planeMan.refresh();
    }

    //
    // ---- table sorting end ----
    //

    function createColumnToggles() {
        const prefix = 'dd_';
        const sortableColumns = jQuery('#sortableColumns').sortable({
            update: function (event, ui) {
                const order = [];
                jQuery('#sortableColumns li').each(function (e) {
                    order.push(jQuery(this).attr('id').replace(prefix, ''));
                });

                loStore['columnOrder'] = JSON.stringify(order);
                columns = createOrderedColumns();

                planeMan.redraw();
            }
        });

        for (let col of columns) {
            sortableColumns.append(`<li class="ui-state-default" id="${prefix + col.id}"></li>`);

            new Toggle({
                key: col.toggleKey,
                display: col.text,
                container: jQuery(`#${prefix + col.id}`),
                init: col.visible,
                setState: function (state) {
                    planeMan.setColumnVis(col.id, state);
                }
            });
        }
    }

    function createOrderedColumns() {
        const order = loStore['columnOrder'];
        if (order !== undefined) {
            const columns = [];
            for (let col of JSON.parse(order)) {
                const column = cols[col];
                if (column !== undefined) {
                    columns.push(column);
                }
            }
            if (columns.length > 0) {
                return columns;
            }
        }
        return Object.values(cols);
    }

    return TAR;
}(window, jQuery, TAR || {}));
//
// g.planes table end
//
