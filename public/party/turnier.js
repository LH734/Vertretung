/* Gemeinsame Ansichten für die Turnierspiele (Vier in einer Reihe, Schiffe versenken):
   Tabelle, Freilos, Zwischenstand und die Liste aller Partien. */
(function () {
  'use strict';
  const { esc } = window.Gemeinsam;

  function tabelle(s, ichId) {
    if (!s.tabelle || !s.tabelle.length) return '';
    return `<table class="turnier-tabelle"><thead><tr><th>#</th><th>Name</th><th title="Siege / Unentschieden / Niederlagen">S/U/N</th><th>Pkt</th></tr></thead><tbody>
      ${s.tabelle.map((r) => `<tr class="${r.id === ichId ? 'ich' : ''}"><td>${r.platz}.</td><td>${esc(r.name)}</td><td>${r.siege}/${r.remis}/${r.niederlagen}</td><td><b>${r.punkte}</b></td></tr>`).join('')}
      </tbody></table><p class="party-text klein">Sieg 2 Punkte, Unentschieden 1, Freilos 2. Bei Gleichstand zählt die Stärke der bisherigen Gegner.</p>`;
  }

  function ergebnisText(p, ichId) {
    if (!p.fertig) return '';
    if (p.sieger === null) return 'Unentschieden';
    const name = p.sieger === p.a.id ? p.a.name : p.b.name;
    if (ichId) return p.sieger === ichId ? 'Gewonnen!' : `${esc(name)} gewinnt`;
    return `${esc(name)} gewinnt`;
  }

  // Kurze Liste aller Partien der Runde, mini(p) liefert eine kleine Vorschau
  function partien(s, mini) {
    if (!s.partien || !s.partien.length) return '';
    return `<div class="turnier-partien">${s.partien.map((p) => `<div class="turnier-partie ${p.fertig ? 'fertig' : ''}">
      <div class="namen"><span class="${p.dran === p.a.id && !p.fertig ? 'dran' : ''}">${esc(p.a.name)}</span> <i>gegen</i> <span class="${p.dran === p.b.id && !p.fertig ? 'dran' : ''}">${esc(p.b.name)}</span></div>
      ${mini ? mini(p) : ''}<div class="stand">${p.fertig ? ergebnisText(p) : 'läuft …'}</div></div>`).join('')}
      ${s.freilos ? `<div class="turnier-partie fertig"><div class="namen">${esc(s.freilos.name)}</div><div class="stand">Freilos</div></div>` : ''}</div>`;
  }

  // Was alle Turnierspiele außerhalb der eigenen Partie zeigen. Gibt null zurück, wenn die Partie gezeigt werden soll.
  function rahmen(z, s, H, titel, mini) {
    const runde = `Runde ${s.runde} von ${s.runden}`;
    const ich = s.ich || {};
    if (s.phase === 'ende') {
      const platz = s.tabelle.find((r) => r.id === z.ich.id);
      return { runde: 'Turnier vorbei', html: `<div class="party-karte wuerfel-karte"><h2>${s.sieger ? `${esc(s.sieger)} gewinnt das Turnier!` : 'Turnier vorbei'}</h2>
        ${platz ? `<p>Du bist auf Platz <b>${platz.platz}</b> mit ${platz.punkte} Punkten.</p>` : ''}</div>${tabelle(s, z.ich.id)}` };
    }
    if (s.phase === 'zwischenstand') {
      return { runde, zeit: true, hinweis: 'Gleich geht die nächste Runde los.', schluessel: 'zw' + s.runde,
        html: `<div class="party-karte wuerfel-karte"><h2>Zwischenstand nach Runde ${s.runde}</h2><p>Gleich werden neue Paare gebildet.</p></div>${tabelle(s, z.ich.id)}` };
    }
    if (!ich.dabei) return { runde, hinweis: 'Du steigst in der nächsten Runde ein.', html: `<div class="party-karte"><h2>Gleich bist du dabei</h2><p>Ab der nächsten Runde spielst du mit.</p></div>${partien(s, mini)}` };
    if (ich.freilos) return { runde, hinweis: 'Du hast diese Runde ein Freilos.', html: `<div class="party-karte wuerfel-karte"><h2>Freilos!</h2><p>Bei einer ungeraden Zahl setzt diese Runde jemand aus. Das zählt wie ein Sieg.</p></div>${partien(s, mini)}${tabelle(s, z.ich.id)}` };
    if (s.meine && s.meine.fertig) {
      return { runde, hinweis: 'Warte, bis alle Partien fertig sind.', schluessel: 'fertig' + s.meine.id,
        html: `__PARTIE__<div class="party-karte wuerfel-karte"><h2>${ergebnisText(s.meine, z.ich.id)}</h2><p>Die anderen spielen noch. Danach gibt es neue Paare.</p></div>${partien(s, mini)}` };
    }
    if (!s.meine) return { runde, html: partien(s, mini) };
    return null;
  }

  function status(s, titel) {
    const offen = (s.partien || []).filter((p) => !p.fertig).length;
    const text = { spielen: `${offen} von ${(s.partien || []).length} Partien laufen`, zwischenstand: 'Zwischenstand', ende: s.sieger ? `${s.sieger} gewinnt` : 'Vorbei' }[s.phase] || '';
    return { titel: `${titel} · Runde ${s.runde} von ${s.runden}`, text };
  }

  function buehne(z, s, titel, mini) {
    const runde = `Runde ${s.runde} von ${s.runden}`;
    if (s.phase === 'ende') return { runde: 'Turnier vorbei', html: `<div class="party-karte gross-karte wuerfel-karte"><h2>${s.sieger ? `${esc(s.sieger)} gewinnt das Turnier!` : 'Turnier vorbei'}</h2></div>${tabelle(s)}` };
    if (s.phase === 'zwischenstand') return { runde, zeit: true, html: `<div class="turnier-buehne"><div><h2 class="turnier-h">Zwischenstand</h2>${tabelle(s)}</div><div>${partien(s, mini)}</div></div>` };
    return { runde, html: `<div class="turnier-buehne"><div>${partien(s, mini)}</div><div><h2 class="turnier-h">Tabelle</h2>${tabelle(s)}</div></div>` };
  }

  window.Turnier = { tabelle, partien, rahmen, status, buehne, ergebnisText };
})();
