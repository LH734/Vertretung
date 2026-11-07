'use strict';
// Hilfen für die Tests: eigener Server auf freiem Port, simulierte Geräte, Prüfungen.

const { spawn } = require('child_process');
const path = require('path');
const net = require('net');
const { io } = require('socket.io-client');

const warte = (ms) => new Promise((r) => setTimeout(r, ms));

function freierPort() {
  return new Promise((r) => {
    const s = net.createServer();
    s.listen(0, () => { const p = s.address().port; s.close(() => r(p)); });
  });
}

// Startet server.js in einem eigenen Prozess und wartet, bis /healthz antwortet.
async function starteServer(umgebung) {
  const port = await freierPort();
  const kind = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], {
    env: { ...process.env, PORT: String(port), LEHRER_PASSWORT: '', ...umgebung },
    stdio: ['ignore', 'ignore', 'inherit'],
  });
  const url = `http://localhost:${port}`;
  for (let i = 0; i < 50; i++) {
    try { if ((await fetch(url + '/healthz')).ok) break; } catch (e) { /* noch nicht bereit */ }
    await warte(100);
  }
  return { url, stopp: () => kind.kill() };
}

function neueTests(name) {
  const t = { name, fehler: 0, anzahl: 0 };
  t.pruefe = (bedingung, text) => {
    t.anzahl++;
    if (!bedingung) t.fehler++;
    if (!bedingung || process.env.LAUT) console.log((bedingung ? '  ok   ' : '  FEHL ') + text);
  };
  t.abschnitt = (text) => { if (process.env.LAUT) console.log(text); };
  return t;
}

// Ein simuliertes Gerät (Handy, Regie, Bühne)
function geraet(url) {
  const s = io(url, { transports: ['websocket'], forceNew: true });
  const g = { s, z: null, gz: null, ereignisse: [] };
  s.on('zustand', (z) => { g.z = z; });
  s.on('gruppe:zustand', (z) => { g.gz = z; });
  s.onAny((ereignis, daten) => { if (ereignis !== 'zustand') g.ereignisse.push([ereignis, daten]); });
  g.emit = (e, d) => new Promise((r) => s.emit(e, d, r));
  g.bereit = new Promise((r) => (s.connected ? r() : s.once('connect', r)));
  g.spiel = () => (g.z ? g.z.spiel : null);
  g.act = (art, d) => g.emit('kind:spiel', { art, ...(d || {}) });
  return g;
}

// Regie mit Raum und n Mitspielenden
async function raum(url, n, namen) {
  const L = geraet(url);
  await L.bereit;
  const r = await L.emit('lehrer:erstellen', {});
  const k = [];
  for (let i = 0; i < n; i++) {
    const g = geraet(url);
    await g.bereit;
    g.a = await g.emit('kind:beitreten', { code: r.code, name: (namen && namen[i]) || 'K' + i });
    g.id = g.a.spielerId;
    g.name = (namen && namen[i]) || 'K' + i;
    k.push(g);
  }
  return { L, k, code: r.code, schluessel: r.schluessel };
}

module.exports = { warte, starteServer, neueTests, geraet, raum };
