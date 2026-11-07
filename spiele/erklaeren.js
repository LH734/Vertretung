'use strict';
// Begriffe erklären
// Teams erklären abwechselnd Begriffe, ohne die verbotenen Wörter zu benutzen.
// Die gegnerischen Teams sehen die Karte mit und drücken bei einem verbotenen Wort den Summer.

const { BasisSpiel, zahl, namenListe } = require('./basis');
const { mische } = require('./werkzeuge');

const BEREIT_MS = 20000;
const ZUGENDE_MS = 9000;
const SPERRE_MS = 700; // gegen doppeltes Drücken
const TEAM_PUNKTE = 10; // Punkte je Teammitglied pro richtig erklärtem Begriff

class ErklaerenSpiel extends BasisSpiel {
  static vorlage(daten) {
    return { runden: 3, sekunden: 60, teams: 2, listen: Object.keys(daten.erklaerListen), strafe: false };
  }

  static uebernimm(z, d, daten) {
    if (d.runden !== undefined) z.runden = zahl(d.runden, 1, 10, 3);
    if (d.sekunden !== undefined) z.sekunden = zahl(d.sekunden, 30, 180, 60);
    if (d.teams !== undefined) z.teams = zahl(d.teams, 2, 4, 2);
    const l = namenListe(d.listen, Object.keys(daten.erklaerListen));
    if (l) z.listen = l;
    if (typeof d.strafe === 'boolean') z.strafe = d.strafe;
  }

  static pruefeStart(anzahl, e) {
    const teams = e.teams || 2;
    return anzahl < teams * 2 ? `Für ${teams} Teams braucht es mindestens ${teams * 2} Mitspielende.` : null;
  }

  constructor(hub, e) {
    super(hub, e);
    const listen = hub.daten.erklaerListen;
    const namen = e.listen.filter((n) => listen[n]);
    this.stapel = mische((namen.length ? namen : Object.keys(listen)).map((n) => listen[n]).flat());
    this.benutzt = 0;
  }

  starte() {
    const ids = mische(this.online().map((s) => s.id));
    this.teams = Array.from({ length: this.e.teams }, (_, i) => ({ index: i, ...this.hub.teams[i], mitglieder: [], punkte: 0, dran: 0 }));
    ids.forEach((id, i) => this.teams[i % this.teams.length].mitglieder.push(id));
    this.zug = -1;
    this.naechsterZug();
  }

  teamVon(id) {
    return this.teams.find((t) => t.mitglieder.includes(id)) || null;
  }

  naechsterZug() {
    this.zug++;
    const gesamt = this.runden * this.teams.length;
    if (this.zug >= gesamt) return this.setzePhase('ende', 0);
    this.runde = Math.floor(this.zug / this.teams.length) + 1;
    this.team = this.teams[this.zug % this.teams.length];
    const aktive = this.team.mitglieder.filter((id) => { const s = this.hub.holeSpieler(id); return s && s.socketId; });
    const kandidaten = aktive.length ? aktive : this.team.mitglieder;
    this.erklaerer = kandidaten[this.team.dran % kandidaten.length];
    this.team.dran++;
    this.verlauf = [];
    this.karte = null;
    this.setzePhase('bereit', BEREIT_MS);
  }

  zieheKarte() {
    if (this.benutzt >= this.stapel.length) { this.stapel = mische(this.stapel); this.benutzt = 0; }
    this.karte = this.stapel[this.benutzt++];
    this.gesperrtBis = Date.now() + SPERRE_MS;
  }

  los() {
    this.zieheKarte();
    this.setzePhase('erklaeren', this.e.sekunden * 1000);
  }

  tick(jetzt) {
    if (this.beendet || !this.abgelaufen(jetzt)) return;
    if (this.phase === 'bereit') this.los();
    else if (this.phase === 'erklaeren') this.beendeZug();
    else if (this.phase === 'zugende') this.naechsterZug();
  }

  ueberspringe() {
    if (this.phase === 'bereit') this.los();
    else if (this.phase === 'erklaeren') this.beendeZug();
    else if (this.phase === 'zugende') this.naechsterZug();
  }

  beendeZug() {
    if (this.karte) this.verlauf.push({ wort: this.karte.wort, ergebnis: 'offen' });
    this.karte = null;
    this.setzePhase('zugende', ZUGENDE_MS);
  }

  wertung(delta) {
    this.team.punkte = Math.max(0, this.team.punkte + delta);
    for (const id of this.team.mitglieder) this.gibPunkte(id, delta * TEAM_PUNKTE);
  }

  kindEreignis(spieler, art) {
    const team = this.teamVon(spieler.id);
    if (art === 'los') {
      if (this.phase !== 'bereit' || spieler.id !== this.erklaerer) return { ok: false };
      this.los();
      return { ok: true };
    }
    if (this.phase !== 'erklaeren' || !this.karte) return { ok: false };
    if (Date.now() < this.gesperrtBis) return { ok: false };
    if (art === 'richtig' || art === 'weiter') {
      if (spieler.id !== this.erklaerer) return { ok: false };
      this.verlauf.push({ wort: this.karte.wort, ergebnis: art });
      if (art === 'richtig') this.wertung(1);
      else if (this.e.strafe) this.wertung(-1);
    } else if (art === 'tabu') {
      if (!team || team === this.team) return { ok: false };
      this.verlauf.push({ wort: this.karte.wort, ergebnis: 'tabu', von: spieler.name });
      this.wertung(-1);
    } else {
      return { ok: false };
    }
    this.zieheKarte();
    this.hub.aktualisiere();
    return { ok: true };
  }

  spielerDa(id) {
    if (!id || !this.teams || this.teamVon(id)) return;
    const kleinstes = this.teams.reduce((a, b) => (b.mitglieder.length < a.mitglieder.length ? b : a));
    kleinstes.mitglieder.push(id);
    this.hub.aktualisiere();
  }

  sicht(rolle, spielerId) {
    const s = this.grundSicht();
    s.art = 'erklaeren';
    if (!this.teams) return s;
    s.teams = this.teams.map((t) => ({ index: t.index, name: t.name, farbe: t.farbe, punkte: t.punkte, mitglieder: t.mitglieder.map((id) => this.name(id)) }));
    s.teamDran = this.team ? this.team.index : null;
    s.erklaerer = this.erklaerer ? { id: this.erklaerer, name: this.name(this.erklaerer) } : null;
    s.verlauf = this.verlauf;
    s.anzahl = { richtig: this.verlauf.filter((v) => v.ergebnis === 'richtig').length, tabu: this.verlauf.filter((v) => v.ergebnis === 'tabu').length };
    if (rolle === 'kind') {
      const team = this.teamVon(spielerId);
      let aufgabe = 'zuschauen';
      if (spielerId === this.erklaerer) aufgabe = 'erklaeren';
      else if (team && team === this.team) aufgabe = 'raten';
      else if (team) aufgabe = 'waechter';
      s.ich = { team: team ? team.index : null, aufgabe };
      if (this.karte && (aufgabe === 'erklaeren' || aufgabe === 'waechter')) s.karte = this.karte;
    }
    if (rolle === 'lehrer' && this.karte) s.geheim = `${this.karte.wort} (nicht sagen: ${this.karte.tabu.join(', ')})`;
    return s;
  }
}

module.exports = ErklaerenSpiel;
