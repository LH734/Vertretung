/* Töne, im Browser erzeugt (keine Dateien nötig). Pro Gerät an- und abschaltbar. */
(function () {
  'use strict';
  const SPEICHER = 'spieleraum-toene';
  let ctx = null;

  function an() {
    try { return localStorage.getItem(SPEICHER) !== 'aus'; } catch (e) { return true; }
  }
  function setze(wert) {
    try { localStorage.setItem(SPEICHER, wert ? 'an' : 'aus'); } catch (e) { /* ohne Speicher */ }
  }

  // Browser erlauben Ton erst nach einer Berührung
  function bereit() {
    if (!ctx) {
      const A = window.AudioContext || window.webkitAudioContext;
      if (!A) return null;
      ctx = new A();
    }
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return ctx;
  }
  document.addEventListener('pointerdown', bereit, { passive: true });

  function ton(frequenz, start, dauer, o) {
    o = o || {};
    const c = bereit();
    if (!c) return;
    const t0 = c.currentTime + start;
    const osz = c.createOscillator();
    const laut = c.createGain();
    osz.type = o.form || 'sine';
    osz.frequency.setValueAtTime(frequenz, t0);
    if (o.bis) osz.frequency.exponentialRampToValueAtTime(o.bis, t0 + dauer);
    const pegel = o.pegel || 0.18;
    laut.gain.setValueAtTime(0.0001, t0);
    laut.gain.exponentialRampToValueAtTime(pegel, t0 + 0.015);
    laut.gain.exponentialRampToValueAtTime(0.0001, t0 + dauer);
    osz.connect(laut).connect(c.destination);
    osz.start(t0);
    osz.stop(t0 + dauer + 0.05);
  }

  const KLAENGE = {
    tick: () => ton(1200, 0, 0.06, { form: 'square', pegel: 0.05 }),
    richtig: () => { ton(660, 0, 0.12); ton(990, 0.1, 0.22); },
    weiter: () => ton(330, 0, 0.18, { form: 'triangle', bis: 220 }),
    falsch: () => { ton(220, 0, 0.18, { form: 'sawtooth', pegel: 0.08 }); ton(165, 0.15, 0.25, { form: 'sawtooth', pegel: 0.08 }); },
    summer: () => ton(140, 0, 0.55, { form: 'sawtooth', pegel: 0.16 }),
    gong: () => { ton(392, 0, 1.2, { pegel: 0.16 }); ton(523, 0, 1.2, { pegel: 0.08 }); },
    nacht: () => { ton(294, 0, 0.9, { form: 'triangle' }); ton(220, 0.35, 1.2, { form: 'triangle' }); },
    tag: () => { ton(523, 0, 0.25); ton(659, 0.18, 0.25); ton(784, 0.36, 0.5); },
    fanfare: () => { ton(523, 0, 0.18); ton(659, 0.16, 0.18); ton(784, 0.32, 0.18); ton(1047, 0.5, 0.6); },
    alarm: () => { for (let i = 0; i < 4; i++) { ton(880, i * 0.3, 0.14, { form: 'square', pegel: 0.07 }); ton(660, i * 0.3 + 0.15, 0.14, { form: 'square', pegel: 0.07 }); } },
    erwischt: () => ton(500, 0, 0.7, { form: 'sawtooth', bis: 90, pegel: 0.12 }),
  };

  function spiele(name) {
    if (!an() || !KLAENGE[name]) return;
    try { KLAENGE[name](); } catch (e) { /* Ton ist nur Beiwerk */ }
  }

  // Knopf zum Umschalten, beliebig oft einsetzbar
  function knopfText() { return an() ? 'Ton: an' : 'Ton: aus'; }
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-ton-schalter]');
    if (!b) return;
    setze(!an());
    document.querySelectorAll('[data-ton-schalter]').forEach((k) => { k.textContent = knopfText(); });
    if (an()) spiele('richtig');
  });

  window.Ton = { spiele, an, knopfText };
})();
