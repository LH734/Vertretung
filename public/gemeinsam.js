/* Gemeinsame Bausteine für Kinder-Ansicht, Bühne und Regie.
   Handgeschrieben, ohne Build-Schritt. */
(function () {
  'use strict';

  const FARBEN = [
    { name: 'Tinte', wert: '#2E1A3B' },
    { name: 'Rot', wert: '#E94F4F' },
    { name: 'Orange', wert: '#F28C38' },
    { name: 'Gelb', wert: '#F5CB5E' },
    { name: 'Grün', wert: '#5BAA4A' },
    { name: 'Blau', wert: '#3A7BD5' },
    { name: 'Violett', wert: '#8B5CF6' },
    { name: 'Braun', wert: '#8B5A3C' },
    { name: 'Radierer', wert: '#FFFFFF' },
  ];
  const STAERKEN = [4, 12, 28];
  const BREITE = 800;
  const HOEHE = 600;
  const TEAMS = [
    { name: 'Mechanica', farbe: '#F5CB5E' },
    { name: 'Optica', farbe: '#3FB8AF' },
    { name: 'Thermodynamica', farbe: '#E94F4F' },
    { name: 'Electra', farbe: '#8B5CF6' },
  ];
  const wenigBewegung = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function esc(text) {
    return String(text == null ? '' : text)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function $(sel, wurzel) { return (wurzel || document).querySelector(sel); }
  function $$(sel, wurzel) { return Array.from((wurzel || document).querySelectorAll(sel)); }

  // Setzt innerHTML nur, wenn sich etwas geändert hat (verhindert Flackern und Fokusverlust).
  function setzeHtml(el, html) {
    if (!el) return false;
    if (el.__html === html) return false;
    el.__html = html;
    el.innerHTML = html;
    return true;
  }

  // Papierkarte fährt von unten herein, sobald sich der Schlüssel ändert.
  function karteHerein(el, schluessel) {
    if (!el || el.__karte === schluessel) return;
    el.__karte = schluessel;
    if (wenigBewegung) return;
    el.classList.remove('herein');
    void el.offsetWidth;
    el.classList.add('herein');
  }

  function teamPunkt(team) {
    if (team === null || team === undefined || !TEAMS[team]) return '';
    return `<i class="teampunkt" style="--team:${TEAMS[team].farbe}" title="${esc(TEAMS[team].name)}"></i>`;
  }

  // ------------------------------------------------------------------
  // Zeichenfläche: fester interner Maßstab 800 × 600, damit Füllen und
  // Wiederholen auf jedem Gerät gleich aussehen.
  // ------------------------------------------------------------------
  function Zeichenflaeche(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.puffer = document.createElement('canvas');
    this.puffer.width = BREITE;
    this.puffer.height = HOEHE;
    this.pctx = this.puffer.getContext('2d', { willReadFrequently: true });
    this.ops = [];
    this.zugId = null;
    this.schmutzig = true;
    this.leereFlaeche();
    const neuGroesse = () => this.groesse();
    if (window.ResizeObserver) new ResizeObserver(neuGroesse).observe(canvas);
    window.addEventListener('resize', neuGroesse);
    this.groesse();
    const schleife = () => {
      if (this.schmutzig) this.zeige();
      requestAnimationFrame(schleife);
    };
    requestAnimationFrame(schleife);
  }

  Zeichenflaeche.prototype.groesse = function () {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const b = Math.max(1, Math.round(this.canvas.offsetWidth * dpr));
    const h = Math.max(1, Math.round(this.canvas.offsetHeight * dpr));
    if (this.canvas.width !== b || this.canvas.height !== h) {
      this.canvas.width = b;
      this.canvas.height = h;
    }
    this.schmutzig = true;
  };

  Zeichenflaeche.prototype.zeige = function () {
    this.schmutzig = false;
    this.ctx.imageSmoothingEnabled = true;
    this.ctx.imageSmoothingQuality = 'high';
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.ctx.drawImage(this.puffer, 0, 0, this.canvas.width, this.canvas.height);
  };

  Zeichenflaeche.prototype.leereFlaeche = function () {
    this.pctx.globalCompositeOperation = 'source-over';
    this.pctx.fillStyle = '#FFFFFF';
    this.pctx.fillRect(0, 0, BREITE, HOEHE);
    this.schmutzig = true;
  };

  Zeichenflaeche.prototype.setzeAlles = function (zugId, ops) {
    this.zugId = zugId;
    this.ops = (ops || []).map((op) => (op.t === 's' ? { t: 's', id: op.id, f: op.f, b: op.b, p: op.p.slice() } : Object.assign({}, op)));
    this.neuZeichnen();
  };

  Zeichenflaeche.prototype.neuZeichnen = function () {
    this.leereFlaeche();
    for (const op of this.ops) this.maleOp(op);
    this.schmutzig = true;
  };

  Zeichenflaeche.prototype.maleOp = function (op) {
    if (op.t === 's') this.maleStrich(op, 0);
    else if (op.t === 'f') this.fuelle(op.x, op.y, op.f);
  };

  Zeichenflaeche.prototype.maleStrich = function (op, abIndex) {
    const c = this.pctx;
    const farbe = (FARBEN[op.f] || FARBEN[0]).wert;
    const breite = STAERKEN[op.b] || STAERKEN[1];
    c.strokeStyle = farbe;
    c.fillStyle = farbe;
    c.lineWidth = breite;
    c.lineCap = 'round';
    c.lineJoin = 'round';
    const p = op.p;
    if (!p.length) return;
    if (p.length === 1 || (abIndex === 0 && p.length === 1)) {
      c.beginPath();
      c.arc(p[0][0], p[0][1], breite / 2, 0, Math.PI * 2);
      c.fill();
    }
    const start = Math.max(1, abIndex);
    if (start >= p.length) return;
    c.beginPath();
    c.moveTo(p[start - 1][0], p[start - 1][1]);
    for (let i = start; i < p.length; i++) c.lineTo(p[i][0], p[i][1]);
    c.stroke();
    this.schmutzig = true;
  };

  // Scanline-Füllung mit Toleranz, damit Kantenglättung mitgefüllt wird.
  Zeichenflaeche.prototype.fuelle = function (x, y, f) {
    x = Math.round(x); y = Math.round(y);
    if (x < 0 || y < 0 || x >= BREITE || y >= HOEHE) return;
    const bild = this.pctx.getImageData(0, 0, BREITE, HOEHE);
    const d = bild.data;
    const hex = (FARBEN[f] || FARBEN[0]).wert;
    const nr = parseInt(hex.slice(1, 3), 16), ng = parseInt(hex.slice(3, 5), 16), nb = parseInt(hex.slice(5, 7), 16);
    const i0 = (y * BREITE + x) * 4;
    const zr = d[i0], zg = d[i0 + 1], zb = d[i0 + 2];
    if (Math.abs(zr - nr) + Math.abs(zg - ng) + Math.abs(zb - nb) < 12) return;
    const TOLERANZ = 110;
    const besucht = new Uint8Array(BREITE * HOEHE);
    const passt = (i) => {
      const j = i * 4;
      return !besucht[i] && Math.abs(d[j] - zr) + Math.abs(d[j + 1] - zg) + Math.abs(d[j + 2] - zb) <= TOLERANZ;
    };
    const stapel = [x, y];
    while (stapel.length) {
      const sy = stapel.pop();
      let sx = stapel.pop();
      let i = sy * BREITE + sx;
      while (sx >= 0 && passt(i)) { sx--; i--; }
      sx++; i++;
      let obenOffen = false, untenOffen = false;
      while (sx < BREITE && passt(i)) {
        besucht[i] = 1;
        const j = i * 4;
        d[j] = nr; d[j + 1] = ng; d[j + 2] = nb; d[j + 3] = 255;
        if (sy > 0) {
          const o = i - BREITE;
          if (passt(o)) { if (!obenOffen) { stapel.push(sx, sy - 1); obenOffen = true; } } else obenOffen = false;
        }
        if (sy < HOEHE - 1) {
          const u = i + BREITE;
          if (passt(u)) { if (!untenOffen) { stapel.push(sx, sy + 1); untenOffen = true; } } else untenOffen = false;
        }
        sx++; i++;
      }
    }
    // Einen Pixel Saum nachziehen, damit keine hellen Ränder an Strichen bleiben.
    for (let yy = 1; yy < HOEHE - 1; yy++) {
      for (let xx = 1; xx < BREITE - 1; xx++) {
        const i = yy * BREITE + xx;
        if (besucht[i]) continue;
        if (besucht[i - 1] || besucht[i + 1] || besucht[i - BREITE] || besucht[i + BREITE]) {
          const j = i * 4;
          const hell = d[j] + d[j + 1] + d[j + 2];
          if (hell > 3 * 200) { d[j] = nr; d[j + 1] = ng; d[j + 2] = nb; }
        }
      }
    }
    this.pctx.putImageData(bild, 0, 0);
    this.schmutzig = true;
  };

  // Ereignisse vom Server (oder lokal beim Zeichnen)
  Zeichenflaeche.prototype.wendeAn = function (op) {
    if (op.t === 's') {
      const neu = { t: 's', id: op.id, f: op.f, b: op.b, p: op.p.slice() };
      this.ops.push(neu);
      this.maleStrich(neu, 0);
    } else if (op.t === 'p') {
      const letzter = this.ops[this.ops.length - 1];
      if (!letzter || letzter.t !== 's' || letzter.id !== op.id) return;
      const ab = letzter.p.length;
      for (const pt of op.p) letzter.p.push(pt);
      this.maleStrich(letzter, ab);
    } else if (op.t === 'f') {
      this.ops.push(Object.assign({}, op));
      this.fuelle(op.x, op.y, op.f);
    } else if (op.t === 'u') {
      this.ops.pop();
      this.neuZeichnen();
    } else if (op.t === 'c') {
      this.ops = [];
      this.neuZeichnen();
    }
  };

  // Bildschirmkoordinate -> interne Koordinate, berücksichtigt die leichte Drehung des Blatts.
  Zeichenflaeche.prototype.punktAus = function (ev) {
    const r = this.canvas.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const winkel = (this.drehung || 0) * Math.PI / 180;
    const dx = ev.clientX - cx;
    const dy = ev.clientY - cy;
    const ux = dx * Math.cos(-winkel) - dy * Math.sin(-winkel);
    const uy = dx * Math.sin(-winkel) + dy * Math.cos(-winkel);
    const x = (ux / this.canvas.offsetWidth + 0.5) * BREITE;
    const y = (uy / this.canvas.offsetHeight + 0.5) * HOEHE;
    return [Math.max(0, Math.min(BREITE, Math.round(x))), Math.max(0, Math.min(HOEHE, Math.round(y)))];
  };

  // ------------------------------------------------------------------
  // Zeitkreis: ein handgezeichnet wirkender Bogen, der sich leert.
  // ------------------------------------------------------------------
  function Zeitkreis(wurzel) {
    this.wurzel = wurzel;
    wurzel.classList.add('zeitkreis');
    wurzel.innerHTML =
      '<svg viewBox="0 0 120 120" aria-hidden="true">' +
      '<path class="zk-spur"></path><path class="zk-bogen"></path>' +
      '</svg><span class="zk-zahl"></span>';
    this.spur = wurzel.querySelector('.zk-spur');
    this.bogen = wurzel.querySelector('.zk-bogen');
    this.zahl = wurzel.querySelector('.zk-zahl');
    this.phase = [Math.random() * 6, Math.random() * 6, Math.random() * 6];
    this.ende = 0;
    this.dauer = 1;
    this.eingefroren = null;
    this.aktiv = false;
    this.spur.setAttribute('d', this.pfad(1, 0, 1.3));
    setInterval(() => this.male(), 90);
  }

  Zeitkreis.prototype.setze = function (restMs, dauerMs, pausiert, aktiv) {
    this.aktiv = aktiv !== false;
    this.dauer = Math.max(1, dauerMs || 1);
    if (pausiert) this.eingefroren = restMs;
    else {
      this.eingefroren = null;
      this.ende = performance.now() + restMs;
    }
    this.male();
  };

  Zeitkreis.prototype.pfad = function (anteil, zeit, staerke) {
    const schritte = Math.max(2, Math.round(72 * anteil));
    const [a, b, c] = this.phase;
    let d = '';
    for (let i = 0; i <= schritte; i++) {
      const w = -Math.PI / 2 + (i / schritte) * anteil * Math.PI * 2;
      const r = 48 + staerke * (0.9 * Math.sin(3 * w + a) + 0.6 * Math.sin(7 * w + b) + 0.35 * Math.sin(13 * w + c)) +
        (wenigBewegung ? 0 : 0.35 * Math.sin(zeit * 0.006 + 5 * w));
      const x = 60 + r * Math.cos(w);
      const y = 60 + r * Math.sin(w);
      d += (i ? 'L' : 'M') + x.toFixed(1) + ' ' + y.toFixed(1);
    }
    return d;
  };

  Zeitkreis.prototype.male = function () {
    if (!this.wurzel.isConnected || this.wurzel.offsetParent === null) return;
    const rest = this.eingefroren !== null ? this.eingefroren : Math.max(0, this.ende - performance.now());
    const anteil = this.aktiv ? Math.max(0, Math.min(1, rest / this.dauer)) : 0;
    this.bogen.setAttribute('d', anteil > 0.002 ? this.pfad(anteil, performance.now(), 1.1) : '');
    const sekunden = Math.ceil(rest / 1000);
    this.zahl.textContent = this.aktiv ? String(sekunden) : '';
    this.wurzel.classList.toggle('knapp', this.aktiv && sekunden <= 10);
  };

  // ------------------------------------------------------------------
  // Verbindung
  // ------------------------------------------------------------------
  function verbinde() {
    // socket.io versucht WebSocket und fällt bei Sperren automatisch auf Longpolling zurück.
    return io({ transports: ['polling', 'websocket'], reconnectionDelayMax: 4000 });
  }

  function melde(text, art) {
    let el = document.getElementById('meldung');
    if (!el) {
      el = document.createElement('div');
      el.id = 'meldung';
      el.setAttribute('role', 'status');
      document.body.appendChild(el);
    }
    el.textContent = text;
    el.className = 'sichtbar ' + (art || '');
    clearTimeout(el.__t);
    el.__t = setTimeout(() => { el.className = ''; }, 3200);
  }

  function ordinal(n) { return n + '.'; }

  window.Gemeinsam = {
    FARBEN, STAERKEN, TEAMS, BREITE, HOEHE, wenigBewegung,
    esc, $, $$, setzeHtml, karteHerein, teamPunkt, ordinal,
    Zeichenflaeche, Zeitkreis, verbinde, melde,
  };
})();
