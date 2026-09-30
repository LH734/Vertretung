'use strict';
// Alle Spiele: Start, Pause, Überspringen; Gruppenmodus
const { warte, geraet: g0 } = require('./hilfen');
let URL;
const geraet = () => g0(URL);

module.exports = async function (url, t) {
  URL = url;
  const L = geraet(); await L.bereit; const r = await L.emit('lehrer:erstellen', {});
  const k = []; for (let i = 0; i < 6; i++) { const g = geraet(); await g.bereit; await g.emit('kind:beitreten', { code: r.code, name: 'K' + i }); k.push(g); }
  for (const spiel of ['zeichnen', 'slf', 'saboteur', 'spion', 'werwolf', 'erklaeren', 'stirnraten', 'quiz']) {
    const st = await L.emit('lehrer:start', { spiel }); await warte(300);
    t.pruefe(st.ok && L.z.spiel && L.z.spiel.art === spiel && k.every((g) => g.z.spiel && g.z.spiel.art === spiel), `${spiel} startet bei Regie und allen Handys`);
    await L.emit('lehrer:pause', { an: true }); await warte(1200); const a = L.z.spiel.restMs; await warte(700);
    t.pruefe(L.z.spiel.restMs === a, `${spiel}: Pause hält die Zeit an`);
    await L.emit('lehrer:pause', { an: false }); await L.emit('lehrer:ueberspringen'); await warte(200);
    t.pruefe(L.z.spiel !== null, `${spiel}: Überspringen ohne Absturz`);
  }
  await L.emit('lehrer:beenden'); await warte(200);
  t.pruefe(L.z.spiel === null, 'Beenden');
  const G = geraet(); await G.bereit; const gr = await G.emit('gruppe:oeffnen', { anzahl: 2 });
  await warte(200);
  const code = G.gz.raeume[0].code;
  for (let i = 0; i < 5; i++) { const g = geraet(); await g.bereit; await g.emit('kind:beitreten', { code, name: 'G' + i }); }
  await G.emit('gruppe:befehl', { code: 'alle', befehl: 'einstellungen', daten: { spiel: 'werwolf', werwolf: { tagSekunden: 120 } } });
  const s = await G.emit('gruppe:befehl', { code, befehl: 'start', daten: {} }); await warte(300);
  t.pruefe(s.ok && G.gz.raeume[0].spiel.art === 'werwolf' && G.gz.einstellungen.werwolf.tagSekunden === 120 && !G.gz.raeume[0].spiel.geheim, 'Gruppenmodus startet Werwolf, ohne Rollen zu verraten');
};
