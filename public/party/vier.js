/* Vier in einer Reihe als Turnier: Spalte antippen, der Stein fällt nach unten. */
(function () {
  'use strict';
  const { esc } = window.Gemeinsam;
  const T = () => window.Turnier;
  const SP = 7;
  const ZE = 6;
  const FARBE = ['', 'gelb', 'rot'];

  function brett(p, klickbar, klein) {
    const linie = new Set(p.linie || []);
    let html = '';
    for (let s = 0; s < SP; s++) {
      let zellen = '';
      for (let z = 0; z < ZE; z++) {
        const i = z * SP + s;
        const x = p.brett[i];
        zellen += `<span class="vier-zelle ${FARBE[x]} ${i === p.letzter ? 'neu' : ''} ${linie.has(i) ? 'linie' : ''}"></span>`;
      }
      const voll = p.brett[s] !== 0;
      html += klickbar && !voll
        ? `<button type="button" class="vier-spalte" data-aktion="setzen" data-spalte="${s}" aria-label="Spalte ${s + 1}">${zellen}</button>`
        : `<div class="vier-spalte">${zellen}</div>`;
    }
    return `<div class="vier-brett ${klein ? 'klein' : ''} ${klickbar ? 'aktiv' : ''}">${html}</div>`;
  }

  const mini = (p) => brett(p, false, true);

  function stein(farbe) { return `<span class="vier-stein ${farbe}"></span>`; }

  window.Party.registriere('vier', {
    titel: 'Vier in einer Reihe',
    einstellungen: [
      { feld: 'runden', typ: 'zahl', label: 'Turnierrunden', min: 1, max: 9 },
      { feld: 'sekunden', typ: 'zahl', label: 'Sekunden pro Zug', min: 10, max: 90, step: 5 },
      { typ: 'hinweis', text: 'Ab 2 Mitspielenden. Alle spielen gleichzeitig zu zweit, nach jeder Runde gibt es neue Paare (Schweizer System): Wer gleich gut ist, spielt gegeneinander, niemand scheidet aus. Bei ungerader Zahl hat jemand ein Freilos.' },
    ],
    zeitAktiv: (s) => s.phase === 'zwischenstand',
    weiterText: (s) => ({ spielen: 'Für alle einen Zug machen', zwischenstand: 'Nächste Runde' }[s.phase]),
    status: (s) => T().status(s, 'Vier in einer Reihe'),
    endeText: (s) => (s.sieger ? `${s.sieger} gewinnt das Turnier!` : ''),

    kind(z, s, H) {
      const r = T().rahmen(z, s, H, 'Vier in einer Reihe', mini);
      if (r) {
        if (r.html.includes('__PARTIE__')) r.html = r.html.replace('__PARTIE__', brett(s.meine, false));
        return r;
      }
      const p = s.meine;
      const ichA = p.a.id === z.ich.id;
      const meineFarbe = ichA ? 'gelb' : 'rot';
      const gegner = ichA ? p.b : p.a;
      const dran = p.dran === z.ich.id;
      return {
        runde: `Runde ${s.runde} von ${s.runden}`, zeit: true,
        hinweis: dran ? 'Du bist dran: Tippe eine Spalte an.' : `${gegner.name} ist dran.`,
        html: `<div class="vier-kopf"><span>${stein(meineFarbe)} Du</span><b>gegen</b><span>${stein(ichA ? 'rot' : 'gelb')} ${esc(gegner.name)}</span></div>
          ${brett(p, dran)}
          <div class="party-knoepfe"><button type="button" class="knopf klein" data-aktion="aufgeben">Aufgeben</button></div>`,
      };
    },

    aktion(name, el, api) {
      if (name === 'setzen') api.sende('setzen', { spalte: Number(el.dataset.spalte) });
      else if (name === 'aufgeben' && window.confirm('Wirklich aufgeben? Die Partie zählt dann als verloren.')) api.sende('aufgeben');
    },

    buehne: (z, s) => T().buehne(z, s, 'Vier in einer Reihe', mini),
  });
})();
