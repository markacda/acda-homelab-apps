let timers = {};
let timersActive = false;
function clearIntervalTimers(arg) {
    if (!timersActive) {
        console.trace();
        return;
    }

    if (loadFinished && arg != 'silent') {
        console.log(localTime(new Date()) + ' clear timers');
        jQuery("#timers_paused_detail").text('Timers paused (tab hidden).');
        jQuery("#timers_paused").css('display','block');
    }
    const entries = Object.entries(timers);
    for (let i in entries) {
        clearInterval(entries[i][1]);
    }

    timersActive = false;

    // in case the visibility changed while this was running
    handleVisibilityChange();
}

function setIntervalTimers() {
    if (timersActive) {
        return;
    }

    if (loadFinished) {
        jQuery("#timers_paused").css('display','none');
    }
    console.log(localTime(new Date()) + " set timers ");
    pollPositionInterval();
    setAutoselect();

    timers.checkMove = setInterval(checkMovement, 50);
    timers.everySecond = setInterval(everySecond, 850);

    //timers.reaper = setInterval(reaper, 40000);

    if (tempTrails) {
        timers.trailReaper = window.setInterval(trailReaper, 10000);
        trailReaper(now);
    }
    if (enable_pf_data && !pTracks && !globeIndex) {
        jQuery('#pf_info_container').removeClass('hidden');
        timers.pf_data = window.setInterval(fetchPfData, RefreshInterval*10.314);
        fetchPfData();
    }
    if (actualOutline.enabled) {
        timers.drawOutline = window.setInterval(drawOutlineJson, actualOutline.refresh);
        setTimeout(drawOutlineJson, 50);
    }

    if (aiscatcher_server) {
        timers.aiscatcher = setInterval(updateAIScatcher, aiscatcher_refresh * 1000);
        updateAIScatcher();
    }
    if (droneJson) {
        timers.droneJson = setInterval(updateDrones, droneRefresh * 1000);
        updateDrones();
    }

    timersActive = true;

    fetchData();

    // in case the visibility changed while this was running
    handleVisibilityChange();
}

function updateDrones() {
    let jsons = Array.isArray(droneJson) ? droneJson : [ droneJson ];
    for (let i in jsons) {
        let req = jQuery.ajax({
            url: jsons[i],
            dataType: 'json',
        });

        req.done(function(data) {
            handleDrones(data);
        });
    }
}

function handleDrones(data) {
    g.droneLast = g.droneNow || 0;
    g.droneNow = new Date().getTime() / 1000;

    for (let i in data) {
        processDrone(data[i], g.droneNow, g.droneLast);
    }
}

function processDrone(drone, now, last) {
    const hex = drone.id;

    // Do we already have this plane object in g.planes?
    // If not make it.
    let plane = g.planes[hex]

    if (!plane) {
        plane = new PlaneObject(hex);
    }

    let ac = drone;

    ac.type = 'other';
    ac.t = 'DRON';
    ac.gs = drone.speed / 1852 * 3600; // m/s to knots
    ac.flight = drone.description;
    ac.alt_baro = drone.alt * 3.28; // m to ft
    ac.baro_rate = drone.vspeed * 3.28 * 60; // m/s to fpm

    ac.seen = now - new Date(drone.time).getTime() / 1000;

    if (drone.lat && drone.lon) {
        ac.lat = drone.lat;
        ac.lon = drone.lon
        ac.seen_pos = ac.seen;
    }
    //console.log(ac);

    plane.updateData(now, last, ac, false);
}

function updateAIScatcher() {
    let req = jQuery.ajax({
        url: aiscatcher_server + '/geojson',
        dataType: 'text',
    });

    req.done(function(data) {
        //console.log(data);
        g.aiscatcher_source.setUrl("data:text/plain;base64,"+btoa(data));
        g.aiscatcher_source.refresh();

        if (1 || aiscatcher_test) {
            processAIS(JSON.parse(data));
        }
    });
}

function processAIS(data) {
    g.ais_last = g.ais_now || 0;
    g.ais_now = new Date().getTime() / 1000;

    const features = data.features;
    aisTimeout = data.time_span || aisTimeout;
    for (let i in features) {
        processBoat(features[i], g.ais_now, g.ais_last);
    }
}

function shortShiptype(typeNumber) {
    if (typeNumber == 0) return "UNKN";
    if (typeNumber <= 19) return "RESE";
    if (typeNumber <= 28) return "WING";
    if (typeNumber <= 29) return "ASAR"; //Airborne SAR
    if (typeNumber <= 30) return "FISH";
    if (typeNumber <= 32) return "TUG";
    if (typeNumber <= 33) return "DRED";
    if (typeNumber <= 34) return "DIVE";
    if (typeNumber <= 35) return "MIL";
    if (typeNumber <= 36) return "SAIL";
    if (typeNumber <= 37) return "YACH";
    if (typeNumber <= 39) return "RESE";
    if (typeNumber <= 49) return "HSPD";
    if (typeNumber <= 50) return "PILO";
    if (typeNumber <= 50) return "PILO";
    if (typeNumber <= 51) return "SAR";
    if (typeNumber <= 52) return "TUG";
    if (typeNumber <= 53) return "TEND";
    if (typeNumber <= 54) return "POLC";
    if (typeNumber <= 55) return "LAW";
    if (typeNumber <= 57) return "LOC";
    if (typeNumber <= 58) return "MED";
    if (typeNumber <= 59) return "SPEC";
    if (typeNumber <= 69) return "PASS";
    if (typeNumber <= 79) return "CARG";
    if (typeNumber <= 89) return "TANK";
    if (typeNumber <= 99) return "OTHE";
    return "";
}

function processBoat(feature, now, last) {
    const pr = feature.properties;
    const hex = 'MMSI' + pr.mmsi;

    // Do we already have this plane object in g.planes?
    // If not make it.
    let plane = g.planes[hex]

    if (!plane) {
        plane = new PlaneObject(hex);
        plane.country = pr.country;
        plane.country_code = pr.country;
        plane.baseScale = 0.2;
    }

    let ac = {};

    ac.type = 'ais';
    ac.gs = pr.speed;
    ac.flight = pr.callsign;
    ac.r = pr.shipname;
    ac.seen = now - pr.last_signal;

    ac.messages  = pr.count;
    ac.rssi      = pr.level;

    ac.track = pr.cog;

    if (pr.destination) { ac.route = pr.destination; }
    if (pr.shiptype !== undefined) { ac.t = shortShiptype(pr.shiptype); }
    // Identify Non-Ship Types
    if (pr.mmsi_type == 6) { ac.t = "ANAV"; } // Aids to Navigation
    if (pr.mmsi_type == 5) {ac.t = "BASE"; } // Land Base Station
    if (pr.mmsi_type == 3) {ac.t = "COAS"; } // Coast Station


    if (feature.geometry && feature.geometry.coordinates) {
        const coords = feature.geometry.coordinates;
        ac.lat = coords[1];
        ac.lon = coords[0];
        ac.seen_pos = now - pr.last_signal;
    }
    //console.log(ac);

    plane.updateData(now, last, ac, false);
}

let djson;
let dstring;
let dresult;

function startPage() {
    if (!heatmap)
        jQuery("#loader").hide();

    changeZoom("init");
    changeCenter("init");

    processURLParams();
    if (usp.has('reg')) {
        let req = regIcaoDownload();
        req.done(function() {
            const queries = usp.get('reg').split(',');
            for (let i in queries) {
                let icao = db.regCache[queries[i].toUpperCase()];
                if (icao) {
                    icao = icao.toLowerCase();
                    urlIcaos.push(icao);
                }
            }
            processURLParams();
        });
    }

    loadFinished = true;

    setIntervalTimers();

    if (tempTrails)
        selectAllPlanes();

    if (replay) {
        showReplayBar();
        loadReplay(replay.ts);
    }

    if (heatmap) {
        drawHeatmap();
    }

    initVisibilityChange();

    if (pTracks)
        setTimeout(TAR.planeMan.refresh, 10000);

    window.addEventListener("beforeunload", clearIntervalTimers);

    setTimeout(afterFirstFetch, 50);

    console.timeEnd("Page Load");
}

//
// Utils begin
//
(function (global, jQuery, TAR) {
    let utils = TAR.utils = TAR.utils || {};

    // Make a LineString with 'points'-number points
    // that is a closed circle on the sphere such that the
    // great circle distance from 'center' to each point is
    // 'radius' meters
    utils.make_geodesic_circle = function (center, radius, points) {
        const angularDistance = radius / 6378137.0;
        const lon1 = center[0] * Math.PI / 180.0;
        const lat1 = center[1] * Math.PI / 180.0;

        let geom;
        for (let i = 0; i <= points; ++i) {
            const bearing = i * 2 * Math.PI / points;

            let lat2 = Math.asin(Math.sin(lat1) * Math.cos(angularDistance) +
                Math.cos(lat1) * Math.sin(angularDistance) * Math.cos(bearing));
            let lon2 = lon1 + Math.atan2(Math.sin(bearing) * Math.sin(angularDistance) * Math.cos(lat1),
                Math.cos(angularDistance) - Math.sin(lat1) * Math.sin(lat2));

            lat2 = lat2 * 180.0 / Math.PI;
            lon2 = lon2 * 180.0 / Math.PI;

            if (!geom)
                geom = new ol.geom.LineString([[lon2, lat2]]);
            else
                geom.appendCoordinate([lon2, lat2]);
        }
        return geom;
    }

    return TAR;
}(window, jQuery, TAR || {}));
//
// Utils end
//
//
