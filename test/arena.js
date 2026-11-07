'use strict';
// Übersicht mit mehreren Räumen, Freischalten nach Spielerzahl, Abstimmung über das nächste Spiel
const { warte, geraet: g0, raum: r0 } = require('./hilfen');
let URL;
const geraet = () => g0(URL);

async function bisEnde(L) {
  for (let i = 0; i < 40 && !(L.z.spiel && L.z.spiel.phase === 'ende'); i++) { await L.emit('lehrer:ueberspringen'); await warte(120); }
}

module.exports = async function (url, t) {
  URL = url;

  t.abschnitt('Freischalten nach Spielerzahl');
  const { L, k, code, schluessel } = await r0(url, 3);
  await warte(200);
  const frei = (z, spiel) => z.freigabe.spiele.find((x) => x.spiel === spiel);
  t.pruefe(L.z.freigabe.online === 3, 'Freigabe zählt 3 Leute');
  t.pruefe(frei(L.z, 'spion').frei && frei(L.z, 'spion').ab === 3, 'Spion ab 3: frei');
  t.pruefe(!frei(L.z, 'werwolf').frei && frei(L.z, 'werwolf').ab === 5, 'Werwolf ab 5: gesperrt');
  t.pruefe(!frei(L.z, 'saboteur').frei && frei(L.z, 'saboteur').ab === 4, 'Saboteur ab 4: gesperrt');
  t.pruefe(frei(L.z, 'erklaeren').ab === 4, 'Erklären ab 4 (zwei Teams)');
  t.pruefe(k[0].z.freigabe && !frei(k[0].z, 'werwolf').frei, 'Handys sehen die Freigabe auch');
  const x = geraet(); await x.bereit; await x.emit('kind:beitreten', { code, name: 'X' }); await warte(200);
  t.pruefe(frei(L.z, 'saboteur').frei, 'Mit der 4. Person wird Saboteur frei');
  x.s.disconnect(); await warte(200);
  t.pruefe(!frei(L.z, 'saboteur').frei, 'Geht jemand, ist Saboteur wieder gesperrt');
  const st = await L.emit('lehrer:start', { spiel: 'werwolf' });
  t.pruefe(!st.ok, 'Gesperrtes Spiel startet nicht');

  t.abschnitt('Abstimmung über das nächste Spiel');
  await L.emit('lehrer:einstellungen', { abstimmen: true });
  await L.emit('lehrer:start', { spiel: 'quiz' }); await warte(200);
  await bisEnde(L);
  t.pruefe(L.z.spiel.phase === 'ende' && !L.z.wahl, 'Am Ende erst das Ergebnis, noch keine Abstimmung');
  await warte(8600);
  t.pruefe(L.z.wahl && k[0].z.wahl, 'Danach startet die Abstimmung auf allen Geräten');
  const opt = L.z.wahl ? L.z.wahl.optionen.map((o) => o.spiel) : [];
  t.pruefe(opt.includes('spion') && opt.includes('quiz') && !opt.includes('werwolf') && !opt.includes('saboteur'), 'Zur Wahl stehen genau die freigeschalteten Spiele');
  await k[0].emit('kind:wahl', { spiel: 'werwolf' }); await warte(100);
  t.pruefe(L.z.wahl && L.z.wahl.abgegeben === 0, 'Stimme für ein gesperrtes Spiel zählt nicht');
  await k[0].emit('kind:wahl', { spiel: 'spion' });
  await k[1].emit('kind:wahl', { spiel: 'spion' }); await warte(100);
  t.pruefe(k[0].z.wahl.meine === 'spion' && L.z.wahl.optionen.find((o) => o.spiel === 'spion').stimmen === 2, 'Stimmen werden gezählt');
  await k[2].emit('kind:wahl', { spiel: 'stirnraten' }); await warte(500);
  t.pruefe(!L.z.wahl && L.z.spiel && L.z.spiel.art === 'spion', 'Haben alle gewählt, startet das Gewinnerspiel sofort');

  await L.emit('lehrer:beenden'); await warte(100);
  const w = await L.emit('lehrer:wahl', { aktion: 'starten' }); await warte(100);
  t.pruefe(w.ok && L.z.wahl, 'Leitung kann die Abstimmung von Hand starten');
  await L.emit('lehrer:wahl', { aktion: 'abbrechen' }); await warte(100);
  t.pruefe(!L.z.wahl && !L.z.spiel, 'und abbrechen');
  await L.emit('lehrer:wahl', { aktion: 'starten' });
  await k[0].emit('kind:wahl', { spiel: 'stirnraten' });
  await L.emit('lehrer:wahl', { aktion: 'jetzt' }); await warte(150);
  t.pruefe(L.z.spiel && L.z.spiel.art === 'stirnraten', 'Sofort auswerten startet das Spiel mit den meisten Stimmen');
  await L.emit('lehrer:einstellungen', { abstimmen: false });
  await bisEnde(L); await warte(8600);
  t.pruefe(!L.z.wahl, 'Ausgeschaltet: keine Abstimmung nach dem Spiel');

  t.abschnitt('Übersicht: ein Raum, schnell weitere dazu');
  const G = geraet(); await G.bereit;
  const go = await G.emit('gruppe:oeffnen', {}); await warte(200);
  t.pruefe(go.ok && G.gz.raeume.length === 1 && G.gz.raeume[0].name === 'Fuchs', 'Übersicht startet mit einem Raum „Fuchs“');
  const c1 = G.gz.raeume[0].code;
  const R1 = geraet(); await R1.bereit; await R1.emit('lehrer:erstellen', { code: c1, schluessel: G.gz.raeume[0].schluessel }); await warte(100);
  await R1.emit('lehrer:einstellungen', { spiel: 'spion', abstimmen: true, spion: { modus: 'orte' } });
  await G.emit('gruppe:befehl', { code: 'alle', befehl: 'hinzufuegen' }); await warte(200);
  const r2 = G.gz.raeume[1];
  t.pruefe(G.gz.raeume.length === 2 && r2.name === 'Eule', 'Zweiter Raum heißt „Eule“');
  const R2 = geraet(); await R2.bereit; await R2.emit('lehrer:erstellen', { code: r2.code, schluessel: r2.schluessel }); await warte(100);
  t.pruefe(R2.z.einstellungen.spiel === 'spion' && R2.z.einstellungen.abstimmen && R2.z.einstellungen.spion.modus === 'orte', 'Neuer Raum übernimmt die Einstellungen des ersten');
  t.pruefe(R1.z.uebersicht === go.schluessel && R1.z.raum.name === 'Fuchs', 'Regie kennt den Weg zurück zur Übersicht und den Raumnamen');

  t.abschnitt('Leute verschieben');
  const a = geraet(); await a.bereit; const aa = await a.emit('kind:beitreten', { code: c1, name: 'Anna' });
  const b = geraet(); await b.bereit; const ba = await b.emit('kind:beitreten', { code: r2.code, name: 'Anna' });
  await warte(150);
  const v = await G.emit('gruppe:befehl', { code: c1, befehl: 'verschieben', nach: r2.code, spielerId: aa.spielerId }); await warte(200);
  t.pruefe(v.ok && a.z.raum.code === r2.code && a.ereignisse.some(([e, d]) => e === 'umgezogen' && d.code === r2.code), 'Handy landet sofort im neuen Raum');
  t.pruefe(a.z.ich && a.z.ich.name === 'Anna 2' && R2.z.spieler.length === 2 && R1.z.spieler.length === 0, 'Doppelter Name wird angepasst, Listen stimmen');
  // Offline verschoben: Beim Wiederkommen mit dem alten Code landet man im neuen Raum
  b.s.disconnect(); await warte(150);
  await G.emit('gruppe:befehl', { code: r2.code, befehl: 'verschieben', nach: c1, spielerId: ba.spielerId }); await warte(100);
  const b2 = geraet(); await b2.bereit;
  const zur = await b2.emit('kind:beitreten', { code: r2.code, spielerId: ba.spielerId });
  t.pruefe(zur.ok && zur.code === c1, 'Wer offline verschoben wurde, kommt mit dem alten Code im neuen Raum an');

  t.abschnitt('Raum schließen');
  const s = await G.emit('gruppe:befehl', { code: r2.code, befehl: 'schliessen' }); await warte(200);
  t.pruefe(s.ok && G.gz.raeume.length === 1 && a.z.raum.code === c1, 'Geschlossener Raum: Leute wandern in den ersten Raum');
  const s2 = await G.emit('gruppe:befehl', { code: c1, befehl: 'schliessen' });
  t.pruefe(!s2.ok && G.gz.raeume.length === 1, 'Der letzte Raum bleibt offen');

  t.abschnitt('Aus der Einzelregie einen Raum dazunehmen');
  const ue = await L.emit('gruppe:oeffnen', { uebernehmen: { code, schluessel }, dazu: true });
  const U = geraet(); await U.bereit; await U.emit('gruppe:oeffnen', { schluessel: ue.schluessel, nurWieder: true }); await warte(200);
  t.pruefe(ue.ok && U.gz.raeume.length === 2 && U.gz.raeume[0].code === code, 'Einzelraum wird zur Übersicht mit zwei Räumen');
  t.pruefe(k[0].z.raum.code === code && k[0].z.raum.name === 'Fuchs', 'Die Leute im alten Raum bleiben drin');
  const ue2 = await L.emit('gruppe:oeffnen', { uebernehmen: { code, schluessel: 'falsch' }, dazu: true });
  t.pruefe(!ue2.ok, 'Ohne richtigen Schlüssel keine Übernahme');
};
