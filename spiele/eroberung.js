'use strict';
// Eroberungsspiel: Eine Insel aus 24 Ländern in sechs Gegenden. Wer dran ist, verstärkt,
// greift Nachbarländer mit Würfeln an und darf am Ende einmal Truppen verschieben.
// Wer eine ganze Gegend hält, bekommt mehr Verstärkung. Gespielt wird bis eine Seite alles hat
// oder die eingestellten Runden vorbei sind; dann zählen die Länder.

const crypto = require('crypto');
const { BasisSpiel, zahl } = require('./basis');
const { mische } = require('./werkzeuge');

const MIN = 3;
const MAX = 6;
const STERN_BONUS = 5;

// Die Karte: Sechsecke in Zeilen (ungerade Zeilen sind halb nach rechts versetzt)
const GEGENDEN = [
  { id: 'nord', name: 'Nordmark', bonus: 2 },
  { id: 'ost', name: 'Ostküste', bonus: 2 },
  { id: 'see', name: 'Seenplatte', bonus: 2 },
  { id: 'mitte', name: 'Mittelland', bonus: 3 },
  { id: 'west', name: 'Westwald', bonus: 2 },
  { id: 'sued', name: 'Südhügel', bonus: 2 },
];
const LAENDER = [
  ['Frosthafen', 'nord', 0, 1], ['Eisfeld', 'nord', 0, 2], ['Nebelbucht', 'nord', 1, 0], ['Kaltenberg', 'nord', 1, 1],
  ['Möwenkap', 'ost', 0, 4], ['Sturmspitze', 'ost', 0, 5], ['Kreidefels', 'ost', 1, 3], ['Salzwiese', 'ost', 1, 4],
  ['Schilfmoor', 'see', 1, 6], ['Spiegelsee', 'see', 2, 5], ['Weidengrund', 'see', 2, 6], ['Entenried', 'see', 3, 6],
  ['Kornfeld', 'mitte', 2, 2], ['Mühlbach', 'mitte', 2, 3], ['Lehmdorf', 'mitte', 3, 1], ['Burgholz', 'mitte', 3, 2],
  ['Tannheim', 'west', 3, 0], ['Moosgrund', 'west', 4, 0], ['Wolfsschlucht', 'west', 4, 1], ['Farnhain', 'west', 4, 2],
  ['Rebhang', 'sued', 3, 4], ['Sonnenhöhe', 'sued', 4, 3], ['Steinbruch', 'sued', 4, 4], ['Heidekamm', 'sued', 4, 5],
].map(([name, gegend, r, c], id) => ({ id, name, gegend, r, c }));
// Seewege zwischen Ländern, die sich nicht berühren
const SEEWEGE = [['Nebelbucht', 'Tannheim'], ['Sturmspitze', 'Schilfmoor'], ['Entenried', 'Heidekamm']];

(function nachbarn() {
  const bei = new Map(LAENDER.map((l) => [`${l.r},${l.c}`, l]));
  for (const l of LAENDER) {
    const d = l.r % 2 === 0 ? [[0, -1], [0, 1], [-1, -1], [-1, 0], [1, -1], [1, 0]] : [[0, -1], [0, 1], [-1, 0], [-1, 1], [1, 0], [1, 1]];
    l.nachbarn = d.map(([a, b]) => bei.get(`${l.r + a},${l.c + b}`)).filter(Boolean).map((x) => x.id);
  }
  const nachName = (n) => LAENDER.find((l) => l.name === n);
  for (const [a, b] of SEEWEGE) { nachName(a).nachbarn.push(nachName(b).id); nachName(b).nachbarn.push(nachName(a).id); }
}());

const wuerfle = (n) => Array.from({ length: n }, () => 1 + crypto.randomInt(6)).sort((a, b) => b - a);

class EroberungSpiel extends BasisSpiel {
  static vorlage() {
    return { runden: 8, sekunden: 90 };
  }

  static uebernimm(z, d) {
    if (d.runden !== undefined) z.runden = zahl(d.runden, 3, 20, 8);
    if (d.sekunden !== undefined) z.sekunden = zahl(d.sekunden, 30, 240, 90);
  }

  static pruefeStart(anzahl) {
    if (anzahl < MIN) return `Für das Eroberungsspiel braucht es mindestens ${MIN} Mitspielende.`;
    if (anzahl > MAX) return `Das Eroberungsspiel geht mit höchstens ${MAX} Personen. Teilt euch auf mehrere Räume auf.`;
    return null;
  }

  constructor(hub, e) {
    super(hub, { ...e });
    this.runden = e.runden;
    this.besitz = new Array(LAENDER.length).fill(null);
    this.armeen = new Array(LAENDER.length).fill(1);
    this.reihe = [];
    this.farbe = new Map();
    this.sterne = new Map();
    this.bonus = new Map(); // Punkte fürs Überleben, wenn andere ausscheiden
    this.raus = [];
    this.kampf = null;
    this.nachruecken = null;
    this.verlauf = [];
  }

  starte() {
    this.reihe = mische(this.online().map((s) => s.id));
    this.reihe.forEach((id, i) => { this.farbe.set(id, i); this.sterne.set(id, 0); this.bonus.set(id, 0); });
    mische(LAENDER.map((l) => l.id)).forEach((land, i) => { this.besitz[land] = this.reihe[i % this.reihe.length]; });
    // Starttruppen zufällig auf die eigenen Länder verteilen
    const ziel = { 3: 20, 4: 16, 5: 13, 6: 11 }[this.reihe.length] || 14;
    for (const id of this.reihe) {
      const meine = this.laenderVon(id);
      for (let i = meine.length; i < ziel; i++) this.armeen[meine[crypto.randomInt(meine.length)]]++;
    }
    this.runde = 1;
    this.beginneZug(this.reihe[0]);
  }

  laenderVon(id) { return LAENDER.filter((l) => this.besitz[l.id] === id).map((l) => l.id); }
  lebt(id) { return this.laenderVon(id).length > 0; }
  istDa(id) { const s = this.hub.holeSpieler(id); return !!(s && s.socketId); }

  verstaerkung(id) {
    const n = this.laenderVon(id).length;
    let v = Math.max(3, Math.floor(n / 3));
    for (const g of GEGENDEN) if (LAENDER.filter((l) => l.gegend === g.id).every((l) => this.besitz[l.id] === id)) v += g.bonus;
    return v;
  }

  zugMs(id) { return this.istDa(id) ? this.e.sekunden * 1000 : 8000; }

  beginneZug(id) {
    this.dran = id;
    this.reserve = this.verstaerkung(id);
    this.sternGenutzt = false;
    if (this.sterne.get(id) >= 3) { this.sterne.set(id, this.sterne.get(id) - 3); this.reserve += STERN_BONUS; this.sternGenutzt = true; }
    this.stufe = 'verstaerken';
    this.erobert = false;
    this.kampf = null;
    this.nachruecken = null;
    this.setzePhase('zug', this.zugMs(id));
  }

  beendeZug() {
    if (this.phase !== 'zug') return;
    if (this.nachruecken) this.ruecke(this.nachruecken.min);
    if (this.erobert) this.sterne.set(this.dran, this.sterne.get(this.dran) + 1);
    const i = this.reihe.indexOf(this.dran);
    let k = i;
    for (let n = 1; n <= this.reihe.length; n++) {
      k = (i + n) % this.reihe.length;
      if (this.lebt(this.reihe[k]) && this.hub.holeSpieler(this.reihe[k])) break;
    }
    if (k <= i) this.runde++;
    if (this.runde > this.runden) return this.schluss();
    this.beginneZug(this.reihe[k]);
  }

  schluss() {
    const r = this.rangliste();
    this.sieger = r.length ? r[0].id : null;
    // Sieg zählt 10 Punkte extra, damit bei gleich vielen Ländern die Truppen entscheiden
    if (this.sieger) this.bonus.set(this.sieger, (this.bonus.get(this.sieger) || 0) + 10);
    this.wertePunkte();
    this.stufe = null;
    this.setzePhase('ende', 0);
  }

  rangliste() {
    return this.reihe.map((id) => ({ id, laender: this.laenderVon(id).length, armeen: this.laenderVon(id).reduce((n, l) => n + this.armeen[l], 0) }))
      .sort((a, b) => b.laender - a.laender || b.armeen - a.armeen);
  }

  wertePunkte() {
    for (const id of this.reihe) {
      const s = this.hub.holeSpieler(id);
      if (s) s.punkte = this.laenderVon(id).length * 5 + (this.bonus.get(id) || 0);
    }
  }

  // ------------------------------------------------------------------
  // Aktionen
  // ------------------------------------------------------------------
  setzen(land, anzahl) {
    if (this.stufe !== 'verstaerken') return 'Gerade wird nicht verstärkt.';
    if (this.besitz[land] !== this.dran) return 'Das ist nicht dein Land.';
    const n = Math.max(1, Math.min(this.reserve, Math.round(Number(anzahl) || 1)));
    this.armeen[land] += n;
    this.reserve -= n;
    if (!this.reserve) this.stufe = 'angreifen';
    return null;
  }

  angriff(von, nach, bisZumEnde) {
    if (this.stufe !== 'angreifen') return 'Gerade wird nicht angegriffen.';
    if (this.besitz[von] !== this.dran) return 'Greife aus einem eigenen Land an.';
    if (!LAENDER[von].nachbarn.includes(nach) || this.besitz[nach] === this.dran) return 'Greife ein fremdes Nachbarland an.';
    if (this.armeen[von] < 2) return 'Zum Angreifen braucht das Land mindestens 2 Truppen.';
    const verteidiger = this.besitz[nach];
    const kampf = { von, nach, verteidiger, runden: [], verlustA: 0, verlustV: 0, erobert: false };
    do {
      const a = wuerfle(Math.min(3, this.armeen[von] - 1));
      const v = wuerfle(Math.min(2, this.armeen[nach]));
      let va = 0;
      let vv = 0;
      for (let i = 0; i < Math.min(a.length, v.length); i++) { if (a[i] > v[i]) vv++; else va++; }
      this.armeen[von] -= va;
      this.armeen[nach] -= vv;
      kampf.verlustA += va;
      kampf.verlustV += vv;
      kampf.runden.push({ a, v });
      if (this.armeen[nach] <= 0) {
        kampf.erobert = true;
        kampf.wuerfel = a.length;
        break;
      }
    } while (bisZumEnde && this.armeen[von] >= 2);
    if (kampf.runden.length > 6) kampf.runden = kampf.runden.slice(-6);
    this.kampf = kampf;
    if (kampf.erobert) this.erobere(von, nach, kampf.wuerfel, verteidiger);
    return null;
  }

  erobere(von, nach, min, verteidiger) {
    this.besitz[nach] = this.dran;
    this.armeen[nach] = 0;
    this.erobert = true;
    this.verlauf.unshift({ id: this.dran, land: nach, von: verteidiger });
    this.verlauf = this.verlauf.slice(0, 5);
    if (verteidiger && !this.lebt(verteidiger)) {
      // Ausgeschieden: Die Sterne gehen an die Eroberer, alle Übrigen bekommen Punkte
      this.raus.push(verteidiger);
      this.sterne.set(this.dran, this.sterne.get(this.dran) + this.sterne.get(verteidiger));
      this.sterne.set(verteidiger, 0);
      for (const id of this.reihe) if (this.lebt(id)) this.bonus.set(id, this.bonus.get(id) + 10);
    }
    const max = this.armeen[von] - 1;
    min = Math.min(min, max);
    if (max > min) this.nachruecken = { von, nach, min, max };
    else this.ruecke(min, von, nach);
    this.wertePunkte();
    if (LAENDER.every((l) => this.besitz[l.id] === this.dran)) this.schluss();
  }

  ruecke(anzahl, von, nach) {
    const r = this.nachruecken || { von, nach, min: anzahl, max: anzahl };
    const n = Math.max(r.min, Math.min(r.max, Math.round(Number(anzahl) || r.min)));
    this.armeen[r.von] -= n;
    this.armeen[r.nach] += n;
    this.nachruecken = null;
  }

  // Über eigene Länder verbunden?
  verbunden(von, nach) {
    const besucht = new Set([von]);
    const offen = [von];
    while (offen.length) {
      const x = offen.pop();
      if (x === nach) return true;
      for (const n of LAENDER[x].nachbarn) if (!besucht.has(n) && this.besitz[n] === this.dran) { besucht.add(n); offen.push(n); }
    }
    return false;
  }

  verschieben(von, nach, anzahl) {
    if (this.stufe !== 'angreifen' && this.stufe !== 'verschieben') return 'Gerade kann nicht verschoben werden.';
    if (this.besitz[von] !== this.dran || this.besitz[nach] !== this.dran || von === nach) return 'Verschiebe zwischen zwei eigenen Ländern.';
    if (!this.verbunden(von, nach)) return 'Die Länder müssen über eigene Länder verbunden sein.';
    const n = Math.round(Number(anzahl) || 0);
    if (n < 1 || n > this.armeen[von] - 1) return 'Eine Truppe muss im Land bleiben.';
    this.armeen[von] -= n;
    this.armeen[nach] += n;
    this.beendeZug();
    return null;
  }

  kindEreignis(spieler, art, d) {
    if (this.phase !== 'zug' || spieler.id !== this.dran) return { ok: false };
    const land = (x) => (Number.isInteger(Number(x)) && LAENDER[Number(x)] ? Number(x) : -1);
    let fehler = null;
    if (this.nachruecken && art !== 'nachruecken') return { ok: false, fehler: 'Erst entscheiden, wie viele nachrücken.' };
    if (art === 'setzen') fehler = land(d.land) < 0 ? 'Unbekanntes Land.' : this.setzen(land(d.land), d.anzahl);
    else if (art === 'angriff') fehler = land(d.von) < 0 || land(d.nach) < 0 ? 'Unbekanntes Land.' : this.angriff(land(d.von), land(d.nach), !!d.bisZumEnde);
    else if (art === 'nachruecken') { if (!this.nachruecken) return { ok: false }; this.ruecke(d.anzahl); }
    else if (art === 'verschieben') fehler = land(d.von) < 0 || land(d.nach) < 0 ? 'Unbekanntes Land.' : this.verschieben(land(d.von), land(d.nach), d.anzahl);
    else if (art === 'angriffEnde') { if (this.stufe !== 'angreifen') return { ok: false }; this.stufe = 'verschieben'; }
    else if (art === 'zugEnde') { if (this.stufe === 'verstaerken') return { ok: false, fehler: 'Erst alle Truppen setzen.' }; this.beendeZug(); }
    else return { ok: false };
    if (fehler) return { ok: false, fehler };
    this.hub.aktualisiere();
    return { ok: true };
  }

  // Zeit abgelaufen: Rest an die Grenze setzen, nicht angreifen, Zug beenden
  autoZug() {
    if (this.stufe === 'verstaerken' && this.reserve) {
      const meine = this.laenderVon(this.dran);
      const grenze = meine.filter((l) => LAENDER[l].nachbarn.some((n) => this.besitz[n] !== this.dran));
      const ziel = grenze.length ? grenze : meine;
      while (this.reserve > 0) { this.armeen[ziel[crypto.randomInt(ziel.length)]]++; this.reserve--; }
    }
    this.beendeZug();
  }

  tick(jetzt) {
    if (this.beendet || this.phase !== 'zug') return;
    if (this.abgelaufen(jetzt)) this.autoZug();
  }

  ueberspringe() {
    if (this.phase === 'zug') this.autoZug();
  }

  spielerWeg(id, endgueltig) {
    if (!endgueltig || !this.farbe.has(id)) return;
    // Länder werden herrenlos und können von allen erobert werden
    for (const l of LAENDER) if (this.besitz[l.id] === id) this.besitz[l.id] = null;
    if (this.dran === id && this.phase === 'zug') { this.nachruecken = null; this.erobert = false; this.beendeZug(); }
    if (this.phase !== 'ende' && this.reihe.filter((x) => this.lebt(x) && this.hub.holeSpieler(x)).length < 2) this.schluss();
  }

  sicht(rolle, spielerId) {
    const s = this.grundSicht();
    s.art = 'eroberung';
    s.runden = this.runden;
    s.karte = { laender: LAENDER, gegenden: GEGENDEN };
    s.besitz = this.besitz;
    s.armeen = this.armeen;
    s.spieler = this.reihe.filter((id) => this.hub.holeSpieler(id) || this.lebt(id)).map((id) => ({
      id, name: this.name(id), farbe: this.farbe.get(id), laender: this.laenderVon(id).length,
      armeen: this.laenderVon(id).reduce((n, l) => n + this.armeen[l], 0), sterne: this.sterne.get(id), raus: !this.lebt(id), online: this.istDa(id),
      verstaerkung: this.lebt(id) ? this.verstaerkung(id) : 0,
    }));
    s.dran = this.dran ? { id: this.dran, name: this.name(this.dran) } : null;
    s.stufe = this.stufe;
    s.reserve = this.reserve;
    s.sternGenutzt = this.sternGenutzt;
    s.kampf = this.kampf;
    s.nachruecken = this.nachruecken;
    s.verlauf = this.verlauf.map((v) => ({ ...v, name: this.name(v.id), vonName: v.von ? this.name(v.von) : 'niemand' }));
    if (this.phase === 'ende') s.sieger = this.sieger ? this.name(this.sieger) : null;
    if (rolle === 'kind') s.ich = { dabei: this.farbe.has(spielerId), farbe: this.farbe.get(spielerId) };
    return s;
  }
}

EroberungSpiel.LAENDER = LAENDER;
EroberungSpiel.GEGENDEN = GEGENDEN;
module.exports = EroberungSpiel;
