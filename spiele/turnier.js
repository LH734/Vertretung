'use strict';
// Turnier für Zwei-Personen-Spiele (Vier in einer Reihe, Schiffe versenken).
// Alle spielen gleichzeitig, jeweils zu zweit. Gepaart wird nach dem Schweizer System:
// Wer gleich viele Punkte hat, spielt gegeneinander, niemand zweimal gegen dieselbe Person,
// und niemand scheidet aus. Bei ungerader Zahl bekommt eine Person ein Freilos.
//
// Unterklassen liefern die eigentliche Partie:
//   neuePartie(p)            Brett usw. in p anlegen, p.dran setzen, this.uhr(p) aufrufen
//   zug(p, id, d)            Zug ausführen, gibt { ok, fehler } zurück; am Ende this.partieEnde(p, sieger)
//   autoZug(p)               Zeit abgelaufen: für die Person entscheiden, die dran ist
//   partieSicht(p, fuerId)   Was ein Handy (oder mit fuerId = null die Bühne) von der Partie sieht

const { BasisSpiel } = require('./basis');
const { mische } = require('./werkzeuge');

const ZWISCHEN_MS = 15000;
const SIEG = 2;
const REMIS = 1;

class TurnierSpiel extends BasisSpiel {
  constructor(hub, e) {
    super(hub, { ...e });
    this.runden = e.runden || 3;
    this.tabelle = new Map(); // id -> { punkte, siege, remis, niederlagen, gegner: [], freilos }
    this.partien = [];
    this.freilos = null;
    this.naechsteId = 1;
  }

  zugMs() { return this.e.sekunden * 1000; }

  starte() {
    for (const s of mische(this.online())) this.neuerTeilnehmer(s.id);
    this.neueRunde();
  }

  neuerTeilnehmer(id) {
    if (!this.tabelle.has(id)) this.tabelle.set(id, { punkte: 0, siege: 0, remis: 0, niederlagen: 0, gegner: [], freilos: false });
  }

  dabei(id) { return this.tabelle.has(id) && !!this.hub.holeSpieler(id); }

  // Feinwertung: Summe der Punkte aller bisherigen Gegner
  buchholz(id) {
    return this.tabelle.get(id).gegner.reduce((n, g) => n + (this.tabelle.has(g) ? this.tabelle.get(g).punkte : 0), 0);
  }

  rangfolge() {
    return [...this.tabelle.keys()].filter((id) => this.hub.holeSpieler(id))
      .map((id) => ({ id, ...this.tabelle.get(id), buchholz: this.buchholz(id) }))
      .sort((a, b) => b.punkte - a.punkte || b.buchholz - a.buchholz || b.siege - a.siege || this.name(a.id).localeCompare(this.name(b.id), 'de'));
  }

  // Schweizer System: von oben nach unten paaren, keine Wiederholung, wenn es sich vermeiden lässt
  paare() {
    let liste = this.rangfolge().map((r) => r.id);
    this.freilos = null;
    if (liste.length % 2 === 1) {
      // Freilos für die am schlechtesten platzierte Person, die noch keins hatte
      const kandidat = [...liste].reverse().find((id) => !this.tabelle.get(id).freilos) || liste[liste.length - 1];
      this.freilos = kandidat;
      liste = liste.filter((id) => id !== kandidat);
    }
    let versuche = 0;
    const gespielt = (a, b) => this.tabelle.get(a).gegner.includes(b);
    const suche = (rest) => {
      if (!rest.length) return [];
      if (++versuche > 5000) return null;
      const [a, ...andere] = rest;
      for (const b of andere) {
        if (gespielt(a, b)) continue;
        const weiter = suche(andere.filter((x) => x !== b));
        if (weiter) return [[a, b], ...weiter];
      }
      return null;
    };
    let paare = suche(liste);
    if (!paare) {
      // Geht nicht ohne Wiederholung: einfach der Reihe nach
      paare = [];
      for (let i = 0; i + 1 < liste.length; i += 2) paare.push([liste[i], liste[i + 1]]);
    }
    return paare;
  }

  neueRunde() {
    if (this.rangfolge().length < 2) {
      // Nur noch eine Person da: Turnier vorbei
      const r = this.rangfolge();
      this.sieger = r.length ? r[0].id : null;
      return this.setzePhase('ende', 0);
    }
    this.runde++;
    const paare = this.paare();
    this.partien = paare.map(([x, y]) => {
      // Wer seltener angefangen hat, fängt an
      const tx = this.tabelle.get(x);
      const ty = this.tabelle.get(y);
      const anfang = (tx.anfaenge || 0) <= (ty.anfaenge || 0) ? x : y;
      const p = { id: this.naechsteId++, a: anfang, b: anfang === x ? y : x, dran: anfang, fertig: false, sieger: undefined, bis: 0, dauer: 1 };
      this.tabelle.get(anfang).anfaenge = (this.tabelle.get(anfang).anfaenge || 0) + 1;
      this.neuePartie(p);
      return p;
    });
    if (this.freilos) {
      const t = this.tabelle.get(this.freilos);
      t.freilos = true;
      t.punkte += SIEG;
      this.gibPunkte(this.freilos, SIEG * 10);
    }
    this.setzePhase('spielen', 0);
  }

  // Zugzeit für eine Partie neu starten
  uhr(p, ms) {
    p.dauer = ms || this.zugMs();
    p.bis = Date.now() + p.dauer;
  }

  partieVon(id) {
    return this.partien.find((p) => p.a === id || p.b === id) || null;
  }

  gegner(p, id) { return p.a === id ? p.b : p.a; }

  // sieger: id oder null bei Unentschieden
  partieEnde(p, sieger, grund) {
    if (p.fertig) return;
    p.fertig = true;
    p.sieger = sieger;
    p.grund = grund || '';
    p.bis = 0;
    for (const id of [p.a, p.b]) {
      const t = this.tabelle.get(id);
      if (!t) continue;
      t.gegner.push(this.gegner(p, id));
      if (sieger === null) { t.remis++; t.punkte += REMIS; this.gibPunkte(id, REMIS * 10); }
      else if (sieger === id) { t.siege++; t.punkte += SIEG; this.gibPunkte(id, SIEG * 10); }
      else t.niederlagen++;
    }
    if (this.partien.every((x) => x.fertig)) this.rundeFertig();
    else this.hub.aktualisiere();
  }

  rundeFertig() {
    if (this.runde >= this.runden) {
      const r = this.rangfolge();
      this.sieger = r.length ? r[0].id : null;
      return this.setzePhase('ende', 0);
    }
    this.setzePhase('zwischenstand', ZWISCHEN_MS);
  }

  tick(jetzt) {
    if (this.beendet) return;
    if (this.phase === 'spielen') {
      for (const p of this.partien) if (!p.fertig && p.bis && jetzt >= p.bis) this.autoZug(p);
      return;
    }
    if (this.abgelaufen(jetzt)) this.ueberspringe();
  }

  // Pause: alle Zugzeiten mitverschieben
  verschiebe(ms) {
    super.verschiebe(ms);
    for (const p of this.partien) if (p.bis) p.bis += ms;
  }

  ueberspringe() {
    if (this.phase === 'spielen') {
      // „Weiter“ der Leitung: In jeder Partie wird für die Person gezogen, die dran ist
      for (const p of this.partien.slice()) if (!p.fertig) this.autoZug(p);
    } else if (this.phase === 'zwischenstand') {
      this.neueRunde();
    }
  }

  kindEreignis(spieler, art, d) {
    if (this.phase !== 'spielen') return { ok: false };
    const p = this.partieVon(spieler.id);
    if (!p || p.fertig) return { ok: false };
    if (art === 'aufgeben') {
      this.partieEnde(p, this.gegner(p, spieler.id), 'aufgegeben');
      return { ok: true };
    }
    const erg = this.zug(p, spieler.id, d || {}, art) || { ok: false };
    if (erg.ok) this.hub.aktualisiere();
    return erg;
  }

  // Wer später kommt, steigt in der nächsten Runde mit 0 Punkten ein
  spielerDa(id) {
    if (id && !this.tabelle.has(id) && this.phase !== 'ende' && this.hub.holeSpieler(id)) this.neuerTeilnehmer(id);
  }

  spielerWeg(id, endgueltig) {
    if (!endgueltig || !this.tabelle.has(id)) return;
    const p = this.partieVon(id);
    if (p && !p.fertig) this.partieEnde(p, this.gegner(p, id), 'gegangen');
    this.tabelle.delete(id);
    if (this.freilos === id) this.freilos = null;
  }

  tabellenSicht() {
    return this.rangfolge().map((r, i) => ({
      platz: i + 1, id: r.id, name: this.name(r.id), punkte: r.punkte, siege: r.siege, remis: r.remis, niederlagen: r.niederlagen, buchholz: r.buchholz,
    }));
  }

  sicht(rolle, spielerId) {
    const s = this.grundSicht();
    s.art = this.art;
    s.runden = this.runden;
    s.tabelle = this.tabellenSicht();
    s.freilos = this.freilos ? { id: this.freilos, name: this.name(this.freilos) } : null;
    const jetzt = this.jetzt();
    const kopf = (p) => ({
      id: p.id, a: { id: p.a, name: this.name(p.a) }, b: { id: p.b, name: this.name(p.b) }, dran: p.dran, fertig: p.fertig,
      sieger: p.sieger === undefined ? undefined : p.sieger, grund: p.grund, restMs: p.bis ? Math.max(0, p.bis - jetzt) : 0, dauer: p.dauer,
    });
    s.partien = this.partien.map((p) => ({ ...kopf(p), ...this.partieSicht(p, null) }));
    if (this.phase === 'ende') s.sieger = this.sieger ? this.name(this.sieger) : null;
    if (rolle === 'kind') {
      const p = this.phase === 'spielen' || this.phase === 'zwischenstand' || this.phase === 'ende' ? this.partieVon(spielerId) : null;
      s.ich = { dabei: this.tabelle.has(spielerId), freilos: this.freilos === spielerId };
      if (p) {
        s.meine = { ...kopf(p), ...this.partieSicht(p, spielerId) };
        // Die Uhr oben zeigt die Zugzeit der eigenen Partie
        if (this.phase === 'spielen' && !p.fertig) { s.restMs = s.meine.restMs; s.phasenDauer = p.dauer; }
      }
    }
    return s;
  }
}

TurnierSpiel.SIEG = SIEG;
module.exports = TurnierSpiel;
