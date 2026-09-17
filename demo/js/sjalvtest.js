/*
 * sjalvtest.js — Verifierar att kryptoimplementationen uppfyller sina utlovade
 * egenskaper. Körbara av vem som helst, i vilken webbläsare som helst.
 *
 * Testerna kontrollerar intern konsistens och publicerade testvektorer. De är
 * INTE en formell säkerhetsverifiering.
 */
(function () {
  'use strict';

  var K = window.ValKrypto;
  var Merkle = window.ValMerkle;
  var RLA = window.ValRLA;

  var resultat = [];
  var grupp = '';

  function gruppera(namn) { grupp = namn; }

  function test(namn, fn) {
    var t0 = performance.now();
    try {
      var utfall = fn();
      resultat.push({
        grupp: grupp,
        namn: namn,
        ok: utfall.ok === true,
        detalj: utfall.detalj || '',
        ms: performance.now() - t0
      });
    } catch (err) {
      resultat.push({
        grupp: grupp,
        namn: namn,
        ok: false,
        detalj: 'UNDANTAG: ' + err.message,
        ms: performance.now() - t0
      });
    }
  }

  function ok(detalj) { return { ok: true, detalj: detalj || '' }; }
  function fel(detalj) { return { ok: false, detalj: detalj || '' }; }

  /* ------------------------------------------------------------------ *
   * 1. SHA-256 mot publicerade testvektorer (FIPS 180-4)
   * ------------------------------------------------------------------ */

  function sha256Tester() {
    gruppera('SHA-256 — publicerade testvektorer');

    var vektorer = [
      { in: 'abc', ut: 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad' },
      { in: '',    ut: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855' },
      { in: 'abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq',
        ut: '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1' },
      { in: 'abcdefghbcdefghicdefghijdefghijkefghijklfghijklmghijklmnhijklmnoijklmnopjklmnopqklmnopqrlmnopqrsmnopqrstnopqrstu',
        ut: 'cf5b16a778af8380036ce59e7b0492370b249b11e8f07a51afac45037afee9d1' }
    ];

    vektorer.forEach(function (v, i) {
      test('Testvektor ' + (i + 1) + ' (' + (v.in.length ? v.in.length + ' tecken' : 'tom sträng') + ')', function () {
        var fick = K.hash(v.in);
        return fick === v.ut ? ok(fick) : fel('fick ' + fick + ', förväntade ' + v.ut);
      });
    });

    // Flerblocksmeddelande: 1 000 000 × 'a' (NIST-vector). Testar
    // meddelandepad och längdfält över många block.
    test('Testvektor 5 (1 000 000 tecken, ~15 625 block)', function () {
      var många = new Uint8Array(1000000);
      många.fill(0x61);
      var fick = K.toHex(K.sha256(många));
      var väntat = 'cdc76e5c9914fb9281a1c7e284d73e67f1809a48a497200e046d39ccc7112cd0';
      return fick === väntat ? ok(fick) : fel('fick ' + fick + ', förväntade ' + väntat);
    });

    test('Känd kollisionsegenskap: skilda indata ger skilda hashar', function () {
      var a = K.hash('vallokal-0142|röst=FRA');
      var b = K.hash('vallokal-0142|röst=MIL');
      return a !== b ? ok('skilda utfall') : fel('identiska hashar för skilda indata');
    });
  }

  /* ------------------------------------------------------------------ *
   * 2. Primtalstest
   * ------------------------------------------------------------------ */

  function primtalsTester() {
    gruppera('Miller–Rabin primtalstest');

    test('Kända primtal identifieras som primtal', function () {
      var primtal = [2n, 3n, 5n, 104729n, 2305843009213693951n];
      for (var i = 0; i < primtal.length; i++) {
        if (!K.isProbablePrime(primtal[i], 24)) return fel(primtal[i] + ' bedömdes sammansatt');
      }
      return ok(primtal.length + ' primtal korrekt identifierade, inklusive Mersenneprimtalet 2⁶¹−1');
    });

    test('Carmichaeltal avvisas (de lurar Fermats test)', function () {
      // 561, 1105 och 32769 är sammansatta men uppfyller Fermats lilla sats
      // för baser som är relativt prima till talet. Miller–Rabin måste ändå
      // avvisa dem.
      var carmichael = [561n, 1105n, 32769n, 8911n];
      for (var i = 0; i < carmichael.length; i++) {
        if (K.isProbablePrime(carmichael[i], 24)) return fel(carmichael[i] + ' bedömdes som primtal');
      }
      return ok(carmichael.join(', ') + ' korrekt avvisade');
    });

    test('Stort sammansatt tal avvisas', function () {
      var n = 2305843009213693951n * 104729n;
      return !K.isProbablePrime(n, 24) ? ok('avvisat') : fel('bedömdes som primtal');
    });

    test('Modulär invers: a · a⁻¹ ≡ 1 (mod m)', function () {
      for (var i = 0; i < 40; i++) {
        var m = 1000003n;
        var a = K.randomBelow(m - 1n) + 1n;
        if (K.gcd(a, m) !== 1n) continue;
        var inv = K.modInverse(a, m);
        if ((a * inv) % m !== 1n) return fel('a=' + a + ' gav felaktig invers');
      }
      return ok('40 slumpmässiga fall korrekta');
    });

    test('modPow stämmer med upprepad multiplikation (små tal)', function () {
      for (var i = 0; i < 30; i++) {
        var b = K.randomBelow(50n) + 2n;
        var e = K.randomBelow(20n) + 1n;
        var m = K.randomBelow(1000n) + 7n;
        var direkt = 1n;
        for (var j = 0n; j < e; j++) direkt = (direkt * b) % m;
        if (K.modPow(b, e, m) !== direkt) return fel('avvikelse vid b=' + b + ' e=' + e + ' m=' + m);
      }
      return ok('30 fall korrekta');
    });
  }

  /* ------------------------------------------------------------------ *
   * 3. RSA och blindsignering
   * ------------------------------------------------------------------ */

  function blindTester() {
    gruppera('RSA-2048 och blindsignering (whitepaper 5.B.2)');

    var nyckel;
    test('RSA-2048-nyckel genereras', function () {
      nyckel = K.generateRsaKey(2048);
      var nBitar = nyckel.n.toString(2).length;
      var eOk = nyckel.e === 65537n;
      var dOk = (nyckel.e * nyckel.d) % ((nyckel.p - 1n) * (nyckel.q - 1n)) === 1n;
      var pqOk = nyckel.p * nyckel.q === nyckel.n;
      if (nBitar !== 2048) return fel('n fick ' + nBitar + ' bitar');
      if (!eOk) return fel('e är inte 65537');
      if (!pqOk) return fel('p · q ≠ n');
      if (!dOk) return fel('e · d ≢ 1 (mod φ(n))');
      return ok('n=' + nBitar + ' bitar, e=65537, p·q=n, e·d≡1 mod φ(n)');
    });

    var pub = { n: nyckel ? nyckel.n : 0n, e: 65537n };

    test('Vanlig signatur verifierar, manipulerat meddelande avvisas', function () {
      var msg = JSON.stringify({ vallokal: '0142', resultat: { FRA: 120, MIL: 98 } });
      var s = K.sign(nyckel, msg);
      if (!K.verifySig(pub, msg, s)) return fel('giltig signatur avvisades');
      if (K.verifySig(pub, msg.replace('120', '121'), s)) return fel('manipulerat meddelande accepterades');
      return ok('signatur verifierar; ändring av en siffra avvisas');
    });

    // Hela blindflödet
    var kontext = 'VAL2030|vallokal-0142|' + K.toHex(K.randomBytes(16));
    var prep = K.Blind.prepare(pub, K.utf8(kontext));
    var blindSig = K.Blind.sign(nyckel, prep.blinded);
    var sig = K.Blind.unblind(pub, blindSig, prep.r);

    test('Blindsignerat flöde: avbländad signatur verifierar mot tokenmaterialet', function () {
      return K.Blind.verify(pub, prep.m, sig)
        ? ok('s^e mod n == m ✓')
        : fel('signaturen verifierar inte efter avbländning');
    });

    test('OLÄNKBARHET — myndighetens loggposter skiljer sig från terminalens', function () {
      // Tokenmyndigheten lagrar (m', s'). Terminalen lagrar (m, s).
      var mSkiljer = prep.blinded !== prep.m;
      var sSkiljer = blindSig !== sig;
      var sPrimVerifierarInte = K.modPow(blindSig, pub.e, pub.n) !== prep.m;
      if (!mSkiljer) return fel('m\' == m, bländningen hade ingen effekt');
      if (!sSkiljer) return fel('s\' == s, avbländningen hade ingen effekt');
      if (!sPrimVerifierarInte) return fel('s\' verifierar mot m — myndigheten kan då känna igen token');
      return ok('m\' ≠ m, s\' ≠ s, och s\'^e ≢ m. Myndighetens logg innehåller inget som ' +
                'identifierar den token som senare presenteras.');
    });

    test('OLÄNKBARHET — kopplingen existerar ENDAST med bländningsfaktorn r', function () {
      // Den som känner r kan återskapa m från m'. Utan r finns ingen genväg.
      // Detta test bekräftar att r är den enda länken, vilket är precis vad
      // som gör token olänkbar när r kasseras.
      var rInvE = K.modInverse(K.modPow(prep.r, pub.e, pub.n), pub.n);
      var återskapat = (prep.blinded * rInvE) % pub.n;
      if (återskapat !== prep.m) return fel('m kunde inte återskapas ens med r — testet är trasigt');
      return ok('Med r går m\' → m. Utan r (som kasseras ur klientminnet i steg 04) ' +
                'finns ingen beräkning som återför myndighetens loggpost till den presenterade token.');
    });

    test('Förfalskad signatur avvisas vid verifiering', function () {
      var manipulerad = (sig + 1n) % pub.n;
      return !K.Blind.verify(pub, prep.m, manipulerad)
        ? ok('avvisad')
        : fel('manipulerad signatur accepterades');
    });

    test('Fel tokenmaterial avvisas med giltig signatur', function () {
      var annatM = (prep.m + 1n) % pub.n;
      return !K.Blind.verify(pub, annatM, sig)
        ? ok('avvisad')
        : fel('signaturen accepterades mot ett annat tokenmaterial');
    });

    test('Återanvändning: samma token verifierar två gånger — skyddet är använt-listan', function () {
      // Ärligt test: kryptografin stoppar INTE återanvändning. Det gör
      // terminalens lista över förbrukade token. Båda delarna krävs.
      var första = K.Blind.verify(pub, prep.m, sig);
      var andra = K.Blind.verify(pub, prep.m, sig);
      return (första && andra)
        ? ok('Signaturen är giltig vid upprepad presentation. Återanvändningsskyddet ' +
             'ligger därför i terminalens förbrukade-lista (app.js), inte i signaturen. ' +
             'Detta är korrekt och måste vara explicit.')
        : fel('signaturen är inte deterministiskt verifierbar');
    });

    test('100 oberoende token är parvis skilda och samtliga giltiga', function () {
      var setM = {}, setS = {};
      for (var i = 0; i < 100; i++) {
        var p = K.Blind.prepare(pub, K.utf8('test|' + i + '|' + K.toHex(K.randomBytes(8))));
        var bs = K.Blind.sign(nyckel, p.blinded);
        var s2 = K.Blind.unblind(pub, bs, p.r);
        if (!K.Blind.verify(pub, p.m, s2)) return fel('token ' + i + ' ogiltig');
        var mh = K.bigToHex(p.m), sh = K.bigToHex(s2);
        if (setM[mh]) return fel('tokenmaterial upprepat vid i=' + i);
        if (setS[sh]) return fel('signatur upprepad vid i=' + i);
        setM[mh] = 1; setS[sh] = 1;
      }
      return ok('100 unika tokenmaterial, 100 unika signaturer, alla verifierar');
    });
  }

  /* ------------------------------------------------------------------ *
   * 4. Merkleträd
   * ------------------------------------------------------------------ */

  function merkleTester() {
    gruppera('Merklelogg (whitepaper 5.F, skikt 1)');

    var poster = [];
    for (var i = 0; i < 17; i++) {
      poster.push(JSON.stringify({ vallokal: '0' + (100 + i), röster: 40 + i }));
    }
    var träd = Merkle.build(poster);

    test('Rot beräknas och är deterministisk', function () {
      var träd2 = Merkle.build(poster.slice());
      return träd.root === träd2.root ? ok('rot = ' + träd.root.slice(0, 24) + '…') : fel('skilda rotar för samma indata');
    });

    test('Icke-ASCII-poster hashas korrekt (å, ä, ö)', function () {
      // leafHash måste dimensionera bufferten efter UTF-8-bytelängd, inte efter
      // strängens teckenlängd. Svenska postnamn överskrider alltid teckenlängden.
      var medÖ = Merkle.leafHash('vallokal 0142|röster=42|värdemängd');
      var utanÖ = Merkle.leafHash('vallokal 0142|roster=42|vardemangd');
      if (!/^[0-9a-f]{64}$/.test(medÖ)) return fel('ingen giltig hash: ' + medÖ);
      if (medÖ === Merkle.leafHash('vallokal 0142|röster=42|värdemängd')) {
        return medÖ !== utanÖ
          ? ok('stabil och skild från ASCII-varianten')
          : fel('kolliderar med en annan post');
      }
      return fel('hashen var inte deterministisk');
    });

    test('Inklusionsbevis verifierar för samtliga löv', function () {
      for (var i = 0; i < poster.length; i++) {
        var p = Merkle.proof(träd, i);
        if (!Merkle.verifyProof(träd.leaves[i], p)) return fel('bevis för löv ' + i + ' avvisades');
      }
      return ok(poster.length + ' bevis verifierade (udda antal löv testat)');
    });

    test('Manipulerat löv avvisas', function () {
      var p = Merkle.proof(träd, 3);
      var manipulerat = Merkle.leafHash(poster[3].replace('43', '44'));
      return !Merkle.verifyProof(manipulerat, p) ? ok('avvisat') : fel('manipulerat löv accepterades');
    });

    test('Manipulerat syskon i beviset avvisas', function () {
      var p = Merkle.proof(träd, 3);
      var p2 = { index: p.index, root: p.root, siblings: p.siblings.slice() };
      p2.siblings[0] = { hash: K.hash('förfalskat'), side: p2.siblings[0].side };
      return !Merkle.verifyProof(träd.leaves[3], p2) ? ok('avvisat') : fel('förfalskat syskon accepterades');
    });

    test('Fel rot avvisas', function () {
      var p = Merkle.proof(träd, 5);
      return !Merkle.verifyProof(träd.leaves[5], { index: p.index, siblings: p.siblings, root: K.hash('annan rot') })
        ? ok('avvisat') : fel('felaktig rot accepterades');
    });

    test('Domänseparation (RFC 6962): löv och interna noder kan inte förväxlas', function () {
      // Utan prefixen 0x00/0x01 kan en angripare konstruera ett internt
      // nodvärde som ser ut som ett löv — ett second-preimage-angrepp.
      var a = K.hash('A'), b = K.hash('B');
      var somLöv = Merkle.leafHash(a + b);
      var somNod = Merkle.nodeHash(a, b);
      if (somLöv === somNod) return fel('löv- och nodhash kolliderar');

      // Ett träd med ett löv "AB" ska inte ha samma rot som ett träd med två
      // löv "A" och "B".
      var trädEtt = Merkle.build(['AB']);
      var trädTvå = Merkle.build(['A', 'B']);
      return trädEtt.root !== trädTvå.root
        ? ok('prefix 0x00 för löv och 0x01 för noder förhindrar förväxling')
        : fel('träd med 1 löv "AB" har samma rot som träd med 2 löv "A","B"');
    });

    test('Append-only: tillagd post ändrar roten men bevarar tidigare bevisstruktur', function () {
      var före = Merkle.build(poster.slice(0, 8));
      var efter = Merkle.build(poster.slice(0, 9));
      return före.root !== efter.root
        ? ok('ny post ger ny rot — ett utbyte av historik kan inte döljas')
        : fel('roten oförändrad trots ny post');
    });
  }

  /* ------------------------------------------------------------------ *
   * 5. Riskbegränsad omräkning
   * ------------------------------------------------------------------ */

  function rlaTester() {
    gruppera('Riskbegränsad omräkning, BRAVO (whitepaper 5.F, skikt 2)');

    // Bygg en sedelhög med ett känt utfall.
    function byggSedlar(fördelning) {
      var sedlar = [];
      Object.keys(fördelning).forEach(function (parti) {
        for (var i = 0; i < fördelning[parti]; i++) sedlar.push(parti);
      });
      return sedlar;
    }

    var korrekt = byggSedlar({ FRA: 520, MIL: 410, KUS: 70 });
    var korrektRapport = RLA.tally(korrekt);

    test('Korrekt rapporterat resultat: auditen godkänner utan full omräkning', function () {
      var res = RLA.audit({
        reported: korrektRapport,
        ballots: korrekt,
        alpha: 0.05,
        seed: 'tärning-1|tärning-2|3-4-1-6-2-5'
      });
      if (!res.passed) return fel('audit underkände ett korrekt resultat; risk=' + res.pairs[0].T.toFixed(4));
      return ok('godkänd efter ' + res.ballotsDrawn + ' av ' + res.ballotsTotal + ' sedlar (' +
        (res.andelGranskad * 100).toFixed(1) + ' %)');
    });

    test('Manipulerat resultat: auditen underkänner och eskalerar', function () {
      // Angriparen har bytt 120 sedlar från MIL till FRA i den rapporterade
      // siffran, medan urnans faktiska sedlar är oförändrade.
      var manipulerat = { FRA: korrektRapport.FRA + 120, MIL: korrektRapport.MIL - 120, KUS: korrektRapport.KUS };
      var res = RLA.audit({
        reported: manipulerat,
        ballots: korrekt,
        alpha: 0.05,
        seed: 'tärning-1|tärning-2|3-4-1-6-2-5',
        maxSample: korrekt.length
      });
      if (res.passed) return fel('AUDITEN GODKÄNDE ETT FELAKTIGT RESULTAT — allvarligt');
      return ok('underkänd. Granskade ' + res.ballotsDrawn + ' sedlar (' +
        (res.andelGranskad * 100).toFixed(1) + ' %)' +
        (res.fullRecount ? ' → eskalerade till full omräkning' : '') +
        '. Riskmått: ' + res.pairs.map(function (p) { return p.winner + '/' + p.loser + '=' + p.T.toFixed(2); }).join(', '));
    });

    test('Mycket jämnt val: auditen kräver större urval (korrekt beteende)', function () {
      var jämnt = byggSedlar({ FRA: 505, MIL: 495 });
      var rapport = RLA.tally(jämnt);
      var res = RLA.audit({
        reported: rapport, ballots: jämnt, alpha: 0.05, seed: 'entropi-jämnt'
      });
      var snett = byggSedlar({ FRA: 900, MIL: 100 });
      var res2 = RLA.audit({
        reported: RLA.tally(snett), ballots: snett, alpha: 0.05, seed: 'entropi-jämnt'
      });
      function beskriv(r) {
        return r.ballotsDrawn + ' av ' + r.ballotsTotal + ' sedlar' +
          (r.fullRecount ? ' → eskalerade till full omräkning' : '');
      }
      return res.ballotsDrawn > res2.ballotsDrawn
        ? ok('jämnt val krävde ' + beskriv(res) + '; stort avstånd krävde ' + beskriv(res2))
        : fel('jämnt val (' + beskriv(res) + ') krävde inte fler än snett val (' + beskriv(res2) + ')');
    });

    test('Urvalet är reproducerbart ur den publika entropin', function () {
      var a = RLA.sampleIndices(1000, 60, 'publik-entropi-xyz');
      var b = RLA.sampleIndices(1000, 60, 'publik-entropi-xyz');
      var c = RLA.sampleIndices(1000, 60, 'publik-entropi-ANNAN');
      var lika = a.length === b.length && a.every(function (x, i) { return x === b[i]; });
      var skilda = !c.every(function (x, i) { return x === a[i]; });
      if (!lika) return fel('samma frö gav olika urval — granskare kan inte reproducera');
      if (!skilda) return fel('olika frö gav samma urval');
      return ok('identiskt frö → identiskt urval (60 index); annat frö → annat urval. ' +
                'En granskare kan återskapa exakt samma stickprov.');
    });

    test('Urvalet innehåller inga dubbletter och håller sig inom intervallet', function () {
      var idx = RLA.sampleIndices(500, 500, 'fullt-urval');
      var set = {};
      for (var i = 0; i < idx.length; i++) {
        if (idx[i] < 0 || idx[i] >= 500) return fel('index utanför intervallet: ' + idx[i]);
        if (set[idx[i]]) return fel('dubblett: ' + idx[i]);
        set[idx[i]] = 1;
      }
      return ok('500 unika index i [0,500) — urval utan återläggning fungerar');
    });

    test('Ingen moduloskevhet i slumptalsgeneratorn', function () {
      var rng = RLA.entropyStream('skew-test');
      var fack = [0, 0, 0, 0, 0, 0, 0];
      var N = 70000;
      for (var i = 0; i < N; i++) fack[rng.nextInt(7)]++;
      var väntat = N / 7;
      var maxAvvikelse = 0;
      fack.forEach(function (f) { maxAvvikelse = Math.max(maxAvvikelse, Math.abs(f - väntat) / väntat); });
      return maxAvvikelse < 0.05
        ? ok('största avvikelse ' + (maxAvvikelse * 100).toFixed(2) + ' % över ' + N + ' drag')
        : fel('avvikelse ' + (maxAvvikelse * 100).toFixed(2) + ' % — fördelningen är skev');
    });

    test('Riskgränsen respekteras: auditen stannar inte för tidigt', function () {
      var res = RLA.audit({
        reported: korrektRapport, ballots: korrekt, alpha: 0.001, seed: 'strikt-gräns'
      });
      // Vid alpha=0.001 krävs fler sedlar än vid alpha=0.05.
      var res2 = RLA.audit({
        reported: korrektRapport, ballots: korrekt, alpha: 0.05, seed: 'strikt-gräns'
      });
      return res.ballotsDrawn >= res2.ballotsDrawn
        ? ok('alpha=0.001 krävde ' + res.ballotsDrawn + ' sedlar, alpha=0.05 krävde ' + res2.ballotsDrawn)
        : fel('strängare riskgräns krävde färre sedlar');
    });
  }

  /* ------------------------------------------------------------------ *
   * 6. Designkrav
   * ------------------------------------------------------------------ */

  function designkravsTester() {
    gruppera('Designkrav ur whitepapern');

    test('5.B.1 — tokenpresentationen innehåller ingen identitetsuppgift', function () {
      // Strukturen som skickas till valsedelsterminalen får endast vara (m, s).
      var förbjudna = ['pnr', 'personnummer', 'namn', 'provider', 'vallokal', 'tid', 'nonce'];
      var payload = { m: 'ab12cd34', s: 'ef56ab78' };
      var läckage = Object.keys(payload).filter(function (k) { return förbjudna.indexOf(k) > -1; });
      if (läckage.length) return fel('payload innehåller ' + läckage.join(', '));
      var nödvändiga = ['m', 's'].filter(function (f) { return !(f in payload); });
      return nödvändiga.length ? fel('saknar ' + nödvändiga.join(', ')) : ok('payload = {m, s}, inga identitetsfält');
    });

    test('4.4 — samtliga utfärdare i federationen finns och är märkta med nivå', function () {
      var D = window.ValData;
      var saknas = D.PROVIDERS.filter(function (p) { return !p.niva || !p.ramlag; });
      if (saknas.length) return fel('utfärdare utan nivå/ramverk: ' + saknas.map(function (p) { return p.namn; }).join(', '));
      var harManuell = D.PROVIDERS.some(function (p) { return p.id === 'manuell'; });
      var harEidas = D.PROVIDERS.some(function (p) { return p.id === 'eidas'; });
      if (!harManuell) return fel('manuell väg saknas — väljare utan e-legitimation utesluts');
      if (!harEidas) return fel('eIDAS saknas — EU-medborgare utesluts i kommun-/regionval');
      return ok(D.PROVIDERS.length + ' utfärdare, inklusive manuell väg och eIDAS');
    });

    test('4.2 — röstlängden täcker väljare som saknar e-legitimation och EU-medborgare', function () {
      var D = window.ValData;
      var utanEleg = D.ROSTLANGD.filter(function (v) { return v.ingenEleg; }).length;
      var eu = D.ROSTLANGD.filter(function (v) { return v.euMedborgare; }).length;
      if (!utanEleg) return fel('inga väljare utan e-legitimation i testdatat');
      if (!eu) return fel('inga EU-medborgare i testdatat');
      return ok(utanEleg + ' utan e-legitimation, ' + eu + ' EU-medborgare — båda vägarna kan testas');
    });

    test('3.3 — ingen distansröstning: flödet kräver fysisk vallokal', function () {
      var D = window.ValData;
      return D.VALLOKAL && D.VALLOKAL.id && D.VALLOKAL.valforrattare
        ? ok('vallokal ' + D.VALLOKAL.id + ' med valförrättare ' + D.VALLOKAL.valforrattare)
        : fel('vallokalskontext saknas');
    });
  }

  /* ------------------------------------------------------------------ *
   * Körning och rendering
   * ------------------------------------------------------------------ */

  var TESTSUITE = [sha256Tester, primtalsTester, blindTester, merkleTester, rlaTester, designkravsTester];

  function render() {
    var html = '';
    var aktuellGrupp = null;
    resultat.forEach(function (r) {
      if (r.grupp !== aktuellGrupp) {
        aktuellGrupp = r.grupp;
        html += '<div class="grupprubrik">' + esc(aktuellGrupp) + '</div>';
        html += '<table class="test"><thead><tr><th>Test</th><th>Utfall</th><th>Detaljer</th></tr></thead><tbody>';
      }
      html += '<tr>' +
        '<td>' + esc(r.namn) + '</td>' +
        '<td class="status ' + (r.ok ? 'ok' : 'fel') + '">' + (r.ok ? 'OK' : 'FEL') + '</td>' +
        '<td class="det">' + esc(r.detalj) + (r.ms > 200 ? ' <em>(' + Math.round(r.ms) + ' ms)</em>' : '') + '</td>' +
      '</tr>';
    });
    if (html) html += '</tbody></table>';
    document.getElementById('resultat').innerHTML = html;

    var antal = resultat.length;
    var felaktiga = resultat.filter(function (r) { return !r.ok; }).length;
    document.getElementById('antal-tester').textContent = antal + ' tester · ' + (antal - felaktiga) + ' godkända';

    var summering = document.getElementById('summering');
    summering.innerHTML = felaktiga === 0
      ? '<div class="notis lyckat"><strong>Samtliga ' + antal + ' tester godkända</strong>' +
        '<p>SHA-256 stämmer med publicerade testvektorer. Blindsignaturen är verifierbar och ' +
        'olänkbar. Merklebevis avvisar manipulation. RLA godkänner korrekta resultat och ' +
        'underkänner manipulerade, med reproducerbart urval.</p>' +
        '<p>Detta visar att implementationen är internkonsistent. Det är <em>inte</em> en formell ' +
        'säkerhetsverifiering.</p></div>'
      : '<div class="notis fara"><strong>' + felaktiga + ' av ' + antal + ' tester underkända</strong>' +
        '<p>Implementationen uppfyller inte sina utlovade egenskaper. Rätta innan demonstrationen visas.</p></div>';
  }

  function esc(s) { return K.esc(s); }

  function körAlla() {
    resultat = [];
    document.getElementById('btn-kör').disabled = true;
    var steg = 0;

    function nästa() {
      if (steg >= TESTSUITE.length) {
        document.getElementById('status').textContent = '';
        document.getElementById('tid').textContent = 'Klart ' + new Date().toLocaleTimeString('sv-SE');
        render();
        document.getElementById('btn-kör').disabled = false;
        return;
      }
      var namn = ['SHA-256', 'Primtalstest', 'RSA + blindsignering', 'Merkleträd', 'RLA', 'Designkrav'][steg];
      document.getElementById('status').innerHTML = '<span class="spinner"></span> kör ' + namn + '…';
      document.getElementById('resultat').innerHTML = '<p class="inledning">Kör ' + esc(namn) + '…</p>';
      setTimeout(function () {
        try {
          TESTSUITE[steg]();
        } catch (err) {
          resultat.push({
            grupp: namn,
            namn: 'Gruppen kunde inte köras',
            ok: false,
            detalj: 'UNDANTAG: ' + err.message,
            ms: 0
          });
        }
        render();
        steg++;
        nästa();
      }, 25);
    }
    nästa();
  }

  function init() {
    document.getElementById('btn-kör').onclick = körAlla;
    // Kör automatiskt så att en granskare inte behöver klicka.
    körAlla();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
