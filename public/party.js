/* Rahmen für die Partyspiele: Anmeldung der Spiele, Handy-Ansicht, Bühne, gemeinsame Bausteine.
   Jedes Spiel liegt in public/party/<name>.js und ruft Party.registriere(name, beschreibung) auf. */
(function () {
  'use strict';
  const G = window.Gemeinsam;
  const { esc, setzeHtml } = G;

  const spiele = {};
  const reihenfolge = [];

  function registriere(name, def) {
    spiele[name] = def;
    reihenfolge.push(name);
  }

  // ------------------------------------------------------------------
  // Bausteine für die Spiele
  // ------------------------------------------------------------------
  const H = {
    esc,

    // Karte, die ihren Inhalt nur zeigt, solange man sie gedrückt hält
    halteKarte(titel, inhalt, klasse) {
      return `<button type="button" class="halte-karte ${klasse || ''}">
        <span class="halte-zu"><b>${esc(titel)}</b><small>Gedrückt halten zum Anschauen</small></span>
        <span class="halte-inhalt">${inhalt}</span></button>`;
    },

    // Auswahl von Personen (Abstimmung, Nachtaktionen)
    personen(liste, o) {
      o = o || {};
      return `<div class="party-personen">${liste.map((p) => {
        const aus = o.aus ? o.aus(p) : false;
        const an = typeof o.gewaehlt === 'function' ? o.gewaehlt(p) : o.gewaehlt === p.id;
        return `<button type="button" class="party-person ${an ? 'gewaehlt' : ''} ${p.tot ? 'tot' : ''}" data-aktion="${o.aktion || 'waehle'}" data-id="${esc(p.id)}" ${aus ? 'disabled' : ''}>
          <span>${esc(p.name)}</span>${o.haken && o.haken(p) ? '<em>✓</em>' : ''}${o.zusatz ? `<small>${o.zusatz(p) || ''}</small>` : ''}</button>`;
      }).join('')}</div>`;
    },

    liste(zeilen) {
      return `<ul class="party-liste">${zeilen.map((z) => `<li>${z}</li>`).join('')}</ul>`;
    },

    rangliste(spieler, max) {
      let platz = 0;
      let vorher = null;
      return `<ol class="rangliste">${spieler.slice(0, max || 99).map((p, i) => {
        if (p.punkte !== vorher) { platz = i + 1; vorher = p.punkte; }
        return `<li class="${platz === 1 && p.punkte > 0 ? 'erster' : ''}"><span class="platz">${platz}.</span><span class="n">${esc(p.name)}</span><span class="p">${p.punkte}</span></li>`;
      }).join('')}</ol>`;
    },
  };

  // ------------------------------------------------------------------
  // Handy-Ansicht
  // ------------------------------------------------------------------
  const kind = { wurzel: null, timer: null, socket: null, z: null, s: null, merk: {} };

  function kindApi() {
    return {
      z: kind.z,
      s: kind.s,
      merk: kind.merk, // Zustand, der zwischen zwei Anzeigen erhalten bleiben soll (z. B. Auswahl)
      sende(art, daten, fertig) {
        kind.socket.emit('kind:spiel', Object.assign({ art }, daten || {}), (a) => {
          if (a && !a.ok && a.fehler) G.melde(a.fehler, 'fehler');
          if (fertig) fertig(a);
        });
      },
      melde: G.melde,
      neuMalen() { if (kind.s) maleKind(kind.z, kind.s); },
    };
  }

  function bindeHalteKarten(wurzel) {
    const auf = (e) => { const k = e.target.closest('.halte-karte'); if (k) { e.preventDefault(); k.classList.add('offen'); } };
    const zu = () => wurzel.querySelectorAll('.halte-karte.offen').forEach((k) => k.classList.remove('offen'));
    wurzel.addEventListener('pointerdown', auf);
    wurzel.addEventListener('pointerup', zu);
    wurzel.addEventListener('pointercancel', zu);
    wurzel.addEventListener('pointerleave', zu, true);
    wurzel.addEventListener('contextmenu', (e) => { if (e.target.closest('.halte-karte')) e.preventDefault(); });
  }

  function initKind(socket) {
    kind.socket = socket;
    const w = document.getElementById('v-party');
    kind.wurzel = w;
    w.innerHTML = `<div class="party-kopf"><div class="party-zeit"></div><div class="info">
      <div class="rundenzeile"></div><h1 class="party-titel"></h1><div class="hinweiszeile"></div></div></div>
      <div class="party-inhalt"></div>`;
    kind.timer = new G.Zeitkreis(w.querySelector('.party-zeit'));
    w.addEventListener('click', (e) => {
      const b = e.target.closest('[data-aktion]');
      if (!b || b.disabled || b.tagName === 'FORM' || !kind.s) return;
      const def = spiele[kind.s.art];
      if (def && def.aktion) def.aktion(b.dataset.aktion, b, kindApi());
    });
    w.addEventListener('submit', (e) => {
      const f = e.target.closest('form[data-aktion]');
      if (!f || !kind.s) return;
      e.preventDefault();
      const def = spiele[kind.s.art];
      if (def && def.aktion) def.aktion(f.dataset.aktion, f, kindApi());
    });
    bindeHalteKarten(w);
  }

  function maleKind(z, s) {
    const def = spiele[s.art];
    if (!def) return;
    if (!kind.s || kind.s.art !== s.art || kind.s.phase !== s.phase || kind.s.runde !== s.runde) kind.merk = {};
    kind.z = z;
    kind.s = s;
    const w = kind.wurzel;
    const erg = def.kind(z, s, H, kindApi()) || {};
    w.querySelector('.party-titel').textContent = def.titel;
    w.querySelector('.rundenzeile').textContent = erg.runde || '';
    w.querySelector('.hinweiszeile').textContent = erg.hinweis || '';
    const zeit = !!erg.zeit;
    kind.timer.setze(s.restMs, s.phasenDauer, z.raum.pause, zeit);
    w.querySelector('.party-zeit').hidden = !zeit;
    w.classList.toggle('party-nacht', !!erg.nacht);
    w.classList.toggle('party-vollbild', !!erg.vollbild);
    document.body.classList.toggle('im-party-vollbild', !!erg.vollbild);
    const inhalt = w.querySelector('.party-inhalt');
    const neu = setzeHtml(inhalt, erg.html || '');
    if (neu && erg.schluessel && inhalt.__schluessel !== erg.schluessel && !G.wenigBewegung && inhalt.firstElementChild) {
      inhalt.__schluessel = erg.schluessel;
      inhalt.firstElementChild.classList.add('herein');
    }
    if (def.nachMalen) def.nachMalen(inhalt, kindApi());
  }

  function verlasseKind() {
    document.body.classList.remove('im-party-vollbild');
    Object.values(spiele).forEach((d) => { if (d.verlassen) d.verlassen(); });
  }

  // ------------------------------------------------------------------
  // Bühne
  // ------------------------------------------------------------------
  const buehne = { wurzel: null, timer: null, socket: null, passiv: true, s: null, gesprochen: null };
  const STIMME = 'spieleraum-erzaehlstimme';

  function stimmeAn() {
    try { return localStorage.getItem(STIMME) === 'an'; } catch (e) { return false; }
  }

  function sprich(text) {
    if (!('speechSynthesis' in window) || !text) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'de-DE';
    u.rate = 0.92;
    const deutsch = window.speechSynthesis.getVoices().find((v) => v.lang && v.lang.startsWith('de'));
    if (deutsch) u.voice = deutsch;
    window.speechSynthesis.speak(u);
  }

  function initBuehne(wurzel, socket, passiv) {
    buehne.wurzel = wurzel;
    buehne.socket = socket;
    buehne.passiv = passiv;
    wurzel.innerHTML = `<div class="b-kopf"><div class="party-zeit"></div><div class="info">
      <div class="rundenzeile"></div><div class="hinweiszeile"></div>
      <button type="button" class="knopf klein party-stimme" data-aktion="erzaehlstimme" hidden></button></div></div>
      <div class="party-buehne"></div>`;
    buehne.timer = new G.Zeitkreis(wurzel.querySelector('.party-zeit'));
    wurzel.addEventListener('click', (e) => {
      const b = e.target.closest('[data-aktion]');
      if (!b || b.disabled || !buehne.s) return;
      if (b.dataset.aktion === 'erzaehlstimme') {
        try { localStorage.setItem(STIMME, stimmeAn() ? 'aus' : 'an'); } catch (err) { /* ohne Speicher */ }
        if (stimmeAn() && buehne.letzterText) sprich(buehne.letzterText);
        else if ('speechSynthesis' in window) window.speechSynthesis.cancel();
        maleStimme();
        return;
      }
      const def = spiele[buehne.s.art];
      if (buehne.passiv || !def || !def.buehneAktion) return;
      def.buehneAktion(b.dataset.aktion, b, { sende: (art, d) => buehne.socket.emit('lehrer:spiel', Object.assign({ art }, d || {})) });
    });
  }

  function maleStimme() {
    const k = buehne.wurzel.querySelector('.party-stimme');
    const def = buehne.s && spiele[buehne.s.art];
    k.hidden = !(def && def.erzaehler && 'speechSynthesis' in window);
    k.textContent = stimmeAn() ? 'Erzählstimme: an' : 'Erzählstimme: aus';
  }

  function maleBuehne(z, s) {
    const def = spiele[s.art];
    if (!def) return;
    buehne.s = s;
    const w = buehne.wurzel;
    const erg = def.buehne(z, s, H) || {};
    w.querySelector('.rundenzeile').textContent = erg.runde ? `${def.titel} · ${erg.runde}` : def.titel;
    w.querySelector('.hinweiszeile').textContent = erg.hinweis || '';
    const zeit = !!erg.zeit;
    buehne.timer.setze(s.restMs, s.phasenDauer, z.raum.pause, zeit);
    w.querySelector('.party-zeit').hidden = !zeit;
    w.classList.toggle('party-nacht', !!erg.nacht);
    const inhalt = w.querySelector('.party-buehne');
    const neu = setzeHtml(inhalt, erg.html || '');
    if (neu && erg.schluessel && inhalt.__schluessel !== erg.schluessel && !G.wenigBewegung && inhalt.firstElementChild) {
      inhalt.__schluessel = erg.schluessel;
      inhalt.firstElementChild.classList.add('herein');
    }
    maleStimme();
    if (erg.sprich && erg.sprich.schluessel !== buehne.gesprochen) {
      buehne.gesprochen = erg.sprich.schluessel;
      buehne.letzterText = erg.sprich.text;
      if (stimmeAn()) sprich(erg.sprich.text);
    }
  }

  // ------------------------------------------------------------------
  // Für Regie und Gruppenmodus
  // ------------------------------------------------------------------
  function status(s) {
    const def = spiele[s.art];
    return def && def.status ? def.status(s) : { titel: def ? def.titel : s.art, text: '' };
  }

  function zeitAktiv(s) {
    const def = spiele[s.art];
    return !!(def && def.zeitAktiv && def.zeitAktiv(s));
  }

  function weiterText(s) {
    const def = spiele[s.art];
    return (def && def.weiterText && def.weiterText(s)) || 'Weiter';
  }

  window.Party = {
    spiele, reihenfolge, registriere, H,
    initKind, maleKind, verlasseKind, initBuehne, maleBuehne,
    status, zeitAktiv, weiterText,
    ist: (art) => !!spiele[art],
  };
})();
