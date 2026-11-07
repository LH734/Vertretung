/* Bluffwürfel: verdeckt würfeln, reihum bieten, „Lüge!“ rufen.
   Die Sechs ist ein Stern. Mit Jokern zählt der Stern bei jeder Zahl mit, ein Stern-Gebot zählt doppelt. */
(function () {
  'use strict';
  const { esc } = window.Gemeinsam;

  const ZAHLWORT = ['', 'Einsen', 'Zweien', 'Dreien', 'Vieren', 'Fünfen', 'Sterne'];
  const gebotText = (g) => `${g.menge} × ${ZAHLWORT[g.augen]}`;
  const STERN = 6;

  // Gleiche Rangfolge wie auf dem Server: k Sterne liegen zwischen 2k und 2k+1 mal einer Zahl
  const wert = (menge, augen, joker) => (joker && augen === STERN ? 20 * menge + 9 : 10 * menge + augen);

  // Gebotsleiste wie auf dem Spielbrett: Zahlenfelder, dazwischen die Sternfelder
  function leiste(s, H, wahl) {
    const felder = [];
    for (let m = 1; m <= s.gesamt; m++) {
      felder.push({ menge: m, stern: false });
      if (s.joker && m % 2 === 0) felder.push({ menge: m / 2, stern: true });
    }
    const istFeld = (f, g) => g && f.menge === g.menge && f.stern === (s.joker && g.augen === STERN);
    let jetzt = felder.findIndex((f) => istFeld(f, s.gebot));
    const start = Math.max(0, Math.min((jetzt < 0 ? 0 : jetzt) - 2, felder.length - 8));
    return `<div class="bluff-leiste">${felder.slice(start, start + 8).map((f, i) => {
      const k = start + i;
      const klasse = [f.stern ? 'stern' : '', k === jetzt ? 'jetzt' : '', jetzt >= 0 && k < jetzt ? 'vorbei' : '', istFeld(f, wahl) ? 'wahl' : ''].join(' ');
      return `<span class="${klasse}">${f.stern ? `${f.menge}<i>★</i>` : f.menge}</span>`;
    }).join('')}</div>`;
  }

  function tischHtml(s, H, mitAugen) {
    const g = s.ergebnis && s.ergebnis.gebot;
    return `<ul class="wuerfel-tisch bluff">${s.spieler.map((p) => {
      let wuerfel;
      if (mitAugen && p.augen) {
        wuerfel = p.augen.map((a) => H.wuerfel(a, g && (a === g.augen || (s.joker && a === STERN)) ? 'treffer' : 'grau', true)).join('');
      } else {
        wuerfel = Array.from({ length: p.wuerfel }, () => H.wuerfel(0, 'verdeckt')).join('');
      }
      return `<li class="${s.dran && p.id === s.dran.id && s.phase === 'bieten' ? 'dran' : ''} ${p.wuerfel ? '' : 'raus'} ${p.online ? '' : 'weg'}">
        <span class="n">${esc(p.name)}</span><span class="becher">${p.wuerfel ? wuerfel : 'raus'}</span></li>`;
    }).join('')}</ul>`;
  }

  function verlaufHtml(s) {
    if (!s.verlauf || !s.verlauf.length) return '';
    return `<p class="wuerfel-verlauf">${s.verlauf.slice(-6).map((v) => `${esc(v.name)}: <b>${esc(gebotText(v))}</b>`).join(' → ')}</p>`;
  }

  function ergebnisHtml(s) {
    const e = s.ergebnis;
    const g = e.gebot;
    return `<div class="party-karte wuerfel-karte"><h2>${e.stimmt ? `Stimmt! Es sind ${e.anzahl}` : `Gelogen! Es sind nur ${e.anzahl}`}</h2>
      <p>${esc(g.name)} hat <b>${esc(gebotText(g))}</b> geboten, ${esc(e.zweiflerName)} hat gezweifelt.${s.joker && g.augen !== STERN ? ' Sterne zählen mit.' : ''}</p>
      <p class="party-text">${e.raus ? `<b>${esc(e.verliererName)}</b> hat keine Würfel mehr und ist raus.` : `<b>${esc(e.verliererName)}</b> gibt einen Würfel ab (noch ${e.rest}).`}</p></div>`;
  }

  // Ist das Gebot höher als das aktuelle?
  function gueltig(s, menge, augen) {
    if (!menge || !augen || menge > s.gesamt) return false;
    if (!s.gebot) return true;
    return wert(menge, augen, s.joker) > wert(s.gebot.menge, s.gebot.augen, s.joker);
  }

  // Kleinste Menge, mit der diese Augenzahl gerade geboten werden darf
  function kleinsteMenge(s, augen) {
    for (let m = 1; m <= s.gesamt; m++) if (gueltig(s, m, augen)) return m;
    return null;
  }

  // Kleinstes gültiges Gebot als Vorschlag (Zahlen vor Sternen)
  function vorschlag(s) {
    let beste = null;
    for (let a = 1; a <= 6; a++) {
      const m = kleinsteMenge(s, a);
      if (m && (!beste || wert(m, a, s.joker) < wert(beste.menge, beste.augen, s.joker))) beste = { menge: m, augen: a };
    }
    return beste || { menge: s.gesamt, augen: STERN };
  }

  window.Party.registriere('bluff', {
    titel: 'Bluffwürfel',
    einstellungen: [
      { feld: 'wuerfel', typ: 'zahl', label: 'Würfel pro Person', min: 2, max: 6 },
      { feld: 'sekunden', typ: 'zahl', label: 'Sekunden pro Zug', min: 20, max: 120, step: 5 },
      { feld: 'joker', typ: 'schalter', label: 'Sterne sind Joker', texte: ['ja', 'nein'] },
      { typ: 'hinweis', text: 'Ab 2 Mitspielenden, am schönsten mit 3 bis 6. Wer zu lange überlegt, ruft automatisch „Lüge!“ (beim ersten Gebot wird eins für die Person abgegeben).' },
    ],

    zeitAktiv: (s) => ['bieten', 'aufloesung'].includes(s.phase),
    weiterText: (s) => ({ bieten: 'Für die Person entscheiden', aufloesung: 'Nächste Runde' }[s.phase]),
    status(s) {
      const dabei = s.spieler ? s.spieler.filter((p) => p.wuerfel > 0).length : 0;
      let text = `${dabei} noch dabei · ${s.gesamt || 0} Würfel`;
      if (s.phase === 'bieten' && s.dran) text = `${s.dran.name} ist dran${s.gebot ? ` · Gebot ${gebotText(s.gebot)}` : ''}`;
      if (s.phase === 'aufloesung' && s.ergebnis) text = `${s.ergebnis.verliererName} verliert einen Würfel`;
      return { titel: `Bluffwürfel · Runde ${s.runde}`, text };
    },
    endeText: (s) => (s.sieger ? `${s.sieger} gewinnt Bluffwürfel!` : ''),

    kind(z, s, H, api) {
      if (!s.spieler) return { html: '' };
      const ich = s.ich || {};
      const runde = `Runde ${s.runde}`;
      if (!ich.dabei) return { runde, hinweis: 'Du schaust diesmal zu.', html: `<div class="party-karte"><h2>Du schaust zu</h2><p>Beim nächsten Spiel bist du dabei.</p></div>${tischHtml(s, H, s.phase === 'aufloesung')}` };
      const meine = ich.augen.length
        ? `<div class="party-karte wuerfel-karte"><h2>Deine Würfel</h2><div class="wuerfel-reihe">${ich.augen.map((a) => H.wuerfel(a, '', true)).join('')}</div>
          <p class="party-text klein">Insgesamt liegen ${s.gesamt} Würfel auf dem Tisch.${s.joker ? ' Sterne zählen bei jeder Zahl mit.' : ''}</p></div>`
        : '<div class="party-karte"><h2>Keine Würfel mehr</h2><p>Du bist raus und schaust zu.</p></div>';

      if (s.phase === 'bieten') {
        const gebot = s.gebot ? `<p class="bluff-gebot">Gebot von ${esc(s.gebot.name)}: <b>${esc(gebotText(s.gebot))}</b></p>` : '<p class="bluff-gebot">Noch kein Gebot</p>';
        if (s.dran && s.dran.id === z.ich.id) {
          // Neuer Vorschlag, sobald sich das Gebot geändert hat
          if (!api.merk.wahl || api.merk.fuer !== s.verlauf.length) { api.merk.wahl = vorschlag(s); api.merk.fuer = s.verlauf.length; }
          const w = api.merk.wahl;
          const ok = gueltig(s, w.menge, w.augen);
          // Ungefähre Erwartung: eigene Treffer plus der Anteil bei den anderen
          const eigene = ich.augen.filter((a) => a === w.augen || (s.joker && a === STERN)).length;
          const andere = s.gesamt - ich.augen.length;
          const erwartet = Math.round((eigene + andere * (s.joker && w.augen !== STERN ? 1 / 3 : 1 / 6)) * 10) / 10;
          const augenKnoepfe = [1, 2, 3, 4, 5, 6]
            .map((a) => `<button type="button" class="bluff-augen ${w.augen === a ? 'an' : ''}" data-aktion="augen" data-wert="${a}">${H.wuerfel(a, '', true)}</button>`).join('');
          const sternHinweis = s.joker ? (w.augen === STERN
            ? '<p class="party-text klein">Ein Stern-Gebot zählt doppelt: Es reicht die halbe Menge (aufgerundet).</p>'
            : (s.gebot && s.gebot.augen === STERN ? '<p class="party-text klein">Zurück von Sternen: mehr als doppelt so viele.</p>' : '')) : '';
          return { runde, zeit: true, hinweis: 'Du bist dran!', schluessel: 'bieten' + s.verlauf.length,
            html: `${meine}${gebot}
              <div class="party-karte bluff-bieten">
                <div class="bluff-menge"><button type="button" class="knopf" data-aktion="weniger">−</button><b>${w.menge} ×</b><button type="button" class="knopf" data-aktion="mehr">+</button></div>
                <div class="bluff-augenreihe">${augenKnoepfe}</div>
                ${s.joker ? leiste(s, H, w) : ''}${sternHinweis}
                <p class="party-text klein">Du hast ${eigene} davon. Zu erwarten sind ungefähr ${String(erwartet).replace('.', ',')}.</p>
                <div class="party-knoepfe">
                  <button type="button" class="knopf haupt gross" data-aktion="bieten" ${ok ? '' : 'disabled'}>${esc(gebotText(w))} bieten</button>
                  ${s.gebot ? '<button type="button" class="knopf gold gross" data-aktion="zweifeln">Lüge!</button>' : ''}
                </div>
                ${ok ? '' : '<p class="party-text klein">Muss höher sein: mehr Würfel oder gleich viele mit höherer Zahl.</p>'}
              </div>${verlaufHtml(s)}${tischHtml(s, H, false)}` };
        }
        return { runde, zeit: true, hinweis: `${s.dran ? s.dran.name : ''} ist dran.`, html: `${meine}${gebot}${verlaufHtml(s)}${tischHtml(s, H, false)}` };
      }
      if (s.phase === 'aufloesung' && s.ergebnis) return { runde, zeit: true, schluessel: 'erg' + s.runde, html: ergebnisHtml(s) + tischHtml(s, H, true) };
      if (s.phase === 'warten') return { runde, html: '<div class="party-karte"><h2>Kurz warten</h2><p>Es sind gerade zu wenige online.</p></div>' + tischHtml(s, H, false) };
      return { runde, html: tischHtml(s, H, false) };
    },

    aktion(name, el, api) {
      const s = api.s;
      const w = api.merk.wahl || vorschlag(s);
      if (name === 'mehr') w.menge = Math.min(s.gesamt, w.menge + 1);
      else if (name === 'weniger') w.menge = Math.max(1, w.menge - 1);
      else if (name === 'augen') {
        w.augen = Number(el.dataset.wert);
        // Passt die Menge nicht mehr, springt sie auf die kleinste erlaubte
        const m = kleinsteMenge(s, w.augen);
        if (m && !gueltig(s, w.menge, w.augen)) w.menge = m;
      }
      else if (name === 'bieten') return api.sende('bieten', { menge: w.menge, augen: w.augen });
      else if (name === 'zweifeln') return api.sende('zweifeln');
      api.merk.wahl = w;
      api.neuMalen();
    },

    buehne(z, s, H) {
      if (!s.spieler) return {};
      const runde = `Runde ${s.runde}`;
      let kopf = '';
      if (s.phase === 'bieten') {
        kopf = `<div class="party-karte gross-karte wuerfel-karte"><h2>${s.gebot ? `${esc(s.gebot.name)} bietet` : `${esc(s.dran.name)} beginnt`}</h2>
          ${s.gebot ? `<p class="riesig">${esc(gebotText(s.gebot))}</p>` : '<p>Noch kein Gebot</p>'}
          ${s.joker ? leiste(s, H, null) : ''}
          <p>Dran: <b>${esc(s.dran.name)}</b> · ${s.gesamt} Würfel auf dem Tisch${s.joker ? ' · Sterne sind Joker' : ''}</p>${verlaufHtml(s)}</div>`;
      } else if (s.phase === 'aufloesung' && s.ergebnis) kopf = ergebnisHtml(s);
      return { runde, zeit: ['bieten', 'aufloesung'].includes(s.phase), schluessel: s.phase + s.runde + (s.verlauf || []).length,
        html: `<div class="wuerfel-buehne">${kopf}${tischHtml(s, H, s.phase === 'aufloesung')}</div>` };
    },
  });
})();
