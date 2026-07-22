// ============================================================
// config.js — all tuneable parameters for the RAK LST viewer
// Edit this file to change layers, scale, symbology, endpoints.
// app.js reads everything from the CONFIG object below.
// ============================================================

const CONFIG = {

  // ── Map initial view ──────────────────────────────────────
  map: {
    center:  [55.94, 25.74],
    zoom:    14,
    pitch:   60,
    bearing: -20,
  },

  // ── RAK study area ────────────────────────────────────────
  // bounds: axis-aligned bbox used for map maxBounds and WFS bbox clamping
  bounds: {
    west:  55.700086,
    south: 24.8132634,
    east:  56.2847179,
    north: 26.0714589,
  },

  // areaPolygon: the actual (non-rectangular) study-area outline drawn on the map
  areaPolygon: {
    type: "Feature",
    properties: { name: "RAK extraction area" },
    geometry: {
      type: "Polygon",
      coordinates: [[
        [55.700086,  26.0375280],
        [56.1829599, 26.0714589],
        [56.2847179, 24.8466994],
        [55.8066362, 24.8132634],
        [55.700086,  26.0375280],
      ]]
    }
  },

  // ── Temperature colour scale ──────────────────────────────
  // Default range applied to all COG rasters on load; the user can narrow/widen
  // it live via the panel's Value Range inputs (e.g. 25–50 for summer). These
  // two values are also what the panel's "Reset" button restores.
  // blue (tempMin) → cyan → green → yellow → red (tempMax)
  tempMin: 0,   // °C — mapped to deep blue
  tempMax:  60,   // °C — mapped to deep red

  // ── COG layer catalogue ───────────────────────────────────
  // Add / remove / reorder entries here; the UI radio buttons are built from this list.
  cogDefaultOpacity: 78,   // percent 0–100, applied when a layer is first shown
  cogLayers: [
    { id: "cog-summer-2000", label: "2000", season: "summer", url: "./Data/RAK_Summer_2000_LST_Celsius_cog.tif" },
    { id: "cog-summer-2009", label: "2009", season: "summer", url: "./Data/RAK_Summer_2009_LST_Celsius_cog.tif" },
    { id: "cog-summer-2012", label: "2012", season: "summer", url: "./Data/RAK_Summer_2012_LST_Celsius_cog.tif" },
    { id: "cog-summer-2015", label: "2015", season: "summer", url: "./Data/RAK_Summer_2015_LST_Celsius_cog.tif" },
    { id: "cog-summer-2020", label: "2020", season: "summer", url: "./Data/RAK_Summer_2020_LST_Celsius_cog.tif" },
    { id: "cog-summer-2025", label: "2025", season: "summer", url: "./Data/RAK_Summer_2025_LST_Celsius_cog.tif" },
    { id: "cog-winter-2000", label: "2000", season: "winter", url: "./Data/RAK_Winter_2000_LST_Celsius_cog.tif" },
    { id: "cog-winter-2009", label: "2009", season: "winter", url: "./Data/RAK_Winter_2009_LST_Celsius_cog.tif" },
    { id: "cog-winter-2012", label: "2012", season: "winter", url: "./Data/RAK_Winter_2012_LST_Celsius_cog.tif" },
    { id: "cog-winter-2015", label: "2015", season: "winter", url: "./Data/RAK_Winter_2015_LST_Celsius_cog.tif" },
    { id: "cog-winter-2020", label: "2020", season: "winter", url: "./Data/RAK_Winter_2020_LST_Celsius_cog.tif" },
    { id: "cog-winter-2025", label: "2025", season: "winter", url: "./Data/RAK_Winter_2025_LST_Celsius_cog.tif" },
  ],

  // ── Basemap options ───────────────────────────────────────
  // First entry is active on load.  All are free with no API key.
  // Note: ESRI tiles use {z}/{y}/{x} order (y before x) — different from OSM.
  basemaps: [
    {
      id:          "osm",
      label:       "Streets",
      tiles:       ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
      attribution: "© OpenStreetMap contributors",
    },
    {
      id:          "esri-imagery",
      label:       "Satellite",
      tiles:       ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"],
      attribution: "© Esri, Maxar, Earthstar Geographics, USDA FSA, USGS, Aerogrid, IGN, IGP, and the GIS User Community",
    },
  ],

  // ── DEM terrain ───────────────────────────────────────────
  // AWS Terrarium tiles — free, no API key, global coverage, maxzoom 15
  terrain: {
    tiles:        ["https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"],
    encoding:     "terrarium",
    tileSize:     256,
    maxzoom:      15,
    exaggeration: 1.5,   // vertical scale multiplier (1 = true scale, >1 emphasises mountains)
    attribution:  "Terrain © Mapzen, JAXA, NASA, USGS",
  },

  // ── WFS GBA LoD1 buildings ────────────────────────────────
  wfs: {
    base:             "https://tubvsig-so2sat-vm1.srv.mwn.de/geoserver/ows",
    typeName:         "global3D:lod1_global",
    minLoadZoom:      15,
    maxBboxWidthDeg:  0.08,   // degrees — viewport wider than this is rejected
    maxBboxHeightDeg: 0.08,
    debounceMs:       500,
  },

  // ── Panel / UI labels ─────────────────────────────────────
  // Change any of these strings to update the displayed text without touching HTML.
  labels: {
    panelTitle:      "RAK LST & 3D Buildings",
    layersSection:   "Layers",
    basemapSection:  "Basemap",
    terrainLayer:    "DEM Terrain",
    wfsLayer:        "WFS GBA LoD1 Buildings",
    buildingsLayer:  "Buildings Temperature (2025)",
    roadsLayer:      "Roads",
    cogSection:      "Temperature COG (LST)",
    cogSeasonSummer: "Summer",
    cogSeasonWinter: "Winter",
    legendTitle:     "LST (°C)",
    footerNote:      "COGs served via IIS. Buildings visible at zoom 15+.",
  },

  // ── Local buildings GeoJSON ───────────────────────────────
  buildings: {
    url:     "./Data/buildings_rendered_new.geojson",
    minzoom: 15,

    // Height expression fed to fill-extrusion-height.
    // OSM `height` is in metres; clamp to [3, 300] so tiny structures and outliers stay sane.
    // Change `height` to whatever field name your GeoJSON uses.
    heightExpr: ["min", ["max", ["coalesce", ["get", "height"], 6], 3], 300],

    // Field to colour buildings by.
    // Currently "var" (DSM variance, 0–1).  Swap to the extracted LST field when available.
    colorField: "mean",

    // Color-ramp stops: [[tempCelsius, hexColor], ...]
    // Matches the COG raster scale — blue (cold) → cyan → green → yellow → orange → red (hot)
    colorStops: [
      [0, "#0000FF"],
      [  10, "#00CCFF"],
      [ 15, "#00FF88"],
      [ 30, "#FFFF00"],
      [ 45, "#FF8800"],
      [ 60, "#FF0000"],
    ],
  },

  // ── Local roads GeoJSON ────────────────────────────────────
  roads: {
    url:     "./Data/rak_roads.geojson",
    minzoom: 13,

    // Field holding the road class, used to vary line width. rak_roads.geojson
    // is an Overture Maps transportation export, which uses "class" (track,
    // residential, primary, ...) rather than OSM's "highway".
    classField: "class",
    widthStops: [
      ["motorway",      3.5],
      ["trunk",         3],
      ["primary",       2.5],
      ["secondary",     2],
      ["tertiary",      1.5],
      ["residential",   1],
      ["unclassified",  1],
      ["living_street", 1],
      ["service",       0.6],
      ["track",         0.6],
      ["pedestrian",    0.6],
      ["footway",       0.4],
      ["cycleway",      0.4],
      ["path",          0.4],
      ["steps",         0.4],
    ],
    defaultWidth: 0.6,   // px, for any class not listed above (e.g. "unknown")
    lineColor:    "#ffaa00",   // amber — reads clearly over both the Streets and Satellite basemaps

    // Field holding the road's display name, shown in the click popup.
    // In this export, ogr2ogr flattened Overture's "names" struct into a
    // debug string like "common: , primary: Some Road, rules: " rather than
    // real JSON — extractRoadName() in app.js parses that out. Most features
    // have no name at all (tracks/service roads).
    nameField: "names",
  },
};
