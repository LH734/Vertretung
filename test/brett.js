'use strict';
// Turnierspiele (Vier in einer Reihe, Schiffe versenken) und große Spiele (Waldspiel, Eroberungsspiel)
const { warte, raum } = require('./hilfen');

async function bisEnde(L, max) {
  for (let i = 0; i < (max || 400) && !(L.z.spiel && L.z.spiel.phase === 'ende'); i++) { await L.emit('lehrer:ueberspringen'); await warte(70); }
}

module.exports = async function (url, t) {
  t.abschnitt('Vier in einer Reihe');
  {
    const { L, k } = await raum(url, 5);
    const st = await L.emit('lehrer:start', { spiel: 'vier', vier: { runden: 3, sekunden: 20 } }); await warte(200);
    let s = L.z.spiel;
    t.pruefe(st.ok && s.art === 'vier' && s.phase === 'spielen' && s.partien.length === 2 && s.freilos, 'Turnier startet: 5 Personen, 2 Partien und ein Freilos');
    const geraet = (id) => k.find((g) => g.id === id);
    const frei = geraet(s.freilos.id);
    t.pruefe(frei.z.spiel.ich.freilos && !frei.z.spiel.meine, 'Wer ein Freilos hat, weiß es');
    const p = s.partien[0];
    const A = geraet(p.a.id);
    const B = geraet(p.b.id);
    t.pruefe(A.z.spiel.meine && A.z.spiel.meine.id === p.id && A.z.spiel.meine.dran === A.id, 'Jede Person sieht ihre eigene Partie');
    let a = await B.act('setzen', { spalte: 3 });
    t.pruefe(!a.ok, 'Wer nicht dran ist, kann nicht setzen');
    // A gewinnt senkrecht in Spalte 0, B legt in Spalte 1
    for (let i = 0; i < 3; i++) { await A.act('setzen', { spalte: 0 }); await B.act('setzen', { spalte: 1 }); }
    a = await A.act('setzen', { spalte: 0 }); await warte(100);
    s = L.z.spiel;
    const fertig = s.partien.find((x) => x.id === p.id);
    t.pruefe(a.ok && fertig.fertig && fertig.sieger === A.id && fertig.linie.length >= 4, 'Vier senkrecht gewinnt');
    t.pruefe(s.tabelle.find((r) => r.id === A.id).punkte === 2 && s.tabelle.find((r) => r.id === frei.id).punkte === 2, 'Sieg und Freilos geben je 2 Turnierpunkte');
    // Spalte voll
    const p2 = s.partien.find((x) => !x.fertig);
    const C = geraet(p2.dran);
    const D = geraet(p2.a.id === C.id ? p2.b.id : p2.a.id);
    for (let i = 0; i < 3; i++) { await C.act('setzen', { spalte: 6 }); await D.act('setzen', { spalte: 6 }); }
    a = await C.act('setzen', { spalte: 6 });
    t.pruefe(!a.ok && a.fehler && a.fehler.includes('voll'), 'Volle Spalte wird abgelehnt');
    await C.act('aufgeben'); await warte(100);
    s = L.z.spiel;
    t.pruefe(s.phase === 'zwischenstand', 'Sind alle Partien fertig, kommt der Zwischenstand');
    await L.emit('lehrer:ueberspringen'); await warte(100);
    s = L.z.spiel;
    const gegner = new Map();
    for (const x of s.partien) { gegner.set(x.a.id, x.b.id); gegner.set(x.b.id, x.a.id); }
    t.pruefe(s.phase === 'spielen' && s.runde === 2 && gegner.get(A.id) !== B.id && s.freilos && s.freilos.id !== frei.id, 'Runde 2: keine Wiederholung, Freilos geht an jemand anderen');
    await bisEnde(L);
    s = L.z.spiel;
    t.pruefe(s.phase === 'ende' && s.runde === 3 && s.sieger === s.tabelle[0].name && L.z.spieler[0].name === s.sieger, 'Nach 3 Runden steht der Turniersieg fest');
    t.pruefe(s.tabelle.every((r) => r.siege + r.remis + r.niederlagen <= 3), 'Niemand hat mehr als 3 Partien');
  }

  t.abschnitt('Schiffe versenken');
  {
    const { L, k } = await raum(url, 2);
    await L.emit('lehrer:start', { spiel: 'schiffe', schiffe: { runden: 1, groesse: 'klein', nochmal: true } }); await warte(200);
    let s = L.z.spiel;
    const [A, B] = k;
    const mA = A.z.spiel.meine;
    t.pruefe(s.art === 'schiffe' && mA && mA.stufe === 'aufstellen' && mA.flotte.length === 5 && mA.flotte.flat().length === 14, 'Flotte steht: 5 Schiffe, 14 Felder');
    t.pruefe(!L.z.spiel.partien[0].flotte && !B.z.spiel.partien[0].flotte, 'Fremde Flotten bleiben geheim');
    // Schiffe berühren sich nicht
    const n = mA.n;
    const zelle = new Map();
    mA.flotte.forEach((f, i) => f.forEach((x) => zelle.set(x, i)));
    let beruehrt = false;
    for (const [x, i] of zelle) {
      for (let dz = -1; dz <= 1; dz++) for (let ds = -1; ds <= 1; ds++) {
        const z = Math.floor(x / n) + dz; const sp = (x % n) + ds;
        if (z < 0 || sp < 0 || z >= n || sp >= n) continue;
        const j = zelle.get(z * n + sp);
        if (j !== undefined && j !== i) beruehrt = true;
      }
    }
    t.pruefe(!beruehrt, 'Schiffe berühren sich nicht');
    await A.act('mischen'); await warte(50);
    t.pruefe(JSON.stringify(A.z.spiel.meine.flotte) !== JSON.stringify(mA.flotte), 'Neu mischen stellt die Flotte neu auf');
    await A.act('bereit'); await B.act('bereit'); await warte(100);
    s = A.z.spiel.meine;
    t.pruefe(s.stufe === 'schiessen', 'Sind beide bereit, wird geschossen');
    const erster = s.dran === A.id ? A : B;
    const zweiter = erster === A ? B : A;
    const ziel = zweiter.z.spiel.meine.flotte;
    await erster.act('schuss', { feld: ziel[0][0] }); await warte(60);
    s = erster.z.spiel.meine;
    t.pruefe(s.feld[erster.id][ziel[0][0]] === 2 && s.dran === erster.id, 'Treffer: nochmal schießen');
    let a = await erster.act('schuss', { feld: ziel[0][0] });
    t.pruefe(!a.ok, 'Zweimal aufs selbe Feld geht nicht');
    for (const f of ziel[0].slice(1)) await erster.act('schuss', { feld: f });
    await warte(60);
    s = erster.z.spiel.meine;
    t.pruefe(ziel[0].every((f) => s.feld[erster.id][f] === 3) && s.rest[zweiter.id].length === 4, 'Schiff versenkt, Wasser drumherum aufgedeckt');
    const wasser2 = [...Array(n * n).keys()].find((x) => !ziel.flat().includes(x) && !erster.z.spiel.meine.feld[erster.id][x]);
    a = await erster.act('schuss', { feld: wasser2 }); await warte(60);
    t.pruefe(erster.z.spiel.meine.dran === zweiter.id, 'Wasser: der andere ist dran');
    // Rest versenken
    for (const schiff of ziel.slice(1)) {
      for (const f of schiff) {
        if (erster.z.spiel.meine.dran !== erster.id) {
          const frei = [...Array(n * n).keys()].filter((x) => !erster.z.spiel.meine.flotte.flat().includes(x) && !zweiter.z.spiel.meine.feld[zweiter.id][x]);
          await zweiter.act('schuss', { feld: frei[0] }); await warte(30);
        }
        await erster.act('schuss', { feld: f }); await warte(20);
      }
    }
    await warte(100);
    s = L.z.spiel;
    t.pruefe(s.phase === 'ende' && s.partien[0].sieger === erster.id && s.sieger === erster.name, 'Alle Schiffe versenkt: Partie und Turnier gewonnen');
    t.pruefe(erster.z.spiel.meine.alle && erster.z.spiel.meine.alle[zweiter.id].length === 5, 'Danach sieht man alle Schiffe');
    // Zeitablauf über die Leitung
    await L.emit('lehrer:start', { spiel: 'schiffe', schiffe: { runden: 1, groesse: 'gross' } }); await warte(150);
    t.pruefe(A.z.spiel.meine.n === 10 && A.z.spiel.meine.flotte.length === 6, 'Großes Feld: 10 × 10 mit 6 Schiffen');
    await bisEnde(L, 400);
    t.pruefe(L.z.spiel.phase === 'ende', 'Mit „Weiter“ läuft eine Partie bis zum Ende');
  }

  t.abschnitt('Waldspiel');
  {
    const { L, k } = await raum(url, 3);
    const zuViele = await raum(url, 7);
    t.pruefe(!(await zuViele.L.emit('lehrer:start', { spiel: 'wald' })).ok, 'Waldspiel geht mit höchstens 6');
    const st = await L.emit('lehrer:start', { spiel: 'wald', wald: { zuege: 6 } }); await warte(200);
    let s = L.z.spiel;
    t.pruefe(st.ok && s.art === 'wald' && s.phase === 'zug' && s.lichtung.length === 2 && k.every((g) => g.z.spiel.ich.hand.length === 6), 'Waldspiel startet: 6 Karten auf der Hand, 2 in der Lichtung');
    t.pruefe(!L.z.spiel.ich && k.every((g) => g.z.spiel.spieler.every((p) => typeof p.hand === 'number')), 'Fremde Handkarten bleiben geheim');
    const geraet = (id) => k.find((g) => g.id === id);
    let dran = geraet(s.dran.id);
    let a = await dran.act('nehmen', { stapel: 1, lichtung: [s.lichtung[0].id, s.lichtung[1].id] });
    t.pruefe(!a.ok, 'Mehr als zwei Karten nehmen geht nicht');
    a = await dran.act('nehmen', { stapel: 1, lichtung: [s.lichtung[0].id] }); await warte(80);
    t.pruefe(a.ok && dran.z.spiel.ich.hand.length === 8 && L.z.spiel.lichtung.length === 1 && L.z.spiel.dran.id !== dran.id, 'Zwei Karten genommen, dann ist die nächste Person dran');
    // Baum pflanzen: kostenlosen Baum suchen oder bezahlen
    dran = geraet(L.z.spiel.dran.id);
    const ARTEN = L.z.spiel.arten;
    const hand = dran.z.spiel.ich.hand;
    const baum = hand.filter((x) => ARTEN[x.art].typ === 'baum').sort((x, y) => ARTEN[x.art].kosten - ARTEN[y.art].kosten)[0];
    if (baum) {
      const kosten = ARTEN[baum.art].kosten;
      a = await dran.act('spielen', { karte: baum.id, zahlung: [] });
      t.pruefe(kosten === 0 ? a.ok : !a.ok, 'Ohne Bezahlung geht nur ein kostenloser Baum');
      if (!a.ok) {
        const zahlung = hand.filter((x) => x.id !== baum.id).slice(0, kosten).map((x) => x.id);
        a = await dran.act('spielen', { karte: baum.id, zahlung });
      }
      await warte(80);
      s = L.z.spiel;
      const ich = s.spieler.find((p) => p.id === dran.id);
      t.pruefe(a.ok && ich.wald.length === 1 && ich.wald[0].baum.id === baum.id && dran.z.spiel.ich.hand.length === 6 - 1 - kosten, 'Baum gepflanzt, bezahlte Karten sind weg');
      t.pruefe(ich.wertung.gesamt >= 1 && L.z.spieler.find((p) => p.id === dran.id).punkte === ich.wertung.gesamt, 'Punkte werden laufend gezählt');
    } else t.pruefe(true, 'Kein Baum auf der Hand (Zufall)');
    // Bewohner ohne Baum geht nicht
    dran = geraet(L.z.spiel.dran.id);
    const tier = dran.z.spiel.ich.hand.find((x) => ARTEN[x.art].typ !== 'baum');
    const meinWald = L.z.spiel.spieler.find((p) => p.id === dran.id).wald;
    if (tier && !meinWald.length) {
      a = await dran.act('spielen', { karte: tier.id, zahlung: dran.z.spiel.ich.hand.filter((x) => x.id !== tier.id).slice(0, ARTEN[tier.art].kosten).map((x) => x.id), baum: 0, platz: 'oben' });
      t.pruefe(!a.ok, 'Bewohner brauchen einen Baum');
    } else t.pruefe(true, 'Bewohner-Test übersprungen (Zufall)');
    await bisEnde(L, 200);
    s = L.z.spiel;
    t.pruefe(s.phase === 'ende' && s.sieger && L.z.spieler.find((p) => p.name === s.sieger).punkte === L.z.spieler[0].punkte, 'Nach allen Zügen steht der Sieg fest');
  }

  t.abschnitt('Waldspiel-Wertung');
  {
    const W = require('../spiele/wald');
    const hub = { raum: {}, aktualisiere() {}, spieler: () => [], holeSpieler: (id) => ({ id, name: id, punkte: 0, socketId: 'x' }) };
    const w = new W(hub, { zuege: 10, sekunden: 30 });
    w.reihe = ['x', 'y'];
    let n = 1;
    const k = (art) => ({ id: n++, art });
    w.wald.set('x', [
      { baum: k('eiche'), oben: k('hoernchen'), unten: k('pilz'), links: k('wildschwein'), rechts: k('schmetterling') },
      { baum: k('buche'), oben: null, unten: k('hase'), links: k('schmetterling'), rechts: null },
      { baum: k('fichte'), oben: k('eule'), unten: k('fuchs'), links: null, rechts: null },
    ]);
    w.wald.set('y', [{ baum: k('linde'), oben: null, unten: null, links: null, rechts: null }]);
    const r = w.wertung('x');
    // Eiche 3 Arten = 3, Hörnchen auf Eiche 4, Pilz 1, Wildschwein mit Pilz 4, Buche 2, Hase 1,
    // Fichte 1 + 2 Bewohner = 3, Eule 5, Fuchs 2 × 1 Hase = 2, zwei Schmetterlinge 3 → 28
    t.pruefe(r.gesamt === 28, `Wertung eines Beispielwalds stimmt (${r.gesamt} von 28)`);
    t.pruefe(w.wertung('y').gesamt === 3, 'Linde mit den meisten Linden: 3 Punkte');
  }

  t.abschnitt('Eroberungsspiel');
  {
    const zuWenig = await raum(url, 2);
    t.pruefe(!(await zuWenig.L.emit('lehrer:start', { spiel: 'eroberung' })).ok, 'Eroberungsspiel braucht mindestens 3');
    const { L, k } = await raum(url, 3);
    const st = await L.emit('lehrer:start', { spiel: 'eroberung', eroberung: { runden: 4 } }); await warte(200);
    let s = L.z.spiel;
    t.pruefe(st.ok && s.art === 'eroberung' && s.besitz.every((b) => b) && s.spieler.every((p) => p.laender === 8 && p.armeen === 20), 'Karte verteilt: je 8 Länder und 20 Truppen');
    t.pruefe(s.stufe === 'verstaerken' && s.reserve >= 3, 'Der Zug beginnt mit Verstärkung');
    const geraet = (id) => k.find((g) => g.id === id);
    const dran = geraet(s.dran.id);
    const meine = s.karte.laender.filter((l) => s.besitz[l.id] === dran.id);
    const fremd = s.karte.laender.find((l) => s.besitz[l.id] !== dran.id);
    let a = await dran.act('setzen', { land: fremd.id, anzahl: 1 });
    t.pruefe(!a.ok, 'Auf fremde Länder kann man nicht setzen');
    a = await dran.act('angriff', { von: meine[0].id, nach: fremd.id });
    t.pruefe(!a.ok, 'Vor dem Verstärken wird nicht angegriffen');
    // Alles auf ein Grenzland
    const grenz = meine.find((l) => l.nachbarn.some((n) => s.besitz[n] !== dran.id));
    a = await dran.act('setzen', { land: grenz.id, anzahl: s.reserve }); await warte(60);
    s = L.z.spiel;
    t.pruefe(a.ok && s.reserve === 0 && s.stufe === 'angreifen', 'Alle Truppen gesetzt, jetzt wird angegriffen');
    const opfer = grenz.nachbarn.find((n) => s.besitz[n] !== dran.id);
    const vorher = s.armeen[grenz.id] + s.armeen[opfer];
    a = await dran.act('angriff', { von: grenz.id, nach: opfer }); await warte(60);
    s = L.z.spiel;
    const kampf = s.kampf;
    t.pruefe(a.ok && kampf && kampf.runden.length === 1 && kampf.verlustA + kampf.verlustV === Math.min(kampf.runden[0].a.length, kampf.runden[0].v.length), 'Ein Angriff würfelt einmal, Verluste stimmen');
    t.pruefe(kampf.erobert || s.armeen[grenz.id] + s.armeen[opfer] === vorher - kampf.verlustA - kampf.verlustV, 'Truppen werden abgezogen');
    if (s.nachruecken) { await dran.act('nachruecken', { anzahl: s.nachruecken.max }); await warte(50); }
    a = await dran.act('angriffEnde'); await warte(50);
    t.pruefe(a.ok && L.z.spiel.stufe === 'verschieben', 'Angriffe beendet, jetzt verschieben');
    await dran.act('zugEnde'); await warte(80);
    s = L.z.spiel;
    t.pruefe(s.dran.id !== dran.id && s.stufe === 'verstaerken', 'Zug beendet, die nächste Person verstärkt');
    await bisEnde(L, 100);
    s = L.z.spiel;
    t.pruefe(s.phase === 'ende' && s.sieger && L.z.spieler[0].name === s.sieger, 'Nach den eingestellten Runden steht der Sieg fest');
    t.pruefe(L.z.spieler.every((p) => p.punkte === s.spieler.find((x) => x.id === p.id).laender * 5 + (p.name === s.sieger ? 10 : 0)), 'Punkte: 5 pro Land, 10 für den Sieg');
  }
};
