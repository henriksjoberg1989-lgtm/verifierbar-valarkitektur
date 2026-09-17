/*
 * krypto.js — SHA-256, RSA och blindsignering i ren JavaScript.
 *
 * Medvetet utan Web Crypto API. Två skäl:
 *   1. Demot ska kunna öppnas direkt från filsystemet utan server.
 *   2. All kod ska vara läsbar av en granskare. Whitepaperns tes är att
 *      förtroende kommer av att kunna kontrollera, inte av att lita på ett
 *      svart box-API. Denna fil är den tesen i praktik.
 *
 * VARNING: Detta är demonstrationskod. RSA-nyckeln genereras i webbläsaren och
 * hålls i minnet. I produktion ligger signeringsnyckeln i en HSM med delad
 * kontroll (whitepaper 5.B.4) och klienten ser aldrig den privata exponenten.
 */
(function (global) {
  'use strict';

  /* ------------------------------------------------------------------ *
   * SHA-256
   * ------------------------------------------------------------------ */

  var K = new Uint32Array([
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1,
    0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
    0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786,
    0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
    0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
    0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
    0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a,
    0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
    0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
  ]);

  function rotr(x, n) {
    return ((x >>> n) | (x << (32 - n))) >>> 0;
  }

  /** SHA-256 över en Uint8Array. Returnerar Uint8Array om 32 byte. */
  function sha256(bytes) {
    var H = new Uint32Array([
      0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
      0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19
    ]);

    var len = bytes.length;
    var padded = new Uint8Array(((((len + 9) >> 6) + 1) << 6));
    padded.set(bytes);
    padded[len] = 0x80;

    var view = new DataView(padded.buffer);
    var bitLenHi = Math.floor((len * 8) / 4294967296);
    var bitLenLo = (len * 8) >>> 0;
    view.setUint32(padded.length - 8, bitLenHi);
    view.setUint32(padded.length - 4, bitLenLo);

    var w = new Uint32Array(64);
    for (var off = 0; off < padded.length; off += 64) {
      var t;
      for (t = 0; t < 16; t++) w[t] = view.getUint32(off + t * 4);
      for (t = 16; t < 64; t++) {
        var x = w[t - 15], y = w[t - 2];
        var s0 = (rotr(x, 7) ^ rotr(x, 18) ^ (x >>> 3)) >>> 0;
        var s1 = (rotr(y, 17) ^ rotr(y, 19) ^ (y >>> 10)) >>> 0;
        w[t] = (w[t - 16] + s0 + w[t - 7] + s1) >>> 0;
      }

      var a = H[0], b = H[1], c = H[2], d = H[3];
      var e = H[4], f = H[5], g = H[6], h = H[7];

      for (t = 0; t < 64; t++) {
        var S1 = (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) >>> 0;
        var ch = ((e & f) ^ (~e & g)) >>> 0;
        var t1 = (h + S1 + ch + K[t] + w[t]) >>> 0;
        var S0 = (rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) >>> 0;
        var maj = ((a & b) ^ (a & c) ^ (b & c)) >>> 0;
        var t2 = (S0 + maj) >>> 0;

        h = g; g = f; f = e;
        e = (d + t1) >>> 0;
        d = c; c = b; b = a;
        a = (t1 + t2) >>> 0;
      }

      H[0] = (H[0] + a) >>> 0; H[1] = (H[1] + b) >>> 0;
      H[2] = (H[2] + c) >>> 0; H[3] = (H[3] + d) >>> 0;
      H[4] = (H[4] + e) >>> 0; H[5] = (H[5] + f) >>> 0;
      H[6] = (H[6] + g) >>> 0; H[7] = (H[7] + h) >>> 0;
    }

    var out = new Uint8Array(32);
    var ov = new DataView(out.buffer);
    for (var i = 0; i < 8; i++) ov.setUint32(i * 4, H[i]);
    return out;
  }

  function utf8(str) {
    return new TextEncoder().encode(str);
  }

  function toHex(bytes) {
    var s = '';
    for (var i = 0; i < bytes.length; i++) {
      s += (bytes[i] < 16 ? '0' : '') + bytes[i].toString(16);
    }
    return s;
  }

  function fromHex(hex) {
    var out = new Uint8Array(hex.length / 2);
    for (var i = 0; i < out.length; i++) {
      out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    }
    return out;
  }

  /** SHA-256 över en sträng, som hex. */
  function hash(str) {
    return toHex(sha256(utf8(str)));
  }

  /* ------------------------------------------------------------------ *
   * Slump och BigInt-hjälpfunktioner
   * ------------------------------------------------------------------ */

  /** Kryptografiskt starka slumpbyte. crypto.getRandomValues fungerar även
   *  utanför secure context, till skillnad från crypto.subtle. */
  function randomBytes(n) {
    var b = new Uint8Array(n);
    crypto.getRandomValues(b);
    return b;
  }

  function randomBigInt(bits) {
    var bytes = randomBytes(Math.ceil(bits / 8));
    var n = BigInt('0x' + toHex(bytes));
    var mask = (1n << BigInt(bits)) - 1n;
    n = (n & mask) | (1n << BigInt(bits - 1));
    return n;
  }

  function randomBelow(upper) {
    if (upper <= 1n) throw new Error('randomBelow kräver upper > 1');
    var bits = upper.toString(2).length;
    var candidate;
    do {
      candidate = randomBigInt(bits);
    } while (candidate >= upper);
    return candidate;
  }

  function modPow(base, exp, mod) {
    if (mod === 1n) return 0n;
    var result = 1n;
    base = ((base % mod) + mod) % mod;
    while (exp > 0n) {
      if (exp & 1n) result = (result * base) % mod;
      base = (base * base) % mod;
      exp >>= 1n;
    }
    return result;
  }

  function gcd(a, b) {
    a = a < 0n ? -a : a;
    b = b < 0n ? -b : b;
    while (b !== 0n) { var t = b; b = a % b; a = t; }
    return a;
  }

  /** Utökad Euklides, iterativ. Returnerar [g, x, y] med a*x + b*y = g.
   *  Iterativ implementation för att undvika stackoverflow vid stora BigInt. */
  function egcd(a, b) {
    var old_r = a, r = b;
    var old_s = 1n, s = 0n;
    var old_t = 0n, t = 1n;
    while (r !== 0n) {
      var q = old_r / r;
      var tmp;
      tmp = old_r - q * r; old_r = r; r = tmp;
      tmp = old_s - q * s; old_s = s; s = tmp;
      tmp = old_t - q * t; old_t = t; t = tmp;
    }
    return [old_r, old_s, old_t];
  }

  /** Modulär invers av a mod m. Kastar om den inte existerar. */
  function modInverse(a, m) {
    var r = egcd(((a % m) + m) % m, m);
    if (r[0] !== 1n) throw new Error('Ingen modulär invers existerar');
    return ((r[1] % m) + m) % m;
  }

  /* ------------------------------------------------------------------ *
   * Primtalstest och RSA-nyckelgenerering
   * ------------------------------------------------------------------ */

  var SMALL_PRIMES = (function () {
    var out = [];
    for (var n = 3; n < 2000 && out.length < 300; n += 2) {
      var prime = true;
      for (var i = 0; i < out.length; i++) {
        if (out[i] * out[i] > n) break;
        if (n % out[i] === 0) { prime = false; break; }
      }
      if (prime) out.push(n);
    }
    return out;
  })();

  /** Miller–Rabin. k rundor ger felmarginal 4^-k. */
  function isProbablePrime(n, k) {
    if (n < 2n) return false;
    if (n < 5n) return n !== 4n; // 2 och 3 är primtal; Miller–Rabin kräver n > 4.
    for (var i = 0; i < SMALL_PRIMES.length; i++) {
      var p = BigInt(SMALL_PRIMES[i]);
      if (n === p) return true;
      if (n % p === 0n) return false;
    }

    var d = n - 1n, s = 0n;
    while ((d & 1n) === 0n) { d >>= 1n; s += 1n; }

    for (var round = 0; round < k; round++) {
      var a = randomBelow(n - 3n) + 2n;
      var x = modPow(a, d, n);
      if (x === 1n || x === n - 1n) continue;
      var composite = true;
      for (var r = 1n; r < s; r++) {
        x = (x * x) % n;
        if (x === n - 1n) { composite = false; break; }
      }
      if (composite) return false;
    }
    return true;
  }

  function generatePrime(bits) {
    while (true) {
      var c = randomBigInt(bits) | 1n;
      c = c | (1n << BigInt(bits - 1));
      if (isProbablePrime(c, 24)) return c;
    }
  }

  /**
   * Genererar ett RSA-nyckelpar.
   * @param {number} bits — total nyckellängd, t.ex. 2048.
   * @returns {{n: bigint, e: bigint, d: bigint, p: bigint, q: bigint, bits: number}}
   */
  function generateRsaKey(bits) {
    var e = 65537n;
    var half = Math.floor(bits / 2);
    while (true) {
      var p = generatePrime(half);
      var q = generatePrime(bits - half);
      if (p === q) continue;
      var n = p * q;
      if (n.toString(2).length !== bits) continue;
      var phi = (p - 1n) * (q - 1n);
      if (gcd(e, phi) !== 1n) continue;
      var d = modInverse(e, phi);
      return { n: n, e: e, d: d, p: p, q: q, bits: bits };
    }
  }

  /* ------------------------------------------------------------------ *
   * BigInt <-> hex (fasta längder, för läsbara loggar)
   * ------------------------------------------------------------------ */

  function bigToHex(x) {
    var h = x.toString(16);
    return h.length % 2 ? '0' + h : h;
  }

  function hexToBig(h) {
    return BigInt('0x' + (h || '0'));
  }

  function bigToBytes(x, byteLen) {
    var h = bigToHex(x).padStart(byteLen * 2, '0');
    return fromHex(h);
  }

  /* ------------------------------------------------------------------ *
   * Blindsignering (Chaum)
   *
   * Flödet, motsvarande whitepaper 5.B.2:
   *   klient:      m    = tokenmaterial (hash av slump + kontext)
   *                r    = bländningsfaktor, hemlig, gcd(r,n)=1
   *                m'   = m · r^e mod n        -> skickas till myndigheten
   *   myndighet:   s'   = m'^d mod n           -> returneras
   *   klient:      s    = s' · r^-1 mod n      -> avbländad signatur
   *   verifierare: kontrollera s^e mod n == m
   *
   * Myndigheten har signerat m utan att någonsin ha sett m, och kan därför
   * inte känna igen s när den senare presenteras. Det är hela poängen.
   * ------------------------------------------------------------------ */

  var Blind = {
    /** Steg 1, klienten. */
    prepare: function (pub, messageBytes) {
      var n = pub.n, e = pub.e;
      var m = BigInt('0x' + toHex(sha256(messageBytes))) % n;
      if (m === 0n) throw new Error('Degenererat tokenmaterial, försök igen');

      var r;
      do { r = randomBelow(n - 1n) + 1n; } while (gcd(r, n) !== 1n);

      var blinded = (m * modPow(r, e, n)) % n;
      return { m: m, r: r, blinded: blinded };
    },

    /** Steg 2, tokenmyndigheten. Ser bara det blindade värdet. */
    sign: function (priv, blinded) {
      return modPow(blinded, priv.d, priv.n);
    },

    /** Steg 3, klienten. */
    unblind: function (pub, blindSig, r) {
      return (blindSig * modInverse(r, pub.n)) % pub.n;
    },

    /** Steg 4, valsedelsterminalen. Kräver endast publik nyckel. */
    verify: function (pub, m, signature) {
      return modPow(signature, pub.e, pub.n) === m;
    }
  };

  /** Vanlig signering, används för resultatprotokoll i 5.E.
   *
   *  VARNING: Förenklad "raw RSA" utan PKCS#1 v1.5- eller PSS-padding.
   *  I produktion (whitepaper 5.E) används korrekt padding för att
   *  förhindra existentiell förfalskning (forgery). Denna implementation
   *  är avsedd enbart för demonstration av signering/verifiering.
   */
  function sign(priv, messageStr) {
    var h = BigInt('0x' + hash(messageStr));
    var m = h % priv.n;
    return bigToHex(modPow(m, priv.d, priv.n));
  }

  function verifySig(pub, messageStr, sigHex) {
    var h = BigInt('0x' + hash(messageStr));
    var m = h % pub.n;
    return modPow(hexToBig(sigHex), pub.e, pub.n) === m;
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  global.ValKrypto = {
    sha256: sha256,
    utf8: utf8,
    hash: hash,
    toHex: toHex,
    fromHex: fromHex,
    randomBytes: randomBytes,
    randomBelow: randomBelow,
    modPow: modPow,
    gcd: gcd,
    modInverse: modInverse,
    isProbablePrime: isProbablePrime,
    generateRsaKey: generateRsaKey,
    bigToHex: bigToHex,
    hexToBig: hexToBig,
    bigToBytes: bigToBytes,
    sign: sign,
    verifySig: verifySig,
    Blind: Blind,
    esc: esc
  };
})(window);
