/* Stirnraten: Handy an die Stirn, die anderen erklären. Kippen nach vorn = richtig, nach hinten = weiter. */
(function () {
  'use strict';
  const { esc } = window.Gemeinsam;

  const IOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const kippen = { an: false, frei: true, api: null, letzt: 0 };

  // Schwerkraft entlang der Bildschirm-Achse: vornüber (Bildschirm zum Boden) = richtig, nach hinten = weiter
  function bewegung(e) {
    const g = e.accelerationIncludingGravity;
    if (!g || g.z === null || !kippen.api) return;
    const z = IOS ? -g.z : g.z;
    const jetzt = Date.now();
    if (Math.abs(z) < 3.5) { kippen.frei = true; return; }
    if (!kippen.frei || jetzt - kippen.letzt < 900) return;
    const s = kippen.api.s;
    if (!s || s.art !== 'stirnraten' || s.phase !== 'raten' || !s.ich || !s.ich.rater) return;
    if (z < -7) melde('richtig');
    else if (z > 7) melde('weiter');
  }

  function melde(art) {
    kippen.frei = false;
    kippen.letzt = Date.now();
    if (navigator.vibrate) navigator.vibrate(art === 'richtig' ? 80 : [40, 60, 40]);
    window.Ton.spiele(art === 'richtig' ? 'richtig' : 'weiter');
    const w = document.querySelector('.stirn-wort');
    if (w) { w.classList.remove('richtig', 'weiter'); void w.offsetWidth; w.classList.add(art); }
    kippen.api.sende(art);
  }

  function schalteKippenEin(api, danach) {
    kippen.api = api;
    const an = () => {
      if (!kippen.an) window.addEventListener('devicemotion', bewegung);
      kippen.an = true;
      danach();
    };
    // Nur das iPhone verlangt eine Erlaubnis. Andere Geräte liefern die Werte einfach so.
    if (IOS && window.DeviceMotionEvent && typeof DeviceMotionEvent.requestPermission === 'function') {
      DeviceMotionEvent.requestPermission().then((r) => { if (r === 'granted') an(); else { api.melde('Ohne Erlaubnis geht nur Tippen.', 'fehler'); danach(); } })
        .catch(() => danach());
    } else if ('DeviceMotionEvent' in window) an();
    else danach();
  }

  function verlaufHtml(s) {
    if (!s.verlauf.length) return '<p class="party-text">Kein Begriff geschafft.</p>';
    return `<ul class="party-verlauf">${s.verlauf.map((v) => `<li class="${v.ergebnis}"><b>${{ richtig: '✓', weiter: '→', offen: '·' }[v.ergebnis]}</b> ${esc(v.wort)}</li>`).join('')}</ul>`;
  }

  window.Party.registriere('stirnraten', {
    titel: 'Stirnraten',
    einstellungen: [
      { feld: 'runden', typ: 'zahl', label: 'Runden (alle einmal)', min: 1, max: 5 },
      { feld: 'sekunden', typ: 'zahl', label: 'Sekunden pro Zug', min: 30, max: 120, step: 10 },
      { feld: 'listen', typ: 'listen', label: 'Begriffe aus', quelle: 'begriffe' },
      { typ: 'hinweis', text: 'Ab 2 Mitspielenden. Wer dran ist, hält das Handy quer an die Stirn. Die anderen erklären, machen vor oder summen. Kippen nach vorn heißt „richtig“, nach hinten „weiter“. Alle anderen können auch tippen.' },
    ],

    zeitAktiv: (s) => ['bereit', 'raten', 'zugende'].includes(s.phase),
    weiterText: (s) => ({ bereit: 'Zug starten', raten: 'Zug beenden', zugende: 'Nächster Zug' }[s.phase]),
    status(s) {
      return { titel: `Stirnraten · Zug ${s.zug || 0} von ${s.zuege || 0}`, text: s.rater ? `${s.rater.name} rät · ${s.richtig || 0} richtig` : '' };
    },

    kind(z, s, H, api) {
      kippen.api = api;
      if (!s.rater) return { html: '' };
      const runde = `Zug ${s.zug} von ${s.zuege}`;
      const ich = s.ich || {};
      if (s.phase === 'bereit') {
        if (ich.rater) {
          return { runde, zeit: true, schluessel: 'bereit' + s.zug, hinweis: 'Du bist dran!',
            html: `<div class="party-karte"><h2>Du rätst!</h2><p>Halte das Handy quer an die Stirn, der Bildschirm zeigt nach außen.</p>
              <p><b>Nach vorn kippen</b> = richtig · <b>nach hinten kippen</b> = weiter</p>
              <div class="party-knoepfe"><button type="button" class="knopf haupt gross" data-aktion="losKippen">Mit Kippen starten</button>
              <button type="button" class="knopf" data-aktion="los">Ohne Kippen</button></div></div>` };
        }
        return { runde, zeit: true, schluessel: 'bereit' + s.zug, hinweis: `${s.rater.name} rät gleich.`,
          html: `<div class="party-karte"><h2>${esc(s.rater.name)} rät gleich</h2><p>Erklärt oder spielt vor, ohne das Wort zu sagen. Ihr könnt auch hier „Richtig“ oder „Weiter“ tippen.</p></div>` };
      }
      if (s.phase === 'raten' && s.wort) {
        if (ich.rater) {
          return { vollbild: true, zeit: false,
            html: `<div class="stirn-wort">${esc(s.wort)}</div>
              <button type="button" class="stirn-ecke links" data-aktion="weiter">weiter</button>
              <button type="button" class="stirn-ecke rechts" data-aktion="richtig">richtig</button>` };
        }
        return { runde, zeit: true, hinweis: `${s.rater.name} rät · ${s.richtig} richtig`,
          html: `<div class="erklaer-karte"><b>${esc(s.wort)}</b><span>Nicht vorlesen!</span></div>
            <div class="party-knoepfe gross-knoepfe"><button type="button" class="knopf gross" data-aktion="weiter">Weiter</button>
            <button type="button" class="knopf haupt gross gruen" data-aktion="richtig">Richtig!</button></div>` };
      }
      if (s.phase === 'zugende') {
        return { runde, zeit: true, schluessel: 'ende' + s.zug, hinweis: 'Handy runter!',
          html: `<div class="party-karte"><h2>${esc(s.rater.name)}: ${s.richtig} richtig</h2>${verlaufHtml(s)}</div>` };
      }
      return { runde, html: '' };
    },

    aktion(name, el, api) {
      if (name === 'losKippen') schalteKippenEin(api, () => api.sende('los'));
      else if (name === 'los') api.sende('los');
      else if (name === 'richtig' || name === 'weiter') {
        if (api.s.ich && api.s.ich.rater) { kippen.api = api; melde(name); } else api.sende(name);
      }
    },

    buehne(z, s) {
      if (!s.rater) return {};
      const runde = `Zug ${s.zug} von ${s.zuege}`;
      let html;
      if (s.phase === 'bereit') html = `<div class="party-karte gross-karte"><h2>${esc(s.rater.name)} ist dran</h2><p>Handy an die Stirn! Das Wort steht auf allen anderen Handys, hier nicht.</p></div>`;
      else if (s.phase === 'raten') html = `<div class="party-karte gross-karte"><h2>${esc(s.rater.name)} rät</h2><p class="riesig">${s.richtig}</p><p>richtig erraten</p></div>`;
      else html = `<div class="party-karte"><h2>${esc(s.rater.name)}: ${s.richtig} richtig</h2>${verlaufHtml(s)}</div>`;
      return { runde, zeit: s.phase !== 'ende', schluessel: s.phase + s.zug, html };
    },

    verlassen() {
      if (kippen.an) window.removeEventListener('devicemotion', bewegung);
      kippen.an = false;
    },
  });
})();
