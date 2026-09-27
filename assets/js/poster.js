/*
 * Mallorca in Linien — Plakat A1 (841 × 594 mm, quer)
 * ---------------------------------------------------------------
 * Dieselbe Karte als ein einziges SVG über die ganze Breite. Titel und
 * Zeichenerklärung stehen im leeren Meer im Nordwesten, das
 * Halteverzeichnis mit Gitterfeldern im Meer unter der Westküste.
 * Das Suchgitter (A–L × 1–8) liegt nur im Meer. Maßstab 3 px = 1 mm;
 * beim Drucken skaliert das SVG auf A1, A3 oder A4.
 */
(function () {
  "use strict";

  const SVGNS = "http://www.w3.org/2000/svg";
  const el = (tag, attrs, parent) => {
    const n = document.createElementNS(SVGNS, tag);
    if (attrs) for (const k in attrs) if (attrs[k] != null) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  };
  const txt = (parent, x, y, s, attrs) => { const t = el("text", Object.assign({ x, y }, attrs || {}), parent); t.textContent = s; return t; };

  const MM = 3;                       // Pixel je Millimeter
  const W = 841 * MM, H = 594 * MM;   // A1 quer
  const M = 12 * MM;                  // Rand
  const MAP = { x: M, y: M, w: W - 2 * M, h: H - 2 * M };
  const COLS = "ABCDEFGHIJKL".split(""), ROWS = 8;

  function build(NET, LAY, opts) {
    const o = opts || {};
    const wrap = document.createElement("div");
    wrap.className = "poster";
    wrap.id = "poster";
    const inFrame = (() => { try { return window.top !== window.self; } catch (e) { return true; } })();
    wrap.innerHTML = '<div class="poster-bar"><a class="btn" href="#">Zurück zur Karte</a>' +
      (inFrame ? "" : '<button class="btn" type="button" data-svg>SVG herunterladen (A1)</button>') +
      '<p>Plakat A1 quer, 841 × 594 mm. Drucken: Strg oder Cmd + P, Papier A1, A3 oder A4 quer, randlos.</p>' +
      '<p class="poster-legal"><a href="https://sievert-lukas.github.io/apps/impressum/" target="_blank" rel="noopener">Impressum</a> · <a href="datenschutz.html">Datenschutz</a></p></div>' +
      '<div class="poster-stage"></div>';
    document.body.appendChild(wrap);
    const stage = wrap.querySelector(".poster-stage");
    const svg = el("svg", { class: "poster-svg", viewBox: "0 0 " + W + " " + H, role: "img", "aria-label": "Plakat: Mallorca in Linien, Liniennetz für Bus, Bahn und Metro" }, stage);
    el("rect", { x: 0, y: 0, width: W, height: H, class: "p-paper" }, svg);
    el("rect", { x: MAP.x, y: MAP.y, width: MAP.w, height: MAP.h, class: "p-sea" }, svg);

    // Suchgitter unter der Karte: die Insel deckt es ab, sichtbar bleibt es nur im Meer
    const cw = MAP.w / COLS.length, rh = MAP.h / ROWS;
    const grid = el("g", { class: "p-grid" }, svg);
    for (let i = 1; i < COLS.length; i++) el("line", { x1: MAP.x + i * cw, y1: MAP.y, x2: MAP.x + i * cw, y2: MAP.y + MAP.h }, grid);
    for (let j = 1; j < ROWS; j++) el("line", { x1: MAP.x, y1: MAP.y + j * rh, x2: MAP.x + MAP.w, y2: MAP.y + j * rh }, grid);
    // meerfarbene Flächen unter Titel, Zeichen und Verzeichnis: das Gitter läuft nicht durch die Schrift
    const under = el("g", { class: "p-under" }, svg);

    // Karte: unsichtbar in voller Plakatbreite aufbauen, dann einsetzen
    const host = document.createElement("div");
    host.style.cssText = "position:absolute;left:-20000px;top:0;width:" + MAP.w + "px;height:" + MAP.h + "px;";
    document.body.appendChild(host);
    const map = new window.NetzMap(host, NET, LAY, {
      insets: () => ({ l: 0, r: 0, t: 0, b: 0 }),
      visibleArea: () => ({ l: -1e6, t: -1e6, r: 1e6, b: 1e6, avoid: [] }) // auf dem Plakat nichts ausblenden
    });
    map.setTheme(false);
    map._renderLevel(map._levelFor(map.k), true);
    const inner = map.svg;
    inner.setAttribute("class", "netz-poster");
    inner.setAttribute("x", MAP.x); inner.setAttribute("y", MAP.y);
    inner.setAttribute("width", MAP.w); inner.setAttribute("height", MAP.h);
    inner.setAttribute("viewBox", "0 0 " + MAP.w + " " + MAP.h);
    svg.appendChild(inner);
    // der leere Wirt bleibt (unsichtbar), damit die Karte ihre Größe kennt

    // Rahmen und Gitterbeschriftung obenauf
    el("rect", { x: MAP.x, y: MAP.y, width: MAP.w, height: MAP.h, class: "p-frame" }, svg);
    const gl = el("g", { class: "p-gridlbl" }, svg);
    COLS.forEach((c, i) => { txt(gl, MAP.x + (i + 0.5) * cw, MAP.y + 7 * MM, c, { "text-anchor": "middle" }); txt(gl, MAP.x + (i + 0.5) * cw, MAP.y + MAP.h - 3 * MM, c, { "text-anchor": "middle" }); });
    for (let j = 0; j < ROWS; j++) { txt(gl, MAP.x + 3 * MM, MAP.y + (j + 0.5) * rh + 4, String(j + 1)); txt(gl, MAP.x + MAP.w - 3 * MM, MAP.y + (j + 0.5) * rh + 4, String(j + 1), { "text-anchor": "end" }); }

    // Weltkoordinaten (Rastereinheiten) → Plakat
    const toP = (gx, gy) => [MAP.x + (LAY.OX + gx * LAY.G) * map.k + map.tx, MAP.y + (LAY.OY + gy * LAY.G) * map.k + map.ty];
    const cellOf = (id) => {
      const p = map.stationPoint(id); if (!p) return "";
      const x = p[0] * map.k + map.tx, y = p[1] * map.k + map.ty;
      const ci = Math.max(0, Math.min(COLS.length - 1, Math.floor(x / cw))), rj = Math.max(0, Math.min(ROWS - 1, Math.floor(y / rh)));
      return COLS[ci] + (rj + 1);
    };

    // ── Titel und Zeichen im Meer im Nordwesten ──
    const side = el("g", { class: "p-side" }, svg);
    const [X, Y0] = toP(-19.6, -18.6);
    const COLW = 78 * MM;
    let y = Y0;
    const mk = el("g", { transform: "translate(" + X + " " + y + ") scale(3.2)" }, side);
    el("path", { d: "M2.5 17.5 17.5 2.5", class: "p-mark-line" }, mk);
    el("circle", { cx: 10, cy: 10, r: 5, class: "p-mark-ring" }, mk);
    y += 20 * 3.2 + 17 * MM;
    txt(side, X, y, "Mallorca", { class: "p-title" });
    y += 17 * MM;
    txt(side, X, y, "in Linien", { class: "p-title p-title-light" });
    y += 10 * MM;
    txt(side, X, y, "Liniennetz Bus · Bahn · Metro · Stand März 2026 · Fanprojekt", { class: "p-sub" });
    y += 11 * MM;

    const head = (s, x0, w0) => { el("line", { x1: x0, y1: y + 1.6 * MM, x2: x0 + w0, y2: y + 1.6 * MM, class: "p-rule" }, side); txt(side, x0, y, s, { class: "p-head" }); };
    const fam = LAY.families || {};
    const names = { rail: "Bahn und Metro", west: "Westen · Calvià, Andratx", tram: "Serra de Tramuntana", north: "Norden · Raiguer, Pla", east: "Osten · Llevant", south: "Süden · Migjorn", air: "Flughafen · Aerotib" };
    const famKeys = Object.keys(names);
    // zwei Spalten nebeneinander: Regionen links, Zeichen rechts
    const X2 = X + COLW + 10 * MM;
    head("REGIONEN", X, COLW);
    head("ZEICHEN", X2, COLW + 20 * MM);
    y += 7 * MM;
    const yKeys = y;
    famKeys.forEach((k, i) => {
      const cy = yKeys + i * 5.6 * MM;
      el("rect", { x: X, y: cy - 3.2 * MM, width: 3.6 * MM, height: 3.6 * MM, fill: fam[k] || "#111315" }, side);
      txt(side, X + 6 * MM, cy, names[k], { class: "p-item" });
    });
    let ys = yKeys;
    // Zeile = Zeichenhöhe + 2 mm, damit sich die Haltesymbole nicht berühren
    const sym = (draw, label, hMM) => {
      const rowH = Math.max(5.6, (hMM || 0) + 2) * MM;
      ys += (rowH - 5.6 * MM) / 2;
      const g = el("g", { transform: "translate(" + X2 + " " + (ys - 2 * MM) + ")" }, side);
      draw(g);
      txt(side, X2 + 20 * MM, ys, label, { class: "p-item" });
      ys += 5.6 * MM + (rowH - 5.6 * MM) / 2;
    };
    const line = (g, c, w, extra) => el("path", Object.assign({ d: "M0 0H" + 16 * MM, stroke: c, "stroke-width": w, fill: "none", "stroke-linecap": "round" }, extra || {}), g);
    sym((g) => line(g, "#111315", 7.5), "Bahn T1, T2, T3");
    sym((g) => line(g, fam.west || "#064D70", 5), "Buslinie, Farbe nach Region");
    sym((g) => line(g, "#534B97", 5, { "stroke-dasharray": "9 5.5", "stroke-linecap": "butt" }), "Rufbus, nur nach Anmeldung");
    sym((g) => line(g, "#737B80", 4.5, { "stroke-dasharray": ".1 7.5" }), "Anschluss Stadtbus EMT");
    sym((g) => { line(g, fam.east || "#C2790B", 5); el("path", { d: "M" + 8 * MM + " 0V-6.5", stroke: fam.east || "#C2790B", "stroke-width": 4 }, g); }, "Halt einer Linie");
    sym((g) => { line(g, "#7E5ACC", 5, { transform: "translate(0 -3.2)" }); line(g, "#A5307A", 5, { transform: "translate(0 3.2)" }); el("rect", { x: 8 * MM - 5, y: -9, width: 10, height: 18, rx: 5, fill: "#FFFFFF", stroke: "#111315", "stroke-width": 1.5 }, g); }, "Umsteigen", 6);
    sym((g) => { line(g, "#111315", 7.5); el("rect", { x: 8 * MM - 6, y: -7, width: 12, height: 14, rx: 6, fill: "#111315" }, g); el("path", { d: "M" + 8 * MM + " -3V3", stroke: "#FFFFFF", "stroke-width": 3, "stroke-linecap": "round" }, g); }, "Bahnhof", 4.7);
    sym((g) => { line(g, "#111315", 7.5); el("rect", { x: 8 * MM - 9, y: -9, width: 18, height: 18, rx: 5, fill: "#FFFFFF", stroke: "#111315", "stroke-width": 3 }, g); }, "Knoten: Inca, Manacor, Flughafen", 7);
    sym((g) => { el("circle", { cx: 8 * MM, cy: 0, r: 11, fill: "#FFFFFF", stroke: "#111315", "stroke-width": 3 }, g); }, "Palma, Estació Intermodal", 8.3);
    {
      const x0 = X - 4 * MM, y0 = Y0 - 3 * MM;
      const x1 = X2 + COLW + 24 * MM, y1 = Math.max(ys, yKeys + famKeys.length * 5.6 * MM) + 2 * MM;
      el("rect", { x: x0, y: y0, width: x1 - x0, height: y1 - y0, class: "p-sea" }, under);
    }

    // ── Halteverzeichnis im Meer unter der Westküste ──
    const ART = /^(s’|s'|sa |es |ses |so |el |la |les |l’|l')/i;
    const norm = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
    const used = new Set();
    for (const l of NET.lines) for (const p of l.paths) for (const s of p) used.add(s);
    const list = NET.stations.filter((s) => used.has(s.id)).sort((a, b) => norm(a.name.replace(ART, "")).localeCompare(norm(b.name.replace(ART, "")), "ca"));
    const [IX, IY] = toP(-20.2, 6.7);
    const [IXR] = toP(4.4, 0);
    const iy1 = MAP.y + MAP.h - 10 * MM;
    y = IY;
    head("HALTESTELLEN", IX, IXR - IX);
    const top = IY + 7 * MM;
    const avail = MAP.y + MAP.h - 16 * MM - top;   // bis über die Gitterbuchstaben und die Quelle
    let nCols = 6, lh = 3.55 * MM;
    const need = () => Math.ceil((list.length + list.filter((s) => s.name.length > 24).length) / nCols) * lh;
    while (need() > avail && nCols < 9) nCols++;
    while (need() > avail && lh > 3 * MM) lh -= 0.1 * MM;
    const colW = (IXR - IX) / nCols;
    // lange Namen umbrechen: zweite Zeile eingerückt, Gitterfeld in der letzten Zeile
    const rows = [];
    for (const s of list) {
      const name = s.name, ref = cellOf(s.id);
      if (name.length <= 24) { rows.push({ t: name, ref }); continue; }
      const cut = name.lastIndexOf(" – ") > 0 ? name.lastIndexOf(" – ") + 2 : name.lastIndexOf(" ", 22);
      rows.push({ t: name.slice(0, cut).trim(), ref: "" });
      rows.push({ t: name.slice(cut).trim(), ref, indent: true });
    }
    const perCol = Math.ceil(rows.length / nCols);
    rows.forEach((r, i) => {
      const cx = IX + Math.floor(i / perCol) * colW, cy = top + (i % perCol) * lh;
      txt(side, cx + (r.indent ? 3 * MM : 0), cy, r.t, { class: "p-idx", lang: "ca" });
      if (r.ref) txt(side, cx + colW - 5 * MM, cy, r.ref, { class: "p-idx p-idx-ref", "text-anchor": "end" });
    });
    const idxBottom = top + perCol * lh;

    // Quelle unter dem Verzeichnis
    const src = el("g", { class: "p-src" }, side);
    const sy = Math.min(MAP.y + MAP.h - 9 * MM, idxBottom + 4 * MM);
    txt(src, IX, sy, "Nach dem Netzplan der TIB – Transports de les Illes Balears, Edició març 2026. Fanprojekt, keine offizielle Auskunft. Fahrpläne und Tarife: tib.org");
    el("rect", { x: IX - 4 * MM, y: IY - 7 * MM, width: IXR - IX + 8 * MM, height: sy + 3 * MM - (IY - 7 * MM), class: "p-sea" }, under);

    // SVG herunterladen (nur außerhalb eingebetteter Ansichten)
    const dl = wrap.querySelector("[data-svg]");
    // Schriftdatei als data-URL, damit die SVG-Datei auch ohne Archivo auf dem Rechner (Druckerei) gleich aussieht
    const toB64 = (buf) => {
      const b = new Uint8Array(buf); let s = "";
      for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000));
      return btoa(s);
    };
    const exportCss = async () => {
      const parts = [];
      for (const ss of Array.from(document.styleSheets)) {
        let rules; try { rules = Array.from(ss.cssRules); } catch (e) { continue; }
        for (const r of rules) {
          const m = r.type === CSSRule.FONT_FACE_RULE && r.cssText.match(/url\(["']?([^"')]+)["']?\)/);
          if (m) {
            try {
              const res = await fetch(new URL(m[1], ss.href || location.href).href);
              parts.push(r.cssText.replace(m[0], 'url("data:font/woff2;base64,' + toB64(await res.arrayBuffer()) + '")'));
              continue;
            } catch (e) { /* ohne Einbettung weiter */ }
          }
          parts.push(r.cssText);
        }
      }
      return parts.join("\n");
    };
    if (dl) dl.addEventListener("click", async () => {
      const clone = svg.cloneNode(true);
      clone.setAttribute("xmlns", SVGNS);
      clone.setAttribute("width", "841mm");
      clone.setAttribute("height", "594mm");
      const st = document.createElementNS(SVGNS, "style");
      st.textContent = await exportCss();
      clone.insertBefore(st, clone.firstChild);
      const blob = new Blob([new XMLSerializer().serializeToString(clone)], { type: "image/svg+xml" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "mallorca-in-linien-A1.svg";
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    });

    if (o.onClose) wrap.querySelector(".poster-bar a").addEventListener("click", (e) => { e.preventDefault(); o.onClose(); });
    return { wrap, map };
  }

  window.NetzPoster = { build, size: { W, H, MM } };
})();
