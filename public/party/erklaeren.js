/* Begriffe erklären */
(function () {
  'use strict';
  const { esc } = window.Gemeinsam;

  const teamPunkt = (t) => `<i class="teampunkt" style="--team:${t.farbe}"></i>`;

  function teamsHtml(s, gross) {
    return `<div class="party-teams ${gross ? 'gross' : ''}">${s.teams.map((t) => `
      <div class="party-team ${t.index === s.teamDran ? 'dran' : ''}" style="--team:${t.farbe}">
        <b>${teamPunkt(t)}${esc(t.name)}</b><span class="p">${t.punkte}</span>
        <small>${t.mitglieder.map(esc).join(', ')}</small></div>`).join('')}</div>`;
  }

  function verlaufHtml(s) {
    if (!s.verlauf.length) return '<p class="party-text">Diesmal kein Begriff.</p>';
    const zeichen = { richtig: '✓', weiter: '→', tabu: '✗', offen: '·' };
    return `<ul class="party-verlauf">${s.verlauf.map((v) => `<li class="${v.ergebnis}"><b>${zeichen[v.ergebnis]}</b> ${esc(v.wort)}${v.ergebnis === 'tabu' ? ' <small>verbotenes Wort</small>' : ''}</li>`).join('')}</ul>`;
  }

  function karteHtml(k) {
    return `<div class="erklaer-karte"><b>${esc(k.wort)}</b><span>Nicht sagen:</span><ul>${k.tabu.map((t) => `<li>${esc(t)}</li>`).join('')}</ul></div>`;
  }

  window.Party.registriere('erklaeren', {
    titel: 'Begriffe erklären',
    einstellungen: [
      { feld: 'teams', typ: 'zahl', label: 'Teams', min: 2, max: 4 },
      { feld: 'runden', typ: 'zahl', label: 'Runden', min: 1, max: 10 },
      { feld: 'sekunden', typ: 'zahl', label: 'Sekunden pro Zug', min: 30, max: 180, step: 10 },
      { feld: 'strafe', typ: 'schalter', label: 'Überspringen kostet einen Punkt', texte: ['ja', 'nein'] },
      { feld: 'listen', typ: 'listen', label: 'Karten aus', quelle: 'erklaeren' },
      { typ: 'hinweis', text: 'Ab 4 Mitspielenden. Eine Person erklärt, das eigene Team rät. Die anderen Teams sehen die Karte mit und drücken bei einem verbotenen Wort den Summer.' },
    ],

    zeitAktiv: (s) => ['bereit', 'erklaeren', 'zugende'].includes(s.phase),
    weiterText: (s) => ({ bereit: 'Zug starten', erklaeren: 'Zug beenden', zugende: 'Nächster Zug' }[s.phase]),
    status(s) {
      const team = s.teams && s.teamDran !== null ? s.teams[s.teamDran] : null;
      const text = s.phase === 'erklaeren' ? `${s.erklaerer.name} erklärt · ${s.anzahl.richtig} richtig` : team ? `${team.name} ist dran` : '';
      return { titel: `Erklären · Runde ${s.runde} von ${s.runden}`, text };
    },

    kind(z, s, H) {
      if (!s.teams) return { html: '' };
      const runde = `Runde ${s.runde} von ${s.runden}`;
      const ich = s.ich || {};
      const team = s.teams[s.teamDran];
      const meinTeam = ich.team !== null && ich.team !== undefined ? s.teams[ich.team] : null;
      const unten = teamsHtml(s);
      if (s.phase === 'bereit') {
        if (ich.aufgabe === 'erklaeren') {
          return { runde, zeit: true, schluessel: 'bereit' + s.runde + s.erklaerer.id, hinweis: `Du erklärst für ${team.name}!`,
            html: `<div class="party-karte"><h2>Du bist dran!</h2><p>Erkläre die Begriffe, ohne sie und die verbotenen Wörter zu sagen. Keine Gesten, kein Buchstabieren.</p>
              <button type="button" class="knopf haupt gross" data-aktion="los">Los geht's</button></div>${unten}` };
        }
        return { runde, zeit: true, schluessel: 'bereit' + s.runde + s.erklaerer.id, hinweis: `${s.erklaerer.name} erklärt gleich für ${team.name}.`,
          html: `<div class="party-karte"><h2>${esc(s.erklaerer.name)} erklärt</h2><p>${ich.aufgabe === 'raten' ? 'Dein Team ist dran. Gut zuhören und raten!' : 'Pass auf, dass keine verbotenen Wörter fallen.'}</p></div>${unten}` };
      }
      if (s.phase === 'erklaeren') {
        if (ich.aufgabe === 'erklaeren' && s.karte) {
          return { runde, zeit: true, hinweis: `${s.anzahl.richtig} richtig`,
            html: `${karteHtml(s.karte)}<div class="party-knoepfe gross-knoepfe">
              <button type="button" class="knopf gross" data-aktion="weiter">Überspringen</button>
              <button type="button" class="knopf haupt gross gruen" data-aktion="richtig">Richtig!</button></div>` };
        }
        if (ich.aufgabe === 'waechter' && s.karte) {
          return { runde, zeit: true, hinweis: `${s.erklaerer.name} erklärt. Pass auf!`,
            html: `${karteHtml(s.karte)}<button type="button" class="summer" data-aktion="tabu">Verbotenes Wort!</button>` };
        }
        return { runde, zeit: true, hinweis: ich.aufgabe === 'raten' ? 'Rate laut mit!' : '',
          html: `<div class="party-karte"><h2>${ich.aufgabe === 'raten' ? 'Rate!' : 'Zuschauen'}</h2><p>${esc(s.erklaerer.name)} erklärt für ${esc(team.name)}.</p>
            <p class="party-gross">${s.anzahl.richtig} richtig</p></div>${unten}` };
      }
      if (s.phase === 'zugende') {
        return { runde, zeit: true, schluessel: 'ende' + s.runde + s.erklaerer.id, hinweis: 'Zug vorbei',
          html: `<div class="party-karte"><h2>${esc(team.name)}: ${s.anzahl.richtig} richtig${s.anzahl.tabu ? `, ${s.anzahl.tabu} verboten` : ''}</h2>${verlaufHtml(s)}</div>${unten}` };
      }
      return { runde, html: unten };
    },

    aktion(name, el, api) {
      if (['los', 'richtig', 'weiter', 'tabu'].includes(name)) {
        if (navigator.vibrate) navigator.vibrate(name === 'tabu' ? 200 : 40);
        api.sende(name);
      }
    },

    buehne(z, s) {
      if (!s.teams) return {};
      const runde = `Runde ${s.runde} von ${s.runden}`;
      const team = s.teams[s.teamDran];
      let karte = '';
      if (s.phase === 'bereit') karte = `<div class="party-karte gross-karte"><h2>${esc(team.name)} ist dran</h2><p>Es erklärt: <b>${esc(s.erklaerer.name)}</b></p></div>`;
      else if (s.phase === 'erklaeren') karte = `<div class="party-karte gross-karte"><h2>${esc(s.erklaerer.name)} erklärt</h2><p class="riesig">${s.anzahl.richtig}</p><p>richtig erraten${s.anzahl.tabu ? ` · ${s.anzahl.tabu} ${s.anzahl.tabu === 1 ? 'verbotenes Wort' : 'verbotene Wörter'}` : ''}</p></div>`;
      else if (s.phase === 'zugende') karte = `<div class="party-karte"><h2>${esc(team.name)}: ${s.anzahl.richtig} richtig</h2>${verlaufHtml(s)}</div>`;
      return { runde, zeit: s.phase !== 'ende', hinweis: team ? `${team.name} ist dran` : '', schluessel: s.phase + s.runde + (s.erklaerer ? s.erklaerer.id : ''),
        html: karte + teamsHtml(s, true) };
    },

    endeText(s) {
      if (!s.teams) return '';
      const sortiert = s.teams.slice().sort((a, b) => b.punkte - a.punkte);
      return `Gewonnen hat ${sortiert[0].name} mit ${sortiert[0].punkte} Punkten`;
    },
  });
})();
