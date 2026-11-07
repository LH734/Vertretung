'use strict';
// Werwolf
// Das Handy verteilt die Rollen und übernimmt die Spielleitung für Nacht und Abstimmung.
// Rollen: Werwölfe, Seherin, Hexe, Jäger, Amor, Dorfbewohner.

const { BasisSpiel, zahl } = require('./basis');
const { mische } = require('./werkzeuge');

const ROLLEN_MS = 12000;
const AMOR_MS = 35000;
const VERLIEBT_MS = 9000;
const WOELFE_MS = 45000;
const SEHERIN_MS = 30000;
const HEXE_MS = 35000;
const MORGEN_MS = 10000;
const URTEIL_MS = 10000;
const JAEGER_MS = 30000;
const SCHUSS_MS = 9000;
// Ist eine Rolle nicht (mehr) im Spiel, dauert ihre Phase trotzdem kurz, damit niemand etwas merkt.
const SCHEIN_MS = [7000, 11000];

const ROLLEN = {
  werwolf: 'Werwolf',
  seherin: 'Seherin',
  hexe: 'Hexe',
  jaeger: 'Jäger',
  amor: 'Amor',
  dorf: 'Dorfbewohner',
};

class WerwolfSpiel extends BasisSpiel {
  static vorlage() {
    return { woelfe: 0, seherin: true, hexe: true, jaeger: true, amor: true, tagSekunden: 180, aufdecken: true };
  }

  static uebernimm(z, d) {
    if (d.woelfe !== undefined) z.woelfe = zahl(d.woelfe, 0, 4, 0);
    for (const k of ['seherin', 'hexe', 'jaeger', 'amor', 'aufdecken']) if (typeof d[k] === 'boolean') z[k] = d[k];
    if (d.tagSekunden !== undefined) z.tagSekunden = zahl(d.tagSekunden, 60, 600, 180);
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
    if (this.e.jaeger && n >= 6 && i < n) gib('jaeger');
    if (this.e.amor && n >= 8 && i < n) gib('amor');
    while (i < n) gib('dorf');
    this.heiltrank = true;
    this.gifttrank = true;
    this.liebende = null;
    this.jaegerHatGeschossen = false;
    this.jaegerDran = null;
    this.setzePhase('rollen', ROLLEN_MS);
  }

  lebende(rolle) {
    return [...this.mit.values()].filter((p) => p.lebt && (!rolle || p.rolle === rolle));
  }

  schein() {
    return SCHEIN_MS[0] + Math.random() * (SCHEIN_MS[1] - SCHEIN_MS[0]);
  }

  // Jemand stirbt. Verliebte folgen vor Kummer. Gibt alle neuen Toten zurück.
  toete(id, grund) {
    const tote = [];
    const p = this.mit.get(id);
    if (!p || !p.lebt) return tote;
    p.lebt = false;
    p.grund = grund;
    tote.push({ id, grund });
    if (p.rolle === 'jaeger' && !this.jaegerHatGeschossen) this.jaegerDran = id;
    if (this.liebende && this.liebende.includes(id)) {
      const partner = this.liebende.find((x) => x !== id);
      tote.push(...this.toete(partner, 'kummer'));
    }
    return tote;
  }

  tick(jetzt) {
    if (this.beendet || !this.abgelaufen(jetzt)) return;
    if (this.phase === 'rollen') this.starteNacht();
    else if (this.phase === 'amor') this.amorFertig();
    else if (this.phase === 'verliebt') this.starteWoelfe();
    else if (this.phase === 'woelfe') this.woelfeFertig();
    else if (this.phase === 'seherin') this.starteHexe();
    else if (this.phase === 'hexe') this.starteMorgen();
    else if (this.phase === 'morgen') this.weiterNach('tag');
    else if (this.phase === 'tag') this.werteTagAus();
    else if (this.phase === 'urteil') this.weiterNach('nacht');
    else if (this.phase === 'jaeger') this.jaegerFertig(null);
    else if (this.phase === 'schuss') this.nachJaeger();
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
    const amor = this.lebende('amor')[0];
    if (this.nacht === 1 && amor) return this.setzePhase('amor', AMOR_MS);
    this.starteWoelfe();
  }

  amorFertig() {
    if (this.liebende) this.setzePhase('verliebt', VERLIEBT_MS);
    else this.starteWoelfe();
  }

  starteWoelfe() {
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
    const gibtHexe = [...this.mit.values()].some((p) => p.rolle === 'hexe');
    this.setzePhase('hexe', kannWas ? HEXE_MS : gibtHexe ? this.schein() : 1);
  }

  starteMorgen() {
    const tote = [];
    if (this.opfer && !this.geheilt) tote.push(...this.toete(this.opfer, 'woelfe'));
    if (this.vergiftet) tote.push(...this.toete(this.vergiftet, 'gift'));
    this.morgenTote = tote;
    this.setzePhase('morgen', MORGEN_MS);
  }

  // Nach Morgen oder Urteil: erst schießt ggf. der Jäger, dann geht es weiter
  weiterNach(ziel) {
    this.jaegerZiel = ziel;
    if (this.jaegerDran) {
      this.schuss = null;
      return this.setzePhase('jaeger', JAEGER_MS);
    }
    this.nachJaeger();
  }

  jaegerFertig(ziel) {
    if (this.phase !== 'jaeger') return;
    const jaeger = this.jaegerDran;
    this.jaegerDran = null;
    this.jaegerHatGeschossen = true;
    if (!ziel) return this.nachJaeger();
    const tote = this.toete(ziel, 'jaeger');
    this.schuss = { jaeger, ziel, tote };
    this.setzePhase('schuss', SCHUSS_MS);
  }

  nachJaeger() {
    if (this.pruefeSieg()) return;
    if (this.jaegerDran) return this.weiterNach(this.jaegerZiel); // der Schuss hat einen weiteren Jäger getroffen
    if (this.jaegerZiel === 'tag') {
      this.stimmen = new Map();
      this.setzePhase('tag', this.e.tagSekunden * 1000);
    } else {
      this.starteNacht();
    }
  }

  werteTagAus() {
    if (this.phase !== 'tag') return;
    const { gewaehlt, grund, zaehler } = BasisSpiel.zaehle(this.stimmen);
    const tote = gewaehlt ? this.toete(gewaehlt, 'dorf') : [];
    this.urteil = { gewaehlt, grund, stimmen: this.stimmenListe(zaehler), skip: zaehler.get('skip') || 0, tote };
    this.setzePhase('urteil', URTEIL_MS);
  }

  pruefeSieg() {
    const lebende = this.lebende();
    const woelfe = lebende.filter((p) => p.rolle === 'werwolf').length;
    const andere = lebende.length - woelfe;
    let sieger = null;
    if (this.liebende && lebende.length === 2 && this.liebende.every((id) => this.mit.get(id).lebt)) sieger = 'liebende';
    else if (woelfe === 0) sieger = 'dorf';
    else if (woelfe >= andere) sieger = 'woelfe';
    if (!sieger) return false;
    this.sieger = sieger;
    for (const p of this.mit.values()) {
      let gewonnen;
      if (sieger === 'liebende') gewonnen = this.liebende.includes(p.id);
      else gewonnen = (sieger === 'woelfe') === (p.rolle === 'werwolf');
      if (gewonnen) this.gibPunkte(p.id, p.lebt ? 150 : 100);
    }
    this.setzePhase('ende', 0);
    return true;
  }

  // ----- Eingaben -----
  kindEreignis(spieler, art, d) {
    const ich = this.mit && this.mit.get(spieler.id);
    if (!ich) return { ok: false };
    const ziel = this.mit.get(String(d.ziel || ''));
    // Der Jäger handelt, obwohl er gerade gestorben ist
    if (art === 'schiessen') {
      if (this.phase !== 'jaeger' || ich.id !== this.jaegerDran) return { ok: false };
      if (!ziel || !ziel.lebt) return { ok: false };
      this.jaegerFertig(ziel.id);
      return { ok: true };
    }
    if (!ich.lebt) return { ok: false };
    if (art === 'amor') {
      if (this.phase !== 'amor' || ich.rolle !== 'amor' || this.liebende) return { ok: false };
      const a = this.mit.get(String(d.a || ''));
      const b = this.mit.get(String(d.b || ''));
      if (!a || !b || a === b || !a.lebt || !b.lebt) return { ok: false, fehler: 'Wähle zwei verschiedene Personen.' };
      this.liebende = [a.id, b.id];
      this.endeUm = Math.min(this.endeUm, Date.now() + 2500);
      this.hub.aktualisiere();
      return { ok: true };
    }
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
    this.toete(id, 'weg');
    if (this.jaegerDran === id) this.jaegerDran = null; // wer gegangen ist, schießt nicht mehr
    if (['tag', 'morgen', 'urteil'].includes(this.phase)) this.pruefeSieg();
    this.hub.aktualisiere();
  }

  // ----- Sicht -----
  toteSicht(tote) {
    return tote.map((t) => ({ id: t.id, name: this.name(t.id), grund: t.grund, rolle: this.e.aufdecken ? this.mit.get(t.id).rolle : null }));
  }

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
      verliebt: allwissend && this.liebende && this.liebende.includes(p.id) ? true : undefined,
    }));
    s.rollenNamen = ROLLEN;
    s.nacht = this.nacht;
    const gibt = (r) => [...this.mit.values()].some((p) => p.rolle === r);
    s.anzahl = { werwolf: [...this.mit.values()].filter((p) => p.rolle === 'werwolf').length, seherin: gibt('seherin'), hexe: gibt('hexe'), jaeger: gibt('jaeger'), amor: gibt('amor') };
    if (this.phase === 'morgen') s.tote = this.toteSicht(this.morgenTote);
    if (this.phase === 'tag') {
      s.abgestimmt = [...this.stimmen.keys()];
      s.lebende = this.lebende().length;
    }
    if (this.phase === 'urteil') {
      const g = this.urteil.gewaehlt;
      s.urteil = { ...this.urteil, name: g ? this.name(g) : null, rolle: g && this.e.aufdecken ? this.mit.get(g).rolle : null, tote: this.toteSicht(this.urteil.tote) };
    }
    if (this.phase === 'jaeger') s.jaeger = { id: this.jaegerDran, name: this.name(this.jaegerDran) };
    if (this.phase === 'schuss' && this.schuss) s.schuss = { jaeger: this.name(this.schuss.jaeger), tote: this.toteSicht(this.schuss.tote) };
    if (this.phase === 'ende') s.sieger = this.sieger;
    if (ich) {
      s.ich = { rolle: ich.rolle, lebt: ich.lebt, stimme: this.phase === 'tag' ? this.stimmen.get(ich.id) || null : null };
      if (this.liebende && this.liebende.includes(ich.id)) {
        const partner = this.liebende.find((x) => x !== ich.id);
        s.ich.partner = { id: partner, name: this.name(partner) };
      }
      if (ich.lebt && this.phase === 'amor' && ich.rolle === 'amor') s.ich.amorFertig = !!this.liebende;
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
      if (this.phase === 'jaeger' && this.jaegerDran === ich.id) s.ich.schiessen = true;
    }
    if (rolle === 'lehrer') {
      const liebe = this.liebende ? ` · Verliebt: ${this.liebende.map((id) => this.name(id)).join(' und ')}` : '';
      s.geheim = [...this.mit.values()].filter((p) => p.rolle !== 'dorf')
        .map((p) => `${this.name(p.id)}: ${ROLLEN[p.rolle]}${p.lebt ? '' : ' (tot)'}`).join(' · ') + liebe;
    }
    return s;
  }
}

module.exports = WerwolfSpiel;
