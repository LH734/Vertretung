/* QR-Code-Erzeuger (Byte-Modus, Fehlerkorrektur M), ohne fremde Bibliotheken.
   Aufbau nach der Norm ISO/IEC 18004, angelehnt an die gut dokumentierte
   Referenzumsetzung von Project Nayuki. */
(function () {
  'use strict';

  const ECC_JE_BLOCK_M = [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26];
  const BLOECKE_M = [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16];
  const MAX_VERSION = 20;

  function rohModule(v) {
    let r = (16 * v + 128) * v + 64;
    if (v >= 2) {
      const n = Math.floor(v / 7) + 2;
      r -= (25 * n - 10) * n - 55;
      if (v >= 7) r -= 36;
    }
    return r;
  }

  function datenCodewoerter(v) {
    return Math.floor(rohModule(v) / 8) - ECC_JE_BLOCK_M[v] * BLOECKE_M[v];
  }

  function gfMal(x, y) {
    let z = 0;
    for (let i = 7; i >= 0; i--) {
      z = (z << 1) ^ ((z >>> 7) * 0x11d);
      z ^= ((y >>> i) & 1) * x;
    }
    return z & 0xff;
  }

  function rsTeiler(grad) {
    const r = new Array(grad).fill(0);
    r[grad - 1] = 1;
    let wurzel = 1;
    for (let i = 0; i < grad; i++) {
      for (let j = 0; j < r.length; j++) {
        r[j] = gfMal(r[j], wurzel);
        if (j + 1 < r.length) r[j] ^= r[j + 1];
      }
      wurzel = gfMal(wurzel, 2);
    }
    return r;
  }

  function rsRest(daten, teiler) {
    const r = teiler.map(() => 0);
    for (const b of daten) {
      const faktor = b ^ r.shift();
      r.push(0);
      teiler.forEach((k, i) => { r[i] ^= gfMal(k, faktor); });
    }
    return r;
  }

  function erzeuge(text) {
    const bytes = Array.from(new TextEncoder().encode(text));
    let version = 1;
    for (; version <= MAX_VERSION; version++) {
      const zaehlBits = version < 10 ? 8 : 16;
      if (4 + zaehlBits + bytes.length * 8 <= datenCodewoerter(version) * 8) break;
    }
    if (version > MAX_VERSION) throw new Error('Text zu lang für den QR-Code');

    // Bitfolge
    const bits = [];
    const schreibe = (wert, laenge) => { for (let i = laenge - 1; i >= 0; i--) bits.push((wert >>> i) & 1); };
    schreibe(4, 4);
    schreibe(bytes.length, version < 10 ? 8 : 16);
    bytes.forEach((b) => schreibe(b, 8));
    const kapazitaet = datenCodewoerter(version) * 8;
    schreibe(0, Math.min(4, kapazitaet - bits.length));
    schreibe(0, (8 - (bits.length % 8)) % 8);
    for (let pad = 0xec; bits.length < kapazitaet; pad ^= 0xec ^ 0x11) schreibe(pad, 8);
    const daten = [];
    for (let i = 0; i < bits.length; i += 8) {
      let b = 0;
      for (let j = 0; j < 8; j++) b = (b << 1) | bits[i + j];
      daten.push(b);
    }

    // Fehlerkorrektur und Verschränkung
    const anzahlBloecke = BLOECKE_M[version];
    const eccLaenge = ECC_JE_BLOCK_M[version];
    const roh = Math.floor(rohModule(version) / 8);
    const kurze = anzahlBloecke - (roh % anzahlBloecke);
    const kurzLaenge = Math.floor(roh / anzahlBloecke);
    const teiler = rsTeiler(eccLaenge);
    const bloecke = [];
    for (let i = 0, k = 0; i < anzahlBloecke; i++) {
      const dat = daten.slice(k, k + kurzLaenge - eccLaenge + (i < kurze ? 0 : 1));
      k += dat.length;
      const ecc = rsRest(dat, teiler);
      if (i < kurze) dat.push(0);
      bloecke.push(dat.concat(ecc));
    }
    const alle = [];
    for (let i = 0; i < bloecke[0].length; i++) {
      bloecke.forEach((block, j) => {
        if (i !== kurzLaenge - eccLaenge || j >= kurze) alle.push(block[i]);
      });
    }

    // Matrix
    const n = version * 4 + 17;
    const m = Array.from({ length: n }, () => new Array(n).fill(false));
    const fest = Array.from({ length: n }, () => new Array(n).fill(false));
    const setze = (x, y, dunkel) => { m[y][x] = dunkel; fest[y][x] = true; };

    for (let i = 0; i < n; i++) { setze(6, i, i % 2 === 0); setze(i, 6, i % 2 === 0); }
    const finder = (x, y) => {
      for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
        const d = Math.max(Math.abs(dx), Math.abs(dy));
        const xx = x + dx, yy = y + dy;
        if (xx >= 0 && xx < n && yy >= 0 && yy < n) setze(xx, yy, d !== 2 && d !== 4);
      }
    };
    finder(3, 3); finder(n - 4, 3); finder(3, n - 4);

    if (version > 1) {
      const anzahl = Math.floor(version / 7) + 2;
      const schritt = Math.ceil((version * 4 + 4) / (anzahl * 2 - 2)) * 2;
      const pos = [6];
      for (let p = n - 7; pos.length < anzahl; p -= schritt) pos.splice(1, 0, p);
      pos.forEach((px, i) => pos.forEach((py, j) => {
        if ((i === 0 && j === 0) || (i === 0 && j === anzahl - 1) || (i === anzahl - 1 && j === 0)) return;
        for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
          setze(px + dx, py + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
        }
      }));
    }

    const formatBits = (maske) => {
      const d = (0 << 3) | maske; // M = 0
      let rest = d;
      for (let i = 0; i < 10; i++) rest = (rest << 1) ^ ((rest >>> 9) * 0x537);
      const b = ((d << 10) | rest) ^ 0x5412;
      const bit = (i) => ((b >>> i) & 1) !== 0;
      for (let i = 0; i <= 5; i++) setze(8, i, bit(i));
      setze(8, 7, bit(6)); setze(8, 8, bit(7)); setze(7, 8, bit(8));
      for (let i = 9; i < 15; i++) setze(14 - i, 8, bit(i));
      for (let i = 0; i < 8; i++) setze(n - 1 - i, 8, bit(i));
      for (let i = 8; i < 15; i++) setze(8, n - 15 + i, bit(i));
      setze(8, n - 8, true);
    };
    formatBits(0);

    if (version >= 7) {
      let rest = version;
      for (let i = 0; i < 12; i++) rest = (rest << 1) ^ ((rest >>> 11) * 0x1f25);
      const b = (version << 12) | rest;
      for (let i = 0; i < 18; i++) {
        const dunkel = ((b >>> i) & 1) !== 0;
        const a = n - 11 + (i % 3), c = Math.floor(i / 3);
        setze(a, c, dunkel); setze(c, a, dunkel);
      }
    }

    let i = 0;
    for (let rechts = n - 1; rechts >= 1; rechts -= 2) {
      if (rechts === 6) rechts = 5;
      for (let v = 0; v < n; v++) {
        for (let j = 0; j < 2; j++) {
          const x = rechts - j;
          const hoch = ((rechts + 1) & 2) === 0;
          const y = hoch ? n - 1 - v : v;
          if (!fest[y][x] && i < alle.length * 8) {
            m[y][x] = ((alle[i >>> 3] >>> (7 - (i & 7))) & 1) !== 0;
            i++;
          }
        }
      }
    }

    const maskeTrifft = (k, x, y) => {
      switch (k) {
        case 0: return (x + y) % 2 === 0;
        case 1: return y % 2 === 0;
        case 2: return x % 3 === 0;
        case 3: return (x + y) % 3 === 0;
        case 4: return (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0;
        case 5: return ((x * y) % 2) + ((x * y) % 3) === 0;
        case 6: return (((x * y) % 2) + ((x * y) % 3)) % 2 === 0;
        default: return (((x + y) % 2) + ((x * y) % 3)) % 2 === 0;
      }
    };
    const wendeMaskeAn = (k) => {
      for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
        if (!fest[y][x] && maskeTrifft(k, x, y)) m[y][x] = !m[y][x];
      }
    };
    // vereinfachte Strafpunkte: lange Läufe, 2×2-Blöcke, Hell-Dunkel-Gleichgewicht
    const strafe = () => {
      let s = 0, dunkel = 0;
      for (let y = 0; y < n; y++) {
        let laufX = 1, laufY = 1;
        for (let x = 0; x < n; x++) {
          if (m[y][x]) dunkel++;
          if (x > 0) { if (m[y][x] === m[y][x - 1]) { laufX++; if (laufX === 5) s += 3; else if (laufX > 5) s++; } else laufX = 1; }
          if (x > 0) { if (m[x][y] === m[x - 1][y]) { laufY++; if (laufY === 5) s += 3; else if (laufY > 5) s++; } else laufY = 1; }
          if (x > 0 && y > 0 && m[y][x] === m[y - 1][x] && m[y][x] === m[y][x - 1] && m[y][x] === m[y - 1][x - 1]) s += 3;
        }
      }
      const k = Math.ceil(Math.abs(dunkel * 20 - n * n * 10) / (n * n)) - 1;
      return s + Math.max(0, k) * 10;
    };
    let beste = 0, besteStrafe = Infinity;
    for (let k = 0; k < 8; k++) {
      wendeMaskeAn(k); formatBits(k);
      const s = strafe();
      if (s < besteStrafe) { besteStrafe = s; beste = k; }
      wendeMaskeAn(k);
    }
    wendeMaskeAn(beste); formatBits(beste);
    return m;
  }

  function alsSvg(text, farbe) {
    const m = erzeuge(text);
    const n = m.length;
    const rand = 3;
    let d = '';
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (m[y][x]) d += `M${x + rand} ${y + rand}h1v1h-1z`;
    const g = n + rand * 2;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${g} ${g}" shape-rendering="crispEdges" role="img" aria-label="QR-Code zur Beitrittsseite"><rect width="${g}" height="${g}" fill="#fff"/><path d="${d}" fill="${farbe || '#2E1A3B'}"/></svg>`;
  }

  window.QR = { erzeuge, alsSvg };
})();
