/* Mäxchen: verdeckt würfeln, ansagen, glauben oder aufdecken */
(function () {
  'use strict';
  const { esc } = window.Gemeinsam;

  // So wird ein Wert vorgelesen
  function wertText(w) {
    if (!w) return '';
    if (w === '21') return 'Mäxchen';
    if (w[0] === w[1]) return `${w[0]}er-Pasch`;
    return w;
  }

  function herzen(n, max) {
    let h = '';
    for (let i = 0; i < max; i++) h += `<span class="herz ${i < n ? '' : 'leer'}">♥</span>`;
    return h;
  }

  function tischHtml(s, H) {
    const aktiv = s.phase === 'entscheidung' && s.entscheider ? s.entscheider.id : s.aktiv && s.aktiv.id;
    return `<ul class="wuerfel-tisch">${s.spieler.map((p) => `
      <li class="${p.id === aktiv ? 'dran' : ''} ${p.leben ? '' : 'raus'} ${p.online ? '' : 'weg'}">
        <span class="n">${esc(p.name)}</span><span class="herzen">${p.leben ? herzen(p.leben, s.startLeben) : 'raus'}</span></li>`).join('')}</ul>`;
  }

  function verlaufHtml(s) {
    if (!s.verlauf || !s.verlauf.length) return '';
    return `<p class="wuerfel-verlauf">${s.verlauf.map((v) => `${esc(v.name)}: <b>${esc(wertText(v.ansage))}</b>`).join(' → ')}</p>`;
  }

  function ergebnisHtml(s, H) {
    const e = s.ergebnis;
    const wurf = e.wurf ? `<div class="wuerfel-reihe gross">${H.wuerfel(e.wurf[0])}${H.wuerfel(e.wurf[1])}</div>` : '';
    let titel;
    let text;
    if (e.art === 'geglaubt') {
      titel = `${esc(e.zweiflerName)} glaubt das Mäxchen`;
      text = 'Das kostet ein Leben, aufgedeckt wird nicht.';
    } else if (e.ehrlich) {
      titel = `${esc(e.ansagerName)} hat nicht gelogen!`;
      text = `Angesagt: <b>${esc(wertText(e.ansage))}</b>, gewürfelt: <b>${esc(wertText(e.echt))}</b>. ${esc(e.zweiflerName)} hat umsonst gezweifelt.`;
    } else {
      titel = `Erwischt! ${esc(e.ansagerName)} hat geblufft`;
      text = `Angesagt: <b>${esc(wertText(e.ansage))}</b>, gewürfelt: <b>${esc(wertText(e.echt))}</b>.`;
    }
    const folge = e.raus ? `<b>${esc(e.verliererName)}</b> ist raus.` : `<b>${esc(e.verliererName)}</b> verliert ${e.minus === 2 ? 'zwei Leben' : 'ein Leben'} (noch ${e.rest}).`;
    return `<div class="party-karte wuerfel-karte"><h2>${titel}</h2>${wurf}<p>${text}</p><p class="party-text">${folge}</p></div>`;
  }

  window.Party.registriere('maexchen', {
    titel: 'Mäxchen',
    einstellungen: [
      { feld: 'leben', typ: 'zahl', label: 'Leben pro Person', min: 1, max: 6 },
      { feld: 'sekunden', typ: 'zahl', label: 'Sekunden pro Zug', min: 15, max: 90, step: 5 },
      { typ: 'hinweis', text: 'Ab 3 Mitspielenden, am schönsten mit 4 bis 10. Wer zu lange überlegt, sagt automatisch ehrlich an oder glaubt.' },
    ],

    zeitAktiv: (s) => ['wurf', 'entscheidung', 'aufloesung'].includes(s.phase),
    weiterText: (s) => ({ wurf: 'Für die Person ansagen', entscheidung: 'Für die Person entscheiden', aufloesung: 'Nächste Runde' }[s.phase]),
    status(s) {
      const dabei = s.spieler ? s.spieler.filter((p) => p.leben > 0).length : 0;
      let text = `${dabei} noch dabei`;
      if (s.phase === 'wurf' && s.aktiv) text = `${s.aktiv.name} würfelt · ${text}`;
      if (s.phase === 'entscheidung' && s.entscheider) text = `${s.entscheider.name} überlegt · ${text}`;
      if (s.phase === 'aufloesung' && s.ergebnis) text = `${s.ergebnis.verliererName} verliert`;
      return { titel: `Mäxchen · Runde ${s.runde}`, text };
    },
    endeText: (s) => (s.sieger ? `${s.sieger} gewinnt Mäxchen!` : ''),

    kind(z, s, H) {
      if (!s.spieler) return { html: '' };
      const ich = s.ich || {};
      const runde = `Runde ${s.runde}`;
      const tisch = tischHtml(s, H);
      const vorher = s.vorher ? `<p class="party-text">Ansage davor: <b>${esc(wertText(s.vorher))}</b></p>` : '<p class="party-text">Neue Runde: Jeder Wert geht.</p>';
      if (!ich.dabei) return { runde, hinweis: 'Du schaust diesmal zu.', html: `<div class="party-karte"><h2>Du schaust zu</h2><p>Beim nächsten Spiel bist du dabei.</p></div>${tisch}` };
      if (s.phase === 'wurf') {
        if (ich.wurf) {
          const echt = `${Math.max(...ich.wurf)}${Math.min(...ich.wurf)}`;
          const knoepfe = ich.erlaubt.map((w) => `<button type="button" class="ansage ${w === echt ? 'echt' : ''} ${w === '21' ? 'max' : ''}" data-aktion="ansage" data-wert="${w}">${w === '21' ? 'Mäxchen' : w}${w[0] === w[1] ? '<small>Pasch</small>' : ''}</button>`).join('');
          return { runde, zeit: true, hinweis: 'Du bist dran!', schluessel: 'wurf' + s.verlauf.length,
            html: `<div class="party-karte wuerfel-karte"><h2>Dein Wurf</h2>
              <div class="wuerfel-reihe gross">${H.wuerfel(ich.wurf[0])}${H.wuerfel(ich.wurf[1])}</div>
              <p>Das ist <b>${esc(wertText(echt))}</b>. Handy nicht zeigen!</p>${vorher}</div>
              <h3 class="wuerfel-h">Was sagst du an?</h3><div class="ansagen">${knoepfe}</div>
              <p class="party-text klein">Der gelb markierte Wert ist ehrlich, falls er hoch genug ist. Alles andere ist ein Bluff.</p>${tisch}` };
        }
        return { runde, zeit: true, hinweis: `${s.aktiv.name} würfelt.`,
          html: `<div class="party-karte wuerfel-karte"><h2>${esc(s.aktiv.name)} würfelt …</h2><div class="wuerfel-reihe">${H.wuerfel(0, 'verdeckt')}${H.wuerfel(0, 'verdeckt')}</div>${vorher}${verlaufHtml(s)}</div>${tisch}` };
      }
      if (s.phase === 'entscheidung') {
        const max = s.ansage === '21';
        if (s.entscheider && s.entscheider.id === z.ich.id) {
          return { runde, zeit: true, hinweis: 'Du entscheidest!', schluessel: 'ent' + s.verlauf.length,
            html: `<div class="party-karte wuerfel-karte"><h2>${esc(s.aktiv.name)} sagt:</h2><p class="riesig">${esc(wertText(s.ansage))}</p>${verlaufHtml(s)}
              <p>Glaubst du das?</p></div>
              <div class="party-knoepfe gross-knoepfe">
                <button type="button" class="knopf gross" data-aktion="glauben">${max ? 'Glaub ich (kostet 1 Leben)' : 'Glaub ich, ich würfle weiter'}</button>
                <button type="button" class="knopf haupt gross" data-aktion="aufdecken">Aufdecken!</button></div>${tisch}` };
        }
        return { runde, zeit: true, hinweis: `${s.entscheider.name} überlegt.`,
          html: `<div class="party-karte wuerfel-karte"><h2>${esc(s.aktiv.name)} sagt: ${esc(wertText(s.ansage))}</h2><p>${esc(s.entscheider.name)} glaubt es oder deckt auf.</p>${verlaufHtml(s)}</div>${tisch}` };
      }
      if (s.phase === 'aufloesung' && s.ergebnis) return { runde, zeit: true, schluessel: 'erg' + s.runde, html: ergebnisHtml(s, H) + tisch };
      if (s.phase === 'warten') return { runde, html: '<div class="party-karte"><h2>Kurz warten</h2><p>Es sind gerade zu wenige online.</p></div>' + tisch };
      return { runde, html: tisch };
    },

    aktion(name, el, api) {
      if (name === 'ansage') api.sende('ansage', { wert: el.dataset.wert });
      else if (name === 'glauben' || name === 'aufdecken') api.sende(name);
    },

    buehne(z, s, H) {
      if (!s.spieler) return {};
      const runde = `Runde ${s.runde}`;
      const tisch = tischHtml(s, H);
      let html;
      if (s.phase === 'wurf') {
        html = `<div class="party-karte gross-karte wuerfel-karte"><h2>${esc(s.aktiv.name)} würfelt</h2><div class="wuerfel-reihe gross">${H.wuerfel(0, 'verdeckt')}${H.wuerfel(0, 'verdeckt')}</div>
          <p>${s.vorher ? `Muss mehr sein als <b>${esc(wertText(s.vorher))}</b>` : 'Neue Runde'}</p>${verlaufHtml(s)}</div>`;
      } else if (s.phase === 'entscheidung') {
        html = `<div class="party-karte gross-karte wuerfel-karte"><h2>${esc(s.aktiv.name)} sagt</h2><p class="riesig">${esc(wertText(s.ansage))}</p>
          <p>Glaubt <b>${esc(s.entscheider.name)}</b> das?</p>${verlaufHtml(s)}</div>`;
      } else if (s.phase === 'aufloesung' && s.ergebnis) html = ergebnisHtml(s, H);
      else html = '';
      return { runde, zeit: ['wurf', 'entscheidung', 'aufloesung'].includes(s.phase), schluessel: s.phase + s.runde + (s.verlauf || []).length,
        html: `<div class="wuerfel-buehne">${html}${tisch}</div>` };
    },
  });
})();
