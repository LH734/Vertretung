'use strict';
// Raum, Beitritt, Zeichnen und Raten, Stadt, Land, Fluss, Regie
const { warte, geraet, raum } = require('./hilfen');

module.exports = async function (url, t) {
  t.abschnitt('Raum und Beitritt');
  const { L, k, code } = await raum(url, 4, ['Anna', 'Ben', 'Ein wirklich sehr langer Spitzname', '<b>Max</b><script>']);
  await warte(200);
  t.pruefe(/^[A-Z]{4}$/.test(code), 'Raumcode mit vier Buchstaben');
  const namen = L.z.spieler.map((p) => p.name);
  t.pruefe(namen.every((n) => Array.from(n).length <= 16), 'Namen höchstens 16 Zeichen');
  t.pruefe(namen.includes('<b>Max</b><scrip'), 'spitze Klammern bleiben Text');
  t.pruefe(!(await k[0].emit('kind:beitreten', { code: 'ZZZZ', name: 'x' })).ok, 'falscher Code abgewiesen');

  t.abschnitt('Zeichnen und Raten');
  let st = await L.emit('lehrer:start', { spiel: 'zeichnen', zeichnen: { runden: 4, sekunden: 60, listen: ['Tiere und Natur'] } });
  await warte(200);
  const Z = k.find((g) => g.spiel().istZeichner);
  t.pruefe(st.ok && Z && Z.spiel().auswahl.length === 3, 'Zeichner bekommt drei Begriffe');
  await Z.act('waehle', { index: 0 });
  await warte(200);
  const wort = Z.spiel().wort;
  const rater = k.filter((g) => g !== Z);
  t.pruefe(rater.every((g) => g.spiel().wort === null) && L.spiel().muster.every((m) => m.art !== 'buchstabe'), 'Ratende und Bühne sehen nur Striche');
  Z.s.emit('kind:zeichnen', { typ: 'start', id: 'a1', f: 1, b: 1, p: [[10, 10], [20, 20]] });
  Z.s.emit('kind:zeichnen', { typ: 'fuellen', x: 400, y: 300, f: 3 });
  await warte(200);
  // Neu laden mitten in der Runde: gleicher Platz, ganzes Bild
  const R = rater[2];
  R.s.disconnect();
  await warte(200);
  const R2 = geraet(url);
  await R2.bereit;
  const wieder = await R2.emit('kind:beitreten', { code, spielerId: R.id });
  await warte(200);
  const alles = R2.ereignisse.find((e) => e[0] === 'zeichnen:alles');
  t.pruefe(wieder.ok && wieder.spielerId === R.id && alles && alles[1].ops.length === 2, 'Wiederkehr auf denselben Platz mit ganzem Bild');
  rater[2] = R2;
  k[k.indexOf(R)] = R2;
  R2.id = R.id;
  R2.name = R.name;
  // Zwei raten gleichzeitig richtig
  rater[0].s.emit('kind:chat', { text: ' ' + wort.toUpperCase() + ' ' });
  rater[1].s.emit('kind:chat', { text: wort.toLowerCase() });
  await warte(400);
  const g0 = rater[0].ereignisse.find((e) => e[0] === 'geraten');
  const g1 = rater[1].ereignisse.find((e) => e[0] === 'geraten');
  t.pruefe(g0 && g1 && Math.abs(g0[1].punkte - g1[1].punkte) >= 19, 'zwei raten richtig, nur das erste Kind bekommt den Bonus');
  t.pruefe(!L.ereignisse.some((e) => e[0] === 'chat' && e[1].art === 'rate' && e[1].text.toLowerCase().includes(wort.toLowerCase())), 'richtiges Wort nie im Chat');
  // Drosselung
  for (let i = 0; i < 10; i++) R2.s.emit('kind:chat', { text: 'tipp' + i });
  await warte(300);
  t.pruefe(L.ereignisse.filter((e) => e[0] === 'chat' && /^tipp/.test(e[1].text)).length <= 4, 'Raten wird gedrosselt');
  // Pause
  await L.emit('lehrer:pause', { an: true });
  await warte(1200);
  const rest = L.spiel().restMs;
  await warte(700);
  t.pruefe(L.spiel().restMs === rest, 'Pause hält die Zeit an');
  await L.emit('lehrer:pause', { an: false });
  await warte(1200);
  R2.s.emit('kind:chat', { text: wort });
  await warte(400);
  t.pruefe(L.spiel().phase === 'aufloesung', 'alle haben es: Runde endet');

  t.abschnitt('Stadt, Land, Fluss');
  st = await L.emit('lehrer:start', { spiel: 'slf', slf: { kategorien: ['Stadt', 'Land', 'Fluss', 'Name', 'Tier'], eigene: '', runden: 1, sekunden: 60, modus: 'stopp', pruefung: 'lehrkraft' } });
  await warte(200);
  const b = L.spiel().buchstabe;
  t.pruefe(st.ok && !'QXYC'.includes(b), 'Buchstabe ohne Q, X, Y, C');
  const [a, c, d] = k;
  const falsch = b === 'Z' ? 'Berlin' : 'Zwickau';
  await a.act('antworten', { antworten: [b + 'stadt', b + 'land', b + 'fluss', b + 'name', b + 'tier'] });
  await c.act('antworten', { antworten: [b.toLowerCase() + 'STADT', '', b + 'fluss2', '', ''] });
  await d.act('antworten', { antworten: [falsch, b + 'land', '', '', ''] });
  t.pruefe(!(await c.act('fertig', { antworten: [b.toLowerCase() + 'STADT', '', b + 'fluss2', '', ''] })).ok, 'Stopp mit leeren Feldern nicht möglich');
  await a.act('fertig', { antworten: [b + 'stadt', b + 'land', b + 'fluss', b + 'name', b + 'tier'] });
  await warte(200);
  t.pruefe(L.spiel().restMs <= 10000, 'Stopp: alle haben noch 10 Sekunden');
  await L.emit('lehrer:ueberspringen');
  await warte(1800);
  const e = (id) => L.spiel().auswertung.eintraege.find((x) => x.id === id);
  t.pruefe(e(a.id).punkte === 5 && e(c.id).punkte === 5, 'gleiche Antwort zweier Kinder: je 5');
  t.pruefe(!e(d.id).gueltig && e(d.id).punkte === 0, 'falscher Anfangsbuchstabe: ungültig');
  await L.emit('lehrer:spiel', { art: 'kategorie', richtung: 1 });
  await warte(150);
  t.pruefe(e(c.id).punkte === 0, 'leeres Feld: 0 Punkte');

  t.abschnitt('Regie');
  await L.emit('lehrer:spieler', { id: a.id, aktion: 'umbenennen', name: 'Neuer <i>Name</i> der lang ist' });
  await L.emit('lehrer:spieler', { id: a.id, aktion: 'stumm' });
  await warte(200);
  t.pruefe(a.z.ich.name === 'Neuer <i>Name</i' && a.z.ich.stumm, 'umbenennen und stummschalten');
  await L.emit('lehrer:spieler', { id: d.id, aktion: 'entfernen' });
  await warte(200);
  t.pruefe(d.ereignisse.some((x) => x[0] === 'entfernt') && !(await d.emit('kind:beitreten', { code, spielerId: d.id })).ok, 'Entfernte kommen mit alter ID nicht zurück');
  await L.emit('lehrer:beenden');
  await warte(200);
  t.pruefe(L.z.spiel === null, 'Spiel beenden');
  t.pruefe((await fetch(url + '/healthz').then((r) => r.text())) === 'ok', '/healthz antwortet');
};
