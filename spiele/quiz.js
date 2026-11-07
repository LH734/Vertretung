'use strict';
// Quiz
// Alle beantworten gleichzeitig Fragen mit vier Antworten. Wer schneller richtig liegt, bekommt mehr Punkte.

const { BasisSpiel, zahl, namenListe } = require('./basis');
const { saeubere, mische } = require('./werkzeuge');

const LESEN_MS = 4000;
const AUFLOESUNG_MS = 7000;
const ZWISCHEN_MS = 6000;

class QuizSpiel extends BasisSpiel {
  static vorlage(daten) {
    return { fragen: 10, sekunden: 20, kategorien: Object.keys(daten.quizKategorien), eigene: '' };
  }

  static uebernimm(z, d, daten) {
    if (d.fragen !== undefined) z.fragen = zahl(d.fragen, 3, 40, 10);
    if (d.sekunden !== undefined) z.sekunden = zahl(d.sekunden, 10, 60, 20);
    const l = namenListe(d.kategorien, Object.keys(daten.quizKategorien));
    if (l) z.kategorien = l;
    if (typeof d.eigene === 'string') z.eigene = d.eigene.slice(0, 8000);
  }

  // Eigene Fragen: eine pro Zeile, "Frage | richtig | falsch | falsch | falsch"
  static eigeneFragen(text) {
    return String(text || '').split(/\r?\n/).map((z) => z.split('|').map((x) => saeubere(x, 160)))
      .filter((t) => t.length >= 3 && t.slice(0, 5).every(Boolean))
      .map((t) => ({ frage: t[0], antworten: t.slice(1, 5) }));
  }

  static pruefeStart(anzahl, e, daten) {
    if (anzahl < 1) return 'Es ist noch niemand im Raum.';
    const n = e.kategorien.reduce((s, k) => s + (daten.quizKategorien[k] || []).length, 0) + QuizSpiel.eigeneFragen(e.eigene).length;
    return n < 1 ? 'Wähle mindestens eine Kategorie aus oder schreib eigene Fragen.' : null;
  }

  constructor(hub, e) {
    super(hub, e);
    const eigene = QuizSpiel.eigeneFragen(e.eigene);
    const aus = e.kategorien.map((k) => (hub.daten.quizKategorien[k] || []).map((f) => ({ ...f, kategorie: k }))).flat();
    // eigene Fragen kommen zuerst an die Reihe
    this.fragen = [...mische(eigene).map((f) => ({ ...f, kategorie: 'Eigene Fragen' })), ...mische(aus)].slice(0, e.fragen);
    this.runden = this.fragen.length;
    this.serie = new Map();
  }

  starte() {
    this.naechsteFrage();
  }

  naechsteFrage() {
    if (this.runde >= this.fragen.length) return this.setzePhase('ende', 0);
    const f = this.fragen[this.runde];
    this.runde++;
    const reihenfolge = mische([0, 1, 2, 3].slice(0, f.antworten.length));
    this.frage = { text: f.frage, kategorie: f.kategorie, antworten: reihenfolge.map((i) => f.antworten[i]), richtig: reihenfolge.indexOf(0) };
    this.antworten = new Map(); // id -> { wahl, ms }
    this.gewinn = new Map();
    this.setzePhase('lesen', LESEN_MS);
  }

  tick(jetzt) {
    if (this.beendet || !this.abgelaufen(jetzt)) return;
    if (this.phase === 'lesen') this.starteAntworten();
    else if (this.phase === 'frage') this.loese();
    else if (this.phase === 'aufloesung') this.setzePhase('zwischenstand', ZWISCHEN_MS);
    else if (this.phase === 'zwischenstand') this.naechsteFrage();
  }

  ueberspringe() {
    if (this.phase === 'lesen') this.starteAntworten();
    else if (this.phase === 'frage') this.loese();
    else if (this.phase === 'aufloesung') this.setzePhase('zwischenstand', ZWISCHEN_MS);
    else if (this.phase === 'zwischenstand') this.naechsteFrage();
  }

  starteAntworten() {
    this.startZeit = Date.now();
    this.setzePhase('frage', this.e.sekunden * 1000);
  }

  loese() {
    if (this.phase !== 'frage') return;
    const dauer = this.e.sekunden * 1000;
    for (const s of this.hub.spieler()) {
      const a = this.antworten.get(s.id);
      if (a && a.wahl === this.frage.richtig) {
        const serie = (this.serie.get(s.id) || 0) + 1;
        this.serie.set(s.id, serie);
        const p = Math.round(1000 * (1 - Math.min(1, a.ms / dauer) / 2)) + Math.min(5, serie - 1) * 100;
        this.gewinn.set(s.id, p);
        this.gibPunkte(s.id, p);
      } else {
        this.serie.set(s.id, 0);
      }
    }
    this.setzePhase('aufloesung', AUFLOESUNG_MS);
  }

  kindEreignis(spieler, art, d) {
    if (art !== 'antwort' || this.phase !== 'frage') return { ok: false };
    if (this.antworten.has(spieler.id)) return { ok: false, fehler: 'Du hast schon geantwortet.' };
    const wahl = Number(d.wahl);
    if (!Number.isInteger(wahl) || wahl < 0 || wahl >= this.frage.antworten.length) return { ok: false };
    // Zeit ohne Pausen messen
    this.antworten.set(spieler.id, { wahl, ms: this.e.sekunden * 1000 - this.restMs() });
    this.hub.aktualisiere();
    const online = this.online();
    if (online.every((s) => this.antworten.has(s.id))) this.loese();
    return { ok: true };
  }

  sicht(rolle, spielerId) {
    const s = this.grundSicht();
    s.art = 'quiz';
    if (!this.frage) return s;
    s.frage = { text: this.frage.text, kategorie: this.frage.kategorie };
    if (this.phase !== 'lesen') s.frage.antworten = this.frage.antworten;
    s.beantwortet = this.antworten.size;
    s.anzahl = this.online().length;
    if (this.phase === 'aufloesung' || this.phase === 'zwischenstand') {
      s.richtig = this.frage.richtig;
      const verteilung = [0, 0, 0, 0];
      for (const a of this.antworten.values()) verteilung[a.wahl]++;
      s.verteilung = verteilung;
      s.schnellste = [...this.antworten.entries()]
        .filter(([, a]) => a.wahl === this.frage.richtig)
        .sort((a, b) => a[1].ms - b[1].ms).slice(0, 3)
        .map(([id, a]) => ({ name: this.name(id), sekunden: Math.round(a.ms / 100) / 10 }));
    }
    if (rolle === 'kind') {
      const a = this.antworten.get(spielerId);
      s.ich = { wahl: a ? a.wahl : null, gewinn: this.gewinn.get(spielerId) || 0, serie: this.serie.get(spielerId) || 0 };
    }
    if (rolle === 'lehrer') s.geheim = this.frage.antworten[this.frage.richtig];
    return s;
  }
}

module.exports = QuizSpiel;
