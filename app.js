// ============================================================
// RAK LST & 3D Buildings Viewer
// ============================================================
// All tuneable values (layers, scale, endpoints, symbology) live
// in config.js which is loaded before this file.  Local aliases
// keep every reference below unchanged.

const rakPolygon = CONFIG.areaPolygon;
const RAK_BOUNDS = CONFIG.bounds;

const WFS_BASE            = CONFIG.wfs.base;
const WFS_TYPENAME        = CONFIG.wfs.typeName;
const MIN_LOAD_ZOOM       = CONFIG.wfs.minLoadZoom;
const MAX_BBOX_WIDTH_DEG  = CONFIG.wfs.maxBboxWidthDeg;
const MAX_BBOX_HEIGHT_DEG = CONFIG.wfs.maxBboxHeightDeg;
const DEBOUNCE_MS         = CONFIG.wfs.debounceMs;

const COG_LAYERS = CONFIG.cogLayers;
// Mutable — the user can narrow/widen the symbology range live via the Value Range controls.
let TEMP_MIN = CONFIG.tempMin;
let TEMP_MAX = CONFIG.tempMax;

// Build MapLibre color expression from config field + stops.
// If the field is null (building has no extracted temperature), render grey instead of black.
const VAR_COLOR_EXPR = [
  "case",
  ["!=", ["get", CONFIG.buildings.colorField], null],
  ["interpolate", ["linear"], ["get", CONFIG.buildings.colorField],
    ...CONFIG.buildings.colorStops.flat()],
  "#888888"
];

// Line width by road class; falls back to defaultWidth for any class not listed.
const ROADS_WIDTH_EXPR = [
  "match", ["get", CONFIG.roads.classField],
  ...CONFIG.roads.widthStops.flatMap(([cls, w]) => [cls, w]),
  CONFIG.roads.defaultWidth
];

// ── State ─────────────────────────────────────────────────────
let abortController   = null;
let debounceTimer     = null;
const loadedWfsFeatures = new Map();
const cogImageCache   = {};   // id → { bbox, band, w, h } — band decoded once, repainted on range/re-select
let activeCogId       = null;
let buildingsAdded    = false;
let roadsAdded        = false;
let wfsEnabled        = false;

const emptyFC = { type: "FeatureCollection", features: [] };

// ── DOM refs ──────────────────────────────────────────────────
const statusEl       = document.getElementById("status");
const chkWfs         = document.getElementById("chkWfs");
const chkBuildings   = document.getElementById("chkBuildings");
const chkRoads       = document.getElementById("chkRoads");
const autoLoadEl     = document.getElementById("autoLoad");
const btnLoad        = document.getElementById("btnLoad");
const btnClear       = document.getElementById("btnClear");
const wfsControlsEl  = document.getElementById("wfsControls");
const cogOpacityRow  = document.getElementById("cog-opacity-row");
const cogOpacityEl   = document.getElementById("cogOpacity");
const cogOpacityValEl= document.getElementById("cogOpacityVal");
const cogRangeRow    = document.getElementById("cog-range-row");
const cogRangeMinEl  = document.getElementById("cogRangeMin");
const cogRangeMaxEl  = document.getElementById("cogRangeMax");
const btnRangeReset  = document.getElementById("btnRangeReset");
const btnCollapse    = document.getElementById("btnCollapse");
const panelEl        = document.getElementById("panel");
const chkTerrain     = document.getElementById("chkTerrain");

// ── Apply config labels to the panel UI ──────────────────────
document.title                                              = CONFIG.labels.panelTitle;
document.getElementById("lblPanelTitle").textContent        = CONFIG.labels.panelTitle;
document.getElementById("lblBasemapSection").textContent    = CONFIG.labels.basemapSection;
document.getElementById("lblLayersSection").textContent     = CONFIG.labels.layersSection;
document.getElementById("lblTerrainLayer").textContent      = CONFIG.labels.terrainLayer;
document.getElementById("lblWfsLayer").textContent          = CONFIG.labels.wfsLayer;
document.getElementById("lblBuildingsLayer").textContent    = CONFIG.labels.buildingsLayer;
document.getElementById("lblRoadsLayer").textContent         = CONFIG.labels.roadsLayer;
document.getElementById("lblCogSection").textContent        = CONFIG.labels.cogSection;
document.getElementById("lblSeasonSummer").textContent      = CONFIG.labels.cogSeasonSummer;
document.getElementById("lblSeasonWinter").textContent      = CONFIG.labels.cogSeasonWinter;
document.getElementById("lblLegendTitle").textContent       = CONFIG.labels.legendTitle;
document.getElementById("lblFooterNote").textContent        = CONFIG.labels.footerNote;

// ── Symbology value range (legend ticks recomputed from TEMP_MIN/TEMP_MAX) ──
function updateLegendTicks() {
  const ticks = [0, 0.25, 0.5, 0.75, 1].map(f => Math.round(TEMP_MIN + f * (TEMP_MAX - TEMP_MIN)));
  document.getElementById("lblLegendTicks").innerHTML = ticks.map(t => `<span>${t}</span>`).join("");
}
updateLegendTicks();
cogRangeMinEl.value = TEMP_MIN;
cogRangeMaxEl.value = TEMP_MAX;

function applyRangeChange() {
  const min = Number(cogRangeMinEl.value);
  const max = Number(cogRangeMaxEl.value);
  if (!Number.isFinite(min) || !Number.isFinite(max) || min >= max) {
    setStatus("Invalid value range: min must be less than max.");
    return;
  }
  TEMP_MIN = min;
  TEMP_MAX = max;
  updateLegendTicks();

  if (activeCogId && cogImageCache[activeCogId]) {
    const { band, w, h } = cogImageCache[activeCogId];
    const dataUrl = renderCogCanvas(band, w, h);
    map.getSource(`cog-src-${activeCogId}`).updateImage({ url: dataUrl });
    setStatus(`Value range updated: ${TEMP_MIN}°C (blue) → ${TEMP_MAX}°C (red)`);
  }
}

cogRangeMinEl.addEventListener("change", applyRangeChange);
cogRangeMaxEl.addEventListener("change", applyRangeChange);
btnRangeReset.addEventListener("click", () => {
  cogRangeMinEl.value = CONFIG.tempMin;
  cogRangeMaxEl.value = CONFIG.tempMax;
  applyRangeChange();
});

// ── Basemap switcher buttons (built from config) ──────────────
const basemapSwitcher = document.getElementById("basemap-switcher");
CONFIG.basemaps.forEach((bm, i) => {
  const btn = document.createElement("button");
  btn.className  = "basemap-btn" + (i === 0 ? " active" : "");
  btn.textContent = bm.label;
  btn.dataset.id  = bm.id;
  btn.addEventListener("click", () => switchBasemap(bm));
  basemapSwitcher.appendChild(btn);
});

function switchBasemap(bm) {
  map.getSource("osm").setTiles(bm.tiles);
  document.querySelectorAll(".basemap-btn").forEach(b =>
    b.classList.toggle("active", b.dataset.id === bm.id)
  );
}

// ── Map ───────────────────────────────────────────────────────
const map = new maplibregl.Map({
  container: "map",
  style: {
    version: 8,
    sources: {
      osm: {
        type:        "raster",
        tiles:       CONFIG.basemaps[0].tiles,
        tileSize:    256,
        attribution: CONFIG.basemaps[0].attribution,
      }
    },
    layers: [{ id: "osm", type: "raster", source: "osm" }]
  },
  center:  CONFIG.map.center,
  zoom:    CONFIG.map.zoom,
  pitch:   CONFIG.map.pitch,
  bearing: CONFIG.map.bearing,
  maxBounds: [
    [RAK_BOUNDS.west - 0.05, RAK_BOUNDS.south - 0.05],
    [RAK_BOUNDS.east + 0.05, RAK_BOUNDS.north + 0.05]
  ]
});

map.addControl(new maplibregl.NavigationControl(), "top-right");
map.addControl(new maplibregl.ScaleControl({ maxWidth: 120, unit: "metric" }));

// ── Map load ──────────────────────────────────────────────────
map.on("load", () => {
  // ── DEM terrain source + sky layer ─────────────────────────
  map.addSource("terrain-dem", {
    type:        "raster-dem",
    tiles:       CONFIG.terrain.tiles,
    tileSize:    CONFIG.terrain.tileSize,
    maxzoom:     CONFIG.terrain.maxzoom,
    encoding:    CONFIG.terrain.encoding,
    attribution: CONFIG.terrain.attribution,
  });

  map.addLayer({
    id:   "sky",
    type: "sky",
    paint: {
      "sky-type":                    "atmosphere",
      "sky-atmosphere-sun":          [0.0, 90.0],
      "sky-atmosphere-sun-intensity": 15,
    },
  });

  addBoundary();
  addWfsLayers();   // hidden; source starts empty
  // Buildings GeoJSON NOT added yet — avoid auto-downloading 86 GB

  map.on("moveend", () => { if (autoLoadEl.checked && wfsEnabled) scheduleLoad(); });
  map.on("zoomend", () => { if (autoLoadEl.checked && wfsEnabled) scheduleLoad(); });

  btnLoad.addEventListener("click", loadVisibleBuildings);
  btnClear.addEventListener("click", clearWfsCache);
  chkWfs.addEventListener("change", onWfsToggle);
  chkBuildings.addEventListener("change", onBuildingsToggle);
  chkRoads.addEventListener("change", onRoadsToggle);
  chkTerrain.addEventListener("change", onTerrainToggle);

  document.querySelectorAll('input[name="cog"]').forEach(radio => {
    radio.addEventListener("change", () => showCogLayer(radio.value));
  });

  // Panel collapse toggle
  btnCollapse.addEventListener("click", () => {
    const collapsed = panelEl.classList.toggle("collapsed");
    btnCollapse.textContent = collapsed ? "+" : "−";
    btnCollapse.title       = collapsed ? "Expand panel" : "Collapse panel";
  });

  // Raster opacity slider
  cogOpacityEl.addEventListener("input", () => {
    const pct = Number(cogOpacityEl.value);
    cogOpacityValEl.textContent = `${pct}%`;
    if (activeCogId && map.getLayer(activeCogId)) {
      map.setPaintProperty(activeCogId, "raster-opacity", pct / 100);
    }
  });

  // ── COG hover identify ──────────────────────────────────────
  // Raster layers are flat image textures — MapLibre never fires a clean
  // "click" on them (any slight drag counts as a pan instead).
  // Solution: probe the cached pixel array on every mousemove and show the
  // temperature in a floating chip that follows the cursor.
  const probe = document.getElementById("raster-probe");

  map.on("mousemove", (e) => {
    if (!activeCogId) {
      probe.style.display = "none";
      map.getCanvas().style.cursor = "";
      return;
    }

    const cache = cogImageCache[activeCogId];
    if (!cache) { probe.style.display = "none"; return; }

    const { bbox, band, w, h } = cache;
    const [west, south, east, north] = bbox;
    const { lng, lat } = e.lngLat;

    if (lng < west || lng > east || lat < south || lat > north) {
      probe.style.display = "none";
      map.getCanvas().style.cursor = "";
      return;
    }

    map.getCanvas().style.cursor = "crosshair";

    const col = Math.floor((lng - west)  / (east  - west)  * w);
    const row = Math.floor((north - lat) / (north - south) * h);
    const val = band[Math.max(0, Math.min(row * w + col, band.length - 1))];

    const text = (val == null || !isFinite(val) || val < -100 || val > 150)
      ? "No data"
      : `${val.toFixed(2)} °C`;

    probe.textContent = text;

    // Position chip 14 px right and above the cursor
    const pt = e.point;
    probe.style.left = (pt.x + 14) + "px";
    probe.style.top  = (pt.y - 28) + "px";
    probe.style.display = "block";
  });

  map.on("mouseleave", () => { probe.style.display = "none"; });

  // Click still pins a popup (works when the user manages a clean click)
  map.on("click", (e) => {
    if (!activeCogId) return;
    const cache = cogImageCache[activeCogId];
    if (!cache) return;

    const { bbox, band, w, h } = cache;
    const [west, south, east, north] = bbox;
    const { lng, lat } = e.lngLat;
    if (lng < west || lng > east || lat < south || lat > north) return;

    const col = Math.floor((lng - west)  / (east  - west)  * w);
    const row = Math.floor((north - lat) / (north - south) * h);
    const val = band[Math.max(0, Math.min(row * w + col, band.length - 1))];

    const def   = COG_LAYERS.find(l => l.id === activeCogId);
    const label = def
      ? `${def.season.charAt(0).toUpperCase() + def.season.slice(1)} ${def.label}`
      : activeCogId;
    const text  = (val == null || !isFinite(val) || val < -100 || val > 150)
      ? "No data"
      : `${val.toFixed(2)} °C`;

    new maplibregl.Popup()
      .setLngLat(e.lngLat)
      .setHTML(`<b>LST — ${label}</b><br>${text}`)
      .addTo(map);
  });

  setStatus("Map ready.");
});

// ── RAK boundary ──────────────────────────────────────────────
function addBoundary() {
  map.addSource("rak-boundary", { type: "geojson", data: rakPolygon });
  map.addLayer({
    id: "rak-boundary-fill", type: "fill", source: "rak-boundary",
    paint: { "fill-color": "#0080ff", "fill-opacity": 0.05 }
  });
  map.addLayer({
    id: "rak-boundary-line", type: "line", source: "rak-boundary",
    paint: { "line-color": "#0080ff", "line-width": 2 }
  });
}

// ── WFS GBA LoD1 buildings (off by default) ───────────────────
function addWfsLayers() {
  map.addSource("gba-buildings", { type: "geojson", data: emptyFC });

  map.addLayer({
    id: "gba-buildings-extrusion", type: "fill-extrusion", source: "gba-buildings",
    layout: { visibility: "none" },
    paint: {
      "fill-extrusion-height":  ["get", "_height"],
      "fill-extrusion-base":    ["get", "_base_height"],
      "fill-extrusion-opacity": 0.88,
      "fill-extrusion-color": [
        "interpolate", ["linear"], ["get", "_height"],
        0, "#d9d9d9", 8, "#c7d7f2", 20, "#7fa7e6", 50, "#3366cc", 100, "#1f3f99"
      ]
    }
  });

  map.addLayer({
    id: "gba-buildings-outline", type: "line", source: "gba-buildings",
    layout: { visibility: "none" },
    paint: { "line-color": "#333", "line-width": 0.4, "line-opacity": 0.35 }
  });

  map.on("click", "gba-buildings-extrusion", (e) => {
    const p = e.features[0].properties || {};
    new maplibregl.Popup()
      .setLngLat(e.lngLat)
      .setHTML(`<b>GBA LoD1</b><br>Height: ${p._height ?? "n/a"} m<br>ID: ${p.id || p.gid || "n/a"}`)
      .addTo(map);
  });
}

// ── DEM terrain toggle ────────────────────────────────────────
function onTerrainToggle() {
  if (chkTerrain.checked) {
    map.setTerrain({ source: "terrain-dem", exaggeration: CONFIG.terrain.exaggeration });
    setStatus("DEM terrain on. Use pitch/tilt to see elevation.");
  } else {
    map.setTerrain(null);
    setStatus("DEM terrain off.");
  }
}

// ── WFS toggle ────────────────────────────────────────────────
function onWfsToggle() {
  wfsEnabled = chkWfs.checked;
  const vis = wfsEnabled ? "visible" : "none";
  map.setLayoutProperty("gba-buildings-extrusion", "visibility", vis);
  map.setLayoutProperty("gba-buildings-outline",   "visibility", vis);
  wfsControlsEl.classList.toggle("hidden", !wfsEnabled);
  if (wfsEnabled) scheduleLoad();
}

// ── GeoJSON download loader (shared by buildings + roads) ─────
function makeLoaderRefs(prefix) {
  return {
    el:    document.getElementById(`${prefix}-loader`),
    bar:   document.getElementById(`${prefix}-loader-bar`),
    pct:   document.getElementById(`${prefix}-loader-pct`),
    label: document.getElementById(`${prefix}-loader-label`),
  };
}

function showLoader(refs, pct) {
  refs.el.classList.add("visible");
  refs.label.textContent = "Loading";
  refs.label.classList.remove("done");
  refs.bar.classList.remove("done");
  if (pct == null) {
    refs.bar.style.width = "100%";
    refs.bar.style.animation = "pulse 1.2s ease-in-out infinite";
    refs.pct.textContent = "";
  } else {
    refs.bar.style.animation = "";
    refs.bar.style.width = pct + "%";
    refs.pct.textContent = pct + "%";
  }
}

function hideLoader(refs) {
  // Flash "Loaded" in green for 1.5s then hide
  refs.bar.style.animation = "";
  refs.bar.style.width = "100%";
  refs.bar.classList.add("done");
  refs.label.textContent = "Loaded";
  refs.label.classList.add("done");
  refs.pct.textContent = "100%";
  setTimeout(() => {
    refs.el.classList.remove("visible");
    refs.bar.style.width = "0%";
    refs.bar.classList.remove("done");
  }, 1500);
}

// Streams a GeoJSON URL with progress reported to the given loader, parses, returns it.
async function fetchGeojsonWithProgress(url, loaderRefs) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const total  = parseInt(res.headers.get("Content-Length") || "0", 10);
  const reader = res.body.getReader();
  const chunks = [];
  let received = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.length;
    showLoader(loaderRefs, total ? Math.round(received / total * 100) : null);
  }

  const text = await new Blob(chunks).text();
  return JSON.parse(text);
}

// ── Buildings GeoJSON 3D ──────────────────────────────────────
const buildingsLoaderRefs = makeLoaderRefs("buildings");

async function onBuildingsToggle() {
  if (!chkBuildings.checked) {
    if (buildingsAdded) {
      map.setLayoutProperty("buildings-extrusion", "visibility", "none");
      map.setLayoutProperty("buildings-outline",   "visibility", "none");
    }
    return;
  }

  if (!buildingsAdded) {
    setStatus("Downloading buildings…");
    showLoader(buildingsLoaderRefs, 0);

    let geojson;
    try {
      geojson = await fetchGeojsonWithProgress(CONFIG.buildings.url, buildingsLoaderRefs);
    } catch (err) {
      hideLoader(buildingsLoaderRefs);
      setStatus(`Buildings error: ${err.message}`);
      chkBuildings.checked = false;
      return;
    }

    hideLoader(buildingsLoaderRefs);
    setStatus("Rendering buildings…");

    map.addSource("buildings-local", {
      type:       "geojson",
      data:       geojson,
      generateId: true,
    });

    // Insert below WFS layer so GBA LoD1 renders on top when both are enabled
    map.addLayer(
      {
        id:      "buildings-extrusion",
        type:    "fill-extrusion",
        source:  "buildings-local",
        minzoom: CONFIG.buildings.minzoom,
        paint: {
          "fill-extrusion-height":  CONFIG.buildings.heightExpr,
          "fill-extrusion-base":    0,
          "fill-extrusion-opacity": 0.85,
          "fill-extrusion-color":   VAR_COLOR_EXPR
        }
      },
      "gba-buildings-extrusion"
    );

    map.addLayer(
      {
        id:      "buildings-outline",
        type:    "line",
        source:  "buildings-local",
        minzoom: CONFIG.buildings.minzoom,
        paint: { "line-color": "#222", "line-width": 0.3, "line-opacity": 0.4 }
      },
      "gba-buildings-extrusion"
    );

    map.on("click", "buildings-extrusion", (e) => {
      const p = e.features[0].properties || {};
      console.log("Building properties:", p);   // open DevTools → Console to see all field names
      new maplibregl.Popup()
        .setLngLat(e.lngLat)
        .setHTML(
          `<b>Building</b><br>` +
          `Height: ${p.height != null ? Number(p.height).toFixed(3) : "n/a"} m<br>` +
          `${CONFIG.buildings.colorField}: ${p[CONFIG.buildings.colorField] != null ? Number(p[CONFIG.buildings.colorField]).toFixed(4) : "n/a"}<br>` +
          `Source: ${p.source || "n/a"}<br>` +
          `OSM ID: ${p.id || "n/a"}`
        )
        .addTo(map);
    });

    buildingsAdded = true;
    setStatus(`Buildings layer active (visible at zoom ${CONFIG.buildings.minzoom}+). Coloured by '${CONFIG.buildings.colorField}' field.`);
  } else {
    map.setLayoutProperty("buildings-extrusion", "visibility", "visible");
    map.setLayoutProperty("buildings-outline",   "visibility", "visible");
  }
}

// rak_roads.geojson is an Overture Maps export where the "names" struct field
// got flattened by ogr2ogr into a debug-style string instead of real JSON,
// e.g. "common: , primary: Petrol Station Access, rules: ". Pull the primary
// name out of that (or use it directly if a future export gives a real object).
function extractRoadName(properties) {
  const raw = properties && properties[CONFIG.roads.nameField];
  if (raw == null) return null;
  if (typeof raw === "object") return raw.primary || null;
  const match = /primary:\s*(.*?)(?:,\s*rules:|$)/.exec(raw);
  const name = match && match[1].trim();
  return name || null;
}

// ── Roads GeoJSON ───────────────────────────────────────────────
const roadsLoaderRefs = makeLoaderRefs("roads");

async function onRoadsToggle() {
  if (!chkRoads.checked) {
    if (roadsAdded) {
      map.setLayoutProperty("roads-line", "visibility", "none");
    }
    return;
  }

  if (!roadsAdded) {
    setStatus("Downloading roads…");
    showLoader(roadsLoaderRefs, 0);

    let geojson;
    try {
      geojson = await fetchGeojsonWithProgress(CONFIG.roads.url, roadsLoaderRefs);
    } catch (err) {
      hideLoader(roadsLoaderRefs);
      setStatus(`Roads error: ${err.message}`);
      chkRoads.checked = false;
      return;
    }

    hideLoader(roadsLoaderRefs);
    setStatus("Rendering roads…");

    map.addSource("roads-local", { type: "geojson", data: geojson });

    map.addLayer({
      id:      "roads-line",
      type:    "line",
      source:  "roads-local",
      minzoom: CONFIG.roads.minzoom,
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": CONFIG.roads.lineColor,
        "line-width": ROADS_WIDTH_EXPR,
      }
    });

    map.on("click", "roads-line", (e) => {
      const p = e.features[0].properties || {};
      new maplibregl.Popup()
        .setLngLat(e.lngLat)
        .setHTML(
          `<b>Road</b><br>` +
          `${extractRoadName(p) || "Unnamed"}<br>` +
          `Class: ${p[CONFIG.roads.classField] || "n/a"}`
        )
        .addTo(map);
    });

    roadsAdded = true;
    setStatus(`Roads layer active (visible at zoom ${CONFIG.roads.minzoom}+).`);
  } else {
    map.setLayoutProperty("roads-line", "visibility", "visible");
  }
}

// ── COG temperature raster (via geotiff.js + MapLibre image source) ──────────
// Reads the COG overview level to get a fast, medium-res snapshot of the whole
// RAK extent, renders each pixel with the blue→red temperature ramp, and adds
// the result as a MapLibre 'image' source/layer.
// Paints one band array to a canvas using the current TEMP_MIN/TEMP_MAX range.
// Pulled out of showCogLayer so the Value Range controls can re-render the
// already-downloaded band without refetching the COG.
function renderCogCanvas(band, w, h) {
  const canvas  = document.createElement("canvas");
  canvas.width  = w;
  canvas.height = h;
  const ctx     = canvas.getContext("2d");
  const imgData = ctx.createImageData(w, h);

  for (let i = 0; i < band.length; i++) {
    const v = band[i];
    // Physical range guard — values outside are nodata sentinels
    if (v == null || !isFinite(v) || v < -100 || v > 150) {
      imgData.data[i * 4 + 3] = 0;   // transparent
      continue;
    }
    // Outside the current Min/Max symbology range — hide rather than clamp to the endpoint color
    if (v < TEMP_MIN || v > TEMP_MAX) {
      imgData.data[i * 4 + 3] = 0;   // transparent
      continue;
    }
    const t = (v - TEMP_MIN) / (TEMP_MAX - TEMP_MIN);
    let r, g, b;
    if      (t < 0.25) { r = 0;   g = Math.round(t * 4 * 255);                    b = 255; }
    else if (t < 0.50) { r = 0;   g = 255; b = Math.round((1 - (t - 0.25) * 4) * 255); }
    else if (t < 0.75) { r = Math.round((t - 0.50) * 4 * 255); g = 255;           b = 0;   }
    else               { r = 255; g = Math.round((1 - (t - 0.75) * 4) * 255);     b = 0;   }
    imgData.data[i * 4 + 0] = r;
    imgData.data[i * 4 + 1] = g;
    imgData.data[i * 4 + 2] = b;
    imgData.data[i * 4 + 3] = 200;   // ~78% opacity
  }
  ctx.putImageData(imgData, 0, 0);
  return canvas.toDataURL("image/png");
}

async function showCogLayer(id) {
  // Remove currently active COG layer + source
  if (activeCogId) {
    if (map.getLayer(activeCogId))               map.removeLayer(activeCogId);
    if (map.getSource(`cog-src-${activeCogId}`)) map.removeSource(`cog-src-${activeCogId}`);
    activeCogId = null;
  }
  if (!id) {
    cogOpacityRow.classList.add("hidden");
    cogRangeRow.classList.add("hidden");
    setStatus("Map ready.");
    return;
  }

  const def = COG_LAYERS.find(l => l.id === id);
  if (!def) return;

  // Fetch + decode the band once; cache it so range changes and re-selection
  // repaint instantly instead of refetching the COG.
  if (!cogImageCache[id]) {
    setStatus(`Loading ${def.season} ${def.label} COG…`);
    try {
      const tiff       = await GeoTIFF.fromUrl(def.url);
      const imgCount   = await tiff.getImageCount();

      // Main image (index 0) always carries the geotransform; overviews (index > 0) do not
      const mainImage = await tiff.getImage(0);
      const bbox      = mainImage.getBoundingBox(); // [west, south, east, north] in EPSG:4326

      // Pick the smallest overview that is still ≥ 128 px wide for fast rendering
      let target = mainImage;
      for (let i = imgCount - 1; i >= 0; i--) {
        const img = await tiff.getImage(i);
        if (img.getWidth() >= 128) { target = img; break; }
      }

      const w = target.getWidth();
      const h = target.getHeight();
      const [band] = await target.readRasters({ interleave: false });

      // Store band + dimensions so click-identify and range re-paints can reuse them
      cogImageCache[id] = { bbox, band, w, h };
    } catch (err) {
      let msg = err.message;
      if (msg.includes("Predictor 2") || msg.includes("64 bits")) {
        msg = "COG files need re-encoding. Run fix_cogs.bat (requires GDAL) then reload.";
      }
      setStatus(`COG error: ${msg}`);
      document.querySelector(`input[value="${id}"]`).checked = false;
      document.querySelector('input[name="cog"][value=""]').checked = true;
      return;
    }
  }

  // Add image source — use real bounds read from the GeoTIFF geotransform
  const { bbox, band, w, h } = cogImageCache[id];
  const dataUrl = renderCogCanvas(band, w, h);
  const [west, south, east, north] = bbox;
  map.addSource(`cog-src-${id}`, {
    type: "image",
    url: dataUrl,
    coordinates: [
      [west, north], // NW
      [east, north], // NE
      [east, south], // SE
      [west, south], // SW
    ]
  });
  map.addLayer(
    { id, type: "raster", source: `cog-src-${id}`, paint: { "raster-opacity": CONFIG.cogDefaultOpacity / 100 } },
    "rak-boundary-fill"
  );

  activeCogId = id;

  // Show opacity slider and reset to default
  cogOpacityEl.value          = CONFIG.cogDefaultOpacity;
  cogOpacityValEl.textContent = `${CONFIG.cogDefaultOpacity}%`;
  cogOpacityRow.classList.remove("hidden");

  // Show value-range controls — inputs keep whatever range the user last set
  cogRangeRow.classList.remove("hidden");

  const season = def.season.charAt(0).toUpperCase() + def.season.slice(1);
  setStatus(`${season} ${def.label} LST  |  scale: ${TEMP_MIN}°C (blue) → ${TEMP_MAX}°C (red)`);
}

// ── WFS loading helpers ───────────────────────────────────────
function scheduleLoad() {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(loadVisibleBuildings, DEBOUNCE_MS);
}

function setStatus(msg) { statusEl.textContent = msg; }

function getClampedVisibleBbox() {
  const b = map.getBounds();
  const west  = Math.max(b.getWest(),  RAK_BOUNDS.west);
  const south = Math.max(b.getSouth(), RAK_BOUNDS.south);
  const east  = Math.min(b.getEast(),  RAK_BOUNDS.east);
  const north = Math.min(b.getNorth(), RAK_BOUNDS.north);
  return (west >= east || south >= north) ? null : { west, south, east, north };
}

function bboxTooLarge(b) {
  return (b.east - b.west) > MAX_BBOX_WIDTH_DEG ||
         (b.north - b.south) > MAX_BBOX_HEIGHT_DEG;
}

function buildWfsUrl(b) {
  const params = new URLSearchParams({
    service: "WFS", version: "2.0.0", request: "GetFeature",
    typeNames: WFS_TYPENAME, outputFormat: "application/json",
    srsName: "EPSG:4326",
    bbox: `${b.west},${b.south},${b.east},${b.north},EPSG:4326`
  });
  return `${WFS_BASE}?${params.toString()}`;
}

function getFeatureId(feature, index) {
  if (feature.id) return String(feature.id);
  const p = feature.properties || {};
  for (const k of ["id", "ID", "fid", "gid", "uid", "building_id", "osm_id"]) {
    if (p[k] !== undefined && p[k] !== null) return String(p[k]);
  }
  return JSON.stringify(feature.geometry).slice(0, 200) + "_" + index;
}

function getNumeric(props, names) {
  for (const name of names) {
    const v = props[name];
    if (v === undefined || v === null || v === "") continue;
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function normalizeBuildingProperties(feature) {
  if (!feature.properties) feature.properties = {};
  const p = feature.properties;
  const height = getNumeric(p, [
    "height","Height","HEIGHT","h","H","meanh","mean_h","building_h","height_m","roof_height"
  ]);
  const base = getNumeric(p, [
    "min_height","MinHeight","MIN_HEIGHT","base_height","base_h"
  ]);
  p._height      = height && height > 0 ? height : 6;
  p._base_height = base   && base   > 0 ? base   : 0;
}

async function loadVisibleBuildings() {
  const zoom = map.getZoom();
  if (zoom < MIN_LOAD_ZOOM) {
    setStatus(`Zoom ${zoom.toFixed(1)} — need 15+ to load WFS buildings.`);
    return;
  }
  const bbox = getClampedVisibleBbox();
  if (!bbox) { setStatus("Outside RAK area."); return; }
  if (bboxTooLarge(bbox)) { setStatus("Viewport too large — zoom in more."); return; }

  if (abortController) abortController.abort();
  abortController = new AbortController();
  setStatus("Loading WFS buildings...");

  try {
    const res = await fetch(buildWfsUrl(bbox), { signal: abortController.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const geojson = await res.json();
    if (!geojson.features) throw new Error("Response is not a FeatureCollection.");

    geojson.features.forEach((f, i) => {
      normalizeBuildingProperties(f);
      loadedWfsFeatures.set(getFeatureId(f, i), f);
    });

    const merged = { type: "FeatureCollection", features: Array.from(loadedWfsFeatures.values()) };
    map.getSource("gba-buildings").setData(merged);
    setStatus(
      `WFS: ${geojson.features.length} new, ${merged.features.length} cached. Zoom ${zoom.toFixed(1)}`
    );
  } catch (err) {
    if (err.name === "AbortError") return;
    console.error(err);
    setStatus(`WFS error: ${err.message}`);
  }
}

function clearWfsCache() {
  loadedWfsFeatures.clear();
  map.getSource("gba-buildings").setData(emptyFC);
  setStatus("WFS cache cleared.");
}
