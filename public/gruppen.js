/* Gruppenregie: mehrere Räume gleichzeitig steuern */
(function () {
  'use strict';
  const G = window.Gemeinsam;
  const { $, esc, setzeHtml } = G;

  const SPEICHER = 'spieleraum-gruppe';
  const socket = G.verbinde();
  let zustand = null;
  const karten = new Map(); // code -> { el, timer }

  // Render-Dienst wach halten, solange der Tab offen ist.
  setInterval(() => { fetch('/healthz', { cache: 'no-store' }).catch(() => {}); }, 10 * 60 * 1000);

  function leseSitzung() {
    try { return JSON.parse(sessionStorage.getItem(SPEICHER) || 'null'); } catch (e) { return null; }
  }
  function schreibeSitzung(s) {
    try { sessionStorage.setItem(SPEICHER, JSON.stringify(s)); } catch (e) { /* ohne Speicher */ }
  }

  // ------------------------------------------------------------
  // Anmeldung
  // ------------------------------------------------------------
  function zeigeAnmeldung(fehler) {
    zustand = null;
    $('#pult').classList.add('nur-anmeldung');
    $('#g-anmelden').hidden = false;
    $('#g-uebersicht').hidden = true;
    $('#g-fehler').textContent = fehler || '';
    socket.emit('lehrer:passwortNoetig', {}, (a) => {
      $('#g-passwort-feld').hidden = !(a && a.noetig);
      $('#g-passwort').required = !!(a && a.noetig);
    });
  }

  function oeffnen(daten) {
    $('#g-oeffnen').disabled = true;
    socket.emit('gruppe:oeffnen', daten, (a) => {
      $('#g-oeffnen').disabled = false;
      if (!a) return;
      if (!a.ok) return zeigeAnmeldung(a.fehler);
      schreibeSitzung({ schluessel: a.schluessel });
      $('#g-passwort').value = '';
      $('#pult').classList.remove('nur-anmeldung');
      $('#g-anmelden').hidden = true;
      $('#g-uebersicht').hidden = false;
      $('#g-verbindung').textContent = 'verbunden';
    });
  }

  socket.on('connect', () => {
    const alt = leseSitzung();
    if (alt && alt.schluessel) {
      oeffnen({ schluessel: alt.schluessel, nurWieder: true });
    } else {
      zeigeAnmeldung();
    }
  });
  socket.on('disconnect', () => { $('#g-verbindung').textContent = 'Verbindung weg …'; });
  socket.on('raumWeg', () => { G.melde('Die Gruppen sind abgelaufen.', 'fehler'); setTimeout(() => location.reload(), 1500); });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && !socket.connected) socket.connect();
  });

  $('#g-form').addEventListener('submit', (e) => {
    e.preventDefault();
    oeffnen({ anzahl: Number($('#g-anzahl').value) || 4, passwort: $('#g-passwort').value });
  });

  // ------------------------------------------------------------
  // Befehle
  // ------------------------------------------------------------
  function befehl(code, name, daten, extra) {
    socket.emit('gruppe:befehl', Object.assign({ code, befehl: name, daten }, extra || {}), (a) => {
      if (a && !a.ok && a.fehler) G.melde(a.fehler, 'fehler');
    });
  }

  const einstellungen = new window.Einstellungen($('#g-einstellungen'), (teil) => befehl('alle', 'einstellungen', teil));

  function laeuftIrgendwo() {
    return zustand && zustand.raeume.some((r) => r.spiel && r.spiel.phase !== 'ende');
  }

  $('#g-start').addEventListener('click', () => {
    if (laeuftIrgendwo() && !confirm('In mindestens einer Gruppe läuft noch ein Spiel. Alle neu starten? Die Punkte werden auf null gesetzt.')) return;
    befehl('alle', 'start', einstellungen.texte());
  });
  $('#g-pause').addEventListener('click', () => {
    const allePausiert = zustand && zustand.raeume.length && zustand.raeume.every((r) => r.pause);
    befehl('alle', 'pause', null, { an: !allePausiert });
  });
  $('#g-ueberspringen').addEventListener('click', () => befehl('alle', 'ueberspringen'));
  $('#g-beenden').addEventListener('click', () => {
    if (confirm('Das Spiel in allen Gruppen beenden?')) befehl('alle', 'beenden');
  });
  $('#g-hinzufuegen').addEventListener('click', () => befehl('alle', 'hinzufuegen'));

  $('#g-raster').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-aktion]');
    if (!b) return;
    const karte = b.closest('[data-code]');
    const code = karte.dataset.code;
    const raum = zustand && zustand.raeume.find((r) => r.code === code);
    if (!raum) return;
    const a = b.dataset.aktion;
    if (a === 'start') {
      if (raum.spiel && raum.spiel.phase !== 'ende' && !confirm(`${raum.name} neu starten? Die Punkte werden auf null gesetzt.`)) return;
      befehl(code, 'start', einstellungen.texte());
    } else if (a === 'pause') befehl(code, 'pause', null, { an: !raum.pause });
    else if (a === 'ueberspringen') befehl(code, 'ueberspringen');
    else if (a === 'beenden') { if (confirm(`Spiel in ${raum.name} beenden?`)) befehl(code, 'beenden'); }
  });

  // ------------------------------------------------------------
  // Darstellung
  // ------------------------------------------------------------
  socket.on('gruppe:zustand', (z) => {
    zustand = z;
    male();
  });

  const qrCache = {};
  function qrFuer(code) {
    const url = location.origin + '/?code=' + code;
    if (!qrCache[url]) qrCache[url] = window.QR.alsSvg(url);
    return qrCache[url];
  }

  function statusText(raum) {
    const s = raum.spiel;
    const online = raum.spieler.filter((p) => p.online).length;
    if (!s) return { titel: 'Lobby', text: online === 1 ? '1 Kind ist da' : `${online} Kinder sind da` };
    const runde = `Runde ${s.runde} von ${s.runden}`;
    if (s.phase === 'ende') return { titel: 'Fertig', text: 'Das Spiel ist vorbei.' };
    if (s.art === 'zeichnen') {
      const name = s.zeichner ? s.zeichner.name : '';
      const titel = `Zeichnen · ${runde}`;
      if (s.phase === 'wahl') return { titel, text: `${name} sucht ein Wort aus` };
      if (s.phase === 'zeichnen') return { titel, text: `${name} zeichnet · ${s.geraten.length} von ${Math.max(0, online - 1)} haben es` };
      if (s.phase === 'aufloesung') return { titel, text: s.aufloesung && s.aufloesung.wort ? `Aufgelöst: ${s.aufloesung.wort}` : 'Aufgelöst' };
      return { titel, text: 'Warte auf mindestens zwei Kinder' };
    }
    const titel = `Stadt, Land, Fluss · ${runde}`;
    const fertig = (ids) => raum.spieler.filter((p) => p.online && ids.includes(p.id)).length;
    if (s.phase === 'schreiben') return { titel, text: `Buchstabe ${s.buchstabe} · ${fertig(s.fertigIds)} von ${online} abgegeben${s.stoppVon ? ` · ${s.stoppVon} hat Stopp gerufen` : ''}` };
    if (s.phase === 'einsammeln') return { titel, text: 'Antworten werden eingesammelt' };
    if (s.phase === 'pruefen') return { titel, text: `Prüfrunde · ${fertig(s.pruefFertigIds || [])} von ${online} fertig` };
    if (s.phase === 'auswertung') return { titel, text: 'Wartet auf deine Auswertung in der Einzelregie' };
    if (s.phase === 'tafel') return { titel, text: 'Rundentafel' };
    return { titel, text: '' };
  }

  function mitZeit(s) {
    if (!s) return false;
    if (s.art === 'zeichnen') return s.phase === 'wahl' || s.phase === 'zeichnen';
    return s.phase === 'schreiben' || s.phase === 'pruefen' || (s.phase === 'tafel' && s.pruefung === 'kinder');
  }

  function baueKarte(raum) {
    const el = document.createElement('article');
    el.className = 'gruppenkarte herein';
    el.dataset.code = raum.code;
    el.style.setProperty('--dreh', ((karten.size % 3) - 1) * 0.5 + 'deg');
    el.innerHTML = `
      <header class="gk-kopf">
        <div>
          <h2 class="gk-name"></h2>
          <div class="gk-code"></div>
        </div>
        <div class="gk-zeit"></div>
        <div class="qr gk-qr"></div>
      </header>
      <div class="gk-status"><b class="gk-titel"></b><span class="gk-text"></span></div>
      <ol class="rangliste gk-spieler"></ol>
      <div class="gk-knoepfe">
        <button type="button" class="knopf klein haupt" data-aktion="start">Starten</button>
        <button type="button" class="knopf klein gold" data-aktion="pause">Pause</button>
        <button type="button" class="knopf klein" data-aktion="ueberspringen">Weiter</button>
        <button type="button" class="knopf klein" data-aktion="beenden">Beenden</button>
        <a class="knopf klein gk-regie" target="_blank" rel="noopener">Regie</a>
        <a class="knopf klein gk-buehne" target="_blank" rel="noopener">Bühne</a>
      </div>
      <div class="gk-pause" hidden>Pause</div>`;
    $('#g-raster').appendChild(el);
    const eintrag = { el, timer: new G.Zeitkreis(el.querySelector('.gk-zeit')) };
    karten.set(raum.code, eintrag);
    return eintrag;
  }

  function male() {
    const z = zustand;
    if (!z) return;
    $('#g-adresse').textContent = location.host;
    einstellungen.male(z.einstellungen, z.listen);

    const allePausiert = z.raeume.length && z.raeume.every((r) => r.pause);
    const pause = $('#g-pause');
    pause.textContent = allePausiert ? 'Alle weiterspielen' : 'Alle pausieren';
    pause.classList.toggle('an', !!allePausiert);
    pause.classList.toggle('gold', !allePausiert);
    $('#g-start').textContent = laeuftIrgendwo() ? 'Alle neu starten' : 'Alle starten';
    $('#g-hinzufuegen').disabled = z.raeume.length >= 10;

    const vorhanden = new Set(z.raeume.map((r) => r.code));
    for (const [code, k] of karten) {
      if (!vorhanden.has(code)) { k.el.remove(); karten.delete(code); }
    }
    for (const raum of z.raeume) {
      const k = karten.get(raum.code) || baueKarte(raum);
      const el = k.el;
      const s = raum.spiel;
      el.classList.toggle('im-spiel', !!s);
      el.classList.toggle('pausiert', raum.pause);
      el.querySelector('.gk-name').textContent = raum.name;
      el.querySelector('.gk-code').textContent = raum.code;
      setzeHtml(el.querySelector('.gk-qr'), qrFuer(raum.code));
      const st = statusText(raum);
      el.querySelector('.gk-titel').textContent = st.titel;
      el.querySelector('.gk-text').textContent = st.text;
      k.timer.setze(s ? s.restMs : 0, s ? s.phasenDauer : 1, raum.pause, mitZeit(s));
      el.querySelector('.gk-zeit').hidden = !mitZeit(s);
      const spieler = s ? raum.spieler : raum.spieler.slice().sort((a, b) => a.name.localeCompare(b.name, 'de'));
      let platz = 0;
      let vorher = null;
      setzeHtml(el.querySelector('.gk-spieler'), spieler.length ? spieler.map((p, i) => {
        if (p.punkte !== vorher) { platz = i + 1; vorher = p.punkte; }
        return `<li class="${s && platz === 1 && p.punkte > 0 ? 'erster' : ''} ${p.online ? '' : 'weg'}"><span class="platz">${s ? platz + '.' : ''}</span><span class="n">${esc(p.name)}</span><span class="p">${s ? p.punkte : ''}</span></li>`;
      }).join('')
        : '<li class="leer"><span></span><span class="n">noch niemand</span><span></span></li>');
      el.querySelector('[data-aktion="start"]').textContent = s && s.phase !== 'ende' ? 'Neu' : 'Starten';
      const p = el.querySelector('[data-aktion="pause"]');
      p.textContent = raum.pause ? 'Weiter' : 'Pause';
      p.disabled = !s;
      el.querySelector('[data-aktion="ueberspringen"]').disabled = !s || s.phase === 'ende';
      el.querySelector('[data-aktion="ueberspringen"]').textContent = 'Überspringen';
      el.querySelector('[data-aktion="beenden"]').disabled = !s;
      el.querySelector('.gk-regie').href = `/lehrer#raum=${encodeURIComponent(raum.code)}&schluessel=${encodeURIComponent(raum.schluessel)}`;
      el.querySelector('.gk-buehne').href = `/buehne?code=${encodeURIComponent(raum.code)}`;
      el.querySelector('.gk-pause').hidden = !raum.pause;
    }
  }
})();
