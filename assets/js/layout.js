/*
 * Mallorca in Linien — Schema-Geometrie
 * ---------------------------------------------------------------
 * Alle Halte liegen auf einem Raster von 70 px (G), Ursprung = Palma.
 * Diagonalen verlaufen exakt 45°, alle anderen Kanten 0°/90°.
 *
 * grid:   Halte und Wegpunkte in Rastereinheiten [gx, gy]
 *         (Wegpunkte beginnen mit "w:"; y wächst nach Süden)
 * routes: Weg zwischen zwei aufeinanderfolgenden Halten, falls er
 *         über Wegpunkte oder an fremden Halten vorbei führt
 * edges:  Knickart einzelner Kanten: mode "sd" (erst gerade, dann
 *         diagonal) oder "ds"; "via" = Zwischenpunkte (Rastereinheiten)
 * labels: Lage des Namens (n, ne, e, se, s, sw, w, nw) und Umbruch
 * rank:   1 = Knoten, 2 = Ort, 3 = kleiner Halt
 */
(function () {
  const G = 70, OX = 1000, OY = 1200;

  const grid = {
    // ── Palma ─────────────────────────────────────────────────
    "palma": [0, 0],

    // ── Westen: Küste der Bucht ──────────────────────────────
    "cala-major": [-2, 2],
    "sant-agusti": [-3, 2],
    "cas-catala": [-4, 2],
    "illetes": [-5, 2],
    "bendinat": [-6, 2],
    "portals-nous": [-7, 2],
    "son-caliu": [-8, 2],
    "palmanova": [-9, 2],
    "magaluf": [-9, 3],
    "cala-vinyes": [-9, 4],
    "sol-de-mallorca": [-9, 5],
    "son-ferrer": [-10, 3],
    "el-toro": [-11, 4],
    "nova-santa-ponca": [-12, 3],
    "santa-ponca": [-12, 2],
    "costa-de-la-calma": [-13, 3],
    "peguera": [-14, 2],
    "camp-de-mar": [-15, 2],
    "andratx": [-16, 1],
    "port-andratx": [-17, 2],
    "sarraco": [-18, 1],
    "sant-elm": [-19, 1],
    "galatzo": [-12, 1],
    "son-bugadelles": [-12, -1],
    "calvia": [-12, -2],
    "es-capdella": [-13, -2],
    // Westküste Tramuntana
    "estellencs": [-16, -3],
    "banyalbufar": [-15, -4],
    "la-granja": [-10, -3],
    "esporles": [-8, -4],
    "puigpunyent": [-6, -1],
    "galilea": [-7, -1],

    "w:t1": [-1, 0],
    "w:t2": [-3, 0],
    "w:t3": [-4, 0],
    "w:t4": [-10, 0],
    "w:t5": [-11, 0],
    "w:t6": [-15, 0],
    "w:201": [-2, -1],
    "w:a11": [-10, 2],
    "w:lg": [-11, -4],

    // ── Norden von Palma ─────────────────────────────────────
    "son-espases": [-1.5, -1.5],
    "uib": [-3, -3],
    "parcbit": [-4, -3],
    "sesgleieta": [-3, -4],
    "valldemossa": [-3, -5],
    "deia": [-1, -7],
    "soller": [0, -7],
    "port-soller": [0, -8],
    "fornalutx": [1, -7],
    "son-sardina": [0, -3],
    "palmanyola": [-1, -4],
    "bunyola": [0, -5],
    "sa-cabana": [1, -2],
    "es-garrovers": [1, -3],
    "hospital-joan-march": [1, -4],
    "w:n1": [0, -1],
    "w:204": [-1, -6],
    "w:231": [7, -14],

    // ── Achse Palma – Inca ───────────────────────────────────
    "pont-inca": [1.5, -1.5],
    "pont-inca-nou": [2.5, -2.5],
    "es-figueral": [3.5, -3.5],
    "santa-maria": [5, -5],
    "estacio": [6, -6],
    "binissalem": [7, -7],
    "lloseta": [8, -8],
    "inca": [9, -9],
    "consell": [5, -6],
    "alaro": [5, -7],
    "orient": [4, -8],
    "biniamar": [7, -9],
    "mancor": [7, -10],
    "sa-cabaneta": [5.5, -3.5],
    "portol": [6.5, -3.5],
    "pla-na-tesa": [4.5, -2.5],
    "son-ferriol": [4.5, 0],
    "santa-eugenia": [6, -1.5],
    "biniali": [7, -2.5],
    "sencelles": [8, -3.5],
    "costitx": [9, -4.5],
    "w:x1": [1, 0],
    "w:x2": [9, -8],
    "w:ax": [3, -2],
    "w:air": [3, 1],

    // ── Mitte und Osten: Achse Palma – Manacor ───────────────
    "son-llatzer": [2, 0],
    "fan": [2, 1],
    "algaida": [7, 0],
    "montuiri": [10, 0],
    "vilafranca": [13, 0],
    "manacor": [16, 0],
    "randa": [7, 1.5],
    "porreres": [10, 2],
    "pina": [9, -2],
    "lloret": [10, -3],
    "sineu": [11, -5],
    "maria-salut": [11, -6.5],
    "ariany": [14, -6.5],
    "w:441": [14, -5],
    "petra": [13, -3],
    "sant-joan": [11, -2],
    "enllac": [10, -8],
    "llubi": [11, -8],
    "muro": [12, -9],
    "santa-margalida": [13, -8],
    "w:por": [11, 2],
    "w:e": [10, -9],
    "w:316": [14, -8],
    "w:cpi": [15, -9],

    // ── Norden ───────────────────────────────────────────────
    "selva": [9, -10],
    "caimari": [9, -11],
    "moscari": [8, -11],
    "lluc": [9, -14],
    "campanet": [10, -11],
    "buger": [11, -12],
    "sa-pobla": [12, -12],
    "crestatx": [12, -13],
    "pollenca": [13, -14],
    "cala-sant-vicenc": [13, -15],
    "port-pollenca": [14, -15],
    "llenaire": [15, -14],
    "platja-formentor": [15, -16],
    "far-formentor": [16, -17],
    "alcudia": [16, -13],
    "es-mal-pas": [17, -14],
    "estacio-maritima": [17, -13],
    "alcanada": [18, -13],
    "port-alcudia": [16, -12],
    "bellevue": [15, -11],
    "platja-alcudia": [16, -11],
    "platja-muro": [16, -10],
    "can-picafort": [16, -9],
    "son-serra": [17.5, -9],
    "colonia-sant-pere": [19, -9],
    "w:314": [10, -10],

    // ── Osten: Llevant ───────────────────────────────────────
    "sant-llorenc": [18, -2],
    "son-carrio": [19, -1],
    "arta": [19, -7],
    "capdepera": [21, -7],
    "cala-rajada": [22, -8],
    "cala-mesquida": [21, -9],
    "naguait": [22, -6],
    "font-sa-cala": [23, -7],
    "canyamel": [21, -5],
    "son-servera": [21, -4],
    "costa-pins": [23, -6],
    "port-nou": [23, -5],
    "cala-bona": [22, -4],
    "cala-millor": [22, -3],
    "sa-coma": [22, -2],
    "sillot": [21, -1],
    "portocristo": [20, 0],
    "cala-anguila": [21, 1],
    "cala-romantica": [21, 2],
    "son-macia": [18, 2],
    "cales-mallorca": [20, 4],
    "cala-murada": [20, 5],

    // ── Süden ────────────────────────────────────────────────
    "aeroport": [3, 2],
    "w:se1": [2, 2],
    "w:a11s": [-1, 2],     // A11 umfährt die Palma-Scheibe im Süden, Platz für den Namen
    "w:a11t": [-0.1, 2.9],
    "w:a11u": [2.1, 2.9],  // von Südwesten zum Flughafen: kreuzt das Südbündel einmal rechtwinklig
    "w:411b": [15, -2],    // 411e biegt schon in Vilafranca ab, weit vor Manacor
    "w:se2": [3, 3],
    "w:504": [4, 4],
    "w:a4": [4, 2],
    "sarenal": [6, 4],
    "son-veri-nou": [6, 4.55],
    "cala-blava": [6, 5.1],
    "les-palmeres": [6, 5.65],
    "maioris": [6, 6.2],
    "puigderros": [6, 6.75],
    "sa-torre": [6, 7.3],
    "badia-blava": [6, 7.85],
    "badia-gran": [6, 8.4],
    "tolleric": [6, 8.95],
    "cala-pi": [7, 9.95],
    "llucmajor": [7, 3],
    "sestanyol": [8, 9],
    "sa-rapita": [9, 9],
    "campos": [11, 3],
    "colonia-sant-jordi": [11, 9],
    "ses-salines": [12, 9],
    "es-llombards": [13, 9],
    "cala-llombards": [13, 10],
    "santanyi": [13, 7],
    "son-moja": [14, 8],
    "cala-santanyi": [14, 9],
    "cala-figuera": [15, 10],
    "salqueria-blanca": [15, 7],
    "portopetro": [16, 8],
    "cala-mondrago": [16, 9],
    "cala-egos": [17, 8],
    "cala-dor": [18, 8],
    "cala-ferrera": [19, 7],
    "calonge": [18, 7],
    "shorta": [18, 6],
    "es-carritxo": [16, 6],
    "cas-concos": [13, 4],
    "felanitx": [13, 3],
    "portocolom": [19, 5],
    "w:518": [11, 7],
    "w:512": [17, 3]
  };

  const nodes = {};
  for (const k in grid) nodes[k] = [OX + grid[k][0] * G, OY + grid[k][1] * G];

  window.LAYOUT = {
    G, OX, OY, grid, nodes,
    hubs: { "palma": { r: 46 } },

    // Farbfamilien je Korridor, Farbwinkel nach OKLCH: Westen blau (230–246°),
    // Flughafen petrol (180–196°), Tramuntana grün (130–146°), Osten nur
    // kräftiges Orange (48–68°), Norden violett (284–296°), Süden beere
    // (332–348°). Zwischen den Familien liegen mindestens 32°. Innerhalb einer
    // Familie wechselt die Helligkeit (Sättigung mindestens 0,12). Die
    // Hauptlinien (x01, x02) tragen den dunkelsten, kräftigsten Ton.
    // Jede Farbe hat auf Weiß mindestens 3:1 Kontrast. Die Anschlusslinie
    // L3 (EMT) ist grau gepunktet.
    // Leitfarbe je Region (Linienliste, Legende)
    families: { rail: "#15171A", west: "#064D70", tram: "#205602", north: "#4D22A4", east: "#944F04", south: "#7E0064", air: "#014B42" },

    colors: {
      "L3": "#737B80",
      // Westen · Calvià & Andratx
      "101": "#064D70", "102": "#00588C", "103": "#0D8FBF", "104": "#02354A", "105": "#099ACF", "106": "#0595E6", "107": "#006BA8", "108": "#007BBF", "121": "#017FAB", "122": "#02354A", "123": "#086F96", "131": "#028AD6",
      // Serra de Tramuntana
      "201": "#205602", "202": "#046613", "203": "#3DA742", "204": "#1F3900", "205": "#598332", "231": "#729D4C", "232": "#007C16",
      // Norden · Raiguer & Pla
      "301": "#4D22A4", "302": "#612EAE", "303": "#7E5ACC", "304": "#3C007A", "311": "#857AEF", "312": "#704ABB", "313": "#2D2169", "314": "#6E69B7", "315": "#9774E9", "316": "#392F78", "321": "#534B97", "322": "#7B6FE3", "323": "#48198A", "324": "#300A80", "325": "#605AA7", "327": "#463D88", "331": "#8C69DD", "334": "#2D2169", "341": "#6050C1", "342": "#3B2090", "343d": "#534B97",
      // Osten · Llevant
      "401": "#944F04", "403": "#C2790B", "411": "#AE4C00", "411e": "#DF710B", "412": "#B06008", "416": "#DB640E", "417": "#D37C07", "421": "#BF680A", "422": "#DB640E", "423": "#C2790B", "424": "#BD5403", "425": "#D37C07", "427": "#CE710C", "428": "#B06008", "431d": "#BD5403", "432": "#DF710B", "441": "#AE4C00", "442": "#CC5C08",
      // Süden · Migjorn
      "501": "#7E0064", "501e": "#B970AC", "504": "#59013E", "505": "#951E6C", "508": "#B64189", "512": "#AE66A1", "514": "#9C368D", "515": "#55004C", "515e": "#7F3A73", "516": "#BD55AC", "517": "#A5307A", "518": "#601E56", "521": "#D35CA3",
      // Flughafen · Aerotib
      "A11": "#0A5D53", "A32": "#014B42", "A33": "#038476", "A42": "#033932", "A43": "#139888", "A51": "#077064"
    },


    routes: {
      // Westachse (Autobahn Ma-1)
      "palma|andratx": ["palma", "w:t1", "w:t2", "w:t3", "w:t4", "w:t5", "w:t6", "andratx"],
      "palma|galatzo": ["palma", "w:t1", "w:t2", "w:t3", "w:t4", "w:t5", "galatzo"],
      "palma|santa-ponca": ["palma", "w:t1", "w:t2", "w:t3", "w:t4", "santa-ponca"],
      "palma|portals-nous": ["palma", "w:t1", "w:t2", "w:t3", "portals-nous"],
      "palma|bendinat": ["palma", "w:t1", "w:t2", "bendinat"],
      "palma|puigpunyent": ["palma", "w:t1", "w:201", "puigpunyent"],
      "santa-ponca|magaluf": ["santa-ponca", "w:a11", "magaluf"],
      "santa-ponca|palmanova": ["santa-ponca", "w:a11", "palmanova"],
      "bendinat|cas-catala": ["bendinat", "illetes", "cas-catala"],
      // A11 hält nicht in Palma: sie umfährt die Scheibe im Süden
      "bendinat|aeroport": ["bendinat", "w:t2", "w:a11s", "w:a11t", "w:a11u", "aeroport"],
      // Schleifen als rechte Winkel: 441 als Rechteck an Sineu, 313 zurück auf demselben Gleis
      "ariany|sineu": ["ariany", "w:441", "sineu"],
      "moscari|selva": ["moscari", "caimari", "selva"],
      "banyalbufar|esporles": ["banyalbufar", "w:lg", "esporles"],
      "banyalbufar|la-granja": ["banyalbufar", "w:lg", "la-granja"],

      // Norden
      "palma|son-sardina": ["palma", "w:n1", "son-sardina"],
      "palma|sa-cabana": ["palma", "w:n1", "sa-cabana"],
      "palmanyola|soller": ["palmanyola", "w:204", "soller"],
      "soller|lluc": ["soller", "w:231", "lluc"],

      // Eilbusse nach Inca, Flughafenlinien
      "palma|inca": ["palma", "w:x1", "w:ax", "w:x2", "inca"],
      "aeroport|inca": ["aeroport", "w:air", "w:ax", "w:x2", "inca"],
      "aeroport|algaida": ["aeroport", "w:a4", "algaida"],
      "aeroport|sarenal": ["aeroport", "w:a4", "sarenal"],
      "costitx|inca": ["costitx", "w:x2", "inca"],

      // Norden: Bündel um Inca
      "inca|campanet": ["inca", "w:314", "campanet"],
      "inca|sa-pobla": ["inca", "w:314", "sa-pobla"],
      "inca|muro": ["inca", "w:e", "muro"],
      "inca|llubi": ["inca", "w:e", "llubi"],
      "muro|can-picafort": ["muro", "w:cpi", "can-picafort"],
      "santa-margalida|can-picafort": ["santa-margalida", "w:316", "w:cpi", "can-picafort"],

      // Ostachse: Eillinie 411e und 401 ohne Halt in Son Ferriol
      "palma|sant-llorenc": ["palma", "son-llatzer", "son-ferriol", "algaida", "montuiri", "vilafranca", "w:411b", "sant-llorenc"],
      "son-llatzer|algaida": ["son-llatzer", "son-ferriol", "algaida"],
      "porreres|vilafranca": ["porreres", "w:por", "vilafranca"],
      "porreres|felanitx": ["porreres", "w:por", "felanitx"],

      // Süden
      "palma|aeroport": ["palma", "w:se1", "aeroport"],
      "fan|llucmajor": ["fan", "w:se1", "w:se2", "llucmajor"],
      "palma|sarenal": ["palma", "w:se1", "w:se2", "w:504", "sarenal"],
      "palma|llucmajor": ["palma", "w:se1", "w:se2", "llucmajor"],
      "palma|campos": ["palma", "w:se1", "w:se2", "llucmajor", "campos"],
      "palma|santanyi": ["palma", "w:se1", "w:se2", "llucmajor", "campos", "santanyi"],
      "campos|colonia-sant-jordi": ["campos", "w:518", "colonia-sant-jordi"],
      "sa-rapita|campos": ["sa-rapita", "w:518", "campos"],
      "felanitx|portocolom": ["felanitx", "w:512", "portocolom"]
    },

    edges: {
      "galatzo|peguera": { mode: "sd" },
      "w:por|felanitx": { mode: "sd" },
      "llucmajor|sestanyol": { mode: "sd" },
      "campos|santanyi": { mode: "ds" },
      "sineu|lloret": { mode: "ds" },
      "santa-maria|santa-eugenia": { mode: "ds" },
      "can-picafort|arta": { mode: "ds" },
      "w:a4|algaida": { mode: "sd" },
      "sarenal|llucmajor": {},
      "enllac|sineu": {}
    },

    // Gleise, die sich mehrere Linien teilen (gleiche Lage im Bündel)
    slots: {
      "T1": "sfm", "T2": "sfm", "T3": "sfm",
      "A32": "a3x", "A33": "a3x",
      "A42": "a4x", "A43": "a4x"
    },

    labels: {
      "cala-anguila": { lines: ["Cala Anguila –", "Cala Mendia"] },
      "canyamel": { lines: ["Canyamel –", "Coves d’Artà"] },
      "son-espases": { lines: ["Hospital", "Son Espases"] },
      "hospital-joan-march": { lines: ["Hospital", "Joan March"] },
      "colonia-sant-pere": { lines: ["Colònia", "de Sant Pere"] },
      "colonia-sant-jordi": { lines: ["Colònia", "de Sant Jordi"] },
      "cala-sant-vicenc": { lines: ["Cala", "de Sant Vicenç"] },
      "mancor": { lines: ["Mancor", "de la Vall"] },
      // Bahnstrecke Palma–Inca: Namen als Leiter auf der Nordwestseite
      "pont-inca": { dir: "nw" }, "pont-inca-nou": { dir: "nw" }, "es-figueral": { dir: "nw" },
      "santa-maria": { dir: "nw" }, "estacio": { dir: "nw" }, "binissalem": { dir: "nw" }, "lloseta": { dir: "nw" },
      // Äste nach Alaró, Consell, Orient: Namen an die äußeren Enden
      "alaro": { dir: "w" }, "consell": { dir: "w" }, "orient": { dir: "w" },
      "sineu": { dir: "w" },          // außerhalb der Schleife 441
      "camp-de-mar": { dir: "s" },    // zur Seeseite
      // Sóller unter die Fornalutx-Abzweigung, Port de Sóller nach Westen: jeder Name eindeutig bei seinem Halt
      "soller": { dir: "se" }, "port-soller": { dir: "w" }
    },

    rank: {
      "palma": 1, "inca": 1, "manacor": 1, "aeroport": 1,
      "soller": 2, "andratx": 2, "alcudia": 2, "pollenca": 2, "sa-pobla": 2, "arta": 2,
      "cala-rajada": 2, "campos": 2, "llucmajor": 2, "felanitx": 2, "santanyi": 2,
      "portocristo": 2, "cala-dor": 2, "santa-ponca": 2, "magaluf": 2, "palmanova": 2,
      "peguera": 2, "port-soller": 2, "port-pollenca": 2, "port-alcudia": 2, "can-picafort": 2,
      "cala-millor": 2, "algaida": 2, "sineu": 2, "valldemossa": 2, "bunyola": 2,
      "sarenal": 2, "portocolom": 2, "calvia": 2, "muro": 2
    },

    // Inselumriss, ebenfalls nur 0°/45°/90° (Rastereinheiten, im Uhrzeigersinn)
    islandGrid: [
      [-20.5, 0.0], [-15.5, -5.0], [-5.5, -5.0], [5.5, -16.0], [12.4, -16.0],
      [15.6, -19.2], [19.6, -15.2], [19.6, -12.0], [17.6, -10.0],
      [21.6, -10.0], [24.0, -7.6], [24.0, 3.6], [16.6, 11.0], [5.0, 11.0],
      [5.0, 7.3], [1.6, 3.9], [-7.8, 3.9], [-7.8, 6.2], [-12.6, 6.2],
      [-15.4, 3.4], [-20.5, 3.4]
    ],
    // Namen von Landschaft und Meer (Rastereinheiten, Drehung in Grad)
    geo: [
      { text: "SERRA DE TRAMUNTANA", at: [3.6, -12.4], rot: -45, kind: "relief" },
      { text: "Badia de Palma", at: [-1.8, 5.4], rot: 0, kind: "water" },
      { text: "Badia d’Alcúdia", at: [22.4, -12.9], rot: 0, kind: "water" }
    ],
    island: []
  };
  window.LAYOUT.island = window.LAYOUT.islandGrid.map((p) => [OX + p[0] * G, OY + p[1] * G]);
})();
