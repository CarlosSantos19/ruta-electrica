/* Interfaz de la aplicación: formulario, mapa y resultados. */
(function () {
  'use strict';

  const $ = id => document.getElementById(id);
  const C = Planner.CONNECTORS;
  const CONNECTOR_ORDER = ['type1', 'type2', 'gbt_ac', 'domestic', 'ccs1', 'ccs2', 'chademo', 'gbt_dc', 'nacs'];

  const state = {
    chargers: null, counts: null, chargerWarn: [],
    routes: [], results: [], selected: 0, points: null,
    pickMode: null, pendingCharger: null
  };

  // ---------- Formato ----------
  const cop = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });
  const num = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 });
  const num1 = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 1 });
  function fmtMin(m) {
    m = Math.round(m);
    if (m < 60) return m + ' min';
    const h = Math.floor(m / 60), r = m % 60;
    return h + ' h' + (r ? ' ' + String(r).padStart(2, '0') + ' min' : '');
  }
  function fmtKm(k) { return (k < 10 ? num1.format(k) : num.format(k)) + ' km'; }
  function fmtClock(base, addMin) {
    if (!base) return '';
    const d = new Date(base.getTime() + addMin * 60000);
    return d.toLocaleString('es-CO', { weekday: 'short', hour: '2-digit', minute: '2-digit' });
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function connLabel(c) {
    const kw = c.kw ? ' · ' + num1.format(c.kw) + ' kW' + (c.kwAssumed ? '*' : '') : '';
    return (C[c.type] ? C[c.type].label : c.type) + kw;
  }
  function gmapsDir(lat, lon) {
    return 'https://www.google.com/maps/dir/?api=1&destination=' + lat + ',' + lon + '&travelmode=driving';
  }

  // ---------- Mapa ----------
  const map = L.map('map', { zoomControl: true }).setView([6.5, -74.5], 6);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19, attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
  }).addTo(map);
  const layers = {
    alt: L.layerGroup().addTo(map),
    route: L.layerGroup().addTo(map),
    nearby: L.layerGroup().addTo(map),
    all: L.layerGroup(),
    stops: L.layerGroup().addTo(map),
    picks: L.layerGroup().addTo(map)
  };
  const cssVar = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();

  function endIcon(letter) {
    return L.divIcon({ className: '', html: '<div class="end-marker"><span>' + letter + '</span></div>', iconSize: [30, 30], iconAnchor: [15, 30] });
  }
  function stopIcon(n) {
    return L.divIcon({ className: '', html: '<div class="stop-marker">' + n + '</div>', iconSize: [28, 28], iconAnchor: [14, 14] });
  }

  // ---------- Vehículo ----------
  function fillCarSelect() {
    const sel = $('car-select');
    const brands = {};
    for (const v of window.EV_VEHICLES) (brands[v.brand] = brands[v.brand] || []).push(v);
    sel.innerHTML = '';
    for (const b of Object.keys(brands)) {
      const g = document.createElement('optgroup');
      g.label = b;
      for (const v of brands[b]) g.appendChild(new Option(v.brand + ' ' + v.model, v.id));
      sel.appendChild(g);
    }
    sel.appendChild(new Option('Otro / personalizado', 'custom'));
  }

  function chipHtml(name, type, checked) {
    const c = C[type];
    return '<label class="chip"><input type="checkbox" name="' + name + '" value="' + type + '"' + (checked ? ' checked' : '') +
      '><span>' + c.label + ' <small>' + c.current + '</small></span></label>';
  }
  function renderConnectorChips(boxId, name, selected) {
    $(boxId).innerHTML = CONNECTOR_ORDER.map(t => chipHtml(name, t, selected.includes(t))).join('');
  }

  function applyCar(id) {
    const v = window.EV_VEHICLES.find(x => x.id === id);
    if (!v) return;
    $('car-battery').value = v.battery;
    $('car-consumption').value = v.consumption;
    $('car-ac').value = v.acKw;
    $('car-dc').value = v.dcKw;
    renderConnectorChips('car-connectors', 'car-conn', v.connectors);
    updateRange();
  }

  function readCar() {
    return {
      id: $('car-select').value,
      name: $('car-select').selectedOptions[0] ? $('car-select').selectedOptions[0].textContent : 'Vehículo',
      battery: +$('car-battery').value,
      consumption: +$('car-consumption').value,
      acKw: +$('car-ac').value,
      dcKw: +$('car-dc').value,
      connectors: [...document.querySelectorAll('input[name=car-conn]:checked')].map(i => i.value)
    };
  }

  function readOpts() {
    return {
      startSoc: +$('start-soc').value,
      minStopSoc: +$('min-stop').value,
      minArriveSoc: +$('min-arrive').value,
      maxChargeSoc: +$('max-charge').value,
      maxDetourKm: +$('detour').value,
      consumptionFactor: +$('conditions').value,
      minPowerKw: +$('min-power').value,
      stopOverheadMin: +$('overhead').value,
      priceDC: +$('price-dc').value,
      priceAC: +$('price-ac').value,
      includeAC: $('include-ac').checked,
      includeUnknown: $('include-unknown').checked
    };
  }

  function updateRange() {
    const car = readCar(), o = readOpts();
    if (!car.battery || !car.consumption) { $('car-range').textContent = ''; return; }
    const perKm = car.consumption * o.consumptionFactor / 100;
    const full = car.battery / perKm;
    const usable = car.battery * (o.maxChargeSoc - o.minStopSoc) / 100 / perKm;
    $('car-range').innerHTML = 'Autonomía estimada en carretera: <b>' + fmtKm(full) + '</b> con 100 %. ' +
      'Entre cargas (' + o.minStopSoc + ' % → ' + o.maxChargeSoc + ' %): <b>' + fmtKm(usable) + '</b>.';
  }

  // ---------- Preferencias guardadas ----------
  const PREF_IDS = ['car-select', 'car-battery', 'car-consumption', 'car-ac', 'car-dc', 'origin', 'via', 'dest', 'start-soc',
    'min-stop', 'min-arrive', 'max-charge', 'detour', 'conditions', 'min-power', 'overhead', 'price-dc', 'price-ac', 'ocm-key'];
  const PREF_CHECKS = ['include-ac', 'include-unknown'];

  function collectForm() {
    const f = {};
    for (const id of PREF_IDS) f[id] = $(id).value;
    for (const id of PREF_CHECKS) f[id] = $(id).checked;
    for (const id of ['origin', 'via', 'dest']) if ($(id).dataset.lat) f[id + '@'] = [+$(id).dataset.lat, +$(id).dataset.lon];
    f.connectors = readCar().connectors;
    return f;
  }
  function applyForm(f) {
    if (!f) return;
    if (f['car-select']) $('car-select').value = f['car-select'];
    for (const id of PREF_IDS) if (f[id] != null && id !== 'car-select') $(id).value = f[id];
    for (const id of PREF_CHECKS) if (f[id] != null) $(id).checked = f[id];
    for (const id of ['origin', 'via', 'dest']) {
      delete $(id).dataset.lat; delete $(id).dataset.lon;
      if (f[id + '@']) { $(id).dataset.lat = f[id + '@'][0]; $(id).dataset.lon = f[id + '@'][1]; }
    }
    if (f.via) $('via-row').hidden = false;
    renderConnectorChips('car-connectors', 'car-conn', f.connectors || []);
    syncLabels();
  }
  function savePrefs() { Services.store('ev.prefs', collectForm()); }

  function syncLabels() {
    $('start-soc-val').textContent = $('start-soc').value + '%';
    $('min-stop-val').textContent = $('min-stop').value + '%';
    $('min-arrive-val').textContent = $('min-arrive').value + '%';
    $('max-charge-val').textContent = $('max-charge').value + '%';
    $('detour-val').textContent = $('detour').value + ' km';
    updateRange();
  }

  // ---------- Estado ----------
  function setStatus(msg, kind) {
    const el = $('status');
    el.className = 'status' + (kind ? ' ' + kind : '');
    el.innerHTML = kind === 'busy' ? '<span class="spinner"></span>' + esc(msg) : esc(msg);
  }

  // ---------- Cargadores ----------
  function customChargers() { return Services.load('ev.custom', []); }

  async function ensureChargers(force) {
    if (state.chargers && !force) return state.chargers;
    state.chargerWarn = [];
    const res = await Services.loadChargers({
      ocmKey: $('ocm-key').value.trim(), custom: customChargers(), force,
      onWarn: m => state.chargerWarn.push(m)
    });
    state.chargers = res.all.filter(c => !/^(private|no)$/i.test(c.access));
    state.counts = res.counts;
    const c = res.counts;
    $('source-status').innerHTML = '<b>' + num.format(state.chargers.length) + '</b> estaciones públicas en Colombia: ' +
      num.format(c.osm) + ' de OpenStreetMap' + (c.ocm ? ', ' + num.format(c.ocm) + ' de Open Charge Map' : '') +
      (c.custom ? ', ' + c.custom + ' propias' : '') + '.' +
      (state.chargerWarn.length ? '<br><span style="color:var(--warn)">' + esc(state.chargerWarn.join(' · ')) + '</span>' : '');
    if ($('show-all').checked) drawAllChargers();
    return state.chargers;
  }

  function renderCustomList() {
    const list = customChargers();
    $('custom-list').innerHTML = list.map(c => '<li><span>⚡ ' + esc(c.name) + ' <small>(' + c.connectors.map(connLabel).join(', ') + ')</small></span>' +
      '<button type="button" class="btn small ghost" data-del="' + esc(c.id) + '">Eliminar</button></li>').join('');
  }

  function chargerPopup(ch, car, extra) {
    const conn = Planner.bestConnector(ch, car, Object.assign(readOpts(), { includeUnknown: true }));
    let est = '';
    if (conn) {
      const curve = Planner.chargeCurve(car, conn);
      est = '<div>Tu carro: <b>' + C[conn.type].label + '</b> a ~' + num1.format(conn.effKw) + ' kW' +
        (conn.assumed ? ' (supuesto)' : '') + '<br>20 % → 80 %: <b>' + fmtMin(Planner.chargeMinutes(curve, 20, 80)) + '</b></div>';
    } else {
      est = '<div style="color:#b3261e"><b>No compatible</b> con los conectores de tu carro.</div>';
    }
    return '<h4>' + esc(ch.name) + '</h4>' +
      '<div class="meta">' + esc([ch.operator, ch.address].filter(Boolean).join(' · ')) + '</div>' +
      '<div style="margin:6px 0">' + ch.connectors.map(c => '• ' + esc(connLabel(c)) + (c.count > 1 ? ' ×' + c.count : '')).join('<br>') + '</div>' +
      est +
      (extra || '') +
      (ch.price ? '<div class="meta">Precio: ' + esc(ch.price) + '</div>' : '') +
      (ch.hours ? '<div class="meta">Horario: ' + esc(ch.hours) + '</div>' : '') +
      '<div class="meta">Fuente: ' + esc(ch.source) + (ch.connectors.some(c => c.kwAssumed) ? ' · *potencia estimada' : '') + '</div>' +
      '<div style="margin-top:6px"><a href="' + gmapsDir(ch.lat, ch.lon) + '" target="_blank" rel="noopener">Cómo llegar</a>' +
      (ch.url ? ' · <a href="' + esc(ch.url) + '" target="_blank" rel="noopener">Ver fuente</a>' : '') + '</div>';
  }

  function drawAllChargers() {
    layers.all.clearLayers();
    if (!state.chargers) return;
    const car = readCar(), opts = readOpts();
    for (const ch of state.chargers) {
      const ok = !!Planner.bestConnector(ch, car, opts);
      L.circleMarker([ch.lat, ch.lon], {
        radius: 5, weight: 1, color: '#fff', fillOpacity: .85,
        fillColor: ok ? cssVar('--accent') : cssVar('--no')
      }).bindPopup(() => chargerPopup(ch, car)).addTo(layers.all);
    }
  }

  // ---------- Planificación ----------
  async function resolvePoint(id) {
    const el = $(id);
    const text = el.value.trim();
    if (!text) return null;
    if (el.dataset.lat) return { name: text.replace(/^📍\s*/, 'Punto '), lat: +el.dataset.lat, lon: +el.dataset.lon };
    return Services.geocode(text);
  }

  async function onPlan(e) {
    e.preventDefault();
    const car = readCar(), opts = readOpts();
    if (!car.connectors.length) { setStatus('Selecciona al menos un conector de tu carro.', 'error'); return; }
    savePrefs();
    $('plan-btn').disabled = true;
    try {
      setStatus('Buscando lugares…', 'busy');
      const origin = await resolvePoint('origin');
      const via = $('via-row').hidden ? null : await resolvePoint('via');
      const dest = await resolvePoint('dest');
      if (!origin || !dest) throw new Error('Escribe el origen y el destino.');
      state.points = { origin, via, dest };

      setStatus('Descargando cargadores…', 'busy');
      const chargersP = ensureChargers();
      setStatus('Calculando rutas…', 'busy');
      const routesP = Services.routes([origin, via, dest].filter(Boolean));
      const [chargers, routes] = await Promise.all([chargersP, routesP]);

      setStatus('Buscando las mejores paradas de carga…', 'busy');
      await new Promise(r => setTimeout(r, 20));
      state.routes = routes;
      state.results = routes.map(r => Planner.plan(r.index, chargers, car, opts));
      state.departAt = $('depart').value ? new Date($('depart').value) : null;
      // Selecciona la ruta viable más rápida
      let best = 0;
      state.results.forEach((r, i) => {
        const b = state.results[best];
        if (r.feasible && (!b.feasible || r.totals.min < b.totals.min)) best = i;
      });
      setStatus('');
      select(best);
      if (window.matchMedia('(max-width: 860px)').matches) $('results').scrollIntoView({ behavior: 'smooth' });
    } catch (err) {
      console.error(err);
      setStatus(err.name === 'AbortError' ? 'El servicio tardó demasiado en responder. Intenta de nuevo.' : err.message, 'error');
    } finally {
      $('plan-btn').disabled = false;
    }
  }

  function select(i) {
    state.selected = i;
    renderTabs();
    renderResult(state.results[i], state.routes[i]);
    drawMap();
  }

  function renderTabs() {
    const box = $('route-tabs');
    if (state.results.length < 2) { box.innerHTML = ''; return; }
    box.innerHTML = state.results.map((r, i) => {
      const rt = state.routes[i];
      const info = r.feasible ? fmtMin(r.totals.min) + ' · ' + r.stops.length + ' parada' + (r.stops.length === 1 ? '' : 's')
        : 'Sin carga suficiente';
      return '<button type="button" class="tab" role="tab" aria-selected="' + (i === state.selected) + '" data-tab="' + i + '">' +
        '<b>Ruta ' + (i + 1) + ' · ' + fmtKm(rt.distanceKm) + '</b>' + info + '</button>';
    }).join('');
  }

  function stat(label, value) { return '<div class="stat"><small>' + label + '</small><b>' + value + '</b></div>'; }

  function renderResult(res, route) {
    $('results').hidden = false;
    const p = state.points;
    const warn = [];

    if (!res.feasible) {
      const f = res.failure;
      $('summary').innerHTML = stat('Distancia', fmtKm(route.distanceKm)) + stat('Manejo sin paradas', fmtMin(route.durationMin * 1.1)) +
        stat('Cargadores compatibles', res.candidateCount);
      $('warnings').innerHTML = '<div class="alert error"><b>Con este carro no se puede completar la ruta con los cargadores conocidos.</b>' +
        '<br>Llegas como máximo hasta el km ' + num.format(f.reachKm) + ' saliendo de ' + esc(f.lastName) + ' (km ' + num.format(f.lastKm) + '). ' +
        (f.nextKm ? 'El siguiente cargador compatible está en el km ' + num.format(f.nextKm) + ' (' + esc(f.nextName) + ').'
          : 'No hay más cargadores compatibles hasta el destino.') +
        '<ul>' + (state.counts && state.counts.ocm ? '' : '<li>Agrega una clave de Open Charge Map (paso 4) para tener más estaciones.</li>') +
        (res.opts.includeUnknown && res.opts.includeAC ? '' : '<li>Activa “Incluir estaciones sin datos de conector” y “Usar cargadores lentos” (paso 3).</li>') +
        (res.opts.maxChargeSoc < 100 ? '<li>Sube “Cargar como máximo hasta” a 100 % (paso 3).</li>' : '') +
        '<li>Aumenta el desvío máximo permitido, sal con la batería llena o elige condiciones “Plano” si vas despacio.</li>' +
        '<li>Si conoces un hotel o finca con cargador en el tramo, agrégalo con “+ Agregar un cargador que conozco”.</li>' +
        (state.routes.length > 1 ? '<li>Prueba otra de las rutas alternativas de arriba.</li>' : '') + '</ul></div>';
      $('soc-chart').innerHTML = '';
      $('soc-chart').parentElement.hidden = true;
      $('itinerary').innerHTML = '';
      $('gmaps-link').href = 'https://www.google.com/maps/dir/?api=1&origin=' + p.origin.lat + ',' + p.origin.lon +
        '&destination=' + p.dest.lat + ',' + p.dest.lon;
      return;
    }

    const t = res.totals;
    const eta = state.departAt ? fmtClock(state.departAt, t.min) : '—';
    $('summary').innerHTML =
      stat('Distancia', fmtKm(t.km)) + stat('Tiempo total', fmtMin(t.min)) + stat('Llegada', eta) +
      stat('Manejando', fmtMin(t.driveMin)) + stat('Cargando', fmtMin(t.chargeMin + t.overheadMin)) +
      stat('Paradas', res.stops.length) +
      stat('Energía usada', num.format(t.energyUsed) + ' kWh') + stat('Costo carga*', cop.format(t.cost)) +
      stat('Batería al llegar', Math.round(res.arriveSoc) + ' %');

    if (res.stops.some(s => s.conn.assumed || s.conn.kwAssumed)) warn.push('Algunas paradas tienen potencia o conectores estimados (marcadas con “sin verificar”). Confírmalas antes de salir.');
    if (res.stops.some(s => !s.conn.dc)) warn.push('El plan incluye carga lenta (AC). Considera dormir o almorzar en esas paradas.');
    if (t.driveMin > 8 * 60) warn.push('Son más de 8 horas manejando: planea descansar o dividir el viaje en dos días.');
    if (!state.counts || !state.counts.ocm) warn.push('Solo se usaron datos de OpenStreetMap. Con una clave de Open Charge Map (paso 4) aparecen más cargadores.');
    if (state.chargerWarn.length) warn.push(...state.chargerWarn);
    $('warnings').innerHTML = warn.length ? '<div class="alert warn"><ul>' + warn.map(w => '<li>' + esc(w) + '</li>').join('') + '</ul>' +
      '<small>*Costo estimado con los precios por kWh de tus preferencias.</small></div>' : '';

    $('soc-chart').parentElement.hidden = false;
    renderChart(res);
    renderItinerary(res);

    const wps = res.stops.slice(0, 9).map(s => s.charger.lat + ',' + s.charger.lon);
    if (p.via) wps.unshift(p.via.lat + ',' + p.via.lon);
    $('gmaps-link').href = 'https://www.google.com/maps/dir/?api=1&origin=' + p.origin.lat + ',' + p.origin.lon +
      '&destination=' + p.dest.lat + ',' + p.dest.lon + (wps.length ? '&waypoints=' + encodeURIComponent(wps.join('|')) : '') + '&travelmode=driving';
  }

  function renderItinerary(res) {
    const p = state.points, base = state.departAt;
    const items = [];
    items.push('<li class="endpoint"><span class="bullet">A</span><div class="box"><h4>' + esc(p.origin.name) + '</h4>' +
      '<div class="meta">Salida' + (base ? ' · ' + fmtClock(base, 0) : '') + ' · batería ' + res.opts.startSoc + ' %</div></div></li>');
    res.legs.forEach((lg, k) => {
      items.push('<li><span class="bullet">🚗</span><div class="drive">Maneja <b>' + fmtKm(lg.km) + '</b> · ' + fmtMin(lg.min) +
        ' · usas ~' + num.format(lg.energyKwh) + ' kWh · llegas con <b>' + Math.round(lg.arriveSoc) + ' %</b></div></li>');
      const s = res.stops[k];
      if (!s) return;
      const ch = s.charger;
      const unverified = s.conn.assumed || s.conn.kwAssumed;
      items.push('<li class="stop"><span class="bullet">' + (k + 1) + '</span><div class="box">' +
        '<h4>' + esc(ch.name) + '<span class="badge ' + (s.conn.dc ? 'dc' : '') + '">' + (s.conn.dc ? 'Rápida DC' : 'Lenta AC') + '</span>' +
        (unverified ? '<span class="badge warn">sin verificar</span>' : '') + '</h4>' +
        '<div class="meta">' + esc([ch.operator, ch.address].filter(Boolean).join(' · ')) + (ch.operator || ch.address ? '<br>' : '') +
        'Km ' + num.format(s.km) + ' de la ruta' + (s.offKm > 0.3 ? ' · desvío ' + fmtKm(s.offKm) + ' de la vía' : '') +
        (base ? ' · llegas ' + fmtClock(base, s.arriveAtMin) : '') + '</div>' +
        '<div class="charge">' +
        '<span>🔋 <b>' + Math.round(s.arriveSoc) + ' % → ' + Math.round(s.departSoc) + ' %</b></span>' +
        '<span>⏱ <b>' + fmtMin(s.chargeMin) + '</b> cargando</span>' +
        '<span>⚡ ' + esc(s.conn.type === 'unknown' ? 'Conector sin datos' : C[s.conn.type].label) + ' · ' + num1.format(s.conn.effKw) + ' kW</span>' +
        '<span>' + num1.format(s.kwh) + ' kWh · ≈ ' + cop.format(s.cost) + '</span>' +
        '</div>' +
        '<div class="meta" style="margin-top:6px">' + (base ? 'Sales ' + fmtClock(base, s.departAtMin) + ' · ' : '') +
        '<a href="' + gmapsDir(ch.lat, ch.lon) + '" target="_blank" rel="noopener">Cómo llegar</a> · ' +
        '<a href="#" data-focus="' + k + '">Ver en el mapa</a> · ' + esc(ch.source) + '</div>' +
        '</div></li>');
    });
    items.push('<li class="endpoint"><span class="bullet">B</span><div class="box"><h4>' + esc(p.dest.name) + '</h4>' +
      '<div class="meta">Llegada' + (base ? ' · ' + fmtClock(base, res.totals.min) : '') + ' · batería ' + Math.round(res.arriveSoc) + ' %</div></div></li>');
    $('itinerary').innerHTML = items.join('');
  }

  function renderChart(res) {
    const W = 400, H = 150, pl = 30, pr = 8, pt = 8, pb = 22;
    const maxKm = Math.max(1, res.totalKm);
    const x = k => pl + (W - pl - pr) * k / maxKm;
    const y = s => pt + (H - pt - pb) * (1 - s / 100);
    const pts = res.profile.map(p => x(p.km).toFixed(1) + ',' + y(p.soc).toFixed(1));
    const area = 'M' + x(0) + ',' + y(0) + ' L' + pts.join(' L') + ' L' + x(res.profile[res.profile.length - 1].km) + ',' + y(0) + ' Z';
    const ticks = [0, 0.25, 0.5, 0.75, 1].map(f => {
      const k = maxKm * f;
      return '<text class="lbl" x="' + x(k) + '" y="' + (H - 6) + '" text-anchor="' + (f === 0 ? 'start' : f === 1 ? 'end' : 'middle') + '">' + num.format(k) + ' km</text>';
    }).join('');
    const yl = [0, 50, 100].map(s => '<text class="lbl" x="' + (pl - 4) + '" y="' + (y(s) + 3) + '" text-anchor="end">' + s + '%</text>' +
      '<line class="axis" x1="' + pl + '" x2="' + (W - pr) + '" y1="' + y(s) + '" y2="' + y(s) + '"/>').join('');
    const dots = res.stops.map(s => '<circle class="stopdot" r="3.5" cx="' + x(s.km) + '" cy="' + y(s.arriveSoc) + '"/>').join('');
    $('soc-chart').innerHTML = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Nivel de batería a lo largo de la ruta">' +
      yl + '<path class="area" d="' + area + '"/>' +
      '<line class="reserve" x1="' + pl + '" x2="' + (W - pr) + '" y1="' + y(res.opts.minStopSoc) + '" y2="' + y(res.opts.minStopSoc) + '"/>' +
      '<polyline class="line" points="' + pts.join(' ') + '"/>' + dots + ticks + '</svg>';
  }

  function drawMap() {
    for (const k of ['alt', 'route', 'nearby', 'stops', 'picks']) layers[k].clearLayers();
    const res = state.results[state.selected];
    const car = readCar();
    state.routes.forEach((r, i) => {
      if (i === state.selected) return;
      L.polyline(r.coords.map(c => [c[1], c[0]]), { color: cssVar('--no'), weight: 5, opacity: .6 })
        .on('click', () => select(i)).bindTooltip('Ruta ' + (i + 1) + ' (clic para ver)', { sticky: true }).addTo(layers.alt);
    });
    const rt = state.routes[state.selected];
    const line = L.polyline(rt.coords.map(c => [c[1], c[0]]), { color: cssVar('--accent'), weight: 6, opacity: .9 }).addTo(layers.route);

    const stopIds = new Set(res.stops.map(s => s.charger.id));
    for (const n of res.nearby) {
      if (stopIds.has(n.charger.id)) continue;
      const ok = n.conn && n.proj.offKm <= res.opts.maxDetourKm && n.conn.effKw >= res.opts.minPowerKw;
      L.circleMarker([n.charger.lat, n.charger.lon], {
        radius: ok ? 6 : 4.5, weight: 1.5, color: '#fff', fillOpacity: .9,
        fillColor: ok ? cssVar('--accent') : cssVar('--no')
      }).bindPopup(() => chargerPopup(n.charger, car, '<div class="meta">Km ' + num.format(n.proj.km) + ' · a ' + fmtKm(n.proj.offKm) + ' de la vía</div>'))
        .addTo(layers.nearby);
    }
    state.stopMarkers = res.stops.map((s, k) => L.marker([s.charger.lat, s.charger.lon], { icon: stopIcon(k + 1), zIndexOffset: 1000 })
      .bindPopup(chargerPopup(s.charger, car, '<div><b>Parada ' + (k + 1) + ':</b> ' + Math.round(s.arriveSoc) + ' % → ' + Math.round(s.departSoc) +
        ' % en ' + fmtMin(s.chargeMin) + '</div>')).addTo(layers.stops));
    const p = state.points;
    L.marker([p.origin.lat, p.origin.lon], { icon: endIcon('A'), zIndexOffset: 1100 }).bindPopup(esc(p.origin.name)).addTo(layers.stops);
    if (p.via) L.marker([p.via.lat, p.via.lon], { icon: endIcon('•'), zIndexOffset: 1100 }).bindPopup(esc(p.via.name)).addTo(layers.stops);
    L.marker([p.dest.lat, p.dest.lon], { icon: endIcon('B'), zIndexOffset: 1100 }).bindPopup(esc(p.dest.name)).addTo(layers.stops);
    map.fitBounds(line.getBounds(), { padding: [30, 30] });
  }

  // ---------- Selección en el mapa ----------
  function startPick(mode) {
    state.pickMode = mode;
    document.querySelectorAll('.pick').forEach(b => b.classList.toggle('active', b.dataset.pick === mode));
    const txt = { origin: 'el origen', dest: 'el destino', via: 'la parada intermedia', charger: 'dónde está el cargador' }[mode];
    $('pick-text').textContent = 'Haz clic en el mapa para marcar ' + txt;
    $('pick-banner').hidden = false;
    document.body.classList.add('show-map');
    $('toggle-panel').textContent = 'Ver formulario';
    setTimeout(() => map.invalidateSize(), 50);
  }
  function endPick() {
    state.pickMode = null;
    document.querySelectorAll('.pick').forEach(b => b.classList.remove('active'));
    $('pick-banner').hidden = true;
  }

  map.on('click', e => {
    if (!state.pickMode) return;
    const { lat, lng } = e.latlng;
    const mode = state.pickMode;
    endPick();
    if (mode === 'charger') {
      state.pendingCharger = { lat, lon: lng };
      $('charger-coords').textContent = 'Ubicación: ' + lat.toFixed(5) + ', ' + lng.toFixed(5);
      renderConnectorChips('cf-connectors', 'cf-conn', ['type2']);
      $('charger-dialog').showModal();
      return;
    }
    const el = $(mode);
    el.value = '📍 ' + lat.toFixed(5) + ', ' + lng.toFixed(5);
    el.dataset.lat = lat; el.dataset.lon = lng;
    L.marker([lat, lng], { icon: endIcon(mode === 'origin' ? 'A' : mode === 'dest' ? 'B' : '•') }).addTo(layers.picks);
    savePrefs();
    if (window.matchMedia('(max-width: 860px)').matches) { document.body.classList.remove('show-map'); $('toggle-panel').textContent = 'Ver mapa'; }
  });

  // ---------- Viajes guardados ----------
  function renderSaved() {
    const trips = Services.load('ev.trips', []);
    $('saved-card').hidden = !trips.length;
    $('saved-list').innerHTML = trips.map(t => '<li><a href="#" data-load="' + t.id + '">' + esc(t.name) + '</a>' +
      '<span><small>' + esc(t.summary || '') + '</small> <button type="button" class="btn small ghost" data-trip-del="' + t.id + '">×</button></span></li>').join('');
  }

  // ---------- Eventos ----------
  function init() {
    fillCarSelect();
    $('places').innerHTML = window.CO_PLACES.map(p => '<option value="' + esc(p[0]) + '">').join('');
    const now = new Date(); now.setMinutes(now.getMinutes() < 30 ? 30 : 60, 0, 0);
    const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    $('depart').value = local;

    const prefs = Services.load('ev.prefs', null);
    if (prefs) applyForm(prefs);
    else {
      $('car-select').value = 'byd-dolphin-60';
      applyCar('byd-dolphin-60');
      $('origin').value = 'Bogotá';
      $('dest').value = 'Barranquilla';
    }
    // Enlaces compartibles: ?origen=Bogotá&destino=Barranquilla&carro=kia-ev6&bateria=90
    const qs = new URLSearchParams(location.search);
    if (qs.get('carro') && window.EV_VEHICLES.some(v => v.id === qs.get('carro'))) {
      $('car-select').value = qs.get('carro');
      applyCar(qs.get('carro'));
    }
    for (const [param, id] of [['origen', 'origin'], ['destino', 'dest']]) {
      if (qs.get(param)) { $(id).value = qs.get(param); delete $(id).dataset.lat; delete $(id).dataset.lon; }
    }
    if (qs.get('bateria')) $('start-soc').value = qs.get('bateria');
    syncLabels();
    renderCustomList();
    renderSaved();

    $('car-select').addEventListener('change', e => { if (e.target.value !== 'custom') applyCar(e.target.value); savePrefs(); });
    for (const id of ['car-battery', 'car-consumption', 'car-ac', 'car-dc']) $(id).addEventListener('input', () => {
      if ($('car-select').value !== 'custom') $('car-select').value = 'custom';
      updateRange();
    });
    $('trip-form').addEventListener('input', e => {
      if (['origin', 'via', 'dest'].includes(e.target.id)) { delete e.target.dataset.lat; delete e.target.dataset.lon; }
      syncLabels();
    });
    $('trip-form').addEventListener('change', () => { savePrefs(); if ($('show-all').checked) drawAllChargers(); });
    $('trip-form').addEventListener('submit', onPlan);

    $('add-via').addEventListener('click', () => {
      const row = $('via-row');
      row.hidden = !row.hidden;
      if (row.hidden) { $('via').value = ''; delete $('via').dataset.lat; }
      $('add-via').textContent = row.hidden ? '+ Agregar parada intermedia' : '− Quitar parada intermedia';
      savePrefs();
    });
    if (!$('via-row').hidden) $('add-via').textContent = '− Quitar parada intermedia';
    $('swap').addEventListener('click', () => {
      const a = $('origin'), b = $('dest');
      [a.value, b.value] = [b.value, a.value];
      const da = Object.assign({}, a.dataset), db = Object.assign({}, b.dataset);
      delete a.dataset.lat; delete a.dataset.lon; delete b.dataset.lat; delete b.dataset.lon;
      if (db.lat) { a.dataset.lat = db.lat; a.dataset.lon = db.lon; }
      if (da.lat) { b.dataset.lat = da.lat; b.dataset.lon = da.lon; }
      savePrefs();
    });
    document.querySelectorAll('.pick').forEach(b => b.addEventListener('click', () => startPick(b.dataset.pick)));
    $('pick-cancel').addEventListener('click', endPick);

    $('route-tabs').addEventListener('click', e => {
      const t = e.target.closest('[data-tab]');
      if (t) select(+t.dataset.tab);
    });
    $('itinerary').addEventListener('click', e => {
      const a = e.target.closest('[data-focus]');
      if (!a) return;
      e.preventDefault();
      const m = state.stopMarkers[+a.dataset.focus];
      document.body.classList.add('show-map');
      $('toggle-panel').textContent = 'Ver formulario';
      setTimeout(() => { map.invalidateSize(); map.setView(m.getLatLng(), 15); m.openPopup(); }, 60);
    });

    $('show-all').addEventListener('change', async e => {
      if (e.target.checked) {
        layers.all.addTo(map);
        try { setStatus('Descargando cargadores…', 'busy'); await ensureChargers(); setStatus(''); drawAllChargers(); }
        catch (err) { setStatus(err.message, 'error'); }
      } else map.removeLayer(layers.all);
    });
    $('reload-chargers').addEventListener('click', async () => {
      try { setStatus('Actualizando cargadores…', 'busy'); await ensureChargers(true); setStatus('Datos de cargadores actualizados.'); }
      catch (err) { setStatus(err.message, 'error'); }
    });
    $('ocm-key').addEventListener('change', () => { state.chargers = null; });

    // Cargadores propios
    $('add-charger').addEventListener('click', () => startPick('charger'));
    $('cf-cancel').addEventListener('click', () => $('charger-dialog').close());
    $('charger-form').addEventListener('submit', () => {
      const kw = +$('cf-kw').value;
      const types = [...document.querySelectorAll('input[name=cf-conn]:checked')].map(i => i.value);
      if (!types.length || !state.pendingCharger) return;
      const list = customChargers();
      list.push({
        id: 'custom-' + Date.now(), source: 'Propio', name: $('cf-name').value.trim() || 'Cargador propio',
        operator: $('cf-op').value.trim(), lat: state.pendingCharger.lat, lon: state.pendingCharger.lon,
        connectors: types.map(t => ({ type: t, kw: Planner.isDC(t, kw) ? kw : Math.min(kw, t === 'domestic' ? 3.7 : 22), count: 1 })),
        access: '', price: '', hours: '', address: ''
      });
      Services.store('ev.custom', list);
      $('charger-form').reset();
      state.chargers = null;
      renderCustomList();
      setStatus('Cargador guardado. Vuelve a planear el viaje para tenerlo en cuenta.');
    });
    $('custom-list').addEventListener('click', e => {
      const b = e.target.closest('[data-del]');
      if (!b) return;
      Services.store('ev.custom', customChargers().filter(c => c.id !== b.dataset.del));
      state.chargers = null;
      renderCustomList();
    });

    // Guardar / cargar viajes
    $('save-trip').addEventListener('click', () => {
      if (!state.points) return;
      const r = state.results[state.selected];
      const trips = Services.load('ev.trips', []);
      trips.unshift({
        id: String(Date.now()),
        name: state.points.origin.name + ' → ' + state.points.dest.name,
        summary: r.feasible ? fmtMin(r.totals.min) + ', ' + r.stops.length + ' paradas' : 'sin plan',
        form: collectForm()
      });
      Services.store('ev.trips', trips.slice(0, 20));
      renderSaved();
      setStatus('Viaje guardado en este navegador.');
    });
    $('saved-list').addEventListener('click', e => {
      const d = e.target.closest('[data-trip-del]');
      const l = e.target.closest('[data-load]');
      const trips = Services.load('ev.trips', []);
      if (d) { Services.store('ev.trips', trips.filter(t => t.id !== d.dataset.tripDel)); renderSaved(); }
      if (l) {
        e.preventDefault();
        const t = trips.find(x => x.id === l.dataset.load);
        if (t) { applyForm(t.form); $('add-via').textContent = $('via-row').hidden ? '+ Agregar parada intermedia' : '− Quitar parada intermedia'; $('trip-form').requestSubmit(); }
      }
    });
    $('print-trip').addEventListener('click', () => window.print());

    $('toggle-panel').addEventListener('click', () => {
      const on = document.body.classList.toggle('show-map');
      $('toggle-panel').textContent = on ? 'Ver formulario' : 'Ver mapa';
      setTimeout(() => map.invalidateSize(), 50);
    });
  }

  init();
  if (new URLSearchParams(location.search).has('origen')) $('trip-form').requestSubmit();
})();
