/*
 * Motor de planificación de viaje para vehículos eléctricos.
 * Es código puro (sin DOM) para poder probarlo también con Node.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Planner = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const DC_TYPES = new Set(['ccs1', 'ccs2', 'chademo', 'gbt_dc']);
  const AC_TYPES = new Set(['type1', 'type2', 'gbt_ac', 'domestic']);

  const CONNECTORS = {
    type1:    { label: 'Tipo 1 (J1772)',      current: 'AC' },
    type2:    { label: 'Tipo 2 (Mennekes)',   current: 'AC' },
    gbt_ac:   { label: 'GB/T AC',             current: 'AC' },
    domestic: { label: 'Toma doméstica',      current: 'AC' },
    ccs1:     { label: 'CCS1',                current: 'DC' },
    ccs2:     { label: 'CCS2',                current: 'DC' },
    chademo:  { label: 'CHAdeMO',             current: 'DC' },
    gbt_dc:   { label: 'GB/T DC',             current: 'DC' },
    nacs:     { label: 'NACS (Tesla)',        current: 'DC' },
    unknown:  { label: 'Sin datos',           current: '?' }
  };

  // ---------- Geometría ----------
  const RAD = Math.PI / 180;
  function haversineKm(lat1, lon1, lat2, lon2) {
    const dLat = (lat2 - lat1) * RAD;
    const dLon = (lon2 - lon1) * RAD;
    const a = Math.sin(dLat / 2) ** 2 +
      Math.cos(lat1 * RAD) * Math.cos(lat2 * RAD) * Math.sin(dLon / 2) ** 2;
    return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  /**
   * Construye un índice simplificado de la ruta: puntos cada ~250 m con
   * kilómetro y minuto acumulado.
   * coords: [[lon, lat], ...] (GeoJSON, como lo entrega OSRM)
   * segDurations: duración en segundos de cada segmento (opcional)
   */
  function buildRouteIndex(coords, totalDurationSec, segDurations) {
    const n = coords.length;
    const useSeg = Array.isArray(segDurations) && segDurations.length === n - 1;
    const segKm = new Array(n - 1);
    let totalKm = 0;
    for (let i = 0; i < n - 1; i++) {
      segKm[i] = haversineKm(coords[i][1], coords[i][0], coords[i + 1][1], coords[i + 1][0]);
      totalKm += segKm[i];
    }
    const lat = [coords[0][1]], lon = [coords[0][0]], km = [0], min = [0];
    let accKm = 0, accMin = 0, lastKeptKm = 0;
    for (let i = 0; i < n - 1; i++) {
      accKm += segKm[i];
      accMin += useSeg ? segDurations[i] / 60
        : (totalKm > 0 ? segKm[i] / totalKm * totalDurationSec / 60 : 0);
      if (accKm - lastKeptKm >= 0.25 || i === n - 2) {
        lat.push(coords[i + 1][1]); lon.push(coords[i + 1][0]);
        km.push(accKm); min.push(accMin);
        lastKeptKm = accKm;
      }
    }
    // Ajusta el tiempo al total que reporta el enrutador
    const scale = accMin > 0 ? (totalDurationSec / 60) / accMin : 1;
    for (let i = 0; i < min.length; i++) min[i] *= scale;
    let minLat = Infinity, maxLat = -Infinity, minLon = Infinity, maxLon = -Infinity;
    for (let i = 0; i < lat.length; i++) {
      if (lat[i] < minLat) minLat = lat[i];
      if (lat[i] > maxLat) maxLat = lat[i];
      if (lon[i] < minLon) minLon = lon[i];
      if (lon[i] > maxLon) maxLon = lon[i];
    }
    return { lat, lon, km, min, totalKm: km[km.length - 1], totalMin: min[min.length - 1],
      bbox: [minLat, minLon, maxLat, maxLon] };
  }

  /** Proyecta un punto sobre la ruta: distancia a la vía y km recorrido. */
  function projectOnRoute(pLat, pLon, idx) {
    const cosLat = Math.cos(pLat * RAD);
    const n = idx.lat.length;
    let best = -1, bestD = Infinity;
    for (let i = 0; i < n; i++) {
      const dy = idx.lat[i] - pLat, dx = (idx.lon[i] - pLon) * cosLat;
      const d = dx * dx + dy * dy;
      if (d < bestD) { bestD = d; best = i; }
    }
    // Refina sobre los segmentos vecinos
    let res = { offKm: haversineKm(pLat, pLon, idx.lat[best], idx.lon[best]),
      km: idx.km[best], min: idx.min[best], i: best };
    for (const j of [best - 1, best]) {
      if (j < 0 || j + 1 >= n) continue;
      const ax = idx.lon[j] * cosLat, ay = idx.lat[j];
      const bx = idx.lon[j + 1] * cosLat, by = idx.lat[j + 1];
      const px = pLon * cosLat, py = pLat;
      const vx = bx - ax, vy = by - ay;
      const len2 = vx * vx + vy * vy;
      if (len2 === 0) continue;
      const t = Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / len2));
      const qLat = ay + vy * t, qLon = (ax + vx * t) / cosLat;
      const off = haversineKm(pLat, pLon, qLat, qLon);
      if (off < res.offKm) {
        res = { offKm: off,
          km: idx.km[j] + (idx.km[j + 1] - idx.km[j]) * t,
          min: idx.min[j] + (idx.min[j + 1] - idx.min[j]) * t, i: j };
      }
    }
    return res;
  }

  // ---------- Compatibilidad y carga ----------
  function isDC(type, kw) {
    if (type === 'nacs') return kw > 22;
    return DC_TYPES.has(type);
  }

  /**
   * Elige el mejor conector compatible de un cargador para un vehículo.
   * Devuelve null si no hay ninguno compatible.
   */
  function bestConnector(charger, car, opts) {
    let best = null;
    const accepted = new Set(car.connectors);
    for (const c of charger.connectors) {
      if (c.type === 'unknown') continue;
      if (!accepted.has(c.type)) continue;
      const dc = isDC(c.type, c.kw);
      if (!dc && opts.includeAC === false) continue;
      const eff = Math.min(c.kw, dc ? car.dcKw : car.acKw);
      if (eff <= 0) continue;
      if (!best || eff > best.effKw) best = { type: c.type, kw: c.kw, dc, effKw: eff, kwAssumed: !!c.kwAssumed, assumed: !!c.typeAssumed };
    }
    if (!best && opts.includeUnknown && charger.connectors.every(c => c.type === 'unknown')) {
      // Sin datos de conector: suposición conservadora (AC 7 kW)
      if (opts.includeAC !== false) {
        best = { type: 'unknown', kw: 7, dc: false, effKw: Math.min(7, car.acKw || 7), kwAssumed: true, assumed: true };
      }
    }
    return best;
  }

  /**
   * Minutos acumulados para cargar desde 0 % hasta s % (s = 0..100),
   * con curva de carga simplificada: DC baja potencia por encima de 80 %.
   */
  function chargeCurve(car, conn) {
    const cum = new Float64Array(101);
    const eff = conn.dc ? 0.93 : 0.90;
    for (let s = 0; s < 100; s++) {
      let p = conn.effKw;
      if (conn.dc) {
        if (s < 10) p *= 0.85;
        else if (s >= 80) p *= Math.max(0.18, 1 - (s - 80) * 0.04);
        else if (s >= 60) p *= 1 - (s - 60) * 0.008;
      } else if (s >= 95) {
        p *= 0.6;
      }
      const kwh = car.battery / 100 / eff;
      cum[s + 1] = cum[s] + kwh / p * 60;
    }
    return cum;
  }

  function curveAt(cum, s) {
    if (s <= 0) return 0;
    if (s >= 100) return cum[100];
    const f = Math.floor(s);
    return cum[f] + (cum[f + 1] - cum[f]) * (s - f);
  }

  function chargeMinutes(cum, from, to) {
    return to <= from ? 0 : curveAt(cum, to) - curveAt(cum, from);
  }

  // ---------- Cola de prioridad ----------
  class Heap {
    constructor() { this.a = []; }
    get size() { return this.a.length; }
    push(x) {
      const a = this.a; a.push(x);
      let i = a.length - 1;
      while (i > 0) {
        const p = (i - 1) >> 1;
        if (a[p].time <= a[i].time) break;
        [a[p], a[i]] = [a[i], a[p]]; i = p;
      }
    }
    pop() {
      const a = this.a, top = a[0], last = a.pop();
      if (a.length) {
        a[0] = last;
        let i = 0;
        for (;;) {
          const l = 2 * i + 1, r = l + 1;
          let m = i;
          if (l < a.length && a[l].time < a[m].time) m = l;
          if (r < a.length && a[r].time < a[m].time) m = r;
          if (m === i) break;
          [a[m], a[i]] = [a[i], a[m]]; i = m;
        }
      }
      return top;
    }
  }

  const DEFAULTS = {
    startSoc: 100,
    minStopSoc: 10,
    minArriveSoc: 15,
    maxChargeSoc: 80,
    consumptionFactor: 1.15,
    maxDetourKm: 5,
    minPowerKw: 0,
    includeAC: true,
    includeUnknown: false,
    stopOverheadMin: 5,
    timeFactor: 1.1,
    detourSpeedKmh: 30,
    priceDC: 1800,
    priceAC: 1000
  };

  /**
   * Calcula el plan de paradas óptimo (menor tiempo total) para una ruta.
   * route: { index } construido con buildRouteIndex
   * chargers: [{ id, name, lat, lon, connectors: [{type, kw}] , ... }]
   * car: { battery, consumption, acKw, dcKw, connectors: [...] }
   */
  function plan(routeIndex, chargers, car, userOpts) {
    const opts = Object.assign({}, DEFAULTS, userOpts || {});
    const idx = routeIndex;
    const kwhPerKm = car.consumption / 100 * opts.consumptionFactor;
    const pctPerKm = kwhPerKm / car.battery * 100;

    // Candidatos cerca de la ruta
    const pad = opts.maxDetourKm / 111 + 0.05;
    const [la0, lo0, la1, lo1] = idx.bbox;
    const nearby = [];
    for (const ch of chargers) {
      if (ch.lat < la0 - pad || ch.lat > la1 + pad || ch.lon < lo0 - pad || ch.lon > lo1 + pad) continue;
      const pr = projectOnRoute(ch.lat, ch.lon, idx);
      if (pr.offKm > Math.max(opts.maxDetourKm, 15)) continue;
      const conn = bestConnector(ch, car, opts);
      nearby.push({ charger: ch, proj: pr, conn });
    }

    const candidates = nearby.filter(x => x.conn && x.proj.offKm <= opts.maxDetourKm &&
      x.conn.effKw >= opts.minPowerKw);

    const nodes = [{ kind: 'start', km: 0, min: 0, detKm: 0, detMin: 0 }];
    candidates.sort((a, b) => a.proj.km - b.proj.km);
    for (const c of candidates) {
      const detKm = 2 * c.proj.offKm * 1.3;
      nodes.push({
        kind: 'charger', km: c.proj.km, min: c.proj.min * opts.timeFactor,
        detKm, detMin: detKm / opts.detourSpeedKmh * 60,
        charger: c.charger, conn: c.conn, offKm: c.proj.offKm,
        curve: chargeCurve(car, c.conn)
      });
    }
    nodes.push({ kind: 'end', km: idx.totalKm, min: idx.totalMin * opts.timeFactor, detKm: 0, detMin: 0 });
    const N = nodes.length, END = N - 1;

    function leg(i, j) {
      const a = nodes[i], b = nodes[j];
      return {
        km: (b.km - a.km) + (a.detKm + b.detKm) / 2,
        min: (b.min - a.min) + (a.detMin + b.detMin) / 2
      };
    }

    // Búsqueda de etiquetas (tiempo, % batería) con dominancia de Pareto
    const settled = Array.from({ length: N }, () => []);
    const heap = new Heap();
    heap.push({ node: 0, soc: opts.startSoc, time: 0, parent: null, dep: opts.startSoc, chargeMin: 0 });
    let goal = null, pops = 0, furthest = { node: 0, soc: opts.startSoc };
    const EPS = 1e-6;

    while (heap.size && pops < 400000) {
      const L = heap.pop(); pops++;
      if (L.node === END) { goal = L; break; }
      const st = settled[L.node];
      let dominated = false;
      for (const s of st) if (s.time <= L.time + EPS && s.soc >= L.soc - EPS) { dominated = true; break; }
      if (dominated) continue;
      st.push(L);
      if (nodes[L.node].km > nodes[furthest.node].km) furthest = L;

      const i = L.node, ni = nodes[i];
      const isStart = ni.kind === 'start';
      let cmMax = 0;
      if (!isStart) cmMax = chargeMinutes(ni.curve, L.soc, opts.maxChargeSoc);
      const maxDep = isStart ? L.soc : Math.max(L.soc, opts.maxChargeSoc);

      for (let j = i + 1; j < N; j++) {
        // Los nodos están ordenados por km: si ya no alcanza ni con la carga máxima, no hay más
        if ((nodes[j].km - ni.km) * pctPerKm > maxDep) break;
        const lg = leg(i, j);
        const use = lg.km * pctPerKm;
        const reserve = j === END ? opts.minArriveSoc : opts.minStopSoc;
        const need = use + reserve;
        if (isStart) {
          if (L.soc + EPS >= need) {
            heap.push({ node: j, soc: L.soc - use, time: L.time + lg.min, parent: L, dep: L.soc, chargeMin: 0, leg: lg });
          }
          continue;
        }
        // Opción 1: cargar justo lo necesario para llegar al siguiente punto
        if (need > L.soc + 0.5 && need <= opts.maxChargeSoc + EPS) {
          const dep = Math.min(opts.maxChargeSoc, Math.ceil(need));
          const cm = chargeMinutes(ni.curve, L.soc, dep);
          heap.push({ node: j, soc: dep - use, time: L.time + opts.stopOverheadMin + cm + lg.min,
            parent: L, dep, chargeMin: cm, leg: lg });
        }
        // Opción 2: cargar hasta el máximo configurado
        if (opts.maxChargeSoc > L.soc + 0.5 && opts.maxChargeSoc + EPS >= need) {
          heap.push({ node: j, soc: opts.maxChargeSoc - use, time: L.time + opts.stopOverheadMin + cmMax + lg.min,
            parent: L, dep: opts.maxChargeSoc, chargeMin: cmMax, leg: lg });
        }
      }
    }

    const result = {
      feasible: !!goal,
      opts, car,
      totalKm: idx.totalKm,
      pctPerKm, kwhPerKm,
      nearby,               // cargadores cercanos (compatibles o no) para el mapa
      candidateCount: candidates.length,
      stops: [], legs: [], profile: []
    };

    if (!goal) {
      // Diagnóstico: hasta dónde se llega y cuál es el siguiente cargador
      const f = nodes[furthest.node];
      const reachKm = f.km + Math.max(0, ((f.kind === 'start' ? furthest.soc : opts.maxChargeSoc) - opts.minStopSoc)) / pctPerKm;
      const nextNode = nodes.slice(furthest.node + 1).find(n => n.kind === 'charger' && n.km > reachKm);
      result.failure = {
        lastKm: f.km,
        lastName: f.kind === 'start' ? 'el origen' : (f.charger.name || 'cargador'),
        reachKm: Math.min(reachKm, idx.totalKm),
        nextKm: nextNode ? nextNode.km : null,
        nextName: nextNode ? (nextNode.charger.name || 'cargador') : null,
        gapKm: (nextNode ? nextNode.km : idx.totalKm) - f.km
      };
      return result;
    }

    // Reconstruye la ruta de etiquetas
    const chain = [];
    for (let L = goal; L; L = L.parent) chain.unshift(L);
    result.profile.push({ km: 0, soc: chain[0].soc });
    let totalCharge = 0, totalDrive = 0, totalKwh = 0, totalCost = 0, totalStopOverhead = 0;
    for (let k = 1; k < chain.length; k++) {
      const prev = chain[k - 1], cur = chain[k];
      const from = nodes[prev.node], to = nodes[cur.node];
      if (from.kind === 'charger') {
        const kwhBatt = (cur.dep - prev.soc) / 100 * car.battery;
        const kwhGrid = kwhBatt / (from.conn.dc ? 0.93 : 0.90);
        const price = from.conn.dc ? opts.priceDC : opts.priceAC;
        const stop = {
          charger: from.charger, conn: from.conn, km: from.km, offKm: from.offKm, detKm: from.detKm,
          arriveSoc: prev.soc, departSoc: cur.dep, chargeMin: cur.chargeMin,
          overheadMin: opts.stopOverheadMin, kwh: kwhGrid, cost: kwhGrid * price,
          arriveAtMin: prev.time, departAtMin: prev.time + opts.stopOverheadMin + cur.chargeMin
        };
        result.stops.push(stop);
        totalCharge += cur.chargeMin; totalStopOverhead += opts.stopOverheadMin;
        totalKwh += kwhGrid; totalCost += stop.cost;
        result.profile.push({ km: from.km, soc: cur.dep });
      }
      result.legs.push({ fromKm: from.km, toKm: to.km, km: cur.leg.km, min: cur.leg.min,
        departSoc: cur.dep, arriveSoc: cur.soc, energyKwh: cur.leg.km * kwhPerKm });
      totalDrive += cur.leg.min;
      result.profile.push({ km: to.km, soc: cur.soc });
    }
    result.arriveSoc = goal.soc;
    result.totals = {
      min: goal.time, driveMin: totalDrive, chargeMin: totalCharge, overheadMin: totalStopOverhead,
      kwhCharged: totalKwh, cost: totalCost,
      km: result.legs.reduce((s, l) => s + l.km, 0),
      energyUsed: result.legs.reduce((s, l) => s + l.energyKwh, 0)
    };
    return result;
  }

  return { plan, buildRouteIndex, projectOnRoute, haversineKm, bestConnector, chargeCurve,
    chargeMinutes, isDC, CONNECTORS, DEFAULTS };
});
