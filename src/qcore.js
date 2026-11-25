// qcore.js — 量子ビット群衆のコア計算（ブラウザ / Node 共通）
// 一人ひとりがブロッホベクトル r_i（|r_i| ≤ 1）を持ち、群衆平均が密度行列 ρ = (I + r·σ)/2 を与える。
// 1 次元章では r_i = (0, 0, z)（確率ビット）、2 次元章では r_i = (x, 0, z)（XZ 面）に留まるゲートだけを使う。
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

  // ---- 回転（ロドリゲスの公式） ----
  function rotate(v, n, th) {
    const len = Math.hypot(n[0], n[1], n[2]);
    const k = [n[0] / len, n[1] / len, n[2] / len];
    const c = Math.cos(th), s = Math.sin(th);
    const dot = k[0] * v[0] + k[1] * v[1] + k[2] * v[2];
    const cr = [k[1] * v[2] - k[2] * v[1], k[2] * v[0] - k[0] * v[2], k[0] * v[1] - k[1] * v[0]];
    return [0, 1, 2].map((i) => v[i] * c + cr[i] * s + k[i] * dot * (1 - c));
  }
  const SQ = Math.SQRT1_2, PI = Math.PI;
  // 軸 n まわりに角度 θ（右ねじ）。XZ 面を正面から見ると Ry(+θ) は時計回り。
  const GATES = {
    I: { label: '素通り' },
    X: { label: 'X', axis: [1, 0, 0], angle: PI },
    Y: { label: 'Y', axis: [0, 1, 0], angle: PI },
    Z: { label: 'Z', axis: [0, 0, 1], angle: PI },
    H: { label: 'H', axis: [SQ, 0, SQ], angle: PI },
    Ry90: { label: 'Ry 90°', axis: [0, 1, 0], angle: PI / 2 },
    Rym90: { label: 'Ry −90°', axis: [0, 1, 0], angle: -PI / 2 },
    Ry45: { label: 'Ry 45°', axis: [0, 1, 0], angle: PI / 4 },
    Rym45: { label: 'Ry −45°', axis: [0, 1, 0], angle: -PI / 4 },
    S: { label: 'S', axis: [0, 0, 1], angle: PI / 2 },
    Sdg: { label: 'S†', axis: [0, 0, 1], angle: -PI / 2 },
    T: { label: 'T', axis: [0, 0, 1], angle: PI / 4 },
    Rx90: { label: 'Rx 90°', axis: [1, 0, 0], angle: PI / 2 },
    M: { label: '観測', special: 'measureZ' },
    ADD10: { label: '+10人', special: 'add', n: 10 },
    SUB10: { label: '−10人', special: 'sub', n: 10 },
    CLONE: { label: '×2', special: 'clone' },
  };
  const MAX_CROWD = 600;

  // ---- 群衆 ----
  // w: 歳差速度のばらつき（人ごとに固定）、j: 表示用の横ゆらし
  function makePerson(r) { return { r: r.slice(), w: gauss(), j: 2 * rand() - 1 }; }
  function makeCrowd(N, start) {
    const crowd = [];
    for (let i = 0; i < N; i++) {
      let r = [0, 0, 1];
      if (start === 'one') r = [0, 0, -1];
      else if (start === 'mixed') r = [0, 0, 2 * rand() - 1];
      crowd.push(makePerson(r));
    }
    return crowd;
  }
  const bloch = (p) => p.r.slice();
  function meanBloch(crowd) {
    const m = [0, 0, 0];
    for (const p of crowd) { m[0] += p.r[0]; m[1] += p.r[1]; m[2] += p.r[2]; }
    return m.map((x) => x / crowd.length);
  }

  // ---- ゲート ----
  function measureZ(p) { p.r = [0, 0, rand() < (1 + p.r[2]) / 2 ? 1 : -1]; }
  function applyGate(crowd, key) {
    const g = GATES[key];
    if (!g) throw new Error('unknown gate ' + key);
    if (g.special === 'measureZ') { crowd.forEach(measureZ); return; }
    if (g.special === 'add') {
      // 新しい量子ビットを |0⟩ で用意して合流
      for (let i = 0; i < g.n && crowd.length < MAX_CROWD; i++) crowd.push(makePerson([0, 0, 1]));
      return;
    }
    if (g.special === 'sub') {
      // 量子ビットの消失：ランダムに n 人が抜ける（最低 1 人は残る）
      for (let i = 0; i < g.n && crowd.length > 1; i++) crowd.splice(Math.floor(rand() * crowd.length), 1);
      return;
    }
    if (g.special === 'clone') {
      // CNOT コピー：|0⟩ の新人を標的に CNOT。縦（z）成分だけが写り、
      // 本人・コピーともに横成分は消える（複製不可能定理）。
      // 本来は本人とコピーの測定結果が z で完全相関するが、期待値は変わらないので独立に扱う。
      const n0 = crowd.length;
      for (let i = 0; i < n0 && crowd.length < MAX_CROWD; i++) {
        const p = crowd[i];
        p.r = [0, 0, p.r[2]];
        crowd.push(makePerson(p.r));
      }
      return;
    }
    if (!g.axis) return;
    for (const p of crowd) p.r = rotate(p.r, g.axis, g.angle);
  }

  // ---- ゾーン（距離 ds あたり） ----
  function applyZone(crowd, zone, ds, dim) {
    const L = zone.to - zone.from;
    for (const p of crowd) {
      const r = p.r;
      if (zone.kind === 'precess') {
        p.r = rotate(r, [0, 0, 1], (zone.angle / L) * ds * (1 + (zone.spread || 0) * p.w));
      } else if (zone.kind === 'dephase') {
        if (dim === 3) {
          // 3 次元：ランダムな z 軸まわりのキック（量子軌道法）。平均の横成分は e^{-γs} で減衰
          p.r = rotate(r, [0, 0, 1], Math.sqrt(2 * zone.gamma * ds) * gauss());
        } else {
          // 2 次元：面から出ないよう、一人ずつ横成分を決定論的に縮める（数直線へ押しつぶされる）
          const f = Math.exp(-zone.gamma * ds);
          p.r = [r[0] * f, r[1] * f, r[2]];
        }
      } else if (zone.kind === 'damp') {
        // 振幅減衰：z → 1 − (1 − z)e^{-γs}、横成分 × e^{-γs/2}
        const f = Math.exp(-zone.gamma * ds), h = Math.exp(-zone.gamma * ds / 2);
        p.r = [r[0] * h, r[1] * h, 1 - (1 - r[2]) * f];
      } else if (zone.kind === 'bitflip') {
        // ビット反転：確率 γ ds で X。平均の z は e^{-2γs} で減衰
        if (rand() < zone.gamma * ds) p.r = rotate(r, [1, 0, 0], PI);
      }
    }
  }

  // ---- ボス：軸 n での射影測定 ----
  function unit(n) { const l = Math.hypot(n[0], n[1], n[2]); return n.map((x) => x / l); }
  function measureAlong(crowd, n) {
    const u = unit(n);
    return crowd.map((p) => rand() < (1 + p.r[0] * u[0] + p.r[1] * u[1] + p.r[2] * u[2]) / 2);
  }
  // ダメージ = 当たり − はずれ = Σ_i σ_n の測定値。期待値は Σ_i r_i·n
  function expectedDamage(crowd, n) {
    const u = unit(n);
    return crowd.reduce((a, p) => a + p.r[0] * u[0] + p.r[1] * u[1] + p.r[2] * u[2], 0);
  }
  function damage(outcomes) { return outcomes.reduce((a, o) => a + (o ? 1 : -1), 0); }
  // スコア = ダメージ × 100 + そろい度ボーナス（向きの合い具合 0〜1000）
  function score(dmg, rMean, n) {
    const u = unit(n);
    const f = (1 + rMean[0] * u[0] + rMean[1] * u[1] + rMean[2] * u[2]) / 2;
    return Math.max(0, dmg) * 100 + Math.round(1000 * f);
  }
  // 通貨（ケット）：クリアで 20、必要ダメージを超えた分 1 につき 2
  function ketReward(dmg, hp) { return dmg >= hp ? 20 + 2 * (dmg - hp) : 0; }

  const Q = {
    setSeed, gauss, rotate, GATES, MAX_CROWD, makePerson, makeCrowd, bloch, meanBloch,
    applyGate, applyZone, measureAlong, expectedDamage, damage, score, ketReward, unit,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = Q;
  root.Q = Q;
})(typeof globalThis !== 'undefined' ? globalThis : this);
