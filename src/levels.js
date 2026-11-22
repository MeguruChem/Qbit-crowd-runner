// levels.js — ステージ定義
// 距離 s に沿って並ぶ。gates: その位置で左右どちらかのゲートを通過。
// zones: [from, to) の区間で lane ('left' | 'right' | 'both') にいる間作用。
(function (root) {
  'use strict';
  const PI = Math.PI;
  const LEVELS = [
    {
      name: 'ステージ1  はじめての反転',
      hint: '|0⟩ の群衆を |1⟩（南極）へ。右の減衰ゾーンは |0⟩ に引き戻されます。',
      length: 90,
      gates: [
        { at: 20, left: 'X', right: 'H' },
        { at: 70, left: 'Z', right: 'Y' },
      ],
      zones: [
        { from: 35, to: 58, lane: 'right', kind: 'damp', gamma: 0.08 },
        { from: 35, to: 58, lane: 'left', kind: 'precess', angle: PI, spread: 0.1 },
      ],
      boss: { axis: [0, 0, -1], label: '|1⟩', hp: 48 },
    },
    {
      name: 'ステージ2  位相をそろえる',
      hint: '磁場ゾーンで群衆は z 軸まわりに 90° 回ります。最後は |+⟩（+x）へ。',
      length: 110,
      gates: [
        { at: 15, left: 'H', right: 'Rx90' },
        { at: 68, left: 'S', right: 'Sdg' },
      ],
      zones: [
        { from: 28, to: 58, lane: 'both', kind: 'precess', angle: PI / 2, spread: 0.08 },
        { from: 78, to: 100, lane: 'right', kind: 'dephase', gamma: 0.07 },
      ],
      boss: { axis: [1, 0, 0], label: '|+⟩', hp: 48 },
    },
    {
      name: 'ステージ3  スピンエコー',
      hint: '磁場ゾーンで群衆が扇状にバラけます。もう一度同じゾーンを通る前に、何を挟めば戻る？',
      length: 125,
      gates: [
        { at: 12, left: 'H', right: 'T' },
        { at: 60, left: 'Z', right: 'X' },
      ],
      zones: [
        { from: 22, to: 52, lane: 'both', kind: 'precess', angle: PI, spread: 0.6 },
        { from: 70, to: 100, lane: 'both', kind: 'precess', angle: PI, spread: 0.6 },
        { from: 105, to: 120, lane: 'left', kind: 'dephase', gamma: 0.08 },
      ],
      boss: { axis: [1, 0, 0], label: '|+⟩', hp: 45 },
    },
    {
      name: 'ステージ4  観測の誘惑',
      hint: '「観測」は群衆を極へ収縮させます。ボスは |−i⟩（−y）。',
      length: 120,
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
  if (typeof module !== 'undefined' && module.exports) module.exports = LEVELS;
  root.LEVELS = LEVELS;
})(typeof globalThis !== 'undefined' ? globalThis : this);
