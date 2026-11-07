/* Schiffe versenken als Turnier: Flotte aufstellen, dann abwechselnd aufs fremde Meer schießen. */
(function () {
  'use strict';
  const { esc } = window.Gemeinsam;
  const T = () => window.Turnier;
  const BUCHST = 'ABCDEFGHIJ';

  // Schussfeld: 0 unbekannt, 1 Wasser, 2 Treffer, 3 versenkt
  function zielfeld(p, ichId, klickbar) {
    const feld = p.feld[ichId];
    const n = p.n;
    let html = '';
    for (let i = 0; i < n * n; i++) {
      const x = feld[i];
      const neu = p.letzter && p.letzter.von === ichId && p.letzter.feld === i ? 'neu' : '';
      const k = ['', 'wasser', 'treffer', 'versenkt'][x];
      html += !x && klickbar
        ? `<button type="button" class="see-zelle" data-aktion="schuss" data-feld="${i}" aria-label="${BUCHST[i % n]}${Math.floor(i / n) + 1}"></button>`
        : `<span class="see-zelle ${k} ${neu}"></span>`;
    }
    return `<div class="see-feld n${n} ${klickbar ? 'aktiv' : ''}">${html}</div>`;
  }

  // Eigenes Meer: Schiffe plus die Schüsse der anderen Seite
  function eigenesFeld(p, ichId, gegnerId, flotte, klein) {
    const n = p.n;
    const schiff = new Set((flotte || []).flat());
    const schuesse = gegnerId ? p.feld[gegnerId] : [];
    let html = '';
    for (let i = 0; i < n * n; i++) {
      const x = schuesse[i] || 0;
      const neu = p.letzter && p.letzter.von === gegnerId && p.letzter.feld === i ? 'neu' : '';
      html += `<span class="see-zelle ${schiff.has(i) ? 'schiff' : ''} ${x === 1 ? 'wasser' : x ? 'treffer' : ''} ${neu}"></span>`;
    }
    return `<div class="see-feld n${n} ${klein ? 'klein' : ''}">${html}</div>`;
  }

  function flottenRest(rest, alle) {
    const zaehle = {};
    rest.forEach((l) => { zaehle[l] = (zaehle[l] || 0) + 1; });
    return `<div class="see-rest">${alle.map((l) => {
      const da = zaehle[l] > 0;
      if (da) zaehle[l]--;
      return `<span class="${da ? '' : 'weg'}">${'<i></i>'.repeat(l)}</span>`;
    }).join('')}</div>`;
  }

  function meldung(p, ichId) {
    const l = p.letzter;
    if (!l) return '';
    const ich = l.von === ichId;
    if (!l.treffer) return `<p class="see-meldung">${ich ? 'Wasser.' : 'Daneben!'}</p>`;
    if (l.versenkt) return `<p class="see-meldung treffer">${ich ? 'Versenkt!' : `Dein ${l.versenkt}er-Schiff ist gesunken.`}</p>`;
    return `<p class="see-meldung treffer">${ich ? 'Treffer!' : 'Du wurdest getroffen.'}</p>`;
  }

  const mini = (p) => `<p class="see-mini">${esc(p.a.name)}: ${p.rest[p.a.id].length} Schiffe · ${esc(p.b.name)}: ${p.rest[p.b.id].length} Schiffe</p>`;

  window.Party.registriere('schiffe', {
    titel: 'Schiffe versenken',
    einstellungen: [
      { feld: 'runden', typ: 'zahl', label: 'Turnierrunden', min: 1, max: 9 },
      { feld: 'sekunden', typ: 'zahl', label: 'Sekunden pro Schuss', min: 10, max: 90, step: 5 },
      { feld: 'groesse', typ: 'wahl', label: 'Meer', optionen: [['klein', '8 × 8 (schnell)'], ['gross', '10 × 10']] },
      { feld: 'nochmal', typ: 'schalter', label: 'Nach einem Treffer nochmal', texte: ['ja', 'nein'] },
      { typ: 'hinweis', text: 'Ab 2 Mitspielenden. Alle spielen gleichzeitig zu zweit, nach jeder Runde gibt es neue Paare (Schweizer System). Die Flotte wird zufällig aufgestellt und kann neu gemischt werden. Schiffe berühren sich nie.' },
    ],
    zeitAktiv: (s) => s.phase === 'zwischenstand',
    weiterText: (s) => ({ spielen: 'Für alle einen Zug machen', zwischenstand: 'Nächste Runde' }[s.phase]),
    status: (s) => T().status(s, 'Schiffe versenken'),
    endeText: (s) => (s.sieger ? `${s.sieger} gewinnt das Turnier!` : ''),

    kind(z, s, H) {
      const ichId = z.ich.id;
      const r = T().rahmen(z, s, H, 'Schiffe versenken', mini);
      if (r) {
        if (r.html.includes('__PARTIE__')) {
          const p = s.meine;
          const g = p.a.id === ichId ? p.b.id : p.a.id;
          r.html = r.html.replace('__PARTIE__', `<h3 class="wuerfel-h">So lagen die Schiffe von ${esc(p.a.id === ichId ? p.b.name : p.a.name)}</h3>${eigenesFeld(p, g, ichId, p.alle && p.alle[g])}`);
        }
        return r;
      }
      const p = s.meine;
      const gegner = p.a.id === ichId ? p.b : p.a;
      const runde = `Runde ${s.runde} von ${s.runden}`;
      if (p.stufe === 'aufstellen') {
        const bereit = p.bereit[ichId];
        return { runde, zeit: true, hinweis: bereit ? `Warte auf ${gegner.name}.` : 'Stell deine Flotte auf.', schluessel: 'auf' + p.id,
          html: `<div class="party-karte wuerfel-karte"><h2>Deine Flotte</h2><p>Gegen <b>${esc(gegner.name)}</b>. Gefällt dir die Aufstellung?</p></div>
            ${eigenesFeld(p, ichId, null, p.flotte)}
            <div class="party-knoepfe">${bereit ? '<p class="party-text">Bereit! Warte auf die andere Seite …</p>'
              : '<button type="button" class="knopf gross" data-aktion="mischen">Neu mischen</button><button type="button" class="knopf haupt gross" data-aktion="bereit">Bereit!</button>'}</div>` };
      }
      const dran = p.dran === ichId;
      return {
        runde, zeit: true, hinweis: dran ? 'Du bist dran: Tippe ein Feld an.' : `${gegner.name} schießt.`,
        html: `${meldung(p, ichId)}<h3 class="wuerfel-h">Meer von ${esc(gegner.name)}</h3>
          ${zielfeld(p, ichId, dran)}${flottenRest(p.rest[gegner.id], p.schiffe)}
          <h3 class="wuerfel-h klein">Dein Meer</h3>${eigenesFeld(p, ichId, gegner.id, p.flotte, true)}
          <div class="party-knoepfe"><button type="button" class="knopf klein" data-aktion="aufgeben">Aufgeben</button></div>`,
      };
    },

    aktion(name, el, api) {
      if (name === 'schuss') api.sende('schuss', { feld: Number(el.dataset.feld) });
      else if (name === 'mischen' || name === 'bereit') api.sende(name);
      else if (name === 'aufgeben' && window.confirm('Wirklich aufgeben? Die Partie zählt dann als verloren.')) api.sende('aufgeben');
    },

    buehne: (z, s) => T().buehne(z, s, 'Schiffe versenken', mini),
  });
})();
