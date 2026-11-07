'use strict';
// Schiffe versenken: Jede Seite stellt ihre Flotte auf (zufällig, neu mischen geht), dann wird
// abwechselnd geschossen. Ein Treffer erlaubt einen weiteren Schuss (einstellbar).
// Schiffe berühren sich nicht, auch nicht über Eck. Läuft als Turnier (siehe turnier.js).

const crypto = require('crypto');
const { zahl } = require('./basis');
const TurnierSpiel = require('./turnier');

const MIN = 2;
const GROESSEN = {
  klein: { n: 8, schiffe: [4, 3, 3, 2, 2] },
  gross: { n: 10, schiffe: [5, 4, 3, 3, 2, 2] },
};
// Zellen im Schussfeld: 0 unbekannt, 1 Wasser, 2 Treffer, 3 versenkt
const WASSER = 1;
const TREFFER = 2;
const VERSENKT = 3;

function nachbarn(i, n) {
  const z = Math.floor(i / n);
  const s = i % n;
  const r = [];
  for (let dz = -1; dz <= 1; dz++) {
    for (let ds = -1; ds <= 1; ds++) {
      if (!dz && !ds) continue;
      const zz = z + dz;
      const ss = s + ds;
      if (zz >= 0 && zz < n && ss >= 0 && ss < n) r.push(zz * n + ss);
    }
  }
  return r;
}

// Flotte zufällig aufstellen, ohne dass sich Schiffe berühren
function stelleAuf(n, laengen) {
  for (let versuch = 0; versuch < 200; versuch++) {
    const belegt = new Array(n * n).fill(false);
    const gesperrt = new Array(n * n).fill(false);
    const flotte = [];
    let ok = true;
    for (const laenge of laengen) {
      const moeglich = [];
      for (let z = 0; z < n; z++) {
        for (let s = 0; s < n; s++) {
          for (const quer of [true, false]) {
            const felder = [];
            for (let k = 0; k < laenge; k++) felder.push(quer ? z * n + s + k : (z + k) * n + s);
            if (quer ? s + laenge > n : z + laenge > n) continue;
            if (felder.every((f) => !gesperrt[f])) moeglich.push(felder);
          }
        }
      }
      if (!moeglich.length) { ok = false; break; }
      const felder = moeglich[crypto.randomInt(moeglich.length)];
      for (const f of felder) {
        belegt[f] = true;
        gesperrt[f] = true;
        for (const x of nachbarn(f, n)) gesperrt[x] = true;
      }
      flotte.push({ felder, treffer: [] });
    }
    if (ok) return flotte;
  }
  return null;
}

class SchiffeSpiel extends TurnierSpiel {
  static vorlage() {
    return { runden: 3, sekunden: 30, groesse: 'klein', nochmal: true };
  }

  static uebernimm(z, d) {
    if (d.runden !== undefined) z.runden = zahl(d.runden, 1, 9, 3);
    if (d.sekunden !== undefined) z.sekunden = zahl(d.sekunden, 10, 90, 30);
    if (d.groesse === 'klein' || d.groesse === 'gross') z.groesse = d.groesse;
    if (typeof d.nochmal === 'boolean') z.nochmal = d.nochmal;
  }

  static pruefeStart(anzahl) {
    return anzahl < MIN ? 'Für Schiffe versenken braucht es mindestens 2 Mitspielende.' : null;
  }

  constructor(hub, e) {
    super(hub, e);
    this.art = 'schiffe';
    this.g = GROESSEN[e.groesse] || GROESSEN.klein;
  }

  neuePartie(p) {
    const n = this.g.n;
    p.stufe = 'aufstellen';
    p.flotte = { [p.a]: stelleAuf(n, this.g.schiffe), [p.b]: stelleAuf(n, this.g.schiffe) };
    p.bereit = { [p.a]: false, [p.b]: false };
    p.feld = { [p.a]: new Array(n * n).fill(0), [p.b]: new Array(n * n).fill(0) }; // Schüsse VON id
    p.letzter = null;
    this.uhr(p, Math.max(45000, this.zugMs()));
  }

  zug(p, id, d, art) {
    if (p.stufe === 'aufstellen') {
      if (art === 'mischen' && !p.bereit[id]) {
        p.flotte[id] = stelleAuf(this.g.n, this.g.schiffe);
        return { ok: true };
      }
      if (art === 'bereit') {
        p.bereit[id] = true;
        if (p.bereit[p.a] && p.bereit[p.b]) this.losGehts(p);
        return { ok: true };
      }
      return { ok: false };
    }
    if (art !== 'schuss' || p.dran !== id) return { ok: false };
    const f = Number(d.feld);
    if (!Number.isInteger(f) || f < 0 || f >= this.g.n * this.g.n) return { ok: false };
    if (p.feld[id][f]) return { ok: false, fehler: 'Da hast du schon hingeschossen.' };
    this.schiesse(p, f);
    return { ok: true };
  }

  losGehts(p) {
    p.stufe = 'schiessen';
    p.dran = p.a;
    this.uhr(p);
  }

  schiesse(p, f) {
    const von = p.dran;
    const ziel = this.gegner(p, von);
    const feld = p.feld[von];
    const schiff = p.flotte[ziel].find((s) => s.felder.includes(f));
    p.letzter = { von, feld: f, treffer: !!schiff, versenkt: false };
    if (!schiff) {
      feld[f] = WASSER;
      p.dran = ziel;
      return this.uhr(p);
    }
    schiff.treffer.push(f);
    feld[f] = TREFFER;
    if (schiff.treffer.length === schiff.felder.length) {
      // Versenkt: Schiff markieren, Wasser drumherum aufdecken (dort kann nichts liegen)
      p.letzter.versenkt = schiff.felder.length;
      for (const x of schiff.felder) feld[x] = VERSENKT;
      for (const x of schiff.felder) for (const y of nachbarn(x, this.g.n)) if (!feld[y]) feld[y] = WASSER;
      if (p.flotte[ziel].every((s) => s.treffer.length === s.felder.length)) return this.partieEnde(p, von, 'versenkt');
    }
    if (!this.e.nochmal) p.dran = ziel;
    this.uhr(p);
  }

  // Zeit abgelaufen: beim Aufstellen gilt die Flotte, beim Schießen ein Feld neben einem Treffer oder zufällig
  autoZug(p) {
    if (p.stufe === 'aufstellen') {
      p.bereit[p.a] = true;
      p.bereit[p.b] = true;
      this.losGehts(p);
      return this.hub.aktualisiere();
    }
    const feld = p.feld[p.dran];
    const n = this.g.n;
    const frei = [];
    const naheTreffer = [];
    feld.forEach((x, i) => {
      if (x) return;
      frei.push(i);
      const z = Math.floor(i / n);
      const s = i % n;
      const kreuz = [[z - 1, s], [z + 1, s], [z, s - 1], [z, s + 1]].filter(([a, b]) => a >= 0 && a < n && b >= 0 && b < n);
      if (kreuz.some(([a, b]) => feld[a * n + b] === TREFFER)) naheTreffer.push(i);
    });
    const wahl = naheTreffer.length ? naheTreffer : frei;
    if (!wahl.length) return this.partieEnde(p, null, 'voll');
    this.schiesse(p, wahl[crypto.randomInt(wahl.length)]);
    this.hub.aktualisiere();
  }

  rest(p, id) {
    return p.flotte[id].filter((s) => s.treffer.length < s.felder.length).map((s) => s.felder.length).sort((a, b) => b - a);
  }

  partieSicht(p, fuerId) {
    const n = this.g.n;
    const s = {
      n, stufe: p.stufe, letzter: p.letzter, bereit: p.bereit,
      // Öffentlich: wohin wer geschossen hat und welche Schiffe noch schwimmen
      feld: p.feld, rest: { [p.a]: this.rest(p, p.a), [p.b]: this.rest(p, p.b) }, schiffe: this.g.schiffe,
    };
    if (fuerId) s.flotte = p.flotte[fuerId].map((x) => x.felder);
    // Nach der Partie dürfen alle sehen, wo die Schiffe lagen
    if (p.fertig) s.alle = { [p.a]: p.flotte[p.a].map((x) => x.felder), [p.b]: p.flotte[p.b].map((x) => x.felder) };
    return s;
  }
}

SchiffeSpiel.GROESSEN = GROESSEN;
module.exports = SchiffeSpiel;
