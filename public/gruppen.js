/* Übersicht: ein Raum oder mehrere, alle von hier aus steuern */
(function () {
  'use strict';
  const G = window.Gemeinsam;
  const { $, esc, setzeHtml } = G;

  const SPEICHER = 'spieleraum-gruppe';
  const socket = G.verbinde();
  let zustand = null;
  const karten = new Map(); // code -> { el, timer }
  let auswahl = null; // { id, code, name }: Person, die gerade verschoben wird

  // Render-Dienst wach halten, solange der Tab offen ist.
  setInterval(() => { fetch('/healthz', { cache: 'no-store' }).catch(() => {}); }, 10 * 60 * 1000);

  function leseSitzung() {
    try { return JSON.parse(sessionStorage.getItem(SPEICHER) || 'null'); } catch (e) { return null; }
  }
  function schreibeSitzung(s) {
    try { sessionStorage.setItem(SPEICHER, JSON.stringify(s)); } catch (e) { /* ohne Speicher */ }
  }

  // Aus der Einzelregie kommend: /gruppen#gruppe=…
  if (location.hash.includes('gruppe=')) {
    const h = new URLSearchParams(location.hash.slice(1));
    if (h.get('gruppe')) schreibeSitzung({ schluessel: h.get('gruppe') });
    history.replaceState(null, '', location.pathname);
  }

  // ------------------------------------------------------------
  // Anmeldung: ohne Passwort geht es direkt los
  // ------------------------------------------------------------
  function zeigeAnmeldung(fehler) {
    zustand = null;
    $('#pult').classList.add('nur-anmeldung');
    $('#g-anmelden').hidden = false;
    $('#g-uebersicht').hidden = true;
    $('#g-fehler').textContent = fehler || '';
    socket.emit('lehrer:passwortNoetig', {}, (a) => {
      const noetig = !!(a && a.noetig);
      $('#g-passwort-feld').hidden = !noetig;
      $('#g-passwort').required = noetig;
      if (noetig) $('#g-passwort').focus();
    });
  }

  function neu() {
    socket.emit('lehrer:passwortNoetig', {}, (a) => {
      if (a && a.noetig) zeigeAnmeldung();
      else oeffnen({});
    });
  }

  function oeffnen(daten) {
    $('#g-oeffnen').disabled = true;
    socket.emit('gruppe:oeffnen', daten, (a) => {
      $('#g-oeffnen').disabled = false;
      if (!a) return;
      if (!a.ok) {
        if (a.abgelaufen) { schreibeSitzung(null); G.melde('Die Räume von vorhin sind abgelaufen. Hier ist ein neuer.', 'fehler'); return neu(); }
        return zeigeAnmeldung(a.fehler);
      }
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
    } else if (!zustand) {
      neu();
    }
  });
  socket.on('disconnect', () => { $('#g-verbindung').textContent = 'Verbindung weg …'; });
  socket.on('raumWeg', () => { G.melde('Die Räume sind abgelaufen.', 'fehler'); schreibeSitzung(null); setTimeout(() => location.reload(), 1500); });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && !socket.connected) socket.connect();
  });

  $('#g-form').addEventListener('submit', (e) => {
    e.preventDefault();
    oeffnen({ passwort: $('#g-passwort').value });
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
    if (laeuftIrgendwo() && !confirm('In mindestens einem Raum läuft noch ein Spiel. Alle neu starten? Die Punkte werden auf null gesetzt.')) return;
    befehl('alle', 'start', einstellungen.texte());
  });
  $('#g-pause').addEventListener('click', () => {
    const allePausiert = zustand && zustand.raeume.length && zustand.raeume.every((r) => r.pause);
    befehl('alle', 'pause', null, { an: !allePausiert });
  });
  $('#g-ueberspringen').addEventListener('click', () => befehl('alle', 'ueberspringen'));
  $('#g-beenden').addEventListener('click', () => {
    if (confirm('Das Spiel in allen Räumen beenden?')) befehl('alle', 'beenden');
  });
  $('#g-hinzufuegen').addEventListener('click', () => befehl('alle', 'hinzufuegen'));
  $('#g-abstimmen').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-wert]');
    if (b) befehl('alle', 'einstellungen', { abstimmen: b.dataset.wert === 'ja' });
  });
  $('#g-wahl').addEventListener('click', () => befehl('alle', 'wahl', null, { aktion: 'starten' }));

  $('#g-raster').addEventListener('click', (e) => {
    // Verschieben: erst eine Person antippen, dann „hierher“ im Zielraum
    const person = e.target.closest('[data-spieler]');
    if (person) {
      const code = person.closest('[data-code]').dataset.code;
      auswahl = auswahl && auswahl.id === person.dataset.spieler ? null : { id: person.dataset.spieler, code, name: person.dataset.name };
      return male();
    }
    const hier = e.target.closest('[data-hierher]');
    if (hier && auswahl) {
      befehl(auswahl.code, 'verschieben', null, { nach: hier.dataset.hierher, spielerId: auswahl.id });
      auswahl = null;
      return male();
    }
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
    else if (a === 'schliessen') {
      const rest = zustand.raeume.find((r) => r.code !== code);
      const leute = raum.spieler.length;
      if (confirm(`Raum ${raum.name} schließen?${leute ? ` ${leute === 1 ? 'Die eine Person wandert' : `Die ${leute} Leute wandern`} in den Raum ${rest.name}.` : ''}`)) befehl(code, 'schliessen');
    } else if (a === 'wahl-ab') befehl(code, 'wahl', null, { aktion: 'abbrechen' });
    else if (a === 'wahl-jetzt') befehl(code, 'wahl', null, { aktion: 'jetzt' });
  });

  // ------------------------------------------------------------
  // Darstellung
  // ------------------------------------------------------------
  socket.on('gruppe:zustand', (z) => {
    zustand = z;
    G.wachHalten(true);
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
    if (raum.wahl) return { titel: 'Abstimmung läuft', text: `${raum.wahl.stimmen} von ${online} haben gewählt · noch ${Math.ceil(raum.wahl.restMs / 1000)} s` };
    if (!s) return { titel: 'Lobby', text: online === 1 ? '1 Person ist da' : `${online} Leute sind da` };
    const runde = `Runde ${s.runde} von ${s.runden}`;
    if (s.phase === 'ende') return { titel: 'Fertig', text: 'Das Spiel ist vorbei.' };
    if (s.art === 'zeichnen') {
      const name = s.zeichner ? s.zeichner.name : '';
      const titel = `Zeichnen · ${runde}`;
      if (s.phase === 'wahl') return { titel, text: `${name} sucht ein Wort aus` };
      if (s.phase === 'zeichnen') return { titel, text: `${name} zeichnet · ${s.geraten.length} von ${Math.max(0, online - 1)} haben es` };
      if (s.phase === 'aufloesung') return { titel, text: s.aufloesung && s.aufloesung.wort ? `Aufgelöst: ${s.aufloesung.wort}` : 'Aufgelöst' };
      return { titel, text: 'Warte auf mindestens zwei Mitspielende' };
    }
    if (window.Party.ist(s.art)) return window.Party.status(s);
    if (s.art === 'saboteur') {
      const titel = s.runde ? `Saboteur · ${runde}` : 'Saboteur';
      const f = s.fortschritt;
      const aufgaben = `Aufgaben ${f.erledigt} von ${f.gesamt}`;
      if (s.phase === 'warten') return { titel, text: `Braucht mindestens ${s.minSpieler} Mitspielende` };
      if (s.phase === 'rollen') return { titel, text: 'Rollen werden verteilt' };
      if (s.phase === 'spiel') return { titel, text: aufgaben };
      if (s.phase === 'konferenz') return { titel, text: `Konferenz · ${s.konferenz.abgestimmt.length} von ${s.konferenz.lebende} abgestimmt` };
      if (s.phase === 'ergebnis') return { titel, text: s.ergebnis && s.ergebnis.raus ? `${s.ergebnis.raus.name} wurde rausgeworfen` : 'Niemand wurde rausgeworfen' };
      if (s.phase === 'rundenende' && s.sieg) return { titel, text: !s.sieg.seite ? 'Runde abgebrochen' : s.sieg.seite === 'crew' ? 'Die Crew gewinnt' : 'Die Saboteure gewinnen' };
      return { titel, text: '' };
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
    if (window.Party.ist(s.art)) return window.Party.zeitAktiv(s);
    if (s.art === 'saboteur') return ['rollen', 'konferenz', 'ergebnis', 'rundenende'].includes(s.phase);
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
          <button type="button" class="knopf klein gk-hierher" hidden></button>
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
        <a class="knopf klein gk-regie">Regie</a>
        <a class="knopf klein gk-buehne" target="_blank" rel="noopener">Bühne</a>
        <button type="button" class="knopf klein" data-aktion="schliessen">Schließen</button>
      </div>
      <div class="gk-wahl" hidden>
        <button type="button" class="knopf klein" data-aktion="wahl-jetzt">Sofort auswerten</button>
        <button type="button" class="knopf klein" data-aktion="wahl-ab">Abstimmung abbrechen</button>
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
    const mehrere = z.raeume.length > 1;
    $('#g-start').textContent = laeuftIrgendwo() ? (mehrere ? 'Alle neu starten' : 'Neu starten') : (mehrere ? 'Alle starten' : 'Starten');
    $('#g-pause').textContent = allePausiert ? (mehrere ? 'Alle weiterspielen' : 'Weiterspielen') : (mehrere ? 'Alle pausieren' : 'Pausieren');
    $('#g-ueberspringen').textContent = mehrere ? 'Alle überspringen' : 'Überspringen';
    $('#g-beenden').textContent = mehrere ? 'Alle beenden' : 'Beenden';
    $('#g-titel').textContent = mehrere ? `${z.raeume.length} Räume` : 'Dein Raum';
    $('#g-hinzufuegen').disabled = z.raeume.length >= 10;
    $('#g-abstimmen').querySelectorAll('button').forEach((b) => b.classList.toggle('an', (b.dataset.wert === 'ja') === !!z.einstellungen.abstimmen));
    if (auswahl && !z.raeume.some((r) => r.code === auswahl.code && r.spieler.some((p) => p.id === auswahl.id))) auswahl = null;
    $('#g-schiebe').hidden = !auswahl;
    if (auswahl) $('#g-schiebe').textContent = `${auswahl.name} verschieben: Tipp im Zielraum auf „hierher“. Nochmal auf den Namen tippen bricht ab.`;

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
        const gewaehlt = auswahl && auswahl.id === p.id;
        return `<li class="${s && platz === 1 && p.punkte > 0 ? 'erster' : ''} ${p.online ? '' : 'weg'} ${gewaehlt ? 'gewaehlt' : ''} schiebbar" data-spieler="${esc(p.id)}" data-name="${esc(p.name)}" title="Antippen zum Verschieben"><span class="platz">${s ? platz + '.' : ''}</span><span class="n">${esc(p.name)}</span><span class="p">${s ? p.punkte : ''}</span></li>`;
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
      el.querySelector('[data-aktion="schliessen"]').hidden = !mehrere;
      el.querySelector('.gk-wahl').hidden = !raum.wahl;
      const hier = el.querySelector('.gk-hierher');
      hier.hidden = !auswahl || auswahl.code === raum.code;
      hier.dataset.hierher = raum.code;
      if (auswahl) hier.textContent = `${auswahl.name} hierher`;
      el.querySelector('.gk-buehne').href = `/buehne?code=${encodeURIComponent(raum.code)}`;
      el.querySelector('.gk-pause').hidden = !raum.pause;
    }
  }
})();
