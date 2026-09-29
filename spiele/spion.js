'use strict';
// Wer ist der Spion?
// Alle bekommen dasselbe Wort, der Spion nicht. Reihum sagt jede und jeder ein Stichwort,
// dann wird abgestimmt. Wird der Spion enttarnt, darf er noch das Wort raten.

const { BasisSpiel, zahl, namenListe } = require('./basis');
const { normalisiere, abstand, saeubere, mische } = require('./werkzeuge');

const KARTE_MS = 12000;
const ABSTIMMUNG_MS = 60000;
const RATEN_MS = 30000;
const AUFLOESUNG_MS = 14000;

class SpionSpiel extends BasisSpiel {
  static vorlage(daten) {
    return { runden: 3, spione: 1, sekunden: 180, listen: Object.keys(daten.begriffsListen).slice(0, 3), thema: true };
  }

  static uebernimm(z, d, daten) {
    if (d.runden !== undefined) z.runden = zahl(d.runden, 1, 10, 3);
    if (d.spione !== undefined) z.spione = zahl(d.spione, 1, 2, 1);
    if (d.sekunden !== undefined) z.sekunden = zahl(d.sekunden, 60, 600, 180);
    const l = namenListe(d.listen, Object.keys(daten.begriffsListen));
    if (l) z.listen = l;
    if (typeof d.thema === 'boolean') z.thema = d.thema;
  }

  static pruefeStart(anzahl) {
    return anzahl < 3 ? 'Für „Wer ist der Spion?“ braucht es mindestens 3 Mitspielende.' : null;
  }

  constructor(hub, e) {
    super(hub, e);
    this.vorrat = this.begriffe(e.listen);
    this.themaVon = new Map();
    for (const [name, liste] of Object.entries(hub.daten.begriffsListen)) for (const w of liste) if (!this.themaVon.has(w)) this.themaVon.set(w, name);
  }

  starte() {
    this.neueRunde();
  }

  neueRunde() {
    if (this.runde >= this.runden) return this.setzePhase('ende', 0);
    const online = this.online();
    if (online.length < 3) return this.setzePhase('warten', 0);
    this.runde++;
    if (!this.vorrat.length) this.vorrat = this.begriffe(this.e.listen);
    this.wort = this.vorrat.pop();
    const anzahl = online.length >= 8 ? this.e.spione : 1;
    const ids = mische(online.map((s) => s.id));
    this.spione = new Set(ids.slice(0, anzahl));
    this.teilnehmer = new Set(ids);
    this.reihenfolge = mische(ids); // wer beginnt, und dann reihum
    this.stimmen = new Map();
    this.ergebnis = null;
    this.setzePhase('karte', KARTE_MS);
  }

  tick(jetzt) {
    if (this.beendet) return;
    if (this.phase === 'warten') { if (this.online().length >= 3) this.neueRunde(); return; }
    if (!this.abgelaufen(jetzt)) return;
    if (this.phase === 'karte') this.setzePhase('fragen', this.e.sekunden * 1000);
    else if (this.phase === 'fragen') this.starteAbstimmung();
    else if (this.phase === 'abstimmung') this.werteAus();
    else if (this.phase === 'raten') this.loese(false, 'zeit');
    else if (this.phase === 'aufloesung') this.neueRunde();
  }

  ueberspringe() {
    if (this.phase === 'karte') this.setzePhase('fragen', this.e.sekunden * 1000);
    else if (this.phase === 'fragen') this.starteAbstimmung();
    else if (this.phase === 'abstimmung') this.werteAus();
    else if (this.phase === 'raten') this.loese(false, 'zeit');
    else if (this.phase === 'aufloesung') this.neueRunde();
  }

  starteAbstimmung() {
    this.stimmen = new Map();
    this.setzePhase('abstimmung', ABSTIMMUNG_MS);
  }

  stimmberechtigt() {
    return [...this.teilnehmer].filter((id) => { const s = this.hub.holeSpieler(id); return s && s.socketId; });
  }

  werteAus() {
    if (this.phase !== 'abstimmung') return;
    const { gewaehlt, grund, zaehler } = BasisSpiel.zaehle(this.stimmen);
    this.abstimmung = { gewaehlt, grund, stimmen: this.stimmenListe(zaehler) };
    if (gewaehlt && this.spione.has(gewaehlt)) {
      this.rater = gewaehlt;
      this.setzePhase('raten', RATEN_MS);
    } else {
      this.loese(null, grund === 'mehrheit' ? 'falsch' : grund);
    }
  }

  // richtig: true/false = Rateversuch des Spions, null = Spion wurde nicht gefunden
  loese(richtig, grund, versuch) {
    let sieger;
    if (richtig === null) sieger = 'spion';
    else sieger = richtig ? 'spionRaet' : 'gruppe';
    for (const id of this.teilnehmer) {
      const spion = this.spione.has(id);
      if (sieger === 'spion' && spion) this.gibPunkte(id, 200);
      if (sieger === 'spionRaet' && spion) this.gibPunkte(id, 150);
      if (sieger === 'gruppe' && !spion) this.gibPunkte(id, 100);
    }
    this.ergebnis = { sieger, grund, versuch: versuch || null };
    this.setzePhase('aufloesung', AUFLOESUNG_MS);
  }

  kindEreignis(spieler, art, d) {
    const dabei = this.teilnehmer && this.teilnehmer.has(spieler.id);
    if (art === 'stimme') {
      if (this.phase !== 'abstimmung' || !dabei) return { ok: false };
      if (this.stimmen.has(spieler.id)) return { ok: false, fehler: 'Du hast schon abgestimmt.' };
      const ziel = String(d.ziel || '');
      if (!this.teilnehmer.has(ziel) || ziel === spieler.id) return { ok: false };
      this.stimmen.set(spieler.id, ziel);
      this.hub.aktualisiere();
      if (this.stimmberechtigt().every((id) => this.stimmen.has(id))) this.werteAus();
      return { ok: true };
    }
    if (art === 'aufdecken') {
      // Der Spion traut sich: Ich kenne das Wort!
      if (!this.spione.has(spieler.id) || (this.phase !== 'fragen' && this.phase !== 'karte')) return { ok: false };
      this.abstimmung = null;
      this.rater = spieler.id;
      this.selbst = true;
      this.setzePhase('raten', RATEN_MS);
      return { ok: true };
    }
    if (art === 'raten') {
      if (this.phase !== 'raten' || spieler.id !== this.rater) return { ok: false };
      const versuch = saeubere(d.text, 40);
      if (!versuch) return { ok: false, fehler: 'Schreib ein Wort.' };
      const a = normalisiere(versuch);
      const b = normalisiere(this.wort);
      const richtig = a === b || (b.length >= 5 && abstand(a, b) <= 1);
      if (this.selbst && richtig) {
        // selbst aufgedeckt und richtig: wie „nicht gefunden“
        this.selbst = false;
        this.loese(null, 'selbst', versuch);
      } else {
        this.selbst = false;
        this.loese(richtig, richtig ? 'erraten' : 'danebengeraten', versuch);
      }
      return { ok: true };
    }
    return { ok: false };
  }

  spielerDa(id) {
    if (id && this.teilnehmer && !this.teilnehmer.has(id) && this.phase !== 'ende') this.hub.aktualisiere();
  }

  sicht(rolle, spielerId) {
    const s = this.grundSicht();
    s.art = 'spion';
    if (!this.teilnehmer) return s;
    const namen = (ids) => ids.map((id) => ({ id, name: this.name(id) }));
    s.reihenfolge = namen(this.reihenfolge.filter((id) => this.hub.holeSpieler(id)));
    s.teilnehmer = s.reihenfolge;
    s.abgestimmt = [...this.stimmen.keys()];
    s.stimmberechtigt = this.stimmberechtigt().length;
    s.anzahlSpione = this.spione.size;
    if (this.phase === 'raten') s.rater = { id: this.rater, name: this.name(this.rater), selbst: !!this.selbst };
    if (this.abstimmung && (this.phase === 'raten' || this.phase === 'aufloesung')) s.abstimmung = { ...this.abstimmung, gewaehltName: this.abstimmung.gewaehlt ? this.name(this.abstimmung.gewaehlt) : null };
    if (this.phase === 'aufloesung') {
      s.wort = this.wort;
      s.spione = namen([...this.spione]);
      s.ergebnis = this.ergebnis;
    }
    if (rolle === 'kind') {
      const dabei = this.teilnehmer.has(spielerId);
      s.ich = {
        dabei,
        spion: dabei && this.spione.has(spielerId),
        wort: dabei && !this.spione.has(spielerId) ? this.wort : null,
        thema: this.e.thema && this.spione.has(spielerId) ? this.themaVon.get(this.wort) || null : null,
        stimme: this.stimmen.get(spielerId) || null,
      };
    }
    if (rolle === 'lehrer') s.geheim = `${this.wort} · Spion: ${[...this.spione].map((id) => this.name(id)).join(', ')}`;
    return s;
  }
}

module.exports = SpionSpiel;
