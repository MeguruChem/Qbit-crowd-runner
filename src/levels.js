// levels.js — 章とステージ定義
// gates: 位置 at で左右どちらかを通過。zones: [from, to) で lane ('left'|'right'|'both') にいる間作用。
// start: 'zero'（全員 |0⟩）| 'one'（全員 |1⟩）| 'mixed'（−1〜+1 にばらばら）
(function (root) {
  'use strict';
  const PI = Math.PI, SQ = Math.SQRT1_2;

  const CHAPTERS = [
    {
      dim: 1, title: '第1章  数直線',
      intro: '一人ひとりは −1〜+1 の数直線のどこかにいます。+1 が |0⟩、−1 が |1⟩。ボスの前で全員が +1 か −1 のどちらかに決まり、+1 に近い人ほど +1 が出やすくなります。',
    },
    {
      dim: 2, title: '第2章  円',
      intro: '数直線が円の縦の直径になりました。円の上では横向き（右が |+⟩、左が |−⟩）にもなれます。横向きの人は数直線で見ると 0 ですが、ボスが横向きなら全員が当たります。',
    },
    {
      dim: 3, title: '第3章  球',
      intro: '円が球になりました。奥行きの方向（|+i⟩, |−i⟩）と、縦軸まわりの回転（位相）が加わります。球はゆっくり回っているので、旗と的の向きを見比べてください。',
    },
  ];

  const LEVELS = [
    // ---------- 第1章：数直線 ----------
    {
      ch: 0, name: '1-1  はじめての反転', dim: 1, start: 'zero', length: 70,
      hint: '全員 +1（|0⟩）からスタート。ボスは −1（|1⟩）側。',
      gates: [{ at: 22, left: 'X', right: 'I' }],
      zones: [{ from: 35, to: 58, lane: 'right', kind: 'damp', gamma: 0.1 }],
      boss: { axis: [0, 0, -1], label: '|1⟩', hp: 48 },
    },
    {
      ch: 0, name: '1-2  冷やしてそろえる', dim: 1, start: 'mixed', length: 85,
      hint: '群衆が −1〜+1 にばらけています。ボスは +1（|0⟩）側。',
      gates: [{ at: 55, left: 'X', right: 'I' }],
      zones: [
        { from: 12, to: 42, lane: 'left', kind: 'damp', gamma: 0.12 },
        { from: 12, to: 42, lane: 'right', kind: 'bitflip', gamma: 0.05 },
        { from: 64, to: 80, lane: 'left', kind: 'bitflip', gamma: 0.06 },
      ],
      boss: { axis: [0, 0, 1], label: '|0⟩', hp: 50 },
    },
    {
      ch: 0, name: '1-3  反転は何回？', dim: 1, start: 'zero', length: 80,
      hint: 'X を 2 回くぐると元に戻ります。ボスは −1（|1⟩）側。',
      gates: [
        { at: 15, left: 'X', right: 'I' },
        { at: 38, left: 'I', right: 'X' },
        { at: 60, left: 'X', right: 'I' },
      ],
      zones: [
        { from: 22, to: 32, lane: 'right', kind: 'bitflip', gamma: 0.06 },
        { from: 45, to: 54, lane: 'left', kind: 'bitflip', gamma: 0.06 },
      ],
      boss: { axis: [0, 0, -1], label: '|1⟩', hp: 48 },
    },
    // ---------- 第2章：円（XZ 面） ----------
    {
      ch: 1, name: '2-1  横を向く', dim: 2, start: 'zero', length: 80,
      hint: 'ボスは右向き（|+⟩）。H は縦と横を入れ替えます。',
      gates: [{ at: 18, left: 'H', right: 'X' }, { at: 62, left: 'Z', right: 'I' }],
      zones: [{ from: 32, to: 54, lane: 'left', kind: 'dephase', gamma: 0.08 }],
      boss: { axis: [1, 0, 0], label: '|+⟩', hp: 48 },
    },
    {
      ch: 1, name: '2-2  Z の正体', dim: 2, start: 'zero', length: 80,
      hint: '数直線では何もしなかった Z が、円では働きます。ボスは左向き（|−⟩）。',
      gates: [{ at: 15, left: 'H', right: 'Z' }, { at: 58, left: 'Z', right: 'X' }],
      zones: [
        { from: 25, to: 45, lane: 'left', kind: 'dephase', gamma: 0.07 },
        { from: 25, to: 45, lane: 'right', kind: 'damp', gamma: 0.03 },
      ],
      boss: { axis: [-1, 0, 0], label: '|−⟩', hp: 46 },
    },
    {
      ch: 1, name: '2-3  かたむける', dim: 2, start: 'zero', length: 80,
      hint: 'Ry は円の上を回します（＋で時計回り）。ボスは右上 45° の向き。',
      gates: [{ at: 15, left: 'Ry90', right: 'Rym90' }, { at: 58, left: 'Ry45', right: 'Rym45' }],
      zones: [{ from: 25, to: 47, lane: 'left', kind: 'dephase', gamma: 0.06 }],
      boss: { axis: [SQ, 0, SQ], label: '右上45°', hp: 48 },
    },
    {
      ch: 1, name: '2-4  ノイズにも向きがある', dim: 2, start: 'one', length: 75,
      hint: 'ビット反転は縦向きの人を、位相ノイズは横向きの人を崩します。ボスは |+⟩。',
      gates: [{ at: 14, left: 'Y', right: 'H' }, { at: 52, left: 'H', right: 'Y' }],
      zones: [
        { from: 24, to: 40, lane: 'left', kind: 'bitflip', gamma: 0.06 },
        { from: 24, to: 40, lane: 'right', kind: 'dephase', gamma: 0.06 },
      ],
      boss: { axis: [1, 0, 0], label: '|+⟩', hp: 50 },
    },
    {
      ch: 1, name: '2-5  冷やしてから回す', dim: 2, start: 'mixed', length: 85,
      hint: 'ばらけた群衆は、回しても横向きにそろいません。ボスは |+⟩。',
      gates: [{ at: 50, left: 'H', right: 'X' }],
      zones: [
        { from: 10, to: 40, lane: 'left', kind: 'damp', gamma: 0.12 },
        { from: 10, to: 40, lane: 'right', kind: 'bitflip', gamma: 0.04 },
        { from: 60, to: 78, lane: 'right', kind: 'dephase', gamma: 0.08 },
      ],
      boss: { axis: [1, 0, 0], label: '|+⟩', hp: 45 },
    },
    // ---------- 第3章：球 ----------
    {
      ch: 2, name: '3-1  奥行きの向き', dim: 3, start: 'zero', length: 80,
      hint: 'S は縦軸まわりに 90° 回します。ボスは奥向き（|+i⟩）。',
      gates: [{ at: 15, left: 'H', right: 'X' }, { at: 45, left: 'S', right: 'Z' }],
      zones: [{ from: 55, to: 72, lane: 'left', kind: 'dephase', gamma: 0.06 }],
      boss: { axis: [0, 1, 0], label: '|+i⟩', hp: 48 },
    },
    {
      ch: 2, name: '3-2  位相をそろえる', dim: 3, start: 'zero', length: 110,
      hint: '磁場ゾーンで群衆は縦軸まわりに 90° 回ります。最後は |+⟩ へ。',
      gates: [{ at: 15, left: 'H', right: 'Rx90' }, { at: 68, left: 'S', right: 'Sdg' }],
      zones: [
        { from: 28, to: 58, lane: 'both', kind: 'precess', angle: PI / 2, spread: 0.08 },
        { from: 78, to: 100, lane: 'right', kind: 'dephase', gamma: 0.07 },
      ],
      boss: { axis: [1, 0, 0], label: '|+⟩', hp: 48 },
    },
    {
      ch: 2, name: '3-3  スピンエコー', dim: 3, start: 'zero', length: 125,
      hint: '磁場ゾーンで群衆が扇状にバラけます。もう一度同じゾーンを通る前に、何を挟めば戻る？',
      gates: [{ at: 12, left: 'H', right: 'T' }, { at: 60, left: 'Z', right: 'X' }],
      zones: [
        { from: 22, to: 52, lane: 'both', kind: 'precess', angle: PI, spread: 0.6 },
        { from: 70, to: 100, lane: 'both', kind: 'precess', angle: PI, spread: 0.6 },
        { from: 105, to: 120, lane: 'left', kind: 'dephase', gamma: 0.08 },
      ],
      boss: { axis: [1, 0, 0], label: '|+⟩', hp: 45 },
    },
    {
      ch: 2, name: '3-4  観測の誘惑', dim: 3, start: 'zero', length: 120,
      hint: '「観測」は群衆を縦の両端へ収縮させます。ボスは |−i⟩。',
      gates: [
        { at: 14, left: 'Rx90', right: 'H' },
        { at: 45, left: 'M', right: 'I' },
        { at: 80, left: 'Z', right: 'S' },
      ],
      zones: [
        { from: 55, to: 72, lane: 'right', kind: 'dephase', gamma: 0.05 },
        { from: 55, to: 72, lane: 'left', kind: 'damp', gamma: 0.05 },
        { from: 90, to: 112, lane: 'both', kind: 'precess', angle: PI / 2, spread: 0.05 },
      ],
      boss: { axis: [0, -1, 0], label: '|−i⟩', hp: 45 },
    },
  ];

  // ゲート・ゾーンの説明（次元によって見え方が変わるものは分ける）
  function gateDesc(key, dim) {
    const D = {
      I: '何もしない',
      X: dim === 1 ? '上下をひっくり返す（+1 ⇔ −1）' : '上下をひっくり返す（|0⟩ ⇔ |1⟩）',
      Z: dim === 1 ? '数直線の上では何も起きない' : '左右をひっくり返す（|+⟩ ⇔ |−⟩）',
      H: '斜め 45° の線で折り返す（縦 ⇔ 横）',
      Y: dim === 2 ? '中心で反対側へ（180° 回転）' : '縦横の両方をひっくり返す（y 軸まわり 180°）',
      Ry90: '円の上を時計回りに 90°', Rym90: '円の上を反時計回りに 90°',
      Ry45: '円の上を時計回りに 45°', Rym45: '円の上を反時計回りに 45°',
      S: '縦軸まわりに 90°（右向き → 奥向き）', Sdg: '縦軸まわりに −90°（奥向き → 右向き）',
      T: '縦軸まわりに 45°', Rx90: 'x 軸まわりに 90°（上向き → 手前向き）',
      M: '観測：全員を上か下の端に決めてしまう',
    };
    return D[key];
  }
  function zoneDesc(kind, dim) {
    return {
      damp: '減衰：全員がゆっくり +1（|0⟩）へ引き寄せられる',
      bitflip: 'ビット反転ノイズ：ときどき上下が入れ替わる',
      dephase: dim === 3 ? '位相ノイズ：縦軸まわりにバラバラに散る' : '位相ノイズ：横向きの成分がしぼみ、数直線へ押しつぶされる',
      precess: '磁場：縦軸まわりに回り続ける（速さは人ごとに少し違う）',
    }[kind];
  }

  const api = { CHAPTERS, LEVELS, gateDesc, zoneDesc };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  Object.assign(root, api);
})(typeof globalThis !== 'undefined' ? globalThis : this);
