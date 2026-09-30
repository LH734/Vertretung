'use strict';
// Startet für jede Testdatei einen eigenen Server und prüft alle Spiele.
// Aufruf: npm test        (LAUT=1 npm test zeigt jede einzelne Prüfung)
const { starteServer, neueTests } = require('./hilfen');

const DATEIEN = ['grundspiele', 'saboteur', 'party', 'abend', 'alle'];

(async () => {
  let fehler = 0;
  let anzahl = 0;
  const nur = process.argv[2];
  for (const name of DATEIEN.filter((d) => !nur || d === nur)) {
    const server = await starteServer();
    const t = neueTests(name);
    const start = Date.now();
    try {
      // Zeitlimit, damit ein hängender Test nicht alles blockiert
      await Promise.race([
        require('./' + name)(server.url, t),
        new Promise((_, nein) => setTimeout(() => nein(new Error('Zeitlimit von 3 Minuten überschritten')), 180000)),
      ]);
    } catch (e) {
      t.fehler++;
      console.log(`  FEHL ${name}: Abbruch mit ${e.stack}`);
    }
    server.stopp();
    fehler += t.fehler;
    anzahl += t.anzahl;
    console.log(`${t.fehler ? 'FEHLER' : 'ok    '} ${name}: ${t.anzahl - t.fehler} von ${t.anzahl} Prüfungen (${Math.round((Date.now() - start) / 1000)} s)`);
  }
  console.log(fehler ? `\n${fehler} von ${anzahl} Prüfungen fehlgeschlagen.` : `\nAlle ${anzahl} Prüfungen bestanden.`);
  process.exit(fehler ? 1 : 0);
})();
