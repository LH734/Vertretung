'use strict';
// Zeichnen und Raten
// Reihum zeichnet ein Kind, alle anderen raten. Eine "Runde" ist ein Zeichnerwechsel.

const { normalisiere, abstand, saeubere, mische } = require('./werkzeuge');

const WAHL_MS = 15000;
const AUFLOESUNG_MS = 6000;
const ZEICHNER_WARTEZEIT_MS = 8000; // so lange darf das Tablet des Zeichners kurz weg sein
const BREITE = 800;
const HOEHE = 600;
const MAX_OPS = 4000;
const MAX_PUNKTE_JE_STRICH = 4000;
const ANZAHL_FARBEN = 9; // 8 Farben + Radierer
const ANZAHL_STAERKEN = 3;

class ZeichnenSpiel {
  constructor(hub, einstellungen, hilfen) {
    this.hub = hub;
    this.filter = hilfen.filter;
    this.runden = einstellungen.runden;
    this.gesamtMs = einstellungen.sekunden * 1000;
    this.woerter = this.stelleWoerterZusammen(einstellungen);
    this.benutzt = new Set();
    this.gezeichnet = new Map(); // spielerId -> Anzahl
    this.runde = 0;
    this.phase = 'warten';
    this.zugId = '';
    this.zeichnerId = null;
    this.letzterZeichnerBeitritt = -1;
    this.auswahl = [];
    this.wort = '';
    this.endeUm = 0;
    this.phasenDauer = 0;
    this.aufgedeckt = new Set();
    this.geraten = new Map(); // spielerId -> Punkte in diesem Zug
    this.ops = [];
    this.zeichnerWegSeit = 0;
    this.aufloesung = null;
    this.beendet = false;
  }

  stelleWoerterZusammen(e) {
    const listen = this.hub.daten.begriffsListen;
    const eigene = String(e.eigene || '')
      .split(/\r?\n/)
      .map((z) => saeubere(z, 32))
      .filter((z) => normalisiere(z).length >= 2);
    let basis;
    if (e.liste === 'eigene') basis = eigene.length >= 3 ? [] : Object.values(listen).flat();
    else if (e.liste === 'alle' || !listen[e.liste]) basis = Object.values(listen).flat();
    else basis = listen[e.liste];
    const alle = [...basis, ...eigene];
    // doppelte (nach Vergleichsform) entfernen
    const gesehen = new Set();
    return alle.filter((w) => {
      const n = normalisiere(w);
      if (gesehen.has(n)) return false;
      gesehen.add(n);
      return true;
    });
  }

  jetzt() {
    return this.hub.raum.pause ? this.hub.raum.pauseSeit : Date.now();
  }

  onlineSpieler() {
    return this.hub.spieler().filter((s) => s.socketId);
  }

  // ----- Ablauf -----
  starte() {
    this.naechsterZug();
  }

  beende() {
    this.beendet = true;
  }

  naechsterZug() {
    if (this.runde >= this.runden) {
      this.phase = 'ende';
      this.zeichnerId = null;
      this.hub.chat({ art: 'system', text: 'Das Spiel ist vorbei!' });
      this.hub.aktualisiere();
      return;
    }
    const online = this.onlineSpieler().sort((a, b) => a.beigetreten - b.beigetreten);
    if (online.length < 2) {
      this.phase = 'warten';
      this.zeichnerId = null;
      this.hub.aktualisiere();
      return;
    }
    const min = Math.min(...online.map((s) => this.gezeichnet.get(s.id) || 0));
    const kandidaten = online.filter((s) => (this.gezeichnet.get(s.id) || 0) === min);
    const zeichner = kandidaten.find((s) => s.beigetreten > this.letzterZeichnerBeitritt) || kandidaten[0];

    this.runde++;
    this.zeichnerId = zeichner.id;
    this.letzterZeichnerBeitritt = zeichner.beigetreten;
    this.gezeichnet.set(zeichner.id, (this.gezeichnet.get(zeichner.id) || 0) + 1);
    this.zugId = this.runde + '-' + Math.random().toString(36).slice(2, 8);
    this.auswahl = this.ziehe(3);
    this.wort = '';
    this.aufgedeckt = new Set();
    this.geraten = new Map();
    this.ops = [];
    this.zeichnerWegSeit = 0;
    this.aufloesung = null;
    this.phase = 'wahl';
    this.phasenDauer = WAHL_MS;
    this.endeUm = Date.now() + WAHL_MS;
    this.hub.sendeAlle('zeichnen:alles', { zugId: this.zugId, ops: [] });
    this.hub.chat({ art: 'system', text: `${zeichner.name} ist jetzt dran mit Zeichnen.` });
    this.hub.aktualisiere();
  }

  ziehe(anzahl) {
    let frei = this.woerter.filter((w) => !this.benutzt.has(w));
    if (frei.length < anzahl) {
      this.benutzt.clear();
      frei = this.woerter.slice();
    }
    return mische(frei).slice(0, anzahl);
  }

  waehle(index) {
    if (this.phase !== 'wahl') return;
    const wort = this.auswahl[index];
    if (!wort) return;
    this.wort = wort;
    this.benutzt.add(wort);
    this.phase = 'zeichnen';
    this.phasenDauer = this.gesamtMs;
    this.endeUm = Date.now() + this.gesamtMs;
    this.hub.aktualisiere();
  }

  endeZug(grund) {
    if (this.phase !== 'wahl' && this.phase !== 'zeichnen') return;
    const zeichner = this.hub.holeSpieler(this.zeichnerId);
    const punkteListe = [];
    const n = this.geraten.size;
    let zeichnerPunkte = 0;
    if (zeichner && n > 0 && this.phase === 'zeichnen') {
      zeichnerPunkte = Math.min(100, 30 + 10 * n);
      zeichner.punkte += zeichnerPunkte;
    }
    for (const [id, p] of this.geraten) {
      const s = this.hub.holeSpieler(id);
      if (s) punkteListe.push({ name: s.name, punkte: p, team: s.team });
    }
    if (!this.wort && this.auswahl.length) this.wort = '';
    this.aufloesung = {
      wort: this.wort,
      grund,
      zeichner: zeichner ? zeichner.name : 'Das Zeichenkind',
      zeichnerPunkte,
      geraten: punkteListe,
    };
    this.phase = 'aufloesung';
    this.phasenDauer = AUFLOESUNG_MS;
    this.endeUm = Date.now() + AUFLOESUNG_MS;
    if (this.wort) this.hub.chat({ art: 'system', text: `Das Wort war: ${this.wort}` });
    this.hub.aktualisiere();
  }

  tick(jetzt) {
    if (this.beendet) return;
    if (this.phase === 'warten') {
      if (this.onlineSpieler().length >= 2) this.naechsterZug();
      return;
    }
    if (this.phase === 'ende') return;

    if ((this.phase === 'wahl' || this.phase === 'zeichnen') && this.zeichnerWegSeit && jetzt - this.zeichnerWegSeit > ZEICHNER_WARTEZEIT_MS) {
      return this.endeZug('zeichnerWeg');
    }

    if (this.phase === 'wahl' && jetzt >= this.endeUm) return this.waehle(0);

    if (this.phase === 'zeichnen') {
      if (jetzt >= this.endeUm) return this.endeZug('zeit');
      const anteil = 1 - (this.endeUm - jetzt) / this.gesamtMs;
      const buchstaben = [...this.wort].map((z, i) => ({ z, i })).filter((x) => /[\p{L}\p{N}]/u.test(x.z));
      const maxHinweise = Math.max(0, buchstaben.length - 2);
      const soll = Math.min(maxHinweise, anteil >= 0.75 ? 2 : anteil >= 0.5 ? 1 : 0);
      if (this.aufgedeckt.size < soll) {
        const frei = buchstaben.filter((x) => !this.aufgedeckt.has(x.i));
        if (frei.length) {
          this.aufgedeckt.add(frei[Math.floor(Math.random() * frei.length)].i);
          this.hub.aktualisiere();
        }
      }
      const ratende = this.onlineSpieler().filter((s) => s.id !== this.zeichnerId);
      if (ratende.length > 0 && ratende.every((s) => this.geraten.has(s.id))) return this.endeZug('alle');
      if (this.onlineSpieler().length < 2 && !this.zeichnerWegSeit) return this.endeZug('zuWenige');
    }

    if (this.phase === 'aufloesung' && jetzt >= this.endeUm) this.naechsterZug();
  }

  verschiebe(ms) {
    this.endeUm += ms;
    if (this.zeichnerWegSeit) this.zeichnerWegSeit += ms;
  }

  ueberspringe() {
    if (this.phase === 'wahl' || this.phase === 'zeichnen') this.endeZug('uebersprungen');
    else if (this.phase === 'aufloesung') this.naechsterZug();
  }

  // ----- Verbindungen -----
  spielerWeg(id, endgueltig) {
    if (id !== this.zeichnerId) return;
    if (this.phase !== 'wahl' && this.phase !== 'zeichnen') return;
    if (endgueltig) this.endeZug('zeichnerWeg');
    else this.zeichnerWegSeit = Date.now();
  }

  spielerDa(id, sock) {
    if (id && id === this.zeichnerId) this.zeichnerWegSeit = 0;
    const paket = { zugId: this.zugId, ops: this.ops };
    if (sock) sock.emit('zeichnen:alles', paket);
    else if (id) this.hub.sende(id, 'zeichnen:alles', paket);
  }

  // ----- Eingaben -----
  kindEreignis(spieler, art, d) {
    if (art === 'waehle' && spieler.id === this.zeichnerId) this.waehle(Number(d.index));
    return { ok: true };
  }

  lehrerEreignis() {
    return null;
  }

  bildLoeschen() {
    this.ops = [];
    this.hub.sendeAlle('zeichnen:alles', { zugId: this.zugId, ops: [] });
  }

  zeichenEreignis(spieler, d) {
    if (this.phase !== 'zeichnen' || spieler.id !== this.zeichnerId) return;
    const typ = d.typ;
    let weiter = null;
    if (typ === 'start') {
      if (this.ops.length >= MAX_OPS) return;
      const op = {
        t: 's',
        id: String(d.id || '').slice(0, 16),
        f: ganz(d.f, 0, ANZAHL_FARBEN - 1),
        b: ganz(d.b, 0, ANZAHL_STAERKEN - 1),
        p: punkte(d.p, 400),
      };
      if (!op.id || !op.p.length) return;
      this.ops.push(op);
      weiter = op;
    } else if (typ === 'punkte') {
      const id = String(d.id || '').slice(0, 16);
      const op = this.ops.length && this.ops[this.ops.length - 1];
      if (!op || op.t !== 's' || op.id !== id) return;
      const neu = punkte(d.p, 400);
      if (!neu.length || op.p.length + neu.length > MAX_PUNKTE_JE_STRICH) return;
      for (const pt of neu) op.p.push(pt);
      weiter = { t: 'p', id, p: neu };
    } else if (typ === 'fuellen') {
      if (this.ops.length >= MAX_OPS) return;
      const op = { t: 'f', x: ganz(d.x, 0, BREITE - 1), y: ganz(d.y, 0, HOEHE - 1), f: ganz(d.f, 0, ANZAHL_FARBEN - 1) };
      this.ops.push(op);
      weiter = op;
    } else if (typ === 'rueckgaengig') {
      if (!this.ops.length) return;
      this.ops.pop();
      weiter = { t: 'u' };
    } else if (typ === 'leeren') {
      this.ops = [];
      weiter = { t: 'c' };
    }
    if (weiter) this.hub.sendeAlle('zeichnen:op', { zugId: this.zugId, op: weiter }, spieler.id);
  }

  nachricht(spieler, text) {
    const nurIch = [spieler.id];
    const eintrag = { name: spieler.name, team: spieler.team, text };
    if (this.phase !== 'zeichnen') {
      if (this.phase === 'wahl' && spieler.id === this.zeichnerId) return; // nichts verraten
      this.hub.chat({ ...eintrag, art: 'rate', nur: spieler.stumm ? nurIch : null });
      return;
    }
    const wissende = [this.zeichnerId, ...this.geraten.keys()];
    if (spieler.id === this.zeichnerId || this.geraten.has(spieler.id)) {
      this.hub.chat({ ...eintrag, art: 'intern', nur: spieler.stumm ? nurIch : wissende });
      return;
    }
    const versuch = normalisiere(text);
    const ziel = normalisiere(this.wort);
    if (versuch && versuch === ziel) {
      const restMs = Math.max(0, this.endeUm - this.jetzt());
      let p = Math.ceil((100 * restMs) / this.gesamtMs);
      if (this.geraten.size === 0) p += 20;
      this.geraten.set(spieler.id, p);
      spieler.punkte += p;
      this.hub.chat({ art: 'richtig', name: spieler.name, team: spieler.team, text: `${spieler.name} hat das Wort!` });
      this.hub.sende(spieler.id, 'geraten', { punkte: p, wort: this.wort });
      this.hub.aktualisiere();
      return;
    }
    this.hub.chat({ ...eintrag, art: 'rate', nur: spieler.stumm ? nurIch : null });
    if (versuch.length >= 3 && abstand(versuch, ziel) === 1) {
      this.hub.chat({ art: 'nah', text: `„${text}“ ist ganz nah dran!`, nur: nurIch });
    }
  }

  // ----- Sicht je Rolle -----
  sicht(rolle, spielerId) {
    const zeichner = this.hub.holeSpieler(this.zeichnerId);
    const istZeichner = rolle === 'kind' && spielerId === this.zeichnerId;
    const hatGeraten = rolle === 'kind' && this.geraten.has(spielerId);
    const offen = this.phase === 'aufloesung' || this.phase === 'ende' || istZeichner || hatGeraten;
    const muster = [...this.wort].map((z, i) => {
      if (z === ' ') return { z: ' ', art: 'luecke' };
      if (!/[\p{L}\p{N}]/u.test(z)) return { z, art: 'zeichen' };
      return offen || this.aufgedeckt.has(i) ? { z, art: 'buchstabe' } : { z: '', art: 'leer' };
    });
    return {
      art: 'zeichnen',
      phase: this.phase,
      runde: this.runde,
      runden: this.runden,
      zugId: this.zugId,
      zeichner: zeichner ? { id: zeichner.id, name: zeichner.name } : null,
      restMs: Math.max(0, this.endeUm - this.jetzt()),
      phasenDauer: this.phasenDauer,
      muster: this.phase === 'zeichnen' || this.phase === 'aufloesung' ? muster : [],
      istZeichner,
      hatGeraten,
      auswahl: istZeichner && this.phase === 'wahl' ? this.auswahl : null,
      wort: (offen && this.phase !== 'wahl') || (rolle === 'lehrer' && this.phase === 'zeichnen') ? this.wort : null,
      geraten: [...this.geraten.keys()],
      aufloesung: this.phase === 'aufloesung' ? this.aufloesung : null,
    };
  }
}

function ganz(wert, min, max) {
  const n = Math.round(Number(wert));
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

function punkte(liste, max) {
  if (!Array.isArray(liste)) return [];
  const aus = [];
  for (const pt of liste.slice(0, max)) {
    if (!Array.isArray(pt) || pt.length < 2) continue;
    aus.push([ganz(pt[0], 0, BREITE), ganz(pt[1], 0, HOEHE)]);
  }
  return aus;
}

module.exports = ZeichnenSpiel;
