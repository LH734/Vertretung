'use strict';
// Bluffwürfel: Alle würfeln verdeckt mit ihren Würfeln. Reihum wird geboten, wie viele Würfel
// einer Augenzahl insgesamt auf dem Tisch liegen („vier Fünfen“). Wer nicht höher bieten will,
// ruft „Lüge!“. Dann wird aufgedeckt, und wer falsch lag, gibt einen Würfel ab.
// Statt der Sechs hat jeder Würfel einen Stern. Mit Jokern zählt der Stern bei jeder Zahl mit.
// Man kann auch nur auf Sterne bieten: Ein Stern-Gebot zählt doppelt (wie auf dem Spielbrett,
// wo die Sternfelder zwischen den Zahlenfeldern liegen). Intern ist der Stern die 6.

const crypto = require('crypto');
const { BasisSpiel, zahl } = require('./basis');
const { mische } = require('./werkzeuge');

const AUFDECKEN_MS = 10000;
const STERN = 6;
const MIN = 2;

class BluffSpiel extends BasisSpiel {
  static vorlage() {
    return { wuerfel: 5, joker: true, sekunden: 45 };
  }

  static uebernimm(z, d) {
    if (d.wuerfel !== undefined) z.wuerfel = zahl(d.wuerfel, 2, 6, 5);
    if (typeof d.joker === 'boolean') z.joker = d.joker;
    if (d.sekunden !== undefined) z.sekunden = zahl(d.sekunden, 20, 120, 45);
  }

  static pruefeStart(anzahl) {
    return anzahl < MIN ? `Für Bluffwürfel braucht es mindestens ${MIN} Mitspielende.` : null;
  }

  constructor(hub, e) {
    super(hub, { ...e, runden: 1 });
    this.anzahl = new Map(); // id -> Würfel, die noch übrig sind
    this.wuerfel = new Map(); // id -> Augen dieser Runde
    this.reihe = [];
    this.gebot = null;
    this.verlauf = [];
  }

  zugMs() { return this.e.sekunden * 1000; }

  starte() {
    this.reihe = mische(this.online().map((s) => s.id));
    for (const id of this.reihe) this.anzahl.set(id, this.e.wuerfel);
    this.runde = 1;
    this.neueRunde(this.reihe[0]);
  }

  lebt(id) { return (this.anzahl.get(id) || 0) > 0 && !!this.hub.holeSpieler(id); }
  istDa(id) { const s = this.hub.holeSpieler(id); return !!(s && s.socketId); }
  lebende() { return this.reihe.filter((id) => this.lebt(id)); }
  gesamt() { return this.lebende().reduce((n, id) => n + this.anzahl.get(id), 0); }

  naechster(id) {
    const n = this.reihe.length;
    const start = Math.max(0, this.reihe.indexOf(id));
    let ersatz = null;
    for (let i = 1; i <= n; i++) {
      const k = this.reihe[(start + i) % n];
      if (k === id || !this.lebt(k)) continue;
      if (this.istDa(k)) return k;
      if (!ersatz) ersatz = k;
    }
    return ersatz;
  }

  pruefeEnde() {
    const leben = this.lebende();
    if (leben.length > 1) return false;
    if (leben.length === 1) this.gibPunkte(leben[0], 30);
    this.sieger = leben[0] || null;
    this.setzePhase('ende', 0);
    return true;
  }

  neueRunde(starter) {
    if (this.pruefeEnde()) return;
    if (!starter || !this.lebt(starter)) starter = this.naechster(starter || this.reihe[0]) || this.lebende()[0];
    this.wuerfel = new Map();
    for (const id of this.lebende()) {
      this.wuerfel.set(id, Array.from({ length: this.anzahl.get(id) }, () => 1 + crypto.randomInt(6)).sort((a, b) => a - b));
    }
    this.gebot = null;
    this.verlauf = [];
    this.ergebnis = null;
    this.dran = starter;
    this.setzePhase('bieten', this.zugMs());
  }

  // Höher heißt: mehr Würfel, oder gleich viele mit höherer Augenzahl.
  // Mit Jokern liegt „k Sterne“ zwischen „2k mal eine Zahl“ und „2k+1 mal eine Zahl“.
  gueltig(menge, augen) {
    if (!Number.isInteger(menge) || !Number.isInteger(augen)) return false;
    if (augen < 1 || augen > 6 || menge < 1 || menge > this.gesamt()) return false;
    if (!this.gebot) return true;
    return BluffSpiel.wert(menge, augen, this.e.joker) > BluffSpiel.wert(this.gebot.menge, this.gebot.augen, this.e.joker);
  }

  static wert(menge, augen, joker) {
    return joker && augen === STERN ? 20 * menge + 9 : 10 * menge + augen;
  }

  biete(menge, augen) {
    if (this.phase !== 'bieten' || !this.gueltig(menge, augen)) return false;
    this.gebot = { menge, augen, von: this.dran };
    this.verlauf.push({ id: this.dran, name: this.name(this.dran), menge, augen });
    const weiter = this.naechster(this.dran);
    if (!weiter) return this.pruefeEnde();
    this.dran = weiter;
    this.setzePhase('bieten', this.zugMs());
    return true;
  }

  zaehle(augen) {
    let n = 0;
    for (const liste of this.wuerfel.values()) for (const w of liste) if (w === augen || (this.e.joker && w === STERN)) n++;
    return n;
  }

  zweifle() {
    if (this.phase !== 'bieten' || !this.gebot) return false;
    const g = this.gebot;
    const anzahl = this.zaehle(g.augen);
    const stimmt = anzahl >= g.menge;
    const verlierer = stimmt ? this.dran : g.von;
    this.anzahl.set(verlierer, Math.max(0, this.anzahl.get(verlierer) - 1));
    const raus = this.anzahl.get(verlierer) === 0;
    if (raus) for (const anderer of this.lebende()) this.gibPunkte(anderer, 10);
    this.ergebnis = { gebot: { ...g, name: this.name(g.von) }, zweifler: this.dran, anzahl, stimmt, verlierer, raus };
    this.naechsterStarter = verlierer;
    this.setzePhase('aufloesung', AUFDECKEN_MS);
    return true;
  }

  tick(jetzt) {
    if (this.beendet) return;
    if (this.phase === 'warten') { if (this.lebende().filter((id) => this.istDa(id)).length >= 2) this.neueRunde(this.naechsterStarter); return; }
    if (this.abgelaufen(jetzt)) this.ueberspringe();
  }

  ueberspringe() {
    if (this.phase === 'bieten') {
      if (this.gebot) return this.zweifle();
      // Erstes Gebot von selbst: einmal die häufigste eigene Augenzahl
      const eigene = this.wuerfel.get(this.dran) || [];
      let beste = 5;
      let meiste = -1;
      for (let a = 1; a <= (this.e.joker ? 5 : 6); a++) {
        const n = eigene.filter((w) => w === a || (this.e.joker && w === STERN)).length;
        if (n >= meiste) { meiste = n; beste = a; }
      }
      this.biete(1, beste);
    } else if (this.phase === 'aufloesung') {
      if (this.lebende().filter((id) => this.istDa(id)).length < 2 && this.lebende().length > 1) return this.setzePhase('warten', 0);
      this.runde++;
      this.neueRunde(this.naechsterStarter);
    }
  }

  kindEreignis(spieler, art, d) {
    if (spieler.id !== this.dran) return { ok: false };
    if (art === 'bieten') {
      const ok = this.biete(Number(d.menge), Number(d.augen));
      return ok ? { ok: true } : { ok: false, fehler: 'Das Gebot muss höher sein: mehr Würfel oder gleich viele mit höherer Augenzahl.' };
    }
    if (art === 'zweifeln') return { ok: !!this.zweifle() };
    return { ok: false };
  }

  spielerWeg(id, endgueltig) {
    if (!endgueltig || !this.anzahl.has(id)) return;
    this.anzahl.set(id, 0);
    this.wuerfel.delete(id);
    if (this.phase === 'bieten' && this.dran === id) this.neueRunde(this.naechster(id));
    else this.pruefeEnde();
  }

  sicht(rolle, spielerId) {
    const s = this.grundSicht();
    s.art = 'bluff';
    s.joker = !!this.e.joker;
    s.startWuerfel = this.e.wuerfel;
    s.gesamt = this.gesamt();
    const offen = this.phase === 'aufloesung';
    s.spieler = this.reihe.filter((id) => this.hub.holeSpieler(id) || this.anzahl.get(id) > 0).map((id) => ({
      id, name: this.name(id), wuerfel: this.anzahl.get(id) || 0, online: this.istDa(id),
      // Beim Aufdecken sehen alle alles
      augen: offen ? this.wuerfel.get(id) || [] : null,
    }));
    s.dran = this.dran ? { id: this.dran, name: this.name(this.dran) } : null;
    s.gebot = this.gebot ? { ...this.gebot, name: this.name(this.gebot.von) } : null;
    s.verlauf = this.verlauf;
    if (offen && this.ergebnis) {
      const e = this.ergebnis;
      s.ergebnis = { ...e, zweiflerName: this.name(e.zweifler), verliererName: this.name(e.verlierer), rest: this.anzahl.get(e.verlierer) };
    }
    if (this.phase === 'ende') s.sieger = this.sieger ? this.name(this.sieger) : null;
    if (rolle === 'kind') {
      s.ich = { dabei: this.anzahl.has(spielerId), augen: this.wuerfel.get(spielerId) || [], wuerfel: this.anzahl.get(spielerId) || 0 };
    }
    if (rolle === 'lehrer' && this.gebot && this.phase === 'bieten') s.geheim = `Auf dem Tisch: ${this.zaehle(this.gebot.augen)} × ${this.gebot.augen === STERN ? 'Stern' : this.gebot.augen} (Gebot ${this.gebot.menge})`;
    return s;
  }
}

module.exports = BluffSpiel;
