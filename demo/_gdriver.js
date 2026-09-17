/* Tillfällig körningsfil för granskarsidan. Ska inte levereras. */
(function () {
  'use strict';

  var logg = [], fel = [];

  window.onerror = function (m, s, l, c) {
    rapporteraFel('ONERROR: ' + m + ' @ ' + (s || '').split('/').pop() + ':' + l + ':' + c);
  };
  var origErr = console.error;
  console.error = function () {
    rapporteraFel('CONSOLE: ' + Array.prototype.join.call(arguments, ' '));
    origErr.apply(console, arguments);
  };

  function linda(fn) {
    if (typeof fn !== 'function') return fn;
    return function () {
      try { return fn.apply(null, arguments); }
      catch (e) { rapporteraFel('ASYNK: ' + e.message + '\n' + (e.stack || '')); }
    };
  }
  var origST = window.setTimeout, origSI = window.setInterval;
  window.setTimeout = function (fn, t) {
    return origST.apply(window, [linda(fn), t].concat(Array.prototype.slice.call(arguments, 2)));
  };
  window.setInterval = function (fn, t) {
    return origSI.apply(window, [linda(fn), t].concat(Array.prototype.slice.call(arguments, 2)));
  };

  var pre = null;
  function visa() {
    if (!document.body) return;
    if (!pre) {
      pre = document.createElement('pre');
      pre.id = 'transkript';
      pre.style.cssText = 'white-space:pre-wrap;font:11px monospace;background:#111;color:#0f0;padding:12px';
      document.body.appendChild(pre);
    }
    pre.textContent = '=== FEL (' + fel.length + ') ===\n' + fel.join('\n') +
      '\n\n=== STEG (' + logg.length + ') ===\n' + logg.join('\n');
  }
  function notera(s) { logg.push(s); visa(); }
  function rapporteraFel(s) { fel.push(s); visa(); document.title = 'GDRIV FEL=' + fel.length; }

  function $(id) { return document.getElementById(id); }
  function text(id) { var e = $(id); return e ? e.innerText : 'SAKNAS'; }

  var steg = [];
  function klicka(namn, id) {
    steg.push({
      namn: 'klick ' + namn,
      hitta: function () { var b = $(id); return b && !b.disabled ? b : null; },
      redo: function (el) { el.click(); }
    });
  }
  function vänta(namn, villkor) {
    steg.push({ namn: 'vänta: ' + namn, hitta: function () { return villkor() ? document.body : null; }, redo: function () {} });
  }
  function fånga(namn, fn) {
    steg.push({ namn: namn, hitta: function () { return document.body; }, redo: fn });
  }

  function auditKlar() {
    return $('btn-audit') && !$('btn-audit').disabled && $('audit-status').textContent === 'klar';
  }
  function entropiSatt() {
    return $('entropi').value.trim().length > 0 && !$('btn-audit').disabled;
  }

  function audit(rubrik) {
    klicka('btn-audit', 'btn-audit');
    vänta('audit klar (' + rubrik + ')', auditKlar);
    fånga('AUDIT: ' + rubrik, function () {
      notera('======== AUDIT: ' + rubrik + ' ========\n' + text('audit-utfall'));
      notera('--- SAMMANFATTNING: ' + rubrik + ' ---\n' + text('sammanfattning'));
    });
  }

  function tärningar() {
    klicka('btn-slå', 'btn-slå');
    vänta('entropi satt', entropiSatt);
    fånga('entropi', function () { notera('--- ENTROPI ---\n' + $('entropi').value); });
  }

  function ögonblicksbild(tag) {
    fånga('snapshot ' + tag, function () {
      notera('--- ÖGONBLICKSBILD ' + tag + ' ---\nkälla: ' + text('meta-källa') +
        '\nunderlag: ' + text('underlagstext') +
        '\nrot: ' + text('rot') +
        '\nprotokoll: ' + text('antal-protokoll') +
        '\nträddjup: ' + text('träddjup') +
        '\nurna: ' + text('urna-antal') +
        '\nrapporterat: ' + text('rapporterat'));
    });
  }

  /* ---------- Fas A: demonstrationens underlag ---------- */
  ögonblicksbild('A0 initial');
  tärningar();
  audit('A1 orört');
  klicka('btn-manipulera', 'btn-manipulera');
  vänta('manipulationsutfall', function () { return $('manipulationsutfall').innerHTML.length > 50; });
  fånga('manipulation', function () { notera('--- MANIPULATION ---\n' + text('manipulationsutfall')); });
  audit('A2 manipulerad');
  klicka('btn-återställ', 'btn-återställ');
  ögonblicksbild('A3 efter återställning');
  tärningar();
  audit('A4 efter återställning — Merkle ska vara ✓ NEJ igen');

  /* ---------- Fas B: realistiskt underlag ---------- */
  klicka('btn-underlag-full', 'btn-underlag-full');
  ögonblicksbild('B0 realistiskt');
  tärningar();
  audit('B1 orört realistiskt — RLA ska godkänna');
  klicka('btn-plantera', 'btn-plantera');
  fånga('planterat', function () { notera('--- PLANTERAT FEL ---\n' + text('rapporterat')); });
  audit('B2 planterat fel — RLA ska underkänna');
  klicka('btn-underlag-demo', 'btn-underlag-demo');
  ögonblicksbild('C0 tillbaka till demo');

  fånga('klart', function () { notera('=== KLART ==='); document.title = 'GKÖRD fel=' + fel.length; });

  var i = 0;
  function kör() {
    if (i >= steg.length) { visa(); return; }
    var s = steg[i], försök = 0;
    (function prova() {
      var el = null;
      try { el = s.hitta(); } catch (e) { rapporteraFel('I "' + s.namn + '": ' + e.message + '\n' + (e.stack || '')); }
      if (el) {
        try { s.redo(el); notera('OK  ' + s.namn); }
        catch (e) { rapporteraFel('Klick "' + s.namn + '": ' + e.message + '\n' + (e.stack || '')); }
        i++; setTimeout(kör, 1); return;
      }
      if (++försök > 800) { rapporteraFel('TIMEOUT: ' + s.namn); i++; setTimeout(kör, 1); return; }
      setTimeout(prova, 5);
    })();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', kör);
  else kör();
})();
