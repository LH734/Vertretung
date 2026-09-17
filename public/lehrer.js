/* Bühne und Regie der Lehrkraft. Unter /buehne?code=XXXX läuft dieselbe Seite rein passiv. */
(function () {
  'use strict';
  const G = window.Gemeinsam;
  const { $, esc, setzeHtml, karteHerein, teamPunkt, TEAMS } = G;

  const SPEICHER = 'spieleraum-lehrer';
  const passiv = location.pathname.replace(/\/+$/, '') === '/buehne';
  const ICON = {
    stift: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M4 20l1.2-4.2L16 5l3 3L8.2 18.8z"/><path d="M14 7l3 3"/></svg>',
    stumm: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"><path d="M4 9.5h3.5L12 5v14l-4.5-4.5H4z"/><path d="M16 9.5l5 5M21 9.5l-5 5"/></svg>',
    laut: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"><path d="M4 9.5h3.5L12 5v14l-4.5-4.5H4z"/><path d="M16 9a4.5 4.5 0 010 6M18.5 6.5a8 8 0 010 11"/></svg>',
    raus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    hoch: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" style="vertical-align:-3px"><path d="M7 11v9H3.5v-9z"/><path d="M7 11l4-7.5c1.6 0 2.6 1 2.3 2.8L12.8 10H19a2 2 0 012 2.3l-1.2 6A2.4 2.4 0 0117.4 20H7"/></svg>',
    runter: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" style="vertical-align:-5px"><g transform="rotate(180 12 12)"><path d="M7 11v9H3.5v-9z"/><path d="M7 11l4-7.5c1.6 0 2.6 1 2.3 2.8L12.8 10H19a2 2 0 012 2.3l-1.2 6A2.4 2.4 0 0117.4 20H7"/></g></svg>',
  };

  let zustand = null;
  let raumCode = null;
  const socket = G.verbinde();

  if (passiv) {
    $('#pult').classList.add('nur-buehne');
    $('#regie').remove();
    $('#b-anmelden').remove();
    document.title = 'Spieleraum · Bühne';
  } else {
    document.title = 'Spieleraum · Regie';
  }

  // Render-Dienst wach halten, solange der Tab offen ist.
  setInterval(() => { fetch('/healthz', { cache: 'no-store' }).catch(() => {}); }, 10 * 60 * 1000);

  function leseSitzung() {
    try { return JSON.parse(sessionStorage.getItem(SPEICHER) || 'null'); } catch (e) { return null; }
  }
  function schreibeSitzung(s) {
    try { sessionStorage.setItem(SPEICHER, JSON.stringify(s)); } catch (e) { /* ohne Speicher */ }
  }

  // ------------------------------------------------------------
  // Verbindung
  // ------------------------------------------------------------
  socket.on('connect', () => {
    if (passiv) {
      const code = (new URLSearchParams(location.search).get('code') || '').toUpperCase();
      socket.emit('buehne:beitreten', { code }, (a) => {
        if (!a || !a.ok) {
          $('#b-verbinde-text').textContent = 'Diesen Raum gibt es nicht. Prüfe den Code in der Adresse: /buehne?code=ABCD';
          return;
        }
        raumCode = a.code;
      });
      return;
    }
    raumOeffnen();
  });

  // Raum übernehmen (nach Neuladen) oder neu öffnen, bei Bedarf mit Passwort
  function raumOeffnen(passwort) {
    const alt = leseSitzung() || {};
    const knopf = $('#anmelden-knopf');
    knopf.disabled = true;
    socket.emit('lehrer:erstellen', { code: alt.code, schluessel: alt.schluessel, passwort }, (a) => {
      knopf.disabled = false;
      if (!a) return;
      if (!a.ok) {
        if (a.passwortNoetig) zeigeAnmeldung(a.fehler);
        else G.melde(a.fehler || 'Das hat nicht geklappt.', 'fehler');
        return;
      }
      if (alt.code && alt.code !== a.code) G.melde('Der alte Raum war abgelaufen. Hier ist ein neuer Code.', 'fehler');
      raumCode = a.code;
      schreibeSitzung({ code: a.code, schluessel: a.schluessel });
      $('#passwort').value = '';
      $('#b-anmelden').hidden = true;
      $('#pult').classList.remove('nur-anmeldung');
      $('#r-verbindung').textContent = 'verbunden';
    });
  }

  function zeigeAnmeldung(fehler) {
    zustand = null;
    zeige(null);
    $('#codeecke').hidden = true;
    $('#pult').classList.add('nur-anmeldung');
    $('#b-anmelden').hidden = false;
    $('#anmelde-fehler').textContent = fehler || '';
    const feld = $('#passwort');
    if (fehler) feld.select();
    feld.focus();
  }

  if (!passiv) {
    $('#anmeldeform').addEventListener('submit', (e) => {
      e.preventDefault();
      const passwort = $('#passwort').value;
      if (!passwort) return;
      raumOeffnen(passwort);
    });
    $('#passwort').addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' || e.isComposing) return;
      e.preventDefault();
      $('#anmeldeform').requestSubmit();
    });
  }
  socket.on('disconnect', () => {
    const el = $('#r-verbindung');
    if (el) el.textContent = 'Verbindung weg …';
  });
  socket.on('raumWeg', () => { G.melde('Der Raum ist abgelaufen.', 'fehler'); setTimeout(() => location.reload(), 1500); });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && !socket.connected) socket.connect();
  });

  socket.on('zustand', (z) => {
    zustand = z;
    male();
  });

  // ------------------------------------------------------------
  // Chat-Feed und Zeichnung auf der Bühne
  // ------------------------------------------------------------
  const feed = $('#bz-chat');
  function feedAnhaengen(e) {
    const li = document.createElement('li');
    li.className = e.art;
    if (e.art === 'rate') li.innerHTML = `${teamPunkt(zustand && zustand.raum.wertung === 'teams' ? e.team : null)}<b>${esc(e.name)}:</b> ${esc(e.text)}`;
    else li.textContent = e.text;
    feed.appendChild(li);
    while (feed.children.length > 40) feed.removeChild(feed.firstChild);
    feed.scrollTop = feed.scrollHeight;
  }
  socket.on('chat', feedAnhaengen);
  socket.on('chat:alle', (liste) => { feed.innerHTML = ''; (liste || []).forEach(feedAnhaengen); });
  socket.on('chat:leeren', () => { feed.innerHTML = ''; });

  const flaeche = new G.Zeichenflaeche($('#bz-canvas'));
  socket.on('zeichnen:alles', (d) => flaeche.setzeAlles(d.zugId, d.ops));
  socket.on('zeichnen:op', (d) => { if (d.zugId === flaeche.zugId) flaeche.wendeAn(d.op); });

  const bzTimer = new G.Zeitkreis($('#bz-timer'));
  const bsTimer = new G.Zeitkreis($('#bs-timer'));

  // ------------------------------------------------------------
  // Hilfen
  // ------------------------------------------------------------
  function drehung(id) {
    let h = 0;
    for (const c of String(id)) h = (h * 31 + c.charCodeAt(0)) | 0;
    return ((Math.abs(h) % 7) - 3) * 0.9;
  }

  const qrCache = {};
  function qrFuer(code) {
    const url = location.origin + '/?code=' + code;
    if (!qrCache[url]) qrCache[url] = window.QR.alsSvg(url);
    return qrCache[url];
  }

  function zeige(id) {
    for (const b of ['b-verbinde', 'b-lobby', 'b-zeichnen', 'b-slf', 'b-ende']) $('#' + b).hidden = b !== id;
  }

  function ranglisteHtml(liste, teams, plus) {
    let platz = 0;
    let vorher = null;
    return liste.map((p, i) => {
      if (p.punkte !== vorher) { platz = i + 1; vorher = p.punkte; }
      const weg = p.online === false ? 'weg' : '';
      return `<li class="${platz === 1 && p.punkte > 0 ? 'erster' : ''} ${weg}"><span class="platz">${platz}.</span><span class="n">${teams ? teamPunkt(p.team) : ''}${esc(p.name)}</span><span class="p">${plus ? '+' : ''}${p.punkte}</span></li>`;
    }).join('');
  }

  function teamlisteHtml(teams) {
    const liste = teams.slice().sort((a, b) => b.punkte - a.punkte).map((t) => ({ ...t, team: t.index }));
    return ranglisteHtml(liste, true, false);
  }

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

  // ------------------------------------------------------------
  // Bühne
  // ------------------------------------------------------------
  function male() {
    const z = zustand;
    if (!z) return;
    const code = z.raum.code;
    const s = z.spiel;
    const teams = z.raum.wertung === 'teams';
    $('#pause').hidden = !z.raum.pause;

    // Code und QR: groß in der Lobby, klein in der Ecke während des Spiels
    $('#codeecke').hidden = !s;
    $('#ecke-code').textContent = code;
    setzeHtml($('#ecke-qr'), qrFuer(code));

    if (!s) maleLobby(z, teams);
    else if (s.phase === 'ende') maleEnde(z, teams);
    else if (s.art === 'zeichnen') maleZeichnen(z, s, teams);
    else maleSlf(z, s, teams);

    if (!passiv) maleRegie(z);
  }

  function maleLobby(z, teams) {
    zeige('b-lobby');
    const code = z.raum.code;
    $('#b-adresse').textContent = location.host;
    $('#b-code').textContent = code;
    setzeHtml($('#b-qr'), qrFuer(code));
    const n = z.spieler.length;
    $('#b-zaehler').textContent = n === 0 ? 'Noch niemand da.' : n === 1 ? '1 Kind ist da' : `${n} Kinder sind da`;
    const schild = (p) => `<li class="namensschild ${p.online ? '' : 'weg'}" style="--r:${drehung(p.id)}deg">${esc(p.name)}</li>`;
    const nachName = z.spieler.slice().sort((a, b) => a.name.localeCompare(b.name, 'de'));
    if (teams) {
      const ohne = nachName.filter((p) => p.team === null);
      setzeHtml($('#b-namen'), '<div class="b-teams">' + TEAMS.map((t, i) =>
        `<div class="b-team" style="--team:${t.farbe}"><h3>${esc(t.name)}</h3><ul class="namensschilder">${nachName.filter((p) => p.team === i).map(schild).join('')}</ul></div>`).join('') + '</div>' +
        (ohne.length ? `<h3 class="hand" style="font-size:28px;margin:22px 0 8px">Noch ohne Team</h3><ul class="namensschilder">${ohne.map(schild).join('')}</ul>` : ''));
    } else {
      setzeHtml($('#b-namen'), `<ul class="namensschilder">${nachName.map(schild).join('')}</ul>`);
    }
  }

  function maleSeitentafel(z, teams, titelEl, listeEl) {
    if (teams && z.teams) {
      titelEl.textContent = 'Teams';
      setzeHtml(listeEl, teamlisteHtml(z.teams));
      listeEl.classList.remove('lang');
      listeEl.classList.add('teamliste');
    } else {
      const top = z.spieler.slice(0, 10);
      titelEl.textContent = z.spieler.length > 10 ? 'Die ersten zehn' : 'Punkte';
      setzeHtml(listeEl, ranglisteHtml(top, false, false));
      listeEl.classList.remove('teamliste');
      listeEl.classList.toggle('lang', top.length > 7);
    }
  }

  function maleZeichnen(z, s, teams) {
    zeige('b-zeichnen');
    const name = s.zeichner ? s.zeichner.name : '';
    $('#bz-runde').textContent = `Runde ${s.runde} von ${s.runden}`;
    bzTimer.setze(s.restMs, s.phasenDauer, z.raum.pause, s.phase === 'zeichnen' || s.phase === 'wahl');
    setzeHtml($('#bz-muster'), musterHtml(s.muster));
    const ratende = Math.max(0, z.spieler.filter((p) => p.online).length - 1);
    let hinweis = '';
    if (s.phase === 'wahl') hinweis = `${name} sucht ein Wort aus …`;
    else if (s.phase === 'zeichnen') hinweis = `${name} zeichnet · ${s.geraten.length} von ${ratende} haben es`;
    else if (s.phase === 'warten') hinweis = 'Warte auf mindestens zwei Kinder …';
    $('#bz-hinweis').textContent = hinweis;
    maleSeitentafel(z, teams, $('#bz-tafel-titel'), $('#bz-tafel'));

    const ueber = $('#bz-ueber');
    let html = '';
    if (s.phase === 'wahl') {
      html = `<div class="wartekarte b-karte"><h2>${esc(name)} ist dran</h2><p style="margin:6px 0 0;font-weight:700">Gleich geht es los.</p></div>`;
    } else if (s.phase === 'aufloesung' && s.aufloesung) {
      const a = s.aufloesung;
      const grund = { alle: 'Alle haben es erraten!', zeit: 'Die Zeit ist um.', zeichnerWeg: `${a.zeichner} ist nicht mehr da.`, uebersprungen: 'Übersprungen.', zuWenige: 'Zu wenige Mitspielende.' }[a.grund] || '';
      const zeilen = a.geraten.slice(0, 6).map((g) => `<li><span>${esc(g.name)}</span><span>+${g.punkte}</span></li>`).join('');
      html = `<div class="aufloesekarte b-karte"><h2>${esc(grund)}</h2>` +
        (a.wort ? `<div class="wort">${esc(a.wort)}</div>` : '') +
        (a.geraten.length ? `<ul>${zeilen}${a.geraten.length > 6 ? `<li><span>und ${a.geraten.length - 6} weitere</span><span></span></li>` : ''}${a.zeichnerPunkte ? `<li><span>${esc(a.zeichner)} (gezeichnet)</span><span>+${a.zeichnerPunkte}</span></li>` : ''}</ul>`
          : a.wort ? '<p style="margin:0;font-weight:700">Diesmal hat es niemand erraten.</p>' : '') + '</div>';
    } else if (s.phase === 'warten') {
      html = '<div class="wartekarte b-karte"><h2>Wir brauchen mindestens zwei Kinder</h2></div>';
    }
    ueber.hidden = !html;
    if (setzeHtml(ueber, html) && html) karteHerein(ueber.firstElementChild, s.zugId + s.phase);
  }

  function maleSlf(z, s, teams) {
    zeige('b-slf');
    $('#bs-buchstabe').textContent = s.buchstabe || '';
    $('#bs-runde').textContent = `Runde ${s.runde} von ${s.runden}`;
    bsTimer.setze(s.restMs, s.phasenDauer, z.raum.pause, s.phase === 'schreiben');
    $('#bs-timer').hidden = s.phase !== 'schreiben';
    const hinweise = {
      schreiben: s.modus === 'stopp' ? 'Wer alles ausgefüllt hat, ruft Stopp.' : 'Schreibt zu jeder Kategorie ein Wort.',
      einsammeln: 'Stifte weg!',
      auswertung: 'Auswertung: Stimmt das?',
      tafel: `Rundentafel · Runde ${s.runde}`,
    };
    $('#bs-hinweis').textContent = hinweise[s.phase] || '';

    $('#bs-schreiben').hidden = !(s.phase === 'schreiben' || s.phase === 'einsammeln');
    $('#bs-auswertung').hidden = s.phase !== 'auswertung';
    $('#bs-tafel').hidden = s.phase !== 'tafel';

    if (s.phase === 'schreiben' || s.phase === 'einsammeln') {
      setzeHtml($('#bs-kategorien'), s.kategorien.map((k, i) => `<li style="--r:${((i * 37) % 5 - 2) * 0.7}deg">${esc(k)}</li>`).join(''));
      karteHerein($('#bs-kategorien'), 'r' + s.runde);
      const online = z.spieler.filter((p) => p.online);
      const fertig = new Set(s.fertigIds);
      $('#bs-fortschritt').textContent = `${online.filter((p) => fertig.has(p.id)).length} von ${online.length} haben abgegeben`;
      setzeHtml($('#bs-fertige'), online.slice().sort((a, b) => a.name.localeCompare(b.name, 'de')).map((p) =>
        `<li class="namensschild ${fertig.has(p.id) ? 'fertig' : ''}" style="--r:${drehung(p.id)}deg">${fertig.has(p.id) ? '✓ ' : ''}${esc(p.name)}</li>`).join(''));
      const stopp = $('#bs-stopp');
      stopp.hidden = !s.stoppVon;
      stopp.textContent = s.stoppVon ? `${s.stoppVon} hat Stopp gerufen!` : '';
    }

    if (s.phase === 'auswertung' && s.auswertung) {
      const a = s.auswertung;
      $('#bs-katzaehler').textContent = `Kategorie ${a.katIndex + 1} von ${s.kategorien.length}`;
      $('#bs-kat').innerHTML = `<span class="marker">${esc(a.kategorie)}</span> mit ${esc(s.buchstabe)}`;
      karteHerein($('#bs-auswertung'), s.runde + '-' + a.katIndex);
      setzeHtml($('#bs-antworten'), a.eintraege.map((e) => `
        <li class="antwort ${e.gueltig ? '' : 'ungueltig'}">
          <div><div class="wer">${teams ? teamPunkt(e.team) : ''}${esc(e.name)}</div><div class="was ${e.text ? '' : 'leer'}">${e.text ? esc(e.text) : 'leer'}</div></div>
          <div class="rechts">
            ${e.hoch || e.runter ? `<span class="stimmen">${ICON.hoch} ${e.hoch} ${ICON.runter} ${e.runter}</span>` : ''}
            ${e.text ? `<button type="button" class="urteil ${e.gueltig ? 'ja' : 'nein'}" data-id="${esc(e.id)}" data-gueltig="${e.gueltig ? 0 : 1}" data-kat="${a.katIndex}" title="Zum Umschalten klicken">${e.gueltig ? 'gültig' : 'ungültig'}</button>` : '<span class="stempel nein">leer</span>'}
            <span class="pkt">${e.punkte}</span>
          </div>
        </li>`).join(''));
      $('#bs-zurueck').disabled = a.katIndex === 0;
      $('#bs-weiter').textContent = a.katIndex >= s.kategorien.length - 1 ? 'Zur Rundentafel ›' : 'Nächste Kategorie ›';
    }

    if (s.phase === 'tafel' && s.tafel) {
      karteHerein($('#bs-tafel'), 'tafel' + s.runde);
      setzeHtml($('#bs-tafel-runde'), ranglisteHtml(s.tafel.slice(0, 12), teams, true));
      if (teams && z.teams) {
        $('#bs-gesamt-titel').textContent = 'Teams gesamt';
        setzeHtml($('#bs-tafel-gesamt'), teamlisteHtml(z.teams));
        $('#bs-tafel-gesamt').classList.add('teamliste');
      } else {
        $('#bs-gesamt-titel').textContent = 'Gesamt';
        setzeHtml($('#bs-tafel-gesamt'), ranglisteHtml(z.spieler.slice(0, 12), false, false));
      }
      $('#bs-naechste').textContent = s.runde >= s.runden ? 'Zum Endergebnis ›' : 'Nächste Runde ›';
    }
  }

  function maleEnde(z, teams) {
    zeige('b-ende');
    karteHerein($('#b-ende'), 'ende');
    const oben = teams && z.teams
      ? z.teams.slice().sort((a, b) => b.punkte - a.punkte).map((t) => ({ name: t.name, punkte: t.punkte, team: t.index }))
      : z.spieler;
    const stufe = (p, nr) => (p ? `<div class="stufe s${nr}"><div class="z">${nr}</div><div class="n">${teams ? teamPunkt(p.team) : ''}${esc(p.name)}</div><div class="p">${p.punkte}</div></div>` : '<div class="stufe" style="visibility:hidden"></div>');
    setzeHtml($('#be-treppe'), stufe(oben[1], 2) + stufe(oben[0], 1) + stufe(oben[2], 3));
    $('#be-titel').textContent = teams ? 'Alle Kinder' : 'Alle Punkte';
    setzeHtml($('#be-liste'), ranglisteHtml(z.spieler.slice(0, 14), teams, false));
  }

  // Klicks auf der Bühne (nur Lehrkraft)
  if (!passiv) {
    $('#bs-antworten').addEventListener('click', (e) => {
      const b = e.target.closest('.urteil');
      if (!b) return;
      socket.emit('lehrer:spiel', { art: 'gueltig', kat: Number(b.dataset.kat), id: b.dataset.id, gueltig: b.dataset.gueltig === '1' });
    });
    $('#bs-zurueck').addEventListener('click', () => socket.emit('lehrer:spiel', { art: 'kategorie', richtung: -1 }));
    $('#bs-weiter').addEventListener('click', () => socket.emit('lehrer:spiel', { art: 'kategorie', richtung: 1 }));
    $('#bs-naechste').addEventListener('click', () => socket.emit('lehrer:spiel', { art: 'weiter' }));
  }

  // ------------------------------------------------------------
  // Regie
  // ------------------------------------------------------------
  if (passiv) return;

  let umbenennenId = null;
  let kategorienGebaut = '';

  function setzeWert(el, wert) {
    if (document.activeElement === el) return;
    if (el.value !== String(wert)) el.value = wert;
  }
  function markiereUmschalter(el, wert) {
    el.querySelectorAll('button').forEach((b) => b.classList.toggle('an', b.dataset.wert === wert));
  }
  function schicke(teil) {
    socket.emit('lehrer:einstellungen', teil);
  }

  function maleRegie(z) {
    const e = z.einstellungen;
    const s = z.spiel;
    $('#r-code').textContent = z.raum.code;
    $('#r-buehne-link').href = '/buehne?code=' + z.raum.code;

    markiereUmschalter($('#r-spiel'), e.spiel);
    $('#r-zeichnen').hidden = e.spiel !== 'zeichnen';
    $('#r-slf').hidden = e.spiel !== 'slf';

    setzeWert($('#rz-runden'), e.zeichnen.runden);
    setzeWert($('#rz-sekunden'), e.zeichnen.sekunden);
    const listen = Object.entries(z.listen.begriffe);
    const optionen = listen.map(([n, anzahl]) => `<option value="${esc(n)}">${esc(n)} (${anzahl})</option>`).join('') +
      '<option value="alle">Alle Listen gemischt</option><option value="eigene">Nur eigene Begriffe</option>';
    if (setzeHtml($('#rz-liste'), optionen) || document.activeElement !== $('#rz-liste')) $('#rz-liste').value = e.zeichnen.liste;
    setzeWert($('#rz-eigene'), e.zeichnen.eigene);

    setzeWert($('#rs-runden'), e.slf.runden);
    setzeWert($('#rs-sekunden'), e.slf.sekunden);
    markiereUmschalter($('#rs-modus'), e.slf.modus);
    setzeWert($('#rs-eigene'), e.slf.eigene);
    const kat = z.listen.kategorien;
    const schluessel = JSON.stringify(kat);
    if (kategorienGebaut !== schluessel) {
      kategorienGebaut = schluessel;
      $('#rs-kategorien').innerHTML = Object.entries(kat).map(([liste, eintraege]) =>
        `<h3>${esc(liste)}</h3>` + eintraege.map((k) => `<label><input type="checkbox" value="${esc(k)}"> ${esc(k)}</label>`).join('')).join('');
    }
    const gewaehlt = new Set(e.slf.kategorien);
    $('#rs-kategorien').querySelectorAll('input').forEach((i) => { i.checked = gewaehlt.has(i.value); });
    const eigene = e.slf.eigene.split('\n').map((x) => x.trim()).filter(Boolean).length;
    const summe = e.slf.kategorien.length + eigene;
    const anzahl = $('#rs-anzahl');
    anzahl.textContent = `${summe} Kategorien gewählt (5 bis 8)`;
    anzahl.style.color = summe < 5 || summe > 8 ? 'var(--rot)' : '';

    const laeuft = !!s && s.phase !== 'ende';
    $('#r-start').textContent = laeuft ? 'Neu starten' : 'Spiel starten';
    const ueber = $('#r-ueberspringen');
    ueber.disabled = !laeuft;
    ueber.textContent = !s ? 'Runde überspringen'
      : s.art === 'slf' ? ({ schreiben: 'Schreibzeit beenden', einsammeln: 'Zur Auswertung', auswertung: 'Auswertung abschließen', tafel: 'Nächste Runde' }[s.phase] || 'Weiter')
      : s.phase === 'aufloesung' ? 'Nächster Zeichner' : 'Runde überspringen';
    $('#r-beenden').disabled = !s;
    const pause = $('#r-pause');
    pause.textContent = z.raum.pause ? 'Weiterspielen' : 'Pause';
    pause.classList.toggle('an', z.raum.pause);
    pause.classList.toggle('gold', !z.raum.pause);
    $('#r-bild').disabled = !(s && s.art === 'zeichnen');
    $('#r-wortblick').hidden = !(s && s.art === 'zeichnen' && s.phase === 'zeichnen');

    markiereUmschalter($('#r-wertung'), e.wertung);
    $('#r-teamwahl-zeile').hidden = e.wertung !== 'teams';
    markiereUmschalter($('#r-teamwahl'), e.teamWahl);

    maleSpielerliste(z);
  }

  function maleSpielerliste(z) {
    const liste = $('#r-spieler');
    if (liste.contains(document.activeElement) && document.activeElement.tagName === 'INPUT') return;
    const teams = z.raum.wertung === 'teams';
    const online = z.spieler.filter((p) => p.online).length;
    $('#r-anzahl').textContent = `${online} da · ${z.spieler.length} gesamt`;
    setzeHtml(liste, z.spieler.length ? z.spieler.map((p) => `
      <li class="spielerzeile ${p.online ? '' : 'weg'} ${p.stumm ? 'stumm' : ''}" data-id="${esc(p.id)}">
        <span class="n">${teams ? teamPunkt(p.team) : ''}${esc(p.name)}</span>
        <span class="p">${p.punkte}</span>
        <span class="aktionen">
          <button type="button" class="mini" data-aktion="umbenennen" title="Umbenennen" aria-label="${esc(p.name)} umbenennen">${ICON.stift}</button>
          <button type="button" class="mini ${p.stumm ? 'an' : ''}" data-aktion="stumm" title="${p.stumm ? 'Stummschaltung aufheben' : 'Stummschalten'}" aria-label="${esc(p.name)} stummschalten">${p.stumm ? ICON.stumm : ICON.laut}</button>
          <button type="button" class="mini" data-aktion="entfernen" title="Entfernen" aria-label="${esc(p.name)} entfernen">${ICON.raus}</button>
        </span>
        ${umbenennenId === p.id ? `<form class="umbenennen" data-umbenennen="${esc(p.id)}"><input class="eingabe" maxlength="16" value="${esc(p.name)}" aria-label="Neuer Name"><button class="knopf klein haupt" type="submit">OK</button></form>` : ''}
        ${teams ? `<div class="teamzuordnung">${TEAMS.map((t, i) => `<button type="button" data-team="${i}" style="--team:${t.farbe}" class="${p.team === i ? 'an' : ''}" title="${esc(t.name)}">${esc(t.name)}</button>`).join('')}</div>` : ''}
      </li>`).join('') : '<li class="status">Noch niemand im Raum.</li>');
    if (umbenennenId) {
      const inp = liste.querySelector('.umbenennen input');
      if (inp) { inp.focus(); inp.select(); }
    }
  }

  $('#r-spieler').addEventListener('click', (e) => {
    const zeile = e.target.closest('.spielerzeile');
    if (!zeile) return;
    const id = zeile.dataset.id;
    const knopf = e.target.closest('button');
    if (!knopf) return;
    if (knopf.dataset.team !== undefined) {
      const aktuell = knopf.classList.contains('an');
      socket.emit('lehrer:spieler', { id, aktion: 'team', team: aktuell ? null : Number(knopf.dataset.team) });
    } else if (knopf.dataset.aktion === 'umbenennen') {
      umbenennenId = umbenennenId === id ? null : id;
      $('#r-spieler').__html = null;
      maleSpielerliste(zustand);
    } else if (knopf.dataset.aktion === 'stumm') {
      socket.emit('lehrer:spieler', { id, aktion: 'stumm' });
    } else if (knopf.dataset.aktion === 'entfernen') {
      const name = zeile.querySelector('.n').textContent;
      if (confirm(`${name} wirklich aus dem Raum nehmen?`)) socket.emit('lehrer:spieler', { id, aktion: 'entfernen' });
    }
  });
  $('#r-spieler').addEventListener('submit', (e) => {
    e.preventDefault();
    const form = e.target.closest('[data-umbenennen]');
    if (!form) return;
    const name = form.querySelector('input').value.trim();
    socket.emit('lehrer:spieler', { id: form.dataset.umbenennen, aktion: 'umbenennen', name }, (a) => {
      if (a && !a.ok) G.melde(a.fehler, 'fehler');
    });
    umbenennenId = null;
    form.querySelector('input').blur();
    $('#r-spieler').__html = null;
    maleSpielerliste(zustand);
  });
  $('#r-spieler').addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && umbenennenId) {
      umbenennenId = null;
      document.activeElement.blur();
      $('#r-spieler').__html = null;
      maleSpielerliste(zustand);
    }
  });

  function umschalter(el, handler) {
    el.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-wert]');
      if (b) handler(b.dataset.wert);
    });
  }
  umschalter($('#r-spiel'), (w) => schicke({ spiel: w }));
  umschalter($('#rs-modus'), (w) => schicke({ slf: { modus: w } }));
  umschalter($('#r-wertung'), (w) => schicke({ wertung: w }));
  umschalter($('#r-teamwahl'), (w) => schicke({ teamWahl: w }));

  $('#rz-runden').addEventListener('change', (e) => schicke({ zeichnen: { runden: e.target.value } }));
  $('#rz-sekunden').addEventListener('change', (e) => schicke({ zeichnen: { sekunden: e.target.value } }));
  $('#rz-liste').addEventListener('change', (e) => schicke({ zeichnen: { liste: e.target.value } }));
  $('#rs-runden').addEventListener('change', (e) => schicke({ slf: { runden: e.target.value } }));
  $('#rs-sekunden').addEventListener('change', (e) => schicke({ slf: { sekunden: e.target.value } }));
  let textTimer = null;
  $('#rz-eigene').addEventListener('input', (e) => { clearTimeout(textTimer); textTimer = setTimeout(() => schicke({ zeichnen: { eigene: e.target.value } }), 400); });
  $('#rs-eigene').addEventListener('input', (e) => { clearTimeout(textTimer); textTimer = setTimeout(() => schicke({ slf: { eigene: e.target.value } }), 400); });
  $('#rs-kategorien').addEventListener('change', () => {
    const gewaehlt = Array.from($('#rs-kategorien').querySelectorAll('input:checked')).map((i) => i.value);
    schicke({ slf: { kategorien: gewaehlt } });
  });

  function aktuelleTexte() {
    return { zeichnen: { eigene: $('#rz-eigene').value }, slf: { eigene: $('#rs-eigene').value } };
  }

  $('#r-start').addEventListener('click', () => {
    if (zustand && zustand.spiel && zustand.spiel.phase !== 'ende' && !confirm('Das laufende Spiel abbrechen und neu starten? Die Punkte werden auf null gesetzt.')) return;
    clearTimeout(textTimer);
    socket.emit('lehrer:start', aktuelleTexte(), (a) => {
      if (a && !a.ok) G.melde(a.fehler, 'fehler');
    });
  });
  $('#r-ueberspringen').addEventListener('click', () => socket.emit('lehrer:ueberspringen'));
  $('#r-beenden').addEventListener('click', () => {
    if (confirm('Spiel beenden und zurück in die Lobby?')) socket.emit('lehrer:beenden');
  });
  $('#r-pause').addEventListener('click', () => socket.emit('lehrer:pause', { an: !(zustand && zustand.raum.pause) }));
  $('#r-bild').addEventListener('click', () => socket.emit('lehrer:bildLoeschen'));
  $('#r-chat').addEventListener('click', () => socket.emit('lehrer:chatLeeren'));

  const wortKnopf = $('#r-wort');
  const wortText = $('#r-wort-text');
  const zeigeWort = (e) => {
    e.preventDefault();
    wortText.textContent = (zustand && zustand.spiel && zustand.spiel.wort) || '';
  };
  const versteckeWort = () => { wortText.textContent = ''; };
  wortKnopf.addEventListener('pointerdown', zeigeWort);
  wortKnopf.addEventListener('pointerup', versteckeWort);
  wortKnopf.addEventListener('pointerleave', versteckeWort);
  wortKnopf.addEventListener('pointercancel', versteckeWort);

  window.addEventListener('keydown', (e) => {
    if (e.target.matches('input, textarea, select')) return;
    if (e.key === 'p' || e.key === 'P') socket.emit('lehrer:pause', { an: !(zustand && zustand.raum.pause) });
  });
})();
