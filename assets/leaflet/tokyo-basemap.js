/* Tokyo Atlas basemap adapter. Leaflet 1.9.4 + Leaflet.VectorGrid 1.3.0.
 * Vector tiles: OpenFreeMap / OpenMapTiles / OpenStreetMap.
 * Uses no user credentials. Background geometry has no generic POI labels.
 */
(function (root) {
  'use strict';
  var L = root.L;
  if (!L || !L.VectorGrid || !L.Canvas.Tile) throw new Error('Leaflet VectorGrid must load before TokyoBasemap.');

  var sourceURL = 'https://tiles.openfreemap.org/planet/latest/{z}/{x}/{y}.pbf';
  var attribution = '<a href="https://openfreemap.org" target="_blank" rel="noopener noreferrer">OpenFreeMap</a> · <a href="https://www.openmaptiles.org/" target="_blank" rel="noopener noreferrer">© OpenMapTiles</a> · <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">© OpenStreetMap contributors</a>';
  var order = ['atlas_ground', 'landcover', 'landuse', 'park', 'water', 'waterway', 'aeroway', 'building', 'boundary', 'transportation'];

  // VectorGrid creates one independent canvas per tile. Keep CSS pixels at the
  // Leaflet tile size, scale only the backing bitmap and drawing transform.
  // A 2x cap avoids unnecessary 3x/4x canvas memory on high-density phones.
  var RetinaCanvasTile = L.Canvas.Tile.extend({
    initialize: function (coords, size, options) {
      L.Canvas.Tile.prototype.initialize.call(this, coords, size, options);
      var ratio = Math.min(2, Math.max(1, Number(root.devicePixelRatio) || 1));
      this._container.width = Math.round(size.x * ratio);
      this._container.height = Math.round(size.y * ratio);
      this._container.style.width = size.x + 'px';
      this._container.style.height = size.y + 'px';
      this._ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    }
  });

  function fill(color) { return { fill: true, fillColor: color, fillOpacity: 1, stroke: false, weight: 0 }; }
  function roadRank(feature) {
    var p = feature.properties || {};
    var rank = { path: 0, track: 0, service: 1, minor: 1, tertiary: 2, secondary: 3, primary: 4, trunk: 5, motorway: 6, rail: 7, transit: 7 }[p.class] || 0;
    return rank + (p.brunnel === 'tunnel' ? -20 : p.brunnel === 'bridge' ? 20 : 0);
  }
  function prepareTile(tile) {
    // The stock plugin encodes non-2xx responses as {layers: []}; valid PBFs
    // expose an object, even when there are no features.
    if (!tile || Array.isArray(tile.layers) || !tile.layers) throw new Error('Basemap tile could not be loaded.');
    var original = tile.layers;
    var ground = {
      extent: 4096,
      features: [{ type: 3, properties: {}, geometry: [[
        { x: 0, y: 0 }, { x: 4096, y: 0 }, { x: 4096, y: 4096 }, { x: 0, y: 4096 }, { x: 0, y: 0 }
      ]] }]
    };
    var layers = { atlas_ground: ground };
    order.slice(1).forEach(function (name) {
      if (!original[name]) return;
      layers[name] = original[name];
      if (name === 'transportation') {
        layers[name] = Object.assign({}, original[name], {
          features: original[name].features.slice().sort(function (a, b) { return roadRank(a) - roadRank(b); })
        });
      }
    });
    return { layers: layers };
  }

  var styles = {
    atlas_ground: fill('#f7f9fb'),
    landcover: function (p) {
      return /wood|forest|grass|scrub|wetland/.test(p.class || '') ? fill('#eaf2ec') : [];
    },
    landuse: function (p) {
      if (/cemetery|recreation_ground|village_green/.test(p.class || '')) return fill('#e7f0e9');
      if (/industrial|commercial|retail/.test(p.class || '')) return fill('#f0f3f6');
      return [];
    },
    park: fill('#e2efe6'),
    water: fill('#cce7f5'),
    waterway: function (p, z) {
      return { color: '#bbdeef', weight: z < 12 ? 0.7 : 1.4, opacity: 1, fill: false };
    },
    aeroway: { color: '#e0e5ed', weight: 2, fill: true, fillColor: '#e9eef3', fillOpacity: 1 },
    building: function (p, z) {
      return z >= 14 ? { fill: true, fillColor: '#e5ebf0', fillOpacity: 1, color: '#d6dfe8', weight: 0.45, opacity: 1 } : [];
    },
    boundary: function (p, z) {
      if (Number(p.admin_level) > 4 || z > 12) return [];
      return { color: '#bac7d3', weight: 0.7, opacity: 0.6, dashArray: '3,4', fill: false };
    },
    transportation: function (p, z) {
      var c = p.class || '';
      if (c === 'rail' || c === 'transit') {
        if (z < 10) return [];
        return { color: '#a7b9c9', weight: z < 13 ? 0.85 : 1.3, opacity: p.brunnel === 'tunnel' ? 0.5 : 0.8, dashArray: '3,3', fill: false };
      }
      var major = /motorway|trunk|primary|secondary|tertiary/.test(c);
      if ((!major && z < 13) || ((c === 'path' || c === 'track') && z < 14)) return [];
      var weight = major ? (z < 10 ? 0.9 : z < 13 ? 1.5 : 2.7) : 1.0;
      return [
        { color: '#d8e1e9', weight: weight + 1, opacity: 1, fill: false },
        { color: '#ffffff', weight: weight, opacity: 1, fill: false }
      ];
    },
    // Explicitly suppress label/POI layers if the adapter later retains them.
    aerodrome_label: [], housenumber: [], mountain_peak: [], place: [], poi: [], transportation_name: [], water_name: []
  };

  var SafeBasemap = L.VectorGrid.Protobuf.extend({
    _getVectorTilePromise: function (coords) {
      var self = this;
      var timer;
      var request;
      try { request = L.VectorGrid.Protobuf.prototype._getVectorTilePromise.call(this, coords); }
      catch (error) { request = Promise.reject(error); }
      var timeout = new Promise(function (_, reject) {
        timer = setTimeout(function () { reject(new Error('Basemap tile request timed out.')); }, 15000);
      });
      return Promise.race([request, timeout]).then(function (tile) {
        clearTimeout(timer);
        var prepared = prepareTile(tile);
        if (self._map) self.fire('basemapready', { coords: coords });
        return prepared;
      }).catch(function (error) {
        clearTimeout(timer);
        if (self._map) self.fire('tileerror', { error: error, coords: coords, tile: null });
        // An empty transparent tile completes Leaflet's loading cycle and lets
        // the independent local Japan outline remain visible below the grid.
        return { layers: {} };
      });
    }
  });

  root.TokyoBasemap = {
    sourceURL: sourceURL,
    attribution: attribution,
    create: function (options) {
      return new SafeBasemap(sourceURL, Object.assign({
        minZoom: 4,
        maxNativeZoom: 14,
        maxZoom: 18.5,
        noWrap: true,
        keepBuffer: 1,
        updateWhenIdle: true,
        updateWhenZooming: false,
        interactive: false,
        attribution: attribution,
        rendererFactory: function (coords, size, settings) { return new RetinaCanvasTile(coords, size, settings); },
        vectorTileLayerStyles: styles,
        fetchOptions: { mode: 'cors', credentials: 'omit', referrerPolicy: 'strict-origin-when-cross-origin' }
      }, options || {}));
    }
  };
  root.createTokyoBasemap = function (map, options) {
    var settings = Object.assign({}, options || {});
    var onTileSuccess = settings.onTileSuccess;
    var onTileFailure = settings.onTileFailure;
    delete settings.onTileSuccess;
    delete settings.onTileFailure;
    var layer = root.TokyoBasemap.create(settings);
    if (typeof onTileSuccess === 'function') layer.on('basemapready', onTileSuccess);
    if (typeof onTileFailure === 'function') layer.on('tileerror', onTileFailure);
    if (map) layer.addTo(map);
    return layer;
  };
})(window);
