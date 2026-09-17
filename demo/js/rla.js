/*
 * rla.js — Riskbegränsad omräkning (whitepaper 5.F, skikt 2).
 *
 * Implementation av BRAVO, en ballot-polling-audit (Lindeman, Stark & Yates).
 * Idén: för varje slumpmässigt dragen sedel uppdateras ett riskmått T med en
 * kvot som är liten om det rapporterade resultatet stämmer och stor om det inte
 * gör det. Auditen avslutas när T faller under riskgränsen alpha — eller
 * eskalerar till full omräkning om det inte gör det.
 *
 * För ett par (vinnare v, förlorare f) med rapporterade andelar p_v och p_f:
 *   sedel för v:  T *= 1 / (2 · p_v)     — vilket är < 1 när p_v > 0,5
 *   sedel för f:  T *= 1 / (2 · p_f)
 *   sedel för annat parti: påverkar inte detta par
 *
 * Varje par körs separat och samtliga måste klara gränsen.
 *
 * Urvalet drivs av en publik entropikälla. Eftersom slumpgeneratorn är
 * deterministisk och öppen kan vem som helst återskapa exakt samma urval —
 * det är vad som gör auditen körbar av tredje part.
 */
(function (global) {
  'use strict';

  var K = global.ValKrypto;

  /**
   * Deterministisk slumptalsgenerator ur publik entropi.
   * Varje anrop ger nya byte ur hash(seed || counter).
   */
  function entropyStream(seedStr) {
    var counter = 0;
    return {
      /** Uniformt heltal i [0, n). */
      nextInt: function (n) {
        if (n <= 0) throw new Error('nextInt kräver n > 0');
        // Förkasta värden som ger skev fördelning (modulo bias).
        var limit = Math.floor(0x100000000 / n) * n;
        var value;
        do {
          var hex = K.hash(seedStr + '|' + counter);
          counter++;
          value = parseInt(hex.slice(0, 8), 16);
        } while (value >= limit);
        return value % n;
      },
      counter: function () { return counter; }
    };
  }

  /** Partiellt Fisher–Yates: drar k unika index ur [0, n). */
  function sampleIndices(n, k, seedStr) {
    if (k > n) k = n;
    var rng = entropyStream(seedStr);
    var pool = new Array(n);
    for (var i = 0; i < n; i++) pool[i] = i;
    var drawn = [];
    for (var j = 0; j < k; j++) {
      var pick = j + rng.nextInt(n - j);
      var tmp = pool[j]; pool[j] = pool[pick]; pool[pick] = tmp;
      drawn.push(pool[j]);
    }
    return drawn;
  }

  /**
   * Kör en BRAVO-audit.
   *
   * @param {Object} opts
   * @param {Object} opts.reported   — rapporterat resultat, {partiId: antal}
   * @param {string[]} opts.ballots  — den sanna sedellistan, en post per sedel
   * @param {number} opts.alpha      — riskgräns, t.ex. 0.05
   * @param {string} opts.seed       — publik entropi, t.ex. tärningsslag
   * @param {number} [opts.maxSample] — tak på urvalet innan full omräkning
   * @returns {Object} utfall med riskkurva per par
   */
  function audit(opts) {
    var reported = opts.reported;
    var ballots = opts.ballots;
    var alpha = opts.alpha;
    var seed = opts.seed;
    var maxSample = opts.maxSample || ballots.length;

    var ids = Object.keys(reported).sort(function (a, b) {
      return reported[b] - reported[a];
    });
    if (ids.length < 2) throw new Error('Auditen kräver minst två alternativ');

    var winner = ids[0];
    var losers = ids.slice(1);

    var pairs = losers.map(function (loser) {
      var wv = reported[winner], lv = reported[loser];
      var total = wv + lv;
      return {
        winner: winner,
        loser: loser,
        pWinner: total > 0 ? wv / total : 0.5,
        pLoser: total > 0 ? lv / total : 0.5,
        T: 1,
        curve: [1],
        passed: false,
        stoppedAt: null
      };
    });

    var n = ballots.length;
    var k = Math.min(maxSample, n);
    var sample = sampleIndices(n, k, seed);

    var fullRecount = false;
    var ballotsDrawn = 0;

    for (var s = 0; s < sample.length; s++) {
      var ballot = ballots[sample[s]];
      ballotsDrawn++;

      for (var p = 0; p < pairs.length; p++) {
        var pair = pairs[p];
        if (pair.passed) continue;

        if (ballot === pair.winner) {
          pair.T *= 1 / (2 * pair.pWinner);
        } else if (ballot === pair.loser) {
          pair.T *= 1 / (2 * pair.pLoser);
        } else {
          continue; // Sedel för tredje parti: ingen information om detta par.
        }

        pair.curve.push(pair.T);

        if (pair.T <= alpha) {
          pair.passed = true;
          pair.stoppedAt = ballotsDrawn;
        }
      }

      // En sedel för ett tredje parti uppdaterar inget par. Auditen får bara
      // avslutas när samtliga par faktiskt har nått under riskgränsen.
      if (pairs.every(function (p) { return p.passed; })) break;

      if (ballotsDrawn >= maxSample) {
        fullRecount = true;
        break;
      }
    }

    var allOk = pairs.every(function (p) { return p.passed; });

    return {
      winner: winner,
      pairs: pairs,
      ballotsDrawn: ballotsDrawn,
      ballotsTotal: n,
      sample: sample,
      seed: seed,
      alpha: alpha,
      passed: allOk && !fullRecount,
      fullRecount: fullRecount,
      andelGranskad: n > 0 ? ballotsDrawn / n : 0
    };
  }

  /**
   * Kontrollerar det rapporterade resultatet mot de faktiska sedlarna.
   * Används för att visa om en audit upptäcker ett planterat fel.
   */
  function tally(ballots) {
    var out = {};
    for (var i = 0; i < ballots.length; i++) {
      out[ballots[i]] = (out[ballots[i]] || 0) + 1;
    }
    return out;
  }

  global.ValRLA = {
    entropyStream: entropyStream,
    sampleIndices: sampleIndices,
    audit: audit,
    tally: tally
  };
})(window);
