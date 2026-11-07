/* Karte für Saboteur: das Schulhaus bei Nacht.
   Diese Datei nutzen Server (Bewegung, Sicht) und Browser (Zeichnen) gemeinsam.
   Maßeinheit sind Kacheln, (0, 0) ist oben links. Rechtecke: x, y, b(reite), h(öhe). */
(function (wurzel) {
  'use strict';

  const BREITE = 56;
  const HOEHE = 36;
  const LEER = 0; // Wand oder draußen
  const BODEN = 1;
  const TISCH = 2; // man kommt nicht durch, kann aber darüber sehen
  const REGAL = 3; // versperrt Weg und Sicht

  const raeume = [
    { name: 'Klassenzimmer 6a', x: 2, y: 2, b: 10, h: 13, farbe: '#FFF4CC' },
    { name: 'Lehrerzimmer', x: 13, y: 2, b: 10, h: 13, farbe: '#E4F1FB' },
    { name: 'Sekretariat', x: 24, y: 6, b: 8, h: 9, farbe: '#FDE3E3' },
    { name: 'Bibliothek', x: 33, y: 2, b: 11, h: 13, farbe: '#EAF6E4' },
    { name: 'Musikraum', x: 45, y: 2, b: 9, h: 13, farbe: '#F1E8FD' },
    { name: 'Flur', x: 2, y: 16, b: 52, h: 4, farbe: '#F7F5EE' },
    { name: 'Mensa', x: 2, y: 21, b: 13, h: 13, farbe: '#FFEEDD' },
    { name: 'Küche', x: 16, y: 21, b: 7, h: 9, farbe: '#E3F5F3' },
    { name: 'Toiletten', x: 24, y: 21, b: 5, h: 8, farbe: '#EAF0F7' },
    { name: 'Werkraum', x: 30, y: 21, b: 9, h: 13, farbe: '#F6EADF' },
    { name: 'Turnhalle', x: 40, y: 21, b: 14, h: 13, farbe: '#FFF8E3' },
  ];

  // Türen überbrücken die Wandlinie zwischen Raum und Flur oder zwei Räumen.
  const tueren = [
    { x: 6, y: 15, b: 2, h: 1 }, { x: 17, y: 15, b: 2, h: 1 }, { x: 27, y: 15, b: 2, h: 1 },
    { x: 38, y: 15, b: 2, h: 1 }, { x: 49, y: 15, b: 2, h: 1 },
    { x: 5, y: 20, b: 3, h: 1 }, { x: 19, y: 20, b: 2, h: 1 }, { x: 25, y: 20, b: 2, h: 1 },
    { x: 33, y: 20, b: 2, h: 1 }, { x: 43, y: 20, b: 2, h: 1 }, { x: 50, y: 20, b: 2, h: 1 },
    { x: 23, y: 10, b: 1, h: 2 }, // Lehrerzimmer – Sekretariat
    { x: 15, y: 25, b: 1, h: 2 }, // Mensa – Küche
    { x: 39, y: 28, b: 1, h: 2 }, // Werkraum – Turnhalle
  ];

  const moebel = [
    // Klassenzimmer: Pulte und Lehrertisch
    { x: 4, y: 6, b: 2, h: 1, art: TISCH }, { x: 8, y: 6, b: 2, h: 1, art: TISCH },
    { x: 4, y: 9, b: 2, h: 1, art: TISCH }, { x: 8, y: 9, b: 2, h: 1, art: TISCH },
    { x: 3, y: 3, b: 2, h: 1, art: TISCH },
    // Lehrerzimmer: großer Konferenztisch und Schrank
    { x: 16, y: 6, b: 4, h: 3, art: TISCH }, { x: 13, y: 2, b: 1, h: 4, art: REGAL },
    // Sekretariat: Aktenschrank
    { x: 24, y: 6, b: 3, h: 1, art: REGAL },
    // Bibliothek: Regale
    { x: 35, y: 4, b: 1, h: 6, art: REGAL }, { x: 38, y: 4, b: 1, h: 6, art: REGAL }, { x: 41, y: 4, b: 1, h: 6, art: REGAL },
    // Musikraum: Klavier
    { x: 47, y: 5, b: 3, h: 2, art: TISCH },
    // Mensa: Tische
    { x: 3, y: 23, b: 3, h: 1, art: TISCH }, { x: 11, y: 23, b: 3, h: 1, art: TISCH },
    { x: 3, y: 31, b: 3, h: 1, art: TISCH }, { x: 11, y: 31, b: 3, h: 1, art: TISCH },
    // Küche: Arbeitsplatte
    { x: 16, y: 27, b: 5, h: 1, art: TISCH },
    // Werkraum: Werkbank und Schrank
    { x: 32, y: 26, b: 4, h: 1, art: TISCH }, { x: 38, y: 21, b: 1, h: 4, art: REGAL },
    // Turnhalle: Kasten und Mattenwagen
    { x: 46, y: 26, b: 2, h: 2, art: TISCH }, { x: 40, y: 31, b: 3, h: 2, art: REGAL },
  ];

  // Stationen mit Aufgaben. typ bestimmt das Minispiel.
  const stationen = [
    { name: 'Tafel wischen', typ: 'tafel', x: 7, y: 2.8 },
    { name: 'Beamer anschließen', typ: 'kabel', x: 10.5, y: 13.5 },
    { name: 'Kaffeemaschine entkalken', typ: 'halten', x: 21.2, y: 3.2 },
    { name: 'Klassenarbeiten sortieren', typ: 'zahlen', x: 14.8, y: 13.5 },
    { name: 'Kopierer reparieren', typ: 'schalter', x: 30.8, y: 13.5 },
    { name: 'Bücher zurückstellen', typ: 'zahlen', x: 43, y: 13.3 },
    { name: 'Verstärker verkabeln', typ: 'kabel', x: 52.8, y: 3.2 },
    { name: 'Melodie nachspielen', typ: 'merken', x: 46.5, y: 13.3 },
    { name: 'Tische abwischen', typ: 'tafel', x: 13.6, y: 27.5 },
    { name: 'Herd ausschalten', typ: 'schalter', x: 21.8, y: 22.2 },
    { name: 'Wasserhahn zudrehen', typ: 'halten', x: 26.5, y: 27.8 },
    { name: 'Sicherungen prüfen', typ: 'schalter', x: 37.5, y: 32.8 },
    { name: 'Bälle aufpumpen', typ: 'halten', x: 52.8, y: 32.8 },
    { name: 'Geräteraum aufschließen', typ: 'merken', x: 41.2, y: 22.2 },
    { name: 'Schließfach öffnen', typ: 'merken', x: 31, y: 16.7 },
    { name: 'Fundkiste sortieren', typ: 'zahlen', x: 10, y: 19.3 },
  ];

  const knopf = { name: 'Durchsage', x: 28, y: 9.5 };

  // Geheime Gänge: nur Saboteure können von einem Ende zum anderen schlüpfen
  const gaenge = [
    [{ x: 3, y: 13.5 }, { x: 27.5, y: 22 }], // Klassenzimmer – Toiletten
    [{ x: 34, y: 13.5 }, { x: 17, y: 22.5 }], // Bibliothek – Küche
    [{ x: 53, y: 13.5 }, { x: 31, y: 32.5 }], // Musikraum – Werkraum
  ];

  // Wo Sabotagen behoben werden
  const reparatur = {
    licht: { name: 'Hauptschalter', x: 31, y: 22.3 },
    alarm: [{ name: 'Alarmknopf', x: 21.5, y: 13.5 }, { name: 'Alarmknopf', x: 52.8, y: 22.2 }],
  };
  const tisch = { x: 8.5, y: 27.5 }; // Treffpunkt in der Mensa

  // ---------------------------------------------------------------
  const raster = new Uint8Array(BREITE * HOEHE);
  function fuelle(r, wert) {
    for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.b; x++) raster[y * BREITE + x] = wert;
  }
  raeume.forEach((r) => fuelle(r, BODEN));
  tueren.forEach((r) => fuelle(r, BODEN));
  moebel.forEach((r) => fuelle(r, r.art));

  function kachel(x, y) {
    const kx = Math.floor(x);
    const ky = Math.floor(y);
    if (kx < 0 || ky < 0 || kx >= BREITE || ky >= HOEHE) return LEER;
    return raster[ky * BREITE + kx];
  }
  function begehbar(x, y) { return kachel(x, y) === BODEN; }
  function durchsichtig(x, y) { const k = kachel(x, y); return k === BODEN || k === TISCH; }

  const RADIUS = 0.28; // halbe Breite einer Figur
  function frei(x, y) {
    return begehbar(x - RADIUS, y - RADIUS) && begehbar(x + RADIUS, y - RADIUS) &&
      begehbar(x - RADIUS, y + RADIUS) && begehbar(x + RADIUS, y + RADIUS);
  }

  function wegFrei(x0, y0, x1, y1) {
    const d = Math.hypot(x1 - x0, y1 - y0);
    const n = Math.max(1, Math.ceil(d / 0.12));
    for (let i = 1; i <= n; i++) {
      if (!frei(x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n)) return false;
    }
    return true;
  }

  function sichtFrei(x0, y0, x1, y1) {
    const d = Math.hypot(x1 - x0, y1 - y0);
    const n = Math.max(1, Math.ceil(d / 0.2));
    for (let i = 1; i < n; i++) {
      if (!durchsichtig(x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n)) return false;
    }
    return true;
  }

  // Bewegung mit Gleiten an Wänden entlang (für das Handy)
  function bewege(x, y, dx, dy) {
    let nx = x;
    let ny = y;
    if (frei(x + dx, y)) nx = x + dx;
    if (frei(nx, y + dy)) ny = y + dy;
    return { x: nx, y: ny };
  }

  // Wie weit reicht der Blick in eine Richtung? (für die Dunkelheit)
  function strahl(x, y, winkel, weite) {
    const dx = Math.cos(winkel);
    const dy = Math.sin(winkel);
    for (let t = 0.1; t < weite; t += 0.08) {
      if (!durchsichtig(x + dx * t, y + dy * t)) return Math.min(weite, t + 0.2);
    }
    return weite;
  }

  function startPlatz(i, n) {
    const w = (i / Math.max(1, n)) * Math.PI * 2 - Math.PI / 2;
    return { x: tisch.x + Math.cos(w) * 2.3, y: tisch.y + Math.sin(w) * 2.3 };
  }

  function raumAn(x, y) {
    const r = raeume.find((q) => x >= q.x && x < q.x + q.b && y >= q.y && y < q.y + q.h);
    return r ? r.name : 'Flur';
  }
  stationen.forEach((s) => { s.raum = raumAn(s.x, s.y); });
  gaenge.forEach((paar) => paar.forEach((e) => { e.raum = raumAn(e.x, e.y); }));
  reparatur.licht.raum = raumAn(reparatur.licht.x, reparatur.licht.y);
  reparatur.alarm.forEach((a) => { a.raum = raumAn(a.x, a.y); });

  const karte = {
    BREITE, HOEHE, LEER, BODEN, TISCH, REGAL, RADIUS,
    raeume, tueren, moebel, stationen, knopf, tisch, gaenge, reparatur,
    kachel, begehbar, durchsichtig, frei, wegFrei, sichtFrei, bewege, strahl, startPlatz, raumAn,
  };
  if (typeof module === 'object' && module.exports) module.exports = karte;
  else wurzel.SchulKarte = karte;
})(typeof window !== 'undefined' ? window : globalThis);
