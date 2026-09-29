'use strict';
// Saboteur
// Die Crew erledigt Aufgaben im nächtlichen Schulhaus, heimliche Saboteure erwischen sie.
// Wer erwischt wird, spielt als Geist weiter. In Konferenzen wird abgestimmt.

const KARTE = require('../public/saboteur-karte');
const { mische } = require('./werkzeuge');

const TAKT_MS = 66; // Positionen etwa 15-mal pro Sekunde
const TEMPO = 4.2; // Kacheln pro Sekunde
const GEIST_TEMPO = 5.6;
const SICHT_CREW = 5.5;
const SICHT_SABOTEUR = 7;
const ERWISCH_WEITE = 1.7;
const MELDE_WEITE = 2.4;
const AUFGABE_WEITE = 1.9;
const KNOPF_WEITE = 2;
const ROLLEN_MS = 6000;
const ERGEBNIS_MS = 7000;
const RUNDENENDE_MS = 15000;
const DURCHSAGE_SPERRE_MS = 15000;
const MIN_AUFGABE_MS = 1200;
const SIEG_PUNKTE = 100;
const MIN_SPIELER = 4;

const FARBEN = [
  '#E94F4F', '#3A7BD5', '#5BAA4A', '#F5CB5E', '#8B5CF6', '#F28C38', '#3FB8AF', '#EC6FB0',
  '#8B5A3C', '#FFFFFF', '#9696A8', '#B5D334', '#1F5F8B', '#A0314B', '#6FD1F2',
];

class SaboteurSpiel {
  static pruefeStart(anzahl) {
    if (anzahl < MIN_SPIELER) return `Für Saboteur braucht es mindestens ${MIN_SPIELER} Mitspielende im Raum.`;
    return null;
  }

  constructor(hub, e) {
    this.hub = hub;
    this.runden = e.runden;
    this.saboteure = e.saboteure;
    this.aufgabenAnzahl = e.aufgaben;
    this.abklingMs = e.abklingSekunden * 1000;
    this.abstimmMs = e.abstimmSekunden * 1000;
    this.notrufe = e.notrufe;
    this.aufdecken = e.aufdecken !== false;
    this.runde = 0;
    this.phase = 'warten';
    this.mit = null; // spielerId -> Mitspieler dieser Runde
    this.umrisse = [];
    this.konferenz = null;
    this.ergebnisInfo = null;
    this.sieg = null;
    this.teleport = 0;
    this.endeUm = 0;
    this.phasenDauer = 1;
    this.knopfFreiAb = 0;
    this.beendet = false;
  }

  jetzt() {
    return this.hub.raum.pause ? this.hub.raum.pauseSeit : Date.now();
  }

  name(p) {
    const s = this.hub.holeSpieler(p.id);
    return s ? s.name : p.name;
  }

  // ----- Ablauf -----
  starte() {
    this.takt = setInterval(() => this.schritt(), TAKT_MS);
    this.neueRunde();
  }

  beende() {
    this.beendet = true;
    clearInterval(this.takt);
  }

  neueRunde() {
    if (this.runde >= this.runden) {
      this.phase = 'ende';
      this.hub.aktualisiere();
      return;
    }
    const online = this.hub.spieler().filter((s) => s.socketId).sort((a, b) => a.beigetreten - b.beigetreten);
    if (online.length < MIN_SPIELER) {
      this.phase = 'warten';
      this.mit = null;
      this.hub.aktualisiere();
      return;
    }
    this.runde++;
    const n = online.length;
    const anzahl = Math.max(1, Math.min(this.saboteure, Math.floor((n - 1) / 3)));
    const saboteure = new Set(mische(online.map((s) => s.id)).slice(0, anzahl));
    const jetzt = Date.now();
    this.mit = new Map();
    online.forEach((s, i) => {
      const platz = KARTE.startPlatz(i, n);
      const stationen = mische(KARTE.stationen.map((_, k) => k)).slice(0, this.aufgabenAnzahl);
      this.mit.set(s.id, {
        id: s.id,
        name: s.name,
        index: i,
        farbe: FARBEN[i % FARBEN.length],
        rolle: saboteure.has(s.id) ? 'saboteur' : 'crew',
        lebt: true,
        bekannt: false, // weiß die ganze Gruppe schon, dass die Figur raus ist?
        raus: false, // in einer Konferenz rausgeworfen
        weg: false, // hat das Spiel verlassen
        x: platz.x,
        y: platz.y,
        aufgaben: stationen.map((station) => ({ station, erledigt: false })),
        notrufe: this.notrufe,
        abklingBis: 0,
        offen: null,
        letzte: jetzt,
      });
    });
    this.umrisse = [];
    this.konferenz = null;
    this.ergebnisInfo = null;
    this.sieg = null;
    this.teleport++;
    this.phase = 'rollen';
    this.phasenDauer = ROLLEN_MS;
    this.endeUm = jetzt + ROLLEN_MS;
    this.hub.aktualisiere();
  }

  tick(jetzt) {
    if (this.beendet) return;
    if (this.phase === 'warten') {
      if (this.hub.spieler().filter((s) => s.socketId).length >= MIN_SPIELER) this.neueRunde();
      return;
    }
    if (this.phase === 'rollen' && jetzt >= this.endeUm) {
      this.phase = 'spiel';
      for (const p of this.mit.values()) if (p.rolle === 'saboteur') p.abklingBis = jetzt + this.abklingMs;
      this.knopfFreiAb = jetzt + DURCHSAGE_SPERRE_MS;
      this.hub.aktualisiere();
    } else if (this.phase === 'konferenz' && jetzt >= this.endeUm) {
      this.werteKonferenzAus();
    } else if (this.phase === 'ergebnis' && jetzt >= this.endeUm) {
      this.nachErgebnis();
    } else if (this.phase === 'rundenende' && jetzt >= this.endeUm) {
      this.neueRunde();
    }
  }

  verschiebe(ms) {
    this.endeUm += ms;
    this.knopfFreiAb += ms;
    if (!this.mit) return;
    for (const p of this.mit.values()) {
      p.abklingBis += ms;
      if (p.offen) p.offen.t += ms;
    }
  }

  ueberspringe() {
    if (this.phase === 'rollen' || this.phase === 'spiel') this.beendeRunde(null, 'abgebrochen');
    else if (this.phase === 'konferenz') this.werteKonferenzAus();
    else if (this.phase === 'ergebnis') this.nachErgebnis();
    else if (this.phase === 'rundenende') this.neueRunde();
  }

  // ----- Positionen: jede Figur bekommt nur, was sie sehen kann -----
  schritt() {
    if (this.beendet || this.hub.raum.pause || !this.mit) return;
    if (this.phase !== 'spiel' && this.phase !== 'rollen') return;
    for (const p of this.mit.values()) {
      if (p.weg) continue;
      this.hub.sende(p.id, 'saboteur:blick', this.sichtbar(p));
    }
  }

  sieht(ich, x, y, weite) {
    return Math.hypot(x - ich.x, y - ich.y) <= weite && KARTE.sichtFrei(ich.x, ich.y, x, y);
  }

  sichtbar(ich) {
    const allesSehen = !ich.lebt; // Geister und Zuschauer sehen alles
    const weite = ich.rolle === 'saboteur' ? SICHT_SABOTEUR : SICHT_CREW;
    const s = [];
    for (const p of this.mit.values()) {
      if (p === ich || p.weg) continue;
      if (!allesSehen && (!p.lebt || !this.sieht(ich, p.x, p.y, weite))) continue;
      s.push([p.index, Math.round(p.x * 100), Math.round(p.y * 100), p.lebt ? 0 : 1]);
    }
    const u = [];
    for (const k of this.umrisse) {
      if (allesSehen || this.sieht(ich, k.x, k.y, weite)) u.push([k.index, Math.round(k.x * 100), Math.round(k.y * 100)]);
    }
    return { s, u };
  }

  bewegung(spieler, d) {
    if (this.phase !== 'spiel' || !this.mit) return;
    const p = this.mit.get(spieler.id);
    if (!p || p.weg) return;
    const x = Number(d.x);
    const y = Number(d.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    const jetzt = Date.now();
    // Auch nach langem Stillstand nur ein kurzer Schritt: kein Springen quer durchs Haus
    const dt = Math.min(0.25, Math.max(0.03, (jetzt - p.letzte) / 1000));
    p.letzte = jetzt;
    const tempo = p.lebt ? TEMPO : GEIST_TEMPO;
    let ok = Math.hypot(x - p.x, y - p.y) <= tempo * dt * 1.6 + 0.25;
    if (ok && p.lebt) ok = KARTE.wegFrei(p.x, p.y, x, y);
    if (ok && !p.lebt) ok = x >= 0.5 && y >= 0.5 && x <= KARTE.BREITE - 0.5 && y <= KARTE.HOEHE - 0.5;
    if (!ok) {
      this.hub.sende(p.id, 'saboteur:korrektur', { x: p.x, y: p.y });
      return;
    }
    p.x = x;
    p.y = y;
  }

  // ----- Handlungen -----
  kindEreignis(spieler, art, d) {
    const p = this.mit && this.mit.get(spieler.id);
    if (!p || p.weg) return { ok: false };
    const jetzt = Date.now();
    const imSpiel = this.phase === 'spiel';

    if (art === 'aufgabeOeffnen') {
      if (!imSpiel || p.rolle === 'zuschauer') return { ok: false };
      const st = Number(d.station);
      const station = KARTE.stationen[st];
      const aufgabe = p.aufgaben.find((a) => a.station === st && !a.erledigt);
      if (!station || !aufgabe) return { ok: false, fehler: 'Das ist nicht deine Aufgabe.' };
      if (Math.hypot(station.x - p.x, station.y - p.y) > AUFGABE_WEITE + 0.4) return { ok: false, fehler: 'Geh näher heran.' };
      p.offen = { station: st, t: jetzt };
      return { ok: true };
    }
    if (art === 'aufgabeZu') {
      p.offen = null;
      return { ok: true };
    }
    if (art === 'aufgabeFertig') {
      const st = Number(d.station);
      if (!imSpiel || !p.offen || p.offen.station !== st || jetzt - p.offen.t < MIN_AUFGABE_MS) return { ok: false };
      p.offen = null;
      const aufgabe = p.aufgaben.find((a) => a.station === st && !a.erledigt);
      if (!aufgabe) return { ok: false };
      aufgabe.erledigt = true;
      if (p.rolle === 'saboteur') {
        this.hub.aktualisiere();
        return { ok: true, vorgetaeuscht: true };
      }
      this.hub.aktualisiere();
      this.pruefeSieg();
      return { ok: true };
    }
    if (art === 'erwischen') {
      if (!imSpiel || p.rolle !== 'saboteur' || !p.lebt) return { ok: false };
      if (jetzt < p.abklingBis) return { ok: false, fehler: 'Noch nicht bereit.' };
      let ziel = null;
      let abstand = ERWISCH_WEITE;
      for (const q of this.mit.values()) {
        if (q.rolle !== 'crew' || !q.lebt || q.weg) continue;
        const a = Math.hypot(q.x - p.x, q.y - p.y);
        if (a <= abstand && KARTE.sichtFrei(p.x, p.y, q.x, q.y)) { ziel = q; abstand = a; }
      }
      if (!ziel) return { ok: false, fehler: 'Niemand in Reichweite.' };
      ziel.lebt = false;
      ziel.offen = null;
      this.umrisse.push({ index: ziel.index, id: ziel.id, x: ziel.x, y: ziel.y });
      p.abklingBis = jetzt + this.abklingMs;
      this.hub.sende(ziel.id, 'saboteur:erwischt', {});
      this.hub.aktualisiere();
      this.pruefeSieg();
      return { ok: true };
    }
    if (art === 'melden') {
      if (!imSpiel || !p.lebt) return { ok: false };
      const umriss = this.umrisse.find((k) => Math.hypot(k.x - p.x, k.y - p.y) <= MELDE_WEITE && KARTE.sichtFrei(p.x, p.y, k.x, k.y));
      if (!umriss) return { ok: false, fehler: 'Hier ist nichts zu melden.' };
      this.starteKonferenz('melden', p, umriss);
      return { ok: true };
    }
    if (art === 'durchsage') {
      if (!imSpiel || !p.lebt) return { ok: false };
      if (p.notrufe <= 0) return { ok: false, fehler: 'Du hast keine Durchsage mehr.' };
      if (jetzt < this.knopfFreiAb) return { ok: false, fehler: 'Das Mikrofon ist noch nicht bereit.' };
      if (Math.hypot(KARTE.knopf.x - p.x, KARTE.knopf.y - p.y) > KNOPF_WEITE + 0.4) return { ok: false, fehler: 'Geh näher ans Mikrofon.' };
      p.notrufe--;
      this.starteKonferenz('durchsage', p, null);
      return { ok: true };
    }
    if (art === 'stimme') {
      if (this.phase !== 'konferenz' || !p.lebt) return { ok: false };
      if (this.konferenz.stimmen.has(p.id)) return { ok: false, fehler: 'Du hast schon abgestimmt.' };
      let ziel = null;
      if (d.ziel === 'skip') ziel = 'skip';
      else {
        const q = this.mit.get(String(d.ziel || ''));
        if (q && q.lebt && !q.weg) ziel = q.id;
      }
      if (!ziel) return { ok: false };
      this.konferenz.stimmen.set(p.id, ziel);
      this.hub.aktualisiere();
      if (this.lebende().every((q) => this.konferenz.stimmen.has(q.id))) this.werteKonferenzAus();
      return { ok: true };
    }
    return { ok: false };
  }

  lebende() {
    return [...this.mit.values()].filter((p) => p.lebt && !p.weg && p.rolle !== 'zuschauer');
  }

  // ----- Konferenz -----
  starteKonferenz(anlass, von, umriss) {
    const jetzt = Date.now();
    for (const p of this.mit.values()) if (!p.lebt) p.bekannt = true;
    const opfer = umriss ? this.mit.get(umriss.id) : null;
    this.konferenz = {
      anlass,
      von: this.name(von),
      vonFarbe: von.farbe,
      umriss: opfer ? this.name(opfer) : null,
      umrissFarbe: opfer ? opfer.farbe : null,
      stimmen: new Map(),
    };
    this.umrisse = [];
    const alle = [...this.mit.values()].filter((p) => !p.weg);
    alle.forEach((p, i) => {
      const platz = KARTE.startPlatz(i, alle.length);
      p.x = platz.x;
      p.y = platz.y;
      p.offen = null;
    });
    this.teleport++;
    this.phase = 'konferenz';
    this.phasenDauer = this.abstimmMs;
    this.endeUm = jetzt + this.abstimmMs;
    this.hub.aktualisiere();
  }

  werteKonferenzAus() {
    if (this.phase !== 'konferenz') return;
    const zaehler = new Map();
    for (const z of this.konferenz.stimmen.values()) zaehler.set(z, (zaehler.get(z) || 0) + 1);
    let spitze = 0;
    for (const n of zaehler.values()) spitze = Math.max(spitze, n);
    const vorn = [...zaehler.entries()].filter(([, n]) => n === spitze).map(([z]) => z);
    let raus = null;
    let grund;
    if (!zaehler.size) grund = 'keine';
    else if (vorn.length > 1) grund = 'gleichstand';
    else if (vorn[0] === 'skip') grund = 'uebersprungen';
    else { raus = this.mit.get(vorn[0]); grund = 'mehrheit'; }
    if (raus) {
      raus.lebt = false;
      raus.bekannt = true;
      raus.raus = true;
    }
    this.ergebnisInfo = {
      grund,
      raus: raus ? { i: raus.index, name: this.name(raus), farbe: raus.farbe } : null,
      warSaboteur: raus && this.aufdecken ? raus.rolle === 'saboteur' : null,
      stimmen: [...zaehler.entries()]
        .filter(([z]) => z !== 'skip' && this.mit.get(z))
        .map(([z, n]) => { const q = this.mit.get(z); return { i: q.index, name: this.name(q), farbe: q.farbe, n }; })
        .sort((a, b) => b.n - a.n),
      skip: zaehler.get('skip') || 0,
    };
    this.konferenz = null;
    this.phase = 'ergebnis';
    this.phasenDauer = ERGEBNIS_MS;
    this.endeUm = Date.now() + ERGEBNIS_MS;
    this.hub.aktualisiere();
  }

  nachErgebnis() {
    if (this.pruefeSieg()) return;
    const jetzt = Date.now();
    for (const p of this.mit.values()) if (p.rolle === 'saboteur') p.abklingBis = jetzt + this.abklingMs;
    this.knopfFreiAb = jetzt + DURCHSAGE_SPERRE_MS;
    this.phase = 'spiel';
    this.hub.aktualisiere();
  }

  // ----- Sieg -----
  fortschritt() {
    let erledigt = 0;
    let gesamt = 0;
    if (!this.mit) return { erledigt, gesamt };
    for (const p of this.mit.values()) {
      if (p.rolle !== 'crew' || p.weg) continue;
      gesamt += p.aufgaben.length;
      erledigt += p.aufgaben.filter((a) => a.erledigt).length;
    }
    return { erledigt, gesamt };
  }

  pruefeSieg() {
    if (!this.mit || (this.phase !== 'spiel' && this.phase !== 'ergebnis')) return false;
    const alle = [...this.mit.values()].filter((p) => p.rolle !== 'zuschauer' && !p.weg);
    const sabLebend = alle.filter((p) => p.rolle === 'saboteur' && p.lebt).length;
    const crewLebend = alle.filter((p) => p.rolle === 'crew' && p.lebt).length;
    const { erledigt, gesamt } = this.fortschritt();
    let seite = null;
    let grund = null;
    if (gesamt > 0 && erledigt >= gesamt) { seite = 'crew'; grund = 'aufgaben'; }
    else if (sabLebend === 0) { seite = 'crew'; grund = 'enttarnt'; }
    else if (sabLebend >= crewLebend) { seite = 'saboteure'; grund = 'ueberzahl'; }
    if (!seite) return false;
    this.beendeRunde(seite, grund);
    return true;
  }

  beendeRunde(seite, grund) {
    const liste = [...this.mit.values()].filter((p) => p.rolle !== 'zuschauer');
    this.sieg = {
      seite,
      grund,
      saboteure: liste.filter((p) => p.rolle === 'saboteur').map((p) => ({ i: p.index, name: this.name(p), farbe: p.farbe })),
      punkte: seite ? SIEG_PUNKTE : 0,
    };
    if (seite) {
      for (const p of liste) {
        if ((seite === 'crew') === (p.rolle === 'crew')) {
          const s = this.hub.holeSpieler(p.id);
          if (s) s.punkte += SIEG_PUNKTE;
        }
      }
    }
    this.konferenz = null;
    this.umrisse = [];
    this.phase = 'rundenende';
    this.phasenDauer = RUNDENENDE_MS;
    this.endeUm = Date.now() + RUNDENENDE_MS;
    this.hub.aktualisiere();
  }

  // ----- Verbindungen -----
  spielerWeg(id, endgueltig) {
    if (!endgueltig || !this.mit) return;
    const p = this.mit.get(id);
    if (!p) return;
    p.weg = true;
    p.lebt = false;
    p.bekannt = true;
    if (this.phase === 'konferenz') {
      this.konferenz.stimmen.delete(id);
      if (this.lebende().length && this.lebende().every((q) => this.konferenz.stimmen.has(q.id))) this.werteKonferenzAus();
    }
    if (this.phase === 'spiel') this.pruefeSieg();
    this.hub.aktualisiere();
  }

  spielerDa(id) {
    if (!id || !this.mit || this.mit.has(id)) return;
    if (this.phase === 'warten' || this.phase === 'ende') return;
    // Wer mitten in einer Runde dazukommt, schaut als Geist zu.
    const s = this.hub.holeSpieler(id);
    const index = this.mit.size;
    this.mit.set(id, {
      id, name: s ? s.name : '?', index, farbe: FARBEN[index % FARBEN.length],
      rolle: 'zuschauer', lebt: false, bekannt: true, raus: false, weg: false,
      x: KARTE.tisch.x, y: KARTE.tisch.y, aufgaben: [], notrufe: 0, abklingBis: 0, offen: null, letzte: Date.now(),
    });
    this.hub.aktualisiere();
  }

  // ----- Sicht je Rolle -----
  status(p, wahr) {
    if (p.weg) return 'weg';
    if (p.raus) return 'raus';
    if (!p.lebt && (wahr || p.bekannt)) return 'erwischt';
    return 'da';
  }

  sicht(rolle, spielerId) {
    const ich = rolle === 'kind' && this.mit ? this.mit.get(spielerId) : null;
    const wahr = !!ich && (ich.rolle === 'saboteur' || !ich.lebt);
    const aufgedeckt = this.phase === 'rundenende' || this.phase === 'ende';
    const jetzt = this.jetzt();
    const mitspieler = this.mit
      ? [...this.mit.values()].filter((p) => p.rolle !== 'zuschauer').map((p) => ({
        i: p.index,
        id: p.id,
        name: this.name(p),
        farbe: p.farbe,
        status: this.status(p, wahr),
        sab: p.rolle === 'saboteur' && (aufgedeckt || (ich && ich.rolle === 'saboteur')) ? true : undefined,
      }))
      : [];
    const sicht = {
      art: 'saboteur',
      phase: this.phase,
      runde: this.runde,
      runden: this.runden,
      restMs: Math.max(0, this.endeUm - jetzt),
      phasenDauer: this.phasenDauer,
      fortschritt: this.fortschritt(),
      mitspieler,
      teleport: this.teleport,
      aufdecken: this.aufdecken,
      minSpieler: MIN_SPIELER,
      konferenz: this.phase === 'konferenz' ? {
        anlass: this.konferenz.anlass,
        von: this.konferenz.von,
        vonFarbe: this.konferenz.vonFarbe,
        umriss: this.konferenz.umriss,
        umrissFarbe: this.konferenz.umrissFarbe,
        abgestimmt: [...this.konferenz.stimmen.keys()].map((id) => this.mit.get(id).index),
        lebende: this.lebende().length,
      } : null,
      ergebnis: this.phase === 'ergebnis' ? this.ergebnisInfo : null,
      sieg: aufgedeckt ? this.sieg : null,
    };
    if (ich) {
      sicht.ich = {
        i: ich.index,
        rolle: ich.rolle,
        lebt: ich.lebt,
        x: ich.x,
        y: ich.y,
        aufgaben: ich.aufgaben,
        notrufe: ich.notrufe,
        abklingRestMs: Math.max(0, ich.abklingBis - jetzt),
        knopfRestMs: Math.max(0, this.knopfFreiAb - jetzt),
        stimme: this.phase === 'konferenz' ? this.konferenz.stimmen.get(ich.id) || null : null,
      };
    }
    // Nur für die Regie (gedrückt halten), nie für die Bühne
    if (rolle === 'lehrer' && this.mit) {
      sicht.rollen = [...this.mit.values()].filter((p) => p.rolle === 'saboteur').map((p) => this.name(p));
    }
    return sicht;
  }
}

module.exports = SaboteurSpiel;
