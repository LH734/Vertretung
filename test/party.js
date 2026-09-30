'use strict';
// Partyspiele: Spion, Werwolf, Erklären, Stirnraten, Quiz, dazu die Begriffslisten
const { warte, geraet: g0, raum: r0 } = require('./hilfen');
let URL;
const geraet = () => g0(URL);
const raum = (n) => r0(URL, n);
const spiel = (g) => g.z.spiel;
const act = (g, art, d = {}) => g.emit('kind:spiel', { art, ...d });

module.exports = async function (url, t) {
  URL = url;
  t.abschnitt('Zeichnen: Listen');
  {
    const { L, k } = await raum(2);
    const st = await L.emit('lehrer:start', { spiel: 'zeichnen', zeichnen: { listen: ['Essen und Trinken'] } });
    await warte(200);
    const z = k.find((g) => spiel(g).istZeichner);
    t.pruefe(st.ok && L.z.einstellungen.zeichnen.listen.length === 1, 'nur eine Liste angehakt');
    t.pruefe(L.z.listen.begriffe['Redewendungen (schwer)'] > 0 && Object.keys(L.z.listen.begriffe).length === 16, '16 Begriffslisten in der Regie');
    t.pruefe(L.z.listen.erklaeren.Alltag === 30 && L.z.listen.quiz.Tiere === 18, 'Karten und Quizfragen geladen');
    const essen = ['Apfelsaft','Milch','Kakao','Limonade','Tee','Kaffee'];
    t.pruefe(z && spiel(z).auswahl.length === 3, 'Zeichner bekommt 3 Begriffe: ' + spiel(z).auswahl.join(', '));
    await L.emit('lehrer:beenden');
  }

  t.abschnitt('Wer ist der Spion?');
  {
    const { L, k } = await raum(4);
    const st = await L.emit('lehrer:start', { spiel: 'spion', spion: { runden: 2, sekunden: 60 } });
    await warte(200);
    t.pruefe(st.ok && spiel(L).phase === 'karte', 'Start mit Karte');
    const spione = k.filter((g) => spiel(g).ich.spion);
    const andere = k.filter((g) => !spiel(g).ich.spion);
    t.pruefe(spione.length === 1 && andere.every((g) => spiel(g).ich.wort === spiel(andere[0]).ich.wort && spiel(g).ich.wort), 'ein Spion, alle anderen haben dasselbe Wort');
    t.pruefe(spiel(spione[0]).ich.wort === null && spiel(spione[0]).ich.thema, 'Spion kennt nur das Thema: ' + spiel(spione[0]).ich.thema);
    t.pruefe(!JSON.stringify(spiel(L)).includes(spiel(andere[0]).ich.wort + '"') || !spiel(L).wort, 'Bühne kennt das Wort nicht');
    await L.emit('lehrer:ueberspringen'); await L.emit('lehrer:ueberspringen'); await warte(100);
    t.pruefe(spiel(L).phase === 'abstimmung', 'Abstimmung');
    for (const g of k) await act(g, 'stimme', { ziel: g === spione[0] ? andere[0].id : spione[0].id });
    await warte(100);
    t.pruefe(spiel(L).phase === 'raten' && spiel(L).rater.id === spione[0].id, 'Spion enttarnt, darf raten');
    const wort = spiel(andere[0]).ich.wort;
    await act(spione[0], 'raten', { text: wort.toLowerCase() });
    await warte(100);
    t.pruefe(spiel(L).phase === 'aufloesung' && spiel(L).ergebnis.sieger === 'spionRaet', 'Spion errät das Wort');
    t.pruefe(L.z.spieler.find((p) => p.id === spione[0].id).punkte === 150, 'Spion bekommt 150');
    await L.emit('lehrer:ueberspringen'); await warte(100);
    const sp2 = k.find((g) => spiel(g).ich.spion);
    await act(sp2, 'aufdecken'); await act(sp2, 'raten', { text: 'Quatschwort' }); await warte(100);
    t.pruefe(spiel(L).ergebnis.sieger === 'gruppe', 'Spion deckt sich auf und rät falsch: Gruppe gewinnt');
    await L.emit('lehrer:ueberspringen'); await warte(100);
    t.pruefe(spiel(L).phase === 'ende', 'nach 2 Runden Ende');
  }

  t.abschnitt('Spion: Orte-Modus');
  {
    const { L, k } = await raum(4);
    const st = await L.emit('lehrer:start', { spiel: 'spion', spion: { runden: 1, sekunden: 60, modus: 'orte' } });
    await warte(200);
    const spion = k.find((g) => spiel(g).ich.spion);
    const andere = k.filter((g) => !spiel(g).ich.spion);
    const ort = spiel(andere[0]).ich.wort;
    t.pruefe(st.ok && L.z.einstellungen.spion.modus === 'orte' && spiel(L).orte.length >= 20, 'Orte-Modus mit Ortsliste: ' + spiel(L).orte.length + ' Orte');
    t.pruefe(andere.every((g) => spiel(g).ich.wort === ort && spiel(g).ich.rolle) && spiel(L).orte.includes(ort), 'alle am selben Ort, jede Person mit Rolle: ' + ort + ' / ' + spiel(andere[0]).ich.rolle);
    t.pruefe(new Set(andere.map((g) => spiel(g).ich.rolle)).size === andere.length, 'Rollen sind verschieden');
    t.pruefe(spiel(spion).ich.wort === null && !spiel(spion).ich.rolle && !spiel(spion).ich.thema, 'Spion kennt weder Ort noch Rolle');
    await act(spion, 'aufdecken'); await warte(100);
    await act(spion, 'raten', { text: ort }); await warte(100);
    t.pruefe(spiel(L).phase === 'aufloesung' && spiel(L).ergebnis.sieger === 'spion' && spiel(L).wort === ort, 'Spion tippt den richtigen Ort');
  }

  t.abschnitt('Werwolf');
  {
    const { L, k } = await raum(7);
    const st = await L.emit('lehrer:start', { spiel: 'werwolf', werwolf: { tagSekunden: 60, jaeger: false, amor: false } });
    await warte(200);
    const rolle = (g) => spiel(g).ich.rolle;
    const woelfe = k.filter((g) => rolle(g) === 'werwolf');
    const seherin = k.find((g) => rolle(g) === 'seherin');
    const hexe = k.find((g) => rolle(g) === 'hexe');
    const dorf = k.filter((g) => rolle(g) === 'dorf');
    t.pruefe(st.ok && woelfe.length === 2 && seherin && hexe && dorf.length === 3, '7 Mitspielende: 2 Wölfe, Seherin, Hexe, 3 Dorf');
    t.pruefe(spiel(woelfe[0]).mitspieler.filter((m) => m.rolle === 'werwolf').length === 2, 'Wölfe kennen sich');
    t.pruefe(spiel(dorf[0]).mitspieler.filter((m) => m.rolle).length === 1, 'Dorf kennt nur die eigene Rolle');
    t.pruefe(spiel(L).mitspieler.every((m) => !m.rolle) && spiel(L).geheim.includes('Werwolf'), 'Bühne kennt keine Rollen, Regie gedrückt schon');
    await L.emit('lehrer:ueberspringen'); await warte(100);
    t.pruefe(spiel(L).phase === 'woelfe', 'Nacht 1: Werwölfe');
    const opfer = dorf[0];
    const falsch = await act(woelfe[0], 'wolf', { ziel: woelfe[1].id });
    t.pruefe(!falsch.ok, 'Wolf kann keinen Wolf wählen');
    for (const w of woelfe) await act(w, 'wolf', { ziel: opfer.id });
    await warte(3300);
    t.pruefe(spiel(L).phase === 'seherin', 'alle Wölfe einig: weiter zur Seherin');
    const sieht = await act(seherin, 'sehen', { ziel: woelfe[0].id }); await warte(100);
    t.pruefe(sieht.ok && spiel(seherin).ich.gesehen.wolf === true, 'Seherin erkennt Werwolf');
    await warte(6200);
    t.pruefe(spiel(L).phase === 'hexe' && spiel(hexe).ich.opfer.id === opfer.id, 'Hexe sieht das Opfer');
    await act(hexe, 'hexe', { heilen: true }); await warte(2800);
    t.pruefe(spiel(L).phase === 'morgen' && spiel(L).tote.length === 0, 'Hexe heilt: niemand stirbt');
    await L.emit('lehrer:ueberspringen'); await warte(100);
    t.pruefe(spiel(L).phase === 'tag', 'Tag: Abstimmung');
    for (const g of k) await act(g, 'stimme', { ziel: g === woelfe[0] ? dorf[1].id : woelfe[0].id });
    await warte(100);
    t.pruefe(spiel(L).phase === 'urteil' && spiel(L).urteil.name === 'K' + k.indexOf(woelfe[0]) && spiel(L).urteil.rolle === 'werwolf', 'Wolf wird vom Dorf verurteilt, Rolle aufgedeckt');
    t.pruefe(spiel(woelfe[0]).mitspieler.every((m) => m.rolle), 'Tote sehen alle Rollen');
    const totStimme = await act(woelfe[0], 'stimme', { ziel: 'skip' });
    t.pruefe(!totStimme.ok, 'Tote handeln nicht mehr');
    await L.emit('lehrer:ueberspringen'); await warte(100);
    t.pruefe(spiel(L).phase === 'woelfe' && spiel(L).nacht === 2, 'Nacht 2');
    await act(woelfe[1], 'wolf', { ziel: seherin.id }); await warte(3300);
    await L.emit('lehrer:ueberspringen'); await warte(100); // Seherin tot? noch nicht, Phase läuft
    await L.emit('lehrer:ueberspringen'); await warte(100); // Hexe
    t.pruefe(spiel(L).phase === 'morgen' && spiel(L).tote.length === 1 && spiel(L).tote[0].rolle === 'seherin', 'Morgen: die Seherin ist tot');
    await L.emit('lehrer:ueberspringen'); await warte(100);
    for (const g of k) if (spiel(g).ich.lebt) await act(g, 'stimme', { ziel: g === woelfe[1] ? dorf[1].id : woelfe[1].id });
    await warte(100);
    await L.emit('lehrer:ueberspringen'); await warte(100);
    t.pruefe(spiel(L).phase === 'ende' && spiel(L).sieger === 'dorf', 'alle Wölfe tot: das Dorf gewinnt');
    t.pruefe(L.z.spieler.find((p) => p.id === hexe.id).punkte === 150 && L.z.spieler.find((p) => p.id === seherin.id).punkte === 100, 'Punkte: Überlebende 150, Tote aus dem Siegerteam 100');
  }

  t.abschnitt('Werwolf: Amor und Jäger');
  {
    const { L, k } = await raum(8);
    const st = await L.emit('lehrer:start', { spiel: 'werwolf', werwolf: { woelfe: 1, seherin: false, hexe: false, jaeger: true, amor: true } });
    await warte(200);
    const rolle = (g) => spiel(g).ich.rolle;
    const wolf = k.find((g) => rolle(g) === 'werwolf');
    const jaeger = k.find((g) => rolle(g) === 'jaeger');
    const amor = k.find((g) => rolle(g) === 'amor');
    const dorf = k.filter((g) => rolle(g) === 'dorf');
    t.pruefe(st.ok && wolf && jaeger && amor && dorf.length === 5, '8 Mitspielende: Wolf, Jäger, Amor, 5 Dorf');
    await L.emit('lehrer:ueberspringen'); await warte(100);
    t.pruefe(spiel(L).phase === 'amor', 'Nacht 1 beginnt mit Amor');
    const doppelt = await act(amor, 'amor', { a: jaeger.id, b: jaeger.id });
    t.pruefe(!doppelt.ok, 'Amor braucht zwei verschiedene Personen');
    const fremd = await act(dorf[1], 'amor', { a: jaeger.id, b: dorf[0].id });
    t.pruefe(!fremd.ok, 'nur Amor darf verlieben');
    await act(amor, 'amor', { a: jaeger.id, b: dorf[0].id });
    await warte(2800);
    t.pruefe(spiel(L).phase === 'verliebt', 'Verliebte erfahren es');
    t.pruefe(spiel(jaeger).ich.partner.id === dorf[0].id && spiel(dorf[0]).ich.partner.id === jaeger.id && !spiel(dorf[1]).ich.partner, 'nur das Paar kennt sich');
    t.pruefe(!JSON.stringify(spiel(dorf[1])).includes('verliebt":true'), 'andere sehen das Paar nicht');
    await L.emit('lehrer:ueberspringen'); await warte(100);
    t.pruefe(spiel(L).phase === 'woelfe', 'dann die Werwölfe');
    await act(wolf, 'wolf', { ziel: dorf[0].id });
    await warte(3800);
    t.pruefe(spiel(L).phase === 'morgen' && spiel(L).tote.length === 2 && spiel(L).tote.some((x) => x.id === jaeger.id && x.grund === 'kummer'), 'Opfer stirbt, Jäger stirbt vor Kummer mit');
    await L.emit('lehrer:ueberspringen'); await warte(100);
    t.pruefe(spiel(L).phase === 'jaeger' && spiel(jaeger).ich.schiessen, 'der tote Jäger darf schießen');
    const nichtDran = await act(dorf[1], 'schiessen', { ziel: wolf.id });
    t.pruefe(!nichtDran.ok, 'nur der Jäger schießt');
    const aufTote = await act(jaeger, 'schiessen', { ziel: dorf[0].id });
    t.pruefe(!aufTote.ok, 'auf Tote wird nicht geschossen');
    const schuss = await act(jaeger, 'schiessen', { ziel: wolf.id }); await warte(100);
    t.pruefe(schuss.ok && spiel(L).phase === 'schuss' && spiel(L).schuss.tote[0].rolle === 'werwolf', 'Jäger erwischt den Wolf');
    await L.emit('lehrer:ueberspringen'); await warte(100);
    t.pruefe(spiel(L).phase === 'ende' && spiel(L).sieger === 'dorf', 'Wolf tot: das Dorf gewinnt');
    t.pruefe(spiel(L).mitspieler.filter((m) => m.verliebt).length === 2, 'am Ende wird das Paar gezeigt');
  }

  t.abschnitt('Werwolf: Liebespaar gewinnt');
  {
    const { L, k } = await raum(8);
    await L.emit('lehrer:start', { spiel: 'werwolf', werwolf: { woelfe: 1, seherin: false, hexe: false, jaeger: false, amor: true, tagSekunden: 60 } });
    await warte(200);
    const rolle = (g) => spiel(g).ich.rolle;
    const wolf = k.find((g) => rolle(g) === 'werwolf');
    const amor = k.find((g) => rolle(g) === 'amor');
    const rest = k.filter((g) => g !== wolf && g !== amor);
    const liebste = rest[0];
    await L.emit('lehrer:ueberspringen'); await warte(100);
    await act(amor, 'amor', { a: wolf.id, b: liebste.id }); await warte(2800);
    await L.emit('lehrer:ueberspringen'); await warte(100);
    // Nacht für Nacht: der Wolf erwischt alle außer seiner Liebsten, am Tag stimmt niemand
    const opfer = k.filter((g) => g !== wolf && g !== liebste);
    for (let i = 0; i < opfer.length; i++) {
      await act(wolf, 'wolf', { ziel: opfer[i].id }); await warte(3800);
      if (spiel(L).phase === 'ende') break;
      await L.emit('lehrer:ueberspringen'); await warte(100); // Morgen -> Tag
      if (spiel(L).phase === 'ende') break;
      await L.emit('lehrer:ueberspringen'); await warte(100); // Tag -> Urteil
      await L.emit('lehrer:ueberspringen'); await warte(100); // Urteil -> Nacht
    }
    t.pruefe(spiel(L).phase === 'ende' && spiel(L).sieger === 'liebende', 'nur noch das Paar lebt: Liebespaar gewinnt (' + spiel(L).sieger + ')');
    t.pruefe(L.z.spieler.find((p) => p.id === liebste.id).punkte === 150 && L.z.spieler.find((p) => p.id === amor.id).punkte === 0, 'Punkte nur für das Paar');
  }

  t.abschnitt('Begriffe erklären');
  {
    const { L, k } = await raum(4);
    const st = await L.emit('lehrer:start', { spiel: 'erklaeren', erklaeren: { runden: 1, sekunden: 30 } });
    await warte(200);
    t.pruefe(st.ok && spiel(L).teams.length === 2 && spiel(L).teams.every((t) => t.mitglieder.length === 2), 'zwei Teams mit je 2');
    const erk = k.find((g) => spiel(g).ich.aufgabe === 'erklaeren');
    const rater = k.find((g) => spiel(g).ich.aufgabe === 'raten');
    const waechter = k.filter((g) => spiel(g).ich.aufgabe === 'waechter');
    t.pruefe(erk && rater && waechter.length === 2, 'Rollen im Zug: erklären, raten, 2 Wächter');
    await act(erk, 'los'); await warte(800);
    t.pruefe(spiel(erk).karte && spiel(waechter[0]).karte && !spiel(rater).karte && !spiel(L).karte, 'Karte sehen nur Erklärer und Wächter');
    await act(erk, 'richtig'); await warte(800);
    await act(erk, 'richtig'); await warte(800);
    await act(waechter[0], 'tabu'); await warte(100);
    const doppelt = await act(waechter[1], 'tabu');
    t.pruefe(!doppelt.ok, 'Doppeltes Summen wird gesperrt');
    const team = spiel(L).teams[spiel(L).teamDran];
    t.pruefe(team.punkte === 1 && spiel(L).anzahl.richtig === 2 && spiel(L).anzahl.tabu === 1, 'Team: 2 richtig, 1 verbotenes Wort = 1 Punkt');
    t.pruefe(L.z.spieler.find((p) => p.id === erk.id).punkte === 10 && L.z.spieler.find((p) => p.id === rater.id).punkte === 10, 'Teammitglieder bekommen je 10 Punkte');
    await L.emit('lehrer:ueberspringen'); await L.emit('lehrer:ueberspringen'); await warte(100);
    t.pruefe(spiel(L).phase === 'bereit' && spiel(L).teamDran !== team.index, 'das andere Team ist dran');
  }

  t.abschnitt('Stirnraten');
  {
    const { L, k } = await raum(3);
    const st = await L.emit('lehrer:start', { spiel: 'stirnraten', stirnraten: { sekunden: 30 } });
    await warte(200);
    const r = k.find((g) => spiel(g).ich.rater);
    const helfer = k.find((g) => !spiel(g).ich.rater);
    t.pruefe(st.ok && r && spiel(L).phase === 'bereit', 'Ratende Person steht fest');
    await act(r, 'los'); await warte(1000);
    t.pruefe(spiel(helfer).wort && !spiel(L).wort, 'Wort auf den Handys, nicht auf der Bühne');
    await act(helfer, 'richtig'); await warte(1000); await act(r, 'weiter'); await warte(1000); await act(helfer, 'richtig');
    await warte(100);
    t.pruefe(spiel(L).richtig === 2 && L.z.spieler.find((p) => p.id === r.id).punkte === 20, '2 richtig: 20 Punkte für die ratende Person');
    const sofort = await act(helfer, 'richtig');
    t.pruefe(!sofort.ok, 'zu schnelles Doppeltippen wird gesperrt');
  }

  t.abschnitt('Quiz');
  {
    const { L, k } = await raum(3);
    const st = await L.emit('lehrer:start', { spiel: 'quiz', quiz: { fragen: 3, sekunden: 10, kategorien: [], eigene: 'Wie heißt unser Bus? | Blauer Blitz | Roter Renner | Gelbe Gurke | Grüne Gazelle' } });
    await warte(200);
    t.pruefe(st.ok && spiel(L).frage.kategorie === 'Eigene Fragen' && !spiel(L).frage.antworten, 'eigene Frage zuerst, erst lesen ohne Antworten');
    await L.emit('lehrer:ueberspringen'); await warte(100);
    const fr = spiel(k[0]).frage; const richtig = fr.antworten.indexOf('Blauer Blitz');
    await act(k[0], 'antwort', { wahl: richtig }); await warte(1000);
    await act(k[1], 'antwort', { wahl: richtig });
    await act(k[2], 'antwort', { wahl: (richtig + 1) % 4 }); await warte(150);
    const s = spiel(k[0]);
    t.pruefe(s.phase === 'aufloesung' && s.richtig === richtig, 'alle haben geantwortet: Auflösung');
    t.pruefe(spiel(k[0]).ich.gewinn > spiel(k[1]).ich.gewinn && spiel(k[1]).ich.gewinn > 500 && spiel(k[2]).ich.gewinn === 0, `schneller gibt mehr Punkte: ${spiel(k[0]).ich.gewinn} / ${spiel(k[1]).ich.gewinn} / 0`);
    t.pruefe(s.verteilung.reduce((a, b) => a + b) === 3, 'Verteilung der Antworten');
    const leer = await L.emit('lehrer:start', { spiel: 'quiz', quiz: { kategorien: [], eigene: '' } });
    t.pruefe(!leer.ok, 'ohne Fragen kein Start: ' + leer.fehler);
  }

};
