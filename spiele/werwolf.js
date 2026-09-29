'use strict';
// Werwolf
// Das Handy verteilt die Rollen und übernimmt die Spielleitung für Nacht und Abstimmung.
// Rollen: Werwölfe, Seherin, Hexe, Dorfbewohner.

const { BasisSpiel, zahl } = require('./basis');
const { mische } = require('./werkzeuge');

const ROLLEN_MS = 12000;
const WOELFE_MS = 45000;
const SEHERIN_MS = 30000;
const HEXE_MS = 35000;
const MORGEN_MS = 10000;
const URTEIL_MS = 10000;
// Ist eine Rolle nicht (mehr) im Spiel, dauert ihre Phase trotzdem kurz, damit niemand etwas merkt.
const SCHEIN_MS = [7000, 11000];

const ROLLEN = {
  werwolf: 'Werwolf',
  seherin: 'Seherin',
  hexe: 'Hexe',
  dorf: 'Dorfbewohner',
};

class WerwolfSpiel extends BasisSpiel {
  static vorlage() {
    return { woelfe: 0, seherin: true, hexe: true, tagSekunden: 180, aufdecken: true };
  }

  static uebernimm(z, d) {
    if (d.woelfe !== undefined) z.woelfe = zahl(d.woelfe, 0, 4, 0);
    if (typeof d.seherin === 'boolean') z.seherin = d.seherin;
    if (typeof d.hexe === 'boolean') z.hexe = d.hexe;
    if (d.tagSekunden !== undefined) z.tagSekunden = zahl(d.tagSekunden, 60, 600, 180);
    if (typeof d.aufdecken === 'boolean') z.aufdecken = d.aufdecken;
  }

  static pruefeStart(anzahl) {
    return anzahl < 5 ? 'Für Werwolf braucht es mindestens 5 Mitspielende.' : null;
  }

  constructor(hub, e) {
    super(hub, { ...e, runden: 1 });
    this.nacht = 0;
  }

  starte() {
    const online = mische(this.online().map((s) => s.id));
    const n = online.length;
    const woelfe = this.e.woelfe || (n <= 6 ? 1 : n <= 11 ? 2 : 3);
    const anzahlWoelfe = Math.max(1, Math.min(woelfe, Math.floor((n - 1) / 2)));
    this.mit = new Map();
    let i = 0;
    const gib = (rolle) => { const id = online[i++]; this.mit.set(id, { id, rolle, lebt: true, grund: null }); };
    for (let k = 0; k < anzahlWoelfe; k++) gib('werwolf');
    if (this.e.seherin && i < n) gib('seherin');
    if (this.e.hexe && n >= 6 && i < n) gib('hexe');
    while (i < n) gib('dorf');
    this.heiltrank = true;
    this.gifttrank = true;
    this.protokoll = [];
    this.setzePhase('rollen', ROLLEN_MS);
  }

  lebende(rolle) {
    return [...this.mit.values()].filter((p) => p.lebt && (!rolle || p.rolle === rolle));
  }

  schein() {
    return SCHEIN_MS[0] + Math.random() * (SCHEIN_MS[1] - SCHEIN_MS[0]);
  }

  tick(jetzt) {
    if (this.beendet || !this.abgelaufen(jetzt)) return;
    if (this.phase === 'rollen') this.starteNacht();
    else if (this.phase === 'woelfe') this.woelfeFertig();
    else if (this.phase === 'seherin') this.starteHexe();
    else if (this.phase === 'hexe') this.starteMorgen();
    else if (this.phase === 'morgen') this.nachMorgen();
    else if (this.phase === 'tag') this.werteTagAus();
    else if (this.phase === 'urteil') this.nachUrteil();
  }

  ueberspringe() {
    if (this.phase === 'ende') return;
    this.endeUm = Date.now();
    this.tick(Date.now());
  }

  // ----- Nacht -----
  starteNacht() {
    this.nacht++;
    this.wahl = new Map(); // Werwolf -> Opfer
    this.opfer = null;
    this.gesehen = null;
    this.hexeEntschieden = false;
    this.geheilt = false;
    this.vergiftet = null;
    this.setzePhase('woelfe', WOELFE_MS);
  }

  woelfeFertig() {
    if (this.phase !== 'woelfe') return;
    const { gewaehlt } = BasisSpiel.zaehle(this.wahl);
    let opfer = gewaehlt;
    if (!opfer && this.wahl.size) { // Gleichstand: das Los entscheidet
      const ziele = [...this.wahl.values()];
      opfer = ziele[Math.floor(Math.random() * ziele.length)];
    }
    this.opfer = opfer && this.mit.get(opfer) && this.mit.get(opfer).lebt ? opfer : null;
    const seherin = this.lebende('seherin')[0];
    this.setzePhase('seherin', seherin ? SEHERIN_MS : this.e.seherin ? this.schein() : 1);
  }

  starteHexe() {
    const hexe = this.lebende('hexe')[0];
    const kannWas = hexe && (this.heiltrank || this.gifttrank);
    this.setzePhase('hexe', kannWas ? HEXE_MS : this.e.hexe && this.mit.size >= 6 ? this.schein() : 1);
  }

  starteMorgen() {
    const tote = [];
    if (this.opfer && !this.geheilt) tote.push({ id: this.opfer, grund: 'woelfe' });
    if (this.vergiftet && this.vergiftet !== this.opfer) tote.push({ id: this.vergiftet, grund: 'gift' });
    else if (this.vergiftet && this.geheilt) tote.push({ id: this.vergiftet, grund: 'gift' });
    for (const t of tote) {
      const p = this.mit.get(t.id);
      p.lebt = false;
      p.grund = 'nacht';
    }
    this.morgenTote = tote.map((t) => t.id);
    this.protokoll.push({ nacht: this.nacht, tote: this.morgenTote.slice() });
    this.setzePhase('morgen', MORGEN_MS);
  }

  nachMorgen() {
    if (this.pruefeSieg()) return;
    this.stimmen = new Map();
    this.setzePhase('tag', this.e.tagSekunden * 1000);
  }

  werteTagAus() {
    if (this.phase !== 'tag') return;
    const { gewaehlt, grund, zaehler } = BasisSpiel.zaehle(this.stimmen);
    if (gewaehlt) {
      const p = this.mit.get(gewaehlt);
      p.lebt = false;
      p.grund = 'dorf';
    }
    this.urteil = { gewaehlt, grund, stimmen: this.stimmenListe(zaehler), skip: zaehler.get('skip') || 0 };
    this.setzePhase('urteil', URTEIL_MS);
  }

  nachUrteil() {
    if (this.pruefeSieg()) return;
    this.starteNacht();
  }

  pruefeSieg() {
    const woelfe = this.lebende('werwolf').length;
    const andere = this.lebende().length - woelfe;
    let sieger = null;
    if (woelfe === 0) sieger = 'dorf';
    else if (woelfe >= andere) sieger = 'woelfe';
    if (!sieger) return false;
    this.sieger = sieger;
    for (const p of this.mit.values()) {
      if ((sieger === 'woelfe') === (p.rolle === 'werwolf')) this.gibPunkte(p.id, p.lebt ? 150 : 100);
    }
    this.setzePhase('ende', 0);
    return true;
  }

  // ----- Eingaben -----
  kindEreignis(spieler, art, d) {
    const ich = this.mit && this.mit.get(spieler.id);
    if (!ich || !ich.lebt) return { ok: false };
    const ziel = this.mit.get(String(d.ziel || ''));
    if (art === 'wolf') {
      if (this.phase !== 'woelfe' || ich.rolle !== 'werwolf') return { ok: false };
      if (!ziel || !ziel.lebt || ziel.rolle === 'werwolf') return { ok: false };
      this.wahl.set(ich.id, ziel.id);
      this.hub.aktualisiere();
      const woelfe = this.lebende('werwolf');
      if (woelfe.every((w) => this.wahl.get(w.id) === ziel.id)) {
        // alle einig: kurz warten, damit es nicht auffällt, dann weiter
        this.endeUm = Math.min(this.endeUm, Date.now() + 3000);
      }
      return { ok: true };
    }
    if (art === 'sehen') {
      if (this.phase !== 'seherin' || ich.rolle !== 'seherin' || this.gesehen) return { ok: false };
      if (!ziel || !ziel.lebt || ziel.id === ich.id) return { ok: false };
      this.gesehen = { id: ziel.id, wolf: ziel.rolle === 'werwolf' };
      this.endeUm = Math.min(this.endeUm, Date.now() + 6000);
      this.hub.aktualisiere();
      return { ok: true };
    }
    if (art === 'hexe') {
      if (this.phase !== 'hexe' || ich.rolle !== 'hexe' || this.hexeEntschieden) return { ok: false };
      if (d.heilen && this.heiltrank && this.opfer) { this.geheilt = true; this.heiltrank = false; }
      if (d.gift && this.gifttrank) {
        const g = this.mit.get(String(d.gift));
        if (g && g.lebt && g.id !== ich.id) { this.vergiftet = g.id; this.gifttrank = false; }
      }
      this.hexeEntschieden = true;
      this.endeUm = Math.min(this.endeUm, Date.now() + 2500);
      this.hub.aktualisiere();
      return { ok: true };
    }
    if (art === 'stimme') {
      if (this.phase !== 'tag') return { ok: false };
      if (this.stimmen.has(ich.id)) return { ok: false, fehler: 'Du hast schon abgestimmt.' };
      if (d.ziel !== 'skip' && (!ziel || !ziel.lebt || ziel.id === ich.id)) return { ok: false };
      this.stimmen.set(ich.id, d.ziel === 'skip' ? 'skip' : ziel.id);
      this.hub.aktualisiere();
      const berechtigt = this.lebende().filter((p) => { const s = this.hub.holeSpieler(p.id); return s && s.socketId; });
      if (berechtigt.every((p) => this.stimmen.has(p.id))) this.werteTagAus();
      return { ok: true };
    }
    return { ok: false };
  }

  spielerWeg(id, endgueltig) {
    if (!endgueltig || !this.mit || !this.mit.has(id)) return;
    const p = this.mit.get(id);
    if (!p.lebt) return;
    p.lebt = false;
    p.grund = 'weg';
    if (this.phase === 'tag' || this.phase === 'morgen' || this.phase === 'urteil') this.pruefeSieg();
    this.hub.aktualisiere();
  }

  // ----- Sicht -----
  sicht(rolle, spielerId) {
    const s = this.grundSicht();
    s.art = 'werwolf';
    s.runde = this.nacht;
    s.runden = 0;
    if (!this.mit) return s;
    const ich = rolle === 'kind' ? this.mit.get(spielerId) : null;
    const allwissend = (ich && !ich.lebt) || this.phase === 'ende';
    const zeigeRolle = (p) => allwissend || (!p.lebt && this.e.aufdecken) || (ich && ich.id === p.id) ||
      (ich && ich.rolle === 'werwolf' && p.rolle === 'werwolf');
    s.mitspieler = [...this.mit.values()].map((p) => ({
      id: p.id,
      name: this.name(p.id),
      lebt: p.lebt,
      rolle: zeigeRolle(p) ? p.rolle : null,
    }));
    s.rollenNamen = ROLLEN;
    s.nacht = this.nacht;
    s.anzahl = {
      werwolf: [...this.mit.values()].filter((p) => p.rolle === 'werwolf').length,
      seherin: [...this.mit.values()].some((p) => p.rolle === 'seherin'),
      hexe: [...this.mit.values()].some((p) => p.rolle === 'hexe'),
    };
    if (this.phase === 'morgen') s.tote = this.morgenTote.map((id) => ({ id, name: this.name(id), rolle: this.e.aufdecken ? this.mit.get(id).rolle : null }));
    if (this.phase === 'tag') {
      s.abgestimmt = [...this.stimmen.keys()];
      s.lebende = this.lebende().length;
    }
    if (this.phase === 'urteil') {
      const g = this.urteil.gewaehlt;
      s.urteil = { ...this.urteil, name: g ? this.name(g) : null, rolle: g && this.e.aufdecken ? this.mit.get(g).rolle : null };
    }
    if (this.phase === 'ende') s.sieger = this.sieger;
    if (ich) {
      s.ich = { rolle: ich.rolle, lebt: ich.lebt, stimme: this.phase === 'tag' ? this.stimmen.get(ich.id) || null : null };
      if (ich.lebt && this.phase === 'woelfe' && ich.rolle === 'werwolf') {
        s.ich.wahl = Object.fromEntries([...this.wahl.entries()].map(([w, o]) => [this.name(w), this.name(o)]));
        s.ich.meineWahl = this.wahl.get(ich.id) || null;
      }
      if (ich.lebt && this.phase === 'seherin' && ich.rolle === 'seherin') {
        s.ich.gesehen = this.gesehen ? { name: this.name(this.gesehen.id), wolf: this.gesehen.wolf } : null;
      }
      if (ich.lebt && this.phase === 'hexe' && ich.rolle === 'hexe') {
        s.ich.opfer = this.opfer ? { id: this.opfer, name: this.name(this.opfer) } : null;
        s.ich.heiltrank = this.heiltrank;
        s.ich.gifttrank = this.gifttrank;
        s.ich.entschieden = this.hexeEntschieden;
      }
    }
    if (rolle === 'lehrer') {
      s.geheim = [...this.mit.values()].filter((p) => p.rolle !== 'dorf')
        .map((p) => `${this.name(p.id)}: ${ROLLEN[p.rolle]}${p.lebt ? '' : ' (tot)'}`).join(' · ');
    }
    return s;
  }
}

module.exports = WerwolfSpiel;
