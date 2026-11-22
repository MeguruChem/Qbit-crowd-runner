// 全ステージについて、レーン選択の全組み合わせを総当たりし、
// 期待攻撃人数（N(1+r·n)/2）を計算する。正解ルートが HP を超え、
// 多くの誤ルートが HP 未満になることを確認する。
// 使い方: node tests/check_levels.js
const Q = require('../src/qcore.js');
const LEVELS = require('../src/levels.js');
const N = 60;

function simulate(lv, choice, seed) {
  // choice: 決定点ごとの lane。決定点 = 各ゲート + 片側ゾーンの区間
  Q.setSeed(seed);
  const crowd = Q.makeCrowd(N);
  const events = [];
  lv.gates.forEach((g, i) => events.push({ s: g.at, type: 'gate', g, idx: i }));
  const sided = lv.zones.filter((z) => z.lane !== 'both');
  // 同じ区間の左右ゾーンは 1 つの決定点にまとめる
  const spans = [...new Set(sided.map((z) => z.from + ':' + z.to))];
  const ds = 0.1;
  let gi = 0;
  for (let s = 0; s < lv.length; s += ds) {
    const s1 = s + ds;
    for (const z of lv.zones) {
      let lane = 'both';
      if (z.lane !== 'both') lane = choice.zones[spans.indexOf(z.from + ':' + z.to)];
      if (z.lane !== 'both' && z.lane !== lane) continue;
      const lo = Math.max(s, z.from), hi = Math.min(s1, z.to);
      if (hi > lo) Q.applyZone(crowd, z, hi - lo);
    }
    while (gi < lv.gates.length && lv.gates[gi].at <= s1) {
      const g = lv.gates[gi];
      Q.applyGate(crowd, choice.gates[gi] === 'left' ? g.left : g.right);
      gi++;
    }
  }
  return { exp: Q.expectedHits(crowd, lv.boss.axis), r: Q.meanBloch(crowd) };
}

let ok = true;
LEVELS.forEach((lv, li) => {
  const nG = lv.gates.length;
  const spans = [...new Set(lv.zones.filter((z) => z.lane !== 'both').map((z) => z.from + ':' + z.to))];
  const nZ = spans.length;
  const rows = [];
  for (let m = 0; m < 1 << (nG + nZ); m++) {
    const bits = [...Array(nG + nZ)].map((_, k) => ((m >> k) & 1 ? 'right' : 'left'));
    const choice = { gates: bits.slice(0, nG), zones: bits.slice(nG) };
    // 乱数の影響を見るため 5 シード平均
    let e = 0, rl = 0;
    for (let sd = 1; sd <= 5; sd++) { const r = simulate(lv, choice, sd); e += r.exp / 5; rl += Math.hypot(...r.r) / 5; }
    rows.push({ path: bits.map((b) => (b === 'left' ? 'L' : 'R')).join(''), exp: e, purity: rl });
  }
  rows.sort((a, b) => b.exp - a.exp);
  const winners = rows.filter((r) => r.exp >= lv.boss.hp);
  console.log(`\n${lv.name}  (HP ${lv.boss.hp}, 決定点 ${nG + nZ})`);
  rows.slice(0, 4).forEach((r) => console.log(`  ${r.path}  期待 ${r.exp.toFixed(1)}  そろい度 ${(r.purity * 100).toFixed(0)}%`));
  console.log(`  … 最下位 ${rows[rows.length - 1].path} 期待 ${rows[rows.length - 1].exp.toFixed(1)}`);
  console.log(`  HP 超えルート: ${winners.length} / ${rows.length}`);
  if (winners.length === 0 || winners.length > rows.length / 2) { ok = false; console.log('  !! 難易度要調整'); }
});
process.exit(ok ? 0 : 1);
