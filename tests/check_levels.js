// 全ステージについて、レーン選択の全組み合わせを総当たりし、
// 期待ダメージ Σ r_i·n（当たり − はずれ） を計算する。正解ルートが HP を超え、
// 誤ルートの多くが HP 未満になることを確認する。
// 使い方: node tests/check_levels.js
const Q = require('../src/qcore.js');
const { LEVELS } = require('../src/levels.js');
const N = 60;

function simulate(lv, choice, seed) {
  Q.setSeed(seed);
  const crowd = Q.makeCrowd(N, lv.start);
  const spans = [...new Set(lv.zones.filter((z) => z.lane !== 'both').map((z) => z.from + ':' + z.to))];
  const ds = 0.1;
  let gi = 0, maxOff = 0;
  for (let s = 0; s < lv.length - 1e-9; s += ds) {
    const s1 = s + ds;
    for (const z of lv.zones) {
      if (z.lane !== 'both' && z.lane !== choice.zones[spans.indexOf(z.from + ':' + z.to)]) continue;
      const lo = Math.max(s, z.from), hi = Math.min(s1, z.to);
      if (hi > lo) Q.applyZone(crowd, z, hi - lo, lv.dim);
    }
    while (gi < lv.gates.length && lv.gates[gi].at <= s1) {
      const g = lv.gates[gi];
      Q.applyGate(crowd, choice.gates[gi] === 'left' ? g.left : g.right);
      gi++;
    }
    // 次元の制約チェック（1D: x=y=0、2D: y=0）
    for (const p of crowd) {
      if (lv.dim === 1) maxOff = Math.max(maxOff, Math.abs(p.r[0]), Math.abs(p.r[1]));
      if (lv.dim === 2) maxOff = Math.max(maxOff, Math.abs(p.r[1]));
    }
  }
  return { exp: Q.expectedDamage(crowd, lv.boss.axis), r: Q.meanBloch(crowd), maxOff };
}

let ok = true;
for (const lv of LEVELS) {
  const nG = lv.gates.length;
  const nZ = new Set(lv.zones.filter((z) => z.lane !== 'both').map((z) => z.from + ':' + z.to)).size;
  const rows = [];
  let maxOff = 0;
  for (let m = 0; m < 1 << (nG + nZ); m++) {
    const bits = [...Array(nG + nZ)].map((_, k) => ((m >> k) & 1 ? 'right' : 'left'));
    const choice = { gates: bits.slice(0, nG), zones: bits.slice(nG) };
    let e = 0, rl = 0;
    for (let sd = 1; sd <= 5; sd++) {
      const r = simulate(lv, choice, sd);
      e += r.exp / 5; rl += Math.hypot(...r.r) / 5; maxOff = Math.max(maxOff, r.maxOff);
    }
    rows.push({ path: bits.map((b) => (b === 'left' ? 'L' : 'R')).join(''), exp: e, purity: rl });
  }
  rows.sort((a, b) => b.exp - a.exp);
  const winners = rows.filter((r) => r.exp >= lv.boss.hp);
  console.log(`\n${lv.name}  (${lv.dim}D, HP ${lv.boss.hp}, ゲート${nG}+ゾーン${nZ})`);
  rows.slice(0, 3).forEach((r) => console.log(`  ${r.path}  期待 ${r.exp.toFixed(1)}  そろい度 ${(r.purity * 100).toFixed(0)}%`));
  console.log(`  … 最下位 ${rows[rows.length - 1].path} 期待 ${rows[rows.length - 1].exp.toFixed(1)}   HP 超え ${winners.length}/${rows.length}`);
  if (maxOff > 1e-9) { ok = false; console.log(`  !! ${lv.dim} 次元からはみ出し (${maxOff.toExponential(2)})`); }
  if (winners.length === 0 || winners.length > rows.length / 2) { ok = false; console.log('  !! 難易度要調整'); }
}
process.exit(ok ? 0 : 1);
