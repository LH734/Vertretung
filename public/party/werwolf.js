/* Werwolf */
(function () {
  'use strict';
  const { esc } = window.Gemeinsam;

  const BESCHREIBUNG = {
    werwolf: 'Nachts sucht ihr Werwölfe euch gemeinsam ein Opfer. Tagsüber tut ihr ganz harmlos.',
    seherin: 'Jede Nacht darfst du bei einer Person nachsehen, ob sie ein Werwolf ist.',
    hexe: 'Du hast einen Heiltrank und einen Gifttrank, beide nur einmal im ganzen Spiel.',
    dorf: 'Finde gemeinsam mit dem Dorf die Werwölfe, bevor sie euch alle erwischen.',
  };
  const NACHT = ['woelfe', 'seherin', 'hexe'];

  const rollenName = (s, r) => (r ? s.rollenNamen[r] : '');

  function rolleKarte(s, H) {
    const r = s.ich.rolle;
    const partner = r === 'werwolf' ? s.mitspieler.filter((m) => m.rolle === 'werwolf' && m.id !== window.Party.meineId) : [];
    return H.halteKarte('Deine Rolle', `<b class="gross ${r === 'werwolf' ? 'rot' : ''}">${esc(rollenName(s, r))}</b>
      <span>${BESCHREIBUNG[r]}</span>${partner.length ? `<span>Mit dir: <b>${partner.map((p) => esc(p.name)).join(', ')}</b></span>` : ''}`, r === 'werwolf' ? 'spion' : '');
  }

  function erzaehlung(s) {
    switch (s.phase) {
      case 'rollen': return 'Willkommen im Dorf. Schaut euch heimlich eure Rolle an. Niemand darf mitgucken.';
      case 'woelfe': return 'Die Nacht bricht herein. Alle schließen die Augen. Die Werwölfe erwachen und suchen sich ein Opfer.';
      case 'seherin': return 'Die Werwölfe schlafen wieder ein. Die Seherin erwacht und blickt in die Seele eines Menschen.';
      case 'hexe': return 'Die Seherin schläft ein. Die Hexe erwacht. Will sie heute Nacht einen Trank benutzen?';
      case 'morgen': {
        if (!s.tote || !s.tote.length) return 'Das Dorf erwacht. Alle öffnen die Augen. Welch ein Glück: In dieser Nacht ist niemand gestorben.';
        return `Das Dorf erwacht. Alle öffnen die Augen. In dieser Nacht ${s.tote.length > 1 ? 'sind' : 'ist'} ${s.tote.map((t) => t.name).join(' und ')} gestorben.`;
      }
      case 'tag': return 'Jetzt wird diskutiert. Wer ist ein Werwolf? Stimmt auf dem Handy ab.';
      case 'urteil': return s.urteil.name ? `Das Dorf hat entschieden: ${s.urteil.name} muss das Dorf verlassen.` : 'Das Dorf konnte sich nicht einigen. Niemand muss gehen.';
      case 'ende': return s.sieger === 'dorf' ? 'Alle Werwölfe sind besiegt. Das Dorf hat gewonnen!' : 'Die Werwölfe haben das Dorf übernommen. Die Werwölfe gewinnen!';
      default: return '';
    }
  }

  function toteText(s) {
    if (!s.tote.length) return '<p class="party-gross">Niemand ist gestorben.</p>';
    return s.tote.map((t) => `<p class="party-gross">${esc(t.name)}${t.rolle ? ` <small>(${esc(rollenName(s, t.rolle))})</small>` : ''}</p>`).join('');
  }

  function urteilText(s) {
    const u = s.urteil;
    if (!u.name) return `<h2>${{ gleichstand: 'Gleichstand!', uebersprungen: 'Übersprungen!', keine: 'Niemand hat abgestimmt.' }[u.grund] || ''}</h2><p>Niemand muss das Dorf verlassen.</p>`;
    return `<h2>${esc(u.name)} muss gehen.</h2>${u.rolle ? `<p class="party-gross ${u.rolle === 'werwolf' ? 'rot' : ''}">… und war ${u.rolle === 'werwolf' ? 'ein Werwolf!' : esc(rollenName(s, u.rolle))}</p>` : ''}
      <ul class="sab-stimmen">${u.stimmen.map((x) => `<li>${esc(x.name)}<b>${x.n}</b></li>`).join('')}${u.skip ? `<li>Überspringen<b>${u.skip}</b></li>` : ''}</ul>`;
  }

  function dorfListe(s, H, mitRolle) {
    return H.personen(s.mitspieler.map((m) => ({ ...m, tot: !m.lebt })), {
      aus: () => true,
      zusatz: (m) => [!m.lebt ? 'tot' : '', mitRolle && m.rolle ? rollenName(s, m.rolle) : ''].filter(Boolean).join(' · '),
      haken: (m) => s.abgestimmt && s.abgestimmt.includes(m.id),
    });
  }

  window.Party.registriere('werwolf', {
    titel: 'Werwolf',
    erzaehler: true,
    einstellungen: [
      { feld: 'woelfe', typ: 'zahl', label: 'Werwölfe (0 = automatisch)', min: 0, max: 4 },
      { feld: 'seherin', typ: 'schalter', label: 'Seherin', texte: ['mit', 'ohne'] },
      { feld: 'hexe', typ: 'schalter', label: 'Hexe (ab 6)', texte: ['mit', 'ohne'] },
      { feld: 'tagSekunden', typ: 'zahl', label: 'Diskussion am Tag (s)', min: 60, max: 600, step: 30 },
      { feld: 'aufdecken', typ: 'schalter', label: 'Rolle der Toten', texte: ['aufdecken', 'geheim'] },
      { typ: 'hinweis', text: 'Ab 5 Mitspielenden, am schönsten ab 8. Alle sitzen im Kreis, nachts werden die Augen geschlossen. Die Bühne kann die Erzählung vorlesen.' },
    ],

    zeitAktiv: (s) => ['rollen', 'woelfe', 'seherin', 'hexe', 'morgen', 'tag', 'urteil'].includes(s.phase),
    weiterText: (s) => ({ rollen: 'Nacht beginnen', woelfe: 'Werwölfe fertig', seherin: 'Seherin fertig', hexe: 'Hexe fertig', morgen: 'Tag beginnen', tag: 'Abstimmung beenden', urteil: 'Nächste Nacht' }[s.phase]),
    status(s) {
      const titel = s.nacht ? `Werwolf · Nacht ${s.nacht}` : 'Werwolf';
      const text = { rollen: 'Rollen anschauen', woelfe: 'Nacht: Werwölfe', seherin: 'Nacht: Seherin', hexe: 'Nacht: Hexe', morgen: 'Das Dorf erwacht', tag: `Tag · ${(s.abgestimmt || []).length} von ${s.lebende} abgestimmt`, urteil: 'Urteil', ende: s.sieger === 'dorf' ? 'Das Dorf gewinnt' : 'Die Werwölfe gewinnen' }[s.phase] || '';
      return { titel, text };
    },

    kind(z, s, H, api) {
      window.Party.meineId = z.ich.id;
      const ich = s.ich;
      const runde = s.nacht ? `Nacht ${s.nacht}` : '';
      const nacht = NACHT.includes(s.phase);
      if (!ich) return { html: '<p class="party-text">Das Spiel läuft schon. Beim nächsten Mal bist du dabei.</p>' };
      if (!ich.lebt && s.phase !== 'ende') {
        return { runde, nacht, zeit: true, hinweis: 'Du bist tot. Psst, nichts verraten!',
          html: `<p class="party-text">${esc(erzaehlung(s))}</p><h3 class="party-zwischen">Alle Rollen</h3>${dorfListe(s, H, true)}` };
      }
      if (s.phase === 'rollen') {
        return { runde, zeit: true, schluessel: 'rolle', hinweis: 'Schau dir heimlich deine Rolle an.', html: rolleKarte(s, H) };
      }
      if (nacht) {
        const leer = { runde, nacht, zeit: false, hinweis: 'Augen zu!', schluessel: 'nacht' + s.nacht,
          html: `<div class="party-nachtbild"><p class="party-gross">Es ist Nacht.</p><p class="party-text">Augen zu, bis das Dorf erwacht.</p></div>` };
        if (s.phase === 'woelfe' && ich.rolle === 'werwolf') {
          const wahlen = Object.entries(ich.wahl || {}).map(([w, o]) => `${esc(w)} → ${esc(o)}`).join(' · ');
          return { runde, nacht, zeit: true, hinweis: 'Werwölfe, sucht euch ein Opfer aus. Leise!', schluessel: 'woelfe' + s.nacht,
            html: `${H.personen(s.mitspieler.filter((m) => m.lebt && m.rolle !== 'werwolf'), { aktion: 'wolf', gewaehlt: ich.meineWahl })}
              <p class="party-klein">${wahlen ? `Eure Wahl: ${wahlen}` : 'Noch hat niemand gewählt.'} Seid ihr euch einig, geht es weiter.</p>` };
        }
        if (s.phase === 'seherin' && ich.rolle === 'seherin') {
          if (ich.gesehen) {
            return { runde, nacht, zeit: true, schluessel: 'gesehen' + s.nacht,
              html: `<div class="party-karte"><p>${esc(ich.gesehen.name)} ist …</p><p class="party-gross ${ich.gesehen.wolf ? 'rot' : ''}">${ich.gesehen.wolf ? 'ein Werwolf!' : 'kein Werwolf.'}</p></div>` };
          }
          return { runde, nacht, zeit: true, hinweis: 'Seherin, bei wem willst du nachsehen?', schluessel: 'seherin' + s.nacht,
            html: H.personen(s.mitspieler.filter((m) => m.lebt && m.id !== z.ich.id), { aktion: 'sehen' }) };
        }
        if (s.phase === 'hexe' && ich.rolle === 'hexe') {
          if (ich.entschieden) return { runde, nacht, zeit: true, html: '<p class="party-gross">Erledigt. Augen zu!</p>' };
          const gift = api.merk.gift;
          return { runde, nacht, zeit: true, hinweis: 'Hexe, willst du einen Trank benutzen?', schluessel: 'hexe' + s.nacht,
            html: `<div class="party-karte"><p>${ich.opfer ? `Die Werwölfe haben <b>${esc(ich.opfer.name)}</b> erwischt.` : 'Die Werwölfe haben niemanden erwischt.'}</p>
              ${ich.opfer && ich.heiltrank ? `<label class="party-haken"><input type="checkbox" data-aktion="heilen" ${api.merk.heilen ? 'checked' : ''}> Heiltrank: ${esc(ich.opfer.name)} retten</label>` : ''}
              ${!ich.heiltrank ? '<p class="party-klein">Dein Heiltrank ist verbraucht.</p>' : ''}</div>
              ${ich.gifttrank ? `<h3 class="party-zwischen">Gifttrank für …</h3>${H.personen(s.mitspieler.filter((m) => m.lebt && m.id !== z.ich.id), { aktion: 'gift', gewaehlt: gift })}` : '<p class="party-klein">Dein Gifttrank ist verbraucht.</p>'}
              <div class="party-knoepfe"><button type="button" class="knopf haupt gross" data-aktion="hexeFertig">${api.merk.heilen || gift ? 'Tränke benutzen' : 'Nichts tun'}</button></div>` };
        }
        return leer;
      }
      if (s.phase === 'morgen') return { runde, zeit: true, schluessel: 'morgen' + s.nacht, hinweis: 'Das Dorf erwacht.', html: `<div class="party-karte"><h2>In dieser Nacht …</h2>${toteText(s)}</div>` };
      if (s.phase === 'tag') {
        if (ich.stimme) return { runde, zeit: true, hinweis: 'Abgestimmt', html: `<p class="party-text">Du hast abgestimmt. ${s.abgestimmt.length} von ${s.lebende} sind fertig.</p>${rolleKarte(s, H)}` };
        const wahl = api.merk.wahl;
        return { runde, zeit: true, schluessel: 'tag' + s.nacht, hinweis: 'Diskutiert: Wer ist ein Werwolf?',
          html: `${H.personen(s.mitspieler.filter((m) => m.lebt && m.id !== z.ich.id), { gewaehlt: wahl, haken: (m) => s.abgestimmt.includes(m.id) })}
            <div class="party-knoepfe"><button type="button" class="knopf" data-aktion="skip">Überspringen</button>
            <button type="button" class="knopf haupt gross" data-aktion="abstimmen" ${wahl ? '' : 'disabled'}>Abstimmen</button></div>${rolleKarte(s, H)}` };
      }
      if (s.phase === 'urteil') return { runde, zeit: true, schluessel: 'urteil' + s.nacht, html: `<div class="party-karte">${urteilText(s)}</div>` };
      return { html: '' };
    },

    aktion(name, el, api) {
      const s = api.s;
      if (name === 'wolf') api.sende('wolf', { ziel: el.dataset.id });
      else if (name === 'sehen') api.sende('sehen', { ziel: el.dataset.id });
      else if (name === 'heilen') { api.merk.heilen = el.checked; api.neuMalen(); }
      else if (name === 'gift') { api.merk.gift = api.merk.gift === el.dataset.id ? null : el.dataset.id; api.neuMalen(); }
      else if (name === 'hexeFertig') api.sende('hexe', { heilen: !!api.merk.heilen && !!(s.ich.opfer), gift: api.merk.gift || null });
      else if (name === 'waehle') { api.merk.wahl = el.dataset.id; api.neuMalen(); }
      else if (name === 'abstimmen' && api.merk.wahl) api.sende('stimme', { ziel: api.merk.wahl });
      else if (name === 'skip') api.sende('stimme', { ziel: 'skip' });
    },

    endeText: (s) => (s.sieger === 'dorf' ? 'Das Dorf gewinnt!' : s.sieger === 'woelfe' ? 'Die Werwölfe gewinnen!' : ''),

    buehne(z, s, H) {
      const runde = s.nacht ? `Nacht ${s.nacht}` : '';
      const nacht = NACHT.includes(s.phase);
      const text = erzaehlung(s);
      const sprich = { schluessel: s.phase + s.nacht, text };
      let html = `<div class="party-karte gross-karte"><p class="party-erzaehlung">${esc(text)}</p></div>`;
      if (s.phase === 'morgen') html = `<div class="party-karte gross-karte"><h2>Das Dorf erwacht …</h2>${toteText(s)}</div>`;
      if (s.phase === 'urteil') html = `<div class="party-karte gross-karte">${urteilText(s)}</div>`;
      if (s.phase === 'ende') html = `<div class="party-karte gross-karte"><h2>${s.sieger === 'dorf' ? 'Das Dorf gewinnt!' : 'Die Werwölfe gewinnen!'}</h2></div>`;
      if (!nacht) html += dorfListe(s, H, true); // Rollen stehen nur drin, wenn sie aufgedeckt sind
      const hinweis = s.phase === 'tag' ? `${s.abgestimmt.length} von ${s.lebende} haben abgestimmt` : nacht ? 'Alle Augen zu!' : '';
      return { runde, nacht, zeit: !nacht && s.phase !== 'ende', hinweis, schluessel: s.phase + s.nacht, html, sprich };
    },
  });
})();
