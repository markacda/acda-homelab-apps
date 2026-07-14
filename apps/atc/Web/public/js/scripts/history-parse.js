function initLegend(colors) {
  let html = '';
  html += '<div class="legendTitle" style="background-color:' + colors['adsb'] + ';">ADS-B</div>';
  html += '<div class="legendTitle" style="background-color:' + colors['uat'] + ';">UAT / ADS-R</div>';
  html += '<div class="legendTitle" style="background-color:' + colors['mlat'] + ';">MLAT</div>';
  html += '<br>';
  html += '<div class="legendTitle" style="background-color:' + colors['tisb'] + ';">TIS-B</div>';
  if (!globeIndex) html += '<div class="legendTitle" style="background-color:' + colors['modeS'] + ';">Mode-S</div>';
  if (globeIndex) html += '<div class="legendTitle" style="background-color:' + colors['other'] + ';">Other</div>';
  if (aiscatcher_server) html += '<div class="legendTitle" style="background-color:' + colors['ais'] + ';">AIS</div>';
  html += '<div class="legendTitle" style="background-color:' + colors['adsc'] + `;">${jaeroLabel}</div>`;

  document.getElementById('legend').innerHTML = html;
}

function initSourceFilter(colors) {
  const createFilter = function (color, text, key) {
    return '<li class="ui-widget-content" style="background-color:' + color + ';" id="source-filter-' + key + '">' + text + '</li>';
  };

  let html = '';
  html += createFilter(colors['adsb'], 'ADS-B', sources[0]);

  html += createFilter(colors['uat'], 'UAT / ADS-R', sources[1][0]);
  html += createFilter(colors['mlat'], 'MLAT', sources[2]);
  html += createFilter(colors['tisb'], 'TIS-B', sources[3]);
  html += createFilter(colors['modeS'], 'Mode-S', sources[4]);
  html += createFilter(colors['other'], 'Other', sources[5]);
  html += createFilter(colors['adsc'], jaeroLabel, sources[6]);

  if (aiscatcher_server) {
    html += createFilter(colors['ais'], 'AIS', sources[7]);
  }

  document.getElementById('sourceFilter').innerHTML = html;

  jQuery('#sourceFilter').selectable({
    stop: function () {
      sourcesFilter = [];
      jQuery('.ui-selected', this).each(function () {
        const index = jQuery('#sourceFilter li').index(this);
        if (Array.isArray(sources[index]))
          sources[index].forEach((member) => {
            sourcesFilter.push(member);
          });
        else sourcesFilter.push(sources[index]);
      });
    },
  });

  jQuery('#sourceFilter').on('selectablestart', function (event, ui) {
    event.originalEvent.ctrlKey = true;
  });
}

function initFlagFilter(colors) {
  const createFilter = function (color, text, key) {
    return '<li class="ui-widget-content" style="background-color:' + color + ';" id="flag-filter-' + key + '">' + text + '</li>';
  };

  let html = '';
  html += createFilter(colors['tisb'], 'Military', flagFilterValues[0]);
  //html += createFilter(colors['mlat'], 'Interesting');
  html += createFilter(colors['uat'], 'PIA', flagFilterValues[1]);
  html += createFilter(colors['adsb'], 'LADD', flagFilterValues[2]);

  document.getElementById('flagFilter').innerHTML = html;

  jQuery('#flagFilter').selectable({
    stop: function () {
      flagFilter = [];
      jQuery('.ui-selected', this).each(function () {
        const index = jQuery('#flagFilter li').index(this);
        if (Array.isArray(flagFilterValues[index]))
          flagFilterValues[index].forEach((member) => {
            flagFilter.push(member);
          });
        else flagFilter.push(flagFilterValues[index]);
      });
    },
  });

  jQuery('#flagFilter').on('selectablestart', function (event, ui) {
    event.originalEvent.ctrlKey = true;
  });
}

function push_history() {
  HistoryItemsReturned = 0;
  PositionHistoryBuffer = [];

  for (let i = 0; i < nHistoryItems; i++) {
    push_history_item(i);
  }
}

function push_history_item(i) {
  deferHistory[i]
    .done(function (json) {
      HistoryItemsReturned++;

      if (HistoryChunks) {
        if (json && json.files) {
          //g.refreshHistory && console.log("itemsreturned chunk: " + HistoryItemsReturned + " chunklen: " + json.files.length);
          for (let i in json.files) {
            PositionHistoryBuffer.push(json.files[i]);
            if (i == 0 || i == json.files.length - 1) {
              //g.refreshHistory && console.log("history buffer push: " + localTime(new Date(json.files[i].now * 1000)));
            }
          }
        } else if (json && json.now) {
          //g.refreshHistory && console.log("itemsreturned simple json: " + HistoryItemsReturned);
          PositionHistoryBuffer.push(json);
          //g.refreshHistory && console.log("history buffer push: " + localTime(new Date(json.now * 1000)));
        }
      } else {
        PositionHistoryBuffer.push(json);
      }

      if (HistoryItemsReturned == nHistoryItems) {
        parseHistory();
      }
      if (HistoryItemsReturned > nHistoryItems) {
        console.log(localTime(new Date()) + ' WARNING: (HistoryItemsReturned > nHistoryItems)');
      }
    })

    .fail(function (jqxhr, status, error) {
      //Doesn't matter if it failed, we'll just be missing a data point
      //console.log(error);
      HistoryItemsReturned++;
      if (HistoryItemsReturned == nHistoryItems) {
        parseHistory();
      }
    });
}

function parseHistory() {
  console.timeEnd('Downloaded History');
  console.time('Loaded aircraft tracks from History');

  for (let i in deferHistory) deferHistory[i] = null;
  deferHistory = null;

  if (PositionHistoryBuffer.length > 0) {
    // Sort history by timestamp
    console.log(localTime(new Date()) + ' Sorting history: ' + PositionHistoryBuffer.length);
    PositionHistoryBuffer.sort(function (x, y) {
      return y.now - x.now;
    });

    let currentTime = new Date().getTime() / 1000;

    if (!pTracks && !noVanish) {
      // get all planes within the reapTimeout
      g.historyKeep = {};
      for (let i = 0; i < PositionHistoryBuffer.length; i++) {
        let data = PositionHistoryBuffer[i];
        if (currentTime - data.now > reapTimeout) {
          break;
        }
        for (let j = 0; j < data.aircraft.length; j++) {
          const ac = data.aircraft[j];
          const isArray = Array.isArray(ac);
          const hex = isArray ? ac[0] : ac.hex;
          const seen = isArray ? ac[6] : ac.seen;
          if (currentTime - (data.now - seen) < reapTimeout) {
            g.historyKeep[hex] = 1;
          }
        }
        //console.log("hist: " + localTime(new Date(data.now * 1000)));
      }
      for (let i in g.planesOrdered) {
        let hex = g.planesOrdered[i].icao;
        g.historyKeep[hex] = 1;
      }
    }

    // Process history
    let data;
    let h = 0;
    let pruneInt = 100;
    let lastTimestamp = 0;
    let counter = 0;

    while ((data = PositionHistoryBuffer.pop())) {
      counter++;

      if (data.now < lastTimestamp) {
        console.log('parseHistory sorting issue');
      }

      if (lastTimestamp && data.now - lastTimestamp > 15) {
        console.log(
          'History ' +
            String(counter).padStart(4) +
            ' from: ' +
            localTime(new Date(data.now * 1000)) +
            ' GAP: ' +
            localTime(new Date(lastTimestamp * 1000))
        );
      }

      lastTimestamp = data.now;

      if (pTracks && currentTime - data.now > pTracks * 3600) {
        continue;
      }

      if (g.refreshHistory && now > data.now) {
        continue;
      }

      // process new data
      if (PositionHistoryBuffer.length < 10) {
        processReceiverUpdate(data, false);
      } else {
        processReceiverUpdate(data, true);
      }

      ++h;
      if (h == 1 || h % pruneInt == 0 || PositionHistoryBuffer.length == 0) {
        console.log('Apply History ' + String(counter).padStart(4) + ' from: ' + localTime(new Date(data.now * 1000)));
      }
    }

    // only restrict aircraft process to this list while parsing history
    g.historyKeep = null;

    reaper();

    // Final pass to update all planes to their latest state
    //console.log("Final history cleanup pass");
    for (let i in g.planesOrdered) {
      let plane = g.planesOrdered[i];

      if (plane.position && SitePosition && !pTracks) plane.sitedist = ol.sphere.getDistance(SitePosition, plane.position);

      if (uatNoTISB && plane.uat && plane.type && plane.type.substring(0, 4) == 'tisb') {
        plane.last_message_time -= 999;
      }
    }
  }

  console.timeEnd('Loaded aircraft tracks from History');

  if (g.refreshHistory) {
    g.refreshHistory = false;
    noLongerHidden();
    return;
  }

  historyLoaded.resolve();
}

let replay_was_active = false;
