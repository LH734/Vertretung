/* Kinder-Ansicht: Beitritt, Lobby, Zeichnen und Raten, Stadt, Land, Fluss */
(function () {
  'use strict';
  const G = window.Gemeinsam;
  const { $, esc, setzeHtml, karteHerein, teamPunkt, TEAMS, FARBEN, STAERKEN } = G;

  const SPEICHER = 'spieleraum-sitzung';
  const ICON = {
    radierer: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M3.5 15.5l9-9 7 7-6 6h-6z"/><path d="M8 11l7 7"/><path d="M13.5 19.5H21" stroke-linecap="round"/></svg>',
    fuellen: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M4 12l7-7 8 8-7 7z"/><path d="M4 12h15"/><path d="M20.5 16c1 1.6 1.5 2.6 1.5 3.3a1.6 1.6 0 01-3.2 0c0-.7.6-1.7 1.7-3.3z" fill="currentColor"/><path d="M9 7L6.5 4.5" stroke-linecap="round"/></svg>',
    zurueck: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 010 12h-3"/></svg>',
    muell: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16"/><path d="M9 7V4.5h6V7"/><path d="M6 7l1 13h10l1-13"/><path d="M10 11v6M14 11v6"/></svg>',
    hoch: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M7 11v9H3.5v-9z"/><path d="M7 11l4-7.5c1.6 0 2.6 1 2.3 2.8L12.8 10H19a2 2 0 012 2.3l-1.2 6A2.4 2.4 0 0117.4 20H7"/></svg>',
    runter: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><g transform="rotate(180 12 12)"><path d="M7 11v9H3.5v-9z"/><path d="M7 11l4-7.5c1.6 0 2.6 1 2.3 2.8L12.8 10H19a2 2 0 012 2.3l-1.2 6A2.4 2.4 0 0117.4 20H7"/></g></svg>',
  };

  // ------------------------------------------------------------
  // Sitzung
  // ------------------------------------------------------------
  function leseSitzung() {
    try { return JSON.parse(sessionStorage.getItem(SPEICHER) || 'null'); } catch (e) { return null; }
  }
  function schreibeSitzung(s) {
    try {
      if (s) sessionStorage.setItem(SPEICHER, JSON.stringify(s));
      else sessionStorage.removeItem(SPEICHER);
    } catch (e) { /* privater Modus ohne Speicher: dann eben ohne Wiederkehr */ }
  }

  let sitzung = leseSitzung();
  let zustand = null;
  const socket = G.verbinde();

  const params = new URLSearchParams(location.search);
  if (params.get('code')) $('#code').value = params.get('code').toUpperCase().slice(0, 4);
  if (sitzung) zeigeAnsicht(null); // nicht erst die Beitrittsseite aufblitzen lassen

  function zeigeAnsicht(name) {
    for (const v of ['beitritt', 'lobby', 'zeichnen', 'slf', 'ende']) {
      $('#v-' + v).hidden = v !== name;
    }
  }

  function beitreten(daten) {
    const knopf = $('#beitreten-knopf');
    knopf.disabled = true;
    socket.emit('kind:beitreten', daten, (antwort) => {
      knopf.disabled = false;
      if (antwort && antwort.ok) {
        sitzung = { code: antwort.code, spielerId: antwort.spielerId };
        schreibeSitzung(sitzung);
        if (params.get('code')) history.replaceState(null, '', location.pathname);
        return;
      }
      if (antwort && (antwort.raumWeg || antwort.neuBeitreten)) {
        schreibeSitzung(null);
        sitzung = null;
        zustand = null;
        zeigeAnsicht('beitritt');
        $('#wer').hidden = true;
      } else if (!zustand) {
        zeigeAnsicht('beitritt');
      }
      G.melde((antwort && antwort.fehler) || 'Das hat nicht geklappt.', 'fehler');
    });
  }

  // Eingabetaste schickt das Formular sicher ab, auch bei Bildschirmtastaturen,
  // die kein implizites Absenden auslösen.
  function enterSchicktAb(eingabe) {
    eingabe.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' || e.isComposing) return;
      e.preventDefault();
      const form = eingabe.form;
      if (form && form.requestSubmit) form.requestSubmit();
      else if (form) form.dispatchEvent(new Event('submit', { cancelable: true }));
    });
  }
  enterSchicktAb($('#code'));
  enterSchicktAb($('#name'));
  enterSchicktAb($('#z-eingabe'));

  $('#code').addEventListener('input', (e) => {
    e.target.value = e.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);
  });

  $('#beitrittsform').addEventListener('submit', (e) => {
    e.preventDefault();
    const code = $('#code').value.trim().toUpperCase();
    const name = $('#name').value.trim();
    if (code.length !== 4) return G.melde('Der Code hat vier Buchstaben.', 'fehler');
    if (!name) return G.melde('Gib bitte einen Spitznamen ein.', 'fehler');
    beitreten({ code, name });
  });

  // ------------------------------------------------------------
  // Verbindung
  // ------------------------------------------------------------
  let warGetrennt = false;
  socket.on('connect', () => {
    if (sitzung) beitreten({ code: sitzung.code, spielerId: sitzung.spielerId });
    else if (!zustand) zeigeAnsicht('beitritt');
    if (warGetrennt) G.melde('Wieder verbunden.');
    warGetrennt = false;
  });
  socket.on('disconnect', () => {
    warGetrennt = true;
    if (sitzung) G.melde('Verbindung kurz weg … ich versuche es weiter.', 'fehler');
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && !socket.connected) socket.connect();
  });
  window.addEventListener('online', () => { if (!socket.connected) socket.connect(); });

  function rauswurf(text) {
    schreibeSitzung(null);
    sitzung = null;
    zustand = null;
    $('#wer').hidden = true;
    $('#pause').hidden = true;
    zeigeAnsicht('beitritt');
    G.melde(text, 'fehler');
  }
  socket.on('entfernt', () => rauswurf('Die Lehrkraft hat dich aus dem Raum genommen.'));
  socket.on('raumWeg', () => rauswurf('Der Raum wurde geschlossen.'));
  socket.on('anderswo', () => {
    zustand = null;
    zeigeAnsicht(null);
    G.melde('Du spielst jetzt in einem anderen Fenster weiter.', 'fehler');
  });

  socket.on('zustand', (z) => {
    if (!sitzung) return;
    zustand = z;
    male();
  });

  // ------------------------------------------------------------
  // Chat
  // ------------------------------------------------------------
  const chatListe = $('#z-chat');
  function chatZeile(e) {
    const li = document.createElement('li');
    li.className = e.art;
    if (e.art === 'rate' || e.art === 'intern') li.innerHTML = `${teamPunkt(e.team)}<b>${esc(e.name)}:</b> ${esc(e.text)}`;
    else li.textContent = e.text;
    return li;
  }
  function chatAnhaengen(e) {
    const unten = chatListe.scrollHeight - chatListe.scrollTop - chatListe.clientHeight < 40;
    chatListe.appendChild(chatZeile(e));
    while (chatListe.children.length > 60) chatListe.removeChild(chatListe.firstChild);
    if (unten) chatListe.scrollTop = chatListe.scrollHeight;
  }
  socket.on('chat', chatAnhaengen);
  socket.on('chat:alle', (liste) => { chatListe.innerHTML = ''; (liste || []).forEach(chatAnhaengen); chatListe.scrollTop = chatListe.scrollHeight; });
  socket.on('chat:leeren', () => { chatListe.innerHTML = ''; });

  $('#z-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const eingabe = $('#z-eingabe');
    const text = eingabe.value.trim();
    if (!text) return;
    socket.emit('kind:chat', { text: text.slice(0, 100) });
    eingabe.value = '';
  });

  socket.on('geraten', (d) => G.melde(`Richtig: ${d.wort}! Du bekommst ${d.punkte} Punkte.`));

  // ------------------------------------------------------------
  // Zeichenfläche
  // ------------------------------------------------------------
  const flaeche = new G.Zeichenflaeche($('#z-canvas'));
  flaeche.drehung = -0.4;
  socket.on('zeichnen:alles', (d) => flaeche.setzeAlles(d.zugId, d.ops));
  socket.on('zeichnen:op', (d) => { if (d.zugId === flaeche.zugId) flaeche.wendeAn(d.op); });

  const werkzeug = { farbe: 0, staerke: 1, modus: 'stift' };
  let strich = null; // { id, pointerId, start, ausstehend: [] }

  function darfZeichnen() {
    const s = zustand && zustand.spiel;
    return !!(s && s.art === 'zeichnen' && s.phase === 'zeichnen' && s.istZeichner && !zustand.raum.pause);
  }

  function sendeAusstehend() {
    if (!strich || !strich.ausstehend.length) return;
    while (strich.ausstehend.length) {
      const teil = strich.ausstehend.splice(0, 300);
      if (strich.start) {
        const f = strich.f;
        socket.emit('kind:zeichnen', { typ: 'start', id: strich.id, f, b: strich.b, p: teil });
        strich.start = false;
      } else {
        socket.emit('kind:zeichnen', { typ: 'punkte', id: strich.id, p: teil });
      }
    }
  }
  setInterval(sendeAusstehend, 33); // gedrosselt auf etwa 30 Nachrichten pro Sekunde

  const leinwand = $('#z-canvas');
  leinwand.addEventListener('pointerdown', (e) => {
    if (!darfZeichnen()) return;
    e.preventDefault();
    if (strich && strich.pointerId !== undefined && strich.aktiv) return;
    const pt = flaeche.punktAus(e);
    if (werkzeug.modus === 'fuellen') {
      sendeAusstehend();
      flaeche.wendeAn({ t: 'f', x: pt[0], y: pt[1], f: werkzeug.farbe });
      socket.emit('kind:zeichnen', { typ: 'fuellen', x: pt[0], y: pt[1], f: werkzeug.farbe });
      return;
    }
    sendeAusstehend();
    try { leinwand.setPointerCapture(e.pointerId); } catch (err) { /* egal */ }
    strich = {
      id: Math.random().toString(36).slice(2, 10),
      pointerId: e.pointerId,
      aktiv: true,
      start: true,
      f: werkzeug.modus === 'radierer' ? 8 : werkzeug.farbe,
      b: werkzeug.staerke,
      letzter: pt,
      ausstehend: [pt],
    };
    flaeche.wendeAn({ t: 's', id: strich.id, f: strich.f, b: strich.b, p: [pt] });
  });
  leinwand.addEventListener('pointermove', (e) => {
    if (!strich || !strich.aktiv || e.pointerId !== strich.pointerId) return;
    e.preventDefault();
    if (!darfZeichnen()) { strich.aktiv = false; return; }
    const ereignisse = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
    const neu = [];
    for (const ev of (ereignisse.length ? ereignisse : [e])) {
      const pt = flaeche.punktAus(ev);
      const dx = pt[0] - strich.letzter[0], dy = pt[1] - strich.letzter[1];
      if (dx * dx + dy * dy < 4) continue;
      strich.letzter = pt;
      neu.push(pt);
    }
    if (!neu.length) return;
    flaeche.wendeAn({ t: 'p', id: strich.id, p: neu });
    strich.ausstehend.push(...neu);
  });
  function strichEnde(e) {
    if (!strich || e.pointerId !== strich.pointerId) return;
    strich.aktiv = false;
    sendeAusstehend();
  }
  leinwand.addEventListener('pointerup', strichEnde);
  leinwand.addEventListener('pointercancel', strichEnde);
  leinwand.addEventListener('lostpointercapture', strichEnde);
  // Wischen, Zoomen und Kontextmenü nur auf der Zeichenfläche unterbinden
  leinwand.addEventListener('touchstart', (e) => { if (darfZeichnen()) e.preventDefault(); }, { passive: false });
  leinwand.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
  leinwand.addEventListener('contextmenu', (e) => e.preventDefault());

  function baueWerkzeuge() {
    const farben = FARBEN.slice(0, 8).map((f, i) =>
      `<button type="button" class="farbklecks" data-farbe="${i}" style="--farbe:${f.wert}" aria-label="${esc(f.name)}" title="${esc(f.name)}"></button>`).join('');
    const staerken = STAERKEN.map((s, i) =>
      `<button type="button" class="werkzeug" data-staerke="${i}" aria-label="${['Dünn', 'Mittel', 'Dick'][i]}" title="${['Dünn', 'Mittel', 'Dick'][i]}"><span class="punkt" style="width:${[6, 12, 20][i]}px;height:${[6, 12, 20][i]}px"></span></button>`).join('');
    setzeHtml($('#z-werkzeuge'),
      `<div class="gruppe">${farben}</div>` +
      `<div class="gruppe">${staerken}</div>` +
      `<div class="gruppe">
        <button type="button" class="werkzeug" data-modus="radierer" aria-label="Radierer" title="Radierer">${ICON.radierer}</button>
        <button type="button" class="werkzeug" data-modus="fuellen" aria-label="Füllen" title="Füllen">${ICON.fuellen}</button>
      </div>
      <div class="gruppe">
        <button type="button" class="werkzeug" data-aktion="zurueck" aria-label="Schritt zurück" title="Schritt zurück">${ICON.zurueck}</button>
        <button type="button" class="werkzeug" data-aktion="leeren" aria-label="Alles löschen" title="Alles löschen">${ICON.muell}</button>
      </div>`);
    markiereWerkzeuge();
  }
  function markiereWerkzeuge() {
    document.querySelectorAll('#z-werkzeuge [data-farbe]').forEach((b) =>
      b.classList.toggle('aktiv', Number(b.dataset.farbe) === werkzeug.farbe && werkzeug.modus !== 'radierer'));
    document.querySelectorAll('#z-werkzeuge [data-staerke]').forEach((b) =>
      b.classList.toggle('aktiv', Number(b.dataset.staerke) === werkzeug.staerke));
    document.querySelectorAll('#z-werkzeuge [data-modus]').forEach((b) =>
      b.classList.toggle('aktiv', b.dataset.modus === werkzeug.modus));
  }
  baueWerkzeuge();
  $('#z-werkzeuge').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.farbe !== undefined) {
      werkzeug.farbe = Number(b.dataset.farbe);
      if (werkzeug.modus === 'radierer') werkzeug.modus = 'stift';
    } else if (b.dataset.staerke !== undefined) {
      werkzeug.staerke = Number(b.dataset.staerke);
      if (werkzeug.modus === 'fuellen') werkzeug.modus = 'stift';
    } else if (b.dataset.modus) {
      werkzeug.modus = werkzeug.modus === b.dataset.modus ? 'stift' : b.dataset.modus;
    } else if (b.dataset.aktion && darfZeichnen()) {
      sendeAusstehend();
      if (b.dataset.aktion === 'zurueck') {
        socket.emit('kind:zeichnen', { typ: 'rueckgaengig' });
        flaeche.wendeAn({ t: 'u' });
      } else {
        socket.emit('kind:zeichnen', { typ: 'leeren' });
        flaeche.wendeAn({ t: 'c' });
      }
    }
    markiereWerkzeuge();
  });

  // ------------------------------------------------------------
  // Darstellung
  // ------------------------------------------------------------
  const zTimer = new G.Zeitkreis($('#z-timer'));
  const sTimer = new G.Zeitkreis($('#s-timer'));

  function drehung(id) {
    let h = 0;
    for (const c of String(id)) h = (h * 31 + c.charCodeAt(0)) | 0;
    return ((Math.abs(h) % 7) - 3) * 0.8;
  }

  function male() {
    const z = zustand;
    if (!z || !z.ich) return;
    $('#wer').hidden = false;
    $('#kopf-name').innerHTML = teamPunkt(z.raum.wertung === 'teams' ? z.ich.team : null) + esc(z.ich.name);
    $('#kopf-punkte').textContent = z.ich.punkte + ' P.';
    $('#pause').hidden = !z.raum.pause;

    const s = z.spiel;
    if (!s) { zeigeAnsicht('lobby'); return maleLobby(z); }
    if (s.phase === 'ende') { zeigeAnsicht('ende'); return maleEnde(z); }
    if (s.art === 'zeichnen') { zeigeAnsicht('zeichnen'); return maleZeichnen(z, s); }
    if (s.art === 'slf') { zeigeAnsicht('slf'); return maleSlf(z, s); }
  }

  function maleLobby(z) {
    const teams = z.raum.wertung === 'teams';
    const selbst = teams && z.raum.teamWahl === 'selbst';
    $('#lobby-titel').textContent = `Hallo, ${z.ich.name}!`;
    let text = 'Du bist drin. Warte kurz, gleich geht es los.';
    if (selbst) text = 'Such dir ein Team aus. Dann geht es gleich los.';
    else if (teams) text = z.ich.team !== null ? `Du spielst im Team ${TEAMS[z.ich.team].name}.` : 'Die Lehrkraft teilt gleich die Teams ein.';
    $('#lobby-text').textContent = text;

    if (selbst) {
      setzeHtml($('#teamwahl'), '<div class="teamwahl">' + z.teams.map((t) =>
        `<button type="button" class="teamknopf ${z.ich.team === t.index ? 'gewaehlt' : ''}" data-team="${t.index}" style="--team:${t.farbe}">${esc(t.name)}<small>${t.mitglieder} ${t.mitglieder === 1 ? 'Kind' : 'Kinder'}</small></button>`).join('') + '</div>');
    } else {
      setzeHtml($('#teamwahl'), '');
    }
    setzeHtml($('#lobby-namen'), z.spieler.map((p) =>
      `<li class="namensschild ${p.id === z.ich.id ? 'ich' : ''} ${p.online ? '' : 'weg'}" style="--r:${drehung(p.id)}deg">${teams ? teamPunkt(p.team) : ''}${esc(p.name)}</li>`).join(''));
  }
  $('#teamwahl').addEventListener('click', (e) => {
    const b = e.target.closest('[data-team]');
    if (b) socket.emit('kind:team', { team: Number(b.dataset.team) });
  });

  function musterHtml(muster) {
    if (!muster || !muster.length) return '';
    const anzahl = muster.filter((m) => m.art === 'buchstabe' || m.art === 'leer').length;
    return muster.map((m) => {
      if (m.art === 'luecke') return '<span class="lu"></span>';
      if (m.art === 'zeichen') return `<span class="bs zz">${esc(m.z)}</span>`;
      if (m.art === 'leer') return '<span class="bs leer">_</span>';
      return `<span class="bs">${esc(m.z)}</span>`;
    }).join('') + `<span class="anzahl">${anzahl}</span>`;
  }

  function maleZeichnen(z, s) {
    const zeichnerName = s.zeichner ? s.zeichner.name : '';
    document.body.classList.toggle('ist-zeichner', s.istZeichner && s.phase === 'zeichnen');
    $('#z-runde').textContent = `Runde ${s.runde} von ${s.runden}`;
    zTimer.setze(s.restMs, s.phasenDauer, z.raum.pause, s.phase === 'zeichnen' || s.phase === 'wahl');
    const musterEl = $('#z-muster');
    setzeHtml(musterEl, musterHtml(s.muster));
    musterEl.classList.toggle('klar', !!(s.istZeichner || s.hatGeraten));

    let hinweis = '';
    if (s.phase === 'wahl') hinweis = s.istZeichner ? 'Such dir ein Wort aus!' : `${zeichnerName} sucht sich ein Wort aus …`;
    else if (s.phase === 'zeichnen') {
      if (s.istZeichner) hinweis = 'Du zeichnest. Keine Buchstaben oder Zahlen malen!';
      else if (s.hatGeraten) hinweis = 'Du hast es! Nicht verraten.';
      else hinweis = `${zeichnerName} zeichnet. Rate mit!`;
    } else if (s.phase === 'aufloesung') hinweis = 'Aufgelöst!';
    else if (s.phase === 'warten') hinweis = 'Warte auf Mitspielende …';
    $('#z-hinweis').textContent = hinweis;

    $('#z-werkzeuge').hidden = !(s.istZeichner && s.phase === 'zeichnen');
    $('#z-blatt').classList.toggle('darf-zeichnen', darfZeichnen());

    const eingabe = $('#z-eingabe');
    const wissend = s.istZeichner || s.hatGeraten;
    eingabe.placeholder = z.ich.stumm ? 'Du bist gerade stumm. Raten geht trotzdem.'
      : wissend && s.phase === 'zeichnen' ? 'Nachricht an alle, die es wissen …' : 'Dein Tipp …';
    eingabe.disabled = z.raum.pause || (s.istZeichner && s.phase === 'wahl');

    const ueber = $('#z-ueber');
    let html = '';
    if (s.phase === 'wahl' && s.istZeichner && s.auswahl) {
      html = `<div class="wahlkarte"><h2>Was möchtest du zeichnen?</h2><div class="wahlknoepfe">${s.auswahl.map((w, i) =>
        `<button type="button" class="knopf" data-wahl="${i}">${esc(w)}</button>`).join('')}</div></div>`;
    } else if (s.phase === 'wahl') {
      html = `<div class="wartekarte"><h2>${esc(zeichnerName)} sucht ein Wort aus</h2><p style="margin:6px 0 0;font-weight:700">Gleich geht es los. Mach dich bereit!</p></div>`;
    } else if (s.phase === 'aufloesung' && s.aufloesung) {
      const a = s.aufloesung;
      const grund = { alle: 'Alle haben es erraten!', zeit: 'Die Zeit ist um.', zeichnerWeg: `${a.zeichner} ist nicht mehr da.`, uebersprungen: 'Die Runde wurde übersprungen.', zuWenige: 'Zu wenige Mitspielende.' }[a.grund] || '';
      const zeilen = a.geraten.map((g) => `<li><span>${esc(g.name)}</span><span>+${g.punkte}</span></li>`).join('');
      html = `<div class="aufloesekarte"><h2>${esc(grund)}</h2>` +
        (a.wort ? `<div class="wort">${esc(a.wort)}</div>` : '') +
        (a.geraten.length ? `<ul>${zeilen}${a.zeichnerPunkte ? `<li><span>${esc(a.zeichner)} (gezeichnet)</span><span>+${a.zeichnerPunkte}</span></li>` : ''}</ul>`
          : a.wort ? '<p style="margin:0;font-weight:700">Diesmal hat es niemand erraten.</p>' : '') + '</div>';
    } else if (s.phase === 'warten') {
      html = '<div class="wartekarte"><h2>Wir brauchen mindestens zwei Kinder</h2></div>';
    }
    ueber.hidden = !html;
    if (setzeHtml(ueber, html) && html) karteHerein(ueber.firstElementChild, s.zugId + s.phase);
  }
  $('#z-ueber').addEventListener('click', (e) => {
    const b = e.target.closest('[data-wahl]');
    if (b) socket.emit('kind:spiel', { art: 'waehle', index: Number(b.dataset.wahl) });
  });

  // ----- Stadt, Land, Fluss -----
  let felderSchluessel = '';
  let sendeTimer = null;
  let eingesammeltFuer = '';

  function leseAntworten() {
    return Array.from(document.querySelectorAll('#s-felder input')).map((i) => i.value.trim().slice(0, 40));
  }
  function sendeAntworten() {
    clearTimeout(sendeTimer);
    sendeTimer = null;
    socket.emit('kind:spiel', { art: 'antworten', antworten: leseAntworten() });
  }

  function maleSlf(z, s) {
    document.body.classList.remove('ist-zeichner');
    $('#s-buchstabe').textContent = s.buchstabe || '';
    $('#s-runde').textContent = `Runde ${s.runde} von ${s.runden}`;
    sTimer.setze(s.restMs, s.phasenDauer, z.raum.pause, s.phase === 'schreiben');
    $('#s-timer').hidden = s.phase !== 'schreiben';

    const schreiben = s.phase === 'schreiben' || s.phase === 'einsammeln';
    $('#s-schreiben').hidden = !schreiben;
    $('#s-auswertung').hidden = s.phase !== 'auswertung';
    $('#s-tafel').hidden = s.phase !== 'tafel';

    const hinweise = {
      schreiben: s.modus === 'stopp' ? 'Alles ausgefüllt? Dann ruf Stopp!' : 'Schreib zu jeder Kategorie ein Wort mit diesem Buchstaben.',
      einsammeln: 'Stifte weg! Die Antworten werden eingesammelt.',
      auswertung: 'Auswertung',
      tafel: 'Rundentafel',
    };
    $('#s-hinweis').textContent = hinweise[s.phase] || '';

    const schluessel = s.runde + '|' + s.kategorien.join('|');
    if (schluessel !== felderSchluessel) {
      felderSchluessel = schluessel;
      eingesammeltFuer = '';
      $('#s-felder').innerHTML = s.kategorien.map((k, i) =>
        `<label class="feld slf-feld"><span>${esc(k)}</span><input class="eingabe" maxlength="40" data-i="${i}" spellcheck="false" autocapitalize="words" enterkeyhint="next"></label>`).join('');
      karteHerein($('#s-schreiben'), schluessel);
    }
    if (s.meineAntworten) {
      document.querySelectorAll('#s-felder input').forEach((inp, i) => {
        if (!inp.value && s.meineAntworten[i]) inp.value = s.meineAntworten[i];
      });
    }
    const gesperrt = z.raum.pause || s.phase !== 'schreiben' || s.ichFertig;
    document.querySelectorAll('#s-felder input').forEach((inp) => { inp.disabled = gesperrt; });
    const fertigKnopf = $('#s-fertig');
    fertigKnopf.textContent = s.modus === 'stopp' ? 'Stopp!' : 'Abgeben';
    fertigKnopf.disabled = gesperrt;
    fertigKnopf.hidden = s.ichFertig;
    $('#s-abgegeben').textContent = s.ichFertig ? (s.modus === 'stopp' && s.stoppVon === z.ich.name ? 'Du hast Stopp gerufen!' : 'Abgegeben. Warte auf die anderen.') : '';
    const stopp = $('#s-stopp');
    stopp.hidden = !s.stoppVon;
    stopp.textContent = s.stoppVon ? `${s.stoppVon} hat Stopp gerufen! Noch schnell fertig schreiben.` : '';

    if (s.phase === 'einsammeln' && eingesammeltFuer !== schluessel) {
      eingesammeltFuer = schluessel;
      sendeAntworten();
    }

    if (s.phase === 'auswertung' && s.auswertung) {
      const a = s.auswertung;
      $('#s-kat').textContent = `${a.kategorie} · ${s.buchstabe}`;
      karteHerein($('#s-auswertung'), schluessel + '|' + a.katIndex);
      setzeHtml($('#s-antworten'), a.eintraege.map((e) => {
        const eigen = e.id === z.ich.id;
        const daumen = eigen ? '<span class="stimmen">deine Antwort</span>' : !e.text ? '' :
          `<button type="button" class="daumen hoch ${e.meineStimme === 1 ? 'gewaehlt' : ''}" data-stimme="1" data-id="${esc(e.id)}" data-kat="${a.katIndex}" aria-label="Daumen hoch">${ICON.hoch}${e.hoch}</button>
           <button type="button" class="daumen runter ${e.meineStimme === -1 ? 'gewaehlt' : ''}" data-stimme="-1" data-id="${esc(e.id)}" data-kat="${a.katIndex}" aria-label="Daumen runter">${ICON.runter}${e.runter}</button>`;
        return `<li class="antwort ${e.gueltig ? '' : 'ungueltig'}">
          <div><div class="wer">${teamPunkt(z.raum.wertung === 'teams' ? e.team : null)}${esc(e.name)}</div><div class="was ${e.text ? '' : 'leer'}">${e.text ? esc(e.text) : 'nichts geschrieben'}</div></div>
          <div class="rechts">${daumen}<span class="pkt">${e.punkte}</span></div></li>`;
      }).join(''));
    }

    if (s.phase === 'tafel' && s.tafel) {
      karteHerein($('#s-tafel').firstElementChild, schluessel + '|tafel');
      setzeHtml($('#s-tafelliste'), ranglisteHtml(s.tafel, z.ich.id, z.raum.wertung === 'teams', true));
    }
  }

  $('#s-felder').addEventListener('input', () => {
    clearTimeout(sendeTimer);
    sendeTimer = setTimeout(sendeAntworten, 500);
  });
  $('#s-felder').addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const felder = Array.from(document.querySelectorAll('#s-felder input'));
    const i = felder.indexOf(e.target);
    if (i >= 0 && i < felder.length - 1) felder[i + 1].focus();
  });
  $('#s-form').addEventListener('submit', (e) => {
    e.preventDefault();
    clearTimeout(sendeTimer);
    socket.emit('kind:spiel', { art: 'fertig', antworten: leseAntworten() }, (antwort) => {
      if (antwort && !antwort.ok && antwort.fehler) G.melde(antwort.fehler, 'fehler');
    });
  });
  $('#s-antworten').addEventListener('click', (e) => {
    const b = e.target.closest('[data-stimme]');
    if (!b || !zustand || zustand.raum.pause) return;
    const wert = Number(b.dataset.stimme);
    const neu = b.classList.contains('gewaehlt') ? 0 : wert;
    socket.emit('kind:spiel', { art: 'stimme', kat: Number(b.dataset.kat), id: b.dataset.id, wert: neu });
  });

  function ranglisteHtml(liste, ichId, teams, mitPlus) {
    let platz = 0;
    let vorher = null;
    return liste.map((p, i) => {
      if (p.punkte !== vorher) { platz = i + 1; vorher = p.punkte; }
      return `<li class="${platz === 1 && p.punkte > 0 ? 'erster' : ''} ${p.id === ichId ? 'ich' : ''}">
        <span class="platz">${platz}.</span><span class="n">${teams ? teamPunkt(p.team) : ''}${esc(p.name)}</span><span class="p">${mitPlus ? '+' : ''}${p.punkte}</span></li>`;
    }).join('');
  }

  function maleEnde(z) {
    document.body.classList.remove('ist-zeichner');
    const teams = z.raum.wertung === 'teams' && z.teams;
    if (teams) {
      const sortiert = z.teams.slice().sort((a, b) => b.punkte - a.punkte);
      setzeHtml($('#e-teams'), `<p class="hand" style="font-size:30px;margin:6px 0 4px;text-align:center">Gewonnen hat <span class="marker">${esc(sortiert[0].name)}</span></p>
        <ol class="rangliste" style="margin-bottom:18px">${sortiert.map((t, i) => `<li class="${i === 0 ? 'erster' : ''}"><span class="platz">${i + 1}.</span><span class="n">${teamPunkt(t.index)}${esc(t.name)}</span><span class="p">${t.punkte}</span></li>`).join('')}</ol>`);
    } else setzeHtml($('#e-teams'), '');
    setzeHtml($('#e-liste'), ranglisteHtml(z.spieler, z.ich.id, !!teams, false));
    karteHerein($('#v-ende').firstElementChild, 'ende');
  }
})();
