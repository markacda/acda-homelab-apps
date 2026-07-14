// Some global variables are defined in early.js
// early.js takes care of getting some history files while the html page and
// some javascript libraries are still loading, hopefully speeding up loading

'use strict';

g.planes = {};
g.planesOrdered = [];
g.route_cache = [];
g.route_check_todo = {};
g.route_check_in_flight = false;
g.route_next_lookup = 0;
g.route_last_lookup = 0;

g.mapOrientation = mapOrientation;

// Define our global variables
let tabHidden = false;
let webgl = false;
let webglFeatures = new ol.source.Vector();
let webglLayer;
let OLMap = null;
let OLProj = null;
let OLProjExtent = null;
let PlaneIconFeatures = new ol.source.Vector();
let trailGroup = new ol.Collection();
let siteCircleLayer;
let siteCircleFeatures = new ol.source.Vector();
let locationDotLayer;
let locationDotFeatures = new ol.source.Vector();
let distanceMeasurementFeatures = new ol.source.Vector();
let distanceMeasurementLayer;
let distanceMeasurementState = {
  firstPlaneIcao: null,
  secondPlaneIcao: null,
  mouseCoordinate: null,
  line: null,
  label: null,
  isActive: false,
};
// Distance-measure interaction mode (header "D" button); transient, not persisted.
let distanceMode = false;
// Set true when a long-press toggled a speed vector, so the following synthetic
// click is swallowed instead of (de)selecting the plane.
let longPressFired = false;
let iconLayer;
let trailLayers;
let heatFeatures = [];
let heatFeaturesSpread = 1024;
let heatLayers = [];
let realHeatFeatures = new ol.source.Vector();
let realHeat;
let iconCache = {};
let addToIconCache = [];
let lineStyleCache = {};
let replayPlanes = {};
let PlaneFilter = {};
let SelectedPlane = null;
let sp = null;
let SelPlanes = [];
let SelectedAllPlanes = false;
let HighlightedPlane = null;
let FollowSelected = false;
let followPos = [];
let loadStart = new Date().getTime();
let mapResizeTimeout;
let pointerMoveTimeout;
let iconSize = 1;
let debugTracks = false;
let verboseUpdateTrack = false;
let debugAll = false;
let trackLabels = false;
let multiSelect = false;
let uat_data = null;
g.enableLabels = false;
g.extendedLabels = 0;
let mapIsVisible = true;
let onlyMilitary = false;
let onlySelected = false;
let debug = false;
let debugJump = false;
let jumpTo = null;
let noMLAT = false;
let noVanish = false;
let filterTracks = false; // altitude filter: don't filter planes but rather their tracks by altitude
let refreshId = 0;
let lastFetch = 0;
let actualOutline = {};
let globeIndexNow = {};
let globeIndexDist = {};
let globeIndexSpecialLookup = {};
let globeTilesViewCount = 0;
let globeTableLimitBase = 80;
let globeTableLimit = 80;
let fetchCounter = 0;
let lastGlobeExtent;
let lastRenderExtent;
let pendingFetches = 0;
let firstFetch = true;
let debugCounter = 0;
let pathName = window.location.pathname.replace(/\/+/, '/') || '/';
let sourcesFilter = null;
let sources = ['adsb', ['uat', 'adsr'], 'mlat', 'tisb', 'modeS', 'other', 'adsc', 'ais'];
let flagFilter = null;
let flagFilterValues = ['military', 'pia', 'ladd'];
let showTrace = false;
let showTraceExit = false;
let showTraceWasIsolation = false;
let showTraceTimestamp = null;
let traceDate = null;
let traceDateString = null;
let traceOpts = {};
let icaoParam = null;
let newWidth = lineWidth;
let SiteOverride = SiteLat != null && SiteLon != null;
let onJumpInput = null;
let labelFill = null;
let blackFill = null;
let labelStroke = null;
let labelStrokeNarrow = null;
let bgFill = null;
let legSel = -1;
let geoMag = null;
let solidT = false;
let lastActive = new Date().getTime();
let enableOverlays = [];
let halloween = false;
let noRegOnly = false;
let triggerRefresh = 0;
let firstDraw = true;
let darkerColors = false;
let autoselect = false;
let nogpsOnly = false;
let spritesDataURL = null;
let trace_hist_only = false;
let traces_high_res = false;
let show_rId = true;
let labels_top = false;
let lockDotCentered = false;
let overrideMapType = null;
let layerMoreContrast = false;
let layerDimFactor = 0;
let layerExtraContrast = 0;
let shareFiltersParam = false;
let lastRequestSize = 0;
let lastRequestBox = '';
let nextQuerySelected = 0;
let enableDynamicCachebusting = false;
g.lastRefreshInt = 1000;
let reapTimeout = globeIndex ? 240 : 480;

let baroCorrectQNH = 1013.25;

let limitUpdates = -1;

let infoBlockWidth = baseInfoBlockWidth;

const renderBuffer = 60;

let shareLink = '';

let CenterLat = 0;
let CenterLon = 0;
g.zoomLvl = 5;
g.zoomLvlCache;

let TrackedAircraft = 0;
let globeTrackedAircraft = 0;
let TrackedAircraftPositions = 0;
let TrackedHistorySize = 0;
let aircraftShown = 0;

let SitePosition = null;

// timestamps
let now = 0;
let last = 0;
let uat_now = 0;
let uat_last = 0;
let FetchPending = [];
let FetchPendingUAT = null;

let MessageCountHistory = [];
let MessageRate = 0;

let layers;
let layers_group;

const nullStyle = new ol.style.Style({});

let estimateStyle;
let estimateStyleSlim;
let badLine;
let badLineMlat;
let badDot;
let badDotMlat;

let showingReplayBar = false;
