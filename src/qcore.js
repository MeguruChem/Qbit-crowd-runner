// qcore.js — 量子ビット群衆のコア計算（ブラウザ / Node 共通）
// 一人ひとりが純粋状態スピノル (a, b) を持ち、群衆平均が密度行列 ρ を与える。
(function (root) {
  'use strict';

  // ---- 乱数（シード可能） ----
  function mulberry32(seed) {
    let t = seed >>> 0;
    return function () {
      t += 0x6d2b79f5;
      let r = Math.imul(t ^ (t >>> 15), 1 | t);
      r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
      return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
  }
  let rand = Math.random;
  function setSeed(seed) { rand = seed == null ? Math.random : mulberry32(seed); }
  function gauss() {
    let u = 0, v = 0;
    while (u === 0) u = rand();
    while (v === 0) v = rand();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  // ---- 複素数 [re, im] ----
  const cmul = (x, y) => [x[0] * y[0] - x[1] * y[1], x[0] * y[1] + x[1] * y[0]];
  const cadd = (x, y) => [x[0] + y[0], x[1] + y[1]];

  // 軸 n まわりの角度 θ の回転 U = cos(θ/2) I − i sin(θ/2) n·σ
  function rot(n, theta) {
    const len = Math.hypot(n[0], n[1], n[2]);
    const nx = n[0] / len, ny = n[1] / len, nz = n[2] / len;
    const c = Math.cos(theta / 2), s = Math.sin(theta / 2);
    return [
      [[c, -s * nz], [-s * ny, -s * nx]],
      [[s * ny, -s * nx], [c, s * nz]],
    ];
  }
  const SQ = Math.SQRT1_2;
  const PI = Math.PI;
  const GATES = {
    X: { label: 'X', U: rot([1, 0, 0], PI) },
    Y: { label: 'Y', U: rot([0, 1, 0], PI) },
    Z: { label: 'Z', U: rot([0, 0, 1], PI) },
    H: { label: 'H', U: rot([SQ, 0, SQ], PI) },
    S: { label: 'S', U: rot([0, 0, 1], PI / 2) },
    Sdg: { label: 'S†', U: rot([0, 0, 1], -PI / 2) },
    T: { label: 'T', U: rot([0, 0, 1], PI / 4) },
    Tdg: { label: 'T†', U: rot([0, 0, 1], -PI / 4) },
    Rx90: { label: 'Rx 90°', U: rot([1, 0, 0], PI / 2) },
    Rxm90: { label: 'Rx −90°', U: rot([1, 0, 0], -PI / 2) },
    Ry90: { label: 'Ry 90°', U: rot([0, 1, 0], PI / 2) },
    Rym90: { label: 'Ry −90°', U: rot([0, 1, 0], -PI / 2) },
    I: { label: '素通り', U: null },
    M: { label: '観測', special: 'measureZ' },
    COOL: { label: '冷却', special: 'cool' },
  };

  // ---- 個人 ----
  function makePerson(w) {
    // w: 歳差速度のばらつき係数（人ごとに固定、標準正規）
    return { a: [1, 0], b: [0, 0], w: w };
  }
  function makeCrowd(N) {
    const crowd = [];
    for (let i = 0; i < N; i++) crowd.push(makePerson(gauss()));
    return crowd;
  }
  function applyU(p, U) {
    const a = cadd(cmul(U[0][0], p.a), cmul(U[0][1], p.b));
    const b = cadd(cmul(U[1][0], p.a), cmul(U[1][1], p.b));
    p.a = a; p.b = b;
  }
  function normalize(p) {
    const n = Math.sqrt(p.a[0] ** 2 + p.a[1] ** 2 + p.b[0] ** 2 + p.b[1] ** 2);
    p.a = [p.a[0] / n, p.a[1] / n]; p.b = [p.b[0] / n, p.b[1] / n];
  }
  function bloch(p) {
    // a* b
    const re = p.a[0] * p.b[0] + p.a[1] * p.b[1];
    const im = p.a[0] * p.b[1] - p.a[1] * p.b[0];
    const pa = p.a[0] ** 2 + p.a[1] ** 2, pb = p.b[0] ** 2 + p.b[1] ** 2;
    return [2 * re, 2 * im, pa - pb];
  }
  function setFromBloch(p, v) {
    const th = Math.acos(Math.max(-1, Math.min(1, v[2])));
    const ph = Math.atan2(v[1], v[0]);
    p.a = [Math.cos(th / 2), 0];
    p.b = [Math.sin(th / 2) * Math.cos(ph), Math.sin(th / 2) * Math.sin(ph)];
  }
  function meanBloch(crowd) {
    const r = [0, 0, 0];
    for (const p of crowd) { const v = bloch(p); r[0] += v[0]; r[1] += v[1]; r[2] += v[2]; }
    return r.map((x) => x / crowd.length);
  }

  // ---- ゲート ----
  function applyGate(crowd, key) {
    const g = GATES[key];
    if (!g) throw new Error('unknown gate ' + key);
    if (g.special === 'measureZ') { for (const p of crowd) measureZ(p); return; }
    if (g.special === 'cool') { for (const p of crowd) if (rand() < 0.5) setFromBloch(p, [0, 0, 1]); return; }
    if (!g.U) return;
    for (const p of crowd) applyU(p, g.U);
  }

  // ---- ゾーン（距離 ds あたり） ----
  // precess: angle = 総回転角 × (ds/L) × (1 + spread·w)
  function precess(crowd, anglePerUnit, spread, ds) {
    for (const p of crowd) applyU(p, rot([0, 0, 1], anglePerUnit * ds * (1 + spread * p.w)));
  }
  // dephase: ランダム Rz キック。⟨e^{-iφ}⟩ = e^{-γ ds}
  function dephase(crowd, gamma, ds) {
    const sd = Math.sqrt(2 * gamma * ds);
    for (const p of crowd) applyU(p, rot([0, 0, 1], sd * gauss()));
  }
  // damp: 量子ジャンプ法による振幅減衰（|1⟩ → |0⟩）
  function damp(crowd, gamma, ds) {
    for (const p of crowd) {
      const p1 = p.b[0] ** 2 + p.b[1] ** 2;
      if (rand() < gamma * p1 * ds) { p.a = [1, 0]; p.b = [0, 0]; }
      else { const f = Math.exp(-gamma * ds / 2); p.b = [p.b[0] * f, p.b[1] * f]; normalize(p); }
    }
  }
  function measureZ(p) {
    const p0 = p.a[0] ** 2 + p.a[1] ** 2;
    if (rand() < p0) { p.a = [1, 0]; p.b = [0, 0]; } else { p.a = [0, 0]; p.b = [1, 0]; }
  }
  function applyZone(crowd, zone, ds) {
    const L = zone.to - zone.from;
    if (zone.kind === 'precess') precess(crowd, zone.angle / L, zone.spread || 0, ds);
    else if (zone.kind === 'dephase') dephase(crowd, zone.gamma, ds);
    else if (zone.kind === 'damp') damp(crowd, zone.gamma, ds);
  }

  // ---- ボス：軸 n での射影測定 ----
  function measureAlong(crowd, n) {
    const len = Math.hypot(n[0], n[1], n[2]);
    const u = n.map((x) => x / len);
    const outcomes = [];
    for (const p of crowd) {
      const v = bloch(p);
      const prob = (1 + v[0] * u[0] + v[1] * u[1] + v[2] * u[2]) / 2;
      outcomes.push(rand() < prob);
    }
    return outcomes;
  }
  function expectedHits(crowd, n) {
    const r = meanBloch(crowd);
    const len = Math.hypot(n[0], n[1], n[2]);
    return crowd.length * (1 + (r[0] * n[0] + r[1] * n[1] + r[2] * n[2]) / len) / 2;
  }
  function score(hits, rMean, n) {
    const len = Math.hypot(n[0], n[1], n[2]);
    const f = (1 + (rMean[0] * n[0] + rMean[1] * n[1] + rMean[2] * n[2]) / len) / 2;
    return hits * 100 + Math.round(1000 * f);
  }

  const Q = {
    setSeed, gauss, rot, GATES, makeCrowd, applyU, bloch, setFromBloch, meanBloch,
    applyGate, applyZone, measureAlong, expectedHits, score,
    rand: () => rand(),
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = Q;
  root.Q = Q;
})(typeof globalThis !== 'undefined' ? globalThis : this);
