/* Wer ist der Spion? */
(function () {
  'use strict';
  const { esc } = window.Gemeinsam;

  function karte(s, H) {
    const ich = s.ich;
    if (!ich || !ich.dabei) return '<p class="party-text">Du bist ab der nächsten Runde dabei.</p>';
    if (ich.spion) {
      const auftrag = s.orte ? 'Finde heraus, an welchem Ort ihr seid.' : 'Finde heraus, um welches Wort es geht.';
      return H.halteKarte('Deine Karte', `<span class="klein">Pssst …</span><b class="gross rot">Du bist der Spion!</b>
        ${ich.thema ? `<span>Thema: <b>${esc(ich.thema)}</b></span>` : `<span>${auftrag}</span>`}`, 'spion');
    }
    if (s.orte) {
      return H.halteKarte('Deine Karte', `<span class="klein">Ihr seid hier:</span><b class="gross">${esc(ich.wort)}</b>
        <span>Deine Rolle: <b>${esc(ich.rolle || '')}</b></span>`);
    }
    return H.halteKarte('Deine Karte', `<span class="klein">Das geheime Wort</span><b class="gross">${esc(ich.wort)}</b><span>Verrate es nicht zu deutlich!</span>`);
  }

  // Im Orte-Modus: alle möglichen Orte als Spickzettel (für den Spion zum Tippen)
  function orteHtml(s, knopf) {
    if (!s.orte) return '';
    return `<details class="spion-orte" ${knopf ? 'open' : ''}><summary>Alle möglichen Orte (${s.orte.length})</summary>
      <div class="spion-ortliste">${s.orte.map((o) => knopf
        ? `<button type="button" class="party-person" data-aktion="ort" data-ort="${esc(o)}"><span>${esc(o)}</span></button>`
        : `<span>${esc(o)}</span>`).join('')}</div></details>`;
  }

  function reihe(s) {
    return s.reihenfolge.map((p, i) => `${i + 1}. ${esc(p.name)}`).join(' · ');
  }

  function ergebnisText(s) {
    const e = s.ergebnis;
    const spione = s.spione.map((p) => `<b>${esc(p.name)}</b>`).join(' und ');
    let titel;
    if (e.sieger === 'spion') titel = e.grund === 'selbst' ? 'Der Spion hat das Wort erkannt!' : 'Der Spion ist entkommen!';
    else if (e.sieger === 'spionRaet') titel = 'Enttarnt, aber das Wort erraten!';
    else titel = 'Die Gruppe gewinnt!';
    const unter = e.sieger === 'spion' && e.grund !== 'selbst'
      ? ({ gleichstand: 'Gleichstand bei der Abstimmung.', falsch: 'Ihr habt jemand anderen verdächtigt.', keine: 'Niemand hat abgestimmt.' }[e.grund] || '')
      : e.versuch ? `${s.orte ? 'Geraten' : 'Getippt'}: „${esc(e.versuch)}“` : '';
    return { titel, unter, spione };
  }

  window.Party.registriere('spion', {
    titel: 'Wer ist der Spion?',
    einstellungen: [
      { feld: 'runden', typ: 'zahl', label: 'Runden', min: 1, max: 10 },
      { feld: 'sekunden', typ: 'zahl', label: 'Fragezeit (s)', min: 60, max: 600, step: 30 },
      { feld: 'spione', typ: 'zahl', label: 'Spione ab 8 Leuten', min: 1, max: 2 },
      { feld: 'modus', typ: 'wahl', label: 'Geheimnis', optionen: [['woerter', 'Wort'], ['orte', 'Ort mit Rollen']] },
      { feld: 'thema', typ: 'schalter', label: 'Spion kennt das Thema (nur Wort)', texte: ['ja', 'nein'] },
      { feld: 'listen', typ: 'listen', label: 'Begriffe aus (nur Wort)', quelle: 'begriffe' },
      { typ: 'hinweis', text: 'Ab 3 Mitspielenden. Wort: Reihum sagt jede und jeder ein Stichwort. Ort: Alle sind am selben Ort und haben eine Rolle, reihum stellt man sich gegenseitig Fragen. Der Spion sieht die Liste aller Orte.' },
    ],

    zeitAktiv: (s) => ['karte', 'fragen', 'abstimmung', 'raten', 'aufloesung'].includes(s.phase),
    weiterText: (s) => ({ karte: 'Fragerunde starten', fragen: 'Zur Abstimmung', abstimmung: 'Abstimmung beenden', raten: 'Raten beenden', aufloesung: 'Nächste Runde' }[s.phase]),
    status(s) {
      const titel = `Spion · Runde ${s.runde} von ${s.runden}`;
      const text = { karte: 'Karten anschauen', fragen: 'Fragerunde', abstimmung: `Abstimmung · ${(s.abgestimmt || []).length} von ${s.stimmberechtigt}`, raten: 'Der Spion rät', aufloesung: 'Auflösung', warten: 'Braucht 3 Mitspielende' }[s.phase] || '';
      return { titel, text };
    },

    kind(z, s, H, api) {
      const runde = `Runde ${s.runde} von ${s.runden}`;
      const ich = s.ich || {};
      if (s.phase === 'warten') return { hinweis: 'Es braucht mindestens 3 Mitspielende.', html: '' };
      if (s.phase === 'karte' || s.phase === 'fragen') {
        const fragen = s.phase === 'fragen';
        return {
          runde, zeit: true, schluessel: 'karte' + s.runde,
          hinweis: fragen ? (s.orte ? 'Reihum: Stellt euch gegenseitig Fragen.' : 'Reihum: Jede und jeder sagt ein Stichwort.') : 'Schau dir deine Karte an, ohne dass jemand mitguckt.',
          html: `${karte(s, H)}
            <p class="party-text"><b>Reihenfolge:</b> ${reihe(s)}</p>${orteHtml(s, false)}
            ${fragen && ich.dabei ? `<div class="party-knoepfe"><button type="button" class="knopf" data-aktion="aufdecken">Ich bin der Spion und kenne ${s.orte ? 'den Ort' : 'das Wort'}</button></div>
              <p class="party-klein">Diesen Knopf sehen alle, damit niemand am Bildschirm erkennt, wer Spion ist.</p>` : ''}`,
        };
      }
      if (s.phase === 'abstimmung') {
        if (!ich.dabei) return { runde, zeit: true, html: '<p class="party-text">Die anderen stimmen ab.</p>' };
        if (ich.stimme) return { runde, zeit: true, hinweis: 'Abgestimmt', html: `<p class="party-text">Du hast abgestimmt. ${s.abgestimmt.length} von ${s.stimmberechtigt} sind fertig.</p>${karte(s, H)}` };
        const wahl = api.merk.wahl;
        return {
          runde, zeit: true, schluessel: 'abstimmung' + s.runde, hinweis: 'Tippe an, wen du verdächtigst.',
          html: `${H.personen(s.teilnehmer.filter((p) => p.id !== z.ich.id), { gewaehlt: wahl, haken: (p) => s.abgestimmt.includes(p.id) })}
            <div class="party-knoepfe"><button type="button" class="knopf haupt gross" data-aktion="abstimmen" ${wahl ? '' : 'disabled'}>Abstimmen</button></div>`,
        };
      }
      if (s.phase === 'raten') {
        const r = s.rater;
        if (r.id === z.ich.id && s.orte) {
          return { runde, zeit: true, schluessel: 'raten' + s.runde, hinweis: r.selbst ? 'Du hast dich verraten!' : 'Du wurdest enttarnt!',
            html: `<p class="party-text">An welchem Ort seid ihr? Du hast einen Versuch.</p>${orteHtml(s, true)}` };
        }
        if (r.id === z.ich.id) {
          return {
            runde, zeit: true, schluessel: 'raten' + s.runde, hinweis: r.selbst ? 'Du hast dich verraten!' : 'Du wurdest enttarnt!',
            html: `<form class="party-form" data-aktion="raten"><label class="feld"><span>Wie heißt das geheime Wort?</span>
              <input class="eingabe" name="text" maxlength="40" autocomplete="off" spellcheck="false" autofocus></label>
              <button class="knopf haupt gross" type="submit">Raten</button></form>`,
          };
        }
        return { runde, zeit: true, html: `<p class="party-gross">${esc(r.name)} ${r.selbst ? 'sagt: „Ich bin der Spion!“' : 'wurde enttarnt!'}</p><p class="party-text">Kennt der Spion ${s.orte ? 'den Ort' : 'das Wort'}?</p>` };
      }
      if (s.phase === 'aufloesung') {
        const e = ergebnisText(s);
        return {
          runde, zeit: true, schluessel: 'aufl' + s.runde,
          html: `<div class="party-karte"><h2>${e.titel}</h2><p>${s.orte ? 'Der Ort war' : 'Das Wort war'} <b class="gross">${esc(s.wort)}</b></p>
            <p>Spion: ${e.spione}</p>${e.unter ? `<p class="party-klein">${e.unter}</p>` : ''}</div>`,
        };
      }
      return { runde, html: '' };
    },

    aktion(name, el, api) {
      if (name === 'waehle') { api.merk.wahl = el.dataset.id; api.neuMalen(); }
      else if (name === 'abstimmen' && api.merk.wahl) api.sende('stimme', { ziel: api.merk.wahl });
      else if (name === 'aufdecken') {
        if (!api.s.ich.spion) { api.melde('Du bist gar nicht der Spion. Pssst!'); return; }
        if (confirm(`Wirklich? Dann musst du jetzt ${api.s.orte ? 'den Ort' : 'das Wort'} raten.`)) api.sende('aufdecken');
      } else if (name === 'raten') api.sende('raten', { text: el.querySelector('input').value });
      else if (name === 'ort' && confirm(`Tippst du auf „${el.dataset.ort}“?`)) api.sende('raten', { text: el.dataset.ort });
    },

    buehne(z, s, H) {
      const runde = `Runde ${s.runde} von ${s.runden}`;
      if (s.phase === 'warten') return { hinweis: 'Es braucht mindestens 3 Mitspielende.' };
      if (s.phase === 'karte') {
        return { runde, zeit: true, schluessel: 'k' + s.runde, hinweis: 'Schaut euch eure Karte an.',
          html: `<div class="party-karte gross-karte"><h2>Einer von euch ist ${s.anzahlSpione > 1 ? 'ein' : 'der'} Spion …</h2><p>Haltet eure Karte gedrückt. Alle anderen kennen ${s.orte ? 'den geheimen Ort' : 'das geheime Wort'}.</p></div>` };
      }
      if (s.phase === 'fragen') {
        return { runde, zeit: true, schluessel: 'f' + s.runde, hinweis: s.orte ? 'Reihum stellt ihr euch gegenseitig Fragen.' : 'Reihum sagt jede und jeder ein Stichwort.',
          html: `<div class="party-karte"><h2>Es beginnt: ${esc(s.reihenfolge[0].name)}</h2><p>Nicht zu deutlich, sonst errät der Spion ${s.orte ? 'den Ort' : 'das Wort'}. Nicht zu ungenau, sonst haltet ihr euch gegenseitig für verdächtig.</p></div>
            <ol class="party-reihe">${s.reihenfolge.map((p) => `<li>${esc(p.name)}</li>`).join('')}</ol>${orteHtml(s, false)}` };
      }
      if (s.phase === 'abstimmung') {
        return { runde, zeit: true, schluessel: 'a' + s.runde, hinweis: `${s.abgestimmt.length} von ${s.stimmberechtigt} haben abgestimmt`,
          html: `<div class="party-karte"><h2>Wer ist der Spion?</h2><p>Stimmt auf dem Handy ab.</p></div>${H.personen(s.teilnehmer, { aus: () => true, haken: (p) => s.abgestimmt.includes(p.id) })}` };
      }
      if (s.phase === 'raten') {
        const r = s.rater;
        return { runde, zeit: true, schluessel: 'r' + s.runde,
          html: `<div class="party-karte gross-karte"><h2>${esc(r.name)} ${r.selbst ? 'sagt: „Ich bin der Spion!“' : 'wurde enttarnt!'}</h2><p>Jetzt muss ${s.orte ? 'der geheime Ort' : 'das geheime Wort'} erraten werden …</p></div>` };
      }
      if (s.phase === 'aufloesung') {
        const e = ergebnisText(s);
        return { runde, zeit: true, schluessel: 'e' + s.runde,
          html: `<div class="party-karte gross-karte"><h2>${e.titel}</h2><p class="riesig">${esc(s.wort)}</p><p>Spion: ${e.spione}</p>${e.unter ? `<p class="party-klein">${e.unter}</p>` : ''}</div>` };
      }
      return { runde };
    },
  });
})();
