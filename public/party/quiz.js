/* Quiz */
(function () {
  'use strict';
  const { esc } = window.Gemeinsam;

  // Farbe und Form, damit man die Antworten auch ohne Farben unterscheiden kann
  const FELDER = [
    { farbe: '#E94F4F', form: '<path d="M12 3l9 17H3z"/>', name: 'Dreieck' },
    { farbe: '#3A7BD5', form: '<path d="M12 2l10 10-10 10L2 12z"/>', name: 'Raute' },
    { farbe: '#E0A800', form: '<circle cx="12" cy="12" r="9.5"/>', name: 'Kreis' },
    { farbe: '#3F9A4A', form: '<rect x="3" y="3" width="18" height="18" rx="2"/>', name: 'Quadrat' },
  ];
  const form = (i) => `<svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">${FELDER[i].form}</svg>`;

  function antwortenHtml(s, o) {
    return `<div class="quiz-antworten ${o.klein ? 'klein' : ''}">${s.frage.antworten.map((a, i) => {
      const richtig = s.richtig === i;
      const falsch = s.richtig !== undefined && !richtig;
      const gewaehlt = o.wahl === i;
      return `<${o.knopf ? 'button type="button"' : 'div'} class="quiz-antwort ${richtig ? 'richtig' : ''} ${falsch ? 'falsch' : ''} ${gewaehlt ? 'gewaehlt' : ''}"
        style="--farbe:${FELDER[i].farbe}" ${o.knopf ? `data-aktion="antwort" data-wahl="${i}" ${o.aus ? 'disabled' : ''}` : ''} aria-label="${FELDER[i].name}: ${esc(a)}">
        ${form(i)}<span>${esc(a)}</span>${s.verteilung ? `<b>${s.verteilung[i]}</b>` : ''}</${o.knopf ? 'button' : 'div'}>`;
    }).join('')}</div>`;
  }

  window.Party.registriere('quiz', {
    titel: 'Quiz',
    einstellungen: [
      { feld: 'fragen', typ: 'zahl', label: 'Fragen', min: 3, max: 40 },
      { feld: 'sekunden', typ: 'zahl', label: 'Sekunden pro Frage', min: 10, max: 60, step: 5 },
      { feld: 'kategorien', typ: 'listen', label: 'Kategorien', quelle: 'quiz' },
      { feld: 'eigene', typ: 'text', label: 'Eigene Fragen, eine pro Zeile', platzhalter: 'Wie heißt unser Busfahrer? | Uwe | Otto | Kai | Jan' },
      { typ: 'hinweis', text: 'Format: Frage | richtige Antwort | falsch | falsch | falsch. Eigene Fragen kommen zuerst dran. Schnelle richtige Antworten geben mehr Punkte.' },
    ],

    zeitAktiv: (s) => ['lesen', 'frage', 'aufloesung', 'zwischenstand'].includes(s.phase),
    weiterText: (s) => ({ lesen: 'Antworten zeigen', frage: 'Auflösen', aufloesung: 'Zwischenstand', zwischenstand: 'Nächste Frage' }[s.phase]),
    status(s) {
      return { titel: `Quiz · Frage ${s.runde} von ${s.runden}`, text: s.phase === 'frage' ? `${s.beantwortet} von ${s.anzahl} haben geantwortet` : '' };
    },

    kind(z, s, H, api) {
      if (!s.frage) return { html: '' };
      const runde = `Frage ${s.runde} von ${s.runden}`;
      const ich = s.ich || {};
      const kopf = `<p class="party-klein">${esc(s.frage.kategorie)}</p><h2 class="quiz-frage">${esc(s.frage.text)}</h2>`;
      if (s.phase === 'lesen') return { runde, zeit: true, schluessel: 'l' + s.runde, hinweis: 'Gleich geht es los …', html: kopf };
      if (s.phase === 'frage') {
        return { runde, zeit: true, schluessel: 'f' + s.runde, hinweis: ich.wahl !== null ? 'Antwort gespeichert' : 'Schnell antworten!',
          html: kopf + antwortenHtml(s, { knopf: true, wahl: ich.wahl, aus: ich.wahl !== null }) };
      }
      if (s.phase === 'aufloesung') {
        const richtig = ich.wahl === s.richtig;
        if (!api.merk.ton && ich.wahl !== null) { api.merk.ton = true; window.Ton.spiele(richtig ? 'richtig' : 'falsch'); }
        return { runde, zeit: true, schluessel: 'a' + s.runde,
          html: `<div class="party-karte quiz-ergebnis ${richtig ? 'richtig' : 'falsch'}"><h2>${ich.wahl === null ? 'Keine Antwort' : richtig ? 'Richtig!' : 'Leider falsch'}</h2>
            ${richtig ? `<p class="party-gross">+${ich.gewinn}</p>${ich.serie > 1 ? `<p>${ich.serie} richtige hintereinander!</p>` : ''}` : ''}</div>
            ${kopf}${antwortenHtml(s, { klein: true, wahl: ich.wahl })}` };
      }
      if (s.phase === 'zwischenstand') {
        const platz = z.spieler.findIndex((p) => p.id === z.ich.id) + 1;
        return { runde, zeit: true, schluessel: 'z' + s.runde,
          html: `<div class="party-karte"><h2>Du bist auf Platz ${platz}</h2><p class="party-gross">${z.ich.punkte} Punkte</p></div>${H.rangliste(z.spieler, 5)}` };
      }
      return { runde, html: '' };
    },

    aktion(name, el, api) {
      if (name === 'antwort') api.sende('antwort', { wahl: Number(el.dataset.wahl) });
    },

    buehne(z, s, H) {
      if (!s.frage) return {};
      const runde = `Frage ${s.runde} von ${s.runden}`;
      const kopf = `<p class="party-klein">${esc(s.frage.kategorie)}</p><h2 class="quiz-frage gross">${esc(s.frage.text)}</h2>`;
      if (s.phase === 'lesen') return { runde, zeit: true, schluessel: 'l' + s.runde, html: `<div class="party-karte gross-karte">${kopf}</div>` };
      if (s.phase === 'frage') return { runde, zeit: true, schluessel: 'f' + s.runde, hinweis: `${s.beantwortet} von ${s.anzahl} haben geantwortet`, html: kopf + antwortenHtml(s, {}) };
      if (s.phase === 'aufloesung') {
        const schnell = s.schnellste.length ? `<p class="party-text">Am schnellsten: ${s.schnellste.map((x) => `<b>${esc(x.name)}</b> (${String(x.sekunden).replace('.', ',')} s)`).join(', ')}</p>` : '';
        return { runde, zeit: true, schluessel: 'a' + s.runde, html: kopf + antwortenHtml(s, {}) + schnell };
      }
      if (s.phase === 'zwischenstand') return { runde, zeit: true, schluessel: 'z' + s.runde, html: `<div class="party-karte"><h2>Zwischenstand</h2>${H.rangliste(z.spieler, 8)}</div>` };
      return { runde };
    },
  });
})();
