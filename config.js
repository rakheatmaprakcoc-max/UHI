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

  // boundaryUrl: the actual RAK administrative boundary, fetched and drawn on
  // the map (replaces the old hand-drawn approximate rectangle).
  boundaryUrl: "./Data/rak_boundries.geojson",

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
  // basemapBackground shows through wherever the basemap is hidden (Show
  // Basemap unchecked) or tiles haven't loaded yet.
  basemapBackground: "#e6e6e6",
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
    basemapToggle:   "Show Basemap",
    terrainLayer:    "DEM Terrain",
    wfsLayer:        "WFS GBA LoD1 Buildings",
    buildingsLayer:  "Buildings Temperature (2025)",
    roadsLayer:      "Roads",
    lulcLayer:       "Land Use / Land Cover",
    lulcLegendTitle: "LULC Classes",
    cogSection:      "Temperature COG (LST)",
    cogSeasonSummer: "Summer",
    cogSeasonWinter: "Winter",
    legendTitle:     "LST (°C)",
    compareSection:  "Compare",
    splitToggle:     "Split View",
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

  // ── Land Use / Land Cover raster (classified, not a temperature COG) ──
  lulc: {
    url:          "./Data/RAK_LULC_wgs84_cog.tif",
    // Reprojection to WGS84 introduced edge/corner pixels outside the
    // original data's footprint, filled with 127; the original raster's own
    // background (outside RAK) is 0. Both render transparent — see
    // renderLulcCanvas in app.js, which also treats any value absent from
    // "classes" below as nodata, so this is mostly for documentation.
    nodataValue:  127,
    opacity:      0.75,

    // value → class name/color. RAK_LULC_wgs84_cog.tif.vat.dbf only carries
    // Value + Count (no Class field), so names come from the project's LULC
    // symbology legend; colors are close visual matches to that legend, not
    // pixel-sampled — tweak freely.
    classes: [
      { value: 1,  name: "Desert",                      color: "#F5C99B" },
      { value: 2,  name: "Barren Land",                  color: "#F0E4C0" },
      { value: 3,  name: "Agriculture",                  color: "#2E6B1F" },
      { value: 4,  name: "Developed, Low Intensity",     color: "#E8998D" },
      { value: 5,  name: "Developed, Medium Intensity",  color: "#E31E24" },
      { value: 6,  name: "Developed, Open Space",        color: "#F5A031" },
      { value: 7,  name: "Open Water",                   color: "#2D7DD2" },
      { value: 8,  name: "Developed, High Intensity",    color: "#8B1A1A" },
      { value: 9,  name: "Wetlands",                     color: "#C4A876" },
      { value: 10, name: "Green Spaces",                 color: "#A8D08A" },
      { value: 11, name: "Mangroves",                    color: "#4CA64C" },
      { value: 12, name: "Golf Course",                  color: "#8FC1E3" },
      { value: 13, name: "Sea Water",                    color: "#D6EAF5" },
    ],
  },
};
