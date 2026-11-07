'use strict';
// Waldspiel: Alle bauen ihren eigenen Wald aus Bäumen und Waldbewohnern.
// Wer dran ist, nimmt entweder zwei Karten (vom Stapel oder aus der offenen Lichtung)
// oder spielt eine Karte aus. Ausspielen kostet Karten aus der Hand, die in die Lichtung wandern.
// Bewohner ziehen an einen freien Platz eines eigenen Baums: oben in die Krone, unten an den Boden
// oder seitlich an den Stamm (links oder rechts). Am Ende zählt jede Karte nach ihrer eigenen Regel.

const crypto = require('crypto');
const { BasisSpiel, zahl } = require('./basis');
const { mische } = require('./werkzeuge');

const MIN = 2;
const MAX = 6;
const HAND_MAX = 10;
const START_HAND = 6;
const LICHTUNG_MAX = 10;

// Alle Kartenarten: anzahl im Stapel, kosten, wo sie hinkommen, was sie zählen
const ARTEN = {
  birke: { name: 'Birke', typ: 'baum', kosten: 0, anzahl: 10, regel: '1 Punkt.' },
  buche: { name: 'Buche', typ: 'baum', kosten: 1, anzahl: 8, regel: '2 Punkte. Ab 3 Buchen im Wald je 4 Punkte.' },
  fichte: { name: 'Fichte', typ: 'baum', kosten: 1, anzahl: 8, regel: '1 Punkt, dazu 1 Punkt pro Bewohner an dieser Fichte.' },
  linde: { name: 'Linde', typ: 'baum', kosten: 1, anzahl: 8, regel: '3 Punkte, wenn niemand mehr Linden hat als du, sonst 1.' },
  eiche: { name: 'Eiche', typ: 'baum', kosten: 2, anzahl: 6, regel: '1 Punkt pro Baumart in deinem Wald.' },
  ahorn: { name: 'Ahorn', typ: 'baum', kosten: 2, anzahl: 6, regel: '1 Punkt pro Ahorn in deinem Wald.' },

  eule: { name: 'Eule', typ: 'oben', kosten: 2, anzahl: 5, regel: '5 Punkte.' },
  specht: { name: 'Specht', typ: 'oben', kosten: 1, anzahl: 5, regel: '3 Punkte, wenn du die meisten Bäume hast (Gleichstand zählt), sonst 1.' },
  hoernchen: { name: 'Eichhörnchen', typ: 'oben', kosten: 1, anzahl: 6, regel: '4 Punkte auf einer Eiche oder Buche, sonst 1.' },
  fledermaus: { name: 'Fledermaus', typ: 'oben', kosten: 1, anzahl: 6, regel: '2 Punkte. Ab 3 Fledermäusen im Wald je 4 Punkte.' },

  pilz: { name: 'Pilz', typ: 'unten', kosten: 0, anzahl: 7, regel: '1 Punkt. Sofort: Ziehe eine Karte vom Stapel.' },
  igel: { name: 'Igel', typ: 'unten', kosten: 1, anzahl: 5, regel: '1 Punkt, dazu 1 Punkt pro Pilz in deinem Wald.' },
  hase: { name: 'Hase', typ: 'unten', kosten: 0, anzahl: 7, regel: '1 Punkt.' },
  fuchs: { name: 'Fuchs', typ: 'unten', kosten: 2, anzahl: 4, regel: '2 Punkte pro Hase in deinem Wald.' },

  hirsch: { name: 'Hirsch', typ: 'seite', kosten: 2, anzahl: 5, regel: '1 Punkt pro Baumart in deinem Wald.' },
  wildschwein: { name: 'Wildschwein', typ: 'seite', kosten: 1, anzahl: 5, regel: '4 Punkte, wenn am selben Baum unten ein Pilz wohnt, sonst 1.' },
  schmetterling: { name: 'Schmetterling', typ: 'seite', kosten: 0, anzahl: 8, regel: 'Alle Schmetterlinge zusammen: 1, 3, 6, 10 oder 15 Punkte.' },
  wolf: { name: 'Wolf', typ: 'seite', kosten: 3, anzahl: 3, regel: '6 Punkte. Sofort: Ziehe zwei Karten vom Stapel.' },
};
const BAUMARTEN = Object.keys(ARTEN).filter((k) => ARTEN[k].typ === 'baum');
const PLAETZE = { oben: ['oben'], unten: ['unten'], seite: ['links', 'rechts'] };
const SCHMETTERLING = [0, 1, 3, 6, 10, 15];

class WaldSpiel extends BasisSpiel {
  static vorlage() {
    return { zuege: 14, sekunden: 45 };
  }

  static uebernimm(z, d) {
    if (d.zuege !== undefined) z.zuege = zahl(d.zuege, 6, 30, 14);
    if (d.sekunden !== undefined) z.sekunden = zahl(d.sekunden, 20, 120, 45);
  }

  static pruefeStart(anzahl) {
    if (anzahl < MIN) return `Für das Waldspiel braucht es mindestens ${MIN} Mitspielende.`;
    if (anzahl > MAX) return `Das Waldspiel geht mit höchstens ${MAX} Personen. Teilt euch auf mehrere Räume auf.`;
    return null;
  }

  constructor(hub, e) {
    super(hub, { ...e, runden: e.zuege });
    this.reihe = [];
    this.hand = new Map(); // id -> [karte]
    this.wald = new Map(); // id -> [{ baum, oben, unten, links, rechts }]
    this.stapel = [];
    this.lichtung = [];
    this.zugNr = 0; // Züge insgesamt
    this.letzte = null; // Was zuletzt passiert ist
  }

  starte() {
    let id = 1;
    for (const [art, a] of Object.entries(ARTEN)) for (let i = 0; i < a.anzahl; i++) this.stapel.push({ id: id++, art });
    this.stapel = mische(this.stapel);
    this.reihe = mische(this.online().map((s) => s.id));
    for (const p of this.reihe) {
      this.hand.set(p, []);
      this.wald.set(p, []);
      this.ziehe(p, START_HAND);
    }
    // Die Lichtung startet mit zwei offenen Karten
    this.lichtung = this.stapel.splice(0, 2);
    this.dranIndex = 0;
    this.runde = 1;
    this.dran = this.reihe[0];
    this.wertePunkte();
    this.setzePhase('zug', this.e.sekunden * 1000);
  }

  ziehe(id, n) {
    const hand = this.hand.get(id);
    let k = 0;
    while (k < n && this.stapel.length && hand.length < HAND_MAX) { hand.push(this.stapel.shift()); k++; }
    return k;
  }

  inLichtung(karten) {
    this.lichtung.push(...karten);
    // Volle Lichtung: Die Tiere ziehen weiter, die Karten sind aus dem Spiel
    if (this.lichtung.length >= LICHTUNG_MAX) { this.lichtung = []; this.geleert = true; }
  }

  // ------------------------------------------------------------------
  // Züge
  // ------------------------------------------------------------------
  nehmen(id, stapelZahl, lichtungIds) {
    const hand = this.hand.get(id);
    const platz = HAND_MAX - hand.length;
    const ids = [...new Set((lichtungIds || []).map(Number))];
    const ausLichtung = ids.map((x) => this.lichtung.find((k) => k.id === x));
    if (ausLichtung.some((k) => !k)) return 'Diese Karte liegt nicht mehr in der Lichtung.';
    const n = Math.max(0, Math.min(2, Number(stapelZahl) || 0));
    const gesamt = n + ausLichtung.length;
    if (!gesamt) return 'Wähle Karten aus.';
    if (gesamt > 2) return 'Du darfst höchstens zwei Karten nehmen.';
    if (gesamt > platz) return `Du hast nur noch Platz für ${platz} Karte${platz === 1 ? '' : 'n'}.`;
    if (n > this.stapel.length) return 'Der Stapel hat nicht mehr so viele Karten.';
    this.lichtung = this.lichtung.filter((k) => !ids.includes(k.id));
    hand.push(...ausLichtung);
    this.ziehe(id, n);
    this.letzte = { id, art: 'nehmen', stapel: n, lichtung: ausLichtung.map((k) => k.art) };
    return null;
  }

  spielen(id, kartenId, zahlung, baumIndex, platz) {
    const hand = this.hand.get(id);
    const karte = hand.find((k) => k.id === Number(kartenId));
    if (!karte) return 'Diese Karte hast du nicht.';
    const a = ARTEN[karte.art];
    const zahlIds = [...new Set((zahlung || []).map(Number))].filter((x) => x !== karte.id);
    if (zahlIds.length !== a.kosten) return `${a.name} kostet ${a.kosten} Karte${a.kosten === 1 ? '' : 'n'}.`;
    const bezahlt = zahlIds.map((x) => hand.find((k) => k.id === x));
    if (bezahlt.some((k) => !k)) return 'Zum Bezahlen fehlen Karten.';
    const wald = this.wald.get(id);
    let ziel = null;
    if (a.typ !== 'baum') {
      ziel = wald[Number(baumIndex)];
      if (!ziel) return 'Wähle einen Baum aus.';
      if (!PLAETZE[a.typ].includes(platz)) return 'Dieser Bewohner passt da nicht hin.';
      if (ziel[platz]) return 'Dieser Platz ist schon besetzt.';
    }
    // Ausführen
    this.hand.set(id, hand.filter((k) => k.id !== karte.id && !zahlIds.includes(k.id)));
    this.geleert = false;
    this.inLichtung(bezahlt);
    if (a.typ === 'baum') wald.push({ baum: karte, oben: null, unten: null, links: null, rechts: null });
    else ziel[platz] = karte;
    let gezogen = 0;
    if (karte.art === 'pilz') gezogen = this.ziehe(id, 1);
    if (karte.art === 'wolf') gezogen = this.ziehe(id, 2);
    this.letzte = { id, art: 'spielen', karte: karte.art, kosten: a.kosten, gezogen, geleert: this.geleert };
    return null;
  }

  weiter() {
    this.wertePunkte();
    this.zugNr++;
    // Ende: Alle hatten ihre Züge, oder es geht nichts mehr
    const proRunde = this.reihe.filter((id) => this.hub.holeSpieler(id)).length || 1;
    this.dranIndex = (this.reihe.indexOf(this.dran) + 1) % this.reihe.length;
    let schritte = 0;
    while (!this.hub.holeSpieler(this.reihe[this.dranIndex]) && schritte++ < this.reihe.length) this.dranIndex = (this.dranIndex + 1) % this.reihe.length;
    if (this.dranIndex <= this.reihe.indexOf(this.dran)) this.runde++;
    this.dran = this.reihe[this.dranIndex];
    if (this.runde > this.e.zuege || proRunde < 1 || (!this.stapel.length && !this.lichtung.length && this.niemandKann())) return this.schluss();
    this.setzePhase('zug', this.e.sekunden * 1000);
  }

  niemandKann() {
    return this.reihe.every((id) => !this.spielbare(id).length);
  }

  schluss() {
    this.wertePunkte();
    const r = this.rangliste();
    this.sieger = r.length ? r[0].id : null;
    this.setzePhase('ende', 0);
  }

  // Was diese Person gerade ausspielen könnte (für den Zeitablauf und das Ende)
  spielbare(id) {
    const hand = this.hand.get(id) || [];
    const wald = this.wald.get(id) || [];
    return hand.filter((k) => {
      const a = ARTEN[k.art];
      if (hand.length - 1 < a.kosten) return false;
      if (a.typ === 'baum') return true;
      return wald.some((b) => PLAETZE[a.typ].some((p) => !b[p]));
    });
  }

  // Zeit abgelaufen: Karten nehmen, wenn Platz ist, sonst die günstigste Karte ausspielen
  autoZug() {
    const id = this.dran;
    const hand = this.hand.get(id);
    const platz = Math.min(2, HAND_MAX - hand.length, this.stapel.length);
    if (platz > 0) {
      this.nehmen(id, platz, []);
    } else {
      const k = this.spielbare(id).sort((x, y) => ARTEN[x.art].kosten - ARTEN[y.art].kosten)[0];
      if (k) {
        const a = ARTEN[k.art];
        const zahlung = hand.filter((x) => x.id !== k.id).slice(0, a.kosten).map((x) => x.id);
        let baum = null;
        let ort = null;
        if (a.typ !== 'baum') {
          const wald = this.wald.get(id);
          baum = wald.findIndex((b) => PLAETZE[a.typ].some((p) => !b[p]));
          ort = PLAETZE[a.typ].find((p) => !wald[baum][p]);
        }
        this.spielen(id, k.id, zahlung, baum, ort);
      } else if (this.lichtung.length && hand.length < HAND_MAX) {
        this.nehmen(id, 0, [this.lichtung[0].id]);
      } else {
        this.letzte = { id, art: 'aussetzen' };
      }
    }
    this.weiter();
  }

  tick(jetzt) {
    if (this.beendet || this.phase !== 'zug') return;
    if (this.abgelaufen(jetzt)) this.autoZug();
  }

  ueberspringe() {
    if (this.phase === 'zug') this.autoZug();
  }

  kindEreignis(spieler, art, d) {
    if (this.phase !== 'zug' || spieler.id !== this.dran) return { ok: false };
    let fehler;
    if (art === 'nehmen') fehler = this.nehmen(spieler.id, d.stapel, d.lichtung);
    else if (art === 'spielen') fehler = this.spielen(spieler.id, d.karte, d.zahlung, d.baum, d.platz);
    else return { ok: false };
    if (fehler) return { ok: false, fehler };
    this.weiter();
    return { ok: true };
  }

  spielerWeg(id, endgueltig) {
    if (!endgueltig || !this.hand.has(id)) return;
    // Die Karten der Person kommen aus dem Spiel; ihr Wald bleibt für die Wertung sichtbar
    this.hand.set(id, []);
    if (this.dran === id && this.phase === 'zug') this.weiter();
  }

  // ------------------------------------------------------------------
  // Wertung
  // ------------------------------------------------------------------
  zaehleArt(id, art) {
    let n = 0;
    for (const b of this.wald.get(id) || []) {
      if (b.baum.art === art) n++;
      for (const p of ['oben', 'unten', 'links', 'rechts']) if (b[p] && b[p].art === art) n++;
    }
    return n;
  }

  wertung(id) {
    const wald = this.wald.get(id) || [];
    const baeume = wald.length;
    const arten = new Set(wald.map((b) => b.baum.art)).size;
    const meisteBaeume = Math.max(0, ...this.reihe.map((x) => (this.wald.get(x) || []).length));
    const meisteLinden = Math.max(0, ...this.reihe.map((x) => this.zaehleArt(x, 'linde')));
    const n = (art) => this.zaehleArt(id, art);
    const posten = [];
    const zaehle = (karte, punkte) => posten.push({ art: karte.art, punkte });
    for (const b of wald) {
      const k = b.baum;
      const bewohner = ['oben', 'unten', 'links', 'rechts'].filter((p) => b[p]).length;
      if (k.art === 'birke') zaehle(k, 1);
      if (k.art === 'buche') zaehle(k, n('buche') >= 3 ? 4 : 2);
      if (k.art === 'fichte') zaehle(k, 1 + bewohner);
      if (k.art === 'linde') zaehle(k, n('linde') >= meisteLinden ? 3 : 1);
      if (k.art === 'eiche') zaehle(k, arten);
      if (k.art === 'ahorn') zaehle(k, n('ahorn'));
      for (const p of ['oben', 'unten', 'links', 'rechts']) {
        const t = b[p];
        if (!t) continue;
        if (t.art === 'eule') zaehle(t, 5);
        if (t.art === 'specht') zaehle(t, baeume >= meisteBaeume ? 3 : 1);
        if (t.art === 'hoernchen') zaehle(t, k.art === 'eiche' || k.art === 'buche' ? 4 : 1);
        if (t.art === 'fledermaus') zaehle(t, n('fledermaus') >= 3 ? 4 : 2);
        if (t.art === 'pilz') zaehle(t, 1);
        if (t.art === 'igel') zaehle(t, 1 + n('pilz'));
        if (t.art === 'hase') zaehle(t, 1);
        if (t.art === 'fuchs') zaehle(t, 2 * n('hase'));
        if (t.art === 'hirsch') zaehle(t, arten);
        if (t.art === 'wildschwein') zaehle(t, b.unten && b.unten.art === 'pilz' ? 4 : 1);
        if (t.art === 'wolf') zaehle(t, 6);
      }
    }
    const falter = n('schmetterling');
    if (falter) posten.push({ art: 'schmetterling', punkte: SCHMETTERLING[Math.min(falter, 5)], anzahl: falter });
    return { gesamt: posten.reduce((x, p) => x + p.punkte, 0), posten };
  }

  wertePunkte() {
    for (const id of this.reihe) {
      const s = this.hub.holeSpieler(id);
      if (s) s.punkte = this.wertung(id).gesamt;
    }
  }

  rangliste() {
    return this.reihe.filter((id) => this.hub.holeSpieler(id))
      .map((id) => ({ id, punkte: this.wertung(id).gesamt, baeume: this.wald.get(id).length }))
      .sort((a, b) => b.punkte - a.punkte || b.baeume - a.baeume);
  }

  sicht(rolle, spielerId) {
    const s = this.grundSicht();
    s.art = 'wald';
    s.runden = this.e.zuege;
    s.arten = ARTEN;
    s.spieler = this.reihe.filter((id) => this.hub.holeSpieler(id) || (this.wald.get(id) || []).length).map((id) => ({
      id, name: this.name(id), online: !!(this.hub.holeSpieler(id) && this.hub.holeSpieler(id).socketId),
      hand: (this.hand.get(id) || []).length, wald: this.wald.get(id), wertung: this.wertung(id),
    }));
    s.dran = this.dran ? { id: this.dran, name: this.name(this.dran) } : null;
    s.lichtung = this.lichtung;
    s.lichtungMax = LICHTUNG_MAX;
    s.stapel = this.stapel.length;
    s.handMax = HAND_MAX;
    s.zugNr = this.zugNr;
    s.letzte = this.letzte ? { ...this.letzte, name: this.name(this.letzte.id) } : null;
    if (this.phase === 'ende') s.sieger = this.sieger ? this.name(this.sieger) : null;
    if (rolle === 'kind') s.ich = { dabei: this.hand.has(spielerId), hand: this.hand.get(spielerId) || [] };
    return s;
  }
}

WaldSpiel.ARTEN = ARTEN;
WaldSpiel.BAUMARTEN = BAUMARTEN;
module.exports = WaldSpiel;
