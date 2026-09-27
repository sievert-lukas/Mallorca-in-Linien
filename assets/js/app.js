/*
 * Mallorca in Linien — Oberfläche
 * ---------------------------------------------------------------
 * Seitenleiste (Linien, Halte, Verbindung), Suche, Filter,
 * Detailansichten, Tastatur und Deep-Links (#l-301, #s-inca).
 */
(function () {
  "use strict";

  const NET = window.NETWORK, LAY = window.LAYOUT;
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const h = (tag, attrs, ...kids) => {
    const n = document.createElement(tag);
    if (attrs) for (const k in attrs) {
      const v = attrs[k];
      if (v === false || v == null) continue;
      if (k === "class") n.className = v;
      else if (k === "style" && typeof v === "object") Object.assign(n.style, v);
      else if (k.startsWith("on")) n.addEventListener(k.slice(2), v);
      else if (k === "html") n.innerHTML = v;
      else n.setAttribute(k, v === true ? "" : v);
    }
    for (const c of kids.flat()) if (c != null && c !== false) n.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    return n;
  };
  const reduceMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const norm = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[’']/g, "'").toLowerCase();
  const touch = window.matchMedia("(pointer: coarse)").matches;

  // Standbild-Modus für Bildschirmfotos (nur lokal): ?shot&wait=5000&theme=dark
  const SHOT = /[?&]shot\b/.test(location.search) && /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
  if (SHOT) {
    const ms = (location.search.match(/[?&]wait=(\d+)/) || [])[1] || 5000;
    const im = new Image(1, 1);
    im.alt = ""; im.style.cssText = "position:absolute;opacity:0;pointer-events:none";
    im.src = "/__delay?ms=" + ms;
    document.body.appendChild(im);
    const th = (location.search.match(/[?&]theme=(dark|light)/) || [])[1];
    if (th) document.documentElement.setAttribute("data-theme", th);
    if (/[?&]bare\b/.test(location.search)) document.body.classList.add("is-bare");
  }
  const BARE = SHOT && /[?&]bare\b/.test(location.search);

  // ── Grunddaten ───────────────────────────────────────────────
  const lineById = new Map(NET.lines.map((l) => [l.id, l]));
  const stationById = new Map(NET.stations.map((s) => [s.id, s]));
  const groupById = new Map(NET.groups.map((g) => [g.id, g]));
  const linesAt = new Map();
  for (const l of NET.lines) for (const p of l.paths) for (const s of p) {
    if (!linesAt.has(s)) linesAt.set(s, new Set());
    linesAt.get(s).add(l.id);
  }
  const lineStops = (l) => { const out = []; for (const p of l.paths) for (const s of p) if (!out.includes(s)) out.push(s); return out; };
  const isRailMode = (l) => /rail|metro|heritage|connection/.test(l.mode || "");
  const isSfm = (l) => l.mode === "rail";
  const lineLabel = (l) => l.label || l.id;
  const nameOf = (l) => l.name.replace(/ – /g, "\u00A0– "); // Strich nie am Zeilenanfang
  const lineOrder = new Map(NET.lines.map((l, i) => [l.id, i]));
  const sortLines = (ids) => Array.from(ids).sort((a, b) => lineOrder.get(a) - lineOrder.get(b));
  const baseColor = (l) => (LAY.colors && LAY.colors[l.id]) || l.color;

  // ── Zustand ──────────────────────────────────────────────────
  const state = {
    season: "all",
    modes: { rail: true, bus: true, air: true },
    line: null, station: null,
    route: { from: null, to: null, legs: null },
    tab: "lines", dark: false
  };
  function lineVisible(l) {
    const season = l.season || "all";
    if (state.season === "summer" && season === "winter") return false;
    if (state.season === "winter" && season === "summer") return false;
    if (l.group === "air") return state.modes.air;
    if (isRailMode(l)) return state.modes.rail;
    return state.modes.bus;
  }
  const visibleSet = () => new Set(NET.lines.filter(lineVisible).map((l) => l.id));

  // ── Thema ────────────────────────────────────────────────────
  const root = document.documentElement;
  const mqDark = window.matchMedia("(prefers-color-scheme: dark)");
  function storedTheme() { try { return localStorage.getItem("netz-theme"); } catch (e) { return null; } }
  function computeDark() {
    const attr = root.getAttribute("data-theme");
    if (attr === "dark") return true;
    if (attr === "light") return false;
    return mqDark.matches;
  }
  if (!root.getAttribute("data-theme")) {
    const t = storedTheme();
    if (t === "dark" || t === "light") root.setAttribute("data-theme", t);
  }

  // ── Karte ────────────────────────────────────────────────────
  const stage = $("#stage");
  const panel = $("#panel");
  const isNarrow = () => window.matchMedia("(max-width: 820px)").matches;
  const insets = () => {
    if (BARE) return { l: 0, r: 0, t: 0, b: 0 };
    const r = panel.getBoundingClientRect();
    if (isNarrow()) return { l: 8, r: 8, t: 16, b: Math.max(0, window.innerHeight - r.top) + 8 };
    return { l: r.right + 24, r: 76, t: 24, b: 24 };
  };
  let map;
  // sichtbare Kartenfläche (ohne Leiste und Blatt) und Knöpfe, hinter denen keine Namen stehen
  let vaCache = null, vaTime = 0;
  const visibleArea = () => {
    const now = performance.now();
    if (vaCache && now - vaTime < 250) return vaCache;
    const W = window.innerWidth, H = window.innerHeight;
    if (BARE) return (vaCache = { l: 0, t: 0, r: W, b: H, avoid: [] });
    const pr = panel.getBoundingClientRect();
    const avoid = [];
    const tools = $(".tools");
    if (tools) { const r = tools.getBoundingClientRect(); if (r.width) avoid.push([r.left, r.top, r.right, r.bottom]); }
    const hn = $("#hint");
    if (hn && !hn.hidden && hn.style.opacity !== "0") { const r = hn.getBoundingClientRect(); if (r.width) avoid.push([r.left, r.top, r.right, r.bottom]); }
    vaTime = now;
    vaCache = isNarrow() ? { l: 0, t: 0, r: W, b: pr.top, avoid } : { l: pr.right, t: 0, r: W, b: H, avoid };
    return vaCache;
  };
  const refreshEdges = () => { vaCache = null; if (map) { map._edgeState = null; map._edgeFade(); } };

  // ── Tooltip ──────────────────────────────────────────────────
  const tip = $("#tip");
  let tipXY = [0, 0];
  stage.addEventListener("pointermove", (e) => {
    const r = stage.getBoundingClientRect();
    tipXY = [e.clientX - r.left, e.clientY - r.top];
    if (tip.classList.contains("is-on")) placeTip();
  });
  function placeTip() { tip.style.left = tipXY[0] + "px"; tip.style.top = tipXY[1] + "px"; }
  function showTip(id) {
    const l = lineById.get(id);
    if (!l || touch) { tip.classList.remove("is-on"); return; }
    tip.replaceChildren(badge(l, "sm"), h("span", null, nameOf(l)));
    placeTip();
    tip.classList.add("is-on");
  }
  function hideTip() { tip.classList.remove("is-on"); }

  // ── Bausteine ────────────────────────────────────────────────
  function lineColor(l) { return window.NetzColor.themedColor(baseColor(l), state.dark); }
  function badge(l, size) {
    const b = h("span", { class: "lb" + (size ? " " + size : "") + (isSfm(l) ? " is-rail" : "") }, lineLabel(l));
    if (!isSfm(l)) {
      const c = window.NetzColor.plateColor(baseColor(l), state.dark);
      b.style.setProperty("--c", c);
      b.style.setProperty("--tc", window.NetzColor.onColor(c));
    }
    return b;
  }
  const ICON = {
    sun: '<svg class="ico" viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="3.2"/><path d="M10 2.5v2M10 15.5v2M2.5 10h2M15.5 10h2M4.7 4.7l1.4 1.4M13.9 13.9l1.4 1.4M4.7 15.3l1.4-1.4M13.9 6.1l1.4-1.4"/></svg>',
    snow: '<svg class="ico" viewBox="0 0 20 20" aria-hidden="true"><path d="M10 2.5v15M3.5 6.25l13 7.5M3.5 13.75l13-7.5M7.8 3.8 10 6l2.2-2.2M7.8 16.2 10 14l2.2 2.2"/></svg>',
    back: '<svg class="ico" viewBox="0 0 20 20" aria-hidden="true"><path d="M12.5 4 6.5 10l6 6"/></svg>',
    target: '<svg class="ico" viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="5.5"/><path d="M10 2v3M10 15v3M2 10h3M15 10h3"/></svg>',
    from: '<svg class="ico" viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="5"/></svg>',
    to: '<svg class="ico" viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="5" fill="currentColor"/></svg>'
  };
  const icon = (name) => h("span", { class: "season", html: ICON[name] });
  function seasonText(l) {
    if (l.season === "summer") return "Sommerlinie";
    if (l.season === "winter") return "Winterlinie";
    return "ganzjährig";
  }
  // Umsteige-Schilder: Bahn zuerst, höchstens acht, Rest als Zahl
  function transferBadges(ids) {
    const sorted = ids.slice().sort((a, b) => (isSfm(lineById.get(b)) - isSfm(lineById.get(a))) || lineOrder.get(a) - lineOrder.get(b));
    const shown = sorted.slice(0, 8).map((x) => badge(lineById.get(x), "sm"));
    if (sorted.length > 8) shown.push(h("span", { class: "more" }, "+" + (sorted.length - 8)));
    return shown;
  }
  function stationSymbol(rail) {
    return rail
      ? '<svg width="32" height="20" viewBox="0 0 32 20" aria-hidden="true"><rect x="1" y="1" width="30" height="18" rx="9" fill="var(--pill-edge)"/><path d="M9 10h14" stroke="var(--pill)" stroke-width="4" stroke-linecap="round"/></svg>'
      : '<svg width="32" height="20" viewBox="0 0 32 20" aria-hidden="true"><rect x="2" y="2" width="28" height="16" rx="8" fill="var(--pill)" stroke="var(--pill-edge)" stroke-width="2.4"/></svg>';
  }

  // ── Linienliste ──────────────────────────────────────────────
  const groupsEl = $("#groups");
  function renderLines() {
    groupsEl.replaceChildren();
    for (const g of NET.groups) {
      const ls = NET.lines.filter((l) => l.group === g.id);
      if (!ls.length) continue;
      const ul = h("ul", { class: "lines" });
      for (const l of ls) {
        const off = !lineVisible(l);
        const meta = lineStops(l).length + " Halte" + (l.demand ? " · Rufbus" : "") + (l.season === "summer" ? " · Sommer" : l.season === "winter" ? " · Winter" : "");
        const row = h("button", {
          class: "line-row" + (off ? " is-off" : ""), type: "button", "data-line": l.id,
          "aria-label": "Linie " + lineLabel(l) + ": " + l.name + ", " + meta + (off ? ", ausgeblendet" : ""),
          onclick: () => selectLine(l.id, { fly: true, from: "list" }),
          onmouseenter: () => hoverLine(l.id, "list"),
          onmouseleave: () => hoverLine(null, "list"),
          onfocus: () => hoverLine(l.id, "list"),
          onblur: () => hoverLine(null, "list")
        },
          badge(l),
          h("span", null, h("span", { class: "name" }, nameOf(l)), h("br"), h("span", { class: "meta" }, meta)),
          l.season === "summer" ? icon("sun") : l.season === "winter" ? icon("snow") : h("span")
        );
        ul.appendChild(h("li", null, row));
      }
      const fam = h("i", { class: "fam", "aria-hidden": "true" });
      const fc = (LAY.families || {})[g.id];
      if (fc) fam.style.setProperty("--c", g.id === "rail" ? "var(--ink)" : window.NetzColor.themedColor(fc, state.dark));
      groupsEl.appendChild(h("section", { class: "group", "aria-label": g.name },
        h("h2", null, h("span", null, fam, g.name), h("span", null, String(ls.length))), ul));
    }
  }

  // ── Halte A–Z ────────────────────────────────────────────────
  const ART = /^(s’|s'|sa |es |ses |so |el |la |les |l’|l')/i;
  const sortKey = (name) => norm(name.replace(ART, ""));
  function renderStops() {
    const list = NET.stations.filter((s) => linesAt.has(s.id)).slice()
      .sort((a, b) => sortKey(a.name).localeCompare(sortKey(b.name), "ca"));
    const out = [];
    let cur = "", ul = null;
    for (const s of list) {
      const L = sortKey(s.name)[0].toUpperCase();
      if (L !== cur) { cur = L; out.push(h("h2", { class: "letter" }, L)); ul = h("ul", { class: "az" }); out.push(ul); }
      const ids = sortLines(linesAt.get(s.id));
      ul.appendChild(h("li", null, h("button", {
        class: "stop-row", type: "button", onclick: () => selectStation(s.id, { fly: true, from: "list" }),
        "aria-label": s.name + ", " + ids.length + (ids.length === 1 ? " Linie" : " Linien") + ": " + ids.map((i) => lineLabel(lineById.get(i))).join(", ")
      }, h("span", { class: "nm", lang: "ca" }, s.name), h("span", { class: "bdg" }, transferBadges(ids)))));
    }
    $("#az").replaceChildren(...out);
  }

  // ── Ansichten ────────────────────────────────────────────────
  const tabs = $$(".tab");
  function showView(id, focus) {
    for (const v of ["view-lines", "view-stops", "view-route", "view-detail"]) {
      const node = document.getElementById(v);
      const on = v === id;
      if (on && node.hidden) { node.classList.remove("is-entering"); void node.offsetWidth; node.classList.add("is-entering"); }
      node.hidden = !on;
    }
    panel.classList.toggle("is-detail", id === "view-detail");
    if (focus) document.getElementById(id).focus({ preventScroll: true });
  }
  function selectTab(name, focus) {
    state.tab = name;
    tabs.forEach((t) => {
      const on = t.id === "tab-" + name;
      t.setAttribute("aria-selected", on ? "true" : "false");
      t.tabIndex = on ? 0 : -1;
    });
    showView("view-" + name);
    if (focus) document.getElementById("tab-" + name).focus();
  }
  tabs.forEach((t, i) => {
    t.addEventListener("click", () => {
      const name = t.id.replace("tab-", "");
      if (state.line || state.station) clearSelection(true);
      selectTab(name);
      if (name === "route" && state.route.legs) drawRouteOnMap();
      else if (name !== "route") { map.clearFx(); map.setFocus(null, null); }
    });
    t.addEventListener("keydown", (e) => {
      if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
      e.preventDefault();
      const n = tabs[(i + (e.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length];
      n.click(); n.focus();
    });
  });

  // ── Hervorhebung ─────────────────────────────────────────────
  function hoverLine(id, from) {
    if (!state.line && !state.station && !(state.tab === "route" && state.route.legs)) map.setHover(id);
    if (from === "map") { if (id) showTip(id); else hideTip(); }
    $$(".line-row").forEach((r) => r.classList.toggle("is-hover", r.dataset.line === id));
  }
  const live = $("#live");
  const announce = (t) => { live.textContent = ""; setTimeout(() => { live.textContent = t; }, 30); };

  function clearSelection(silent) {
    state.line = null; state.station = null;
    map.clearFx();
    map.setFocus(null, null);
    $$(".line-row").forEach((r) => r.removeAttribute("aria-current"));
    if (!silent) {
      selectTab(state.tab === "detail" ? "lines" : state.tab);
      if (state.tab === "route" && state.route.legs) drawRouteOnMap();
      setHash("");
    }
  }
  function setHash(t) {
    try {
      if (t) history.replaceState(null, "", "#" + t);
      else history.replaceState(null, "", location.pathname + location.search);
    } catch (e) { /* Rahmen erlaubt es nicht */ }
  }
  function detailBar(symbol, title, sub) {
    return h("div", { class: "detail-bar" },
      h("button", { class: "back", type: "button", "aria-label": "Zurück zur Übersicht", onclick: () => clearSelection(), html: ICON.back }),
      symbol,
      h("h2", null, title, sub ? h("span", { class: "sub" }, sub) : null));
  }

  // ── Linie ────────────────────────────────────────────────────
  function selectLine(id, opt) {
    opt = opt || {};
    const l = lineById.get(id);
    if (!l) return;
    dropHint();
    if (!lineVisible(l)) {
      if (l.season === "summer" && state.season === "winter") state.season = "all";
      if (l.season === "winter" && state.season === "summer") state.season = "all";
      if (l.group === "air") state.modes.air = true; else if (isRailMode(l)) state.modes.rail = true; else state.modes.bus = true;
      syncFilterUi(); applyFilter(true);
    }
    state.line = id; state.station = null;
    const stops = lineStops(l);
    map.setHover(null); hideTip();
    map.clearFx();
    map.setFocus(new Set([id]), new Set(stops));
    if (opt.fly) { const b = map.lineBox(id); if (b) map.flyToBox(b, true, 64); }
    setTimeout(() => { if (state.line === id) map.runVehicles(id); }, opt.fly ? 780 : 0);
    $$(".line-row").forEach((r) => r.toggleAttribute("aria-current", r.dataset.line === id));
    renderLineDetail(l);
    showView("view-detail", opt.from === "list");
    if (isNarrow()) setSheet("mid");
    setHash("l-" + id.toLowerCase());
    announce("Linie " + lineLabel(l) + " ausgewählt: " + l.name + ", " + stops.length + " Halte.");
  }

  function renderLineDetail(l) {
    const v = $("#view-detail");
    const stops = lineStops(l);
    const c = lineColor(l);
    const bar = detailBar(badge(l, "lg"), nameOf(l), null);
    const facts = h("p", { class: "facts" },
      h("span", null, h("b", null, String(stops.length)), " Halte"),
      h("span", null, l.season === "summer" ? icon("sun") : l.season === "winter" ? icon("snow") : null, seasonText(l)),
      h("span", null, groupById.get(l.group).name),
      l.operator ? h("span", null, l.operator) : null);
    const notes = (l.notes || []).length ? h("div", { class: "note" }, l.notes.map((t) => h("p", null, t))) : null;
    const actions = h("div", { class: "actions" },
      h("button", { class: "btn", type: "button", onclick: () => { const b = map.lineBox(l.id); if (b) map.flyToBox(b, true, 64); map.runVehicles(l.id); } }, h("span", { html: ICON.target }), "Auf der Karte zeigen"));
    const branches = h("div");
    l.paths.forEach((p, i) => {
      const ul = h("ul", { class: "strip" + (l.demand ? " is-demand" : "") });
      ul.style.setProperty("--c", isSfm(l) ? "var(--ink)" : c);
      p.forEach((sid, k) => {
        if (i > 0 && k === 0) return;
        const s = stationById.get(sid);
        const others = sortLines(linesAt.get(sid) || []).filter((x) => x !== l.id);
        const isEnd = k === 0 || k === p.length - 1;
        const req = (l.request || []).includes(sid);
        ul.appendChild(h("li", { class: isEnd ? "is-end" : "" },
          h("span", { class: "dot", "aria-hidden": "true" }),
          h("button", { type: "button", onclick: () => selectStation(sid, { fly: true, from: "list" }), "aria-label": s.name + (others.length ? ", Umsteigen zu " + others.map((x) => lineLabel(lineById.get(x))).join(", ") : "") + (req ? ", nur bei Bedarf" : "") },
            h("span", { class: "st-name", lang: "ca" }, s.name),
            req ? h("span", { class: "st-req" }, "nur bei Bedarf") : null,
            others.length ? h("span", { class: "xfer" }, transferBadges(others)) : null)));
      });
      const title = i === 0 ? (l.paths.length > 1 ? "Hauptweg" : "Haltefolge") : "Abzweig ab " + stationById.get(p[0]).name;
      branches.appendChild(h("section", { class: "strip-branch" }, h("p", { class: "eyebrow" }, title), ul));
    });
    v.replaceChildren(bar, facts, notes || "", actions, branches);
    v.scrollTop = 0;
  }

  // ── Halt ─────────────────────────────────────────────────────
  function selectStation(id, opt) {
    opt = opt || {};
    const s = stationById.get(id);
    if (!s) return;
    dropHint();
    state.station = id; state.line = null;
    const ids = sortLines(linesAt.get(id) || []);
    const vis = ids.filter((x) => lineVisible(lineById.get(x)));
    map.setHover(null); hideTip();
    map.clearFx();
    map.setFocus(new Set(vis), new Set([id]));
    if (opt.fly) {
      const b = map.stationNeighborhoodBox(id) || map.stationBox(id);
      if (b) map.flyToBox(b, true, 80, 3.2);
    }
    renderStationDetail(s, ids);
    showView("view-detail", opt.from === "list");
    if (isNarrow()) setSheet("mid");
    setHash("s-" + id);
    announce(s.name + ": " + ids.length + (ids.length === 1 ? " Linie" : " Linien") + ".");
  }

  function renderStationDetail(s, ids) {
    const v = $("#view-detail");
    const rail = ids.some((x) => /rail|metro|heritage/.test(lineById.get(x).mode || ""));
    const bar = detailBar(h("span", { class: "st-sym", html: stationSymbol(rail) }), h("span", { lang: "ca" }, s.name), s.sub || (rail ? "Bahnhof" : null));
    const facts = h("p", { class: "facts" }, h("span", null, h("b", null, String(ids.length)), ids.length === 1 ? " Linie hält hier" : " Linien halten hier"));
    const actions = h("div", { class: "actions" },
      h("button", { class: "btn", type: "button", onclick: () => startRoute(s.id, null) }, h("span", { html: ICON.from }), "Von hier"),
      h("button", { class: "btn", type: "button", onclick: () => startRoute(null, s.id) }, h("span", { html: ICON.to }), "Hierher"));
    const ul = h("ul", { class: "lines" });
    for (const id of ids) {
      const l = lineById.get(id);
      ul.appendChild(h("li", null, h("button", {
        class: "line-row" + (lineVisible(l) ? "" : " is-off"), type: "button", "data-line": id,
        onclick: () => selectLine(id, { fly: true, from: "list" }),
        onmouseenter: () => map.setHover(id),
        onmouseleave: () => map.setHover(null)
      }, badge(l), h("span", null, h("span", { class: "name" }, nameOf(l)), h("br"), h("span", { class: "meta" }, lineStops(l).length + " Halte")),
        l.season === "summer" ? icon("sun") : l.season === "winter" ? icon("snow") : h("span"))));
    }
    v.replaceChildren(bar, facts, actions, h("section", { class: "group" }, h("h2", null, h("span", null, "Linien an diesem Halt"), h("span", null, String(ids.length))), ul));
    v.scrollTop = 0;
  }

  // ── Suche ────────────────────────────────────────────────────
  const index = [];
  for (const s of NET.stations) if (linesAt.has(s.id)) index.push({ kind: "station", id: s.id, text: s.name, key: norm(s.name + " " + (s.sub || "")) });
  for (const l of NET.lines) index.push({ kind: "line", id: l.id, text: l.name, key: norm(lineLabel(l) + " " + l.name) });
  function search(q, kinds) {
    q = norm(q.trim());
    if (!q) return [];
    const out = [];
    for (const it of index) {
      if (kinds && !kinds.includes(it.kind)) continue;
      let score = -1;
      if (it.kind === "line" && norm(lineLabel(lineById.get(it.id))) === q) score = 0;
      else if (it.key.startsWith(q)) score = 1;
      else if (it.key.split(/[\s–\-/]+/).some((w) => w.startsWith(q))) score = 2;
      else if (it.key.includes(q)) score = 3;
      if (score >= 0) out.push({ it, score });
    }
    out.sort((a, b) => a.score - b.score || (a.it.kind === b.it.kind ? a.it.text.localeCompare(b.it.text) : a.it.kind === "station" ? -1 : 1));
    return out.slice(0, 9).map((x) => x.it);
  }
  function combobox(input, listEl, kinds, onPick) {
    let items = [], act = -1;
    const close = () => { listEl.hidden = true; input.setAttribute("aria-expanded", "false"); input.removeAttribute("aria-activedescendant"); act = -1; };
    const render = () => {
      items = search(input.value, kinds);
      listEl.replaceChildren();
      if (!items.length) { close(); return; }
      items.forEach((it, i) => {
        const li = h("li", { id: listEl.id + "-o" + i, role: "option", "aria-selected": i === act ? "true" : "false", onmousedown: (e) => { e.preventDefault(); pick(i); } });
        if (it.kind === "line") li.append(badge(lineById.get(it.id), "sm"), h("span", null, nameOf(lineById.get(it.id))), h("span", { class: "kind" }, "Linie"));
        else {
          const ids = sortLines(linesAt.get(it.id));
          li.append(h("span", { lang: "ca" }, it.text), h("span", { class: "kind" }, ids.length + (ids.length === 1 ? " Linie" : " Linien")));
        }
        listEl.appendChild(li);
      });
      listEl.hidden = false;
      input.setAttribute("aria-expanded", "true");
    };
    const pick = (i) => { const it = items[i]; if (!it) return; close(); onPick(it); };
    const move = (d) => {
      if (listEl.hidden) render();
      if (!items.length) return;
      act = (act + d + items.length) % items.length;
      $$("li", listEl).forEach((li, i) => li.setAttribute("aria-selected", i === act ? "true" : "false"));
      input.setAttribute("aria-activedescendant", listEl.id + "-o" + act);
      const node = document.getElementById(listEl.id + "-o" + act); if (node) node.scrollIntoView({ block: "nearest" });
    };
    input.addEventListener("input", () => { act = -1; render(); });
    input.addEventListener("focus", () => { if (input.value) render(); });
    input.addEventListener("blur", () => setTimeout(close, 120));
    input.addEventListener("keydown", (e) => {
      if (e.key === "ArrowDown") { e.preventDefault(); move(1); }
      else if (e.key === "ArrowUp") { e.preventDefault(); move(-1); }
      else if (e.key === "Enter") { if (!listEl.hidden && items.length) { e.preventDefault(); pick(act >= 0 ? act : 0); } }
      else if (e.key === "Escape") { close(); }
    });
  }
  const q = $("#q");
  combobox(q, $("#q-list"), null, (it) => {
    q.value = "";
    if (it.kind === "line") selectLine(it.id, { fly: true, from: "list" });
    else selectStation(it.id, { fly: true, from: "list" });
  });

  // ── Filter ───────────────────────────────────────────────────
  function syncFilterUi() {
    $$(".seg [data-season]").forEach((b) => b.setAttribute("aria-pressed", b.dataset.season === state.season ? "true" : "false"));
    $$(".toggle[data-mode]").forEach((b) => b.setAttribute("aria-pressed", state.modes[b.dataset.mode] ? "true" : "false"));
  }
  function applyFilter(quiet) {
    const vis = visibleSet();
    map.setFilter({ visible: vis, season: state.season });
    if (state.line) { map.setFocus(new Set([state.line]), new Set(lineStops(lineById.get(state.line)))); }
    else if (state.station) map.setFocus(new Set(sortLines(linesAt.get(state.station)).filter((x) => vis.has(x))), new Set([state.station]));
    else if (state.tab === "route" && state.route.legs) drawRouteOnMap();
    renderLines();
    if (!quiet) announce(vis.size + " von " + NET.lines.length + " Linien sichtbar.");
  }
  $$(".seg [data-season]").forEach((b) => b.addEventListener("click", () => { state.season = b.dataset.season; syncFilterUi(); applyFilter(); }));
  $$(".toggle[data-mode]").forEach((b) => b.addEventListener("click", () => {
    const m = b.dataset.mode;
    state.modes[m] = !state.modes[m];
    if (!state.modes.rail && !state.modes.bus && !state.modes.air) state.modes[m] = true;
    syncFilterUi(); applyFilter();
  }));

  // ── Verbindung ───────────────────────────────────────────────
  const fromIn = $("#from"), toIn = $("#to");
  combobox(fromIn, $("#from-list"), ["station"], (it) => { state.route.from = it.id; fromIn.value = it.text; maybeRoute(); });
  combobox(toIn, $("#to-list"), ["station"], (it) => { state.route.to = it.id; toIn.value = it.text; maybeRoute(); });
  $("#swap").addEventListener("click", () => {
    [state.route.from, state.route.to] = [state.route.to, state.route.from];
    fromIn.value = state.route.from ? stationById.get(state.route.from).name : "";
    toIn.value = state.route.to ? stationById.get(state.route.to).name : "";
    maybeRoute();
  });
  $("#route-form").addEventListener("submit", (e) => {
    e.preventDefault();
    for (const [inp, key] of [[fromIn, "from"], [toIn, "to"]]) {
      if (!state.route[key] || stationById.get(state.route[key]).name !== inp.value) {
        const r = search(inp.value, ["station"]);
        state.route[key] = r.length ? r[0].id : null;
        if (r.length) inp.value = r[0].text;
      }
    }
    maybeRoute();
  });
  function startRoute(from, to) {
    if (from) { state.route.from = from; fromIn.value = stationById.get(from).name; }
    if (to) { state.route.to = to; toIn.value = stationById.get(to).name; }
    clearSelection(true);
    selectTab("route");
    if (isNarrow()) setSheet("mid");
    if (!(state.route.from && state.route.to)) (state.route.from ? toIn : fromIn).focus();
    maybeRoute();
  }
  function findRoute(a, b) {
    if (a === b) return [];
    const adj = new Map();
    for (const l of NET.lines) {
      if (!lineVisible(l)) continue;
      for (const p of l.paths) for (let i = 1; i < p.length; i++) {
        for (const [x, y] of [[p[i - 1], p[i]], [p[i], p[i - 1]]]) {
          if (!adj.has(x)) adj.set(x, []);
          adj.get(x).push({ to: y, line: l.id });
        }
      }
    }
    const dist = new Map(), prev = new Map();
    const key = (s, l) => s + "|" + (l || "");
    const pq = [{ s: a, l: null, c: 0 }];
    dist.set(key(a, null), 0);
    let best = null;
    while (pq.length) {
      pq.sort((x, y) => x.c - y.c);
      const cur = pq.shift();
      if (cur.c > dist.get(key(cur.s, cur.l))) continue;
      if (cur.s === b) { best = cur; break; }
      for (const e of adj.get(cur.s) || []) {
        const c = cur.c + (cur.l === e.line ? 0 : 1000) + 1;
        const k2 = key(e.to, e.line);
        if (!dist.has(k2) || c < dist.get(k2)) { dist.set(k2, c); prev.set(k2, key(cur.s, cur.l)); pq.push({ s: e.to, l: e.line, c }); }
      }
    }
    if (!best) return null;
    const seq = [];
    let k = key(best.s, best.l);
    while (k) { const [s, l] = k.split("|"); seq.unshift({ s, l: l || null }); k = prev.get(k); }
    const legs = [];
    for (let i = 1; i < seq.length; i++) {
      const st = seq[i], last = legs[legs.length - 1];
      if (!last || last.line !== st.l) legs.push({ line: st.l, stops: [seq[i - 1].s, st.s] });
      else last.stops.push(st.s);
    }
    return legs;
  }
  function directionName(l, leg) {
    for (const p of l.paths) {
      const i = p.indexOf(leg.stops[0]), j = p.indexOf(leg.stops[1]);
      if (i >= 0 && j >= 0) return stationById.get(j > i ? p[p.length - 1] : p[0]).name;
    }
    return stationById.get(leg.stops[leg.stops.length - 1]).name;
  }
  function maybeRoute() {
    const out = $("#route-out");
    const { from, to } = state.route;
    const empty = (t) => { state.route.legs = null; out.replaceChildren(h("p", { class: "route-empty" }, t)); map.clearFx(); map.setFocus(null, null); };
    if (!from || !to) return empty("Start und Ziel wählen. Gezeigt wird die Verbindung mit den wenigsten Umstiegen.");
    const legs = findRoute(from, to);
    if (legs === null) return empty("Mit den eingeblendeten Linien gibt es keine Verbindung. Filter lockern oder andere Halte wählen.");
    if (!legs.length) return empty("Start und Ziel sind derselbe Halt.");
    state.route.legs = legs;
    const nStops = legs.reduce((a, l) => a + l.stops.length - 1, 0);
    const summary = h("p", { class: "summary" },
      h("span", null, h("b", null, String(legs.length - 1)), legs.length - 1 === 1 ? " Umstieg" : " Umstiege"),
      h("span", null, h("b", null, String(nStops)), " Halte Fahrt"));
    const ol = h("ol", { class: "legs" });
    legs.forEach((leg, i) => {
      const l = lineById.get(leg.line);
      const n = leg.stops.length - 1;
      const li = h("li", { class: "leg" },
        i === 0 ? h("span", { class: "dot", "aria-hidden": "true" }) : h("span", { class: "num", "aria-hidden": "true" }, String(i)),
        h("div", { class: "leg-body" },
          i > 0 ? h("span", { class: "xfer-note" }, "Umstieg " + i) : null,
          h("span", { class: "from", lang: "ca" }, stationById.get(leg.stops[0]).name),
          h("span", { class: "ride" }, badge(l, "sm"), "Richtung " + directionName(l, leg) + " · " + n + (n === 1 ? " Halt" : " Halte"))));
      li.style.setProperty("--c", isSfm(l) ? "var(--ink)" : lineColor(l));
      ol.appendChild(li);
    });
    const endId = legs[legs.length - 1].stops[legs[legs.length - 1].stops.length - 1];
    ol.appendChild(h("li", { class: "leg-end" }, h("span", { class: "dot", "aria-hidden": "true" }), h("b", { lang: "ca" }, stationById.get(endId).name)));
    out.replaceChildren(summary, ol);
    drawRouteOnMap(true);
    announce("Verbindung von " + stationById.get(from).name + " nach " + stationById.get(to).name + ": " + (legs.length - 1) + " Umstiege.");
  }
  function drawRouteOnMap(fly) {
    const legs = state.route.legs;
    if (!legs) return;
    dropHint();
    const stops = new Set(); legs.forEach((l) => l.stops.forEach((s) => stops.add(s)));
    map.showRoute(legs, stops);
    if (fly) {
      let b = null;
      stops.forEach((s) => { const p = map.stationPoint(s); if (p) b = b ? [Math.min(b[0], p[0]), Math.min(b[1], p[1]), Math.max(b[2], p[0]), Math.max(b[3], p[1])] : [p[0], p[1], p[0], p[1]]; });
      if (b) map.flyToBox([b[0] - 60, b[1] - 60, b[2] + 160, b[3] + 60], true, 64, 2.4);
    }
  }

  // ── Werkzeuge, Tastatur, Hinweis ─────────────────────────────
  const hint = $("#hint");
  $("#hint-text").textContent = touch
    ? "Linie oder Halt antippen für Details. Mit zwei Fingern zoomen."
    : "Linie oder Halt anklicken für Details. Mausrad oder + und − zoomen.";
  function dropHint() {
    if (!hint || hint.hidden) return;
    hint.style.opacity = "0";
    setTimeout(() => { hint.hidden = true; refreshEdges(); }, 300);
  }
  $("#hint-close").addEventListener("click", dropHint);
  setTimeout(dropHint, 10000);
  stage.addEventListener("wheel", dropHint, { once: true, passive: true });

  $("#zoom-in").addEventListener("click", () => map.zoomBy(1.6, true));
  $("#zoom-out").addEventListener("click", () => map.zoomBy(1 / 1.6, true));
  $("#zoom-fit").addEventListener("click", () => map.fit(true));
  stage.addEventListener("keydown", (e) => {
    const step = 96, k = e.key;
    if (k === "ArrowLeft") map.panBy(step, 0, true);
    else if (k === "ArrowRight") map.panBy(-step, 0, true);
    else if (k === "ArrowUp") map.panBy(0, step, true);
    else if (k === "ArrowDown") map.panBy(0, -step, true);
    else if (k === "+" || k === "=") map.zoomBy(1.6, true);
    else if (k === "-" || k === "_") map.zoomBy(1 / 1.6, true);
    else if (k === "0") map.fit(true);
    else if (k === "Escape") clearSelection();
    else return;
    e.preventDefault();
  });
  document.addEventListener("keydown", (e) => {
    const a = document.activeElement;
    if (e.key === "Escape" && (state.line || state.station) && !(a && a.tagName === "INPUT")) clearSelection();
    if (e.key === "/" && !(a && a.tagName === "INPUT")) { e.preventDefault(); q.focus(); }
  });

  // Thema
  const themeBtn = $("#theme");
  function syncThemeBtn() {
    themeBtn.setAttribute("aria-pressed", state.dark ? "true" : "false");
    themeBtn.setAttribute("aria-label", state.dark ? "Helle Darstellung einschalten" : "Dunkle Darstellung einschalten");
  }
  function onThemeChange() {
    state.dark = computeDark();
    if (!map) return;
    map.setTheme(state.dark);
    renderLines(); renderStops();
    if (state.line) renderLineDetail(lineById.get(state.line));
    if (state.station) renderStationDetail(stationById.get(state.station), sortLines(linesAt.get(state.station)));
    if (state.tab === "route" && state.route.legs) maybeRoute();
    syncThemeBtn();
  }
  themeBtn.addEventListener("click", () => {
    const next = state.dark ? "light" : "dark";
    root.setAttribute("data-theme", next);
    try { localStorage.setItem("netz-theme", next); } catch (e) { /* egal */ }
  });
  if (mqDark.addEventListener) mqDark.addEventListener("change", () => { if (!root.getAttribute("data-theme")) onThemeChange(); });
  new MutationObserver(() => onThemeChange()).observe(root, { attributes: true, attributeFilter: ["data-theme"] });

  // Blatt (schmale Bildschirme)
  function setSheet(mode) {
    panel.classList.toggle("is-full", mode === "full");
    panel.classList.toggle("is-min", mode === "min");
    setTimeout(refreshEdges, 340);
  }
  $("#grip").addEventListener("click", () => {
    if (panel.classList.contains("is-full")) setSheet("min");
    else if (panel.classList.contains("is-min")) setSheet("mid");
    else setSheet("full");
  });
  (function sheetDrag() {
    const grip = $("#grip");
    let y0 = null, h0 = 0;
    grip.addEventListener("pointerdown", (e) => { if (!isNarrow()) return; y0 = e.clientY; h0 = panel.getBoundingClientRect().height; grip.setPointerCapture(e.pointerId); panel.style.transition = "none"; });
    grip.addEventListener("pointermove", (e) => { if (y0 == null) return; panel.style.height = Math.max(150, h0 + (y0 - e.clientY)) + "px"; });
    grip.addEventListener("pointerup", (e) => {
      if (y0 == null) return;
      const dy = y0 - e.clientY; y0 = null;
      panel.style.transition = ""; panel.style.height = "";
      if (Math.abs(dy) < 6) return;
      const H = window.innerHeight, hh = h0 + dy;
      setSheet(hh > H * 0.7 ? "full" : hh < H * 0.34 ? "min" : "mid");
    });
  })();

  // ── Deep-Link ────────────────────────────────────────────────
  // Plakat A1: eigene Ansicht unter #poster
  let poster = null;
  function showPoster() {
    if (!window.NetzPoster) return;
    if (!poster) poster = window.NetzPoster.build(NET, LAY, { onClose: () => { setHash(""); hidePoster(); } });
    poster.wrap.hidden = false;
    document.body.classList.add("is-poster");
  }
  function hidePoster() {
    if (poster) poster.wrap.hidden = true;
    document.body.classList.remove("is-poster");
  }
  function fromHash() {
    const t = decodeURIComponent((location.hash || "").slice(1));
    if (t !== "poster") hidePoster();
    if (!t) return false;
    if (t === "poster") { showPoster(); return true; }
    if (t.startsWith("l-")) {
      const l = NET.lines.find((x) => x.id.toLowerCase() === t.slice(2));
      if (l) { selectLine(l.id, { fly: true }); return true; }
    }
    if (t.startsWith("s-") && stationById.has(t.slice(2))) { selectStation(t.slice(2), { fly: true }); return true; }
    return false;
  }
  window.addEventListener("hashchange", fromHash);
  window.addEventListener("resize", () => setTimeout(refreshEdges, 200));

  // ── Start ────────────────────────────────────────────────────
  function boot() {
    if (isNarrow()) setSheet("min");
    map = new window.NetzMap(stage, NET, LAY, {
      insets,
      visibleArea,
      onSelectLine: (id) => selectLine(id, { fly: true, from: "map" }),
      onSelectStation: (id) => selectStation(id, { fly: true, from: "map" }),
      onHoverLine: (id, on) => hoverLine(on ? id : null, "map"),
      onBackground: () => { if (state.line || state.station) clearSelection(); }
    });
    if (SHOT) window.__map = map; // nur für Prüfungen
    state.dark = computeDark();
    map.setTheme(state.dark);
    syncThemeBtn();
    renderLines();
    renderStops();
    maybeRoute();
    const veil = $("#veil");
    requestAnimationFrame(() => {
      veil.classList.add("is-gone");
      setTimeout(() => veil.remove(), 500);
      // Telefon: mit der Umgebung von Palma beginnen, lesbar statt winzig
      if (isNarrow() && !location.hash) {
        const g = (x, y) => [LAY.OX + x * LAY.G, LAY.OY + y * LAY.G];
        const a = g(-5, -9), b = g(6, 4.5);
        map.flyToBox([a[0], a[1], b[0], b[1]], false, 8);
      }
      const linked = fromHash();
      if (!linked && !SHOT) map.intro();
      if (SHOT) {
        const vw = location.search.match(/[?&]view=(-?[\d.]+),(-?[\d.]+),(-?[\d.]+),(-?[\d.]+)/);
        if (vw) map.flyToBox([+vw[1], +vw[2], +vw[3], +vw[4]], false, 0, 99);
        const fs = location.search.match(/[?&]from=([a-z0-9-]+)&to=([a-z0-9-]+)/);
        if (fs) startRoute(fs[1], fs[2]);
        const tb = location.search.match(/[?&]tab=(lines|stops|route)/);
        if (tb) selectTab(tb[1]);
        if (/[?&]nohint\b/.test(location.search)) { hint.hidden = true; }
      }
    });
  }
  const fontsReady = document.fonts && document.fonts.ready ? Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 1800))]) : Promise.resolve();
  fontsReady.then(boot);
})();
