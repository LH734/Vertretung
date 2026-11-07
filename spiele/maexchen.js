'use strict';
// Mäxchen: Wer dran ist, würfelt verdeckt mit zwei Würfeln und sagt einen Wert an, der höher sein muss
// als die Ansage davor. Lügen ist erlaubt. Die nächste Person glaubt (und würfelt selbst weiter)
// oder deckt auf. Wer erwischt wird oder falsch zweifelt, verliert ein Leben.

const crypto = require('crypto');
const { BasisSpiel, zahl } = require('./basis');
const { mische } = require('./werkzeuge');

// Reihenfolge der Werte von niedrig nach hoch: normale Würfe, dann Pasch, ganz oben Mäxchen (2 und 1)
const WERTE = ['31', '32', '41', '42', '43', '51', '52', '53', '54', '61', '62', '63', '64', '65', '11', '22', '33', '44', '55', '66', '21'];
const MAEXCHEN = '21';
const AUFDECKEN_MS = 8000;
const MIN = 3;

const rang = (w) => WERTE.indexOf(w);
const wertVon = ([a, b]) => `${Math.max(a, b)}${Math.min(a, b)}`;
const wuerfle = () => [1 + crypto.randomInt(6), 1 + crypto.randomInt(6)];

class MaexchenSpiel extends BasisSpiel {
  static vorlage() {
    return { leben: 3, sekunden: 30 };
  }

  static uebernimm(z, d) {
    if (d.leben !== undefined) z.leben = zahl(d.leben, 1, 6, 3);
    if (d.sekunden !== undefined) z.sekunden = zahl(d.sekunden, 15, 90, 30);
  }

  static pruefeStart(anzahl) {
    return anzahl < MIN ? `Für Mäxchen braucht es mindestens ${MIN} Mitspielende.` : null;
  }

  constructor(hub, e) {
    super(hub, { ...e, runden: 1 });
    this.leben = new Map();
    this.reihe = [];
    this.verlauf = [];
    this.ergebnis = null;
    this.raus = []; // Reihenfolge des Ausscheidens
  }

  zugMs() { return this.e.sekunden * 1000; }

  starte() {
    const ids = mische(this.online().map((s) => s.id));
    this.reihe = ids;
    for (const id of ids) this.leben.set(id, this.e.leben);
    this.runde = 1;
    this.neueRunde(ids[0]);
  }

  lebt(id) { return (this.leben.get(id) || 0) > 0 && !!this.hub.holeSpieler(id); }
  istDa(id) { const s = this.hub.holeSpieler(id); return !!(s && s.socketId); }
  lebende() { return this.reihe.filter((id) => this.lebt(id)); }

  // Nächste lebende Person nach id, die gerade online ist (sonst einfach die nächste lebende)
  naechster(id) {
    const n = this.reihe.length;
    const start = Math.max(0, this.reihe.indexOf(id));
    let ersatz = null;
    for (let i = 1; i <= n; i++) {
      const kandidat = this.reihe[(start + i) % n];
      if (kandidat === id || !this.lebt(kandidat)) continue;
      if (this.istDa(kandidat)) return kandidat;
      if (!ersatz) ersatz = kandidat;
    }
    return ersatz;
  }

  neueRunde(starter) {
    if (this.pruefeEnde()) return;
    if (!starter || !this.lebt(starter)) starter = this.naechster(starter || this.reihe[0]) || this.lebende()[0];
    this.vorher = null;
    this.verlauf = [];
    this.ergebnis = null;
    this.ansage = null;
    this.entscheider = null;
    this.neuerWurf(starter);
  }

  neuerWurf(id) {
    this.aktiv = id;
    this.wurf = wuerfle();
    this.ansage = null;
    this.entscheider = null;
    this.setzePhase('wurf', this.zugMs());
  }

  pruefeEnde() {
    const leben = this.lebende();
    if (leben.length > 1) return false;
    if (leben.length === 1) this.gibPunkte(leben[0], 30);
    this.sieger = leben[0] || null;
    this.setzePhase('ende', 0);
    return true;
  }

  erlaubteAnsagen() {
    const ab = this.vorher ? rang(this.vorher) + 1 : 0;
    return WERTE.slice(ab);
  }

  ansagen(w) {
    if (this.phase !== 'wurf' || !this.erlaubteAnsagen().includes(w)) return false;
    this.ansage = w;
    this.verlauf.push({ id: this.aktiv, name: this.name(this.aktiv), ansage: w });
    this.entscheider = this.naechster(this.aktiv);
    if (!this.entscheider) return this.pruefeEnde();
    this.setzePhase('entscheidung', this.zugMs());
    return true;
  }

  glauben() {
    if (this.phase !== 'entscheidung') return false;
    if (this.ansage === MAEXCHEN) {
      // Ein angesagtes Mäxchen zu glauben kostet ein Leben, ohne Aufdecken
      return this.verliere(this.entscheider, 1, { art: 'geglaubt', ansager: this.aktiv, ansage: this.ansage, zweifler: this.entscheider });
    }
    this.vorher = this.ansage;
    this.neuerWurf(this.entscheider);
    return true;
  }

  aufdecken() {
    if (this.phase !== 'entscheidung') return false;
    const echt = wertVon(this.wurf);
    const ehrlich = rang(echt) >= rang(this.ansage);
    const verlierer = ehrlich ? this.entscheider : this.aktiv;
    // Wer ein echtes Mäxchen anzweifelt, verliert zwei Leben
    const minus = ehrlich && this.ansage === MAEXCHEN ? 2 : 1;
    return this.verliere(verlierer, minus, { art: 'aufgedeckt', ansager: this.aktiv, ansage: this.ansage, zweifler: this.entscheider, echt, wurf: this.wurf, ehrlich });
  }

  verliere(id, minus, info) {
    const vorher = this.leben.get(id) || 0;
    this.leben.set(id, Math.max(0, vorher - minus));
    const raus = this.leben.get(id) === 0;
    if (raus) {
      this.raus.push(id);
      // Wer länger durchhält, bekommt mehr: Alle, die noch leben, bekommen Punkte
      for (const anderer of this.lebende()) this.gibPunkte(anderer, 10);
    }
    this.ergebnis = { ...info, verlierer: id, minus, raus };
    this.naechsterStarter = id;
    this.setzePhase('aufloesung', AUFDECKEN_MS);
    return true;
  }

  tick(jetzt) {
    if (this.beendet) return;
    if (this.phase === 'warten') { if (this.lebende().filter((id) => this.istDa(id)).length >= 2) this.neueRunde(this.naechsterStarter); return; }
    if (this.abgelaufen(jetzt)) this.ueberspringe();
  }

  // Zeit abgelaufen oder „Weiter“ der Leitung: Es wird für die Person entschieden
  ueberspringe() {
    if (this.phase === 'wurf') {
      // Ehrlich ansagen, wenn das reicht, sonst die kleinste erlaubte Lüge
      const erlaubt = this.erlaubteAnsagen();
      const echt = wertVon(this.wurf);
      this.ansagen(erlaubt.includes(echt) ? echt : erlaubt[0]);
    } else if (this.phase === 'entscheidung') {
      if (this.ansage === MAEXCHEN) this.aufdecken();
      else this.glauben();
    } else if (this.phase === 'aufloesung') {
      if (this.lebende().filter((id) => this.istDa(id)).length < 2 && this.lebende().length > 1) return this.setzePhase('warten', 0);
      this.runde++;
      this.neueRunde(this.naechsterStarter);
    }
  }

  kindEreignis(spieler, art, d) {
    if (art === 'ansage') {
      if (spieler.id !== this.aktiv) return { ok: false };
      return { ok: !!this.ansagen(String(d.wert || '')) };
    }
    if (art === 'glauben' || art === 'aufdecken') {
      if (spieler.id !== this.entscheider) return { ok: false };
      return { ok: !!(art === 'glauben' ? this.glauben() : this.aufdecken()) };
    }
    return { ok: false };
  }

  spielerWeg(id, endgueltig) {
    if (!endgueltig || !this.leben.has(id)) return;
    // Wer den Raum verlässt, scheidet aus
    this.leben.set(id, 0);
    if (this.aktiv === id || this.entscheider === id) this.neueRunde(this.naechster(id));
    else this.pruefeEnde();
  }

  sicht(rolle, spielerId) {
    const s = this.grundSicht();
    s.art = 'maexchen';
    s.startLeben = this.e.leben;
    s.spieler = this.reihe.filter((id) => this.hub.holeSpieler(id) || this.leben.get(id) > 0).map((id) => ({
      id, name: this.name(id), leben: this.leben.get(id) || 0, online: this.istDa(id),
    }));
    s.aktiv = this.aktiv ? { id: this.aktiv, name: this.name(this.aktiv) } : null;
    s.entscheider = this.entscheider ? { id: this.entscheider, name: this.name(this.entscheider) } : null;
    s.vorher = this.vorher;
    s.ansage = this.ansage;
    s.verlauf = this.verlauf;
    if (this.phase === 'aufloesung' && this.ergebnis) {
      const e = this.ergebnis;
      s.ergebnis = { ...e, ansagerName: this.name(e.ansager), zweiflerName: this.name(e.zweifler), verliererName: this.name(e.verlierer), rest: this.leben.get(e.verlierer) };
    }
    if (this.phase === 'ende') s.sieger = this.sieger ? this.name(this.sieger) : null;
    if (rolle === 'kind') {
      const dabei = this.leben.has(spielerId);
      s.ich = {
        dabei,
        leben: this.leben.get(spielerId) || 0,
        // Nur wer gewürfelt hat, sieht den eigenen Wurf
        wurf: this.phase === 'wurf' && spielerId === this.aktiv ? this.wurf : null,
        erlaubt: this.phase === 'wurf' && spielerId === this.aktiv ? this.erlaubteAnsagen() : null,
      };
    }
    if (rolle === 'lehrer' && this.wurf && this.phase !== 'aufloesung' && this.phase !== 'ende') s.geheim = `Wurf von ${this.name(this.aktiv)}: ${wertVon(this.wurf)}`;
    return s;
  }
}

MaexchenSpiel.WERTE = WERTE;
module.exports = MaexchenSpiel;
