/* Spielleitung auf dem eigenen Handy: Wer den Raum geöffnet hat und selbst mitspielt,
   bekommt unten eine kleine Leiste mit Spielwahl, Einstellungen, Start, Weiter, Pause und Ende.
   Lösungen und Rollen sieht man hier bewusst nicht, man spielt ja selbst mit. */
(function () {
  'use strict';
  const G = window.Gemeinsam;
  const { esc } = G;
  const LEHRER = 'spieleraum-lehrer';

  let socket = null;
  let z = null;
  let einstellungen = null;
  let offen = false;
  const el = {};

  // Nach dem Beitritt: Liegt in diesem Tab der Leitungsschlüssel für den Raum?
  function anmelden(sock, code) {
    socket = sock;
    let s = null;
    try { s = JSON.parse(sessionStorage.getItem(LEHRER) || 'null'); } catch (e) { s = null; }
    if (!s || s.code !== code || !s.schluessel) return;
    socket.emit('kind:leitung', { schluessel: s.schluessel }, () => {});
  }

  function baue() {
    if (el.knopf) return;
    el.knopf = document.createElement('button');
    el.knopf.type = 'button';
    el.knopf.className = 'leitung-knopf';
    el.knopf.textContent = 'Leitung';
    el.knopf.addEventListener('click', () => { offen = !offen; male(z); });
    el.leiste = document.createElement('div');
    el.leiste.className = 'leitung-leiste';
    el.leiste.hidden = true;
    el.leiste.innerHTML = `
      <div class="leitung-kopf"><h2>Spielleitung</h2><button type="button" class="sab-zu" data-l="zu" aria-label="Schließen">✕</button></div>
      <div class="leitung-knoepfe">
        <button type="button" class="knopf haupt" data-l="start">Spiel starten</button>
        <button type="button" class="knopf" data-l="weiter">Weiter</button>
        <button type="button" class="knopf gold" data-l="pause">Pause</button>
        <button type="button" class="knopf" data-l="beenden">Beenden</button>
      </div>
      <p class="status" data-l="status"></p>
      <div class="leitung-abend">
        <div class="zeile"><label>Spieleabend</label><div class="umschalter" data-l="abend">
          <button type="button" data-wert="ja">an</button><button type="button" data-wert="nein">aus</button></div></div>
        <div class="leitung-knoepfe" data-l="abendknoepfe"><button type="button" class="knopf klein" data-l="siegerehrung">Siegerehrung</button></div>
      </div>
      <details class="leitung-einstellungen"><summary>Spiel wählen und einstellen</summary><div data-l="einstellungen"></div></details>
      <p class="status"><a class="lehrerlink" href="/lehrer" data-l="regie">Zur großen Regie</a> (Spielerliste, Teams, Bühne)</p>`;
    document.body.appendChild(el.knopf);
    document.body.appendChild(el.leiste);
    einstellungen = new window.Einstellungen(el.leiste.querySelector('[data-l="einstellungen"]'), (teil) => socket.emit('lehrer:einstellungen', teil));
    el.leiste.addEventListener('click', (e) => {
      const b = e.target.closest('[data-l]');
      if (!b || !z) return;
      const a = b.dataset.l;
      const antwort = (r) => { if (r && !r.ok && r.fehler) G.melde(r.fehler, 'fehler'); };
      if (a === 'zu') { offen = false; male(z); }
      else if (a === 'start') {
        if (z.spiel && z.spiel.phase !== 'ende' && !confirm('Das laufende Spiel abbrechen und neu starten?')) return;
        socket.emit('lehrer:start', einstellungen.texte(), antwort);
        offen = false;
      } else if (a === 'weiter') socket.emit('lehrer:ueberspringen', {}, antwort);
      else if (a === 'pause') socket.emit('lehrer:pause', { an: !z.raum.pause }, antwort);
      else if (a === 'beenden') { if (confirm('Spiel beenden und zurück in die Lobby?')) socket.emit('lehrer:beenden', {}, antwort); }
      else if (a === 'siegerehrung') socket.emit('lehrer:abend', { aktion: 'siegerehrung' }, antwort);
    });
    el.leiste.querySelector('[data-l="abend"]').addEventListener('click', (e) => {
      const b = e.target.closest('[data-wert]');
      if (b) socket.emit('lehrer:einstellungen', { abend: b.dataset.wert === 'ja' });
    });
    // Für den Weg zurück zur großen Regie bleibt der Schlüssel im Tab erhalten
  }

  function male(neu) {
    z = neu;
    const darf = !!(z && z.leitung);
    if (!darf) { if (el.knopf) { el.knopf.hidden = true; el.leiste.hidden = true; } return; }
    baue();
    const s = z.spiel;
    const vollbild = document.body.classList.contains('im-party-vollbild');
    el.knopf.hidden = offen || vollbild;
    el.leiste.hidden = !offen;
    if (!offen) return;
    const laeuft = !!s && s.phase !== 'ende';
    el.leiste.querySelector('[data-l="start"]').textContent = laeuft ? 'Neu starten' : 'Spiel starten';
    el.leiste.querySelector('[data-l="weiter"]').disabled = !laeuft;
    el.leiste.querySelector('[data-l="beenden"]').disabled = !s;
    const p = el.leiste.querySelector('[data-l="pause"]');
    p.textContent = z.raum.pause ? 'Weiterspielen' : 'Pause';
    p.disabled = !s;
    el.leiste.querySelector('[data-l="status"]').textContent = s
      ? `Läuft: ${window.Regeln.titel(s.art)}`
      : `Als Nächstes: ${window.Regeln.titel(z.einstellungen.spiel)} · ${z.spieler.filter((x) => x.online).length} Leute da`;
    el.leiste.querySelectorAll('[data-l="abend"] button').forEach((b) => b.classList.toggle('an', (b.dataset.wert === 'ja') === !!z.einstellungen.abend));
    el.leiste.querySelector('[data-l="abendknoepfe"]').hidden = !z.einstellungen.abend;
    el.leiste.querySelector('[data-l="siegerehrung"]').textContent = z.abend && z.abend.siegerehrung ? 'Siegerehrung schließen' : 'Siegerehrung';
    einstellungen.male(z.einstellungen, z.listen);
  }

  window.Leitung = { anmelden, male, esc };
})();
