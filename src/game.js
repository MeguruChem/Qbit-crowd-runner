// game.js — 描画とゲームループ（Canvas 2D）
(function () {
  'use strict';
  const Q = window.Q, LEVELS = window.LEVELS;
  const N = 60;
  const SPEED = 7;          // 距離単位 / 秒
  const VIEW = 55;          // 前方の可視距離
  const cv = document.getElementById('game');
  const ctx = cv.getContext('2d');
  let W = 0, H = 0, DPR = 1;

  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = cv.clientWidth; H = cv.clientHeight;
    cv.width = W * DPR; cv.height = H * DPR;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  }
  window.addEventListener('resize', resize);

  // ---- 状態 ----
  const G = {
    mode: 'title',          // title | run | measure | result
    levelIdx: 0, level: null, crowd: null,
    s: 0, lane: -1, laneX: -1,  // lane: -1 左 / +1 右
    gatesPassed: 0, flash: null, yaw: 0.6,
    measureT: 0, outcomes: null, rBefore: null, hits: 0, result: null,
    offsets: [], cleared: loadCleared(),
  };
  function loadCleared() { try { return JSON.parse(localStorage.getItem('qcr_cleared') || '[]'); } catch (e) { return []; } }
  function saveCleared() { try { localStorage.setItem('qcr_cleared', JSON.stringify(G.cleared)); } catch (e) { /* ignore */ } }

  function startLevel(i) {
    G.levelIdx = i; G.level = LEVELS[i];
    G.crowd = Q.makeCrowd(N);
    G.s = 0; G.lane = -1; G.laneX = -1; G.gatesPassed = 0; G.flash = null;
    G.outcomes = null; G.result = null; G.measureT = 0;
    G.offsets = G.crowd.map((_, k) => [((k % 10) - 4.5) * 0.09 + (Math.random() - 0.5) * 0.04, Math.floor(k / 10) * 0.07 + Math.random() * 0.03]);
    G.mode = 'run';
  }

  // ---- 入力 ----
  function setLane(d) { if (G.mode === 'run') G.lane = d; }
  window.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft' || e.key === 'a') setLane(-1);
    else if (e.key === 'ArrowRight' || e.key === 'd') setLane(1);
    else if (e.key === 'Enter' || e.key === ' ') onConfirm();
  });
  cv.addEventListener('pointerdown', (e) => {
    const r = cv.getBoundingClientRect();
    const x = e.clientX - r.left, y = e.clientY - r.top;
    if (G.mode === 'run') { setLane(x < W / 2 ? -1 : 1); return; }
    for (const b of buttons) if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) { b.fn(); return; }
  });
  function onConfirm() {
    if (G.mode === 'title') startLevel(firstUncleared());
    else if (G.mode === 'result') G.result.win && G.levelIdx < LEVELS.length - 1 ? startLevel(G.levelIdx + 1) : startLevel(G.levelIdx);
  }
  function firstUncleared() { for (let i = 0; i < LEVELS.length; i++) if (!G.cleared.includes(i)) return i; return 0; }
  let buttons = [];

  // ---- 更新 ----
  function update(dt) {
    G.yaw += dt * 0.15;
    if (G.mode === 'run') {
      G.laneX += (G.lane - G.laneX) * Math.min(1, dt * 10);
      const lv = G.level;
      const s0 = G.s, s1 = Math.min(lv.length, G.s + SPEED * dt);
      const laneName = G.laneX < 0 ? 'left' : 'right';
      // ゾーン（細かく刻んで積分）
      const steps = Math.max(1, Math.ceil((s1 - s0) / 0.1));
      for (let k = 0; k < steps; k++) {
        const a = s0 + (s1 - s0) * k / steps, b = s0 + (s1 - s0) * (k + 1) / steps;
        for (const z of lv.zones) {
          if (z.lane !== 'both' && z.lane !== laneName) continue;
          const lo = Math.max(a, z.from), hi = Math.min(b, z.to);
          if (hi > lo) Q.applyZone(G.crowd, z, hi - lo);
        }
      }
      // ゲート
      while (G.gatesPassed < lv.gates.length && lv.gates[G.gatesPassed].at <= s1) {
        const g = lv.gates[G.gatesPassed];
        const key = G.lane < 0 ? g.left : g.right;
        Q.applyGate(G.crowd, key);
        G.flash = { label: Q.GATES[key].label, t: 0.8 };
        G.gatesPassed++;
      }
      G.s = s1;
      if (G.s >= lv.length) beginMeasure();
    } else if (G.mode === 'measure') {
      G.measureT += dt;
      if (G.measureT > 2.2) finishMeasure();
    }
    if (G.flash) { G.flash.t -= dt; if (G.flash.t <= 0) G.flash = null; }
  }
  function beginMeasure() {
    const n = G.level.boss.axis;
    G.rBefore = Q.meanBloch(G.crowd);
    G.startVecs = G.crowd.map(Q.bloch);
    G.outcomes = Q.measureAlong(G.crowd, n);
    G.hits = G.outcomes.filter(Boolean).length;
    G.measureT = 0; G.mode = 'measure';
  }
  function finishMeasure() {
    const lv = G.level;
    const win = G.hits >= lv.boss.hp;
    const sc = Q.score(G.hits, G.rBefore, lv.boss.axis);
    G.result = { win, score: sc };
    if (win && !G.cleared.includes(G.levelIdx)) { G.cleared.push(G.levelIdx); saveCleared(); }
    G.mode = 'result';
  }

  // ---- ブロッホ球の投影 ----
  const PITCH = 0.38;
  function proj(v, cx, cy, R) {
    const cy_ = Math.cos(G.yaw), sy = Math.sin(G.yaw);
    const x1 = v[0] * cy_ - v[1] * sy, y1 = v[0] * sy + v[1] * cy_;
    const cp = Math.cos(PITCH), sp = Math.sin(PITCH);
    const up = y1 * sp + v[2] * cp;
    const depth = -y1 * cp + v[2] * sp;   // 正なら手前
    return [cx + x1 * R, cy - up * R, depth];
  }
  function zColor(z, alpha) {
    const t = (1 - z) / 2; // 0: |0⟩ 青, 1: |1⟩ 赤
    const r = Math.round(55 + t * (226 - 55)), g = Math.round(138 + t * (75 - 138)), b = Math.round(221 + t * (74 - 221));
    return `rgba(${r},${g},${b},${alpha})`;
  }

  function drawSphere(cx, cy, R, vecs) {
    // 外周
    ctx.strokeStyle = 'rgba(160,160,170,0.6)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.stroke();
    // 赤道・子午線
    const circle = (f) => {
      let prev = null;
      for (let k = 0; k <= 72; k++) {
        const t = k / 72 * Math.PI * 2;
        const p = proj(f(t), cx, cy, R);
        if (prev) {
          ctx.strokeStyle = p[2] >= 0 ? 'rgba(160,160,170,0.55)' : 'rgba(160,160,170,0.18)';
          ctx.beginPath(); ctx.moveTo(prev[0], prev[1]); ctx.lineTo(p[0], p[1]); ctx.stroke();
        }
        prev = p;
      }
    };
    circle((t) => [Math.cos(t), Math.sin(t), 0]);
    circle((t) => [Math.cos(t), 0, Math.sin(t)]);
    // 軸ラベル
    const labels = [[[0, 0, 1], '|0⟩'], [[0, 0, -1], '|1⟩'], [[1, 0, 0], '|+⟩'], [[-1, 0, 0], '|−⟩'], [[0, 1, 0], '|+i⟩'], [[0, -1, 0], '|−i⟩']];
    ctx.font = '12px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const [v, s] of labels) {
      const p = proj(v.map((x) => x * 1.18), cx, cy, R);
      ctx.fillStyle = p[2] >= 0 ? 'rgba(220,220,230,0.9)' : 'rgba(220,220,230,0.35)';
      ctx.fillText(s, p[0], p[1]);
    }
    // ボスの的
    const n = G.level.boss.axis;
    const tp = proj(n, cx, cy, R);
    ctx.strokeStyle = 'rgba(239,159,39,0.95)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(tp[0], tp[1], 10 + 2 * Math.sin(performance.now() / 200), 0, Math.PI * 2); ctx.stroke();
    // 人（奥から描く）
    const pts = vecs.map((v, i) => [proj(v, cx, cy, R), v, i]).sort((a, b) => a[0][2] - b[0][2]);
    for (const [p, v] of pts) {
      ctx.fillStyle = zColor(v[2], p[2] >= 0 ? 0.95 : 0.35);
      ctx.beginPath(); ctx.arc(p[0], p[1], p[2] >= 0 ? 4 : 3, 0, Math.PI * 2); ctx.fill();
    }
    // 旗（平均ベクトル）
    const r = vecs.reduce((acc, v) => [acc[0] + v[0], acc[1] + v[1], acc[2] + v[2]], [0, 0, 0]).map((x) => x / vecs.length);
    const o = proj([0, 0, 0], cx, cy, R), e = proj(r, cx, cy, R);
    ctx.strokeStyle = '#f2f2f5'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(o[0], o[1]); ctx.lineTo(e[0], e[1]); ctx.stroke();
    ctx.fillStyle = '#f2f2f5'; ctx.beginPath(); ctx.arc(e[0], e[1], 5, 0, Math.PI * 2); ctx.fill();
    return r;
  }

  // ---- 道路 ----
  function roadGeom() {
    const top = 70, bottom = H * 0.5, cx = W / 2;
    const half = Math.min(W * 0.42, 220);
    return { top, bottom, cx, half };
  }
  function roadPt(d, laneOff, g) {
    const f = 9;
    const sc = f / (d + f);
    const horizonY = g.top;
    const y = horizonY + (g.bottom - horizonY) * sc;
    const x = g.cx + laneOff * g.half * sc;
    return [x, y, sc];
  }
  function drawRoad() {
    const g = roadGeom(), lv = G.level;
    // 路面
    const a = roadPt(VIEW, -1, g), b = roadPt(VIEW, 1, g), c = roadPt(0, 1, g), d = roadPt(0, -1, g);
    ctx.fillStyle = '#2a2a33';
    ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.lineTo(c[0], c[1]); ctx.lineTo(d[0], d[1]); ctx.closePath(); ctx.fill();
    // ゾーン
    const zoneColor = { precess: 'rgba(127,119,221,0.35)', dephase: 'rgba(216,90,48,0.35)', damp: 'rgba(55,138,221,0.35)' };
    const zoneName = { precess: '磁場', dephase: '位相ノイズ', damp: '減衰' };
    for (const z of lv.zones) {
      const d1 = Math.max(0, z.from - G.s), d2 = Math.min(VIEW, z.to - G.s);
      if (d2 <= d1) continue;
      const lanes = z.lane === 'both' ? [[-1, 1]] : z.lane === 'left' ? [[-1, 0]] : [[0, 1]];
      for (const [l0, l1] of lanes) {
        const p1 = roadPt(d2, l0, g), p2 = roadPt(d2, l1, g), p3 = roadPt(d1, l1, g), p4 = roadPt(d1, l0, g);
        ctx.fillStyle = zoneColor[z.kind];
        ctx.beginPath(); ctx.moveTo(p1[0], p1[1]); ctx.lineTo(p2[0], p2[1]); ctx.lineTo(p3[0], p3[1]); ctx.lineTo(p4[0], p4[1]); ctx.closePath(); ctx.fill();
        const m = roadPt((d1 + d2) / 2, (l0 + l1) / 2, g);
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.font = `${Math.max(10, 16 * m[2])}px system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(zoneName[z.kind], m[0], m[1]);
      }
    }
    // 中央線
    ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.setLineDash([6, 8]); ctx.lineWidth = 1.5;
    const m1 = roadPt(VIEW, 0, g), m2 = roadPt(0, 0, g);
    ctx.beginPath(); ctx.moveTo(m1[0], m1[1]); ctx.lineTo(m2[0], m2[1]); ctx.stroke(); ctx.setLineDash([]);
    // ゲート（奥から）
    const gs = lv.gates.slice(G.gatesPassed).filter((x) => x.at - G.s < VIEW).reverse();
    for (const gt of gs) {
      const dist = gt.at - G.s;
      for (const side of [-1, 1]) {
        const key = side < 0 ? gt.left : gt.right;
        const l = roadPt(dist, side < 0 ? -0.95 : 0.05, g), r = roadPt(dist, side < 0 ? -0.05 : 0.95, g);
        const h = 70 * l[2];
        const special = Q.GATES[key].special || key === 'I';
        ctx.fillStyle = special ? 'rgba(186,117,23,0.55)' : 'rgba(29,158,117,0.55)';
        ctx.strokeStyle = special ? 'rgba(239,159,39,0.95)' : 'rgba(93,202,165,0.95)';
        ctx.lineWidth = 2;
        ctx.fillRect(l[0], l[1] - h, r[0] - l[0], h); ctx.strokeRect(l[0], l[1] - h, r[0] - l[0], h);
        ctx.fillStyle = '#fff'; ctx.font = `${Math.max(10, 30 * l[2])}px system-ui, sans-serif`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(Q.GATES[key].label, (l[0] + r[0]) / 2, l[1] - h / 2);
      }
    }
    // ボス（終点）
    const bd = lv.length - G.s;
    if (bd < VIEW) {
      const p = roadPt(bd, 0, g);
      const sz = 90 * p[2];
      ctx.fillStyle = 'rgba(239,159,39,0.9)';
      ctx.beginPath(); ctx.arc(p[0], p[1] - sz * 0.6, sz * 0.5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#412402'; ctx.font = `${Math.max(10, 22 * p[2])}px system-ui, sans-serif`;
      ctx.textAlign = 'center'; ctx.fillText(lv.boss.label, p[0], p[1] - sz * 0.6);
    }
    // 群衆（手前）
    const vecs = G.crowd.map(Q.bloch);
    for (let k = 0; k < G.crowd.length; k++) {
      const [ox, oy] = G.offsets[k];
      const p = roadPt(1.2 + oy * 8, G.laneX * 0.5 + ox, g);
      ctx.fillStyle = zColor(vecs[k][2], 0.95);
      ctx.beginPath(); ctx.arc(p[0], p[1] - 4, 3.5, 0, Math.PI * 2); ctx.fill();
    }
  }

  function drawHUD() {
    const lv = G.level;
    ctx.fillStyle = 'rgba(240,240,245,0.95)'; ctx.font = '15px system-ui, sans-serif';
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText(lv.name, 14, 12);
    ctx.font = '12px system-ui, sans-serif'; ctx.fillStyle = 'rgba(220,220,230,0.8)';
    ctx.fillText(`ボス: ${lv.boss.label} 方向で ${lv.boss.hp} 人以上`, 14, 34);
    // 進捗
    ctx.fillStyle = 'rgba(255,255,255,0.15)'; ctx.fillRect(14, 54, W - 28, 4);
    ctx.fillStyle = 'rgba(239,159,39,0.9)'; ctx.fillRect(14, 54, (W - 28) * G.s / lv.length, 4);
  }

  function wrapText(text, x, y, maxW, lh) {
    let line = '';
    for (const ch of text) {
      if (ctx.measureText(line + ch).width > maxW) { ctx.fillText(line, x, y); y += lh; line = ch; } else line += ch;
    }
    if (line) ctx.fillText(line, x, y);
    return y + lh;
  }
  function button(label, x, y, w, h, fn, primary) {
    ctx.fillStyle = primary ? 'rgba(29,158,117,0.9)' : 'rgba(255,255,255,0.12)';
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = '#fff'; ctx.font = '15px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(label, x + w / 2, y + h / 2);
    buttons.push({ x, y, w, h, fn });
  }

  function drawTitle() {
    ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.font = '26px system-ui, sans-serif'; ctx.fillText('量子ビット群衆ランナー', W / 2, H * 0.12);
    ctx.font = '13px system-ui, sans-serif'; ctx.fillStyle = 'rgba(220,220,230,0.85)';
    wrapText('60 人の群衆はそれぞれ量子ビット。ゲートで向きを変え、ノイズを避け、最後にボスの方向で観測されます。←→ キーか画面の左右タップでレーン変更。', W / 2, H * 0.12 + 44, Math.min(W - 40, 420), 20);
    const bw = Math.min(W - 60, 300), bx = (W - bw) / 2;
    LEVELS.forEach((lv, i) => {
      const done = G.cleared.includes(i) ? '  ✓' : '';
      button(lv.name + done, bx, H * 0.36 + i * 56, bw, 44, () => startLevel(i), i === firstUncleared());
    });
  }

  function drawResult() {
    const lv = G.level, r = G.result;
    ctx.fillStyle = 'rgba(10,10,14,0.72)'; ctx.fillRect(0, H * 0.18, W, H * 0.36);
    ctx.fillStyle = r.win ? '#5DCAA5' : '#F0997B'; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.font = '28px system-ui, sans-serif'; ctx.fillText(r.win ? 'クリア！' : 'ざんねん…', W / 2, H * 0.2);
    ctx.fillStyle = '#fff'; ctx.font = '15px system-ui, sans-serif';
    ctx.fillText(`${lv.boss.label} に出た人数  ${G.hits} / ${N}（必要 ${lv.boss.hp}）`, W / 2, H * 0.2 + 44);
    const len = Math.hypot(...G.rBefore);
    ctx.fillText(`そろい度 ${(len * 100).toFixed(0)}%   スコア ${r.score}`, W / 2, H * 0.2 + 68);
    const bw = Math.min(140, (W - 60) / 3), gap = 10, total = bw * 3 + gap * 2, bx = (W - total) / 2, by = H * 0.2 + 100;
    button('もう一度', bx, by, bw, 40, () => startLevel(G.levelIdx), !r.win);
    button('次へ', bx + bw + gap, by, bw, 40, () => startLevel(Math.min(LEVELS.length - 1, G.levelIdx + 1)), r.win);
    button('タイトル', bx + 2 * (bw + gap), by, bw, 40, () => { G.mode = 'title'; }, false);
  }

  function drawFlash() {
    if (!G.flash) return;
    ctx.globalAlpha = Math.min(1, G.flash.t / 0.4);
    ctx.fillStyle = '#fff'; ctx.font = '34px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(G.flash.label, W / 2, H * 0.3);
    ctx.globalAlpha = 1;
  }

  function measureVecs() {
    const n = G.level.boss.axis, len = Math.hypot(...n), u = n.map((x) => x / len);
    const t = Math.min(1, G.measureT / 1.2), e = t * t * (3 - 2 * t);
    return G.startVecs.map((v, i) => {
      const tgt = G.outcomes[i] ? u : u.map((x) => -x);
      let w = [v[0] + (tgt[0] - v[0]) * e, v[1] + (tgt[1] - v[1]) * e, v[2] + (tgt[2] - v[2]) * e];
      const l = Math.hypot(...w);
      return l > 1e-6 ? w.map((x) => x / l) : tgt;
    });
  }

  function draw() {
    buttons = [];
    ctx.fillStyle = '#16161c'; ctx.fillRect(0, 0, W, H);
    if (G.mode === 'title') { drawTitle(); return; }
    drawRoad();
    drawHUD();
    const R = Math.min(W * 0.36, H * 0.2);
    const vecs = G.mode === 'run' ? G.crowd.map(Q.bloch) : measureVecs();
    const r = drawSphere(W / 2, H * 0.5 + R + 40, R, vecs);
    // そろい度バー
    const len = Math.hypot(...r);
    ctx.fillStyle = 'rgba(220,220,230,0.8)'; ctx.font = '12px system-ui, sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText('そろい度', 14, H - 22);
    ctx.fillStyle = 'rgba(255,255,255,0.15)'; ctx.fillRect(70, H - 27, W - 90, 10);
    ctx.fillStyle = '#5DCAA5'; ctx.fillRect(70, H - 27, (W - 90) * len, 10);
    if (G.mode === 'run') {
      ctx.fillStyle = 'rgba(220,220,230,0.7)'; ctx.font = '12px system-ui, sans-serif'; ctx.textAlign = 'center';
      if (G.s < 12) wrapText(G.level.hint, W / 2, H * 0.5 + 14, W - 40, 16);
    }
    if (G.mode === 'measure') {
      const shown = Math.min(G.hits, Math.floor(G.hits * Math.max(0, G.measureT - 1.2) / 0.8));
      ctx.fillStyle = '#EF9F27'; ctx.font = '30px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(`観測！  ${shown}`, W / 2, H * 0.3);
    }
    drawFlash();
    if (G.mode === 'result') drawResult();
  }

  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    update(dt); draw();
    requestAnimationFrame(frame);
  }
  resize();
  requestAnimationFrame(frame);
})();
