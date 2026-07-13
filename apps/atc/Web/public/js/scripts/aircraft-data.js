function processAircraft(ac, init, uat) {
    const isArray = Array.isArray(ac);
    let hex = isArray ? ac[0] : ac.hex;

    if (icaoFilter && !icaoFilter.includes(hex))
        return;

    if (icaoBlacklist && icaoBlacklist.includes(hex))
        return;

    if (MergeNonIcao && hex.startsWith('~')) {
        hex = hex.slice(1);
    }

    const type = isArray ? ac[7] : ac.type;
    if (g.historyKeep && !g.historyKeep[hex] && type != 'adsc') {
        return;
    }

    if (uat && uatNoTISB && ac.type && ac.type.substring(0,4) == "tisb") {
        // drop non ADS-B planes from UAT (TIS-B)
        return;
    }

    // Do we already have this plane object in g.planes?
    // If not make it.
    let plane = g.planes[hex]

    if (!plane) {
        plane = new PlaneObject(hex);
        if (uat)
            plane.uat = true;
    }


    if (showTrace)
        return;

    // Call the function update
    if (globeIndex || replay) {
        if (!onlyMilitary || plane.military || (ac.dbFlags && ac.dbFlags & 1)) {
            plane.updateData(now, last, ac, init);
        } else {
            plane.last_message_time = now - ac.seen;
        }
        return;
    }
    if (uat_now == 0) {
        plane.updateData(now, last, ac, init);
        return;
    }

    // UAT dual source stuff below

    let newPos = ac.seen_pos;
    if (newPos === undefined || isNaN(newPos)) {
        newPos = 1000;
    }
    let oldPos = plane.seen_pos;
    if (oldPos === undefined || isNaN(oldPos)) {
        oldPos = 1000;
    }
    let newSeen = ac.seen;
    if (newSeen === undefined || isNaN(newSeen)) {
        newSeen = 1000;
    }
    let oldSeen = plane.seen;
    if (oldSeen === undefined || isNaN(oldSeen)) {
        oldSeen = 1000;
    }

    if (!uat) {
        if (!plane.uat // plane isn't uat, new data isn't uat, accept immediately
            || (prefer978 < 0 && newPos < -prefer978)
            || (newPos < 2 && oldPos > 4 + prefer978)
            || (oldPos > 60 && newSeen < 2 && oldSeen > 4 + prefer978)
            || init) {
            plane.uat = false;
            plane.updateData(now, last, ac, init);
        }
    } else {
        if (plane.uat // plane is uat, new data is uat, accept immediately
            || (prefer978 > 0 && newPos < prefer978)
            || (newPos < 2 && (oldPos > 4 - prefer978 || plane.dataSource == "mlat"))
            || (oldPos > 60 && newSeen < 2 && oldSeen > 4 - prefer978)
            || init) {
            let tisb = Array.isArray(ac) ? (ac[7] == "tisb") : (ac.tisb != null && ac.tisb.indexOf("lat") >= 0);
            if (tisb && plane.dataSource == "adsb") {
                // ignore TIS-B data for current ADS-B 1090 planes
            } else {
                plane.uat = true;
                plane.updateData(uat_now, uat_last, ac, init);
            }
        }
    }
}

let notNewCounter = 0;
let backwardsCounter = 0;
function processReceiverUpdate(data, init) {
    // update now and last
    let uat = data.uat_978;
    if (uat) {
        if (data.now <= uat_now)
            return;
        uat_last = uat_now;
        uat_now = data.now;
    } else {
        if (uat_now && now - uat_now > 15) {
            uat_now = now;
        }
        if (data.now <= now && !globeIndex) {
            if (data.now < now) {
                backwardsCounter++;
                console.log('timestep backwards or the same, ignoring data: ' + now + ' -> ' + data.now);
                if (backwardsCounter >= 5) {
                    backwardsCounter = 0;
                    console.log('resetting all data now:' + now + ' -> ' + data.now);
                    now = data.now;
                    last = now - 1;
                    reaper(1);
                    enableDynamicCachebusting = true;
                }
            }
            if (++notNewCounter > 2) {
                // data.now is too old, possibly a caching issues
                enableDynamicCachebusting = true;
            }
            return;
        }
        if (data.now > now) {
            if (0 && now && data.now - now > 10) {
                console.log('now jumped: ' + localTime(new Date(now * 1000)) + ' -> ' + localTime(new Date(data.now * 1000)));
            }
            notNewCounter = 0;
            backwardsCounter = 0;
            last = now;
            now = data.now;
        }
    }
    g.now = now;

    if (globeIndex) {
        if ((showGrid || loStore['globeGrid'] == 'true')
            && globeIndexNow[data.globeIndex] == null)
            drawTileBorder(data);
        globeTrackedAircraft = data.global_ac_count_withpos;
        globeIndexNow[data.globeIndex] = data.now;
    }

    if (!(uat || init || (globeIndex && aggregator))) {
        updateMessageRate(data);
    }

    // Loop through all the planes in the data packet
    for (let j=0; j < data.aircraft.length; j++) {
        processAircraft(data.aircraft[j], init, uat);
    }
    updateDistanceMeasurementLine();
}
function fetchFail(jqxhr, status, error) {
    try {
        pendingFetches--;
        if (pendingFetches <= 0 && !tabHidden) {
            triggerRefresh++;
            checkMovement();
        }
        status = jqxhr.status;
        if (jqxhr.readyState == 0) error = "Can't connect to server, check your network!";
        let errText = status + (error ? (": " + error) : "");
        console.log(jqxhr);
        console.log(error);
        if (status != 429 && status != '429') {
            jQuery("#update_error_detail").text(errText);
            jQuery("#update_error").css('display','block');
            StaleReceiverCount++;
        }
    } catch (e) {
        console.error(e);
    }
}

function fetchDone(data) {
    try {
        pendingFetches--;
        if (data == null) {
            return;
        }
        // Parse JSON from api.airplanes.live
        parseAirplanesLiveJSON(data);
        data.urlIndex = this.urlIndex;

        if (!data.aircraft || !data.now) {
            let error = data.error;
            if (error) {
                jQuery("#update_error_detail").text(error);
                jQuery("#update_error").css('display','block');
                StaleReceiverCount++;
            }
            return;
        }

        if (!timersActive) {
            //console.log(localTime(new Date()) + " fetchDone: not applying data due to !timersActive");
            return;
        }

        //console.time("Process " + data.globeIndex);
        processReceiverUpdate(data);
        //console.timeEnd("Process " + data.globeIndex);
        data = null;

        if (uat_data) {
            processReceiverUpdate(uat_data);
            uat_data = null;
        }

        if (pendingFetches <= 0 && !tabHidden) {
            triggerRefresh++;
            checkMovement();
            if (firstFetch) {
                firstFetch = false;
                if (uuid) {
                    const ext = myExtent(OLMap.getView().calculateExtent(OLMap.getSize()));
                    let jump = true;
                    for (let i = 0; i < g.planesOrdered.length; ++i) {
                        const plane = g.planesOrdered[i];
                        if (plane.visible && inView(plane.position, ext)) {
                            jump = false;
                            break;
                        }
                    }
                    if (jump) {
                        followRandomPlane();
                        deselectAllPlanes();
                        OLMap.getView().setZoom(6);
                    }
                }
                checkRefresh();
            }
        }
        fetchDoneCount++;
        if (fetchDoneCount == 1) { console.timeEnd("first fetch()"); };

        if (!g.firstFetchDone) { afterFirstFetch(); };

        // Check for stale receiver data
        if (last == now && !globeIndex) {
            StaleReceiverCount++;
            if (StaleReceiverCount > 5) {
                jQuery("#update_error_detail").text("The data from the server hasn't been updated in a while.");
                jQuery("#update_error").css('display','block');
            }
        } else if (StaleReceiverCount > 0){
            StaleReceiverCount = 0;
            jQuery("#update_error").css('display','none');
        }
    } catch (e) {
        console.error(e);
    }
}

function db_load_type_cache() {
    return jQuery.getJSON('api/globe-airplanes-live/' + databaseFolder + "/icao_aircraft_types2.js").done(function(typeLookupData) {
        g.type_cache = typeLookupData;
        for (let i in g.planesOrdered) {
            g.planesOrdered[i].setTypeData();
        }
    });
}

g.afterLoadDone = false;
g.afterLoad = [];
function runAfterLoad(func) {
    if (g.afterLoadDone) {
        func()
    } else {
        g.afterLoad.push(func);
    }
}

function afterFirstFetch() {
    if (g.firstFetchDone) { return; }

    g.firstFetchDone = true;

    updateVisible();
    mapRefresh();

    setTimeout(() => {
        console.time('afterFirstFetch()');


        let func;
        while ((func = g.afterLoad.pop())) {
            func();
        }
        g.afterLoadDone = true;
        while ((func = g.afterLoad.pop())) {
            func();
        }


        geoMag = geoMagFactory(cof2Obj());

        db_load_type_cache().always(function() {
            refresh();
        });

        if (usp.has('screenshot')) {
            clearIntervalTimers('silent');
        }

        console.timeEnd('afterFirstFetch()');
    }, 30);
}

let debugFetch = false;
let fetchCalls = 0;
let fetchDoneCount = 0;
function fetchData(options) {
    options = options || {};
    if (!timersActive) {
        //console.log(localTime(new Date()) + " fetchData inhibited by !timersActive");
        return;
    }
    if (heatmap || replay || showTrace || pTracks || !loadFinished || inhibitFetch) {
        return;
    }
    let currentTime = new Date().getTime();
    const refreshMs = RefreshInterval // refreshInt()
    g.lastRefreshInt = refreshMs;

    if (!options.force) {
        if (
            currentTime - lastFetch <= refreshMs
            || pendingFetches > 0
            || OLMap.getView().getInteracting()
            || OLMap.getView().getAnimating()
        ) {
            return;
        }
    }
    setTimeout(fetchData, refreshMs);
    if (debugFetch) {
        console.log('Time since last fetch: ' + (currentTime - lastFetch) + ' ms');
    }
    lastFetch = currentTime;

    FetchPending = [];
    if (FetchPendingUAT != null) {
        // don't double up on fetches, let the last one resolve
        return;
    }

    //console.timeEnd("Starting Fetch");
    //console.time("Starting Fetch");

    if (limitUpdates != -1 && fetchCalls > limitUpdates) {
        return;
    }
    fetchCalls++;

    if (fetchCalls == 1) { console.time("first fetch()"); };

    if (enable_uat) {
        FetchPendingUAT = jQuery.ajax({ url: 'chunks/978.json',
            dataType: 'json' });

        FetchPendingUAT.done(function(data) {
            uat_data = data;
            FetchPendingUAT = null;
        });
        FetchPendingUAT.fail(function(jqxhr, status, error) {
            FetchPendingUAT = null;
        });
    }

    // Get map center and calculate radius for API call
    let mapCenter = ol.proj.toLonLat(OLMap.getView().getCenter());
    let mapExtent = OLMap.getView().calculateExtent(OLMap.getSize());
    let extentLonLat = ol.proj.transformExtent(mapExtent, 'EPSG:3857', 'EPSG:4326');

    // Calculate radius in nautical miles from map extent
    let latDiff = extentLonLat[3] - extentLonLat[1];
    let lonDiff = extentLonLat[2] - extentLonLat[0];
    let radiusNM = Math.max(latDiff, lonDiff) * 60 / 2; // Convert degrees to NM and take half (radius)
    radiusNM = Math.max(25, Math.min(250, radiusNM)); // Clamp between 25 and 250 NM

    let ac_url = [];
    // Call local proxy server which forwards to api.airplanes.live
    let apiUrl = `/api/airplanes/${mapCenter[1].toFixed(4)}/${mapCenter[0].toFixed(4)}/${Math.round(radiusNM)}`;
    ac_url.push(apiUrl);

    pendingFetches += ac_url.length;
    fetchCounter += ac_url.length;

    for (let i in ac_url) {
        if (debugFetch) {
            console.log('Fetching: ' + ac_url[i]);
        }
        let req;
        // Always use JSON for Airplanes.live API
        req = jQuery.ajax({ url: `${ac_url[i]}`, dataType: 'json', urlIndex: i });
        FetchPending.push(req);

        req
            .done(fetchDone)
            .fail(fetchFail);
    }


    if (now - lastReap > 60) {
        reaper();
    }
}
