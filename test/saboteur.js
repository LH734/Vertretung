'use strict';
// Saboteur: Rollen, Bewegung, Sicht, Erwischen, Konferenz, Sieg
const K = require('../public/saboteur-karte.js');
const { warte, geraet, raum } = require('./hilfen');

async function gehe(g, zx, zy) {
  let { x, y } = g.pos;
  for (let i = 0; i < 400; i++) {
    const dx = zx - x;
    const dy = zy - y;
    const d = Math.hypot(dx, dy);
    if (d < 0.1) break;
    const w = Math.min(d, 4.0 * 0.066);
    const n = K.bewege(x, y, (dx / d) * w, (dy / d) * w);
    if (n.x === x && n.y === y) break;
    x = n.x; y = n.y;
    g.s.emit('kind:bewegung', { x, y });
    await warte(66);
  }
  g.pos = { x, y };
}

module.exports = async function (url, t) {
  const { L, k } = await raum(url, 5);
  for (const g of k) {
    g.korr = 0;
    g.s.on('saboteur:korrektur', (p) => { g.korr++; g.pos = { x: p.x, y: p.y }; });
    g.s.on('saboteur:blick', (b) => { g.blick = b; });
  }
  const st = await L.emit('lehrer:start', { spiel: 'saboteur', saboteur: { abklingSekunden: 10, abstimmSekunden: 30, aufgaben: 2, runden: 2 } });
  await warte(300);
  t.pruefe(st.ok && L.spiel().phase === 'rollen', 'Saboteur startet mit Rollen');
  t.pruefe(!L.spiel().mitspieler.some((m) => m.sab) && L.spiel().rollen.length === 1, 'Bühne ohne Rollen, Regie kennt sie');
  const sab = k.find((g) => g.spiel().ich.rolle === 'saboteur');
  const crew = k.filter((g) => g !== sab);
  t.pruefe(sab && crew.every((g) => !g.spiel().mitspieler.some((m) => m.sab)), 'Crew sieht nicht, wer Saboteur ist');
  k.forEach((g) => { g.pos = { x: g.spiel().ich.x, y: g.spiel().ich.y }; });
  await warte(6300);
  t.pruefe(L.spiel().phase === 'spiel', 'nach 6 s beginnt das Spiel');

  const vorher = crew[0].korr;
  crew[0].s.emit('kind:bewegung', { x: crew[0].pos.x + 5, y: crew[0].pos.y });
  await warte(200);
  t.pruefe(crew[0].korr === vorher + 1, 'zu großer Sprung wird zurückgesetzt');
  await gehe(crew[0], 6.5, 24); await gehe(crew[0], 6.5, 18); await gehe(crew[0], 20, 18);
  await warte(200);
  t.pruefe(!crew[1].blick.s.some((e) => e[0] === crew[0].spiel().ich.i), 'hinter der Wand unsichtbar');

  const opfer = crew[2];
  t.pruefe(!(await sab.act('erwischen')).ok, 'Abklingzeit am Anfang');
  await warte(4000);
  await gehe(sab, opfer.pos.x, opfer.pos.y);
  const erw = await sab.act('erwischen');
  await warte(200);
  t.pruefe(erw.ok && opfer.spiel().ich.lebt === false, 'Saboteur erwischt, Opfer wird Geist');
  t.pruefe(crew[3].spiel().mitspieler.find((m) => m.i === opfer.spiel().ich.i).status === 'da', 'die Crew weiß es noch nicht');
  const melder = crew[3];
  const umriss = melder.blick.u[0];
  await gehe(melder, umriss[1] / 100, umriss[2] / 100);
  await melder.act('melden');
  await warte(200);
  t.pruefe(L.spiel().phase === 'konferenz' && L.spiel().konferenz.umriss === opfer.name, 'Kreideumriss gemeldet: Konferenz');
  t.pruefe(!(await opfer.act('stimme', { ziel: 'skip' })).ok, 'Geister stimmen nicht ab');
  for (const g of [sab, crew[0], crew[1], crew[3]]) await g.act('stimme', { ziel: g === sab ? crew[0].id : sab.id });
  await warte(200);
  t.pruefe(L.spiel().phase === 'ergebnis' && L.spiel().ergebnis.warSaboteur === true, 'Saboteur rausgeworfen und aufgedeckt');
  await warte(7300);
  t.pruefe(L.spiel().phase === 'rundenende' && L.spiel().sieg.seite === 'crew', 'Crew gewinnt');
  t.pruefe(L.z.spieler.filter((p) => p.punkte === 100).length === 4, 'Crew bekommt je 100 Punkte');

  const spaet = geraet(url);
  await spaet.bereit;
  await L.emit('lehrer:ueberspringen');
  await warte(200);
  await spaet.emit('kind:beitreten', { code: (await L.z.raum.code), name: 'Spät' });
  await warte(300);
  t.pruefe(spaet.spiel().ich.rolle === 'zuschauer', 'wer spät kommt, schaut als Geist zu');
  await L.emit('lehrer:ueberspringen');
  await warte(200);
  t.pruefe(L.spiel().phase === 'rundenende' && L.spiel().sieg.seite === null, 'Runde abbrechen: niemand gewinnt');

  // Sabotagen und geheime Gänge
  const r3 = await raum(url, 5);
  for (const g of r3.k) {
    g.s.on('saboteur:korrektur', (p) => { g.pos = { x: p.x, y: p.y }; g.gang = !!p.gang; });
  }
  await r3.L.emit('lehrer:start', { spiel: 'saboteur', saboteur: { abklingSekunden: 60, aufgaben: 2, runden: 1 } });
  await warte(300);
  const sab3 = r3.k.find((g) => g.spiel().ich.rolle === 'saboteur');
  const crew3 = r3.k.filter((g) => g !== sab3);
  r3.k.forEach((g) => { g.pos = { x: g.spiel().ich.x, y: g.spiel().ich.y }; });
  await warte(6300);
  t.pruefe(!(await sab3.act('sabotage', { welche: 'licht' })).ok, 'Sabotage erst nach einer Wartezeit');
  t.pruefe(!(await crew3[0].act('sabotage', { welche: 'licht' })).ok, 'Crew kann nicht sabotieren');
  // Saboteur geht zum Gang im Klassenzimmer und schlüpft durch
  await gehe(sab3, 6.5, 20.5); await gehe(sab3, 6.5, 17); await gehe(sab3, 6.8, 14.5); await gehe(sab3, 3.2, 13.5);
  const gang = await sab3.act('gang');
  await warte(200);
  t.pruefe(gang.ok && sab3.gang && Math.abs(sab3.pos.x - 27.5) < 0.1 && Math.abs(sab3.pos.y - 22) < 0.1, 'geheimer Gang: vom Klassenzimmer in die Toiletten');
  // Crew läuft derweil zum Hauptschalter
  const c = crew3[0];
  await gehe(c, 6.5, 20.5); await gehe(c, 6.5, 18); await gehe(c, 33.5, 18); await gehe(c, 33.5, 21); await gehe(c, 31.3, 22.3);
  await warte(Math.max(0, 15000 - 12000));
  let sabo = await sab3.act('sabotage', { welche: 'licht' });
  for (let i = 0; i < 20 && !sabo.ok; i++) { await warte(500); sabo = await sab3.act('sabotage', { welche: 'licht' }); }
  await warte(200);
  t.pruefe(sabo.ok && r3.L.spiel().sabotage.art === 'licht', 'Licht aus');
  t.pruefe(c.spiel().ich.sicht < 3 && sab3.spiel().ich.sicht > 5, 'bei Licht aus sieht die Crew weniger, der Saboteur nicht');
  t.pruefe(!(await c.act('durchsage')).ok, 'während der Sabotage keine Durchsage');
  t.pruefe(!(await sab3.act('sabotage', { welche: 'alarm' })).ok, 'nur eine Sabotage gleichzeitig');
  const rep = await c.act('reparieren');
  await warte(200);
  t.pruefe(rep.ok && !r3.L.spiel().sabotage && c.spiel().ich.sicht > 5, 'am Hauptschalter repariert, Licht wieder an');
  await r3.L.emit('lehrer:beenden');

  const r2 = await raum(url, 3);
  t.pruefe(!(await r2.L.emit('lehrer:start', { spiel: 'saboteur' })).ok, 'mit 3 Mitspielenden kein Start');
};
