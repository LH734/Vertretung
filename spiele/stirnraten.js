'use strict';
// Stirnraten
// Eine Person hält das Handy an die Stirn und sieht das Wort nicht. Die anderen erklären,
// machen es vor oder geben Tipps. Kippen nach vorn heißt „richtig“, nach hinten „weiter“.
// Alle anderen können auch auf ihrem Handy „richtig“ oder „weiter“ tippen.

const { BasisSpiel, zahl, namenListe } = require('./basis');

const BEREIT_MS = 25000;
const ZUGENDE_MS = 9000;
const SPERRE_MS = 900;
const PUNKTE = 10;

class StirnratenSpiel extends BasisSpiel {
  static vorlage(daten) {
    return { runden: 1, sekunden: 60, listen: Object.keys(daten.begriffsListen).filter((n) => !/schwer/i.test(n)).slice(0, 6) };
  }

  static uebernimm(z, d, daten) {
    if (d.runden !== undefined) z.runden = zahl(d.runden, 1, 5, 1);
    if (d.sekunden !== undefined) z.sekunden = zahl(d.sekunden, 30, 120, 60);
    const l = namenListe(d.listen, Object.keys(daten.begriffsListen));
    if (l) z.listen = l;
  }

  static pruefeStart(anzahl) {
    return anzahl < 2 ? 'Für Stirnraten braucht es mindestens 2 Mitspielende.' : null;
  }

  starte() {
    this.vorrat = this.begriffe(this.e.listen);
    this.reihe = this.online().sort((a, b) => a.beigetreten - b.beigetreten).map((s) => s.id);
    this.zug = -1;
    this.naechsterZug();
  }

  naechsterZug() {
    const gesamt = this.runden * this.reihe.length;
    // Wer nicht mehr da ist, wird übersprungen
    do { this.zug++; } while (this.zug < gesamt && !this.hub.holeSpieler(this.reihe[this.zug % this.reihe.length]));
    if (this.zug >= gesamt) return this.setzePhase('ende', 0);
    this.runde = Math.floor(this.zug / this.reihe.length) + 1;
    this.rater = this.reihe[this.zug % this.reihe.length];
    this.verlauf = [];
    this.wort = null;
    this.setzePhase('bereit', BEREIT_MS);
  }

  zieheWort() {
    if (!this.vorrat.length) this.vorrat = this.begriffe(this.e.listen);
    this.wort = this.vorrat.pop();
    this.gesperrtBis = Date.now() + SPERRE_MS;
  }

  los() {
    this.zieheWort();
    this.setzePhase('raten', this.e.sekunden * 1000);
  }

  tick(jetzt) {
    if (this.beendet || !this.abgelaufen(jetzt)) return;
    if (this.phase === 'bereit') this.los();
    else if (this.phase === 'raten') this.beendeZug();
    else if (this.phase === 'zugende') this.naechsterZug();
  }

  ueberspringe() {
    if (this.phase === 'bereit') this.los();
    else if (this.phase === 'raten') this.beendeZug();
    else if (this.phase === 'zugende') this.naechsterZug();
  }

  beendeZug() {
    if (this.wort) this.verlauf.push({ wort: this.wort, ergebnis: 'offen' });
    this.wort = null;
    this.setzePhase('zugende', ZUGENDE_MS);
  }

  kindEreignis(spieler, art) {
    if (art === 'los') {
      if (this.phase !== 'bereit' || spieler.id !== this.rater) return { ok: false };
      this.los();
      return { ok: true };
    }
    if (art !== 'richtig' && art !== 'weiter') return { ok: false };
    if (this.phase !== 'raten' || !this.wort || Date.now() < this.gesperrtBis) return { ok: false };
    this.verlauf.push({ wort: this.wort, ergebnis: art });
    if (art === 'richtig') this.gibPunkte(this.rater, PUNKTE);
    this.zieheWort();
    this.hub.aktualisiere();
    return { ok: true };
  }

  spielerDa(id) {
    if (id && this.reihe && !this.reihe.includes(id)) { this.reihe.push(id); this.hub.aktualisiere(); }
  }

  sicht(rolle, spielerId) {
    const s = this.grundSicht();
    s.art = 'stirnraten';
    if (!this.reihe) return s;
    s.rater = this.rater ? { id: this.rater, name: this.name(this.rater) } : null;
    s.verlauf = this.verlauf;
    s.richtig = this.verlauf.filter((v) => v.ergebnis === 'richtig').length;
    s.zug = this.zug + 1;
    s.zuege = this.runden * this.reihe.length;
    // Die Bühne zeigt das Wort nie: die ratende Person könnte hinschauen.
    if (rolle === 'kind' && this.wort) s.wort = this.wort;
    if (rolle === 'kind') s.ich = { rater: spielerId === this.rater };
    if (rolle === 'lehrer' && this.wort) s.geheim = this.wort;
    return s;
  }
}

module.exports = StirnratenSpiel;
