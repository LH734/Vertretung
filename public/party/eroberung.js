/* Eroberungsspiel: Inselkarte aus Sechsecken, verstärken, angreifen, verschieben. */
(function () {
  'use strict';
  const { esc } = window.Gemeinsam;

  const FARBEN = ['#E94F4F', '#3FB8AF', '#F5CB5E', '#8B5CF6', '#3F9A4A', '#F08A3C'];
  const FARBNAMEN = ['Rot', 'Türkis', 'Gelb', 'Violett', 'Grün', 'Orange'];
  const R = 30;
  const W = Math.sqrt(3) * R;
  const RAND = 8;

  const mitte = (l) => ({ x: RAND + W / 2 + l.c * W + (l.r % 2 ? W / 2 : 0), y: RAND + R + l.r * 1.5 * R });
  function ecken(x, y) {
    const p = [];
    for (let i = 0; i < 6; i++) { const a = Math.PI / 180 * (60 * i - 90); p.push([x + R * Math.cos(a), y + R * Math.sin(a)]); }
    return p;
  }
  // Nachbar-Richtung zu Kante i (zwischen Ecke i und i+1), für die Grenzen der Gegenden
  function nachbarAnKante(l, i) {
    const gerade = [[-1, 0], [0, 1], [1, 0], [1, -1], [0, -1], [-1, -1]];
    const ungerade = [[-1, 1], [0, 1], [1, 1], [1, 0], [0, -1], [-1, 0]];
    const [dr, dc] = (l.r % 2 ? ungerade : gerade)[i];
    return [l.r + dr, l.c + dc];
  }

  function farbe(s, id) {
    const p = s.spieler.find((x) => x.id === id);
    return p ? FARBEN[p.farbe % FARBEN.length] : '#D8D4C8';
  }

  function karteSvg(s, o) {
    o = o || {};
    const L = s.karte.laender;
    const bei = new Map(L.map((l) => [`${l.r},${l.c}`, l]));
    const breite = RAND * 2 + W * 7.5;
    const hoehe = RAND * 2 + R * 2 + 4 * 1.5 * R;
    let wege = '';
    let felder = '';
    let grenzen = '';
    let zahlen = '';
    const gemalt = new Set();
    for (const l of L) {
      const m = mitte(l);
      // Seewege gestrichelt
      for (const n of l.nachbarn) {
        const x = L[n];
        const schluessel = [l.id, n].sort().join('-');
        if (gemalt.has(schluessel)) continue;
        gemalt.add(schluessel);
        const istNachbarFeld = [0, 1, 2, 3, 4, 5].some((i) => { const [r, c] = nachbarAnKante(l, i); return r === x.r && c === x.c; });
        if (!istNachbarFeld) { const q = mitte(x); wege += `<line x1="${m.x}" y1="${m.y}" x2="${q.x}" y2="${q.y}"/>`; }
      }
      const e = ecken(m.x, m.y);
      const klassen = ['land'];
      if (o.von === l.id) klassen.push('von');
      if (o.ziele && o.ziele.includes(l.id)) klassen.push('ziel');
      if (o.nach === l.id) klassen.push('nach');
      if (o.eigene && o.eigene.includes(l.id)) klassen.push('waehlbar');
      felder += `<polygon class="${klassen.join(' ')}" data-aktion="land" data-id="${l.id}" points="${e.map((p) => p.map((v) => v.toFixed(1)).join(',')).join(' ')}" fill="${farbe(s, s.besitz[l.id])}"><title>${esc(l.name)}</title></polygon>`;
      for (let i = 0; i < 6; i++) {
        const [r, c] = nachbarAnKante(l, i);
        const nb = bei.get(`${r},${c}`);
        if (!nb || nb.gegend !== l.gegend) {
          const a = e[i];
          const b = e[(i + 1) % 6];
          grenzen += `<line class="${nb ? 'innen' : 'kueste'}" x1="${a[0].toFixed(1)}" y1="${a[1].toFixed(1)}" x2="${b[0].toFixed(1)}" y2="${b[1].toFixed(1)}"/>`;
        }
      }
      zahlen += `<g class="truppen" pointer-events="none"><circle cx="${m.x}" cy="${m.y}" r="11"/><text x="${m.x}" y="${m.y + 5}">${s.armeen[l.id]}</text></g>`;
    }
    return `<svg class="ero-karte" viewBox="0 0 ${breite.toFixed(0)} ${hoehe.toFixed(0)}" role="img" aria-label="Inselkarte">
      <g class="seewege">${wege}</g><g>${felder}</g><g class="grenzen" pointer-events="none">${grenzen}</g>${zahlen}</svg>`;
  }

  function spielerHtml(s, ichId) {
    return `<ul class="ero-spieler">${s.spieler.map((p) => `<li class="${s.dran && s.dran.id === p.id ? 'dran' : ''} ${p.raus ? 'raus' : ''} ${p.id === ichId ? 'ich' : ''}">
      <span class="chip" style="background:${FARBEN[p.farbe % FARBEN.length]}"></span><span class="n">${esc(p.name)}${p.online ? '' : ' (weg)'}</span>
      <span>${p.laender} Länder</span><span>${p.armeen} Truppen</span><span title="Sterne: 3 Sterne = 5 Extra-Truppen">${'★'.repeat(p.sterne) || '–'}</span></li>`).join('')}</ul>`;
  }

  function gegendenHtml(s) {
    return `<p class="ero-gegenden">Ganze Gegend halten gibt Extra-Truppen: ${s.karte.gegenden.map((g) => `${esc(g.name)} +${g.bonus}`).join(' · ')}</p>`;
  }

  function kampfHtml(s, H) {
    const k = s.kampf;
    if (!k) return '';
    const L = s.karte.laender;
    const letzte = k.runden[k.runden.length - 1];
    return `<div class="ero-kampf"><p><b>${esc(L[k.von].name)}</b> greift <b>${esc(L[k.nach].name)}</b> an${k.runden.length > 1 ? ` (${k.runden.length} Würfe)` : ''}</p>
      <div class="ero-wuerfel"><span>${letzte.a.map((a) => H.wuerfel(a, 'angriff')).join('')}</span><i>gegen</i><span>${letzte.v.map((v) => H.wuerfel(v, 'abwehr')).join('')}</span></div>
      <p>${k.erobert ? '<b>Erobert!</b> ' : ''}Verluste: Angriff ${k.verlustA}, Abwehr ${k.verlustV}</p></div>`;
  }

  // Länder, die man aus „von“ erreichen kann
  function angriffsZiele(s, von, ichId) {
    return s.karte.laender[von].nachbarn.filter((n) => s.besitz[n] !== ichId);
  }
  function verbunden(s, von, ichId) {
    const L = s.karte.laender;
    const besucht = new Set([von]);
    const offen = [von];
    while (offen.length) {
      const x = offen.pop();
      for (const n of L[x].nachbarn) if (!besucht.has(n) && s.besitz[n] === ichId) { besucht.add(n); offen.push(n); }
    }
    besucht.delete(von);
    return [...besucht];
  }

  const STUFE = { verstaerken: 'Verstärken', angreifen: 'Angreifen', verschieben: 'Verschieben' };

  window.Party.registriere('eroberung', {
    titel: 'Eroberungsspiel',
    einstellungen: [
      { feld: 'runden', typ: 'zahl', label: 'Runden', min: 3, max: 20 },
      { feld: 'sekunden', typ: 'zahl', label: 'Sekunden pro Zug', min: 30, max: 240, step: 10 },
      { typ: 'hinweis', text: '3 bis 6 Personen. Wer dran ist, verstärkt, greift Nachbarländer mit Würfeln an und darf einmal verschieben. Nach den eingestellten Runden gewinnt, wer die meisten Länder hat. Bei mehr als 6 Personen auf zwei Räume aufteilen.' },
    ],
    zeitAktiv: (s) => s.phase === 'zug',
    weiterText: () => 'Zug für die Person beenden',
    status(s) {
      return { titel: `Eroberungsspiel · Runde ${Math.min(s.runde, s.runden)} von ${s.runden}`, text: s.phase === 'ende' ? `${s.sieger || ''} gewinnt` : `${s.dran ? s.dran.name : ''}: ${STUFE[s.stufe] || ''}` };
    },
    endeText: (s) => (s.sieger ? `${s.sieger} beherrscht die Insel!` : ''),

    kind(z, s, H, api) {
      const ichId = z.ich.id;
      const ich = s.spieler.find((p) => p.id === ichId);
      const runde = `Runde ${Math.min(s.runde, s.runden)} von ${s.runden}`;
      const meineFarbe = ich ? `<span class="chip" style="background:${FARBEN[ich.farbe % FARBEN.length]}"></span> Du bist ${FARBNAMEN[ich.farbe % FARBEN.length]}` : 'Du schaust zu';
      if (s.phase === 'ende') {
        return { runde: 'Spiel vorbei', html: `<div class="party-karte wuerfel-karte"><h2>${s.sieger ? `${esc(s.sieger)} gewinnt!` : 'Vorbei'}</h2>${ich ? `<p>Du hast ${ich.laender} Länder.</p>` : ''}</div>${karteSvg(s)}${spielerHtml(s, ichId)}` };
      }
      const dran = s.dran && s.dran.id === ichId;
      const m = api.merk;
      const schluessel = `${s.dran && s.dran.id}:${s.stufe}`;
      if (m.fuer !== schluessel) { m.fuer = schluessel; m.von = null; m.nach = null; }
      if (m.von !== null && m.von !== undefined && s.besitz[m.von] !== ichId) { m.von = null; m.nach = null; }
      if (!dran) {
        return { runde, zeit: true, hinweis: `${s.dran ? s.dran.name : ''} ist dran: ${STUFE[s.stufe] || ''}.`,
          html: `<p class="ero-ich">${meineFarbe}</p>${karteSvg(s)}${kampfHtml(s, H)}${spielerHtml(s, ichId)}${gegendenHtml(s)}` };
      }
      const meine = s.karte.laender.filter((l) => s.besitz[l.id] === ichId).map((l) => l.id);
      const L = s.karte.laender;
      let anleitung = '';
      let knoepfe = '';
      let o = {};
      if (s.nachruecken) {
        const n = s.nachruecken;
        const haelfte = Math.max(n.min, Math.floor((n.min + n.max) / 2));
        anleitung = `<b>${esc(L[n.nach].name)} erobert!</b> Wie viele Truppen rücken nach?`;
        o = { von: n.von, nach: n.nach };
        knoepfe = [...new Set([n.min, haelfte, n.max])].map((x) => `<button type="button" class="knopf ${x === n.max ? 'haupt' : ''}" data-aktion="nachruecken" data-wert="${x}">${x}</button>`).join('');
      } else if (s.stufe === 'verstaerken') {
        anleitung = `Setze <b>${s.reserve}</b> neue Truppe${s.reserve === 1 ? '' : 'n'}${s.sternGenutzt ? ' (mit Sternbonus)' : ''}. Tippe ein eigenes Land an.`;
        o = { von: m.von, eigene: meine };
        if (m.von !== null && m.von !== undefined) {
          anleitung = `<b>${esc(L[m.von].name)}</b>: Wie viele Truppen? Noch ${s.reserve} übrig.`;
          knoepfe = [...new Set([1, Math.min(3, s.reserve), s.reserve])].map((x) => `<button type="button" class="knopf ${x === s.reserve ? 'haupt' : ''}" data-aktion="setzen" data-wert="${x}">${x === s.reserve && x > 1 ? `Alle ${x}` : `+${x}`}</button>`).join('');
        }
      } else if (s.stufe === 'angreifen') {
        const v = m.von;
        if (v === null || v === undefined) {
          anleitung = 'Tippe ein eigenes Land mit mindestens 2 Truppen an, aus dem du angreifen willst.';
          o = { eigene: meine.filter((x) => s.armeen[x] >= 2 && angriffsZiele(s, x, ichId).length) };
        } else {
          const ziele = angriffsZiele(s, v, ichId);
          o = { von: v, ziele, nach: m.nach };
          if (m.nach === null || m.nach === undefined) anleitung = `Aus <b>${esc(L[v].name)}</b> (${s.armeen[v]}): Tippe ein fremdes Nachbarland an.`;
          else {
            anleitung = `<b>${esc(L[v].name)}</b> (${s.armeen[v]}) greift <b>${esc(L[m.nach].name)}</b> (${s.armeen[m.nach]}) an.`;
            knoepfe = s.armeen[v] >= 2 ? '<button type="button" class="knopf haupt" data-aktion="angriff">Würfeln</button><button type="button" class="knopf" data-aktion="angriff" data-bis="1">Bis zum Ende</button>' : '<span class="party-text klein">Zu wenig Truppen für einen Angriff.</span>';
          }
        }
        knoepfe += '<button type="button" class="knopf gold" data-aktion="angriffEnde">Angriffe beenden</button>';
      } else if (s.stufe === 'verschieben') {
        const v = m.von;
        if (v === null || v === undefined) {
          anleitung = 'Einmal Truppen verschieben: Tippe das Land an, aus dem sie kommen. Oder beende den Zug.';
          o = { eigene: meine.filter((x) => s.armeen[x] >= 2) };
        } else {
          const ziele = verbunden(s, v, ichId);
          o = { von: v, ziele, nach: m.nach };
          if (m.nach === null || m.nach === undefined) anleitung = `Aus <b>${esc(L[v].name)}</b>: Tippe ein verbundenes eigenes Land an.`;
          else {
            const max = s.armeen[v] - 1;
            anleitung = `Von <b>${esc(L[v].name)}</b> nach <b>${esc(L[m.nach].name)}</b>: Wie viele?`;
            knoepfe = [...new Set([1, Math.max(1, Math.floor(max / 2)), max])].map((x) => `<button type="button" class="knopf ${x === max ? 'haupt' : ''}" data-aktion="verschieben" data-wert="${x}">${x}</button>`).join('');
          }
        }
        knoepfe += '<button type="button" class="knopf gold" data-aktion="zugEnde">Zug beenden</button>';
      }
      return { runde, zeit: true, hinweis: `Du bist dran: ${STUFE[s.stufe]}`,
        html: `<p class="ero-ich">${meineFarbe} · <b>${STUFE[s.stufe]}</b></p>
          <p class="ero-anleitung">${anleitung}</p>${karteSvg(s, o)}
          <div class="party-knoepfe ero-knoepfe">${knoepfe}</div>${kampfHtml(s, H)}${spielerHtml(s, ichId)}${gegendenHtml(s)}` };
    },

    aktion(name, el, api) {
      const m = api.merk;
      const s = api.s;
      const ichId = api.z.ich.id;
      if (name === 'land') {
        const id = Number(el.dataset.id);
        if (s.nachruecken) return;
        if (s.stufe === 'verstaerken') { if (s.besitz[id] === ichId) m.von = id; }
        else if (s.stufe === 'angreifen') {
          if (s.besitz[id] === ichId) { m.von = s.armeen[id] >= 2 ? id : null; m.nach = null; }
          else if (m.von !== null && m.von !== undefined && angriffsZiele(s, m.von, ichId).includes(id)) m.nach = id;
        } else if (s.stufe === 'verschieben') {
          if (m.von !== null && m.von !== undefined && id !== m.von && verbunden(s, m.von, ichId).includes(id)) m.nach = id;
          else if (s.besitz[id] === ichId && s.armeen[id] >= 2) { m.von = id; m.nach = null; }
        }
        return api.neuMalen();
      }
      if (name === 'setzen') return api.sende('setzen', { land: m.von, anzahl: Number(el.dataset.wert) });
      if (name === 'angriff') return api.sende('angriff', { von: m.von, nach: m.nach, bisZumEnde: !!el.dataset.bis });
      if (name === 'nachruecken') return api.sende('nachruecken', { anzahl: Number(el.dataset.wert) });
      if (name === 'verschieben') return api.sende('verschieben', { von: m.von, nach: m.nach, anzahl: Number(el.dataset.wert) });
      if (name === 'angriffEnde' || name === 'zugEnde') return api.sende(name);
    },

    buehne(z, s, H) {
      const runde = `Runde ${Math.min(s.runde, s.runden)} von ${s.runden}`;
      const kopf = s.phase === 'ende'
        ? `<div class="party-karte wuerfel-karte"><h2>${s.sieger ? `${esc(s.sieger)} beherrscht die Insel!` : 'Vorbei'}</h2></div>`
        : `<p class="ero-anleitung">${s.dran ? `<b>${esc(s.dran.name)}</b>: ${STUFE[s.stufe] || ''}` : ''}${s.stufe === 'verstaerken' ? ` · ${s.reserve} Truppen zu setzen` : ''}</p>`;
      return { runde, zeit: s.phase === 'zug',
        html: `<div class="ero-buehne"><div>${kopf}${karteSvg(s, s.kampf && s.phase !== 'ende' ? { von: s.kampf.von, nach: s.kampf.nach } : {})}</div>
          <div>${spielerHtml(s)}${kampfHtml(s, H)}${gegendenHtml(s)}</div></div>` };
    },
  });
})();
