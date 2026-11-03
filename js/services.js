/*
 * Servicios externos: búsqueda de lugares (Nominatim), rutas (OSRM)
 * y cargadores (OpenStreetMap/Overpass, Open Charge Map y propios).
 */
window.Services = (function () {
  'use strict';

  const CO_BBOX = [-4.3, -79.1, 13.5, -66.8]; // sur, oeste, norte, este
  const CACHE_HOURS = 12;

  // ---------- Utilidades ----------
  function norm(s) {
    return (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
  }

  function store(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* sin almacenamiento */ }
  }
  function load(key, fallback) {
    try {
      const v = localStorage.getItem(key);
      return v ? JSON.parse(v) : fallback;
    } catch (e) { return fallback; }
  }

  async function fetchJson(url, init, timeoutMs) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs || 30000);
    try {
      const r = await fetch(url, Object.assign({ signal: ctrl.signal }, init || {}));
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return await r.json();
    } finally {
      clearTimeout(t);
    }
  }

  // ---------- Lugares ----------
  async function geocode(text) {
    const q = norm(text);
    const coord = text.match(/(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/);
    if (coord) return { name: text.replace(/^📍\s*/, ''), lat: +coord[1], lon: +coord[2] };
    const preset = window.CO_PLACES.find(p => norm(p[0]) === q);
    if (preset) return { name: preset[0], lat: preset[1], lon: preset[2] };
    const url = 'https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=co&accept-language=es&q=' +
      encodeURIComponent(text);
    const res = await fetchJson(url, null, 15000);
    if (!res.length) throw new Error('No encontré el lugar "' + text + '"');
    return { name: res[0].display_name.split(',').slice(0, 2).join(','), lat: +res[0].lat, lon: +res[0].lon };
  }

  // ---------- Rutas ----------
  async function routes(points) {
    const path = points.map(p => p.lon.toFixed(6) + ',' + p.lat.toFixed(6)).join(';');
    const alt = points.length === 2 ? '&alternatives=2' : '';
    const url = 'https://router.project-osrm.org/route/v1/driving/' + path +
      '?overview=full&geometries=geojson&annotations=duration&steps=false' + alt;
    const res = await fetchJson(url, null, 45000);
    if (res.code !== 'Ok' || !res.routes.length) throw new Error('No se encontró una ruta por carretera');
    return res.routes.map(r => {
      const segDur = [].concat(...r.legs.map(l => (l.annotation && l.annotation.duration) || []));
      return {
        coords: r.geometry.coordinates,
        distanceKm: r.distance / 1000,
        durationMin: r.duration / 60,
        index: Planner.buildRouteIndex(r.geometry.coordinates, r.duration, segDur)
      };
    });
  }

  // ---------- Cargadores: OpenStreetMap ----------
  const OSM_SOCKETS = {
    type1: 'type1', type1_cable: 'type1', type1_combo: 'ccs1',
    type2: 'type2', type2_cable: 'type2', type2_combo: 'ccs2',
    chademo: 'chademo', gb_ac: 'gbt_ac', gb_dc: 'gbt_dc', 'gb-t20234': 'gbt_dc',
    tesla_supercharger: 'nacs', tesla_standard: 'nacs', nacs: 'nacs', tesla_supercharger_ccs: 'ccs2',
    schuko: 'domestic', typee: 'domestic', typeb: 'domestic', nema_5_15: 'domestic', nema_5_20: 'domestic',
    nema_14_50: 'domestic', cee_blue: 'domestic'
  };
  const DEFAULT_KW = { type1: 7, type2: 7.4, gbt_ac: 7, domestic: 2.3, ccs1: 50, ccs2: 50, chademo: 50, gbt_dc: 60, nacs: 120 };

  function parseKw(v) {
    if (!v) return null;
    const nums = String(v).replace(/,/g, '.').match(/\d+(\.\d+)?\s*(kw|w)?/gi);
    if (!nums) return null;
    let best = 0;
    for (const n of nums) {
      let x = parseFloat(n);
      if (/(^|[^k])w$/i.test(n.trim()) && x > 1000) x /= 1000;
      if (x > best) best = x;
    }
    return best > 0 && best < 1000 ? best : null;
  }

  function fromOsm(el) {
    const t = el.tags || {};
    const lat = el.lat != null ? el.lat : el.center && el.center.lat;
    const lon = el.lon != null ? el.lon : el.center && el.center.lon;
    if (lat == null) return null;
    const conns = [];
    const generalKw = parseKw(t['charging_station:output'] || t.maxpower || t.output);
    for (const k of Object.keys(t)) {
      const m = k.match(/^socket:([a-z0-9_-]+)$/i);
      if (!m || t[k] === 'no' || t[k] === '0') continue;
      const type = OSM_SOCKETS[m[1].toLowerCase()];
      if (!type) continue;
      let kw = parseKw(t[k + ':output']);
      let kwAssumed = false;
      if (!kw) { kw = generalKw && (Planner.isDC(type, generalKw) || generalKw <= 22) ? generalKw : DEFAULT_KW[type]; kwAssumed = !generalKw; }
      const count = parseInt(t[k], 10) || 1;
      conns.push({ type, kw, count, kwAssumed });
    }
    if (!conns.length) {
      const who = [t.name, t.brand, t.operator, t.network].join(' ');
      if (/voltex|terpel/i.test(who)) {
        // Red de carga rápida sin conectores registrados: se usa la configuración típica de Voltex
        const kw = generalKw || 40;
        for (const type of ['ccs1', 'ccs2', 'chademo', 'gbt_dc']) conns.push({ type, kw, count: 1, kwAssumed: true, typeAssumed: true });
        conns.push({ type: 'type2', kw: 7.4, count: 1, kwAssumed: true, typeAssumed: true });
      } else {
        conns.push({ type: 'unknown', kw: generalKw || null, count: parseInt(t.capacity, 10) || 1 });
      }
    }
    return {
      id: 'osm-' + el.type + '-' + el.id, source: 'OpenStreetMap',
      name: t.name || t.brand || t.operator || 'Estación de carga',
      operator: t.operator || t.brand || t.network || '',
      lat, lon, connectors: conns,
      access: t.access || '', fee: t.fee || '', price: t.charge || '',
      hours: t.opening_hours || '', address: [t['addr:street'], t['addr:housenumber'], t['addr:city']].filter(Boolean).join(' '),
      url: 'https://www.openstreetmap.org/' + el.type + '/' + el.id
    };
  }

  const OVERPASS = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
    'https://overpass.private.coffee/api/interpreter'
  ];

  let osmDownload = null;

  function downloadOsm() {
    if (osmDownload) return osmDownload;
    const b = CO_BBOX.join(',');
    const q = '[out:json][timeout:60];(node["amenity"="charging_station"](' + b + ');' +
      'way["amenity"="charging_station"](' + b + '););out center tags;';
    osmDownload = (async () => {
      let lastErr;
      for (const ep of OVERPASS) {
        try {
          const res = await fetchJson(ep, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: 'data=' + encodeURIComponent(q)
          }, 30000);
          const data = res.elements.map(fromOsm).filter(Boolean);
          store('ev.cache.osm', { t: Date.now(), data });
          return data;
        } catch (e) { lastErr = e; }
      }
      throw new Error('No se pudieron descargar los cargadores de OpenStreetMap (' + (lastErr && lastErr.message) + ')');
    })().finally(() => { osmDownload = null; });
    return osmDownload;
  }

  /**
   * Devuelve los cargadores de OSM sin hacer esperar al usuario: si hay datos
   * guardados o la copia incluida, se usan de inmediato y se actualiza en segundo plano.
   * Con force = true espera la descarga.
   */
  async function loadOsm(force, onWarn) {
    const cached = load('ev.cache.osm', null);
    const fresh = cached && Date.now() - cached.t < CACHE_HOURS * 3600e3;
    if (!force && fresh) return cached.data;
    const fallback = cached ? cached.data : window.OSM_SNAPSHOT ? window.OSM_SNAPSHOT.data : null;
    if (!force && fallback) {
      downloadOsm().catch(() => {});
      return fallback;
    }
    try {
      return await downloadOsm();
    } catch (e) {
      if (fallback) {
        onWarn && onWarn('OpenStreetMap no respondió; se usan los datos guardados' +
          (cached ? ' del ' + new Date(cached.t).toLocaleDateString('es-CO') : ' incluidos en la app (' + window.OSM_SNAPSHOT.date + ')') + '.');
        return fallback;
      }
      throw e;
    }
  }

  // ---------- Cargadores: Open Charge Map (requiere clave gratuita) ----------
  function ocmType(title, currentTypeId) {
    const t = norm(title);
    if (t.includes('ccs')) return t.includes('type 1') || t.includes('sae') ? 'ccs1' : 'ccs2';
    if (t.includes('chademo')) return 'chademo';
    if (t.includes('gb-t') || t.includes('gb/t') || t.includes('gbt'))
      return currentTypeId === 30 || t.includes('dc') ? 'gbt_dc' : 'gbt_ac';
    if (t.includes('tesla') || t.includes('nacs')) return 'nacs';
    if (t.includes('type 2') || t.includes('mennekes')) return 'type2';
    if (t.includes('j1772') || t.includes('type 1')) return 'type1';
    if (t.includes('schuko') || t.includes('nema') || t.includes('cee 7') || t.includes('domestic') || t.includes('bs1363')) return 'domestic';
    return 'unknown';
  }

  function fromOcm(p) {
    const a = p.AddressInfo || {};
    if (p.StatusType && p.StatusType.IsOperational === false) return null;
    const conns = (p.Connections || []).map(c => {
      const type = ocmType(c.ConnectionType && c.ConnectionType.Title, c.CurrentTypeID);
      const kw = c.PowerKW || DEFAULT_KW[type] || null;
      return { type, kw, count: c.Quantity || 1, kwAssumed: !c.PowerKW };
    });
    if (!conns.length) conns.push({ type: 'unknown', kw: null, count: 1 });
    const usage = p.UsageType && p.UsageType.Title || '';
    return {
      id: 'ocm-' + p.ID, source: 'Open Charge Map',
      name: a.Title || 'Estación de carga',
      operator: p.OperatorInfo && p.OperatorInfo.Title || '',
      lat: a.Latitude, lon: a.Longitude, connectors: conns,
      access: /private/i.test(usage) ? 'private' : '', fee: '', price: p.UsageCost || '',
      hours: a.AccessComments || '', address: [a.AddressLine1, a.Town].filter(Boolean).join(', '),
      url: 'https://map.openchargemap.io/?id=' + p.ID
    };
  }

  async function loadOcm(key, force) {
    if (!key) return [];
    const cached = load('ev.cache.ocm', null);
    if (!force && cached && cached.key === key && Date.now() - cached.t < CACHE_HOURS * 3600e3) return cached.data;
    const url = 'https://api.openchargemap.io/v3/poi/?output=json&countrycode=CO&maxresults=5000&compact=false&verbose=false&key=' +
      encodeURIComponent(key);
    const res = await fetchJson(url, null, 60000);
    const data = res.map(fromOcm).filter(Boolean);
    store('ev.cache.ocm', { t: Date.now(), key, data });
    return data;
  }

  // ---------- Combinación ----------
  function merge(lists) {
    const out = [];
    for (const list of lists) {
      for (const ch of list) {
        if (!ch || !isFinite(ch.lat) || !isFinite(ch.lon)) continue;
        const dup = out.find(o => Math.abs(o.lat - ch.lat) < 0.0006 && Math.abs(o.lon - ch.lon) < 0.0006 &&
          Planner.haversineKm(o.lat, o.lon, ch.lat, ch.lon) < 0.06);
        if (!dup) { out.push(ch); continue; }
        // Se queda con la fuente que tenga más información de conectores
        const known = c => c.connectors.filter(x => x.type !== 'unknown').length;
        if (dup.source !== 'Propio' && known(ch) > known(dup)) Object.assign(dup, ch, { source: dup.source + ' + ' + ch.source });
        else dup.source = dup.source.includes(ch.source) ? dup.source : dup.source + ' + ' + ch.source;
      }
    }
    return out;
  }

  async function loadChargers({ ocmKey, custom, force, onWarn }) {
    const lists = [custom || []];
    const tasks = [
      loadOsm(force, onWarn).catch(e => { onWarn && onWarn(e.message); return []; }),
      loadOcm(ocmKey, force).catch(e => { onWarn && onWarn('Open Charge Map: ' + e.message); return []; })
    ];
    const [osm, ocm] = await Promise.all(tasks);
    lists.push(ocm, osm);
    return { all: merge(lists), counts: { osm: osm.length, ocm: ocm.length, custom: (custom || []).length } };
  }

  return { fromOsm, geocode, routes, loadChargers, store, load, norm };
})();
