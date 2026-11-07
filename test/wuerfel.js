'use strict';
// Würfelspiele: Mäxchen und Bluffwürfel
const { warte, raum } = require('./hilfen');

const WERTE = ['31', '32', '41', '42', '43', '51', '52', '53', '54', '61', '62', '63', '64', '65', '11', '22', '33', '44', '55', '66', '21'];

async function bisEnde(L, max) {
  for (let i = 0; i < (max || 200) && !(L.z.spiel && L.z.spiel.phase === 'ende'); i++) { await L.emit('lehrer:ueberspringen'); await warte(40); }
}

module.exports = async function (url, t) {
  t.abschnitt('Mäxchen');
  {
    const { L, k } = await raum(url, 4);
    const zuWenig = await raum(url, 2);
    const st0 = await zuWenig.L.emit('lehrer:start', { spiel: 'maexchen' });
    t.pruefe(!st0.ok, 'Mäxchen braucht mindestens 3');
    const st = await L.emit('lehrer:start', { spiel: 'maexchen', maexchen: { leben: 2, sekunden: 20 } }); await warte(200);
    t.pruefe(st.ok && L.z.spiel.art === 'maexchen' && L.z.spiel.phase === 'wurf', 'Mäxchen startet mit einem Wurf');
    const geraet = (id) => k.find((g) => g.id === id);
    let s = L.z.spiel;
    const aktiv = geraet(s.aktiv.id);
    const andere = k.filter((g) => g !== aktiv);
    t.pruefe(aktiv.z.spiel.ich.wurf && aktiv.z.spiel.ich.wurf.length === 2 && andere.every((g) => !g.z.spiel.ich.wurf), 'Nur wer würfelt, sieht den Wurf');
    t.pruefe(s.spieler.every((p) => p.leben === 2), 'Alle starten mit 2 Leben');
    t.pruefe(L.z.spiel.geheim && L.z.spiel.geheim.includes('Wurf'), 'Die Regie kann den Wurf heimlich sehen');
    let a = await aktiv.act('ansage', { wert: '42' }); await warte(100);
    s = L.z.spiel;
    t.pruefe(a.ok && s.phase === 'entscheidung' && s.ansage === '42', 'Ansage 42 angenommen');
    const ent = geraet(s.entscheider.id);
    const fremd = k.find((g) => g !== ent && g !== aktiv);
    const f = await fremd.act('glauben');
    t.pruefe(!f.ok, 'Nur wer dran ist, darf glauben oder aufdecken');
    await ent.act('glauben'); await warte(100);
    s = L.z.spiel;
    t.pruefe(s.phase === 'wurf' && s.aktiv.id === ent.id && s.vorher === '42', 'Wer glaubt, würfelt selbst weiter');
    t.pruefe(!ent.z.spiel.ich.erlaubt.includes('42') && !ent.z.spiel.ich.erlaubt.includes('31') && ent.z.spiel.ich.erlaubt.includes('43'), 'Nur höhere Ansagen sind erlaubt');
    a = await ent.act('ansage', { wert: '41' });
    t.pruefe(!a.ok, 'Niedrigere Ansage wird abgelehnt');
    // Bluff mit Mäxchen: wer aufdeckt, gewinnt, wenn nicht wirklich 21 gewürfelt wurde
    const wurf = ent.z.spiel.ich.wurf;
    const echt = `${Math.max(...wurf)}${Math.min(...wurf)}`;
    await ent.act('ansage', { wert: '21' }); await warte(100);
    const zw = geraet(L.z.spiel.entscheider.id);
    await zw.act('aufdecken'); await warte(100);
    s = L.z.spiel;
    const e = s.ergebnis;
    const ehrlich = echt === '21';
    t.pruefe(s.phase === 'aufloesung' && e && e.echt === echt && e.ehrlich === ehrlich, 'Aufdecken zeigt den echten Wurf');
    t.pruefe(e.verlierer === (ehrlich ? zw.id : ent.id) && e.minus === (ehrlich ? 2 : 1), 'Der richtige verliert (echtes Mäxchen angezweifelt: zwei Leben)');
    t.pruefe(s.spieler.find((p) => p.id === e.verlierer).leben === 2 - e.minus, 'Leben werden abgezogen');
    await L.emit('lehrer:ueberspringen'); await warte(100);
    s = L.z.spiel;
    if (!ehrlich) t.pruefe(s.phase === 'wurf' && s.aktiv.id === e.verlierer && !s.vorher, 'Wer verloren hat, beginnt die neue Runde');
    // Ein angesagtes Mäxchen glauben kostet ein Leben
    if (s.phase === 'wurf') {
      const ak = geraet(s.aktiv.id);
      const vorher = s.spieler.map((p) => [p.id, p.leben]);
      await ak.act('ansage', { wert: '21' }); await warte(80);
      const gl = geraet(L.z.spiel.entscheider.id);
      await gl.act('glauben'); await warte(80);
      const n = L.z.spiel.spieler.find((p) => p.id === gl.id).leben;
      t.pruefe(L.z.spiel.ergebnis && L.z.spiel.ergebnis.art === 'geglaubt' && n === new Map(vorher).get(gl.id) - 1, 'Mäxchen glauben kostet ein Leben');
    }
    await bisEnde(L);
    s = L.z.spiel;
    const ueber = s.spieler.filter((p) => p.leben > 0);
    t.pruefe(s.phase === 'ende' && ueber.length === 1 && s.sieger === ueber[0].name, 'Am Ende bleibt eine Person übrig');
    const best = L.z.spieler[0];
    t.pruefe(best.name === s.sieger && best.punkte >= 30, 'Wer übrig bleibt, hat die meisten Punkte');
  }

  t.abschnitt('Bluffwürfel');
  {
    const { L, k } = await raum(url, 3);
    const st = await L.emit('lehrer:start', { spiel: 'bluff', bluff: { wuerfel: 3, joker: true } }); await warte(200);
    let s = L.z.spiel;
    t.pruefe(st.ok && s.art === 'bluff' && s.phase === 'bieten' && s.gesamt === 9, 'Bluffwürfel startet mit 3 × 3 Würfeln');
    t.pruefe(k.every((g) => g.z.spiel.ich.augen.length === 3) && k.every((g) => g.z.spiel.spieler.every((p) => p.augen === null)), 'Alle sehen nur die eigenen Würfel');
    const geraet = (id) => k.find((g) => g.id === id);
    let dran = geraet(s.dran.id);
    let a = await dran.act('bieten', { menge: 2, augen: 1 });
    t.pruefe(!a.ok, 'Mit Jokern wird nicht auf Einsen geboten');
    a = await dran.act('zweifeln');
    t.pruefe(!a.ok, 'Ohne Gebot gibt es nichts anzuzweifeln');
    a = await dran.act('bieten', { menge: 2, augen: 4 }); await warte(80);
    s = L.z.spiel;
    t.pruefe(a.ok && s.gebot.menge === 2 && s.gebot.augen === 4 && s.dran.id !== dran.id, 'Gebot 2 × Vier, dann ist die nächste Person dran');
    dran = geraet(s.dran.id);
    a = await dran.act('bieten', { menge: 2, augen: 3 });
    t.pruefe(!a.ok, 'Niedrigeres Gebot wird abgelehnt');
    a = await dran.act('bieten', { menge: 2, augen: 5 }); await warte(80);
    t.pruefe(a.ok, 'Gleiche Menge, höhere Zahl geht');
    dran = geraet(L.z.spiel.dran.id);
    const vorher = new Map(L.z.spiel.spieler.map((p) => [p.id, p.wuerfel]));
    await dran.act('zweifeln'); await warte(100);
    s = L.z.spiel;
    const e = s.ergebnis;
    const echt = s.spieler.reduce((n, p) => n + p.augen.filter((x) => x === 5 || x === 1).length, 0);
    t.pruefe(s.phase === 'aufloesung' && s.spieler.every((p) => Array.isArray(p.augen)), 'Beim Zweifeln werden alle Würfel aufgedeckt');
    t.pruefe(e.anzahl === echt && e.stimmt === (echt >= 2), 'Fünfen und Einsen werden richtig gezählt');
    t.pruefe(e.verlierer === (e.stimmt ? dran.id : e.gebot.von) && s.spieler.find((p) => p.id === e.verlierer).wuerfel === vorher.get(e.verlierer) - 1, 'Wer falsch lag, gibt einen Würfel ab');
    await L.emit('lehrer:ueberspringen'); await warte(100);
    s = L.z.spiel;
    t.pruefe(s.phase === 'bieten' && s.dran.id === e.verlierer && s.gesamt === 8 && !s.gebot, 'Neue Runde: neu gewürfelt, wer verloren hat, beginnt');
    await bisEnde(L, 300);
    s = L.z.spiel;
    const ueber = s.spieler.filter((p) => p.wuerfel > 0);
    t.pruefe(s.phase === 'ende' && ueber.length === 1 && s.sieger === ueber[0].name && L.z.spieler[0].name === s.sieger, 'Am Ende hat nur noch eine Person Würfel und führt');
    // Wer den Raum verlässt, scheidet aus, das Spiel läuft weiter
    await L.emit('lehrer:start', { spiel: 'bluff' }); await warte(100);
    const weg = geraet(L.z.spiel.dran.id);
    weg.s.emit('kind:verlassen'); await warte(150);
    s = L.z.spiel;
    t.pruefe(s.phase === 'bieten' && s.dran.id !== weg.id && !s.spieler.some((p) => p.id === weg.id && p.wuerfel > 0), 'Wer geht, scheidet aus, das Spiel läuft weiter');
  }
  t.pruefe(WERTE.length === 21, 'Wertetabelle vollständig');
};
