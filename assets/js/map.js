/*
 * Mallorca in Linien — Zeichnung, Beschriftung, Kamera
 * ---------------------------------------------------------------
 * Zeichnet das Modell der Engine als SVG. Die Karte hat Zoomstufen:
 * je Stufe werden Linienstärken, Schriftgrößen und die Auswahl der
 * Namen neu berechnet, damit alles in Bildschirmpunkten gleich groß
 * und lesbar bleibt. Zwischen zwei Stufen wird weich überblendet.
 */
(function () {
  "use strict";

  const SVGNS = "http://www.w3.org/2000/svg";
  const el = (tag, attrs, parent) => {
    const n = document.createElementNS(SVGNS, tag);
    if (attrs) for (const k in attrs) if (attrs[k] !== undefined && attrs[k] !== null) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  };
  const reduceMotion = () => window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const f1 = (x) => Math.round(x * 10) / 10;

  // ── Farbe ─────────────────────────────────────────────────────
  function hexToRgb(h) {
    h = h.replace("#", "");
    return [parseInt(h.slice(0, 2), 16) / 255, parseInt(h.slice(2, 4), 16) / 255, parseInt(h.slice(4, 6), 16) / 255];
  }
  const toLin = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  const toSrgb = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);
  function rgbToOklab(rgb) {
    const [r, g, b] = rgb.map(toLin);
    const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
    const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
    const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
    return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
      1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
      0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
  }
  function oklabToRgb(lab) {
    const [L, a, b] = lab;
    const l = Math.pow(L + 0.3963377774 * a + 0.2158037573 * b, 3);
    const m = Math.pow(L - 0.1055613458 * a - 0.0638541728 * b, 3);
    const s = Math.pow(L - 0.0894841775 * a - 1.291485548 * b, 3);
    const r = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
    const g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
    const bb = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s;
    return [r, g, bb].map((c) => Math.min(1, Math.max(0, toSrgb(c))));
  }
  const rgbToHex = (rgb) => "#" + rgb.map((c) => Math.round(c * 255).toString(16).padStart(2, "0")).join("");
  function relLum(hex) {
    const [r, g, b] = hexToRgb(hex).map(toLin);
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }
  function contrast(h1, h2) {
    const a = relLum(h1), b = relLum(h2);
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  }
  // Dunkel: jede Farbe gleich viel heller, so bleiben die Abstufungen einer
  // Farbfamilie erhalten. Buntheit sinkt, bis die Farbe darstellbar ist.
  const inGamut = (lab) => {
    const [L, a, b] = lab;
    const l = Math.pow(L + 0.3963377774 * a + 0.2158037573 * b, 3);
    const m = Math.pow(L - 0.1055613458 * a - 0.0638541728 * b, 3);
    const s = Math.pow(L - 0.0894841775 * a - 1.291485548 * b, 3);
    return [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
      -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
      -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s].every((c) => c >= -0.0005 && c <= 1.0005);
  };
  const themeCache = new Map();
  function themedColor(hex, dark) {
    if (!dark) return hex;
    if (themeCache.has(hex)) return themeCache.get(hex);
    const lab = rgbToOklab(hexToRgb(hex));
    let out = hex;
    if (lab[0] < 0.72) {
      const L = Math.min(0.86, lab[0] + 0.2), h = Math.atan2(lab[2], lab[1]);
      let C = Math.hypot(lab[1], lab[2]) * 0.95;
      while (C > 0.01 && !inGamut([L, C * Math.cos(h), C * Math.sin(h)])) C *= 0.97;
      out = rgbToHex(oklabToRgb([L, C * Math.cos(h), C * Math.sin(h)]));
    }
    themeCache.set(hex, out);
    return out;
  }
  // Liniennummer-Schild: im Hellen immer weiße Schrift mit mindestens 4,6:1
  const plateCache = new Map();
  function plateColor(hex, dark) {
    const key = hex + (dark ? "d" : "l");
    if (plateCache.has(key)) return plateCache.get(key);
    let out = themedColor(hex, dark);
    if (!dark && contrast(out, "#FFFFFF") < 4.6) {
      const lab = rgbToOklab(hexToRgb(out));
      let L = lab[0];
      for (let i = 0; i < 40 && contrast(out, "#FFFFFF") < 4.6; i++) { L -= 0.01; out = rgbToHex(oklabToRgb([L, lab[1], lab[2]])); }
    }
    plateCache.set(key, out);
    return out;
  }
  function onColor(hex) {
    return contrast(hex, "#FFFFFF") >= contrast(hex, "#15171A") ? "#FFFFFF" : "#15171A";
  }

  // ── Zoomstufen ────────────────────────────────────────────────
  const STEP = 1.6;          // Faktor zwischen zwei Stufen
  // Schriftgrößen in Bildschirm-Pixeln je Zoomstufe (fern / mittel / nah)
  const TYPE = {
    r1: [16, 18, 20], r2: [13, 14, 16], r3: [11.5, 12.5, 14],
    hub: [18, 20, 22], small: [11, 11.5, 12], trip: [12, 13, 14], sub: [11, 11.5, 12],
    plate: [[15, 10.5], [17, 12], [18, 12.5]]   // Schild: Höhe, Ziffern
  };
  const RAIL_UNITS = 1.5;    // Bahn belegt 1,5 Spuren im Bündel
  // zweizeilige Namen: nie nach Artikel oder Präposition umbrechen (katalanisch)
  const NO_BREAK_AFTER = /^(es|sa|s’|s'|ses|so|na|en|el|la|les|l’|l'|de|d’|d'|des|del|dels|i)$/i;

  class NetzMap {
    constructor(host, NET, LAY, options) {
      this.host = host;
      this.NET = NET;
      this.LAY = LAY;
      this.o = Object.assign({ onSelectLine() {}, onSelectStation() {}, onHoverLine() {}, onBackground() {} }, options || {});
      this.lineById = new Map(NET.lines.map((l) => [l.id, l]));
      this.stationById = new Map(NET.stations.map((s) => [s.id, s]));
      this.colorOf = (id) => (LAY.colors && LAY.colors[id]) || this.lineById.get(id).color;
      this.k = 1; this.tx = 0; this.ty = 0;
      this.filter = { visible: null, season: "all" };
      this.dark = false;
      this.level = -1;
      this.st = { lines: null, stations: null, force: false, hover: null, route: null, vehicle: null, forced: new Set() };
      this._build();
      this._bindCamera();
    }

    // ── Aufbau ──────────────────────────────────────────────────
    _build() {
      const svg = el("svg", { class: "netz", role: "img", "aria-labelledby": "map-title map-desc", focusable: "false" });
      el("title", { id: "map-title" }, svg).textContent = "Mallorca in Linien – schematischer Netzplan";
      el("desc", { id: "map-desc" }, svg).textContent = "Bus-, Bahn- und Metrolinien auf Mallorca als Liniennetzplan. Alle Linien und Halte stehen zusätzlich als Liste in der Seitenleiste.";
      this.defs = el("defs", null, svg);
      this._mEl = el("text", { x: -99999, y: -99999, "font-size": 100, class: "lbl", style: "visibility:hidden" }, svg);
      this._mcache = new Map();
      this._scaleEls = [];
      this._plateEls = [];
      this.vp = el("g", { class: "vp" }, svg);
      this.gLand = el("g", { class: "g-land" }, this.vp);
      this.svg = svg;
      this.host.appendChild(svg);
      this._drawLand();
      this._computeFit();
      this.k = this._fitK; this.tx = 0; this.ty = 0;
      this._renderLevel(this._levelFor(this.k), true);
      this.fit(false);
    }

    // Insel mit runden Ecken (0,7 Rasterfelder), dazu Landschafts- und Meeresnamen
    _drawLand() {
      const Q = this.LAY.island, G = this.LAY.G;
      if (Q && Q.length > 2) {
        const R = 0.7 * G;
        let d = "";
        for (let i = 0; i < Q.length; i++) {
          const a = Q[(i - 1 + Q.length) % Q.length], p = Q[i], b = Q[(i + 1) % Q.length];
          const l1 = Math.hypot(p[0] - a[0], p[1] - a[1]), l2 = Math.hypot(b[0] - p[0], b[1] - p[1]);
          const d1 = [(p[0] - a[0]) / l1, (p[1] - a[1]) / l1], d2 = [(b[0] - p[0]) / l2, (b[1] - p[1]) / l2];
          const th = Math.acos(Math.max(-1, Math.min(1, d1[0] * d2[0] + d1[1] * d2[1])));
          const t = Math.min(R * Math.tan(th / 2), 0.45 * l1, 0.45 * l2);
          const r = t / Math.tan(th / 2);
          const A = [p[0] - d1[0] * t, p[1] - d1[1] * t], B = [p[0] + d2[0] * t, p[1] + d2[1] * t];
          const sweep = d1[0] * d2[1] - d1[1] * d2[0] > 0 ? 1 : 0;
          d += (i ? "L" : "M") + f1(A[0]) + " " + f1(A[1]) + "A" + f1(r) + " " + f1(r) + " 0 0 " + sweep + " " + f1(B[0]) + " " + f1(B[1]);
        }
        el("path", { class: "land", d: d + "Z" }, this.gLand);
      }
      this._geoEls = [];
      for (const g of this.LAY.geo || []) {
        const x = this.LAY.OX + g.at[0] * G, y = this.LAY.OY + g.at[1] * G;
        const t = el("text", { class: "geo geo-" + g.kind, x: 0, y: 0, "text-anchor": "middle", "font-size": 11 }, this.gLand);
        t.textContent = g.text;
        t.__g = { x, y, rot: g.rot || 0 };
        this._geoEls.push(t);
      }
    }
    // Landschaftsnamen: immer 11 px, unabhängig vom Zoom; am Rand ausgeblendet
    _geoScale() {
      const s = 1 / this.k;
      const [W, H] = this._viewSize();
      const V = (this.o.visibleArea && this.o.visibleArea()) || { l: 0, t: 0, r: W, b: H };
      for (const t of this._geoEls || []) {
        const g = t.__g;
        t.setAttribute("transform", "translate(" + f1(g.x) + " " + f1(g.y) + ") rotate(" + g.rot + ") scale(" + s.toFixed(4) + ") translate(0 4)");
        if (g.len == null) { try { g.len = t.getComputedTextLength(); } catch (e) { g.len = 120; } }
        const cx = g.x * this.k + this.tx, cy = g.y * this.k + this.ty;
        const c = Math.abs(Math.cos(g.rot * Math.PI / 180)), sn = Math.abs(Math.sin(g.rot * Math.PI / 180));
        const hx = g.len / 2 * c + 6 * sn, hy = g.len / 2 * sn + 6 * c;
        const hide = cx - hx < V.l + 16 || cx + hx > V.r - 16 || cy - hy < V.t + 16 || cy + hy > V.b - 16;
        if (t.__edge !== hide) { t.__edge = hide; t.classList.toggle("is-edge", hide); }
      }
    }

    setTheme(dark) { this.dark = !!dark; this._applyColors(); if (this.st.route) this.drawRoute(this.st.route, true); }

    setFilter(filter) {
      this.filter = Object.assign(this.filter, filter);
      this._renderLevel(this.level, true);
    }

    // Weltgröße für eine Bildschirmgröße auf dieser Stufe
    _params(level) {
      const kRef = this._fitK * Math.pow(STEP, level);
      const spacing = Math.min(6.4, 7.4 / kRef);
      const width = spacing * (level <= 1 ? 0.9 : 0.78); // fern: Bündel als Farbband
      const tier = kRef < 0.75 ? 0 : kRef < 1.5 ? 1 : 2;
      return { level, kRef, spacing, width, tier, sc: spacing / 6.4, radius: 22 * spacing / 6.4, px: (v) => v / kRef };
    }
    _levelFor(k) {
      const r = Math.log(k / this._fitK) / Math.log(STEP);
      return Math.max(0, Math.round(r));
    }

    // Baut eine Stufe unsichtbar auf, ohne die sichtbare zu stören
    _buildLevel(level) {
      const keep = this._snap();
      this._buildSeq = (this._buildSeq || 0) + 1;
      this.level = level;
      const P = this._params(level);
      this.P = P;
      const E = window.NetzEngine;
      const self = this;
      this.model = E.build(this.NET, this.LAY, {
        visible: this.filter.visible, season: this.filter.season,
        spacing: P.spacing, width: P.width, radius: P.radius,
        pad: P.px(2.25), // Kapsel: 0,75 px Luft + 1,5 px Umriss
        unitOf: (slot) => (self._isRailSlot(slot) ? RAIL_UNITS : 1)
      });
      const layer = el("g", { class: "lvl", "data-level": level, style: "opacity:0;pointer-events:none" }, this.vp);
      this.L = {
        root: layer,
        defs: el("defs", null, layer),
        casing: el("g", { class: "g-casing" }, layer),
        lines: el("g", { class: "g-lines" }, layer),
        rail: el("g", { class: "g-lines g-rail" }, layer),
        under: el("g", { class: "g-fx-under" }, layer),
        hub: el("g", { class: "g-hub" }, layer),
        stations: el("g", { class: "g-stations" }, layer),
        bridges: el("g", { class: "g-bridges" }, layer),
        badges: el("g", { class: "g-badges" }, layer),
        fx: el("g", { class: "g-fx" }, layer),
        labels: el("g", { class: "g-labels" }, layer)
      };
      this._scaleEls = [];
      this._plateEls = [];
      this._drawLines();
      this._drawStations();
      this._placeLabels();
      this._drawTicks();
      if (P.kRef >= 0.85) this._drawBadges();
      this._applyColors();
      const built = this._snap();
      this._restore(keep);
      return built;
    }
    _snap() {
      return {
        level: this.level, P: this.P, model: this.model, L: this.L, lineEls: this.lineEls, slotEls: this.slotEls,
        stationEls: this.stationEls, labelEls: this.labelEls, tickStations: this.tickStations,
        scaleEls: this._scaleEls, plateEls: this._plateEls, segCost: this._segCost, labelObstacles: this._labelObstacles,
        focusSegs: this._focusSegs, focusLines: this._focusLines
      };
    }
    _restore(s) {
      this.level = s.level; this.P = s.P; this.model = s.model; this.L = s.L; this.lineEls = s.lineEls; this.slotEls = s.slotEls;
      this.stationEls = s.stationEls; this.labelEls = s.labelEls; this.tickStations = s.tickStations;
      this._scaleEls = s.scaleEls || []; this._plateEls = s.plateEls || []; this._segCost = s.segCost; this._labelObstacles = s.labelObstacles;
      this._focusSegs = s.focusSegs; this._focusLines = s.focusLines;
    }
    // Zeigt eine gebaute Stufe und blendet die alte aus (150 ms)
    _activate(built, instant) {
      this._restore(built);
      const layer = built.L.root;
      this.svg.dataset.level = String(built.level);
      this._reapplyState();
      this._csState = null;
      this._counterScale();
      this._edgeState = null;
      this._edgeFade();
      layer.style.pointerEvents = "";
      const old = Array.from(this.vp.querySelectorAll(":scope > g.lvl")).filter((g) => g !== layer);
      if (instant || reduceMotion() || !old.length) {
        layer.style.transition = ""; layer.style.opacity = "1";
        old.forEach((g) => g.remove());
      } else {
        layer.getBoundingClientRect();
        layer.style.transition = "opacity .15s ease";
        layer.style.opacity = "1";
        old.forEach((g) => { g.style.transition = "opacity .15s ease"; g.style.opacity = "0"; g.style.pointerEvents = "none"; setTimeout(() => g.remove(), 180); });
      }
    }
    _dropPending() {
      if (this._pending) { this._pending.L.root.remove(); this._pending = null; }
    }
    // Zeichnet die Stufe neu und blendet über
    _renderLevel(level, instant) {
      this._dropPending();
      this._activate(this._buildLevel(level), instant);
    }

    _isRailSlot(slot) {
      if (slot === "sfm") return true;
      const l = this.lineById.get(slot);
      return !!(l && /rail|metro|heritage/.test(l.mode || ""));
    }

    // ── Linien ──────────────────────────────────────────────────
    _drawLines() {
      const m = this.model, L = this.L, P = this.P;
      this.lineEls = new Map();
      this.slotEls = new Map();
      const slotOf = (id) => (this.LAY.slots && this.LAY.slots[id]) || id;
      m.linePaths.forEach((lp, li) => {
        const line = lp.line;
        const d = m.lineGeo[li].d;
        const isRail = /rail|metro|heritage/.test(line.mode || "");
        let g = this.lineEls.get(line.id);
        if (!g) {
          // Linien auf einem gemeinsamen Gleis liegen in einer Gruppe
          const slot = slotOf(line.id);
          let sgp = this.slotEls.get(slot);
          if (!sgp) { sgp = { el: el("g", { class: "slot", "data-slot": slot }, isRail ? L.rail : L.lines), lines: [] }; this.slotEls.set(slot, sgp); }
          sgp.lines.push(line.id);
          g = {
            casing: el("g", { class: "lc", "data-line": line.id }, L.casing),
            stroke: el("g", { class: "ln mode-" + (line.mode || "bus") + (line.demand ? " is-demand" : "") + (line.season && line.season !== "all" ? " is-seasonal" : ""), "data-line": line.id }, sgp.el),
            bridges: [], slot: sgp, rail: isRail
          };
          this.lineEls.set(line.id, g);
        }
        const w = isRail ? P.width * RAIL_UNITS * 0.82 : P.width;
        el("path", { d, class: "casing", "stroke-width": f1(w + 2.6 * P.sc) }, g.casing);
        if (isRail) {
          el("path", { d, class: "rail", "stroke-width": f1(w) }, g.stroke);
        } else if (line.mode === "connection") {
          el("path", { d, class: "conn", "stroke-width": f1(w * 0.9), "stroke-dasharray": ".1 " + f1(w * 1.5) }, g.stroke);
        } else {
          el("path", { d, class: "outline", "stroke-width": f1(w + 1.6 * P.sc) }, g.stroke);
          el("path", { d, class: "stroke", "stroke-width": f1(w), "stroke-dasharray": line.demand ? f1(w * 1.8) + " " + f1(w * 1.1) : null }, g.stroke);
        }
        const hit = el("path", { d, class: "hit", "stroke-width": f1(Math.max(w * 2.4, 14 / P.kRef)) }, g.stroke);
        hit.addEventListener("pointerenter", () => this.o.onHoverLine(line.id, true));
        hit.addEventListener("pointerleave", () => this.o.onHoverLine(line.id, false));
        hit.addEventListener("click", (ev) => { if (this._dragged) return; ev.stopPropagation(); this.o.onSelectLine(line.id); });
      });
    }

    // ── Halte ───────────────────────────────────────────────────
    // Zwei Formen: Strich (eine Buslinie) und Kapsel (Umsteigen; Bahn dunkel
    // mit weißem Kern). Rechteck nur, wo Linien in drei oder mehr Richtungen
    // auseinandergehen. Umriss überall 1,5 px, Ecken = halbe kurze Seite.
    _drawStations() {
      const m = this.model, L = this.L, P = this.P;
      this.stationEls = new Map();
      this.tickStations = [];
      const sw = P.px(1.5);
      for (const sg of m.stationGeo.values()) {
        sg.labelRect = null; sg.labelN = null; sg.tick = false; sg.tk = null;
        if (sg.unused) continue;
        const click = (ev) => { if (this._dragged) return; ev.stopPropagation(); this.o.onSelectStation(sg.id); };
        if (sg.hub) {
          // Scheibe: das breiteste Bündel hat 6 px Luft, Ring 3 px, kein Punkt
          let half = 0;
          for (const e of m.edges.values()) if (e.a === sg.id || e.b === sg.id) half = Math.max(half, (e.total || 1) * P.spacing / 2);
          sg.r = Math.max(half + P.px(6) + P.px(1.5), P.px(14));
          sg.box = [sg.c[0] - sg.r, sg.c[1] - sg.r, sg.c[0] + sg.r, sg.c[1] + sg.r];
          const g = el("g", { class: "st hub", "data-station": sg.id }, L.hub);
          el("circle", { cx: f1(sg.c[0]), cy: f1(sg.c[1]), r: f1(sg.r - P.px(1.5)), class: "hub-disc", "stroke-width": f1(P.px(3)) }, g);
          g.addEventListener("click", click);
          this.stationEls.set(sg.id, g);
          // Linien ohne Halt laufen sichtbar über die Scheibe (Lücke im Ring)
          if ((sg.bridges || []).length) {
            const id = "clip-" + this._buildSeq + "-" + sg.id;
            const cp = el("clipPath", { id }, L.defs);
            el("circle", { cx: f1(sg.c[0]), cy: f1(sg.c[1]), r: f1(sg.r) }, cp);
            const gc = el("g", { class: "bridge-set", "clip-path": "url(#" + id + ")" }, L.bridges);
            const gCas = el("g", null, gc), gStr = el("g", null, gc);
            for (const b of sg.bridges) {
              const lineG = this.lineEls.get(b.line);
              const pd = this.model.lineGeo[b.li].d;
              const bw = this._isRailSlot(b.line) ? P.width * RAIL_UNITS * 0.82 : P.width;
              const g1 = el("g", { class: "bridge", "data-line": b.line }, gCas);
              el("path", { d: pd, class: "bridge-casing", "stroke-width": f1(bw + 2 * P.px(2)) }, g1);
              const g2 = el("g", { class: "bridge", "data-line": b.line }, gStr);
              el("path", { d: pd, class: "bridge-stroke", "stroke-width": f1(bw) }, g2);
              if (lineG) lineG.bridges.push(g1, g2);
            }
          }
          continue;
        }
        const rail = [...sg.lines].some((id) => /rail|metro|heritage/.test((this.lineById.get(id) || {}).mode || ""));
        if (sg.pts.length === 1 && !rail) {
          // einfacher Halt: Strich zur Namensseite (wird nach der Beschriftung gezeichnet)
          sg.tick = true;
          sg.tk = this._tickGeo(sg);
          const q = sg.tk.q, e = P.width * 0.7;
          sg.box = [q[0] - e, q[1] - e, q[0] + e, q[1] + e];
          this.tickStations.push(sg);
          continue;
        }
        // Hauptknoten (Inca, Manacor, Flughafen): wie Palma weiß mit 3-px-Ring, mindestens 16 px
        const hubFam = ((this.LAY.rank || {})[sg.id] === 1);
        const g = el("g", { class: "st" + (rail && !hubFam ? " is-rail" : "") + (hubFam ? " is-hub" : ""), "data-station": sg.id }, L.stations);
        const swS = hubFam ? P.px(3) : sw;
        if (hubFam && !sg.rect) {
          sg.r = Math.max(sg.r, P.px(8));
          const x0 = Math.min(sg.A[0], sg.B[0]), y0 = Math.min(sg.A[1], sg.B[1]), x1 = Math.max(sg.A[0], sg.B[0]), y1 = Math.max(sg.A[1], sg.B[1]);
          sg.bb = [x0 - sg.r, y0 - sg.r, x1 + sg.r, y1 + sg.r]; sg.box = sg.bb.slice();
        }
        const rO = sg.r, rF = Math.max(P.px(0.5), rO - swS);
        if (sg.rect) {
          // Rechteck höchstens 1,25-mal so lang wie breit; Linien aus anderen
          // Richtungen enden an seinem Rand
          const b = sg.bb.slice();
          const bw = b[2] - b[0], bh = b[3] - b[1], cap = Math.min(bw, bh) * 1.25;
          if (bw > cap) { const cx0 = (b[0] + b[2]) / 2; b[0] = cx0 - cap / 2; b[2] = cx0 + cap / 2; }
          if (bh > cap) { const cy0 = (b[1] + b[3]) / 2; b[1] = cy0 - cap / 2; b[3] = cy0 + cap / 2; }
          // kein Haltepunkt darf herausfallen: jede haltende Linie berührt das Zeichen
          const e = P.width * 0.5 + P.px(1.5);
          for (const q of sg.pts) { b[0] = Math.min(b[0], q[0] - e); b[1] = Math.min(b[1], q[1] - e); b[2] = Math.max(b[2], q[0] + e); b[3] = Math.max(b[3], q[1] + e); }
          if (hubFam) { // mindestens 16 px je Seite
            const mn = P.px(16);
            if (b[2] - b[0] < mn) { const c0 = (b[0] + b[2]) / 2; b[0] = c0 - mn / 2; b[2] = c0 + mn / 2; }
            if (b[3] - b[1] < mn) { const c0 = (b[1] + b[3]) / 2; b[1] = c0 - mn / 2; b[3] = c0 + mn / 2; }
          }
          sg.bb = b; sg.box = b.slice();
          const rr = Math.min(rO, (b[2] - b[0]) / 2, (b[3] - b[1]) / 2);
          el("rect", { x: f1(b[0] + swS / 2), y: f1(b[1] + swS / 2), width: f1(b[2] - b[0] - swS), height: f1(b[3] - b[1] - swS), rx: f1(Math.max(0, rr - swS / 2)), class: rail && !hubFam ? "pill-rail" : "pill", "stroke-width": f1(swS) }, g);
          if (rail && !hubFam) {
            const ins = rO * 0.62;
            el("rect", { x: f1(b[0] + ins), y: f1(b[1] + ins), width: f1(Math.max(0.1, b[2] - b[0] - 2 * ins)), height: f1(Math.max(0.1, b[3] - b[1] - 2 * ins)), rx: f1(rO - ins), class: "pill-core" }, g);
          }
        } else if (sg.pts.length === 1 && !hubFam) {
          el("circle", { cx: f1(sg.A[0]), cy: f1(sg.A[1]), r: f1(rO - sw / 2), class: "pill-rail", "stroke-width": f1(sw) }, g);
          el("circle", { cx: f1(sg.A[0]), cy: f1(sg.A[1]), r: f1(rF * 0.45), class: "pill-core" }, g);
        } else {
          const cls = rail && !hubFam ? "pill-rail" : "pill";
          const ln = (cl, w) => el("line", { x1: f1(sg.A[0]), y1: f1(sg.A[1]), x2: f1(sg.B[0]), y2: f1(sg.B[1]), class: cl, "stroke-width": f1(w) }, g);
          ln(cls + "-edge", 2 * rO);
          ln(cls + "-fill", 2 * rF);
          if (rail && !hubFam) ln("pill-core-line", rF * 0.9);
        }
        const cx = (sg.box[0] + sg.box[2]) / 2, cy = (sg.box[1] + sg.box[3]) / 2;
        el("circle", { cx: f1(cx), cy: f1(cy), r: f1(Math.max((sg.box[2] - sg.box[0]) / 2, (sg.box[3] - sg.box[1]) / 2, 12 / P.kRef)), class: "st-hit" }, g);
        g.addEventListener("click", click);
        this.stationEls.set(sg.id, g);

        // Durchfahrt ohne Halt: die Linie läuft über die Kapsel, deren Umriss
        // beidseits 2 px Lücke hat. Nichts ragt über die Kapsel hinaus.
        if ((sg.bridges || []).length) {
          const id = "clip-" + this._buildSeq + "-" + sg.id;
          const cp = el("clipPath", { id }, L.defs);
          this._outlineShape(sg, cp);
          const gc = el("g", { class: "bridge-set", "clip-path": "url(#" + id + ")" }, L.bridges);
          const gCas = el("g", null, gc), gStr = el("g", null, gc);
          for (const b of sg.bridges) {
            const lineG = this.lineEls.get(b.line);
            const pd = this.model.lineGeo[b.li].d;
            const bw = this._isRailSlot(b.line) ? P.width * RAIL_UNITS * 0.82 : P.width;
            const g1 = el("g", { class: "bridge", "data-line": b.line }, gCas);
            el("path", { d: pd, class: "bridge-casing", "stroke-width": f1(bw + 2 * P.px(2)) }, g1);
            const g2 = el("g", { class: "bridge", "data-line": b.line }, gStr);
            el("path", { d: pd, class: "bridge-stroke", "stroke-width": f1(bw) }, g2);
            if (lineG) lineG.bridges.push(g1, g2);
          }
        }
      }
    }

    // Außenkontur eines Halts (Rechteck, Kapsel oder Kreis)
    _outlineShape(sg, parent) {
      if (sg.rect) {
        const b = sg.bb;
        return el("rect", { x: f1(b[0]), y: f1(b[1]), width: f1(b[2] - b[0]), height: f1(b[3] - b[1]), rx: f1(sg.r) }, parent);
      }
      const A = sg.A, B = sg.B, r = sg.r;
      const dx = B[0] - A[0], dy = B[1] - A[1], l = Math.hypot(dx, dy);
      if (l < 0.01) return el("circle", { cx: f1(A[0]), cy: f1(A[1]), r: f1(r) }, parent);
      const n = [-dy / l * r, dx / l * r];
      const d = "M" + f1(A[0] + n[0]) + " " + f1(A[1] + n[1]) + "L" + f1(B[0] + n[0]) + " " + f1(B[1] + n[1]) +
        "A" + f1(r) + " " + f1(r) + " 0 0 0 " + f1(B[0] - n[0]) + " " + f1(B[1] - n[1]) +
        "L" + f1(A[0] - n[0]) + " " + f1(A[1] - n[1]) +
        "A" + f1(r) + " " + f1(r) + " 0 0 0 " + f1(A[0] + n[0]) + " " + f1(A[1] + n[1]) + "Z";
      return el("path", { d }, parent);
    }

    // Lage eines Strichs. Liegt der Halt im Knick, rückt der Strich ein
    // Stück auf das längere gerade Stück; so gibt es nur eine Strichform.
    _tickGeo(sg) {
      const P = this.P, m = this.model;
      const lineId = [...sg.lines][0];
      const lis = [];
      m.linePaths.forEach((lp, i) => { if (lp.line.id === lineId && lp.stops.has(sg.id)) lis.push(i); });
      const li = lis[0];
      const pts = m.lineGeo[li].pts;
      const q0 = sg.pts[0];
      let bi = 0, bd = Infinity;
      for (let i = 0; i < pts.length; i++) { const dd = (pts[i][0] - q0[0]) ** 2 + (pts[i][1] - q0[1]) ** 2; if (dd < bd) { bd = dd; bi = i; } }
      const dirOf = (a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1; return [dx / l, dy / l, l]; };
      const shift = 10 * P.sc + P.width * 0.6 + P.px(2);
      const last = pts.length - 1;
      let q = [q0[0], q0[1]], d, isEnd = false, out = null;
      if (bd < 1 && (bi === 0 || bi === last)) {
        const inward = bi === 0 ? dirOf(pts[0], pts[1]) : dirOf(pts[last], pts[last - 1]);
        d = inward;
        if (lis.length > 1) {
          const s = Math.min(shift, inward[2] * 0.4);
          q = [pts[bi][0] + inward[0] * s, pts[bi][1] + inward[1] * s];
        } else { isEnd = true; out = [-inward[0], -inward[1]]; }
      } else if (bd < 1) {
        const u = dirOf(pts[bi - 1], pts[bi]), v = dirOf(pts[bi], pts[bi + 1]);
        if (u[0] * v[0] + u[1] * v[1] < 0.94) {
          if (v[2] >= u[2]) { d = v; const s = Math.min(shift, v[2] * 0.4); q = [pts[bi][0] + v[0] * s, pts[bi][1] + v[1] * s]; }
          else { d = u; const s = Math.min(shift, u[2] * 0.4); q = [pts[bi][0] - u[0] * s, pts[bi][1] - u[1] * s]; }
        } else d = v;
      } else {
        let si = 0, best = Infinity;
        for (let i = 0; i < last; i++) { const dd = segDist(q0, pts[i], pts[i + 1]); if (dd < best) { best = dd; si = i; } }
        d = dirOf(pts[si], pts[si + 1]);
      }
      return { q, d: [d[0], d[1]], isEnd, out, lineId, li };
    }

    _drawTicks() {
      const P = this.P;
      const TL = P.width * 1.35;
      for (const sg of this.tickStations) {
        const tk = sg.tk, q = tk.q, d = tk.d;
        const n = sg.labelN || [-d[1], d[0]];
        const g = el("g", { class: "st is-tick", "data-station": sg.id }, this.L.stations);
        const w0 = tk.isEnd ? -TL : P.width * 0.1;
        const tl = el("line", { x1: f1(q[0] + n[0] * w0), y1: f1(q[1] + n[1] * w0), x2: f1(q[0] + n[0] * TL), y2: f1(q[1] + n[1] * TL), class: "tick", "stroke-width": f1(P.width * 0.78), "data-line": tk.lineId }, g);
        const lt = this.labelEls && this.labelEls.get(sg.id);
        if (lt) lt.__tick = { el: tl, q, w0, TL };
        el("circle", { cx: f1(q[0]), cy: f1(q[1]), r: f1(Math.max(P.width * 1.6, 12 / P.kRef)), class: "st-hit" }, g);
        g.addEventListener("click", (ev) => { if (this._dragged) return; ev.stopPropagation(); this.o.onSelectStation(sg.id); });
        this.stationEls.set(sg.id, g);
      }
    }

    // Textbreite je Schriftklasse, einmal gemessen (bei 100 px)
    _measure(cls, text) {
      const key = cls + "|" + text;
      let v = this._mcache.get(key);
      if (v == null) {
        this._mEl.setAttribute("class", cls);
        this._mEl.textContent = text;
        v = this._mEl.getComputedTextLength() / 100;
        this._mcache.set(key, v);
      }
      return v;
    }

    // Lagen für einen Namen: acht Richtungen in festem Abstand zum Zeichen
    _labelCands(sg, own, w, h, S, pinned, anySide) {
      const P = this.P, out = [];
      const cfg = (this.LAY.labels && this.LAY.labels[sg.id]) || {};
      if (sg.tick && sg.tk && !pinned) {
        const tk = sg.tk, q = tk.q, d = tk.d;
        const TL = P.width * 1.35, g = P.px(3);
        for (const n of [[-d[1], d[0]], [d[1], -d[0]]]) {
          const E = [q[0] + n[0] * (TL + g), q[1] + n[1] * (TL + g)];
          for (const c of anchorRects(E, n, w, h, P)) out.push(Object.assign(c, { n, tip: [q[0] + n[0] * TL, q[1] + n[1] * TL] }));
        }
        if (tk.isEnd && tk.out) {
          const o = tk.out, gap = P.width * 0.5 + P.px(4);
          const E = [q[0] + o[0] * gap, q[1] + o[1] * gap];
          for (const c of anchorRects(E, o, w, h, P)) out.push(Object.assign(c, { n: null, tip: q, extra: (c.extra || 0) + S * 0.2 }));
        }
      } else {
        const b = own;
        const cx = (b[0] + b[2]) / 2, cy = (b[1] + b[3]) / 2;
        const rr = sg.rect || sg.tick ? 0 : Math.min((b[2] - b[0]) / 2, (b[3] - b[1]) / 2);
        const rnd = rr * 0.29;
        const rk = (this.LAY.rank || {})[sg.id] || 3;
        // Orte und Knoten: zusätzlich mit 1,6- und 2,4-fachem Abstand, damit sie keine Linie kreuzen müssen
        for (const gm of rk <= 2 ? [1, 1.6, 2.4] : [1]) {
          const g = P.px(4) * gm, gd = g * 0.71, ex = gm > 2 ? S * 1.2 : gm > 1 ? S * 0.4 : 0;
          const C = (dir, x0, y0, align) => out.push({ dir, rect: [x0, y0, x0 + w, y0 + h], align, n: null, extra: ex });
          C("e", b[2] + g, cy - h / 2, "start");
          C("w", b[0] - g - w, cy - h / 2, "end");
          C("n", cx - w / 2, b[1] - g - h, "middle");
          C("s", cx - w / 2, b[3] + g, "middle");
          C("ne", b[2] + gd - rnd, b[1] - gd - h + rnd, "start");
          C("nw", b[0] - gd - w + rnd, b[1] - gd - h + rnd, "end");
          C("se", b[2] + gd - rnd, b[3] + gd - rnd, "start");
          C("sw", b[0] - gd - w + rnd, b[3] + gd - rnd, "end");
        }
      }
      if (cfg.dir && !anySide) { const only = out.filter((c) => c.dir === cfg.dir); if (only.length) return only; } // feste Seite
      return out;
    }

    // ── Beschriftung ────────────────────────────────────────────
    // Jeder Name sitzt in festem Abstand an seinem Zeichen: 4 px an Kapseln,
    // 3 px am Strichende. Namen überdecken sich nie, liegen nie näher an
    // einem fremden Halt als am eigenen und kreuzen eine Linie nur, wenn
    // keine der acht Lagen frei ist.
    _placeLabels() {
      const m = this.model, LAY = this.LAY, P = this.P, L = this.L;
      const k = P.kRef, T = P.tier;
      const forced = this.st.forced || new Set();
      const route = this.st.route;
      const segs = [];
      m.lineGeo.forEach((g, li) => {
        const lid = m.linePaths[li].line.id;
        for (let i = 1; i < g.pts.length; i++) segs.push([g.pts[i - 1][0], g.pts[i - 1][1], g.pts[i][0], g.pts[i][1], lid]);
      });
      const cell = 60, grid = new Map();
      const keyOf = (cx, cy) => cx + ":" + cy;
      segs.forEach((s, i) => {
        const x0 = Math.floor(Math.min(s[0], s[2]) / cell), x1 = Math.floor(Math.max(s[0], s[2]) / cell);
        const y0 = Math.floor(Math.min(s[1], s[3]) / cell), y1 = Math.floor(Math.max(s[1], s[3]) / cell);
        for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) {
          const kk = keyOf(x, y); if (!grid.has(kk)) grid.set(kk, []); grid.get(kk).push(i);
        }
      });
      const segCost = (rect, exclude, padIn) => {
        const pad = padIn == null ? P.width * 0.5 + P.px(1.5) : padIn;
        const R = [rect[0] - pad, rect[1] - pad, rect[2] + pad, rect[3] + pad];
        const seen = new Set(); let cost = 0;
        for (let x = Math.floor(R[0] / cell); x <= Math.floor(R[2] / cell); x++)
          for (let y = Math.floor(R[1] / cell); y <= Math.floor(R[3] / cell); y++) {
            const list = grid.get(keyOf(x, y)); if (!list) continue;
            for (const i of list) {
              if (seen.has(i)) continue; seen.add(i);
              if (exclude && segs[i][4] === exclude) continue;
              cost += clipLen(segs[i], R);
            }
          }
        return cost;
      };
      this._segCost = segCost;
      // wie viele verschiedene Linien liegen unter einem Namen?
      const crossN = (rect) => {
        const pad = P.width * 0.5 + P.px(1);
        const R = [rect[0] - pad, rect[1] - pad, rect[2] + pad, rect[3] + pad];
        const ids = new Set();
        for (let x = Math.floor(R[0] / cell); x <= Math.floor(R[2] / cell); x++)
          for (let y = Math.floor(R[1] / cell); y <= Math.floor(R[3] / cell); y++) {
            const list = grid.get(keyOf(x, y)); if (!list) continue;
            for (const i of list) if (!ids.has(segs[i][4]) && clipLen(segs[i], R) > 0) ids.add(segs[i][4]);
          }
        return ids.size;
      };
      // Linien, die durch die Schrift selbst laufen (ohne Rand)
      const crossCore = (rect) => {
        const R = [rect[0] + P.px(1), rect[1] + P.px(1), rect[2] - P.px(1), rect[3] - P.px(1)];
        const ids = new Set();
        for (let x = Math.floor(R[0] / cell); x <= Math.floor(R[2] / cell); x++)
          for (let y = Math.floor(R[1] / cell); y <= Math.floor(R[3] / cell); y++) {
            const list = grid.get(keyOf(x, y)); if (!list) continue;
            for (const i of list) if (!ids.has(segs[i][4]) && clipLen(segs[i], R) > 0) ids.add(segs[i][4]);
          }
        return ids.size;
      };
      const overlap = (a, b) => Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0])) * Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1]));
      const boxDist = (r, b) => Math.hypot(Math.max(b[0] - r[2], 0, r[0] - b[2]), Math.max(b[1] - r[3], 0, r[1] - b[3]));

      // Verbindung: Linie und Stecknadeln bleiben frei
      const routeSegs = [], pins = new Map();
      if (route && route.length) {
        route.forEach((leg, i) => {
          for (let j = 1; j < leg.stops.length; j++) {
            const sp = this.subPath(leg.line, leg.stops[j - 1], leg.stops[j]);
            if (sp) for (let q = 1; q < sp.length; q++) routeSegs.push([sp[q - 1][0], sp[q - 1][1], sp[q][0], sp[q][1]]);
          }
          pins.set(leg.stops[0], true);
        });
        const lastLeg = route[route.length - 1];
        pins.set(lastLeg.stops[lastLeg.stops.length - 1], true);
      }
      // gewählte Linien (Linien- oder Haltansicht): graue Namen bleiben davon frei
      const focusSegs = [];
      if (this.st.lines && !routeSegs.length) {
        m.linePaths.forEach((lp, li) => {
          if (!this.st.lines.has(lp.line.id)) return;
          const pts = m.lineGeo[li].pts;
          for (let i = 1; i < pts.length; i++) focusSegs.push([pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]]);
        });
      }
      this._focusSegs = focusSegs; this._focusLines = this.st.lines; // für _edgeFade: zwischen den Stufen wachsen Namen
      const focusHit = (rect) => {
        if (!focusSegs.length) return false;
        const pad = P.width * 0.8 + P.px(2);
        const R = [rect[0] - pad, rect[1] - pad, rect[2] + pad, rect[3] + pad];
        for (const sgm of focusSegs) if (clipLen(sgm, R) > 0) return true;
        return false;
      };
      const pinPts = [];
      for (const id of pins.keys()) { const p = this.stationPoint(id); if (p) pinPts.push(p); }
      const routeHit = (rect, relaxed) => {
        if (!routeSegs.length) return false;
        const pad = P.px(relaxed ? 5 : 8.5);
        const R = [rect[0] - pad, rect[1] - pad, rect[2] + pad, rect[3] + pad];
        for (const s of routeSegs) if (clipLen(s, R) > 0) return true;
        for (const p of pinPts) if (boxDist(rect, [p[0], p[1], p[0], p[1]]) < P.px(relaxed ? 10.5 : 12)) return true;
        return false;
      };

      const syms = [];
      for (const sg of m.stationGeo.values()) if (!sg.unused) syms.push(sg);
      // Ziele: Linienenden und Bahnhöfe bekommen immer einen Namen
      const dest = new Set();
      for (const lp of m.linePaths) { const s = lp.stopSeq; if (s.length) { dest.add(s[0]); dest.add(s[s.length - 1]); } }
      for (const sg of syms) if ([...sg.lines].some((id) => /rail|metro|heritage/.test((this.lineById.get(id) || {}).mode || ""))) dest.add(sg.id);
      const rankOf = (id) => (LAY.rank && LAY.rank[id]) || 3;
      const policy = (sg, r) => {
        const id = sg.id;
        if (forced.has(id) || r === 1) return "force";
        // große Umsteigezeichen (über 12 px) tragen immer ihren Namen
        const big = !sg.tick && Math.max(sg.box[2] - sg.box[0], sg.box[3] - sg.box[1]) * k > 12;
        if (r === 2) return k >= 0.3 || dest.has(id) || big ? "force" : "opt";
        if (big) return k >= 0.62 ? "force" : "small";
        if (dest.has(id)) return k >= 0.62 ? "force" : "small";
        if (k < 0.4) return "hide";
        return k < 0.62 ? "opt" : "force";
      };
      // Nachbarn entlang gerader Strecken (Namen auf dieselbe Seite)
      const nb = new Map();
      const G = LAY.grid || {};
      for (const lp of m.linePaths) {
        for (let i = 1; i < lp.stopSeq.length; i++) {
          const a = lp.stopSeq[i - 1], b = lp.stopSeq[i];
          const ga = G[a], gb = G[b];
          if (!ga || !gb) continue;
          const dx = gb[0] - ga[0], dy = gb[1] - ga[1];
          const straight = Math.abs(dx) < 1e-6 || Math.abs(dy) < 1e-6 || Math.abs(Math.abs(dx) - Math.abs(dy)) < 1e-6;
          if (!straight || Math.hypot(dx, dy) > 2.5) continue;
          if (!nb.has(a)) nb.set(a, new Set());
          if (!nb.has(b)) nb.set(b, new Set());
          nb.get(a).add(b); nb.get(b).add(a);
        }
      }
      const order = syms.filter((sg) => !sg.hub);
      const bigOf = (sg) => (!sg.tick && Math.max(sg.box[2] - sg.box[0], sg.box[3] - sg.box[1]) * k > 12 ? 1 : 0);
      order.sort((a, b) => (forced.has(b.id) - forced.has(a.id)) || rankOf(a.id) - rankOf(b.id) || (bigOf(b) - bigOf(a)) || (dest.has(b.id) - dest.has(a.id)) || b.lines.size - a.lines.size);

      const PREF = { e: 0, w: 0.35, s: 0.7, n: 0.7, ne: 1, se: 1, sw: 1.2, nw: 1.2 };
      this.labelEls = new Map();
      this._scaleEls = [];
      const placedDir = new Map();
      const labelRects = [];
      const labelIds = [];  // Halt je Namensrechteck (gleicher Index)
      const labelRecs = []; // zum Verschieben: Text, Kandidaten, Bewertung (gleicher Index)
      const addText = (id, cls, S, lines, rect, align, anchorTo) => {
        const tx = align === "start" ? rect[0] : align === "end" ? rect[2] : (rect[0] + rect[2]) / 2;
        const t = el("text", { class: cls, "data-station": id, "text-anchor": align, "font-size": f1(S), lang: "ca" }, L.labels);
        const lh = S * 1.12;
        lines.forEach((line, i) => { el("tspan", { x: f1(tx), y: f1(rect[1] + S * 0.8 + i * lh) }, t).textContent = line; });
        const c = anchorTo || [(rect[0] + rect[2]) / 2, (rect[1] + rect[3]) / 2];
        t.__a = [f1(Math.max(rect[0], Math.min(rect[2], c[0]))), f1(Math.max(rect[1], Math.min(rect[3], c[1])))];
        t.__r = rect;
        this._scaleEls.push(t);
        t.addEventListener("click", (ev) => { if (this._dragged) return; ev.stopPropagation(); this.o.onSelectStation(id); });
        return t;
      };

      // Palma: groß, auf der freiesten Seite der Scheibe. Unter der Scheibe auch etwas
      // tiefer oder versetzt (zwischen den Bündeln). Kreuzt dort jede Lage Linien, darf
      // die Schrift 2 px kleiner werden, wenn sie so deutlich freier liegt.
      for (const sg of syms) {
        if (!sg.hub) continue;
        const st = this.stationById.get(sg.id);
        const hr = sg.r, gp = P.px(6);
        const choose = (size) => {
          const S = P.px(size);
          const w = this._measure("lbl r1 hub-name", st.name) * S;
          const opts = [
            { x: sg.c[0] - w / 2, y: sg.c[1] + hr + gp, pen: 0, sub: true },
            { x: sg.c[0] - w / 2, y: sg.c[1] - hr - gp - S, pen: S * 0.8 },
            { x: sg.c[0] + hr + gp, y: sg.c[1] - S / 2, pen: S * 0.6 },
            { x: sg.c[0] - hr - gp - w, y: sg.c[1] - S / 2, pen: S * 0.6 },
            { x: sg.c[0] + hr * 0.72, y: sg.c[1] + hr * 0.72, pen: S, sub: true },
            { x: sg.c[0] - hr * 0.72 - w, y: sg.c[1] + hr * 0.72, pen: S, sub: true }
          ];
          for (const f of [1.5, 1.9, 2.4, 2.9]) for (const dx of [0, -2, 2, -4, 4])
            opts.push({ x: sg.c[0] - w / 2 + P.px(dx), y: sg.c[1] + hr + gp * f, pen: S * 0.1 * f + P.px(Math.abs(dx)) * 0.2, sub: true });
          let best = null;
          for (const o of opts) {
            const rect = [o.x, o.y, o.x + w, o.y + S];
            const cross = segCost(rect);
            const c = cross * 3 + o.pen + (routeHit(rect) ? 1e6 : 0) + (!forced.has(sg.id) && focusHit(rect) ? 1e5 : 0);
            if (!best || c < best.c) best = { o, c, cross, S, w };
          }
          return best;
        };
        let pick = choose(TYPE.hub[T]);
        if (pick.cross > P.px(1)) {
          const small = choose(TYPE.hub[T] - 2);
          if (small.cross < pick.cross * 0.6) pick = small;
        }
        const bestO = pick.o, S = pick.S, w = pick.w;
        const rect = [bestO.x, bestO.y, bestO.x + w, bestO.y + S];
        const t = addText(sg.id, "lbl r1 hub-name", S, [st.name], rect, "middle", sg.c);
        this.labelEls.set(sg.id, t);
        sg.labelRect = rect;
        labelRects.push(rect); labelIds.push(sg.id); labelRecs.push(null);
        if (k >= 0.8 && bestO.sub) {
          const s2 = P.px(TYPE.sub[T]);
          const w2 = this._measure("lbl hub-sub", "Estació Intermodal") * s2;
          const cx = (rect[0] + rect[2]) / 2;
          const r2 = [cx - w2 / 2, rect[3] + s2 * 0.25, cx + w2 / 2, rect[3] + s2 * 1.25];
          addText(sg.id, "lbl hub-sub", s2, ["Estació Intermodal"], r2, "middle", sg.c);
          labelRects.push(r2); labelIds.push(sg.id); labelRecs.push(null);
        }
      }

      // Ein Name: phase 1 setzt nur eindeutige Lagen (sonst false = später), phase 2 nutzt alle Auswege
      const placeOne = (sg, phase) => {
        const st = this.stationById.get(sg.id);
        const r = rankOf(sg.id);
        const pol = policy(sg, r);
        if (pol === "hide") return true;
        const cfg = (LAY.labels && LAY.labels[sg.id]) || {};
        let linesTxt = cfg.lines || [st.name];
        const trip = !!routeSegs.length && forced.has(sg.id);
        let cls, px;
        if (pol === "small") { cls = "lbl small"; px = TYPE.small[T]; }
        else { cls = "lbl r" + r; px = TYPE["r" + r][T]; }
        if (trip) { cls += " trip"; px = Math.max(px, TYPE.trip[T]); }
        const S = P.px(px);
        const lh = S * 1.12;
        let w = 0;
        for (const t of linesTxt) w = Math.max(w, this._measure(cls, t) * S);
        let h = lh * linesTxt.length - (lh - S);
        // Stecknadel der Verbindung zählt zum eigenen Zeichen
        let own = sg.box.slice();
        const pinned = pins.has(sg.id);
        if (pinned) {
          const pr = P.px(10.5);
          own = [Math.min(own[0], sg.c[0] - pr), Math.min(own[1], sg.c[1] - pr), Math.max(own[2], sg.c[0] + pr), Math.max(own[3], sg.c[1] + pr)];
        }
        let cands = this._labelCands(sg, own, w, h, S, pinned);
        // Namen auf gleicher Grundlinie brauchen eine Buchstabenhöhe Luft
        const sideOf = (d) => (d && d.includes("e") ? "e" : d && d.includes("w") ? "w" : d);
        const clash = (rect, dir) => {
          for (let li = 0; li < labelRects.length; li++) {
            const lr = labelRects[li];
            if (overlap(rect, [lr[0] - P.px(2), lr[1] - P.px(1.5), lr[2] + P.px(2), lr[3] + P.px(1.5)]) > 0) return true;
            const vOver = Math.min(rect[3], lr[3]) - Math.max(rect[1], lr[1]);
            if (vOver > 0 && Math.abs(rect[1] - lr[1]) < P.px(6.5)) {
              const hGap = Math.max(lr[0] - rect[2], rect[0] - lr[2]);
              if (hGap < P.px(13)) return true;
            }
            // übereinander: unter 0,6 em Abstand und bündig → wirkt wie ein Name
            const hOver = Math.min(rect[2], lr[2]) - Math.max(rect[0], lr[0]);
            const vGap = Math.max(lr[1] - rect[3], rect[1] - lr[3]);
            if (hOver > 0 && vGap >= 0 && vGap < S * 0.6) {
              // Leiter (Beck): Nachbarhalte einer geraden Strecke, Namen auf derselben Seite
              const oid = labelIds[li];
              const ladder = (nb.get(sg.id) || new Set()).has(oid) && sideOf(placedDir.get(oid)) === sideOf(dir);
              const al = Math.min(Math.abs(rect[0] - lr[0]), Math.abs(rect[2] - lr[2]), Math.abs(rect[0] + rect[2] - lr[0] - lr[2]) / 2);
              if (al < S && !ladder) return true;
            }
          }
          return false;
        };
        // Stufen: 0 streng · 1 Fahrt enger an der Route · 2 Fahrt: nur Namen tabu
        const evalCands = (list, mode) => {
          let best = null, fallback = null;
          for (const c of list) {
            const rect = c.rect;
            if (clash(rect, c.dir)) continue;
            const ownBox = c.tip ? [Math.min(c.tip[0], sg.tk.q[0]) - P.width * 0.4, Math.min(c.tip[1], sg.tk.q[1]) - P.width * 0.4, Math.max(c.tip[0], sg.tk.q[0]) + P.width * 0.4, Math.max(c.tip[1], sg.tk.q[1]) + P.width * 0.4] : own;
            const ownD = boxDist(rect, ownBox);
            // mehrdeutig ist ein Name, wenn ein fremdes Zeichen klar näher an seiner Kante liegt
            // (2 px), oder fast so nah (bis 3 px weiter) UND deutlich näher an seiner Mitte (unter ¾),
            // oder an Kante (bis 1 px) UND Mitte überhaupt näher (Leitern: sonst rutscht ein Name zum Nachbarn)
            const lx = (rect[0] + rect[2]) / 2, ly = (rect[1] + rect[3]) / 2;
            const ownCD = Math.hypot(lx - (ownBox[0] + ownBox[2]) / 2, ly - (ownBox[1] + ownBox[3]) / 2);
            let symHit = false, closer = false;
            if (mode < 2) {
              const reach = P.px(40);
              for (const o of syms) {
                if (o === sg) continue;
                if (trip && !forced.has(o.id)) continue; // Fahrt: nur ihre eigenen Halte zählen, der Rest ist abgeblendet
                const ob = o.box;
                if (ob[0] > rect[2] + reach || ob[2] < rect[0] - reach || ob[1] > rect[3] + reach || ob[3] < rect[1] - reach) continue;
                const dd = boxDist(rect, ob);
                if (dd < P.px(1)) { symHit = true; break; }
                const cd = Math.hypot(lx - (ob[0] + ob[2]) / 2, ly - (ob[1] + ob[3]) / 2);
                if (dd < ownD - P.px(2) || (dd < ownD + P.px(3) && cd < ownCD * 0.75)) closer = true;
                else if (dd < ownD + P.px(1) && cd < ownCD) closer = true; // Nachbar an Kante (bis 1 px) UND Mitte näher: mehrdeutig
              }
              if (symHit || routeHit(rect, mode === 1)) continue;
            }
            const cross = segCost(rect) + (mode === 2 && routeHit(rect, true) ? P.px(60) : 0);
            let cost = PREF[c.dir] * S * 0.35 + cross * 4 + (c.extra || 0);
            if (r <= 2 && cross > P.px(1)) cost += 1e4;           // Orte und Knoten: Linien kreuzen nur als letzte Wahl
            const fh = focusHit(rect);
            if (fh && !forced.has(sg.id)) continue;               // gewählte Linie bleibt frei von grauen Namen
            if (fh) cost += 1e4;
            for (const other of nb.get(sg.id) || []) {
              const od = placedDir.get(other);
              if (od) cost += od === c.dir ? -S * 0.8 : S * 0.3;
            }
            const cand = Object.assign({}, c, { cost, cross, amb: closer });
            if (closer) { if (!fallback || cost < fallback.cost) fallback = cand; continue; }
            if (!best || cost < best.cost) best = cand;
          }
          return { best, fallback };
        };
        let { best, fallback } = evalCands(cands, 0);
        if (phase === 1 && !best && !trip) return false;
        if (!best && !fallback && trip) ({ best, fallback } = evalCands(cands, 1));
        const mandatory = bigOf(sg) || dest.has(sg.id);
        const farCands = () => this._labelCands(sg, [own[0] - P.px(12), own[1] - P.px(12), own[2] + P.px(12), own[3] + P.px(12)], w, h, S, true)
          .map((c) => Object.assign(c, { leader: true, extra: (c.extra || 0) + S }));
        if (!best && fallback && !trip && (r <= 2 || forced.has(sg.id) || pol === "small" || mandatory)) {
          // Nur ein mehrdeutiger Platz frei? Lieber kurze Führungslinie (12 px) zu einem
          // eindeutigen Platz, solange sie nicht mehr Linien kreuzt
          const lead = evalCands(farCands(), 0).best;
          best = lead && lead.cross <= fallback.cross + P.px(2) ? lead : fallback;
        }
        if (!best && fallback && trip) best = fallback;
        if (!best && trip) {
          // Namen einer Fahrt sind Pflicht: notfalls über eine Linie oder
          // mit kurzer Führungslinie (höchstens 12 px)
          ({ best } = evalCands(cands, 2));
          if (!best) {
            const far = this._labelCands(sg, [own[0] - P.px(12), own[1] - P.px(12), own[2] + P.px(12), own[3] + P.px(12)], w, h, S, true)
              .map((c) => Object.assign(c, { leader: true, extra: (c.extra || 0) + S }));
            ({ best } = evalCands(far, 2));
          }
        }
        if (!best && mandatory) {
          // Linienenden, Bahnhöfe und große Umsteigezeichen sind Pflicht: kurze
          // Führungslinie (höchstens 12 px) zu einem freien Platz, nie auf ein fremdes Zeichen
          const res = evalCands(farCands(), 0);
          best = res.best || res.fallback;
        }
        // Tausch: rückt ein oder zwei Nachbarnamen an einen anderen freien Platz,
        // bekommt dieser Halt eine Lage aus dem Vorrat (accept prüft zusätzlich)
        // strict: auch dieser Name muss eindeutig bei seinem Halt liegen (verschobene Namen immer)
        const trySwap = (pool, accept, mayMove, strict) => {
          for (const c of pool) {
            if (accept && !accept(c)) continue;
            const blockers = [];
            for (let i = 0; i < labelRects.length; i++) {
              const lr = labelRects[i];
              if (overlap(c.rect, [lr[0] - P.px(3), lr[1] - P.px(2), lr[2] + P.px(3), lr[3] + P.px(2)]) > 0) blockers.push(i);
            }
            if (!blockers.length || blockers.length > 2 || blockers.some((i) => !labelRecs[i] || (mayMove && !mayMove(labelRecs[i])))) continue;
            const saved = blockers.map((i) => labelRects[i]);
            blockers.forEach((i) => { labelRects[i] = [-1e9, -1e9, -1e9, -1e9]; });
            const mine = evalCands([c], 0);
            const mc = mine.best || (strict ? null : mine.fallback);
            if (!mc) { blockers.forEach((i, j) => { labelRects[i] = saved[j]; }); continue; }
            labelRects.push(mc.rect); labelIds.push("__probe");
            const moved = [];
            let ok = true;
            for (const bi of blockers) {
              const rec = labelRecs[bi];
              const other = rec.evalC(rec.cands.filter((x) => !x.leader), 0);
              const oc = other.best; // ein verschobener Name bleibt eindeutig bei seinem Halt
              if (!oc) { ok = false; break; }
              labelRects[bi] = oc.rect; // für den nächsten Nachbarn schon belegt
              moved.push([bi, rec, oc]);
            }
            labelRects.pop(); labelIds.pop();
            if (!ok) { blockers.forEach((i, j) => { labelRects[i] = saved[j]; }); continue; }
            for (const [bi, rec, oc] of moved) {
              labelRects[bi] = oc.rect;
              this._moveText(rec.t, oc.rect, oc.align, oc.tip || rec.anchorTo);
              rec.sg.labelRect = oc.rect;
              if (oc.n) rec.sg.labelN = oc.n;
              placedDir.set(rec.sg.id, oc.dir);
            }
            return mc;
          }
          return null;
        };
        if (!best && mandatory) best = trySwap(cands.concat(farCands()), null, null, true); // Tausch nur für eindeutige Lagen: er verschiebt Nachbarn
        // alle gültigen Lagen einer Liste, die mit den wenigsten Linien darunter zuerst
        const fewest = (list) => list.map((c) => evalCands([c], 0).best).filter(Boolean)
          .map((c) => Object.assign(c, { nL: crossN(c.rect) })).sort((a, b) => a.nL - b.nL || a.cost - b.cost)[0] || null;
        if (!best && (cfg.dir) && (mandatory || r <= 2 || forced.has(sg.id))) {
          // die eigene Seite ist voll: eine andere Seite, möglichst über wenige Linien
          const anyC = this._labelCands(sg, own, w, h, S, pinned, true);
          const res = evalCands(anyC, 0);
          best = fewest(anyC) || res.fallback || trySwap(anyC, null, null, true);
          if (best) cands = anyC;
        }
        // Orte und Knoten: höchstens eine Linie kreuzen (sonst Führungslinie oder Platztausch mit einem kleinen Namen).
        // Nur Lagen, die eindeutig beim eigenen Halt bleiben: lieber über zwei Linien als neben dem falschen Halt.
        if (best && r <= 2 && !trip && crossN(best.rect) >= 2) {
          const low = (c) => crossN(c.rect) <= 1;
          // Führungslinie nur für Orte; Knoten (Rang 1) behalten ihren Namen direkt am Zeichen
          const pick = evalCands(cands.filter(low), 0).best || (r >= 2 ? evalCands(farCands().filter(low), 0).best : null);
          if (pick) best = pick;
          else {
            const sw = trySwap(cands.concat(r >= 2 ? farCands() : []), low, (rec) => ((this.LAY.rank || {})[rec.sg.id] || 3) >= 3 && !forced.has(rec.sg.id), true);
            if (sw) best = sw;
          }
        }
        // Lange Namen mit Leerzeichen: zweizeilig, wenn einzeilig nur ein Notbehelf bleibt
        // (kein Platz, Führungslinie, mehrdeutig oder über zwei und mehr Linien)
        if (!cfg.lines && !trip && (mandatory || r <= 2) && st.name.includes(" ") &&
            (!best || best.leader || best.amb || crossN(best.rect) >= 2)) {
          const words = st.name.split(" ");
          let split = null, sw = Infinity;
          for (let i = 1; i < words.length; i++) {
            if (NO_BREAK_AFTER.test(words[i - 1])) continue; // nie nach Artikel oder Präposition umbrechen
            const a = words.slice(0, i).join(" "), b = words.slice(i).join(" ");
            const m2 = Math.max(this._measure(cls, a), this._measure(cls, b));
            if (m2 < sw) { sw = m2; split = [a, b]; }
          }
          const w2 = split ? sw * S : 0, h2 = lh * 2 - (lh - S);
          let c2 = split ? this._labelCands(sg, own, w2, h2, S, pinned) : [];
          let b2 = split ? fewest(c2) : null;
          if (split && (!b2 || b2.nL > 1) && cfg.dir) { const a2 = this._labelCands(sg, own, w2, h2, S, pinned, true); const f2 = fewest(a2); if (f2 && (!b2 || f2.nL < b2.nL)) { b2 = f2; c2 = a2; } }
          if (b2 && b2.nL <= 1 && (!best || b2.nL < crossN(best.rect) || best.amb || best.leader)) {
            best = b2; linesTxt = split; w = w2; h = h2; cands = c2;
          }
        }
        if (!best) return true;
        // kleine Zoomstufe: ein Name quer über ein ganzes Bündel (drei und mehr Linien) wartet auf die nächste Stufe
        if (pol === "small" && !trip && crossCore(best.rect) >= 3) return true;
        if (pol === "opt" && best.cross > P.px(2)) return true;
        if (pol === "small" && best.cross > P.px(12) && !mandatory) return true;
        // Spiegellage für den Bildschirmrand: gleiche Regeln, andere Seite
        const MIRROR = { e: "w", w: "e", ne: "nw", nw: "ne", se: "sw", sw: "se" };
        let alt = null;
        if (!best.leader) {
          if (best.n) {
            const nn = [-best.n[0], -best.n[1]];
            alt = evalCands(cands.filter((c) => c.n && Math.abs(c.n[0] - nn[0]) < 1e-6 && Math.abs(c.n[1] - nn[1]) < 1e-6), 0).best;
          } else if (MIRROR[best.dir]) {
            alt = evalCands(cands.filter((c) => c.dir === MIRROR[best.dir] && !c.n), 0).best
              || evalCands(cands.filter((c) => (c.dir === "n" || c.dir === "s") && !c.n), 0).best;
          }
        }
        placedDir.set(sg.id, best.dir);
        if (best.n) sg.labelN = best.n;
        const anchorTo = best.tip || [(own[0] + own[2]) / 2, (own[1] + own[3]) / 2];
        if (best.leader) {
          const r0 = best.rect, oc = [(own[0] + own[2]) / 2, (own[1] + own[3]) / 2];
          const lp = [Math.max(r0[0], Math.min(r0[2], oc[0])), Math.max(r0[1], Math.min(r0[3], oc[1]))];
          const sp = [Math.max(own[0], Math.min(own[2], lp[0])), Math.max(own[1], Math.min(own[3], lp[1]))];
          el("line", { x1: f1(sp[0]), y1: f1(sp[1]), x2: f1(lp[0]), y2: f1(lp[1]), class: "leader", "stroke-width": f1(P.px(1)) }, L.labels);
        }
        const t = addText(sg.id, cls, S, linesTxt, best.rect, best.align, anchorTo);
        t.__prim = { rect: best.rect, align: best.align, n: best.n || null, anchorTo };
        if (alt) t.__alt = { rect: alt.rect, align: alt.align, n: alt.n || null, anchorTo: alt.tip || anchorTo };
        // weitere Lagen für den Bildschirmrand: frei von fremden Zeichen und der Route
        {
          const reach = P.px(40);
          const symFree = (r0) => {
            if (routeHit(r0, false)) return false;
            if (!forced.has(sg.id) && focusHit(r0)) return false;   // graue Namen nie auf hervorgehobene Linien
            for (const o of syms) {
              if (o === sg) continue;
              const ob = o.box;
              if (ob[0] > r0[2] + reach || ob[2] < r0[0] - reach || ob[1] > r0[3] + reach || ob[3] < r0[1] - reach) continue;
              if (boxDist(r0, ob) < P.px(1)) return false;
            }
            return true;
          };
          t.__cands = best.leader ? [] : cands.filter((c) => !c.leader && c.rect !== best.rect && symFree(c.rect))
            .map((c) => ({ rect: c.rect, align: c.align, n: c.n || null, anchorTo: c.tip || anchorTo }));
        }
        t.__S = S;
        this.labelEls.set(sg.id, t);
        sg.labelRect = best.rect;
        labelRects.push(best.rect); labelIds.push(sg.id);
        labelRecs.push({ sg, t, cands, evalC: evalCands, anchorTo });
        return true;
      };
      // Zuerst alle wichtigen Namen, die einen eindeutigen Platz finden; wer einen
      // Ausweg braucht (Rückfall, Führungslinie, Tausch), kommt danach. So nimmt
      // kein Notbehelf einem anderen wichtigen Namen den guten Platz.
      const important = (sg) => rankOf(sg.id) <= 2 || forced.has(sg.id) || bigOf(sg) || dest.has(sg.id);
      const later = [];
      for (const sg of order) if (important(sg) && !placeOne(sg, 1)) later.push(sg);
      for (const sg of later) placeOne(sg, 2);
      for (const sg of order) if (!important(sg)) placeOne(sg, 2);
      this._labelObstacles = labelRects.map((b) => b.concat([5])).concat(syms.map((sg) => sg.box.concat([6])));
    }

    // ── Liniennummern ───────────────────────────────────────────
    _drawBadges() {
      const m = this.model, P = this.P;
      const [hPx, fPx] = TYPE.plate[P.tier];
      const placed = [];
      const obstacles = (this._labelObstacles || []).slice();
      const segCost = this._segCost;
      const overlap = (a, b) => Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0])) * Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1]));
      const perLine = new Map();
      const hpx = P.px(hPx);
      this._plateEls = [];
      const order = m.linePaths.map((lp, li) => ({ lp, li, L: polyLen(m.lineGeo[li].pts) })).sort((a, b) => b.L - a.L);
      for (const { lp, li, L } of order) {
        const id = lp.line.id;
        const count = perLine.get(id) || 0;
        if (count >= (L > 1100 ? 2 : 1)) continue;
        if (L < hpx * 4) continue;
        const pts = m.lineGeo[li].pts;
        const label = lp.line.label || id;
        const w = P.px(8 + label.length * fPx * 0.64), h = hpx;
        let best = null, acc = 0;
        for (let i = 1; i < pts.length; i++) {
          const a = pts[i - 1], b = pts[i];
          const sl = Math.hypot(b[0] - a[0], b[1] - a[1]);
          for (let t = w * 0.7; t < sl - w * 0.7; t += Math.max(6, w * 0.4)) {
            const c = [a[0] + (b[0] - a[0]) * t / sl, a[1] + (b[1] - a[1]) * t / sl];
            const rect = [c[0] - w / 2, c[1] - h / 2, c[0] + w / 2, c[1] + h / 2];
            const along = acc + t;
            let near = false;
            for (const ob of obstacles) if (ob[4] === 5 && overlap(rect, [ob[0] - P.px(8), ob[1] - P.px(8), ob[2] + P.px(8), ob[3] + P.px(8)]) > 0) { near = true; break; }
            if (near) continue;
            let cost = segCost(rect, id, P.width * 0.3) * 4 / P.sc;
            for (const ob of obstacles) cost += overlap(rect, ob) * 2.5;
            for (const p of placed) cost += overlap(rect, p.rect) * 12;
            cost += Math.min(Math.min(along, L - along), 500) * 0.04;
            for (const p of placed) if (p.id === id && Math.hypot(p.c[0] - c[0], p.c[1] - c[1]) < 520) cost += 800;
            if (!best || cost < best.cost) best = { c, rect, cost };
          }
          acc += sl;
        }
        if (!best || best.cost > 160) continue;
        perLine.set(id, count + 1);
        placed.push({ id, c: best.c, rect: best.rect });
        const gb = el("g", { class: "badge", "data-line": id, transform: "translate(" + f1(best.c[0]) + " " + f1(best.c[1]) + ")" }, this.L.badges);
        el("rect", { x: f1(-w / 2), y: f1(-h / 2), width: f1(w), height: f1(h), rx: f1(P.px(2)), class: "badge-bg" }, gb);
        el("text", { class: "badge-tx", x: 0, y: f1(P.px(fPx * 0.37)), "text-anchor": "middle", "font-size": f1(P.px(fPx)) }, gb).textContent = label;
        gb.__c = [f1(best.c[0]), f1(best.c[1])];
        gb.__wh = [w / 2, h / 2];
        this._plateEls.push(gb);
        gb.addEventListener("click", (ev) => { if (this._dragged) return; ev.stopPropagation(); this.o.onSelectLine(id); });
      }
    }

    _applyColors() {
      const dark = this.dark;
      const land = dark ? "#161B1E" : "#FFFFFF";
      for (const [id, g] of this.lineEls || []) {
        let c = themedColor(this.colorOf(id), dark);
        if (id === "T1" || id === "T2" || id === "T3") c = dark ? "#E8ECED" : "#15171A";
        g.c = c;
        g.cSel = /^T[123]$/.test(id) ? c : plateColor(this.colorOf(id), dark); // gewählt: mindestens 4,5:1
        g.stroke.style.setProperty("--c", c);
        g.casing.style.setProperty("--c", c);
        const lab = rgbToOklab(hexToRgb(c));
        const edge = rgbToHex(oklabToRgb([Math.max(0, Math.min(1, lab[0] + (dark ? 0.16 : -0.2))), lab[1] * 1.05, lab[2] * 1.05]));
        g.stroke.style.setProperty("--edge", edge);
        g.stroke.classList.toggle("has-outline", contrast(c, land) < 3);
        g.bridges.forEach((b) => b.style.setProperty("--c", c));
      }
      if (!this.L) return;
      this.L.stations.querySelectorAll(".tick, .tick-ring").forEach((t) => {
        t.style.setProperty("--c", themedColor(this.colorOf(t.dataset.line), dark));
      });
      this.L.badges.querySelectorAll(".badge").forEach((b) => {
        const id = b.dataset.line;
        const c = /^T[123]$/.test(id) ? (dark ? "#E8ECED" : "#15171A") : plateColor(this.colorOf(id), dark);
        b.style.setProperty("--c", c);
        b.style.setProperty("--tc", onColor(c));
      });
    }

    // ── Zustand (Hervorhebung, Route, Fahrzeug) ─────────────────
    // Verbindung zeigen: Namen der Fahrt weichen Linie und Nadeln aus
    showRoute(legs, stationIds) {
      this.clearFx();
      this.st.route = legs;
      this.st.lines = null;
      this.st.stations = stationIds && stationIds.size ? stationIds : null;
      this.st.force = true;
      this.st.forced = new Set(stationIds || []);
      this._renderLevel(this.level, true);
      this.drawRoute(legs, false);
    }
    setFocus(lineIds, stationIds, force) {
      this.st.lines = lineIds && lineIds.size ? lineIds : null;
      this.st.stations = stationIds && stationIds.size ? stationIds : null;
      this.st.force = !!force;
      const newForced = new Set(stationIds || []);
      const changed = !sameSet(newForced, this.st.forced);
      this.st.forced = newForced;
      if (changed && this.level >= 0) {
        const veh = this.st.vehicle;
        this._renderLevel(this.level, true);
        if (veh) this.runVehicles(veh);
      } else this._reapplyFocus();
    }
    setHover(lineId) {
      this.st.hover = lineId || null;
      this._reapplyHover();
    }
    _reapplyFocus() {
      const lines = this.st.lines, stations = this.st.stations;
      const on = !!lines || this.st.force;
      this.svg.classList.toggle("has-focus", on);
      const few = on && lines && lines.size <= 3; // gewählte Linie: kräftiger und obenauf
      const P = this.P;
      for (const [id, g] of this.lineEls) {
        const f = on && lines && lines.has(id);
        g.stroke.classList.toggle("is-focus", !!f);
        g.casing.classList.toggle("is-focus", !!f);
        g.bridges.forEach((b) => b.classList.toggle("is-focus", !!f));
        const thick = !!(f && few);
        g.stroke.classList.toggle("is-sel", thick);
        if (g.c) g.stroke.style.setProperty("--c", thick ? g.cSel : g.c);
        for (const p of g.stroke.querySelectorAll("path.stroke, path.outline, path.rail, path.conn")) {
          if (!p.dataset.w) p.dataset.w = p.getAttribute("stroke-width");
          let w = thick ? +p.dataset.w * 1.6 : +p.dataset.w;
          if (thick && p.classList.contains("outline")) w = (+p.dataset.w - 1.6 * P.sc) * 1.6 + P.px(2);
          p.setAttribute("stroke-width", f1(w));
        }
        for (const p of g.casing.querySelectorAll("path.casing")) {
          if (!p.dataset.w) p.dataset.w = p.getAttribute("stroke-width");
          p.setAttribute("stroke-width", thick ? f1(+p.dataset.w * 1.6 + P.px(1)) : p.dataset.w);
        }
        if (thick) {
          g.stroke.parentNode.appendChild(g.stroke);
          g.slot.el.parentNode.appendChild(g.slot.el);
          g.casing.parentNode.appendChild(g.casing);
        }
      }
      for (const sgp of (this.slotEls || new Map()).values()) {
        if (sgp.lines.length < 2) { sgp.el.classList.remove("is-dim"); continue; }
        sgp.el.classList.toggle("is-dim", !!(on && !(lines && sgp.lines.some((id) => lines.has(id)))));
      }
      this.svg.classList.toggle("has-route", !!this.st.route);
      for (const [id, gEl] of this.stationEls) gEl.classList.toggle("is-trip", !!(this.st.route && stations && stations.has(id)));
      this.L.badges.querySelectorAll(".badge").forEach((b) => b.classList.toggle("is-focus", !!(on && lines && lines.has(b.dataset.line))));
      for (const [id, g] of this.stationEls) g.classList.toggle("is-focus", !!(stations && stations.has(id)));
      for (const [id, t] of this.labelEls) t.classList.toggle("is-focus", !!(stations && stations.has(id)));
    }
    _reapplyHover() {
      const id = this.st.hover;
      this.svg.classList.toggle("has-hover", !!id);
      for (const [lid, g] of this.lineEls) {
        g.stroke.classList.toggle("is-hover", lid === id);
        g.casing.classList.toggle("is-hover", lid === id);
      }
      for (const sgp of (this.slotEls || new Map()).values()) sgp.el.classList.toggle("is-hdim", !!(id && sgp.lines.length > 1 && !sgp.lines.includes(id)));
      this.L.badges.querySelectorAll(".badge").forEach((b) => b.classList.toggle("is-hover", b.dataset.line === id));
    }
    _reapplyState() {
      this._reapplyFocus();
      this._reapplyHover();
      if (this.st.route) this.drawRoute(this.st.route, true);
    }

    lineBox(lineId) {
      const m = this.model;
      let b = null;
      m.linePaths.forEach((lp, li) => {
        if (lp.line.id !== lineId) return;
        for (const p of m.lineGeo[li].pts) b = growBox(b, p);
        for (const sid of lp.stopSeq) {
          const sg = m.stationGeo.get(sid);
          if (sg && !sg.unused) { b = growBox(b, [sg.box[0], sg.box[1]]); b = growBox(b, [sg.box[2], sg.box[3]]); }
        }
      });
      if (b) { const pad = 60; b = [b[0] - pad, b[1] - pad * 0.6, b[2] + pad * 2.2, b[3] + pad * 0.6]; }
      return b;
    }
    stationBox(id) {
      const sg = this.model.stationGeo.get(id);
      if (!sg || sg.unused) return null;
      let b = sg.box.slice();
      if (sg.labelRect) b = [Math.min(b[0], sg.labelRect[0]), Math.min(b[1], sg.labelRect[1]), Math.max(b[2], sg.labelRect[2]), Math.max(b[3], sg.labelRect[3])];
      return b;
    }
    stationPoint(id) {
      const sg = this.model.stationGeo.get(id);
      return sg && !sg.unused ? sg.c : null;
    }
    // Rahmen um einen Halt und je Linie einen Nachbarhalt
    stationNeighborhoodBox(id) {
      const m = this.model;
      let b = null;
      const add = (sid) => { const sg = m.stationGeo.get(sid); if (sg && !sg.unused) { b = growBox(b, [sg.box[0], sg.box[1]]); b = growBox(b, [sg.box[2], sg.box[3]]); } };
      add(id);
      for (const lp of m.linePaths) {
        const i = lp.stopSeq.indexOf(id);
        if (i < 0) continue;
        if (i > 0) add(lp.stopSeq[i - 1]);
        if (i < lp.stopSeq.length - 1) add(lp.stopSeq[i + 1]);
      }
      return b;
    }
    linePathData(lineId) {
      const m = this.model;
      const out = [];
      m.linePaths.forEach((lp, li) => { if (lp.line.id === lineId) out.push({ d: m.lineGeo[li].d, lp, geo: m.lineGeo[li] }); });
      return out;
    }

    _nearestIdx(pts, p) {
      let bi = 0, bd = Infinity;
      for (let i = 0; i < pts.length; i++) {
        const d = (pts[i][0] - p[0]) ** 2 + (pts[i][1] - p[1]) ** 2;
        if (d < bd) { bd = d; bi = i; }
      }
      return bi;
    }
    subPath(lineId, a, b) {
      const m = this.model;
      for (let li = 0; li < m.linePaths.length; li++) {
        const lp = m.linePaths[li];
        if (lp.line.id !== lineId) continue;
        const ia = lp.stopSeq.indexOf(a), ib = lp.stopSeq.indexOf(b);
        if (ia < 0 || ib < 0 || Math.abs(ia - ib) !== 1) continue;
        const g = m.lineGeo[li];
        const P = g.pts;
        const idxOf = (id) => {
          const q = g.at.get(id);
          if (q) return this._nearestIdx(P, q);
          return lp.nodes[0] === id ? 0 : P.length - 1;
        };
        const i0 = idxOf(a), i1 = idxOf(b);
        let seg = P.slice(Math.min(i0, i1), Math.max(i0, i1) + 1).map((p) => [p[0], p[1], p[2] === 1 ? 1 : 0, p[3], p[4] || 0]);
        if (i0 > i1) seg = seg.reverse().map((p) => [p[0], p[1], p[2], -(p[3] || 0), p[4]]);
        // am Knoten Palma am Kreis enden
        const hubs = this.LAY.hubs || {};
        for (const [id, atStart] of [[a, true], [b, false]]) {
          if (!hubs[id]) continue;
          const sg = m.stationGeo.get(id);
          if (sg && seg.length > 1) seg = m.trimToCircle(seg, sg.c, (sg.r || 46) + 1, atStart);
        }
        return seg;
      }
      return null;
    }
    clearFx() {
      cancelAnimationFrame(this._vehRaf);
      this.st.route = null;
      this.st.vehicle = null;
      if (this.L) { this.L.fx.replaceChildren(); this.L.under.replaceChildren(); }
    }
    drawRoute(legs, redraw) {
      if (!redraw) this.clearFx();
      this.st.route = legs;
      const P = this.P;
      const fx = this.L.fx;
      fx.replaceChildren();
      const g = el("g", { class: "fx-route-g" }, fx);
      const all = [];
      legs.forEach((leg, k) => {
        let pts = [];
        for (let i = 1; i < leg.stops.length; i++) {
          const sp = this.subPath(leg.line, leg.stops[i - 1], leg.stops[i]);
          if (!sp) continue;
          pts = pts.length ? pts.concat(sp.slice(1)) : sp;
        }
        if (pts.length < 2) return;
        const d = this.model.pathD(pts, P.radius);
        const c = themedColor(this.colorOf(leg.line), this.dark);
        const gc = el("g", { style: "--c:" + c }, g);
        el("path", { d, class: "fx-route-casing", "stroke-width": f1(P.px(15)) }, gc);
        const pth = el("path", { d, class: "fx-route", "stroke-width": f1(P.px(9)) }, gc);
        all.push({ pth, delay: k * 0.7 });
      });
      // Start, Umstiege (nummeriert), Ziel
      const pin = (id, kind, num) => {
        const p = this.stationPoint(id); if (!p) return;
        const r = P.px(9);
        const gp = el("g", { class: "fx-pin-g" }, g);
        el("circle", { cx: f1(p[0]), cy: f1(p[1]), r: f1(r), class: kind === "end" ? "fx-pin" : "fx-pin-ring", "stroke-width": f1(P.px(2.5)) }, gp);
        if (num) el("text", { x: f1(p[0]), y: f1(p[1] + P.px(4)), "text-anchor": "middle", class: "fx-pin-tx", "font-size": f1(P.px(11)) }, gp).textContent = String(num);
      };
      // jeder Halt der Fahrt: weißer Punkt mit dunklem Rand
      const pinned = new Set([legs.length ? legs[0].stops[0] : null]);
      legs.forEach((leg) => pinned.add(leg.stops[0]));
      if (legs.length) pinned.add(legs[legs.length - 1].stops[legs[legs.length - 1].stops.length - 1]);
      const gs = el("g", { class: "fx-stops" }, g);
      legs.forEach((leg) => leg.stops.forEach((sid) => {
        if (pinned.has(sid)) return;
        const p = this.stationPoint(sid); if (!p) return;
        el("circle", { cx: f1(p[0]), cy: f1(p[1]), r: f1(P.px(2.5)), class: "fx-stop", "stroke-width": f1(P.px(1.5)) }, gs);
      }));
      if (legs.length) {
        pin(legs[0].stops[0], "start");
        for (let k = 1; k < legs.length; k++) pin(legs[k].stops[0], "xfer", k);
        pin(legs[legs.length - 1].stops[legs[legs.length - 1].stops.length - 1], "end");
      }
      if (!redraw && !reduceMotion()) {
        all.forEach(({ pth, delay }) => {
          const Ln = pth.getTotalLength();
          pth.style.strokeDasharray = Ln + " " + Ln;
          pth.style.strokeDashoffset = Ln;
          pth.getBoundingClientRect();
          pth.style.transition = "stroke-dashoffset .9s cubic-bezier(.3,.6,.2,1) " + delay + "s";
          pth.style.strokeDashoffset = "0";
        });
      }
    }
    // Ein Fahrzeug fährt die Linie einmal in Fahrtrichtung ab
    runVehicles(lineId) {
      cancelAnimationFrame(this._vehRaf);
      this.L.under.replaceChildren();
      this.st.vehicle = lineId;
      if (reduceMotion()) return;
      const P = this.P;
      const c = themedColor(this.colorOf(lineId), this.dark);
      const vs = [];
      this.linePathData(lineId).forEach(({ d }) => {
        const p = el("path", { d, fill: "none", stroke: "none" }, this.L.under);
        const Ln = p.getTotalLength();
        if (Ln < 20) return;
        const g = el("g", { style: "--c:" + c, class: "fx-veh" }, this.L.under);
        el("circle", { r: f1(P.px(7)), class: "fx-vehicle", "stroke-width": f1(P.px(3)) }, g);
        el("circle", { r: f1(P.px(2.6)), class: "fx-vehicle-core" }, g);
        vs.push({ p, g, Ln });
      });
      const T = 4200, t0 = performance.now();
      const ease = (u) => (u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2);
      const step = (now) => {
        const u = Math.max(0, Math.min(1, (now - t0) / T));
        for (const v of vs) {
          const q = v.p.getPointAtLength(v.Ln * ease(u));
          v.g.setAttribute("transform", "translate(" + f1(q.x) + " " + f1(q.y) + ")");
          if (u >= 1) { v.g.style.transition = "opacity .6s ease"; v.g.style.opacity = "0"; }
        }
        if (u < 1) this._vehRaf = requestAnimationFrame(step);
      };
      this._vehRaf = requestAnimationFrame(step);
    }

    // Auftakt: erst die Bahn, dann die Hauptlinien, dann der Rest
    intro(done) {
      if (reduceMotion()) { if (done) done(); return; }
      const hub = this.model.stationGeo.get("palma");
      const c = hub ? hub.c : [0, 0];
      const wave = (id) => {
        const l = this.lineById.get(id);
        if (/rail|metro|heritage/.test(l.mode || "")) return 0;
        const touchesPalma = l.paths.some((p) => p.includes("palma"));
        if (touchesPalma || l.group === "air") return 1;
        return 2;
      };
      const starts = [0, 0.55, 1.05], dur = [0.9, 0.9, 0.8];
      const paths = [];
      for (const [id, g] of this.lineEls) {
        const w = wave(id);
        for (const node of [g.casing, g.stroke]) {
          node.querySelectorAll("path").forEach((pth) => {
            if (pth.classList.contains("hit")) return;
            paths.push({ pth, w });
          });
        }
      }
      const layer = this.L;
      [layer.stations, layer.labels, layer.badges, layer.bridges, layer.hub].forEach((g) => { g.style.opacity = "0"; });
      paths.forEach(({ pth, w }) => {
        const Ln = pth.getTotalLength();
        const d = pth.getAttribute("d");
        const m = /^M(-?[\d.]+) (-?[\d.]+)/.exec(d);
        const start = m ? [+m[1], +m[2]] : c;
        const end = pth.getPointAtLength(Ln);
        const reverse = Math.hypot(start[0] - c[0], start[1] - c[1]) > Math.hypot(end.x - c[0], end.y - c[1]);
        const dashed = pth.getAttribute("stroke-dasharray");
        if (dashed) { pth.style.opacity = "0"; pth.style.transition = "opacity .5s ease " + (starts[w] + dur[w] * 0.6) + "s"; return; }
        pth.style.strokeDasharray = Ln + " " + Ln;
        pth.style.strokeDashoffset = reverse ? -Ln : Ln;
        pth.dataset.intro = "1";
        pth.style.transition = "stroke-dashoffset " + dur[w] + "s cubic-bezier(.45,.05,.25,1) " + starts[w] + "s";
      });
      this.svg.getBoundingClientRect();
      requestAnimationFrame(() => {
        paths.forEach(({ pth }) => { if (pth.dataset.intro) pth.style.strokeDashoffset = "0"; else pth.style.opacity = "1"; });
        [[layer.hub, 0.2], [layer.stations, 1.3], [layer.bridges, 1.4], [layer.labels, 1.5], [layer.badges, 1.8]].forEach(([g, t]) => {
          g.style.transition = "opacity .6s ease " + t + "s"; g.style.opacity = "1";
        });
      });
      setTimeout(() => {
        paths.forEach(({ pth }) => { pth.style.strokeDasharray = ""; pth.style.strokeDashoffset = ""; pth.style.transition = ""; pth.style.opacity = ""; delete pth.dataset.intro; });
        if (done) done();
      }, 2700);
    }

    // ── Kamera ──────────────────────────────────────────────────
    _viewSize() {
      const r = this.host.getBoundingClientRect();
      return [Math.max(1, r.width), Math.max(1, r.height)];
    }
    _apply() {
      this.vp.setAttribute("transform", "translate(" + this.tx.toFixed(2) + " " + this.ty.toFixed(2) + ") scale(" + this.k.toFixed(5) + ")");
      this._counterScale();
      this._edgeFade();
      this._geoScale();
      const lv = this._levelFor(this.k);
      if (lv !== this.level && !this._flying) {
        clearTimeout(this._lvT);
        this._lvT = setTimeout(() => {
          const l2 = this._levelFor(this.k);
          if (l2 !== this.level) { const veh = this.st.vehicle; this._renderLevel(l2, false); if (veh) this.runVehicles(veh); }
        }, 90);
      }
      if (this.o.onCamera) this.o.onCamera(this.k);
    }
    // Schrift und Schilder behalten ihre Bildschirmgröße, auch zwischen zwei Stufen
    _counterScale() {
      if (!this.P) return;
      const s = this.P.kRef / this.k;
      const key = Math.abs(s - 1) < 0.003 ? 1 : Math.round(s * 1000) / 1000;
      if (key === this._csState) return;
      this._csState = key;
      const sc = key === 1 ? "" : " scale(" + key + ")";
      for (const t of this._scaleEls) {
        const a = t.__a;
        t.setAttribute("transform", key === 1 ? "" : "translate(" + a[0] + " " + a[1] + ")" + sc + " translate(" + (-a[0]) + " " + (-a[1]) + ")");
      }
      for (const b of this._plateEls) b.setAttribute("transform", "translate(" + b.__c[0] + " " + b.__c[1] + ")" + sc);
    }
    // Namen und Schilder am Kartenrand (16 px) und hinter Knöpfen ausblenden
    _edgeFade() {
      if (!this.P || !this._scaleEls) return;
      const [W, H] = this._viewSize();
      const V = (this.o.visibleArea && this.o.visibleArea()) || { l: 0, t: 0, r: W, b: H, avoid: [] };
      const mg = 16, box = [V.l + mg, V.t + mg, V.r - mg, V.b - mg];
      const s = this.P.kRef / this.k, k = this.k, tx = this.tx, ty = this.ty;
      const out = (x0, y0, x1, y1) => {
        if (x0 < box[0] || y0 < box[1] || x1 > box[2] || y1 > box[3]) return true;
        for (const a of V.avoid || []) if (x1 > a[0] - 4 && x0 < a[2] + 4 && y1 > a[1] - 4 && y0 < a[3] + 4) return true;
        return false;
      };
      const outRect = (r, a) => {
        const X = (x) => ((x - a[0]) * s + a[0]) * k + tx, Y = (y) => ((y - a[1]) * s + a[1]) * k + ty;
        return out(X(r[0]), Y(r[1]), X(r[2]), Y(r[3]));
      };
      for (const t of this._scaleEls) {
        const r = t.__r, a = t.__a;
        if (!r) continue;
        let hide = outRect(r, a);
        if (t.__alt) {
          const prim = t.__prim, alt = t.__alt;
          if (!t.__onAlt && hide) {
            const aa = this._anchorOf(alt.rect, alt.anchorTo);
            if (!outRect(alt.rect, aa) && this._altFree(t, alt.rect, alt.anchorTo)) { this._swapLabel(t, true); hide = false; }
          } else if (t.__onAlt && hide) {
            // auch die Ersatzlage liegt draußen: zurück auf die Stammlage prüfen
            const pa = this._anchorOf(prim.rect, prim.anchorTo);
            if (!outRect(prim.rect, pa)) { this._swapLabel(t, false); hide = false; }
          } else if (t.__onAlt) {
            const pa = this._anchorOf(prim.rect, prim.anchorTo);
            if (!outRect(prim.rect, pa)) { this._swapLabel(t, false); hide = false; }
          }
        }
        if (hide && t.__cands && t.__cands.length) {
          // jede andere freie Lage im Bild probieren, bevor der Name ausgeblendet wird
          for (const c of t.__cands) {
            const ca = this._anchorOf(c.rect, c.anchorTo);
            if (!outRect(c.rect, ca) && this._altFree(t, c.rect, c.anchorTo)) {
              if (!t.__alt || t.__alt.rect !== c.rect) t.__alt = c;
              this._swapLabel(t, true); hide = false; break;
            }
          }
        }
        if (t.__edge !== hide) { t.__edge = hide; t.classList.toggle("is-edge", hide); }
      }
      // zwischen zwei Stufen wachsen Namen relativ zur Karte: Überlappungen auflösen
      const sc = (r, a) => [(r[0] - a[0]) * s + a[0], (r[1] - a[1]) * s + a[1], (r[2] - a[0]) * s + a[0], (r[3] - a[1]) * s + a[1]];
      const pad = this.P.px(1.5);
      const acc = [];
      // graue Namen bleiben auch beim Wachsen von hervorgehobenen Linien frei
      const fSegs = this.st.lines && !this.st.route && this._focusLines === this.st.lines ? this._focusSegs || [] : [];
      const lw = this.P.width * 0.5;
      const onFocus = (r) => {
        const R = [r[0] - lw, r[1] - lw, r[2] + lw, r[3] + lw];
        for (const g of fSegs) {
          if (Math.max(g[0], g[2]) < R[0] || Math.min(g[0], g[2]) > R[2] || Math.max(g[1], g[3]) < R[1] || Math.min(g[1], g[3]) > R[3]) continue;
          if (clipLen(g, R) > 0) return true;
        }
        return false;
      };
      for (const t of this._scaleEls) {
        if (!t.__r || t.__edge) { if (t.__crowd) { t.__crowd = false; t.classList.remove("is-crowd"); } continue; }
        let crowd = false;
        if (s > 1.001) {
          const r = sc(t.__r, t.__a);
          for (const q of acc) if (r[0] < q[2] + pad && r[2] > q[0] - pad && r[1] < q[3] + pad && r[3] > q[1] - pad) { crowd = true; break; }
          if (!crowd && fSegs.length && !t.classList.contains("is-focus") && onFocus(r)) crowd = true;
          if (!crowd) acc.push(r);
        }
        if (t.__crowd !== crowd) { t.__crowd = crowd; t.classList.toggle("is-crowd", crowd); }
      }
      for (const b of this._plateEls) {
        const c = b.__c, hw = b.__wh; if (!hw) continue;
        const cx = c[0] * k + tx, cy = c[1] * k + ty, ex = hw[0] * s * k, ey = hw[1] * s * k;
        const hide = out(cx - ex, cy - ey, cx + ex, cy + ey);
        if (b.__edge !== hide) { b.__edge = hide; b.classList.toggle("is-edge", hide); }
      }
    }
    // Namen an eine neue Lage setzen (beim Tausch); die Spiegellage entfällt
    _moveText(t, rect, align, anchorTo) {
      const tx = align === "start" ? rect[0] : align === "end" ? rect[2] : (rect[0] + rect[2]) / 2;
      t.setAttribute("text-anchor", align);
      const lh = t.__S * 1.12;
      Array.from(t.children).forEach((sp, i) => { sp.setAttribute("x", f1(tx)); sp.setAttribute("y", f1(rect[1] + t.__S * 0.8 + i * lh)); });
      t.__r = rect;
      t.__a = this._anchorOf(rect, anchorTo);
      t.__prim = { rect, align, n: null, anchorTo };
      t.__alt = null;
    }
    _anchorOf(rect, c) {
      return [f1(Math.max(rect[0], Math.min(rect[2], c[0]))), f1(Math.max(rect[1], Math.min(rect[3], c[1])))];
    }
    // Ist die Spiegellage frei von sichtbaren Namen?
    _altFree(t, rect0, anchorTo) {
      const pad = this.P.px(2), s = Math.max(1, this.P.kRef / this.k);
      const sc = (r, a) => [(r[0] - a[0]) * s + a[0], (r[1] - a[1]) * s + a[1], (r[2] - a[0]) * s + a[0], (r[3] - a[1]) * s + a[1]];
      const rect = sc(rect0, this._anchorOf(rect0, anchorTo || [(rect0[0] + rect0[2]) / 2, (rect0[1] + rect0[3]) / 2]));
      for (const o of this._scaleEls) {
        if (o === t || !o.__r || o.__edge || o.__crowd) continue;
        const r = sc(o.__r, o.__a);
        if (rect[0] < r[2] + pad && rect[2] > r[0] - pad && rect[1] < r[3] + pad && rect[3] > r[1] - pad) return false;
      }
      return true;
    }
    // Namen auf die andere Seite setzen (Strich klappt mit)
    _swapLabel(t, toAlt) {
      const L = toAlt ? t.__alt : t.__prim;
      const rect = L.rect, align = L.align;
      const tx = align === "start" ? rect[0] : align === "end" ? rect[2] : (rect[0] + rect[2]) / 2;
      t.setAttribute("text-anchor", align);
      const lh = t.__S * 1.12;
      Array.from(t.children).forEach((sp, i) => { sp.setAttribute("x", f1(tx)); sp.setAttribute("y", f1(rect[1] + t.__S * 0.8 + i * lh)); });
      t.__r = rect;
      t.__a = this._anchorOf(rect, L.anchorTo);
      t.__onAlt = toAlt;
      if (t.__tick && L.n) {
        const { el: tl, q, w0, TL } = t.__tick, n = L.n;
        tl.setAttribute("x1", f1(q[0] + n[0] * w0)); tl.setAttribute("y1", f1(q[1] + n[1] * w0));
        tl.setAttribute("x2", f1(q[0] + n[0] * TL)); tl.setAttribute("y2", f1(q[1] + n[1] * TL));
      }
      const s = this.P.kRef / this.k, a = t.__a;
      t.setAttribute("transform", Math.abs(s - 1) < 0.003 ? "" : "translate(" + a[0] + " " + a[1] + ") scale(" + (Math.round(s * 1000) / 1000) + ") translate(" + (-a[0]) + " " + (-a[1]) + ")");
    }
    worldBox() {
      const isl = this.LAY.island || [];
      let bb = null;
      for (const p of isl) bb = growBox(bb, p);
      for (const id in this.LAY.nodes) bb = growBox(bb, this.LAY.nodes[id]);
      return [bb[0] - 30, bb[1] - 30, bb[2] + 30, bb[3] + 30];
    }
    _computeFit() {
      const t = this._targetFor(this.worldBox(), 12, true);
      this._fitK = t.k;
    }
    _targetFor(box, pad, raw) {
      const [W, H] = this._viewSize();
      const ins = this.o.insets ? this.o.insets() : { l: 0, r: 0, t: 0, b: 0 };
      const aw = Math.max(80, W - ins.l - ins.r - 2 * pad), ah = Math.max(80, H - ins.t - ins.b - 2 * pad);
      const bw = Math.max(1, box[2] - box[0]), bh = Math.max(1, box[3] - box[1]);
      let k = Math.min(aw / bw, ah / bh);
      if (!raw) k = Math.max(this._minK(), Math.min(this._maxK(), k));
      const cx = (box[0] + box[2]) / 2, cy = (box[1] + box[3]) / 2;
      const sx = ins.l + pad + aw / 2, sy = ins.t + pad + ah / 2;
      return { k, tx: sx - cx * k, ty: sy - cy * k };
    }
    _minK() { return (this._fitK || 0.3) * 0.8; }
    _maxK() { return 5; }
    fit(animate) {
      this._computeFit();
      const t = this._targetFor(this.worldBox(), 12);
      this.flyTo(t, animate);
    }
    flyToBox(box, animate, pad, maxK) {
      const t = this._targetFor(box, pad == null ? 64 : pad);
      if (maxK && t.k > maxK) {
        const [W, H] = this._viewSize();
        const ins = this.o.insets ? this.o.insets() : { l: 0, r: 0, t: 0, b: 0 };
        const cx = (box[0] + box[2]) / 2, cy = (box[1] + box[3]) / 2;
        t.k = maxK;
        t.tx = ins.l + (W - ins.l - ins.r) / 2 - cx * maxK;
        t.ty = ins.t + (H - ins.t - ins.b) / 2 - cy * maxK;
      }
      this.flyTo(t, animate);
    }
    flyTo(t, animate) {
      cancelAnimationFrame(this._raf);
      this._flying = false;
      if (!animate || reduceMotion()) { this.k = t.k; this.tx = t.tx; this.ty = t.ty; this._apply(); return; }
      const k0 = this.k, x0 = this.tx, y0 = this.ty;
      const T = 760, t0 = performance.now();
      const lvT = this._levelFor(Math.max(this._minK(), Math.min(this._maxK(), t.k)));
      let swapped = lvT === this.level;
      this._dropPending();
      if (!swapped) this._pending = this._buildLevel(lvT);
      this._flying = true;
      const ease = (u) => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2);
      const [W, H] = this._viewSize();
      const c0 = [(W / 2 - x0) / k0, (H / 2 - y0) / k0];
      const c1 = [(W / 2 - t.tx) / t.k, (H / 2 - t.ty) / t.k];
      const step = (now) => {
        const u = Math.max(0, Math.min(1, (now - t0) / T)), e = ease(u);
        const k = Math.exp(Math.log(k0) + (Math.log(t.k) - Math.log(k0)) * e);
        const c = [c0[0] + (c1[0] - c0[0]) * e, c0[1] + (c1[1] - c0[1]) * e];
        this.k = k; this.tx = W / 2 - c[0] * k; this.ty = H / 2 - c[1] * k;
        this._apply();
        if (!swapped && u >= 0.45) {
          swapped = true;
          const veh = this.st.vehicle;
          if (this._pending && this._pending.level === lvT) { const p = this._pending; this._pending = null; this._activate(p, false); }
          else this._renderLevel(lvT, false);
          if (veh) this.runVehicles(veh);
        }
        if (u < 1) this._raf = requestAnimationFrame(step);
        else { this._flying = false; this._apply(); }
      };
      this._raf = requestAnimationFrame(step);
    }
    zoomBy(fct, animate, at) {
      const [W, H] = this._viewSize();
      const p = at || [W / 2, H / 2];
      const k = Math.max(this._minK(), Math.min(this._maxK(), this.k * fct));
      this.flyTo({ k, tx: p[0] - (p[0] - this.tx) * (k / this.k), ty: p[1] - (p[1] - this.ty) * (k / this.k) }, animate);
    }
    panBy(dx, dy, animate) { this.flyTo({ k: this.k, tx: this.tx + dx, ty: this.ty + dy }, animate); }

    _bindCamera() {
      const svg = this.svg;
      const pts = new Map();
      let start = null;
      svg.addEventListener("pointerdown", (e) => {
        if (e.button !== 0 && e.pointerType === "mouse") return;
        pts.set(e.pointerId, [e.clientX, e.clientY]);
        this._dragged = false;
        start = { k: this.k, tx: this.tx, ty: this.ty, pts: new Map(pts) };
        cancelAnimationFrame(this._raf);
        this._flying = false;
      });
      svg.addEventListener("pointermove", (e) => {
        if (!pts.has(e.pointerId)) return;
        pts.set(e.pointerId, [e.clientX, e.clientY]);
        const rect = svg.getBoundingClientRect();
        if (pts.size === 1 && start && start.pts.size === 1) {
          const p0 = start.pts.values().next().value, p = pts.values().next().value;
          const dx = p[0] - p0[0], dy = p[1] - p0[1];
          if (!this._dragged && Math.hypot(dx, dy) > 4) { this._dragged = true; svg.setPointerCapture(e.pointerId); svg.classList.add("is-dragging"); }
          if (this._dragged) { this.tx = start.tx + dx; this.ty = start.ty + dy; this._apply(); }
        } else if (pts.size === 2) {
          const [a, b] = [...pts.values()];
          if (!start || start.pts.size !== 2) { start = { k: this.k, tx: this.tx, ty: this.ty, pts: new Map(pts) }; return; }
          const [a0, b0] = [...start.pts.values()];
          const d0 = Math.hypot(b0[0] - a0[0], b0[1] - a0[1]), d1 = Math.hypot(b[0] - a[0], b[1] - a[1]);
          const m0 = [(a0[0] + b0[0]) / 2 - rect.left, (a0[1] + b0[1]) / 2 - rect.top];
          const m1 = [(a[0] + b[0]) / 2 - rect.left, (a[1] + b[1]) / 2 - rect.top];
          const k = Math.max(this._minK(), Math.min(this._maxK(), start.k * d1 / d0));
          const wx = (m0[0] - start.tx) / start.k, wy = (m0[1] - start.ty) / start.k;
          this.k = k; this.tx = m1[0] - wx * k; this.ty = m1[1] - wy * k;
          this._dragged = true;
          this._apply();
        }
      });
      const end = (e) => {
        pts.delete(e.pointerId);
        svg.classList.remove("is-dragging");
        start = pts.size ? { k: this.k, tx: this.tx, ty: this.ty, pts: new Map(pts) } : null;
        setTimeout(() => { if (!pts.size) this._dragged = false; }, 0);
      };
      svg.addEventListener("pointerup", end);
      svg.addEventListener("pointercancel", end);
      svg.addEventListener("wheel", (e) => {
        e.preventDefault();
        const rect = svg.getBoundingClientRect();
        const p = [e.clientX - rect.left, e.clientY - rect.top];
        const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
        const fct = Math.exp(-dy * (e.ctrlKey ? 0.01 : 0.0022));
        const k = Math.max(this._minK(), Math.min(this._maxK(), this.k * fct));
        this.tx = p[0] - (p[0] - this.tx) * (k / this.k);
        this.ty = p[1] - (p[1] - this.ty) * (k / this.k);
        this.k = k;
        cancelAnimationFrame(this._raf);
        this._flying = false;
        this._apply();
      }, { passive: false });
      svg.addEventListener("dblclick", (e) => {
        const rect = svg.getBoundingClientRect();
        this.zoomBy(e.shiftKey ? 1 / STEP : STEP, true, [e.clientX - rect.left, e.clientY - rect.top]);
      });
      svg.addEventListener("click", () => { if (!this._dragged) this.o.onBackground(); });
      let rz;
      window.addEventListener("resize", () => {
        clearTimeout(rz);
        rz = setTimeout(() => {
          const old = this._fitK;
          this._computeFit();
          if (old && Math.abs(this._fitK - old) / old > 0.02) this._renderLevel(this._levelFor(this.k), true);
        }, 120);
      });
    }
  }

  // Namensrechteck an einem Punkt in Richtung n (Strichende, Linienende)
  function anchorRects(E, n, w, h, P) {
    const ax = Math.abs(n[0]) > 0.3 ? Math.sign(n[0]) : 0, ay = Math.abs(n[1]) > 0.3 ? Math.sign(n[1]) : 0;
    const dir = (ay < 0 ? "n" : ay > 0 ? "s" : "") + (ax > 0 ? "e" : ax < 0 ? "w" : "");
    const y0 = ay < 0 ? E[1] - h : ay > 0 ? E[1] : E[1] - h / 2;
    if (ax === 0) {
      return [
        { dir, rect: [E[0] - w / 2, y0, E[0] + w / 2, y0 + h], align: "middle", extra: 0 },
        { dir, rect: [E[0] - P.px(3), y0, E[0] - P.px(3) + w, y0 + h], align: "start", extra: P.px(2) },
        { dir, rect: [E[0] + P.px(3) - w, y0, E[0] + P.px(3), y0 + h], align: "end", extra: P.px(2) }
      ];
    }
    const x0 = ax > 0 ? E[0] : E[0] - w;
    return [{ dir, rect: [x0, y0, x0 + w, y0 + h], align: ax > 0 ? "start" : "end", extra: 0 }];
  }
  function segDist(p, a, b) {
    const dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy;
    const t = L2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2)) : 0;
    return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
  }
  function growBox(b, p) {
    if (!b) return [p[0], p[1], p[0], p[1]];
    return [Math.min(b[0], p[0]), Math.min(b[1], p[1]), Math.max(b[2], p[0]), Math.max(b[3], p[1])];
  }
  function polyLen(pts) { let L = 0; for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); return L; }
  function sameSet(a, b) { if (a.size !== b.size) return false; for (const x of a) if (!b.has(x)) return false; return true; }
  // Länge eines Segments innerhalb eines Rechtecks (Liang–Barsky)
  function clipLen(s, R) {
    let t0 = 0, t1 = 1;
    const dx = s[2] - s[0], dy = s[3] - s[1];
    const p = [-dx, dx, -dy, dy], q = [s[0] - R[0], R[2] - s[0], s[1] - R[1], R[3] - s[1]];
    for (let i = 0; i < 4; i++) {
      if (p[i] === 0) { if (q[i] < 0) return 0; }
      else {
        const t = q[i] / p[i];
        if (p[i] < 0) { if (t > t1) return 0; if (t > t0) t0 = t; }
        else { if (t < t0) return 0; if (t < t1) t1 = t; }
      }
    }
    return Math.hypot(dx, dy) * (t1 - t0);
  }

  window.NetzMap = NetzMap;
  window.NetzColor = { themedColor, plateColor, onColor, contrast };
})();
