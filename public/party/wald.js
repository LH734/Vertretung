/* Waldspiel: Karten nehmen oder ausspielen, Bäume pflanzen, Bewohner ansiedeln. */
(function () {
  'use strict';
  const { esc } = window.Gemeinsam;

  const BILD = {
    birke: '🌳', buche: '🌳', fichte: '🌲', linde: '🌳', eiche: '🌳', ahorn: '🍁',
    eule: '🦉', specht: '🐦', hoernchen: '🐿️', fledermaus: '🦇',
    pilz: '🍄', igel: '🦔', hase: '🐇', fuchs: '🦊',
    hirsch: '🦌', wildschwein: '🐗', schmetterling: '🦋', wolf: '🐺',
  };
  const ORT = { baum: 'Baum', oben: 'Krone', unten: 'Boden', seite: 'Stamm' };
  const PLAETZE = { oben: ['oben'], unten: ['unten'], seite: ['links', 'rechts'] };
  const PLATZNAME = { oben: 'oben', unten: 'unten', links: 'links', rechts: 'rechts' };

  const pkt = (n) => `${n} Punkt${n === 1 ? '' : 'e'}`;

  function karte(k, A, o) {
    o = o || {};
    const a = A[k.art];
    const kosten = a.kosten ? `kostet ${a.kosten}` : 'gratis';
    return `<button type="button" class="wald-karte t-${a.typ} b-${k.art} ${o.an ? 'an' : ''} ${o.zahlt ? 'zahlt' : ''}" ${o.aktion ? `data-aktion="${o.aktion}" data-id="${k.id}"` : 'disabled'}>
      <span class="kopf"><b>${BILD[k.art]}</b><span>${esc(a.name)}</span></span>
      <small class="ort">${ORT[a.typ]} · <em>${kosten}</em></small><small class="regel">${esc(a.regel)}</small></button>`;
  }

  function mini(k, A) {
    if (!k) return '<span class="frei"></span>';
    return `<span class="b-${k.art}" title="${esc(A[k.art].name)}">${BILD[k.art]}</span>`;
  }

  function waldHtml(wald, A, wahl) {
    if (!wald || !wald.length) return '<p class="party-text klein">Noch kein Baum gepflanzt.</p>';
    return `<div class="wald-reihe">${wald.map((b, i) => {
      const platz = (p) => {
        if (b[p]) return mini(b[p], A);
        if (wahl && wahl.plaetze.includes(p)) return `<button type="button" class="frei ziel ${wahl.baum === i && wahl.platz === p ? 'an' : ''}" data-aktion="ziel" data-baum="${i}" data-platz="${p}" aria-label="${PLATZNAME[p]}">+</button>`;
        return '<span class="frei"></span>';
      };
      return `<div class="wald-baum"><i></i>${platz('oben')}<i></i>${platz('links')}<span class="stamm b-${b.baum.art}" title="${esc(A[b.baum.art].name)}">${BILD[b.baum.art]}<small>${esc(A[b.baum.art].name)}</small></span>${platz('rechts')}<i></i>${platz('unten')}<i></i></div>`;
    }).join('')}</div>`;
  }

  function wertungHtml(w, A) {
    if (!w.posten.length) return '';
    const summe = {};
    for (const p of w.posten) summe[p.art] = (summe[p.art] || 0) + p.punkte;
    return `<p class="wald-wertung">${Object.entries(summe).map(([art, n]) => `${BILD[art]} ${esc(A[art].name)} ${n}`).join(' · ')}</p>`;
  }

  function andereHtml(s, ichId, offen) {
    const andere = s.spieler.filter((p) => p.id !== ichId);
    if (!andere.length) return '';
    return `<details class="wald-andere" ${offen ? 'open' : ''}><summary>Die anderen Wälder</summary>${andere.map((p) => `
      <div class="wald-person ${s.dran && s.dran.id === p.id ? 'dran' : ''}"><h4>${esc(p.name)} <span>${pkt(p.wertung.gesamt)} · ${p.hand} Karten</span></h4>${waldHtml(p.wald, s.arten)}</div>`).join('')}</details>`;
  }

  function lichtungHtml(s, auswahl) {
    const k = s.lichtung.length
      ? s.lichtung.map((x) => karte(x, s.arten, auswahl ? { aktion: 'lichtung', an: auswahl.includes(x.id) } : {})).join('')
      : '<p class="party-text klein">Die Lichtung ist leer.</p>';
    return `<h3 class="wuerfel-h">Lichtung <small>${s.lichtung.length} von ${s.lichtungMax}, dann wird sie geräumt</small></h3><div class="wald-karten">${k}</div>`;
  }

  function letzteHtml(s) {
    const l = s.letzte;
    if (!l) return '';
    const A = s.arten;
    let t = '';
    if (l.art === 'nehmen') {
      const teile = [];
      if (l.stapel) teile.push(`${l.stapel} vom Stapel`);
      if (l.lichtung.length) teile.push(l.lichtung.map((a) => `${BILD[a]} ${A[a].name}`).join(' und ') + ' aus der Lichtung');
      t = `${esc(l.name)} nimmt ${esc(teile.join(' und '))}.`;
    } else if (l.art === 'spielen') {
      t = `${esc(l.name)} spielt ${BILD[l.karte]} ${esc(A[l.karte].name)}${l.kosten ? ` und zahlt ${l.kosten} Karte${l.kosten === 1 ? '' : 'n'}` : ''}.`;
      if (l.gezogen) t += ` Zieht ${l.gezogen} Karte${l.gezogen === 1 ? '' : 'n'} nach.`;
      if (l.geleert) t += ' Die Lichtung war voll und wurde geräumt.';
    } else t = `${esc(l.name)} setzt aus.`;
    return `<p class="wald-letzte">${t}</p>`;
  }

  // Für einen Bewohner: welche Plätze im eigenen Wald frei sind
  function ziele(wald, typ) {
    return (wald || []).some((b) => PLAETZE[typ].some((p) => !b[p]));
  }

  window.Party.registriere('wald', {
    titel: 'Waldspiel',
    einstellungen: [
      { feld: 'zuege', typ: 'zahl', label: 'Züge pro Person', min: 6, max: 30 },
      { feld: 'sekunden', typ: 'zahl', label: 'Sekunden pro Zug', min: 20, max: 120, step: 5 },
      { typ: 'hinweis', text: '2 bis 6 Personen. Alle bauen einen eigenen Wald: Bäume pflanzen und Tiere an Krone, Boden oder Stamm ansiedeln. Jede Karte zählt nach ihrer eigenen Regel. Bei mehr als 6 Personen auf zwei Räume aufteilen.' },
    ],
    zeitAktiv: (s) => s.phase === 'zug',
    weiterText: () => 'Für die Person ziehen',
    status(s) {
      return { titel: `Waldspiel · Runde ${Math.min(s.runde, s.runden)} von ${s.runden}`, text: s.phase === 'ende' ? `${s.sieger || ''} gewinnt` : `${s.dran ? s.dran.name : ''} ist dran · ${s.stapel} Karten im Stapel` };
    },
    endeText: (s) => (s.sieger ? `${s.sieger} hat den schönsten Wald!` : ''),

    kind(z, s, H, api) {
      const A = s.arten;
      const ichId = z.ich.id;
      const ich = s.spieler.find((p) => p.id === ichId);
      const runde = `Runde ${Math.min(s.runde, s.runden)} von ${s.runden}`;
      const hand = (s.ich && s.ich.hand) || [];
      if (!s.ich || !s.ich.dabei) return { runde, hinweis: 'Du schaust diesmal zu.', html: `${lichtungHtml(s)}${andereHtml(s, ichId, true)}` };
      const meinWald = `<h3 class="wuerfel-h">Dein Wald <small>${pkt(ich.wertung.gesamt)}</small></h3>`;
      if (s.phase === 'ende') {
        return { runde: 'Spiel vorbei', html: `<div class="party-karte wuerfel-karte"><h2>${s.sieger ? `${esc(s.sieger)} gewinnt!` : 'Vorbei'}</h2><p>Du hast <b>${pkt(ich.wertung.gesamt)}</b>.</p>${wertungHtml(ich.wertung, A)}</div>
          ${meinWald}${waldHtml(ich.wald, A)}${andereHtml(s, ichId, true)}` };
      }
      const dran = s.dran && s.dran.id === ichId;
      if (!dran) {
        api.merk.modus = null;
        return { runde, zeit: true, hinweis: `${s.dran ? s.dran.name : ''} ist dran.`,
          html: `${letzteHtml(s)}${meinWald}${waldHtml(ich.wald, A)}
            <h3 class="wuerfel-h">Deine Hand <small>${hand.length} von ${s.handMax}</small></h3><div class="wald-karten">${hand.map((k) => karte(k, A)).join('')}</div>
            ${lichtungHtml(s)}${andereHtml(s, ichId, false)}` };
      }
      const m = api.merk;
      if (m.fuer !== s.zugNr) {
        // Neuer Zug: Auswahl zurücksetzen
        m.fuer = s.zugNr;
        m.modus = hand.length >= s.handMax ? 'spielen' : null;
        m.lichtung = [];
        m.stapel = 0;
        m.karte = null;
        m.zahlung = [];
        m.ziel = null;
      }
      const platz = s.handMax - hand.length;
      const wahlKnoepfe = `<div class="wald-modus">
        <button type="button" class="knopf ${m.modus === 'nehmen' ? 'haupt' : ''}" data-aktion="modus" data-wert="nehmen" ${platz ? '' : 'disabled'}>Karten nehmen</button>
        <button type="button" class="knopf ${m.modus === 'spielen' ? 'haupt' : ''}" data-aktion="modus" data-wert="spielen">Karte ausspielen</button></div>`;
      let teil = '';
      if (m.modus === 'nehmen') {
        const n = m.stapel + m.lichtung.length;
        const max = Math.min(2, platz);
        teil = `<p class="party-text">Nimm bis zu ${max} Karte${max === 1 ? '' : 'n'}: aus der Lichtung antippen oder vom Stapel.</p>
          ${lichtungHtml(s, m.lichtung)}
          <div class="wald-stapel"><span>Stapel: ${s.stapel} Karten</span>
            <button type="button" class="knopf" data-aktion="stapel" data-wert="-1" ${m.stapel ? '' : 'disabled'}>−</button><b>${m.stapel}</b>
            <button type="button" class="knopf" data-aktion="stapel" data-wert="1" ${n < max && m.stapel < s.stapel ? '' : 'disabled'}>+</button></div>
          <div class="party-knoepfe"><button type="button" class="knopf haupt gross" data-aktion="nehmen" ${n ? '' : 'disabled'}>${n ? `${n} Karte${n === 1 ? '' : 'n'} nehmen` : 'Karten wählen'}</button></div>`;
      } else if (m.modus === 'spielen') {
        const k = hand.find((x) => x.id === m.karte);
        const a = k && A[k.art];
        let schritt;
        let fertig = false;
        if (!k) schritt = '<p class="party-text">Tippe die Karte an, die du ausspielen willst.</p>';
        else {
          const fehlt = a.kosten - m.zahlung.length;
          const brauchtZiel = a.typ !== 'baum';
          schritt = `<p class="party-text">${BILD[k.art]} <b>${esc(a.name)}</b>: ${a.kosten ? (fehlt > 0 ? `Tippe noch ${fehlt} Karte${fehlt === 1 ? '' : 'n'} zum Bezahlen an.` : 'Bezahlt.') : 'Kostet nichts.'}
            ${brauchtZiel ? (ziele(ich.wald, a.typ) ? (m.ziel ? ' Platz gewählt.' : ` Wähle unten im Wald einen freien Platz (${ORT[a.typ]}).`) : ' <b>Du hast keinen freien Platz dafür.</b>') : ''}</p>`;
          fertig = fehlt === 0 && (!brauchtZiel || m.ziel);
        }
        teil = `${schritt}<div class="wald-karten">${hand.map((x) => karte(x, A, {
          aktion: 'hand', an: x.id === m.karte, zahlt: m.zahlung.includes(x.id),
        })).join('')}</div>
          <div class="party-knoepfe"><button type="button" class="knopf haupt gross" data-aktion="spielen" ${fertig ? '' : 'disabled'}>${!k ? 'Ausspielen' : a.typ === 'baum' ? 'Pflanzen' : 'Ansiedeln'}</button></div>`;
      } else {
        teil = '<p class="party-text">Was möchtest du tun?</p>';
      }
      const k = m.modus === 'spielen' && hand.find((x) => x.id === m.karte);
      const wahl = k && A[k.art].typ !== 'baum' ? { plaetze: PLAETZE[A[k.art].typ], baum: m.ziel && m.ziel.baum, platz: m.ziel && m.ziel.platz } : null;
      return { runde, zeit: true, hinweis: 'Du bist dran!',
        html: `${letzteHtml(s)}${wahlKnoepfe}${teil}${meinWald}${waldHtml(ich.wald, A, wahl)}${m.modus === 'nehmen' ? '' : lichtungHtml(s)}${andereHtml(s, ichId, false)}` };
    },

    aktion(name, el, api) {
      const m = api.merk;
      const s = api.s;
      const hand = (s.ich && s.ich.hand) || [];
      const max = Math.min(2, s.handMax - hand.length);
      if (name === 'modus') { m.modus = el.dataset.wert; m.karte = null; m.zahlung = []; m.ziel = null; m.lichtung = []; m.stapel = 0; }
      else if (name === 'lichtung') {
        const id = Number(el.dataset.id);
        if (m.lichtung.includes(id)) m.lichtung = m.lichtung.filter((x) => x !== id);
        else if (m.lichtung.length + m.stapel < max) m.lichtung.push(id);
      } else if (name === 'stapel') m.stapel = Math.max(0, Math.min(max - m.lichtung.length, m.stapel + Number(el.dataset.wert)));
      else if (name === 'nehmen') return api.sende('nehmen', { stapel: m.stapel, lichtung: m.lichtung });
      else if (name === 'hand') {
        const id = Number(el.dataset.id);
        if (m.karte === null || m.karte === undefined) { m.karte = id; m.zahlung = []; m.ziel = null; }
        else if (id === m.karte) { m.karte = null; m.zahlung = []; m.ziel = null; }
        else {
          // Andere Karten bezahlen die gewählte
          const kosten = s.arten[hand.find((x) => x.id === m.karte).art].kosten;
          if (m.zahlung.includes(id)) m.zahlung = m.zahlung.filter((x) => x !== id);
          else if (m.zahlung.length < kosten) m.zahlung.push(id);
          else if (!kosten || m.zahlung.length >= kosten) { m.karte = id; m.zahlung = []; m.ziel = null; }
        }
      } else if (name === 'ziel') m.ziel = { baum: Number(el.dataset.baum), platz: el.dataset.platz };
      else if (name === 'spielen') {
        return api.sende('spielen', { karte: m.karte, zahlung: m.zahlung, baum: m.ziel ? m.ziel.baum : null, platz: m.ziel ? m.ziel.platz : null });
      }
      api.neuMalen();
    },

    buehne(z, s) {
      const A = s.arten;
      const runde = `Runde ${Math.min(s.runde, s.runden)} von ${s.runden}`;
      const leute = s.spieler.slice().sort((a, b) => (s.phase === 'ende' ? b.wertung.gesamt - a.wertung.gesamt : 0));
      return { runde, zeit: s.phase === 'zug',
        html: `${s.phase === 'ende' ? `<div class="party-karte gross-karte wuerfel-karte"><h2>${s.sieger ? `${esc(s.sieger)} hat den schönsten Wald!` : 'Vorbei'}</h2></div>` : letzteHtml(s)}
          <div class="wald-buehne">${leute.map((p) => `<div class="wald-person ${s.dran && s.dran.id === p.id && s.phase !== 'ende' ? 'dran' : ''}">
            <h4>${esc(p.name)} <span>${pkt(p.wertung.gesamt)} · ${p.hand} Karten</span></h4>${waldHtml(p.wald, A)}${s.phase === 'ende' ? wertungHtml(p.wertung, A) : ''}</div>`).join('')}</div>
          ${s.phase === 'ende' ? '' : lichtungHtml(s)}` };
    },
  });
})();
