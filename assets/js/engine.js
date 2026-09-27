/*
 * Mallorca in Linien — Geometrie-Engine
 * ---------------------------------------------------------------
 * Baut aus Netz (data.js) und Schema (layout.js) die Zeichnung:
 * gebündelte, parallel geführte Linien im 45°/90°-Raster, Halte als
 * Kapseln, Namen ohne Überschneidung.
 * Keine Abhängigkeiten. Liefert ein Modell; das Zeichnen übernimmt map.js.
 */
(function () {
  "use strict";

  // ── Vektorhilfen ──────────────────────────────────────────────
  const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
  const mul = (a, s) => [a[0] * s, a[1] * s];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1];
  const cross = (a, b) => a[0] * b[1] - a[1] * b[0];
  const len = (a) => Math.hypot(a[0], a[1]);
  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  const norm = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l]; };
  const leftN = (d) => [d[1], -d[0]]; // links der Fahrtrichtung (y nach unten)
  const same = (a, b, eps = 0.01) => Math.abs(a[0] - b[0]) < eps && Math.abs(a[1] - b[1]) < eps;

  // Winkel von Richtung ref zu v, positiv nach links
  function leftness(ref, v) {
    return Math.atan2(dot(v, leftN(ref)), dot(v, ref));
  }

  function lineIntersect(p1, d1, p2, d2) {
    const den = cross(d1, d2);
    if (Math.abs(den) < 1e-9) return null;
    const t = cross(sub(p2, p1), d2) / den;
    return add(p1, mul(d1, t));
  }

  // Oktilineare Verbindung mit höchstens zwei Knicken
  function octiRoute(a, b, mode) {
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const ax = Math.abs(dx), ay = Math.abs(dy);
    if (ax < 0.5 || ay < 0.5 || Math.abs(ax - ay) < 0.5) return [a, b];
    const sx = Math.sign(dx), sy = Math.sign(dy);
    const m = Math.min(ax, ay);
    const diag = [sx * m, sy * m];
    const rest = ax > ay ? [sx * (ax - ay), 0] : [0, sy * (ay - ax)];
    if (mode === "sd") { // gerade, dann diagonal
      const p = add(a, rest); return [a, p, b];
    }
    if (mode === "ds") { // diagonal, dann gerade
      const p = add(a, diag); return [a, p, b];
    }
    // Standard: Diagonale in der Mitte
    const h = mul(rest, 0.5);
    const p1 = add(a, h), p2 = add(p1, diag);
    return [a, p1, p2, b];
  }

  // ── Modell bauen ──────────────────────────────────────────────
  function build(NET, LAY, opt) {
    opt = Object.assign({
      spacing: 6.4,        // Abstand paralleler Linien (eine Einheit)
      width: 4.6,          // Linienbreite Bus
      radius: 22,          // Kurvenradius Mittellinie
      visible: null,       // Set sichtbarer Linien-IDs (null = alle)
      season: "all",
      unitOf: null,        // Breite eines Gleises in Einheiten (Bahn breiter)
      pad: null            // Rand der Haltekapsel über die Linie hinaus (Welt-Einheiten)
    }, opt || {});
    const unitOf = (slot) => (opt.unitOf ? opt.unitOf(slot) : 1);

    const stationById = new Map(NET.stations.map((s) => [s.id, s]));
    const nodePos = (id) => {
      const p = LAY.nodes[id];
      if (!p) throw new Error("Layout: Knoten fehlt: " + id);
      return p;
    };
    const isHub = (id) => !!(LAY.hubs && LAY.hubs[id]);
    const slotOf = (lineId) => (LAY.slots && LAY.slots[lineId]) || lineId;

    function routeBetween(a, b) {
      const R = LAY.routes || {};
      if (R[a + "|" + b]) return R[a + "|" + b].slice();
      if (R[b + "|" + a]) return R[b + "|" + a].slice().reverse();
      return [a, b];
    }

    const lines = NET.lines.filter((l) => !opt.visible || opt.visible.has(l.id));

    // Pfade in Knotenfolgen übersetzen (inkl. Wegpunkte und Durchfahrten)
    const edges = new Map();
    const edgeKey = (u, v) => (u < v ? u + "|" + v : v + "|" + u);

    function getEdge(u, v) {
      const key = edgeKey(u, v);
      let e = edges.get(key);
      if (!e) {
        const [a, b] = u < v ? [u, v] : [v, u];
        let pts;
        const spec = (LAY.edges || {})[a + "|" + b] || (LAY.edges || {})[b + "|" + a];
        if (spec && spec.via) {
          let via = spec.via.map((p) => p.slice());
          if ((LAY.edges || {})[b + "|" + a] && !(LAY.edges || {})[a + "|" + b]) via = via.reverse();
          pts = [nodePos(a)].concat(via, [nodePos(b)]);
          // Zwischenstücke oktilinear ergänzen
          const out = [pts[0]];
          for (let i = 1; i < pts.length; i++) {
            const seg = octiRoute(out[out.length - 1], pts[i], spec.mode);
            for (let k = 1; k < seg.length; k++) out.push(seg[k]);
          }
          pts = out;
        } else {
          let mode = spec && spec.mode;
          if (mode && (LAY.edges || {})[b + "|" + a] && !(LAY.edges || {})[a + "|" + b]) {
            mode = mode === "sd" ? "ds" : mode === "ds" ? "sd" : mode;
          }
          pts = octiRoute(nodePos(a), nodePos(b), mode);
        }
        e = { key, a, b, pts, slots: new Map(), order: [], C: 0, fixed: false };
        edges.set(key, e);
      }
      return e;
    }

    const linePaths = []; // { line, slot, nodes:[...], stops:Set, trav:[{e, fwd}] , pieceIndex }
    for (const line of lines) {
      const segSeason = line.seasonal || [];
      let pathList = line.paths;
      // Saisonabschnitte ausblenden
      if (opt.season !== "all" && segSeason.length) {
        pathList = [];
        for (const p of line.paths) {
          let cur = [p[0]];
          for (let i = 1; i < p.length; i++) {
            const a = p[i - 1], b = p[i];
            const s = segSeason.find((x) => (x.from === a && x.to === b) || (x.from === b && x.to === a));
            if (s && s.season !== opt.season) {
              if (cur.length > 1) pathList.push(cur);
              cur = [b];
            } else cur.push(b);
          }
          if (cur.length > 1) pathList.push(cur);
        }
      }
      pathList.forEach((stopsSeq, pi) => {
        const nodes = [stopsSeq[0]];
        for (let i = 1; i < stopsSeq.length; i++) {
          const r = routeBetween(stopsSeq[i - 1], stopsSeq[i]);
          for (let k = 1; k < r.length; k++) nodes.push(r[k]);
        }
        const trav = [];
        for (let i = 1; i < nodes.length; i++) {
          const e = getEdge(nodes[i - 1], nodes[i]);
          const fwd = nodes[i - 1] === e.a;
          trav.push({ e, fwd });
          const slot = slotOf(line.id);
          if (!e.slots.has(slot)) e.slots.set(slot, []);
          e.slots.get(slot).push({ lp: linePaths.length, idx: i - 1 });
        }
        linePaths.push({ line, slot: slotOf(line.id), nodes, stops: new Set(stopsSeq), stopSeq: stopsSeq, trav, piece: pi });
      });
    }

    // ── Reihenfolge im Bündel ───────────────────────────────────
    // Richtung eines Kantenstücks am Knoten x (von x weg)
    function dirFrom(e, x) {
      const pts = e.a === x ? e.pts : e.pts.slice().reverse();
      return norm(sub(pts[1], pts[0]));
    }
    function dirInto(e, x) { // Ankunftsrichtung bei x
      const pts = e.a === x ? e.pts.slice().reverse() : e.pts;
      const n = pts.length;
      return norm(sub(pts[n - 1], pts[n - 2]));
    }

    // Knotenfolge eines Linienpfads in Kanonrichtung der Kante e ausrichten
    function orientedSeq(lpi, e) {
      const lp = linePaths[lpi];
      const ref = e.slots.get(lp.slot).find((r) => r.lp === lpi);
      let idx = ref.idx;
      let nodes = lp.nodes;
      const fwd = lp.trav[idx].fwd;
      if (!fwd) {
        nodes = nodes.slice().reverse();
        idx = nodes.length - 2 - idx;
      }
      return { nodes, i: idx }; // Kante = nodes[i] -> nodes[i+1] = a -> b
    }

    function compareSlots(e, sa, sb) {
      const A = orientedSeq(e.slots.get(sa)[0].lp, e);
      const B = orientedSeq(e.slots.get(sb)[0].lp, e);
      // vorwärts
      let ia = A.i + 1, ib = B.i + 1;
      while (ia + 1 < A.nodes.length && ib + 1 < B.nodes.length && A.nodes[ia + 1] === B.nodes[ib + 1]) { ia++; ib++; }
      let fwdRes = 0;
      if (ia + 1 < A.nodes.length && ib + 1 < B.nodes.length) {
        const x = A.nodes[ia];
        const prev = A.nodes[ia - 1];
        const dIn = dirInto(edges.get(edgeKey(prev, x)), x);
        const oa = dirFrom(edges.get(edgeKey(x, A.nodes[ia + 1])), x);
        const ob = dirFrom(edges.get(edgeKey(x, B.nodes[ib + 1])), x);
        const la = leftness(dIn, oa), lb = leftness(dIn, ob);
        if (Math.abs(la - lb) > 1e-6) fwdRes = la > lb ? -1 : 1;
      }
      // rückwärts
      let ja = A.i, jb = B.i;
      while (ja - 1 >= 0 && jb - 1 >= 0 && A.nodes[ja - 1] === B.nodes[jb - 1]) { ja--; jb--; }
      let bwdRes = 0;
      if (ja - 1 >= 0 && jb - 1 >= 0) {
        const y = A.nodes[ja];
        const next = A.nodes[ja + 1];
        const dOut = dirFrom(edges.get(edgeKey(y, next)), y);
        const va = dirFrom(edges.get(edgeKey(y, A.nodes[ja - 1])), y);
        const vb = dirFrom(edges.get(edgeKey(y, B.nodes[jb - 1])), y);
        const back = mul(dOut, -1);
        // Winkel von "rückwärts" zu v, positiv zur linken Seite der Fahrtrichtung
        const la = Math.atan2(dot(va, leftN(dOut)), dot(va, back));
        const lb = Math.atan2(dot(vb, leftN(dOut)), dot(vb, back));
        if (Math.abs(la - lb) > 1e-6) bwdRes = la > lb ? -1 : 1;
      }
      if (fwdRes) return fwdRes;
      if (bwdRes) return bwdRes;
      // Kein Hinweis aus den Enden: feste Reihenfolge, bezogen auf die
      // Fahrtrichtung der vorrangigen Linie (so bleibt sie entlang des
      // gemeinsamen Weges auf derselben Seite).
      const ra = e.slots.get(sa)[0], rb = e.slots.get(sb)[0];
      const pa = NET.lines.indexOf(linePaths[ra.lp].line), pb = NET.lines.indexOf(linePaths[rb.lp].line);
      const refIsA = pa < pb || (pa === pb && sa < sb);
      const ref = refIsA ? ra : rb;
      const refFwd = linePaths[ref.lp].trav[ref.idx].fwd;
      // Vorrangige Linie liegt links (in ihrer Fahrtrichtung)
      let res = refIsA ? -1 : 1;
      if (!refFwd) res = -res;
      return res;
    }

    for (const e of edges.values()) {
      const arr = Array.from(e.slots.keys());
      // Einfügesortierung (Vergleich muss nicht transitiv sein)
      const out = [];
      for (const s of arr) {
        let k = out.length;
        while (k > 0 && compareSlots(e, s, out[k - 1]) < 0) k--;
        out.splice(k, 0, s);
      }
      // Manuelle Vorgaben
      const ov = LAY.order && (LAY.order[e.a + "|" + e.b] || (LAY.order[e.b + "|" + e.a] && LAY.order[e.b + "|" + e.a].slice().reverse()));
      if (ov) {
        const known = ov.filter((s) => out.includes(s));
        const rest = out.filter((s) => !known.includes(s));
        e.order = known.concat(rest);
      } else e.order = out;
      // Lage jedes Gleises in Einheiten (Mitte), Gesamtbreite
      e.pos = new Map();
      let acc = 0;
      for (const sl of e.order) { const u = unitOf(sl); e.pos.set(sl, acc + u / 2); acc += u; }
      e.total = acc;
      e.C = acc / 2;
    }

    // ── Versatz ausrichten (gerade Durchfahrten ohne Sprung) ────
    const incident = new Map();
    for (const e of edges.values()) {
      for (const x of [e.a, e.b]) {
        if (!incident.has(x)) incident.set(x, []);
        incident.get(x).push(e);
      }
    }
    const sp = opt.spacing;
    const offsetOf = (e, slot) => (e.C - e.pos.get(slot)) * sp; // positiv = links (Kanonrichtung)

    const queue = Array.from(edges.values()).sort((p, q) => q.order.length - p.order.length);
    for (const start of queue) {
      if (start.fixed) continue;
      start.fixed = true;
      const bfs = [start];
      while (bfs.length) {
        const e1 = bfs.shift();
        for (const x of [e1.a, e1.b]) {
          if (isHub(x)) continue;
          const dIn = dirInto(e1, x);
          for (const e2 of incident.get(x)) {
            if (e2 === e1 || e2.fixed) continue;
            const dOut = dirFrom(e2, x);
            if (dot(dIn, dOut) < 0.999) continue; // nur gerade Fortsetzung
            const common = e1.order.filter((s) => e2.order.includes(s));
            if (!common.length) continue;
            const t1 = e1.b === x ? 1 : -1; // Kanonrichtung zeigt auf x?
            const t2 = e2.a === x ? 1 : -1; // Kanonrichtung zeigt von x weg?
            let sum = 0;
            for (const s of common) {
              const i1 = e1.pos.get(s), i2 = e2.pos.get(s);
              // t2*(C2 - p2) = t1*(C1 - p1)
              sum += i2 + (t1 / t2) * (e1.C - i1);
            }
            let C2 = sum / common.length;
            // Nicht zu weit aus der Mitte schieben
            const n2 = e2.total;
            C2 = Math.max(-(n2 + 2), Math.min(2 * n2 + 2, C2));
            e2.C = C2;
            e2.fixed = true;
            bfs.push(e2);
          }
        }
      }
    }

    // ── Linienzüge ──────────────────────────────────────────────
    function offsetPolyline(pts, o) {
      // pts in Fahrtrichtung, o = Versatz nach links
      const segs = [];
      for (let i = 1; i < pts.length; i++) {
        const d = norm(sub(pts[i], pts[i - 1]));
        const n = leftN(d);
        segs.push({ p: add(pts[i - 1], mul(n, o)), q: add(pts[i], mul(n, o)), d, o });
      }
      return segs;
    }

    const lineGeo = []; // pro linePath: { pts:[[x,y,flags]], at: Map(node -> [x,y]) , offs:[] }
    for (let li = 0; li < linePaths.length; li++) {
      const lp = linePaths[li];
      let segs = []; // {p,q,d,o,nodeEnd?}
      const at = new Map();
      lp.trav.forEach((t, k) => {
        const e = t.e;
        const pts = t.fwd ? e.pts : e.pts.slice().reverse();
        const oCanon = offsetOf(e, lp.slot);
        const o = t.fwd ? oCanon : -oCanon;
        const s = offsetPolyline(pts, o);
        s[s.length - 1].endNode = lp.nodes[k + 1];
        if (k === 0) s[0].startNode = lp.nodes[0];
        segs = segs.concat(s);
      });
      // Verbinden
      const out = []; // Punkte
      const push = (p, flag, o, stop) => {
        const last = out[out.length - 1];
        if (last && same(last, p, 0.05)) { if (flag) last[2] = flag; if (stop) last[4] = 1; return; }
        out.push([p[0], p[1], flag || 0, o || 0, stop ? 1 : 0]);
      };
      push(segs[0].p, 0, segs[0].o);
      if (segs[0].startNode) at.set(segs[0].startNode, segs[0].p);
      for (let i = 0; i < segs.length - 1; i++) {
        const s1 = segs[i], s2 = segs[i + 1];
        const node = s1.endNode;
        const c = cross(s1.d, s2.d), dd = dot(s1.d, s2.d);
        if (Math.abs(c) < 1e-6 && dd > 0) {
          // gerade weiter
          const lateral = dot(sub(s2.p, s1.q), leftN(s1.d));
          if (Math.abs(lateral) < 0.3) {
            push(s1.q, 0, s1.o);
            if (node) at.set(node, s1.q);
          } else {
            // 45°-Versatz, mittig um den Knoten
            const j = Math.abs(lateral) / 2;
            const lenA = dist(s1.p, s1.q), lenB = dist(s2.p, s2.q);
            const jj = Math.min(j, lenA * 0.45, lenB * 0.45);
            const pA = sub(s1.q, mul(s1.d, jj));
            const pB = add(s2.p, mul(s2.d, jj));
            push(pA, 2, s1.o); push(pB, 2, s2.o);
            if (node) at.set(node, mul(add(pA, pB), 0.5));
          }
        } else if (Math.abs(c) < 1e-6 && dd < 0) {
          push(s1.q, 0, s1.o); push(s2.p, 0, s2.o);
          if (node) at.set(node, s1.q);
        } else {
          const I = lineIntersect(s1.p, s1.d, s2.p, s2.d);
          push(I, 0, (s1.o + s2.o) / 2, node && lp.stops.has(node));
          if (node) at.set(node, I);
        }
      }
      const lastSeg = segs[segs.length - 1];
      push(lastSeg.q, 0, lastSeg.o);
      if (lastSeg.endNode) at.set(lastSeg.endNode, lastSeg.q);

      lineGeo.push({ pts: out, at });
    }

    // ── Knoten (Hubs): kürzen bzw. Bogen ────────────────────────
    function trimToCircle(pts, center, r, fromStart) {
      // entfernt Punkte innerhalb des Kreises am Anfang/Ende
      const P = fromStart ? pts : pts.slice().reverse();
      let k = 0;
      while (k < P.length - 1 && dist(P[k + 1], center) < r) k++;
      const a = P[k], b = P[k + 1];
      if (!b) return pts;
      // Schnittpunkt Segment a-b mit Kreis
      const d = sub(b, a); const f = sub(a, center);
      const A = dot(d, d), B = 2 * dot(f, d), Cc = dot(f, f) - r * r;
      const disc = B * B - 4 * A * Cc;
      let t = 0;
      if (disc >= 0) {
        const s = Math.sqrt(disc);
        const t1 = (-B - s) / (2 * A), t2 = (-B + s) / (2 * A);
        t = [t1, t2].filter((x) => x >= 0 && x <= 1).sort((x, y) => y - x)[0];
        if (t === undefined) t = 0;
      }
      const p = add(a, mul(d, t));
      const rest = [[p[0], p[1], 0]].concat(P.slice(k + 1));
      return fromStart ? rest : rest.reverse();
    }

    // Knoten (Hubs): Linien laufen bis in die Mitte; die deckende
    // Scheibe des Knotens liegt darüber (keine Bögen, keine Stummel).

    // ── SVG-Pfad mit runden Ecken ───────────────────────────────
    function pathD(pts, baseR) {
      if (pts.length < 2) return "";
      let d = "M" + f(pts[0][0]) + " " + f(pts[0][1]);
      for (let i = 1; i < pts.length - 1; i++) {
        const p0 = pts[i - 1], p = pts[i], p1 = pts[i + 1];
        if (p[2] === 1) { d += "L" + f(p[0]) + " " + f(p[1]); continue; }
        const d1 = norm(sub(p, p0)), d2 = norm(sub(p1, p));
        const c = cross(d1, d2);
        if (Math.abs(c) < 1e-6) { d += "L" + f(p[0]) + " " + f(p[1]); continue; }
        const theta = Math.acos(Math.max(-1, Math.min(1, dot(d1, d2))));
        const l1 = dist(p0, p), l2 = dist(p, p1);
        const maxT = Math.min(l1 * (p0[2] === 2 || i === 1 ? 0.95 : 0.5), l2 * (p1[2] === 2 || i === pts.length - 2 ? 0.95 : 0.5));
        const sc = opt.spacing / 6.4;
        let r = Math.max(3 * sc, baseR + Math.sign(c) * (p[3] || 0));
        // Knick an einem Halt: Linie muss durch die Haltemarke laufen
        if (p[4]) {
          const dev = 1 / Math.cos(theta / 2) - 1;
          if (dev > 1e-6) r = Math.min(r, Math.max(1.2 * sc, 2.2 * sc / dev));
        }
        let t = r * Math.tan(theta / 2);
        if (t > maxT) { t = maxT; r = t / Math.tan(theta / 2); }
        if (p[2] === 2) { t = Math.min(t, 3 * sc); r = t / Math.tan(theta / 2); }
        const a = sub(p, mul(d1, t)), b = add(p, mul(d2, t));
        d += "L" + f(a[0]) + " " + f(a[1]) + "A" + f(r) + " " + f(r) + " 0 0 " + (c > 0 ? 1 : 0) + " " + f(b[0]) + " " + f(b[1]);
      }
      const q = pts[pts.length - 1];
      d += "L" + f(q[0]) + " " + f(q[1]);
      return d;
    }
    function f(x) { return Math.round(x * 10) / 10; }

    // Radius pro Linie: konzentrisch zur Bündelmitte
    for (let li = 0; li < linePaths.length; li++) {
      lineGeo[li].d = pathD(lineGeo[li].pts, opt.radius);
    }

    // ── Halte ───────────────────────────────────────────────────
    const stationGeo = new Map();
    const widthOf = (slot) => opt.width * (unitOf(slot) > 1 ? unitOf(slot) * 0.82 : 1);
    const pad = opt.pad != null ? opt.pad : 2.6 * (opt.spacing / 6.4);
    const pillR = opt.width / 2 + pad;
    for (const s of NET.stations) {
      if (isHub(s.id)) {
        stationGeo.set(s.id, { id: s.id, hub: true, c: nodePos(s.id), r: LAY.hubs[s.id].r, lines: new Set(), pass: new Set(), passPts: [] });
        continue;
      }
      stationGeo.set(s.id, { id: s.id, pts: [], lines: new Set(), pass: new Set(), passPts: [] });
    }
    linePaths.forEach((lp, li) => {
      const g = lineGeo[li];
      for (const n of lp.nodes) {
        const sg = stationGeo.get(n);
        if (!sg) continue;
        if (lp.stops.has(n)) {
          sg.lines.add(lp.line.id);
          if (!sg.hub) {
            const p = g.at.get(n);
            if (p && !sg.pts.some((q) => same(q, p, 0.6))) sg.pts.push(p);
          }
        } else {
          sg.pass.add(lp.line.id);
          const p = g.at.get(n); if (p) sg.passPts.push({ line: lp.line.id, li, p });
        }
      }
    });
    for (const sg of stationGeo.values()) {
      if (sg.hub) {
        sg.box = [sg.c[0] - sg.r, sg.c[1] - sg.r, sg.c[0] + sg.r, sg.c[1] + sg.r];
        sg.bridges = sg.passPts.filter((pp) => !sg.lines.has(pp.line)); // Durchfahrt durch den Knoten
        continue;
      }
      if (!sg.pts.length) { sg.unused = true; continue; }
      let A = sg.pts[0], B = sg.pts[0], best = 0;
      for (let i = 0; i < sg.pts.length; i++) for (let j = i + 1; j < sg.pts.length; j++) {
        const dd = dist(sg.pts[i], sg.pts[j]);
        if (dd > best) { best = dd; A = sg.pts[i]; B = sg.pts[j]; }
      }
      let wmax = 0;
      for (const id of sg.lines) { const ln = NET.lines.find((l) => l.id === id); if (ln) wmax = Math.max(wmax, widthOf(slotOf(id))); }
      const rr = Math.max(pillR, wmax / 2 + pad);
      sg.A = A; sg.B = B; sg.r = rr;
      sg.c = mul(add(A, B), 0.5);
      // Liegen die Punkte nicht auf einer Geraden: Rechteck statt Kapsel
      const ab = sub(B, A), L2 = dot(ab, ab);
      let off = 0;
      for (const q of sg.pts) {
        const t = L2 ? Math.max(0, Math.min(1, dot(sub(q, A), ab) / L2)) : 0;
        off = Math.max(off, dist(q, add(A, mul(ab, t))));
      }
      sg.rect = off > 1.5 * (opt.spacing / 6.4);
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const q of sg.pts) { x0 = Math.min(x0, q[0]); y0 = Math.min(y0, q[1]); x1 = Math.max(x1, q[0]); y1 = Math.max(y1, q[1]); }
      sg.bb = [x0 - rr, y0 - rr, x1 + rr, y1 + rr];
      sg.box = sg.bb.slice();
      // Durchfahrten, die die Kapsel schneiden → Brücke
      sg.bridges = [];
      for (const pp of sg.passPts) {
        if (sg.lines.has(pp.line)) continue; // hält die Linie hier auf einem anderen Ast, keine Brücke
        const ab = sub(B, A), L2 = dot(ab, ab);
        const t = L2 ? Math.max(0, Math.min(1, dot(sub(pp.p, A), ab) / L2)) : 0;
        const q = add(A, mul(ab, t));
        const inside = sg.rect
          ? (pp.p[0] > sg.bb[0] - opt.width * 0.5 && pp.p[0] < sg.bb[2] + opt.width * 0.5 && pp.p[1] > sg.bb[1] - opt.width * 0.5 && pp.p[1] < sg.bb[3] + opt.width * 0.5)
          : dist(q, pp.p) < rr + opt.width * 0.5 + 0.5 * (opt.spacing / 6.4);
        if (inside) sg.bridges.push(pp);
      }
    }

    // Grenzen
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const g of lineGeo) for (const p of g.pts) {
      minX = Math.min(minX, p[0]); minY = Math.min(minY, p[1]);
      maxX = Math.max(maxX, p[0]); maxY = Math.max(maxY, p[1]);
    }

    return {
      opt, linePaths, lineGeo, stationGeo, edges,
      bounds: [minX, minY, maxX, maxY],
      stationById, pathD, trimToCircle
    };
  }

  window.NetzEngine = { build, octiRoute };
})();
