'use strict';
// Spieleraum für Vertretungsstunden
// Ein Prozess, ein Port: Express liefert die Seiten aus, socket.io trägt das Spiel.
// Alle Räume leben nur im Arbeitsspeicher. Es wird nichts gespeichert und nichts protokolliert.

const path = require('path');
const fs = require('fs');
const http = require('http');
const crypto = require('crypto');
const express = require('express');
const { Server } = require('socket.io');

const { saeubere, erzeugeDrossel } = require('./spiele/werkzeuge');
const ZeichnenSpiel = require('./spiele/zeichnen');
const SlfSpiel = require('./spiele/slf');

const PORT = Number(process.env.PORT) || 3000;
// Passwort für den Lehrerbereich. Wird bei Render als Umgebungsvariable gesetzt, nie im Code.
const LEHRER_PASSWORT = String(process.env.LEHRER_PASSWORT || '');
const MAX_FEHLVERSUCHE = 5;
const SPERRE_MS = 60 * 1000;
const RAUM_LEBENSDAUER_MS = 2 * 60 * 60 * 1000;
const MAX_SPIELER = 40;
const NAME_MAX = 16;
const TEAMS = [
  { name: 'Mechanica', farbe: '#F5CB5E' },
  { name: 'Optica', farbe: '#3FB8AF' },
  { name: 'Thermodynamica', farbe: '#E94F4F' },
  { name: 'Electra', farbe: '#8B5CF6' },
];
const CODE_ZEICHEN = 'ABCDEFGHJKMNPRSTUVWXYZ'; // ohne I, L, O, Q: am Beamer leicht zu verwechseln

// ---------------------------------------------------------------------------
// Datendateien lesen. Schlüssel, die mit "_" beginnen, sind Kommentare.
// ---------------------------------------------------------------------------
function ohneKommentare(wert) {
  if (Array.isArray(wert)) return wert.map(ohneKommentare);
  if (wert && typeof wert === 'object') {
    const aus = {};
    for (const [k, v] of Object.entries(wert)) if (!k.startsWith('_')) aus[k] = ohneKommentare(v);
    return aus;
  }
  return wert;
}

function ladeJson(datei) {
  const voll = path.join(__dirname, 'daten', datei);
  try {
    return ohneKommentare(JSON.parse(fs.readFileSync(voll, 'utf8')));
  } catch (fehler) {
    console.error(`Die Datei daten/${datei} konnte nicht gelesen werden: ${fehler.message}`);
    console.error('Tipp: Fehlt ein Komma oder ein Anführungszeichen? Prüfe die Datei z. B. auf jsonlint.com.');
    process.exit(1);
  }
}

function ladeDaten() {
  const w = ladeJson('woerter.json');
  const k = ladeJson('kategorien.json');
  const begriffsListen = {};
  for (const [name, eintrag] of Object.entries(w.listen || {})) {
    const begriffe = [...new Set((eintrag.begriffe || []).map((b) => saeubere(b, 40)).filter(Boolean))];
    if (begriffe.length) begriffsListen[name] = begriffe;
  }
  const kategorienListen = {};
  for (const [name, eintrag] of Object.entries(k.listen || {})) {
    const kategorien = [...new Set((eintrag.kategorien || []).map((b) => saeubere(b, 40)).filter(Boolean))];
    if (kategorien.length) kategorienListen[name] = kategorien;
  }
  const alleKategorien = [...new Set(Object.values(kategorienListen).flat())];
  const standard = (k.standardauswahl || []).filter((x) => alleKategorien.includes(x)).slice(0, 8);
  return {
    begriffsListen,
    wortfilter: ((w.wortfilter && w.wortfilter.woerter) || []).map((x) => String(x).toLowerCase()).filter(Boolean),
    kategorienListen,
    standardKategorien: standard.length >= 5 ? standard : alleKategorien.slice(0, 6),
  };
}

const DATEN = ladeDaten();

// ---------------------------------------------------------------------------
// Webserver
// ---------------------------------------------------------------------------
const app = express();
app.disable('x-powered-by');
const oeffentlich = path.join(__dirname, 'public');

app.get('/healthz', (req, res) => res.type('text/plain').send('ok'));
app.get('/lehrer', (req, res) => res.sendFile(path.join(oeffentlich, 'lehrer.html')));
app.get('/buehne', (req, res) => res.sendFile(path.join(oeffentlich, 'lehrer.html')));
app.get('/gruppen', (req, res) => res.sendFile(path.join(oeffentlich, 'gruppen.html')));
app.use(express.static(oeffentlich, { maxAge: 0, etag: true }));
app.use((req, res) => res.status(404).type('text/plain').send('Diese Seite gibt es nicht.'));

const server = http.createServer(app);
const io = new Server(server, {
  maxHttpBufferSize: 64 * 1024,
  pingInterval: 20000,
  pingTimeout: 25000,
  // Wiederaufnahme nach kurzen Aussetzern (z. B. WLAN-Wechsel), zusätzlich zur eigenen Spieler-ID.
  connectionStateRecovery: { maxDisconnectionDuration: 60 * 1000, skipMiddlewares: true },
});

// ---------------------------------------------------------------------------
// Räume
// ---------------------------------------------------------------------------
const raeume = new Map();

function neuerCode() {
  for (let versuch = 0; versuch < 1000; versuch++) {
    let code = '';
    for (let i = 0; i < 4; i++) code += CODE_ZEICHEN[crypto.randomInt(CODE_ZEICHEN.length)];
    if (!raeume.has(code)) return code;
  }
  throw new Error('Kein freier Raumcode');
}

// Vergleich in konstanter Zeit, unabhängig von der Länge der Eingabe
function gleich(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

// Fehlversuche beim Passwort je Adresse, nur im Arbeitsspeicher
const fehlversuche = new Map(); // Adresse -> { anzahl, gesperrtBis }
function adresseVon(sock) {
  const weitergeleitet = String(sock.handshake.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return weitergeleitet || sock.handshake.address || 'unbekannt';
}

// Gibt null zurück, wenn das Passwort passt (oder keines gesetzt ist), sonst die Antwort für den Browser.
function pruefePasswort(sock, eingabe) {
  if (!LEHRER_PASSWORT) return null;
  const adresse = adresseVon(sock);
  const eintrag = fehlversuche.get(adresse) || { anzahl: 0, gesperrtBis: 0, zuletzt: 0 };
  if (eintrag.gesperrtBis > Date.now()) {
    const sekunden = Math.ceil((eintrag.gesperrtBis - Date.now()) / 1000);
    return { ok: false, passwortNoetig: true, fehler: `Zu viele Versuche. Warte ${sekunden} Sekunden.` };
  }
  const passwort = typeof eingabe === 'string' ? eingabe.slice(0, 200) : '';
  if (!passwort) return { ok: false, passwortNoetig: true, fehler: null };
  if (!gleich(passwort, LEHRER_PASSWORT)) {
    eintrag.anzahl++;
    eintrag.zuletzt = Date.now();
    if (eintrag.anzahl >= MAX_FEHLVERSUCHE) {
      eintrag.anzahl = 0;
      eintrag.gesperrtBis = Date.now() + SPERRE_MS;
    }
    fehlversuche.set(adresse, eintrag);
    return { ok: false, passwortNoetig: true, fehler: 'Das Passwort stimmt nicht.' };
  }
  fehlversuche.delete(adresse);
  return null;
}

function neueId() {
  return crypto.randomBytes(12).toString('hex');
}

function erzeugeRaum() {
  const code = neuerCode();
  const raum = {
    code,
    lehrerSchluessel: neueId(),
    letzteAktivitaet: Date.now(),
    spieler: new Map(), // id -> Spieler
    entfernt: new Set(), // Spieler-IDs, die nicht zurückkehren dürfen
    verbindungen: new Map(), // socket.id -> socket
    pause: false,
    pauseSeit: 0,
    chat: [],
    chatZaehler: 0,
    spiel: null, // laufende Spielinstanz
    spielArt: null,
    einstellungen: erzeugeRaum.vorlage(),
    sendePlan: null,
    gruppe: null, // gehört der Raum zu einem Gruppenmodus?
    gruppenName: '',
  };
  raeume.set(code, raum);
  return raum;
}

// ---------------------------------------------------------------------------
// Gruppenmodus: eine Regie steuert mehrere Räume gleichzeitig
// ---------------------------------------------------------------------------
const gruppen = new Map(); // schluessel -> Gruppe
const MAX_GRUPPEN = 10;

function erzeugeGruppe(anzahl) {
  const gruppe = {
    schluessel: neueId(),
    codes: [],
    verbindungen: new Map(),
    einstellungen: erzeugeRaum.vorlage(),
    letzteAktivitaet: Date.now(),
    sendePlan: null,
  };
  gruppen.set(gruppe.schluessel, gruppe);
  for (let i = 0; i < anzahl; i++) raumZuGruppe(gruppe);
  return gruppe;
}

function raumZuGruppe(gruppe) {
  const raum = erzeugeRaum();
  raum.gruppe = gruppe;
  raum.gruppenName = 'Gruppe ' + (gruppe.codes.length + 1);
  raum.einstellungen = JSON.parse(JSON.stringify(gruppe.einstellungen));
  gruppe.codes.push(raum.code);
  return raum;
}

function gruppenRaeume(gruppe) {
  return gruppe.codes.map((c) => raeume.get(c)).filter((r) => r && r.gruppe === gruppe);
}

function planeGruppe(gruppe) {
  if (gruppe.sendePlan) return;
  gruppe.sendePlan = setImmediate(() => {
    gruppe.sendePlan = null;
    const zustand = {
      serverZeit: Date.now(),
      einstellungen: gruppe.einstellungen,
      listen: {
        begriffe: Object.fromEntries(Object.entries(DATEN.begriffsListen).map(([n, l]) => [n, l.length])),
        kategorien: DATEN.kategorienListen,
      },
      raeume: gruppenRaeume(gruppe).map((r) => ({
        code: r.code,
        name: r.gruppenName,
        schluessel: r.lehrerSchluessel,
        pause: r.pause,
        spielArt: r.spielArt,
        spieler: spielerListe(r)
          .map((p) => ({ id: p.id, name: p.name, punkte: p.punkte, online: !!p.socketId }))
          .sort((a, b) => b.punkte - a.punkte || a.name.localeCompare(b.name, 'de')),
        spiel: r.spiel ? r.spiel.sicht('buehne', null) : null,
      })),
    };
    for (const sock of gruppe.verbindungen.values()) sock.emit('gruppe:zustand', zustand);
  });
}

erzeugeRaum.vorlage = () => ({
  spiel: 'zeichnen',
  wertung: 'einzel', // 'einzel' | 'teams'
  teamWahl: 'lehrkraft', // 'lehrkraft' | 'selbst'
  zeichnen: { runden: 10, sekunden: 80, liste: Object.keys(DATEN.begriffsListen)[0] || 'alle', eigene: '' },
  slf: { runden: 3, sekunden: 120, modus: 'timer', pruefung: 'kinder', pruefSekunden: 90, kategorien: DATEN.standardKategorien.slice(), eigene: '' },
});

function aktiv(raum) {
  raum.letzteAktivitaet = Date.now();
}

function spielerListe(raum) {
  return [...raum.spieler.values()];
}

function eindeutigerName(raum, wunsch, ausserId) {
  const vergeben = new Set(spielerListe(raum).filter((s) => s.id !== ausserId).map((s) => s.name.toLowerCase()));
  if (!vergeben.has(wunsch.toLowerCase())) return wunsch;
  for (let n = 2; n < 100; n++) {
    const zusatz = ' ' + n;
    const kandidat = Array.from(wunsch).slice(0, NAME_MAX - zusatz.length).join('').trim() + zusatz;
    if (!vergeben.has(kandidat.toLowerCase())) return kandidat;
  }
  return wunsch;
}

// Hilfsobjekt, über das die Spiele mit dem Raum sprechen.
function erzeugeHub(raum) {
  return {
    daten: DATEN,
    teams: TEAMS,
    raum,
    spieler: () => spielerListe(raum),
    holeSpieler: (id) => raum.spieler.get(id),
    sende(spielerId, ereignis, daten) {
      const s = raum.spieler.get(spielerId);
      if (s && s.socketId) {
        const sock = raum.verbindungen.get(s.socketId);
        if (sock) sock.emit(ereignis, daten);
      }
    },
    sendeAlle(ereignis, daten, ausserSpielerId) {
      for (const sock of raum.verbindungen.values()) {
        if (ausserSpielerId && sock.data.spielerId === ausserSpielerId) continue;
        sock.emit(ereignis, daten);
      }
    },
    chat(eintrag) { sendeChat(raum, eintrag); },
    aktualisiere() { planeZustand(raum); },
  };
}

// ---------------------------------------------------------------------------
// Chat: Einträge mit optionaler Empfängerliste ("nur"). Die Bühne sieht nur öffentliche.
// ---------------------------------------------------------------------------
function filtereWoerter(text) {
  let aus = text;
  for (const wort of DATEN.wortfilter) {
    const muster = new RegExp('(?<!\\p{L})' + wort.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\p{L}*', 'giu');
    aus = aus.replace(muster, (treffer) => '*'.repeat(Math.min(Array.from(treffer).length, 8)));
  }
  return aus;
}

function darfSehen(eintrag, sock) {
  if (!eintrag.nur) return true;
  return sock.data.rolle === 'kind' && eintrag.nur.includes(sock.data.spielerId);
}

function sendeChat(raum, eintrag) {
  const voll = {
    id: ++raum.chatZaehler,
    art: eintrag.art || 'rate', // rate | system | richtig | nah | intern
    name: eintrag.name || '',
    team: eintrag.team || null,
    text: eintrag.text || '',
    nur: eintrag.nur || null,
  };
  if (voll.art !== 'nah') {
    raum.chat.push(voll);
    if (raum.chat.length > 80) raum.chat.shift();
  }
  const { nur, ...ohneNur } = voll;
  for (const sock of raum.verbindungen.values()) if (darfSehen(voll, sock)) sock.emit('chat', ohneNur);
}

function chatFuer(raum, sock) {
  return raum.chat.filter((e) => darfSehen(e, sock)).slice(-40).map(({ nur, ...rest }) => rest);
}

// ---------------------------------------------------------------------------
// Zustand: Jede Verbindung bekommt ihre eigene Sicht. Mehrere Änderungen
// im selben Durchlauf werden zu einer Sendung zusammengefasst.
// ---------------------------------------------------------------------------
function planeZustand(raum) {
  if (raum.gruppe) planeGruppe(raum.gruppe);
  if (raum.sendePlan) return;
  raum.sendePlan = setImmediate(() => {
    raum.sendePlan = null;
    for (const sock of raum.verbindungen.values()) sendeZustand(raum, sock);
  });
}

function teamPunkte(raum) {
  return TEAMS.map((t, i) => ({
    index: i,
    name: t.name,
    farbe: t.farbe,
    punkte: spielerListe(raum).filter((s) => s.team === i).reduce((summe, s) => summe + s.punkte, 0),
    mitglieder: spielerListe(raum).filter((s) => s.team === i).length,
  }));
}

function sendeZustand(raum, sock) {
  const rolle = sock.data.rolle;
  const e = raum.einstellungen;
  const zustand = {
    serverZeit: Date.now(),
    raum: {
      code: raum.code,
      pause: raum.pause,
      wertung: e.wertung,
      teamWahl: e.teamWahl,
      spielArt: raum.spielArt,
    },
    spieler: spielerListe(raum)
      .map((s) => ({ id: s.id, name: s.name, punkte: s.punkte, team: s.team, online: !!s.socketId, stumm: s.stumm }))
      .sort((a, b) => b.punkte - a.punkte || a.name.localeCompare(b.name, 'de')),
    teams: e.wertung === 'teams' ? teamPunkte(raum) : null,
    spiel: raum.spiel ? raum.spiel.sicht(rolle, sock.data.spielerId) : null,
  };
  if (rolle === 'kind') {
    const ich = raum.spieler.get(sock.data.spielerId);
    zustand.ich = ich ? { id: ich.id, name: ich.name, punkte: ich.punkte, team: ich.team, stumm: ich.stumm } : null;
  }
  if (rolle === 'lehrer') {
    zustand.einstellungen = e;
    zustand.listen = {
      begriffe: Object.fromEntries(Object.entries(DATEN.begriffsListen).map(([n, l]) => [n, l.length])),
      kategorien: DATEN.kategorienListen,
    };
  }
  sock.emit('zustand', zustand);
}

// ---------------------------------------------------------------------------
// Spielsteuerung
// ---------------------------------------------------------------------------
function starteSpiel(raum) {
  const e = raum.einstellungen;
  const online = spielerListe(raum).filter((s) => s.socketId);
  if (e.spiel === 'zeichnen' && online.length < 2) return 'Für Zeichnen und Raten braucht es mindestens zwei Kinder im Raum.';
  if (e.spiel === 'slf' && online.length < 1) return 'Es ist noch kein Kind im Raum.';
  if (raum.spiel) raum.spiel.beende();

  for (const s of raum.spieler.values()) s.punkte = 0;
  if (e.wertung === 'teams') verteileOhneTeam(raum);
  raum.chat = [];
  raum.pause = false;

  const hub = erzeugeHub(raum);
  if (e.spiel === 'zeichnen') {
    raum.spiel = new ZeichnenSpiel(hub, e.zeichnen, { filter: filtereWoerter });
  } else {
    const fehler = SlfSpiel.pruefeEinstellungen(e.slf);
    if (fehler) return fehler;
    raum.spiel = new SlfSpiel(hub, e.slf);
  }
  raum.spielArt = e.spiel;
  hub.sendeAlle('chat:leeren');
  raum.spiel.starte();
  planeZustand(raum);
  return null;
}

function beendeSpiel(raum) {
  if (raum.spiel) raum.spiel.beende();
  raum.spiel = null;
  raum.spielArt = null;
  raum.pause = false;
  raum.chat = [];
  for (const sock of raum.verbindungen.values()) sock.emit('chat:leeren');
  planeZustand(raum);
}

function verteileOhneTeam(raum) {
  const groessen = TEAMS.map((_, i) => spielerListe(raum).filter((s) => s.team === i).length);
  for (const s of raum.spieler.values()) {
    if (s.team !== null && s.team >= 0 && s.team < TEAMS.length) continue;
    const kleinstes = groessen.indexOf(Math.min(...groessen));
    s.team = kleinstes;
    groessen[kleinstes]++;
  }
}

function setzePause(raum, an) {
  if (an === raum.pause) return;
  if (an) {
    raum.pause = true;
    raum.pauseSeit = Date.now();
  } else {
    raum.pause = false;
    if (raum.spiel) raum.spiel.verschiebe(Date.now() - raum.pauseSeit);
  }
  planeZustand(raum);
}

function entferneSpieler(raum, id) {
  const s = raum.spieler.get(id);
  if (!s) return;
  raum.entfernt.add(id);
  raum.spieler.delete(id);
  if (s.socketId) {
    const sock = raum.verbindungen.get(s.socketId);
    if (sock) {
      sock.emit('entfernt');
      sock.leave(raum.code);
      raum.verbindungen.delete(sock.id);
      sock.data = {};
    }
  }
  if (raum.spiel) raum.spiel.spielerWeg(id, true);
  planeZustand(raum);
}

// ---------------------------------------------------------------------------
// Verbindungen
// ---------------------------------------------------------------------------
function zahl(wert, min, max, standard) {
  const n = Math.round(Number(wert));
  if (!Number.isFinite(n)) return standard;
  return Math.max(min, Math.min(max, n));
}

function uebernimmEinstellungen(raum, d) {
  if (!d || typeof d !== 'object') return;
  const e = raum.einstellungen;
  if (d.spiel === 'zeichnen' || d.spiel === 'slf') e.spiel = d.spiel;
  if (d.wertung === 'einzel' || d.wertung === 'teams') {
    e.wertung = d.wertung;
    if (d.wertung === 'teams' && raum.spiel) verteileOhneTeam(raum);
  }
  if (d.teamWahl === 'lehrkraft' || d.teamWahl === 'selbst') e.teamWahl = d.teamWahl;
  if (d.zeichnen && typeof d.zeichnen === 'object') {
    const z = d.zeichnen;
    if (z.runden !== undefined) e.zeichnen.runden = zahl(z.runden, 1, 60, 10);
    if (z.sekunden !== undefined) e.zeichnen.sekunden = zahl(z.sekunden, 30, 240, 80);
    if (typeof z.liste === 'string' && (z.liste === 'alle' || z.liste === 'eigene' || DATEN.begriffsListen[z.liste])) e.zeichnen.liste = z.liste;
    if (typeof z.eigene === 'string') e.zeichnen.eigene = z.eigene.slice(0, 6000);
  }
  if (d.slf && typeof d.slf === 'object') {
    const s = d.slf;
    if (s.runden !== undefined) e.slf.runden = zahl(s.runden, 1, 20, 3);
    if (s.sekunden !== undefined) e.slf.sekunden = zahl(s.sekunden, 30, 600, 120);
    if (s.modus === 'timer' || s.modus === 'stopp') e.slf.modus = s.modus;
    if (s.pruefung === 'kinder' || s.pruefung === 'lehrkraft') e.slf.pruefung = s.pruefung;
    if (s.pruefSekunden !== undefined) e.slf.pruefSekunden = zahl(s.pruefSekunden, 30, 300, 90);
    if (Array.isArray(s.kategorien)) e.slf.kategorien = [...new Set(s.kategorien.map((x) => saeubere(x, 40)).filter(Boolean))].slice(0, 12);
    if (typeof s.eigene === 'string') e.slf.eigene = s.eigene.slice(0, 2000);
  }
}

function verbindeMitRaum(raum, sock, rolle, spielerId) {
  sock.join(raum.code);
  sock.data = { code: raum.code, rolle, spielerId: spielerId || null };
  raum.verbindungen.set(sock.id, sock);
}

io.on('connection', (sock) => {
  sock.data = sock.data && sock.data.code ? sock.data : {};
  const rateDrossel = erzeugeDrossel(3, 3);
  const zeichenDrossel = erzeugeDrossel(60, 90);
  const allgemeineDrossel = erzeugeDrossel(15, 30);

  // Nach einer Verbindungswiederherstellung durch socket.io ist sock.data noch gesetzt.
  if (sock.recovered && sock.data.code) {
    const raum = raeume.get(sock.data.code);
    if (raum) {
      raum.verbindungen.set(sock.id, sock);
      if (sock.data.rolle === 'kind') {
        const s = raum.spieler.get(sock.data.spielerId);
        if (s) { s.socketId = sock.id; if (raum.spiel) raum.spiel.spielerDa(s.id); }
      }
      planeZustand(raum);
    }
  }

  const holeRaum = () => (sock.data.code ? raeume.get(sock.data.code) : null);

  function mitLehrer(handler) {
    return (daten, antwort) => {
      const raum = holeRaum();
      if (!raum || sock.data.rolle !== 'lehrer') return;
      if (!allgemeineDrossel()) return;
      aktiv(raum);
      try {
        const fehler = handler(raum, daten || {});
        if (typeof antwort === 'function') antwort({ ok: !fehler, fehler: fehler || null });
      } catch (err) {
        if (typeof antwort === 'function') antwort({ ok: false, fehler: 'Das hat nicht geklappt.' });
      }
      planeZustand(raum);
    };
  }

  function mitKind(handler, drossel) {
    return (daten, antwort) => {
      const raum = holeRaum();
      if (!raum || sock.data.rolle !== 'kind') return;
      const spieler = raum.spieler.get(sock.data.spielerId);
      if (!spieler) return;
      if (drossel && !drossel()) return;
      aktiv(raum);
      if (raum.pause) { if (typeof antwort === 'function') antwort({ ok: false, fehler: 'Pause' }); return; }
      try {
        handler(raum, spieler, daten || {}, antwort);
      } catch (err) { /* fehlerhafte Eingaben still ignorieren */ }
    };
  }

  // ----- Lehrkraft -----
  sock.on('lehrer:erstellen', (daten, antwort) => {
    if (typeof antwort !== 'function') return;
    if (!allgemeineDrossel()) return;
    // Bestehenden Raum wieder übernehmen, falls der Tab neu geladen wurde.
    if (daten && typeof daten.code === 'string' && typeof daten.schluessel === 'string') {
      const alt = raeume.get(daten.code.toUpperCase());
      if (alt && gleich(alt.lehrerSchluessel, daten.schluessel.slice(0, 64))) {
        verbindeMitRaum(alt, sock, 'lehrer');
        aktiv(alt);
        antwort({ ok: true, code: alt.code, schluessel: alt.lehrerSchluessel });
        sock.emit('chat:alle', chatFuer(alt, sock));
        if (alt.spiel) alt.spiel.spielerDa(null, sock);
        planeZustand(alt);
        return;
      }
    }
    // Neuer Raum: nur mit Passwort, falls eines gesetzt ist
    const abgewiesen = pruefePasswort(sock, daten && daten.passwort);
    if (abgewiesen) return antwort(abgewiesen);
    const raum = erzeugeRaum();
    verbindeMitRaum(raum, sock, 'lehrer');
    antwort({ ok: true, code: raum.code, schluessel: raum.lehrerSchluessel });
    planeZustand(raum);
  });

  sock.on('lehrer:passwortNoetig', (daten, antwort) => {
    if (typeof antwort === 'function') antwort({ noetig: !!LEHRER_PASSWORT });
  });

  // ----- Gruppenmodus -----
  sock.on('gruppe:oeffnen', (daten, antwort) => {
    if (typeof antwort !== 'function') return;
    if (!allgemeineDrossel()) return;
    const d = daten || {};
    let gruppe = typeof d.schluessel === 'string' ? gruppen.get(d.schluessel.slice(0, 64)) : null;
    if (gruppe && !gruppenRaeume(gruppe).length) gruppe = null;
    if (!gruppe && d.nurWieder) return antwort({ ok: false, abgelaufen: true, fehler: 'Die Gruppen von vorhin sind nicht mehr offen.' });
    if (!gruppe) {
      const abgewiesen = pruefePasswort(sock, d.passwort);
      if (abgewiesen) return antwort(abgewiesen);
      gruppe = erzeugeGruppe(zahl(d.anzahl, 2, MAX_GRUPPEN, 4));
    }
    sock.data = { rolle: 'gruppe', gruppe: gruppe.schluessel };
    gruppe.verbindungen.set(sock.id, sock);
    gruppe.letzteAktivitaet = Date.now();
    antwort({ ok: true, schluessel: gruppe.schluessel });
    planeGruppe(gruppe);
  });

  sock.on('gruppe:befehl', (d, antwort) => {
    const gruppe = sock.data.rolle === 'gruppe' ? gruppen.get(sock.data.gruppe) : null;
    const antworte = (x) => { if (typeof antwort === 'function') antwort(x); };
    if (!gruppe || !d || typeof d !== 'object') return antworte({ ok: false, fehler: 'Die Gruppenregie ist nicht mehr verbunden.' });
    if (!allgemeineDrossel()) return antworte({ ok: false, fehler: 'Einen Moment bitte.' });
    gruppe.letzteAktivitaet = Date.now();
    const alle = gruppenRaeume(gruppe);
    const ziele = d.code === 'alle' ? alle : alle.filter((r) => r.code === d.code);
    const fehler = [];
    try {
      if (d.befehl === 'einstellungen') {
        uebernimmEinstellungen({ einstellungen: gruppe.einstellungen, spiel: null }, d.daten);
        gruppe.einstellungen.wertung = 'einzel';
        for (const r of alle) { uebernimmEinstellungen(r, d.daten); r.einstellungen.wertung = 'einzel'; }
      } else if (d.befehl === 'start') {
        uebernimmEinstellungen({ einstellungen: gruppe.einstellungen, spiel: null }, d.daten);
        for (const r of ziele) {
          uebernimmEinstellungen(r, d.daten);
          r.einstellungen.wertung = 'einzel';
          const f = starteSpiel(r);
          if (f) fehler.push(`${r.gruppenName}: ${f}`);
        }
      } else if (d.befehl === 'pause') {
        for (const r of ziele) setzePause(r, !!d.an);
      } else if (d.befehl === 'ueberspringen') {
        for (const r of ziele) if (r.spiel) r.spiel.ueberspringe();
      } else if (d.befehl === 'beenden') {
        for (const r of ziele) beendeSpiel(r);
      } else if (d.befehl === 'hinzufuegen') {
        if (alle.length >= MAX_GRUPPEN) fehler.push(`Mehr als ${MAX_GRUPPEN} Gruppen gehen nicht.`);
        else raumZuGruppe(gruppe);
      }
    } catch (err) {
      fehler.push('Das hat nicht geklappt.');
    }
    for (const r of alle) aktiv(r);
    planeGruppe(gruppe);
    antworte({ ok: fehler.length === 0, fehler: fehler.join('\n') || null });
  });

  sock.on('buehne:beitreten', (daten, antwort) => {
    if (typeof antwort !== 'function') return;
    if (!allgemeineDrossel()) return;
    const code = saeubere(daten && daten.code, 4).toUpperCase();
    const raum = raeume.get(code);
    if (!raum) return antwort({ ok: false, fehler: 'Diesen Raum gibt es nicht.' });
    verbindeMitRaum(raum, sock, 'buehne');
    antwort({ ok: true, code: raum.code });
    sock.emit('chat:alle', chatFuer(raum, sock));
    if (raum.spiel) raum.spiel.spielerDa(null, sock);
    planeZustand(raum);
  });

  sock.on('lehrer:einstellungen', mitLehrer((raum, d) => { uebernimmEinstellungen(raum, d); }));
  sock.on('lehrer:start', mitLehrer((raum, d) => { uebernimmEinstellungen(raum, d); return starteSpiel(raum); }));
  sock.on('lehrer:ueberspringen', mitLehrer((raum) => { if (raum.spiel) raum.spiel.ueberspringe(); }));
  sock.on('lehrer:beenden', mitLehrer((raum) => { beendeSpiel(raum); }));
  sock.on('lehrer:pause', mitLehrer((raum, d) => { setzePause(raum, !!d.an); }));
  sock.on('lehrer:bildLoeschen', mitLehrer((raum) => { if (raum.spiel && raum.spiel.bildLoeschen) raum.spiel.bildLoeschen(); }));
  sock.on('lehrer:chatLeeren', mitLehrer((raum) => {
    raum.chat = [];
    for (const s of raum.verbindungen.values()) s.emit('chat:leeren');
  }));
  sock.on('lehrer:spiel', mitLehrer((raum, d) => {
    if (raum.spiel && raum.spiel.lehrerEreignis) return raum.spiel.lehrerEreignis(d.art, d);
  }));
  sock.on('lehrer:spieler', mitLehrer((raum, d) => {
    const s = raum.spieler.get(d.id);
    if (!s) return 'Dieses Kind ist nicht mehr im Raum.';
    if (d.aktion === 'umbenennen') {
      const name = saeubere(d.name, NAME_MAX);
      if (!name) return 'Der Name ist leer.';
      s.name = eindeutigerName(raum, name, s.id);
    } else if (d.aktion === 'stumm') {
      s.stumm = !s.stumm;
    } else if (d.aktion === 'entfernen') {
      entferneSpieler(raum, s.id);
    } else if (d.aktion === 'team') {
      const t = Number(d.team);
      s.team = Number.isInteger(t) && t >= 0 && t < TEAMS.length ? t : null;
    }
    return null;
  }));

  // ----- Kinder -----
  sock.on('kind:beitreten', (daten, antwort) => {
    if (typeof antwort !== 'function') return;
    if (!allgemeineDrossel()) return antwort({ ok: false, fehler: 'Einen Moment bitte.' });
    const d = daten || {};
    const code = saeubere(d.code, 4).toUpperCase();
    const raum = raeume.get(code);
    if (!raum) {
      const fehler = d.spielerId
        ? 'Dieser Raum ist nicht mehr offen. Tritt mit dem Code von der Tafel neu bei.'
        : 'Diesen Code gibt es nicht. Schau noch einmal an die Tafel.';
      return antwort({ ok: false, fehler, raumWeg: true });
    }

    // Wiederkommen mit gespeicherter Spieler-ID
    if (typeof d.spielerId === 'string' && d.spielerId) {
      if (raum.entfernt.has(d.spielerId)) return antwort({ ok: false, fehler: 'Du wurdest aus dem Raum genommen.', raumWeg: true });
      const s = raum.spieler.get(d.spielerId);
      if (s) {
        if (s.socketId && s.socketId !== sock.id) {
          const alt = raum.verbindungen.get(s.socketId);
          if (alt) { alt.emit('anderswo'); raum.verbindungen.delete(alt.id); alt.data = {}; alt.leave(raum.code); }
        }
        verbindeMitRaum(raum, sock, 'kind', s.id);
        s.socketId = sock.id;
        aktiv(raum);
        antwort({ ok: true, code: raum.code, spielerId: s.id });
        sock.emit('chat:alle', chatFuer(raum, sock));
        if (raum.spiel) raum.spiel.spielerDa(s.id, sock);
        planeZustand(raum);
        return;
      }
      if (!d.name) return antwort({ ok: false, fehler: 'Dein Platz ist nicht mehr da. Tritt bitte neu bei.', neuBeitreten: true });
    }

    const name = saeubere(d.name, NAME_MAX);
    if (!name) return antwort({ ok: false, fehler: 'Gib bitte einen Spitznamen ein.' });
    if (raum.spieler.size >= MAX_SPIELER) return antwort({ ok: false, fehler: 'Der Raum ist voll (40 Kinder).' });

    const spieler = {
      id: neueId(),
      name: eindeutigerName(raum, name),
      punkte: 0,
      team: null,
      stumm: false,
      socketId: sock.id,
      beigetreten: Date.now(),
      wegSeit: 0,
    };
    if (raum.einstellungen.wertung === 'teams' && raum.spiel) {
      raum.spieler.set(spieler.id, spieler);
      verteileOhneTeam(raum);
    } else {
      raum.spieler.set(spieler.id, spieler);
    }
    verbindeMitRaum(raum, sock, 'kind', spieler.id);
    aktiv(raum);
    antwort({ ok: true, code: raum.code, spielerId: spieler.id });
    sock.emit('chat:alle', chatFuer(raum, sock));
    if (raum.spiel) raum.spiel.spielerDa(spieler.id, sock);
    planeZustand(raum);
  });

  sock.on('kind:team', mitKind((raum, spieler, d) => {
    if (raum.einstellungen.wertung !== 'teams' || raum.einstellungen.teamWahl !== 'selbst') return;
    const t = Number(d.team);
    if (Number.isInteger(t) && t >= 0 && t < TEAMS.length) { spieler.team = t; planeZustand(raum); }
  }, allgemeineDrossel));

  sock.on('kind:chat', mitKind((raum, spieler, d) => {
    const text = filtereWoerter(saeubere(d.text, 100));
    if (!text) return;
    if (raum.spiel && raum.spiel.nachricht) raum.spiel.nachricht(spieler, text);
  }, rateDrossel));

  sock.on('kind:zeichnen', mitKind((raum, spieler, d) => {
    if (raum.spiel && raum.spiel.zeichenEreignis) raum.spiel.zeichenEreignis(spieler, d);
  }, zeichenDrossel));

  sock.on('kind:spiel', mitKind((raum, spieler, d, antwort) => {
    if (raum.spiel && raum.spiel.kindEreignis) {
      const ergebnis = raum.spiel.kindEreignis(spieler, d.art, d);
      if (typeof antwort === 'function') antwort(ergebnis || { ok: true });
    }
  }, allgemeineDrossel));

  sock.on('kind:verlassen', () => {
    const raum = holeRaum();
    if (!raum || sock.data.rolle !== 'kind') return;
    entferneSpieler(raum, sock.data.spielerId);
    raum.entfernt.delete(sock.data.spielerId);
  });

  sock.on('disconnect', () => {
    if (sock.data.rolle === 'gruppe') {
      const g = gruppen.get(sock.data.gruppe);
      if (g) g.verbindungen.delete(sock.id);
      return;
    }
    const raum = holeRaum();
    if (!raum) return;
    raum.verbindungen.delete(sock.id);
    if (sock.data.rolle === 'kind') {
      const s = raum.spieler.get(sock.data.spielerId);
      if (s && s.socketId === sock.id) {
        s.socketId = null;
        s.wegSeit = Date.now();
        if (raum.spiel) raum.spiel.spielerWeg(s.id, false);
      }
    }
    planeZustand(raum);
  });
});

// ---------------------------------------------------------------------------
// Taktgeber: Spielzeiten prüfen, alte Räume aufräumen
// ---------------------------------------------------------------------------
setInterval(() => {
  const jetzt = Date.now();
  for (const raum of raeume.values()) {
    if (raum.spiel && !raum.pause) raum.spiel.tick(jetzt);
  }
}, 200);

setInterval(() => {
  const jetzt = Date.now();
  for (const [adresse, eintrag] of fehlversuche) {
    if (eintrag.gesperrtBis < jetzt && eintrag.zuletzt < jetzt - 10 * 60 * 1000) fehlversuche.delete(adresse);
  }
  for (const [schluessel, g] of gruppen) {
    if (!gruppenRaeume(g).length || jetzt - g.letzteAktivitaet > RAUM_LEBENSDAUER_MS * 2) {
      for (const sock of g.verbindungen.values()) sock.emit('raumWeg');
      gruppen.delete(schluessel);
    }
  }
  for (const [code, raum] of raeume) {
    if (jetzt - raum.letzteAktivitaet > RAUM_LEBENSDAUER_MS) {
      if (raum.spiel) raum.spiel.beende();
      for (const sock of raum.verbindungen.values()) { sock.emit('raumWeg'); sock.data = {}; sock.leave(code); }
      raeume.delete(code);
      continue;
    }
    // Kinder, die seit 20 Minuten weg sind und keine Punkte haben, geben ihren Platz frei.
    for (const s of raum.spieler.values()) {
      if (!s.socketId && s.wegSeit && jetzt - s.wegSeit > 20 * 60 * 1000 && s.punkte === 0 && !raum.spiel) {
        raum.spieler.delete(s.id);
        planeZustand(raum);
      }
    }
  }
}, 60 * 1000);

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Spieleraum läuft auf Port ${PORT}`);
  if (!LEHRER_PASSWORT) console.log('Hinweis: Kein LEHRER_PASSWORT gesetzt, der Lehrerbereich ist offen.');
});

