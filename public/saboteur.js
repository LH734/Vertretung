/* Saboteur: Spielansicht auf dem Handy oder Tablet */
(function () {
  'use strict';
  const G = window.Gemeinsam;
  const K = window.SchulKarte;
  const { esc, setzeHtml, karteHerein } = G;

  const KP = 32; // Pixel je Kachel auf der vorgezeichneten Karte
  const TEMPO = 4.0; // etwas unter dem Server-Wert, damit nichts zurückspringt
  const GEIST_TEMPO = 5.3;
  const SICHT_CREW = 5.5;
  const SICHT_SABOTEUR = 7;
  const AUFGABE_WEITE = 1.9;
  const MELDE_WEITE = 2.2;
  const KNOPF_WEITE = 1.9;
  const ERWISCH_WEITE = 1.6;
  const TINTE = '#2E1A3B';

  let socket = null;
  let z = null; // Gesamtzustand
  let s = null; // Spielsicht
  const el = {};
  let karteBild = null;
  let nacht = null;
  const lokal = { x: 0, y: 0, teleport: -1, blick: 1 };
  const andere = new Map(); // Index -> { x, y, vonX, vonY, nachX, nachY, t0, geist, blick }
  let umrisse = [];
  const eingabe = { dx: 0, dy: 0, zeiger: null, startX: 0, startY: 0, tasten: new Set() };
  let gesendet = { x: NaN, y: NaN, t: 0 };
  let laeuft = false;
  let letzterFrame = 0;
  let aufgabe = null; // offenes Minispiel { station, aufraeumen }
  let phasenEnde = 0;
  let abklingEnde = 0;
  let knopfFrei = 0;
  let auswahl = null; // Stimme in der Konferenz, vor dem Abschicken
  let aktionenZuletzt = 0;
  const verfuegbar = { aufgabe: null, melden: false, durchsage: false, erwischen: false };

  const ICON = {
    aufgabe: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 5.5a4 4 0 00-5 5L4 16l4 4 5.5-5.5a4 4 0 005-5l-2.5 2.5-3-1-1-3z"/></svg>',
    melden: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 21V4"/><path d="M4 4h12l-2 4 2 4H4"/></svg>',
    durchsage: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0013 0M12 17.5V21M8.5 21h7"/></svg>',
    erwischen: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 11V6.5a1.5 1.5 0 013 0V10M10 10V5a1.5 1.5 0 013 0v5M13 10V6a1.5 1.5 0 013 0v5M16 11V8.5a1.5 1.5 0 013 0V14a7 7 0 01-7 7h-1a6 6 0 01-5-2.7L3.6 14a1.6 1.6 0 012.6-1.8L7 13.5"/></svg>',
  };

  // ------------------------------------------------------------------
  // Aufbau
  // ------------------------------------------------------------------
  function init(sock) {
    socket = sock;
    const wurzel = document.getElementById('v-saboteur');
    wurzel.innerHTML = `
      <canvas class="sab-canvas"></canvas>
      <div class="sab-oben">
        <div class="sab-balken" role="progressbar" aria-label="Aufgaben der Crew"><span class="sab-balken-fuell"></span><b class="sab-balken-text"></b></div>
      </div>
      <button type="button" class="sab-rund sab-rolle-knopf" aria-label="Rolle anzeigen (gedrückt halten)">Rolle</button>
      <div class="sab-rolle-info" hidden></div>
      <button type="button" class="sab-rund sab-liste-knopf" aria-expanded="false">Liste</button>
      <div class="sab-liste" hidden></div>
      <div class="sab-hinweis" hidden></div>
      <div class="sab-joy" hidden><span class="sab-joy-knopf"></span></div>
      <div class="sab-aktionen">
        <button type="button" class="sab-aktion" data-aktion="aufgabe">${ICON.aufgabe}<span>Aufgabe</span></button>
        <button type="button" class="sab-aktion" data-aktion="melden">${ICON.melden}<span>Melden</span></button>
        <button type="button" class="sab-aktion" data-aktion="durchsage">${ICON.durchsage}<span>Durchsage</span></button>
        <button type="button" class="sab-aktion rot" data-aktion="erwischen">${ICON.erwischen}<span>Erwischen</span><i class="sab-abkling"></i></button>
      </div>
      <div class="sab-schicht" hidden></div>
      <div class="sab-aufgabe" hidden></div>
      <div class="sab-erwischt" hidden><div class="sab-karte"><h2>Erwischt!</h2><p>Du bist jetzt ein Geist. Du kannst durch Wände gehen und weiter Aufgaben erledigen. Verraten darfst du nichts!</p></div></div>`;
    for (const [name, sel] of Object.entries({
      wurzel: null, canvas: '.sab-canvas', balken: '.sab-balken-fuell', balkenText: '.sab-balken-text',
      rolleKnopf: '.sab-rolle-knopf', rolleInfo: '.sab-rolle-info', listeKnopf: '.sab-liste-knopf', liste: '.sab-liste',
      hinweis: '.sab-hinweis', joy: '.sab-joy', joyKnopf: '.sab-joy-knopf', aktionen: '.sab-aktionen',
      schicht: '.sab-schicht', aufgabe: '.sab-aufgabe', erwischt: '.sab-erwischt', abkling: '.sab-abkling',
    })) el[name] = sel ? wurzel.querySelector(sel) : wurzel;
    el.ctx = el.canvas.getContext('2d');
    nacht = document.createElement('canvas');

    karteBild = baueKarte();
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { karteBild = baueKarte(); });

    socket.on('saboteur:blick', empfangeBlick);
    socket.on('saboteur:korrektur', (k) => { lokal.x = k.x; lokal.y = k.y; });
    socket.on('saboteur:erwischt', () => {
      schliesseAufgabe(false);
      el.erwischt.hidden = false;
      karteHerein(el.erwischt.firstElementChild, 'erwischt' + Date.now());
      setTimeout(() => { el.erwischt.hidden = true; }, 4500);
    });

    bindeSteuerung();
    bindeKnoepfe();
  }

  function sichtbar() {
    return el.wurzel && !el.wurzel.hidden;
  }

  // ------------------------------------------------------------------
  // Zustand vom Server
  // ------------------------------------------------------------------
  function male(gesamt, sicht) {
    z = gesamt;
    s = sicht;
    const ich = s.ich;
    if (ich && s.teleport !== lokal.teleport) {
      lokal.teleport = s.teleport;
      lokal.x = ich.x;
      lokal.y = ich.y;
      andere.clear();
      umrisse = [];
    }
    const jetzt = performance.now();
    if (!z.raum.pause) {
      phasenEnde = jetzt + s.restMs;
      if (ich) {
        abklingEnde = jetzt + ich.abklingRestMs;
        knopfFrei = jetzt + ich.knopfRestMs;
      }
    }
    if (s.phase !== 'spiel') schliesseAufgabe(false);
    if (s.phase !== 'konferenz') auswahl = null;

    maleHud();
    maleSchicht();
    if (!laeuft) {
      laeuft = true;
      letzterFrame = performance.now();
      requestAnimationFrame(schleife);
    }
  }

  function empfangeBlick(b) {
    const jetzt = performance.now();
    const gesehen = new Set();
    for (const [i, x100, y100, geist] of b.s) {
      gesehen.add(i);
      const x = x100 / 100;
      const y = y100 / 100;
      const a = andere.get(i);
      if (!a) {
        andere.set(i, { x, y, vonX: x, vonY: y, nachX: x, nachY: y, t0: jetzt, geist: !!geist, blick: 1 });
      } else {
        a.vonX = a.x; a.vonY = a.y;
        a.nachX = x; a.nachY = y;
        if (Math.abs(x - a.x) > 0.02) a.blick = x > a.x ? 1 : -1;
        a.t0 = jetzt;
        a.geist = !!geist;
      }
    }
    for (const i of [...andere.keys()]) if (!gesehen.has(i)) andere.delete(i);
    umrisse = b.u.map(([i, x, y]) => ({ i, x: x / 100, y: y / 100 }));
  }

  function mitspieler(i) {
    return s && s.mitspieler.find((m) => m.i === i);
  }

  function darfLaufen() {
    return !!(s && s.ich && s.phase === 'spiel' && !z.raum.pause && !aufgabe);
  }

  // ------------------------------------------------------------------
  // Karte vorzeichnen
  // ------------------------------------------------------------------
  function zufall(n) {
    const x = Math.sin(n * 12.9898) * 43758.5453;
    return x - Math.floor(x);
  }

  function baueKarte() {
    const c = document.createElement('canvas');
    c.width = K.BREITE * KP;
    c.height = K.HOEHE * KP;
    const g = c.getContext('2d');
    // draußen: Schraffur
    g.fillStyle = '#D6D1C2';
    g.fillRect(0, 0, c.width, c.height);
    g.strokeStyle = 'rgba(46,26,59,0.12)';
    g.lineWidth = 2;
    for (let d = -c.height; d < c.width; d += 14) {
      g.beginPath(); g.moveTo(d, 0); g.lineTo(d + c.height, c.height); g.stroke();
    }
    // Böden
    for (let y = 0; y < K.HOEHE; y++) {
      for (let x = 0; x < K.BREITE; x++) {
        const k = K.kachel(x + 0.5, y + 0.5);
        if (k === K.LEER) continue;
        const raum = K.raeume.find((r) => x >= r.x && x < r.x + r.b && y >= r.y && y < r.y + r.h);
        g.fillStyle = raum ? raum.farbe : '#F7F5EE';
        g.fillRect(x * KP, y * KP, KP, KP);
      }
    }
    // Karoraster
    g.strokeStyle = 'rgba(198,210,228,0.7)';
    g.lineWidth = 1;
    for (let y = 0; y < K.HOEHE; y++) {
      for (let x = 0; x < K.BREITE; x++) {
        if (K.kachel(x + 0.5, y + 0.5) === K.LEER) continue;
        g.strokeRect(x * KP + 0.5, y * KP + 0.5, KP / 2, KP / 2);
        g.strokeRect(x * KP + KP / 2 + 0.5, y * KP + KP / 2 + 0.5, KP / 2, KP / 2);
      }
    }
    // Möbel
    for (const m of K.moebel) {
      const pad = 3;
      g.fillStyle = m.art === K.REGAL ? '#A88F6C' : '#D8C3A0';
      g.strokeStyle = TINTE;
      g.lineWidth = 2.5;
      g.beginPath();
      g.rect(m.x * KP + pad, m.y * KP + pad, m.b * KP - pad * 2, m.h * KP - pad * 2);
      g.fill();
      g.stroke();
      if (m.art === K.REGAL) { // Bücherrücken
        g.lineWidth = 1.5;
        for (let i = 1; i < (m.b * m.h * KP) / 9; i++) {
          if (m.h > m.b) { const yy = m.y * KP + pad + i * 9; if (yy > (m.y + m.h) * KP - pad) break; g.beginPath(); g.moveTo(m.x * KP + pad, yy); g.lineTo((m.x + m.b) * KP - pad, yy); g.stroke(); }
          else { const xx = m.x * KP + pad + i * 9; if (xx > (m.x + m.b) * KP - pad) break; g.beginPath(); g.moveTo(xx, m.y * KP + pad); g.lineTo(xx, (m.y + m.h) * KP - pad); g.stroke(); }
        }
      }
    }
    // Wände: Kanten zwischen Boden und draußen, leicht zittrig wie von Hand
    g.strokeStyle = TINTE;
    g.lineWidth = 5;
    g.lineCap = 'round';
    const zitter = (n) => (zufall(n) - 0.5) * 2;
    let nr = 0;
    for (let y = 0; y < K.HOEHE; y++) {
      for (let x = 0; x < K.BREITE; x++) {
        const k = K.kachel(x + 0.5, y + 0.5);
        if (k === K.LEER) continue;
        const kanten = [
          [0, -1, x, y, x + 1, y], [0, 1, x, y + 1, x + 1, y + 1],
          [-1, 0, x, y, x, y + 1], [1, 0, x + 1, y, x + 1, y + 1],
        ];
        for (const [dx, dy, x0, y0, x1, y1] of kanten) {
          if (K.kachel(x + dx + 0.5, y + dy + 0.5) !== K.LEER) continue;
          nr++;
          g.beginPath();
          g.moveTo(x0 * KP + zitter(nr), y0 * KP + zitter(nr + 7));
          g.lineTo(x1 * KP + zitter(nr + 3), y1 * KP + zitter(nr + 11));
          g.stroke();
        }
      }
    }
    // Raumnamen
    g.fillStyle = 'rgba(46,26,59,0.55)';
    g.textAlign = 'center';
    g.textBaseline = 'top';
    g.font = '26px "Love Ya Like A Sister", "Chalkboard SE", "Comic Sans MS", cursive';
    for (const r of K.raeume) {
      if (r.name === 'Flur') continue;
      g.fillText(r.name, (r.x + r.b / 2) * KP, (r.y + r.h - 1.35) * KP);
    }
    // Stationen
    for (const st of K.stationen) {
      g.fillStyle = '#FFFFFF';
      g.strokeStyle = TINTE;
      g.lineWidth = 2.5;
      g.beginPath(); g.arc(st.x * KP, st.y * KP, 9, 0, Math.PI * 2); g.fill(); g.stroke();
      g.fillStyle = TINTE;
      g.fillRect(st.x * KP - 3, st.y * KP - 3, 6, 6);
    }
    // Durchsage-Mikrofon im Sekretariat
    const kx = K.knopf.x * KP;
    const ky = K.knopf.y * KP;
    g.fillStyle = '#E94F4F';
    g.strokeStyle = TINTE;
    g.lineWidth = 3;
    g.beginPath(); g.arc(kx, ky, 15, 0, Math.PI * 2); g.fill(); g.stroke();
    g.fillStyle = '#FFFFFF';
    g.font = 'bold 20px "Love Ya Like A Sister", cursive';
    g.textBaseline = 'middle';
    g.fillText('!', kx, ky + 1);
    g.fillStyle = 'rgba(46,26,59,0.7)';
    g.font = 'bold 13px Mulish, sans-serif';
    g.fillText('Durchsage', kx, ky + 26);
    return c;
  }

  // ------------------------------------------------------------------
  // Hauptschleife
  // ------------------------------------------------------------------
  function schleife(t) {
    if (!sichtbar() || !s || s.art !== 'saboteur') { laeuft = false; return; }
    const dt = Math.min(0.05, (t - letzterFrame) / 1000);
    letzterFrame = t;
    bewege(dt);
    sende(t);
    zeichne(t);
    if (t - aktionenZuletzt > 120) { aktionenZuletzt = t; pruefeAktionen(t); aktualisiereZeiten(t); }
    requestAnimationFrame(schleife);
  }

  function richtung() {
    let dx = eingabe.dx;
    let dy = eingabe.dy;
    const k = eingabe.tasten;
    if (k.size) {
      dx = (k.has('ArrowRight') || k.has('d') ? 1 : 0) - (k.has('ArrowLeft') || k.has('a') ? 1 : 0);
      dy = (k.has('ArrowDown') || k.has('s') ? 1 : 0) - (k.has('ArrowUp') || k.has('w') ? 1 : 0);
      const l = Math.hypot(dx, dy);
      if (l > 0) { dx /= l; dy /= l; }
    }
    return { dx, dy };
  }

  function bewege(dt) {
    if (!darfLaufen()) return;
    const { dx, dy } = richtung();
    if (!dx && !dy) return;
    const geist = !s.ich.lebt;
    const weg = (geist ? GEIST_TEMPO : TEMPO) * dt;
    if (Math.abs(dx) > 0.1) lokal.blick = dx > 0 ? 1 : -1;
    if (geist) {
      lokal.x = Math.max(0.6, Math.min(K.BREITE - 0.6, lokal.x + dx * weg));
      lokal.y = Math.max(0.6, Math.min(K.HOEHE - 0.6, lokal.y + dy * weg));
    } else {
      const n = K.bewege(lokal.x, lokal.y, dx * weg, dy * weg);
      lokal.x = n.x;
      lokal.y = n.y;
    }
  }

  function sende(t) {
    if (!darfLaufen() || t - gesendet.t < 66) return;
    if (Math.abs(lokal.x - gesendet.x) < 0.01 && Math.abs(lokal.y - gesendet.y) < 0.01) return;
    gesendet = { x: lokal.x, y: lokal.y, t };
    socket.emit('kind:bewegung', { x: Math.round(lokal.x * 1000) / 1000, y: Math.round(lokal.y * 1000) / 1000 });
  }

  // ------------------------------------------------------------------
  // Zeichnen
  // ------------------------------------------------------------------
  function zeichne(t) {
    const c = el.canvas;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const b = Math.round(c.clientWidth * dpr);
    const h = Math.round(c.clientHeight * dpr);
    if (!b || !h) return;
    if (c.width !== b || c.height !== h) { c.width = b; c.height = h; }
    const g = el.ctx;
    const pt = Math.min(Math.max(b, h) / 20, Math.min(b, h) / 11); // Pixel je Kachel
    const ich = s.ich;
    const kx = ich ? lokal.x : K.BREITE / 2;
    const ky = ich ? lokal.y : K.HOEHE / 2;
    const ox = b / 2 - kx * pt;
    const oy = h / 2 - ky * pt;
    const bild = (x, y) => [ox + x * pt, oy + y * pt];

    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = '#1E1628';
    g.fillRect(0, 0, b, h);
    g.imageSmoothingEnabled = true;
    g.drawImage(karteBild, ox, oy, K.BREITE * pt, K.HOEHE * pt);

    // eigene offene Aufgaben leuchten
    if (ich && ich.rolle !== 'zuschauer' && s.phase === 'spiel') {
      const puls = 0.5 + 0.5 * Math.sin(t / 260);
      for (const a of ich.aufgaben) {
        if (a.erledigt) continue;
        const st = K.stationen[a.station];
        const [sx, sy] = bild(st.x, st.y);
        g.strokeStyle = `rgba(245,203,94,${0.55 + puls * 0.45})`;
        g.lineWidth = Math.max(3, pt * 0.12);
        g.beginPath(); g.arc(sx, sy, pt * (0.55 + puls * 0.12), 0, Math.PI * 2); g.stroke();
      }
    }

    // Kreideumrisse
    for (const u of umrisse) {
      const [sx, sy] = bild(u.x, u.y);
      maleUmriss(g, sx, sy, pt, mitspieler(u.i));
    }

    // andere Figuren, weich zwischen den Meldungen des Servers
    const jetzt = performance.now();
    for (const [i, a] of andere) {
      const f = Math.min(1, (jetzt - a.t0) / 80);
      a.x = a.vonX + (a.nachX - a.vonX) * f;
      a.y = a.vonY + (a.nachY - a.vonY) * f;
      const m = mitspieler(i);
      const [sx, sy] = bild(a.x, a.y);
      maleFigur(g, sx, sy, pt, m ? m.farbe : '#FFFFFF', a.blick, a.geist, m ? m.name : '', m && m.sab && ich && ich.rolle === 'saboteur');
    }
    if (ich) {
      const [sx, sy] = bild(lokal.x, lokal.y);
      const m = mitspieler(ich.i);
      maleFigur(g, sx, sy, pt, m ? m.farbe : '#FFFFFF', lokal.blick, !ich.lebt, ich.rolle === 'zuschauer' ? '' : 'Du', false);
    }

    // Dunkelheit: nur Lebende sehen begrenzt, Wände werfen Schatten
    if (ich && ich.lebt && (s.phase === 'spiel' || s.phase === 'rollen')) {
      if (nacht.width !== b || nacht.height !== h) { nacht.width = b; nacht.height = h; }
      const n = nacht.getContext('2d');
      n.globalCompositeOperation = 'source-over';
      n.clearRect(0, 0, b, h);
      n.fillStyle = 'rgba(22,14,32,0.9)';
      n.fillRect(0, 0, b, h);
      n.globalCompositeOperation = 'destination-out';
      const weite = ich.rolle === 'saboteur' ? SICHT_SABOTEUR : SICHT_CREW;
      const [mx, my] = bild(lokal.x, lokal.y);
      const verlauf = n.createRadialGradient(mx, my, pt * weite * 0.55, mx, my, pt * weite);
      verlauf.addColorStop(0, 'rgba(0,0,0,1)');
      verlauf.addColorStop(1, 'rgba(0,0,0,0)');
      n.fillStyle = verlauf;
      n.beginPath();
      const strahlen = 240;
      for (let k = 0; k <= strahlen; k++) {
        const w = (k / strahlen) * Math.PI * 2;
        const r = K.strahl(lokal.x, lokal.y, w, weite);
        const px = mx + Math.cos(w) * r * pt;
        const py = my + Math.sin(w) * r * pt;
        if (k === 0) n.moveTo(px, py); else n.lineTo(px, py);
      }
      n.closePath();
      n.fill();
      g.drawImage(nacht, 0, 0);
    } else if (ich && !ich.lebt) {
      g.fillStyle = 'rgba(58,123,213,0.08)';
      g.fillRect(0, 0, b, h);
    }

    // Joystick
    if (eingabe.zeiger !== null) {
      el.joy.hidden = false;
      el.joy.style.left = eingabe.startX + 'px';
      el.joy.style.top = eingabe.startY + 'px';
      el.joyKnopf.style.transform = `translate(${eingabe.dx * 40}px, ${eingabe.dy * 40}px)`;
    } else {
      el.joy.hidden = true;
    }
  }

  function farbeDunkler(hex, faktor) {
    const n = parseInt(hex.slice(1), 16);
    const r = Math.round(((n >> 16) & 255) * faktor);
    const gg = Math.round(((n >> 8) & 255) * faktor);
    const bb = Math.round((n & 255) * faktor);
    return `rgb(${r},${gg},${bb})`;
  }

  // Eine Figur: runder Körper mit Ranzen auf dem Rücken, Augen schauen in Laufrichtung
  function maleFigur(g, x, y, pt, farbe, blick, geist, name, mitSaboteur) {
    const r = pt * 0.38;
    g.save();
    if (geist) g.globalAlpha = 0.5;
    g.lineWidth = Math.max(2, pt * 0.07);
    g.strokeStyle = TINTE;
    // Schatten
    g.fillStyle = 'rgba(46,26,59,0.18)';
    g.beginPath(); g.ellipse(x, y + r * 0.95, r * 0.9, r * 0.28, 0, 0, Math.PI * 2); g.fill();
    // Ranzen
    g.fillStyle = farbeDunkler(farbe, 0.72);
    g.beginPath();
    g.rect(x - blick * r * 1.15 - r * 0.28, y - r * 0.45, r * 0.56, r * 0.95);
    g.fill(); g.stroke();
    // Körper
    g.fillStyle = farbe;
    g.beginPath(); g.ellipse(x, y, r, r * 1.05, 0, 0, Math.PI * 2); g.fill(); g.stroke();
    // Augen
    const ax = x + blick * r * 0.28;
    const ay = y - r * 0.28;
    g.fillStyle = '#FFFFFF';
    for (const d of [-0.28, 0.28]) {
      g.beginPath(); g.arc(ax + d * r, ay, r * 0.22, 0, Math.PI * 2); g.fill(); g.stroke();
      g.fillStyle = TINTE;
      g.beginPath(); g.arc(ax + d * r + blick * r * 0.07, ay + r * 0.02, r * 0.09, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#FFFFFF';
    }
    if (geist) { // Heiligenschein für Geister
      g.strokeStyle = '#F5CB5E';
      g.beginPath(); g.ellipse(x, y - r * 1.35, r * 0.6, r * 0.18, 0, 0, Math.PI * 2); g.stroke();
    }
    g.restore();
    if (name) {
      g.save();
      g.font = `800 ${Math.max(11, pt * 0.34)}px Mulish, "Segoe UI", sans-serif`;
      g.textAlign = 'center';
      g.textBaseline = 'bottom';
      g.lineWidth = 4;
      g.strokeStyle = 'rgba(255,255,255,0.9)';
      g.strokeText(name, x, y - r * 1.3);
      g.fillStyle = mitSaboteur ? '#C73A3A' : TINTE;
      g.fillText(name, x, y - r * 1.3);
      g.restore();
    }
  }

  // Kreideumriss einer erwischten Figur
  function maleUmriss(g, x, y, pt, m) {
    const r = pt * 0.34;
    g.save();
    g.lineCap = 'round';
    g.lineJoin = 'round';
    const pfad = () => {
      g.beginPath();
      g.arc(x - r * 1.5, y - r * 0.2, r * 0.55, 0, Math.PI * 2); // Kopf
      g.moveTo(x - r * 0.95, y - r * 0.2); g.lineTo(x + r * 0.8, y - r * 0.1); // Körper
      g.moveTo(x - r * 0.4, y - r * 0.2); g.lineTo(x - r * 0.1, y - r * 1.1); // Arm
      g.moveTo(x - r * 0.4, y - r * 0.15); g.lineTo(x - r * 0.3, y + r * 0.8); // Arm
      g.moveTo(x + r * 0.8, y - r * 0.1); g.lineTo(x + r * 1.7, y - r * 0.8); // Bein
      g.moveTo(x + r * 0.8, y - r * 0.1); g.lineTo(x + r * 1.6, y + r * 0.7); // Bein
    };
    g.strokeStyle = TINTE; g.lineWidth = Math.max(4, pt * 0.14); pfad(); g.stroke();
    g.strokeStyle = '#FFFFFF'; g.lineWidth = Math.max(2, pt * 0.07); pfad(); g.stroke();
    if (m) {
      g.fillStyle = m.farbe; g.strokeStyle = TINTE; g.lineWidth = 2;
      g.beginPath(); g.arc(x, y - r * 0.15, r * 0.3, 0, Math.PI * 2); g.fill(); g.stroke();
    }
    g.restore();
  }

  // ------------------------------------------------------------------
  // Steuerung
  // ------------------------------------------------------------------
  function bindeSteuerung() {
    const w = el.wurzel;
    w.addEventListener('pointerdown', (e) => {
      if (e.target !== el.canvas || eingabe.zeiger !== null) return;
      e.preventDefault();
      eingabe.zeiger = e.pointerId;
      eingabe.startX = e.clientX;
      eingabe.startY = e.clientY;
      eingabe.dx = 0;
      eingabe.dy = 0;
      try { el.canvas.setPointerCapture(e.pointerId); } catch (err) { /* egal */ }
    });
    w.addEventListener('pointermove', (e) => {
      if (e.pointerId !== eingabe.zeiger) return;
      const dx = e.clientX - eingabe.startX;
      const dy = e.clientY - eingabe.startY;
      const l = Math.hypot(dx, dy);
      if (l < 6) { eingabe.dx = 0; eingabe.dy = 0; return; }
      const f = Math.min(1, l / 45) / l;
      eingabe.dx = dx * f;
      eingabe.dy = dy * f;
    });
    const los = (e) => {
      if (e.pointerId !== eingabe.zeiger) return;
      eingabe.zeiger = null;
      eingabe.dx = 0;
      eingabe.dy = 0;
    };
    w.addEventListener('pointerup', los);
    w.addEventListener('pointercancel', los);
    w.addEventListener('touchmove', (e) => { if (sichtbar()) e.preventDefault(); }, { passive: false });
    w.addEventListener('contextmenu', (e) => e.preventDefault());

    const tasten = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'w', 'a', 's', 'd'];
    window.addEventListener('keydown', (e) => {
      if (!sichtbar() || (e.target && e.target.matches && e.target.matches('input, textarea'))) return;
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      if (tasten.includes(k)) { eingabe.tasten.add(k); e.preventDefault(); }
      if (k === 'e' || k === ' ') { e.preventDefault(); hauptAktion(); }
    });
    window.addEventListener('keyup', (e) => {
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      eingabe.tasten.delete(k);
    });
    window.addEventListener('blur', () => { eingabe.tasten.clear(); eingabe.zeiger = null; eingabe.dx = 0; eingabe.dy = 0; });
  }

  function bindeKnoepfe() {
    el.aktionen.addEventListener('click', (e) => {
      const b = e.target.closest('[data-aktion]');
      if (b && !b.disabled) aktion(b.dataset.aktion);
    });
    // Rolle nur zeigen, solange der Knopf gedrückt ist
    const zeige = (e) => { e.preventDefault(); el.rolleInfo.hidden = false; el.rolleInfo.innerHTML = rollenText(); };
    const verstecke = () => { el.rolleInfo.hidden = true; };
    el.rolleKnopf.addEventListener('pointerdown', zeige);
    el.rolleKnopf.addEventListener('pointerup', verstecke);
    el.rolleKnopf.addEventListener('pointerleave', verstecke);
    el.rolleKnopf.addEventListener('pointercancel', verstecke);
    el.listeKnopf.addEventListener('click', () => {
      el.liste.hidden = !el.liste.hidden;
      el.listeKnopf.setAttribute('aria-expanded', String(!el.liste.hidden));
    });
    el.schicht.addEventListener('click', klickInSchicht);
  }

  function hauptAktion() {
    if (verfuegbar.melden) return aktion('melden');
    if (verfuegbar.aufgabe !== null) return aktion('aufgabe');
    if (verfuegbar.erwischen) return aktion('erwischen');
    if (verfuegbar.durchsage) return aktion('durchsage');
  }

  function aktion(art) {
    if (!s || s.phase !== 'spiel' || z.raum.pause) return;
    if (art === 'aufgabe') {
      if (verfuegbar.aufgabe === null) return;
      oeffneAufgabe(verfuegbar.aufgabe);
      return;
    }
    socket.emit('kind:spiel', { art }, (a) => {
      if (a && !a.ok && a.fehler) G.melde(a.fehler, 'fehler');
    });
  }

  function pruefeAktionen(t) {
    const ich = s && s.ich;
    const imSpiel = !!(ich && s.phase === 'spiel' && !z.raum.pause);
    verfuegbar.aufgabe = null;
    verfuegbar.melden = false;
    verfuegbar.durchsage = false;
    verfuegbar.erwischen = false;
    if (imSpiel && ich.rolle !== 'zuschauer') {
      let beste = AUFGABE_WEITE;
      for (const a of ich.aufgaben) {
        if (a.erledigt) continue;
        const st = K.stationen[a.station];
        const d = Math.hypot(st.x - lokal.x, st.y - lokal.y);
        if (d <= beste) { beste = d; verfuegbar.aufgabe = a.station; }
      }
    }
    if (imSpiel && ich.lebt) {
      verfuegbar.melden = umrisse.some((u) => Math.hypot(u.x - lokal.x, u.y - lokal.y) <= MELDE_WEITE);
      verfuegbar.durchsage = ich.notrufe > 0 && t >= knopfFrei && Math.hypot(K.knopf.x - lokal.x, K.knopf.y - lokal.y) <= KNOPF_WEITE;
      if (ich.rolle === 'saboteur' && t >= abklingEnde) {
        for (const [i, a] of andere) {
          const m = mitspieler(i);
          if (a.geist || !m || m.sab) continue;
          if (Math.hypot(a.x - lokal.x, a.y - lokal.y) <= ERWISCH_WEITE) { verfuegbar.erwischen = true; break; }
        }
      }
    }
    const knopf = (art) => el.aktionen.querySelector(`[data-aktion="${art}"]`);
    const lebend = !!(ich && ich.lebt);
    knopf('aufgabe').hidden = !ich || ich.rolle === 'zuschauer';
    knopf('aufgabe').disabled = verfuegbar.aufgabe === null;
    knopf('melden').hidden = !lebend;
    knopf('melden').disabled = !verfuegbar.melden;
    knopf('durchsage').hidden = !lebend;
    knopf('durchsage').disabled = !verfuegbar.durchsage;
    knopf('erwischen').hidden = !(lebend && ich.rolle === 'saboteur');
    knopf('erwischen').disabled = !verfuegbar.erwischen;
    const rest = Math.ceil((abklingEnde - t) / 1000);
    el.abkling.textContent = lebend && ich.rolle === 'saboteur' && rest > 0 && s.phase === 'spiel' ? rest : '';
    el.aktionen.hidden = !imSpiel;
  }

  function aktualisiereZeiten(t) {
    const rest = Math.max(0, Math.ceil((phasenEnde - t) / 1000));
    el.schicht.querySelectorAll('[data-rest]').forEach((e) => { e.textContent = rest; });
  }

  // ------------------------------------------------------------------
  // Anzeige oben, Liste, Rolle
  // ------------------------------------------------------------------
  function rollenText() {
    const ich = s && s.ich;
    if (!ich) return '';
    if (ich.rolle === 'zuschauer') return '<b>Du schaust zu.</b> In der nächsten Runde bist du dabei.';
    if (ich.rolle === 'saboteur') {
      const partner = s.mitspieler.filter((m) => m.sab && m.i !== ich.i).map((m) => esc(m.name));
      return `<b class="rot">Du bist Saboteur.</b>${partner.length ? ` Mit dir: ${partner.join(', ')}.` : ''}${ich.lebt ? '' : ' Du wurdest rausgeworfen.'}`;
    }
    return `<b>Du bist in der Crew.</b>${ich.lebt ? ' Erledige deine Aufgaben und finde den Saboteur.' : ' Als Geist kannst du weiter Aufgaben erledigen.'}`;
  }

  function maleHud() {
    const ich = s.ich;
    const f = s.fortschritt;
    const anteil = f.gesamt ? f.erledigt / f.gesamt : 0;
    el.balken.style.width = Math.round(anteil * 100) + '%';
    el.balkenText.textContent = `Aufgaben ${f.erledigt} / ${f.gesamt}`;
    if (ich && ich.rolle !== 'zuschauer') {
      const sab = ich.rolle === 'saboteur';
      setzeHtml(el.liste, `<h3>${sab ? 'Zum Schein' : 'Deine Aufgaben'}</h3>` +
        (sab ? '<p class="klein">Diese Aufgaben zählen nicht. Tu nur so, damit du nicht auffällst.</p>' : '') +
        '<ul>' + ich.aufgaben.map((a) => {
          const st = K.stationen[a.station];
          return `<li class="${a.erledigt ? 'erledigt' : ''}"><b>${esc(st.name)}</b><span>${esc(st.raum)}</span></li>`;
        }).join('') + '</ul>' +
        (ich.lebt ? `<p class="klein">Durchsagen übrig: ${ich.notrufe}</p>` : ''));
    } else {
      setzeHtml(el.liste, '<p class="klein">Du schaust in dieser Runde zu.</p>');
    }
    el.listeKnopf.hidden = !ich;
    el.rolleKnopf.hidden = !ich;
    let hinweis = '';
    if (ich && s.phase === 'spiel') {
      if (ich.rolle === 'zuschauer') hinweis = 'Du schaust zu. In der nächsten Runde bist du dabei.';
      else if (!ich.lebt) hinweis = ich.rolle === 'crew' ? 'Du bist ein Geist. Erledige weiter Aufgaben!' : 'Du bist raus und schaust zu.';
    }
    el.hinweis.hidden = !hinweis;
    el.hinweis.textContent = hinweis;
  }

  // ------------------------------------------------------------------
  // Karten über dem Spiel: Rollen, Konferenz, Ergebnis, Rundenende
  // ------------------------------------------------------------------
  function punkt(m) {
    return m ? `<i class="sab-punkt" style="--farbe:${m.farbe}"></i>` : '';
  }

  function maleSchicht() {
    const ich = s.ich;
    let html = '';
    let schluessel = s.phase + s.runde;
    if (s.phase === 'warten') {
      html = `<div class="sab-karte"><h2>Gleich geht es los</h2><p>Für Saboteur braucht es mindestens ${s.minSpieler} Mitspielende.</p></div>`;
    } else if (s.phase === 'rollen' && ich) {
      if (ich.rolle === 'saboteur') {
        const partner = s.mitspieler.filter((m) => m.sab && m.i !== ich.i);
        html = `<div class="sab-karte rolle saboteur"><p class="klein">Runde ${s.runde} von ${s.runden} · Nicht zeigen!</p><h2>Du bist Saboteur</h2>
          <p>Erwische die Crew, ohne dass es jemand merkt. Tu so, als würdest du Aufgaben erledigen.</p>
          ${partner.length ? `<p>Mit dir sabotieren: ${partner.map((m) => punkt(m) + esc(m.name)).join(', ')}</p>` : ''}
          <p class="klein">Los geht es in <b data-rest></b> s</p></div>`;
      } else if (ich.rolle === 'crew') {
        html = `<div class="sab-karte rolle crew"><p class="klein">Runde ${s.runde} von ${s.runden} · Nicht zeigen!</p><h2>Du bist in der Crew</h2>
          <p>Erledige deine Aufgaben im Schulhaus. Findest du einen Kreideumriss, melde ihn!</p>
          <p class="klein">Los geht es in <b data-rest></b> s</p></div>`;
      } else {
        html = '<div class="sab-karte"><h2>Du schaust zu</h2><p>Die Runde läuft schon. In der nächsten bist du dabei.</p></div>';
      }
    } else if (s.phase === 'konferenz') {
      html = konferenzHtml();
      schluessel = 'konferenz' + s.teleport;
    } else if (s.phase === 'ergebnis' && s.ergebnis) {
      const e = s.ergebnis;
      let titel;
      let text = '';
      if (e.raus) {
        titel = `${punkt(e.raus)}${esc(e.raus.name)} wurde rausgeworfen.`;
        if (e.warSaboteur === true) text = '<p class="gross rot">… und war Saboteur!</p>';
        else if (e.warSaboteur === false) text = '<p class="gross">… und war kein Saboteur.</p>';
      } else {
        titel = { gleichstand: 'Gleichstand! Niemand fliegt raus.', uebersprungen: 'Übersprungen. Niemand fliegt raus.', keine: 'Niemand hat abgestimmt.' }[e.grund] || 'Niemand fliegt raus.';
      }
      const zeilen = e.stimmen.map((x) => `<li>${punkt(x)}${esc(x.name)}<b>${x.n}</b></li>`).join('') +
        (e.skip ? `<li>Überspringen<b>${e.skip}</b></li>` : '');
      html = `<div class="sab-karte"><h2>${titel}</h2>${text}${zeilen ? `<ul class="sab-stimmen">${zeilen}</ul>` : ''}</div>`;
    } else if (s.phase === 'rundenende' && s.sieg) {
      html = siegHtml();
    }
    el.schicht.hidden = !html;
    if (setzeHtml(el.schicht, html) && html) karteHerein(el.schicht.firstElementChild, schluessel);
    aktualisiereZeiten(performance.now());
  }

  function konferenzHtml() {
    const k = s.konferenz;
    const ich = s.ich;
    const darf = ich && ich.lebt && ich.rolle !== 'zuschauer';
    const abgestimmt = new Set(k.abgestimmt);
    const anlass = k.anlass === 'melden'
      ? `${punkt({ farbe: k.vonFarbe })}<b>${esc(k.von)}</b> hat den Kreideumriss von ${punkt({ farbe: k.umrissFarbe })}<b>${esc(k.umriss)}</b> gefunden.`
      : `${punkt({ farbe: k.vonFarbe })}<b>${esc(k.von)}</b> hat eine Durchsage gemacht.`;
    const karten = s.mitspieler.map((m) => {
      const raus = m.status !== 'da';
      const gewaehlt = auswahl === m.id;
      const meine = ich && ich.stimme === m.id;
      return `<button type="button" class="sab-person ${raus ? 'raus' : ''} ${gewaehlt || meine ? 'gewaehlt' : ''}" data-ziel="${esc(m.id)}" ${raus || !darf || ich.stimme ? 'disabled' : ''}>
        ${punkt(m)}<span>${esc(m.name)}${m.i === (ich && ich.i) ? ' (du)' : ''}</span>
        ${abgestimmt.has(m.i) ? '<em title="hat abgestimmt">✓</em>' : ''}${raus ? `<small>${m.status === 'raus' ? 'rausgeworfen' : m.status === 'weg' ? 'weg' : 'erwischt'}</small>` : ''}</button>`;
    }).join('');
    let unten;
    if (!darf) unten = `<p class="klein">${ich && ich.rolle === 'zuschauer' ? 'Zuschauende' : 'Geister'} stimmen nicht ab. Pssst!</p>`;
    else if (ich.stimme) unten = `<p class="klein"><b>Du hast abgestimmt${ich.stimme === 'skip' ? ' (überspringen)' : ''}.</b> Warte auf die anderen.</p>`;
    else {
      unten = `<div class="sab-knoepfe">
        <button type="button" class="knopf" data-stimme="skip">Überspringen</button>
        <button type="button" class="knopf haupt" data-stimme="abgeben" ${auswahl ? '' : 'disabled'}>Abstimmen</button></div>`;
    }
    return `<div class="sab-karte konferenz"><div class="sab-kopfzeile"><h2>Konferenz!</h2><span class="sab-uhr"><b data-rest></b> s</span></div>
      <p>${anlass}</p><p class="klein">Redet laut miteinander: Wer war es? Danach stimmt jede und jeder geheim ab. ${abgestimmt.size} von ${k.lebende} haben abgestimmt.</p>
      <div class="sab-personen">${karten}</div>${unten}</div>`;
  }

  function siegHtml() {
    const w = s.sieg;
    const ich = s.ich;
    let titel;
    let klasse = '';
    if (!w.seite) titel = 'Runde abgebrochen';
    else if (w.seite === 'crew') { titel = 'Die Crew gewinnt!'; klasse = 'crew'; }
    else { titel = 'Die Saboteure gewinnen!'; klasse = 'saboteur'; }
    const grund = {
      aufgaben: 'Alle Aufgaben sind erledigt.',
      enttarnt: 'Alle Saboteure wurden enttarnt.',
      ueberzahl: 'Die Saboteure sind genauso viele wie die übrige Crew.',
      abgebrochen: 'Die Spielleitung hat die Runde beendet.',
    }[w.grund] || '';
    let meins = '';
    if (ich && w.seite && ich.rolle !== 'zuschauer') {
      const gewonnen = (w.seite === 'crew') === (ich.rolle === 'crew');
      meins = gewonnen ? `<p class="gross">Du gewinnst: +${w.punkte} Punkte</p>` : '<p class="gross">Diesmal nicht. Nächste Runde!</p>';
    }
    const weiter = s.runde >= s.runden ? 'Gleich kommt das Endergebnis.' : 'Die nächste Runde startet gleich.';
    return `<div class="sab-karte ${klasse}"><p class="klein">Runde ${s.runde} von ${s.runden}</p><h2>${titel}</h2><p>${grund}</p>
      <p>Saboteur${w.saboteure.length > 1 ? 'e waren' : ' war'}: ${w.saboteure.map((m) => punkt(m) + '<b>' + esc(m.name) + '</b>').join(', ')}</p>
      ${meins}<p class="klein">${weiter} (<b data-rest></b> s)</p></div>`;
  }

  function klickInSchicht(e) {
    const person = e.target.closest('[data-ziel]');
    if (person && !person.disabled) {
      auswahl = auswahl === person.dataset.ziel ? null : person.dataset.ziel;
      maleSchicht();
      return;
    }
    const b = e.target.closest('[data-stimme]');
    if (!b || b.disabled || z.raum.pause) return;
    const ziel = b.dataset.stimme === 'skip' ? 'skip' : auswahl;
    if (!ziel) return;
    socket.emit('kind:spiel', { art: 'stimme', ziel }, (a) => {
      if (a && !a.ok && a.fehler) G.melde(a.fehler, 'fehler');
    });
  }

  // ------------------------------------------------------------------
  // Minispiele
  // ------------------------------------------------------------------
  const ANLEITUNG = {
    tafel: 'Wisch alles weg, bis die Fläche sauber ist.',
    kabel: 'Tippe links ein Kabel an und dann rechts den Stecker mit derselben Farbe.',
    zahlen: 'Tippe die Zahlen von 1 bis 10 der Reihe nach an.',
    schalter: 'Leg alle Schalter um, bis jedes Lämpchen leuchtet.',
    merken: 'Merk dir, welche Felder aufleuchten, und tippe sie in derselben Reihenfolge.',
    halten: 'Halte den Knopf gedrückt, bis der Kreis voll ist.',
  };

  function oeffneAufgabe(station) {
    if (aufgabe) return;
    const st = K.stationen[station];
    socket.emit('kind:spiel', { art: 'aufgabeOeffnen', station }, (a) => {
      if (!a || !a.ok) { if (a && a.fehler) G.melde(a.fehler, 'fehler'); return; }
      eingabe.zeiger = null; eingabe.dx = 0; eingabe.dy = 0;
      el.aufgabe.innerHTML = `<div class="sab-karte aufgabe"><div class="sab-kopfzeile"><h2>${esc(st.name)}</h2>
        <button type="button" class="sab-zu" aria-label="Schließen">✕</button></div>
        <p class="klein">${esc(ANLEITUNG[st.typ])}</p><div class="sab-minispiel"></div></div>`;
      el.aufgabe.hidden = false;
      karteHerein(el.aufgabe.firstElementChild, 'aufgabe' + station + Date.now());
      const feld = el.aufgabe.querySelector('.sab-minispiel');
      const fertig = () => {
        socket.emit('kind:spiel', { art: 'aufgabeFertig', station }, (r) => {
          if (r && r.ok) G.melde(r.vorgetaeuscht ? 'Vorgetäuscht. Niemand hat etwas gemerkt …' : 'Erledigt!');
          schliesseAufgabe(false);
        });
      };
      aufgabe = { station, aufraeumen: MINISPIELE[st.typ](feld, fertig) };
      el.aufgabe.querySelector('.sab-zu').addEventListener('click', () => schliesseAufgabe(true));
    });
  }

  function schliesseAufgabe(melden) {
    if (!aufgabe) return;
    if (aufgabe.aufraeumen) aufgabe.aufraeumen();
    if (melden) socket.emit('kind:spiel', { art: 'aufgabeZu' });
    aufgabe = null;
    el.aufgabe.hidden = true;
    el.aufgabe.innerHTML = '';
  }

  function mische(a) {
    const b = a.slice();
    for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; }
    return b;
  }

  const MINISPIELE = {
    // Kreide wegwischen
    tafel(feld, fertig) {
      feld.innerHTML = '<div class="mini-tafel"><canvas width="320" height="200"></canvas></div>';
      const c = feld.querySelector('canvas');
      const g = c.getContext('2d');
      g.strokeStyle = 'rgba(255,255,255,0.9)';
      g.lineCap = 'round';
      g.lineJoin = 'round';
      for (let i = 0; i < 14; i++) {
        g.lineWidth = 5 + Math.random() * 7;
        g.beginPath();
        let x = 20 + Math.random() * 280;
        let y = 20 + Math.random() * 160;
        g.moveTo(x, y);
        for (let k = 0; k < 5; k++) { x = Math.max(10, Math.min(310, x + (Math.random() - 0.5) * 120)); y = Math.max(10, Math.min(190, y + (Math.random() - 0.5) * 80)); g.lineTo(x, y); }
        g.stroke();
      }
      const zaehle = () => { const d = g.getImageData(0, 0, 320, 200).data; let n = 0; for (let i = 3; i < d.length; i += 16) if (d[i] > 40) n++; return n; };
      const anfang = zaehle();
      let fertigGemeldet = false;
      let wischen = false;
      const wisch = (e) => {
        const r = c.getBoundingClientRect();
        const x = ((e.clientX - r.left) / r.width) * 320;
        const y = ((e.clientY - r.top) / r.height) * 200;
        g.globalCompositeOperation = 'destination-out';
        g.beginPath(); g.arc(x, y, 24, 0, Math.PI * 2); g.fill();
        g.globalCompositeOperation = 'source-over';
      };
      c.addEventListener('pointerdown', (e) => { wischen = true; c.setPointerCapture(e.pointerId); wisch(e); });
      c.addEventListener('pointermove', (e) => { if (wischen) wisch(e); });
      c.addEventListener('pointerup', () => { wischen = false; });
      const t = setInterval(() => {
        if (!fertigGemeldet && zaehle() < anfang * 0.06) { fertigGemeldet = true; fertig(); }
      }, 300);
      return () => clearInterval(t);
    },

    // gleiche Farben verbinden
    kabel(feld, fertig) {
      const farben = mische(['#E94F4F', '#3A7BD5', '#F5CB5E', '#5BAA4A']);
      const rechts = mische(farben);
      feld.innerHTML = `<div class="mini-kabel"><div class="links">${farben.map((f, i) => `<button type="button" data-seite="l" data-i="${i}" style="--farbe:${f}"></button>`).join('')}</div>
        <svg viewBox="0 0 100 100" preserveAspectRatio="none"></svg>
        <div class="rechts">${rechts.map((f, i) => `<button type="button" data-seite="r" data-i="${i}" style="--farbe:${f}"></button>`).join('')}</div></div>`;
      const svg = feld.querySelector('svg');
      let gewaehlt = null;
      const fest = new Set();
      const linie = (l, r, farbe) => {
        const y1 = 12.5 + l * 25;
        const y2 = 12.5 + r * 25;
        svg.insertAdjacentHTML('beforeend', `<path d="M0 ${y1} C 50 ${y1}, 50 ${y2}, 100 ${y2}" stroke="${farbe}" stroke-width="5" fill="none" stroke-linecap="round" vector-effect="non-scaling-stroke"/>`);
      };
      feld.addEventListener('click', (e) => {
        const b = e.target.closest('button');
        if (!b || b.disabled) return;
        const i = Number(b.dataset.i);
        if (b.dataset.seite === 'l') {
          feld.querySelectorAll('.links button').forEach((x) => x.classList.remove('aktiv'));
          gewaehlt = i;
          b.classList.add('aktiv');
        } else if (gewaehlt !== null) {
          if (rechts[i] === farben[gewaehlt]) {
            linie(gewaehlt, i, farben[gewaehlt]);
            fest.add(gewaehlt);
            feld.querySelector(`.links [data-i="${gewaehlt}"]`).disabled = true;
            b.disabled = true;
            if (fest.size === 4) setTimeout(fertig, 250);
          } else {
            b.classList.add('falsch');
            setTimeout(() => b.classList.remove('falsch'), 400);
          }
          feld.querySelectorAll('.links button').forEach((x) => x.classList.remove('aktiv'));
          gewaehlt = null;
        }
      });
      return null;
    },

    // Zahlen der Reihe nach
    zahlen(feld, fertig) {
      const zahlen = mische([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
      feld.innerHTML = `<div class="mini-zahlen">${zahlen.map((n) => `<button type="button" data-n="${n}">${n}</button>`).join('')}</div>`;
      let naechste = 1;
      feld.addEventListener('click', (e) => {
        const b = e.target.closest('button');
        if (!b || b.disabled) return;
        if (Number(b.dataset.n) === naechste) {
          b.disabled = true;
          b.classList.add('richtig');
          naechste++;
          if (naechste > 10) setTimeout(fertig, 200);
        } else {
          feld.querySelector('.mini-zahlen').classList.add('wackeln');
          setTimeout(() => feld.querySelector('.mini-zahlen').classList.remove('wackeln'), 350);
          feld.querySelectorAll('button').forEach((x) => { x.disabled = false; x.classList.remove('richtig'); });
          naechste = 1;
        }
      });
      return null;
    },

    // alle Schalter an
    schalter(feld, fertig) {
      const an = [0, 1, 2, 3, 4, 5].map(() => Math.random() < 0.35);
      if (an.every(Boolean)) an[2] = false;
      const male = () => {
        feld.innerHTML = `<div class="mini-schalter">${an.map((x, i) => `<button type="button" data-i="${i}" class="${x ? 'an' : ''}" aria-pressed="${x}"><i></i><span></span></button>`).join('')}</div>`;
      };
      male();
      feld.addEventListener('click', (e) => {
        const b = e.target.closest('button');
        if (!b) return;
        const i = Number(b.dataset.i);
        an[i] = !an[i];
        male();
        if (an.every(Boolean)) setTimeout(fertig, 300);
      });
      return null;
    },

    // Reihenfolge merken
    merken(feld, fertig) {
      feld.innerHTML = `<div class="mini-merken">${[0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => `<button type="button" data-i="${i}"></button>`).join('')}</div><p class="klein mini-status"></p>`;
      const felder = [...feld.querySelectorAll('.mini-merken button')];
      const status = feld.querySelector('.mini-status');
      let folge = [];
      let pos = 0;
      let zeigt = false;
      const zeiten = [];
      const leuchte = (i, ms) => { felder[i].classList.add('hell'); zeiten.push(setTimeout(() => felder[i].classList.remove('hell'), ms)); };
      const neu = () => {
        folge = Array.from({ length: 4 }, () => Math.floor(Math.random() * 9));
        pos = 0;
        zeigt = true;
        status.textContent = 'Gut aufpassen …';
        folge.forEach((i, k) => zeiten.push(setTimeout(() => leuchte(i, 450), 500 + k * 650)));
        zeiten.push(setTimeout(() => { zeigt = false; status.textContent = 'Jetzt du!'; }, 500 + folge.length * 650));
      };
      feld.addEventListener('click', (e) => {
        const b = e.target.closest('[data-i]');
        if (!b || zeigt) return;
        const i = Number(b.dataset.i);
        leuchte(i, 200);
        if (i === folge[pos]) {
          pos++;
          if (pos === folge.length) { status.textContent = 'Richtig!'; zeigt = true; setTimeout(fertig, 300); }
        } else {
          status.textContent = 'Falsch. Noch einmal!';
          zeigt = true;
          zeiten.push(setTimeout(neu, 800));
        }
      });
      neu();
      return () => zeiten.forEach(clearTimeout);
    },

    // gedrückt halten
    halten(feld, fertig) {
      feld.innerHTML = `<div class="mini-halten"><svg viewBox="0 0 120 120"><circle cx="60" cy="60" r="50" class="spur"/><circle cx="60" cy="60" r="50" class="fuell" pathLength="100"/></svg><button type="button">Gedrückt halten</button></div>`;
      const b = feld.querySelector('button');
      const kreis = feld.querySelector('.fuell');
      let start = 0;
      let wert = 0;
      let raf = 0;
      let gemeldet = false;
      const lauf = () => {
        if (start) wert = Math.min(1, wert + 1 / 180); // gut 3 Sekunden
        else wert = Math.max(0, wert - 1 / 60);
        kreis.style.strokeDashoffset = String(100 - wert * 100);
        kreis.style.opacity = wert > 0.005 ? '1' : '0';
        if (wert >= 1 && !gemeldet) { gemeldet = true; fertig(); return; }
        raf = requestAnimationFrame(lauf);
      };
      b.addEventListener('pointerdown', (e) => { e.preventDefault(); start = 1; b.classList.add('gedrueckt'); });
      const los = () => { start = 0; b.classList.remove('gedrueckt'); };
      b.addEventListener('pointerup', los);
      b.addEventListener('pointerleave', los);
      b.addEventListener('pointercancel', los);
      b.addEventListener('contextmenu', (e) => e.preventDefault());
      raf = requestAnimationFrame(lauf);
      return () => cancelAnimationFrame(raf);
    },
  };

  // minispiele ist für das Ausprobieren der Aufgaben im Browser gedacht
  window.Saboteur = { init, male, minispiele: MINISPIELE };
})();
