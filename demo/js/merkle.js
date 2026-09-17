/*
 * merkle.js — Append-only-logg med Merkleträd (whitepaper 5.F, skikt 1).
 *
 * RFC 6962-konform: lövnoder prefixas med 0x00 och interna noder med 0x01.
 * Utan prefixen är ett träd sårbart för second-preimage-angrepp, där en
 * angripare kan konstruera ett internt nodvärde som ser ut som ett löv.
 */
(function (global) {
  'use strict';

  var K = global.ValKrypto;

  function leafHash(dataStr) {
    var data = K.utf8(dataStr);
    var bytes = new Uint8Array(1 + data.length);
    bytes[0] = 0x00;
    bytes.set(data, 1);
    return K.toHex(K.sha256(bytes));
  }

  function nodeHash(leftHex, rightHex) {
    var l = K.fromHex(leftHex), r = K.fromHex(rightHex);
    var bytes = new Uint8Array(1 + l.length + r.length);
    bytes[0] = 0x01;
    bytes.set(l, 1);
    bytes.set(r, 1 + l.length);
    return K.toHex(K.sha256(bytes));
  }

  /**
   * Bygger ett Merkleträd över en lista av poster.
   * @param {string[]} items — serialiserade poster (t.ex. JSON av resultatprotokoll)
   * @returns {{leaves: string[], levels: string[][], root: string}}
   */
  function build(items) {
    if (!items.length) return { leaves: [], levels: [[]], root: null };

    var leaves = items.map(leafHash);
    var levels = [leaves.slice()];

    var current = leaves.slice();
    while (current.length > 1) {
      var next = [];
      for (var i = 0; i < current.length; i += 2) {
        if (i + 1 < current.length) {
          next.push(nodeHash(current[i], current[i + 1]));
        } else {
          // Udda antal: duplicera sista noden på detta nivå.
          next.push(nodeHash(current[i], current[i]));
        }
      }
      levels.push(next);
      current = next;
    }

    return { leaves: leaves, levels: levels, root: current[0] };
  }

  /**
   * Inklusionsbevis för ett löv.
   * @returns {{index: number, siblings: {hash: string, side: string}[], root: string}}
   */
  function proof(tree, index) {
    var siblings = [];
    var idx = index;
    for (var level = 0; level < tree.levels.length - 1; level++) {
      var nodes = tree.levels[level];
      var pairIdx = idx % 2 === 0 ? idx + 1 : idx - 1;
      var sibling = pairIdx < nodes.length ? nodes[pairIdx] : nodes[idx];
      siblings.push({ hash: sibling, side: idx % 2 === 0 ? 'right' : 'left' });
      idx = Math.floor(idx / 2);
    }
    return { index: index, siblings: siblings, root: tree.root };
  }

  /**
   * Verifierar ett inklusionsbevis mot en publik rot.
   * Kräver ingen del av trädet — bara roten, lövet och syskonnoderna.
   */
  function verifyProof(leafHex, p) {
    var acc = leafHex;
    for (var i = 0; i < p.siblings.length; i++) {
      var s = p.siblings[i];
      acc = s.side === 'right' ? nodeHash(acc, s.hash) : nodeHash(s.hash, acc);
    }
    return acc === p.root;
  }

  global.ValMerkle = {
    leafHash: leafHash,
    nodeHash: nodeHash,
    build: build,
    proof: proof,
    verifyProof: verifyProof
  };
})(window);
