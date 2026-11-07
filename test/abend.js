'use strict';
// Spieleabend (Abendpunkte über mehrere Spiele) und Spielleitung auf dem Handy
const { warte, raum } = require('./hilfen');

module.exports = async function (url, t) {
  const { L, k, schluessel } = await raum(url, 4);
  const erg = await L.emit('lehrer:einstellungen', { abend: true });
  await warte(150);
  t.pruefe(L.z.einstellungen.abend === true && L.z.abend && L.z.abend.spiele.length === 0, 'Spieleabend eingeschaltet');
  t.pruefe(L.z.raum.gewaehlt === 'zeichnen' && k[0].z.raum.gewaehlt === 'zeichnen', 'alle sehen, welches Spiel als Nächstes dran ist');

  // Quiz mit einer eigenen Frage: K0 schnell richtig, K1 langsam richtig, K2 falsch, K3 gar nicht
  await L.emit('lehrer:start', { spiel: 'quiz', quiz: { fragen: 3, kategorien: [], eigene: 'Wie heißt der Test? | Abend | Morgen | Mittag | Nacht' } });
  await warte(200);
  await L.emit('lehrer:ueberspringen');
  await warte(150);
  const r = k[0].spiel().frage.antworten.indexOf('Abend');
  await k[0].act('antwort', { wahl: r });
  await warte(800);
  await k[1].act('antwort', { wahl: r });
  await k[2].act('antwort', { wahl: (r + 1) % 4 });
  await L.emit('lehrer:ueberspringen'); // auflösen
  await L.emit('lehrer:ueberspringen'); // Zwischenstand
  await L.emit('lehrer:ueberspringen'); // Ende (nur eine Frage)
  await warte(250);
  t.pruefe(L.spiel().phase === 'ende', 'Quiz beendet');
  const a = L.z.abend;
  t.pruefe(a.spiele.length === 1 && a.spiele[0].titel === 'Quiz', 'Quiz wurde für den Abend gewertet');
  const pkt = (g) => (a.tafel.find((p) => p.id === g.id) || {}).punkte;
  t.pruefe(pkt(k[0]) === 10 && pkt(k[1]) === 8 && pkt(k[2]) === 1 && pkt(k[3]) === 1, `Abendpunkte nach Platz: ${pkt(k[0])}, ${pkt(k[1])}, ${pkt(k[2])}, ${pkt(k[3])}`);
  t.pruefe(k[0].z.ich.abendPlus === 10, 'Handy zeigt die gewonnenen Abendpunkte');
  await warte(300);
  t.pruefe(L.z.abend.spiele.length === 1, 'dasselbe Spiel wird nur einmal gewertet');

  // zweites Spiel: Stirnraten, K3 gewinnt
  await L.emit('lehrer:start', { spiel: 'stirnraten', stirnraten: { sekunden: 30 } });
  await warte(200);
  t.pruefe(L.z.spieler.every((p) => p.punkte === 0) && L.z.abend.tafel.length === 4, 'neues Spiel: Spielpunkte bei null, Abendpunkte bleiben');
  await L.emit('lehrer:beenden');
  await warte(200);
  t.pruefe(L.z.abend.spiele.length === 1, 'abgebrochenes Spiel zählt nicht');

  await L.emit('lehrer:abend', { aktion: 'siegerehrung' });
  await warte(150);
  t.pruefe(L.z.abend.siegerehrung && k[0].z.abend.siegerehrung, 'Siegerehrung für alle');

  // Spielleitung auf dem Handy
  const falsch = await k[1].emit('kind:leitung', { schluessel: 'falsch' });
  t.pruefe(!falsch.ok && !k[1].z.leitung, 'falscher Schlüssel: keine Leitung');
  const ok = await k[0].emit('kind:leitung', { schluessel });
  await warte(150);
  t.pruefe(ok.ok && k[0].z.leitung && k[0].z.einstellungen && k[0].z.listen, 'Handy mit Schlüssel wird Spielleitung');
  t.pruefe(!k[1].z.einstellungen, 'andere Handys bekommen keine Einstellungen');
  const st = await k[0].emit('lehrer:start', { spiel: 'spion' });
  await warte(200);
  t.pruefe(st.ok && L.spiel().art === 'spion' && !L.z.abend.siegerehrung, 'Handy-Leitung startet ein Spiel');
  t.pruefe(!k[0].spiel().geheim, 'Handy-Leitung sieht keine Lösung');
  k[1].s.emit('lehrer:beenden', {});
  await warte(150);
  t.pruefe(L.z.spiel !== null, 'normale Handys können nichts steuern');
  await k[0].emit('lehrer:abend', { aktion: 'zuruecksetzen' });
  await warte(150);
  t.pruefe(L.z.abend.spiele.length === 0 && L.z.abend.tafel.length === 0, 'Abend zurücksetzen');
  void erg;
};
