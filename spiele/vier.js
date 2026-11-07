'use strict';
// Vier in einer Reihe: Steine in Spalten fallen lassen, vier in einer Linie gewinnen.
// Läuft als Turnier (siehe turnier.js): Alle spielen gleichzeitig zu zweit.

const crypto = require('crypto');
const { zahl } = require('./basis');
const TurnierSpiel = require('./turnier');

const SPALTEN = 7;
const ZEILEN = 6;
const MIN = 2;

class VierSpiel extends TurnierSpiel {
  static vorlage() {
    return { runden: 3, sekunden: 30 };
  }

  static uebernimm(z, d) {
    if (d.runden !== undefined) z.runden = zahl(d.runden, 1, 9, 3);
    if (d.sekunden !== undefined) z.sekunden = zahl(d.sekunden, 10, 90, 30);
  }

  static pruefeStart(anzahl) {
    return anzahl < MIN ? 'Für Vier in einer Reihe braucht es mindestens 2 Mitspielende.' : null;
  }

  constructor(hub, e) {
    super(hub, e);
    this.art = 'vier';
  }

  // Brett: Zeile 0 ist oben. 0 = leer, 1 = Stein von a, 2 = Stein von b
  neuePartie(p) {
    p.brett = new Array(SPALTEN * ZEILEN).fill(0);
    p.letzter = -1;
    p.linie = null;
    this.uhr(p);
  }

  static frei(brett, spalte) {
    for (let z = ZEILEN - 1; z >= 0; z--) if (!brett[z * SPALTEN + spalte]) return z;
    return -1;
  }

  // Vier gleiche ab Feld i? Gibt die Felder der Linie zurück
  static linie(brett, i) {
    const farbe = brett[i];
    const z0 = Math.floor(i / SPALTEN);
    const s0 = i % SPALTEN;
    for (const [dz, ds] of [[0, 1], [1, 0], [1, 1], [1, -1]]) {
      const felder = [i];
      for (const r of [1, -1]) {
        let z = z0 + dz * r;
        let sp = s0 + ds * r;
        while (z >= 0 && z < ZEILEN && sp >= 0 && sp < SPALTEN && brett[z * SPALTEN + sp] === farbe) {
          felder.push(z * SPALTEN + sp);
          z += dz * r;
          sp += ds * r;
        }
      }
      if (felder.length >= 4) return felder;
    }
    return null;
  }

  setze(p, spalte) {
    const z = VierSpiel.frei(p.brett, spalte);
    if (z < 0) return false;
    const i = z * SPALTEN + spalte;
    p.brett[i] = p.dran === p.a ? 1 : 2;
    p.letzter = i;
    const linie = VierSpiel.linie(p.brett, i);
    if (linie) {
      p.linie = linie;
      this.partieEnde(p, p.dran, 'vier');
    } else if (p.brett.every((x) => x)) {
      this.partieEnde(p, null, 'voll');
    } else {
      p.dran = this.gegner(p, p.dran);
      this.uhr(p);
    }
    return true;
  }

  zug(p, id, d, art) {
    if (art !== 'setzen' || p.dran !== id) return { ok: false };
    const spalte = Number(d.spalte);
    if (!Number.isInteger(spalte) || spalte < 0 || spalte >= SPALTEN) return { ok: false };
    return this.setze(p, spalte) ? { ok: true } : { ok: false, fehler: 'Diese Spalte ist voll.' };
  }

  // Zeit abgelaufen: eine zufällige freie Spalte, die Mitte etwas häufiger
  autoZug(p) {
    const frei = [];
    for (let s = 0; s < SPALTEN; s++) if (VierSpiel.frei(p.brett, s) >= 0) frei.push(s, ...(Math.abs(s - 3) <= 1 ? [s] : []));
    if (!frei.length) return this.partieEnde(p, null, 'voll');
    this.setze(p, frei[crypto.randomInt(frei.length)]);
  }

  partieSicht(p) {
    return { brett: p.brett, letzter: p.letzter, linie: p.linie };
  }
}

VierSpiel.SPALTEN = SPALTEN;
VierSpiel.ZEILEN = ZEILEN;
module.exports = VierSpiel;
