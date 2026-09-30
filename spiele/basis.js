'use strict';
// Gemeinsame Grundlage für die Partyspiele: Phasen mit Zeitlimit, Pause, Punkte, Abstimmungen.

const { mische } = require('./werkzeuge');

class BasisSpiel {
  constructor(hub, e) {
    this.hub = hub;
    this.e = e;
    this.phase = 'start';
    this.runde = 0;
    this.runden = e.runden || 1;
    this.endeUm = 0;
    this.phasenDauer = 1;
    this.beendet = false;
  }

  jetzt() {
    return this.hub.raum.pause ? this.hub.raum.pauseSeit : Date.now();
  }

  // Phase wechseln; ms = 0 bedeutet: ohne Zeitlimit
  setzePhase(phase, ms) {
    this.phase = phase;
    this.phasenDauer = ms || 1;
    this.endeUm = ms ? Date.now() + ms : 0;
    this.hub.aktualisiere();
  }

  abgelaufen(jetzt) {
    return this.endeUm > 0 && jetzt >= this.endeUm;
  }

  restMs() {
    return this.endeUm ? Math.max(0, this.endeUm - this.jetzt()) : 0;
  }

  verschiebe(ms) {
    if (this.endeUm) this.endeUm += ms;
  }

  beende() {
    this.beendet = true;
  }

  online() {
    return this.hub.spieler().filter((s) => s.socketId);
  }

  name(id) {
    const s = this.hub.holeSpieler(id);
    return s ? s.name : '?';
  }

  gibPunkte(id, n) {
    const s = this.hub.holeSpieler(id);
    if (s) s.punkte = Math.max(0, s.punkte + n);
  }

  // Begriffe aus den gewählten Listen, ohne doppelte
  begriffe(listen) {
    const alle = this.hub.daten.begriffsListen;
    const namen = (listen || []).filter((n) => alle[n]);
    const quelle = namen.length ? namen.map((n) => alle[n]).flat() : Object.values(alle).flat();
    return mische([...new Set(quelle)]);
  }

  // Abstimmung auswerten: meiste Stimmen gewinnt, bei Gleichstand oder „überspringen“ niemand
  static zaehle(stimmen) {
    const zaehler = new Map();
    for (const z of stimmen.values()) zaehler.set(z, (zaehler.get(z) || 0) + 1);
    let spitze = 0;
    for (const n of zaehler.values()) spitze = Math.max(spitze, n);
    const vorn = [...zaehler.entries()].filter(([, n]) => n === spitze).map(([z]) => z);
    let gewaehlt = null;
    let grund;
    if (!zaehler.size) grund = 'keine';
    else if (vorn.length > 1) grund = 'gleichstand';
    else if (vorn[0] === 'skip') grund = 'uebersprungen';
    else { gewaehlt = vorn[0]; grund = 'mehrheit'; }
    return { gewaehlt, grund, zaehler };
  }

  stimmenListe(zaehler) {
    return [...zaehler.entries()]
      .filter(([z]) => z !== 'skip')
      .map(([id, n]) => ({ id, name: this.name(id), n }))
      .sort((a, b) => b.n - a.n);
  }

  spielerWeg() {}

  spielerDa() {}

  lehrerEreignis() {
    return null;
  }

  kindEreignis() {
    return { ok: false };
  }

  grundSicht() {
    return {
      phase: this.phase,
      runde: this.runde,
      runden: this.runden,
      restMs: this.restMs(),
      phasenDauer: this.phasenDauer,
    };
  }
}

// Hilfen für das Prüfen von Einstellungen
function zahl(wert, min, max, standard) {
  const n = Math.round(Number(wert));
  if (!Number.isFinite(n)) return standard;
  return Math.max(min, Math.min(max, n));
}

function namenListe(wert, erlaubt) {
  if (!Array.isArray(wert)) return undefined;
  return [...new Set(wert.map(String))].filter((n) => erlaubt.includes(n));
}

module.exports = { BasisSpiel, zahl, namenListe };
