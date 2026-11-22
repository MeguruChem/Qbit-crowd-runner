// game.js — 描画とゲームループ（Canvas 2D）
(function () {
  'use strict';
  const { Q, LEVELS, CHAPTERS, gateDesc, zoneDesc } = window;
  const N = 60;
  const SPEED = 7;          // 距離単位 / 秒
  const VIEW = 55;          // 前方の可視距離
  const cv = document.getElementById('game');
  const ctx = cv.getContext('2d');
  let W = 0, H = 0;
  const FONT = 'system-ui, -apple-system, "Hiragino Sans", "Noto Sans JP", sans-serif';
  const font = (px) => `${px}px ${FONT}`;

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = cv.clientWidth; H = cv.clientHeight;
    cv.width = W * dpr; cv.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  window.addEventListener('resize', resize);

  // ---- 状態 ----
  const G = {
    mode: 'title',          // title | intro | run | measure | result
    levelIdx: 0, level: null, crowd: null,
    s: 0, lane: -1, laneX: -1,
    gatesPassed: 0, flash: null, yaw: 0.6,
    measureT: 0, outcomes: null, rBefore: null, hits: 0, result: null,
    offsets: [], cleared: loadCleared(),
  };
  function loadCleared() { try { return JSON.parse(localStorage.getItem('qcr_cleared_v2') || '[]'); } catch (e) { return []; } }
  function saveCleared() { try { localStorage.setItem('qcr_cleared_v2', JSON.stringify(G.cleared)); } catch (e) { /* 保存できなくても続行 */ } }

  function prepareLevel(i) {
    G.levelIdx = i; G.level = LEVELS[i];
    G.crowd = Q.makeCrowd(N, G.level.start);
    G.s = 0; G.lane = -1; G.laneX = -1; G.gatesPassed = 0; G.flash = null;
    G.outcomes = null; G.result = null; G.measureT = 0;
    G.offsets = G.crowd.map((_, k) => [((k % 10) - 4.5) * 0.09 + (Math.random() - 0.5) * 0.04, Math.floor(k / 10) * 0.07 + Math.random() * 0.03]);
    G.mode = 'intro';
  }

  // このステージで初めて出てくる説明（次元で意味が変わるものは別扱い）
  function newThings(idx) {
    const seen = new Set();
    for (let i = 0; i < idx; i++) collect(LEVELS[i]).forEach((d) => seen.add(d.key));
    return collect(LEVELS[idx]).filter((d) => !seen.has(d.key));
  }
  function collect(lv) {
    const out = [], keys = new Set();
    const add = (key, name, text) => { if (!keys.has(key) && text) { keys.add(key); out.push({ key, name, text }); } };
    for (const g of lv.gates) for (const k of [g.left, g.right]) add(k + '@' + gateDesc(k, lv.dim), Q.GATES[k].label, gateDesc(k, lv.dim));
    const zn = { damp: '減衰', bitflip: 'ビット反転', dephase: '位相ノイズ', precess: '磁場' };
    for (const z of lv.zones) add(z.kind + '@' + zoneDesc(z.kind, lv.dim), zn[z.kind], zoneDesc(z.kind, lv.dim));
    return out;
  }

  // ---- 入力 ----
  function setLane(d) { if (G.mode === 'run') G.lane = d; }
  window.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft' || e.key === 'a') setLane(-1);
    else if (e.key === 'ArrowRight' || e.key === 'd') setLane(1);
    else if (e.key === 'Enter' || e.key === ' ') onConfirm();
    else if (e.key === 'Escape' && G.mode !== 'run') G.mode = 'title';
  });
  cv.addEventListener('pointerdown', (e) => {
    const r = cv.getBoundingClientRect();
    const x = e.clientX - r.left, y = e.clientY - r.top;
    if (G.mode === 'run') { setLane(x < W / 2 ? -1 : 1); return; }
    for (const b of buttons) if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) { b.fn(); return; }
  });
  function onConfirm() {
    if (G.mode === 'title') prepareLevel(firstUncleared());
    else if (G.mode === 'intro') G.mode = 'run';
    else if (G.mode === 'result') prepareLevel(G.result.win ? Math.min(LEVELS.length - 1, G.levelIdx + 1) : G.levelIdx);
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
      const steps = Math.max(1, Math.ceil((s1 - s0) / 0.1));
      for (let k = 0; k < steps; k++) {
        const a = s0 + (s1 - s0) * k / steps, b = s0 + (s1 - s0) * (k + 1) / steps;
        for (const z of lv.zones) {
          if (z.lane !== 'both' && z.lane !== laneName) continue;
          const lo = Math.max(a, z.from), hi = Math.min(b, z.to);
          if (hi > lo) Q.applyZone(G.crowd, z, hi - lo, lv.dim);
        }
      }
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
    G.result = { win, score: Q.score(G.hits, G.rBefore, lv.boss.axis) };
    if (win && !G.cleared.includes(G.levelIdx)) { G.cleared.push(G.levelIdx); saveCleared(); }
    G.mode = 'result';
  }

  // ---- 状態の表示（1D 数直線 / 2D 円 / 3D 球） ----
  const PITCH = 0.38;
  // 返り値 [screenX, screenY, depth]（depth ≥ 0 が手前）
  function proj(v, cx, cy, R, dim, jit) {
    if (dim === 1) return [cx + (jit || 0) * R * 0.42, cy - v[2] * R, 1];
    if (dim === 2) return [cx + v[0] * R, cy - v[2] * R, 1];
    const c = Math.cos(G.yaw), s = Math.sin(G.yaw);
    const x1 = v[0] * c - v[1] * s, y1 = v[0] * s + v[1] * c;
    const cp = Math.cos(PITCH), sp = Math.sin(PITCH);
    return [cx + x1 * R, cy - (y1 * sp + v[2] * cp) * R, -y1 * cp + v[2] * sp];
  }
  function zColor(z, alpha) {
    const t = (1 - z) / 2; // 0: |0⟩ 青, 1: |1⟩ 赤
    const r = Math.round(55 + t * 171), g = Math.round(138 - t * 63), b = Math.round(221 - t * 147);
    return `rgba(${r},${g},${b},${alpha})`;
  }
  const GUIDE = 'rgba(160,160,170,0.55)', GUIDE_FAINT = 'rgba(160,160,170,0.2)';
  function line(x1, y1, x2, y2, col, w) { ctx.strokeStyle = col; ctx.lineWidth = w || 1; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); }
  function label(text, x, y, alpha) {
    ctx.fillStyle = `rgba(220,220,230,${alpha == null ? 0.9 : alpha})`;
    ctx.font = font(12); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, x, y);
  }

  function drawGuides(cx, cy, R, dim) {
    if (dim === 1) {
      line(cx, cy - R, cx, cy + R, GUIDE, 1.5);
      for (const [z, t] of [[1, '+1  |0⟩'], [0, '0'], [-1, '−1  |1⟩']]) {
        line(cx - 8, cy - z * R, cx + 8, cy - z * R, GUIDE, 1.5);
        ctx.fillStyle = 'rgba(220,220,230,0.9)'; ctx.font = font(12); ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        ctx.fillText(t, cx + R * 0.5, cy - z * R);
      }
      return;
    }
    if (dim === 2) {
      ctx.strokeStyle = GUIDE; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.stroke();
      line(cx, cy - R, cx, cy + R, 'rgba(160,160,170,0.35)', 1.5);   // 数直線（第1章の名残）
      line(cx - R, cy, cx + R, cy, GUIDE_FAINT, 1);
      label('|0⟩', cx, cy - R - 14); label('|1⟩', cx, cy + R + 14);
      label('|+⟩', cx + R + 18, cy); label('|−⟩', cx - R - 18, cy);
      return;
    }
    ctx.strokeStyle = GUIDE; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.stroke();
    const circle = (f) => {
      let prev = null;
      for (let k = 0; k <= 72; k++) {
        const p = proj(f(k / 72 * Math.PI * 2), cx, cy, R, 3);
        if (prev) line(prev[0], prev[1], p[0], p[1], p[2] >= 0 ? GUIDE : GUIDE_FAINT, 1);
        prev = p;
      }
    };
    circle((t) => [Math.cos(t), Math.sin(t), 0]);
    circle((t) => [Math.cos(t), 0, Math.sin(t)]);
    const labels = [[[0, 0, 1], '|0⟩'], [[0, 0, -1], '|1⟩'], [[1, 0, 0], '|+⟩'], [[-1, 0, 0], '|−⟩'], [[0, 1, 0], '|+i⟩'], [[0, -1, 0], '|−i⟩']];
    for (const [v, s] of labels) {
      const p = proj(v.map((x) => x * 1.18), cx, cy, R, 3);
      label(s, p[0], p[1], p[2] >= 0 ? 0.9 : 0.35);
    }
  }

  function drawState(cx, cy, R, vecs) {
    const dim = G.level.dim;
    drawGuides(cx, cy, R, dim);
    // ボスの的
    const n = Q.unit(G.level.boss.axis);
    const tp = proj(n, cx, cy, R, dim, 0);
    ctx.strokeStyle = 'rgba(239,159,39,0.95)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(tp[0], tp[1], 11 + 2 * Math.sin(performance.now() / 200), 0, Math.PI * 2); ctx.stroke();
    // 人（奥から描く）
    // 同じ点に重なった人も群衆に見えるよう、2D/3D では数ピクセルだけ散らして描く
    const pts = vecs.map((v, i) => {
      const p = proj(v, cx, cy, R, dim, G.crowd[i].j);
      if (dim > 1) { p[0] += G.crowd[i].j * 6; p[1] += Math.max(-1, Math.min(1, G.crowd[i].w / 2)) * 6; }
      return [p, v];
    }).sort((a, b) => a[0][2] - b[0][2]);
    for (const [p, v] of pts) {
      const front = p[2] >= 0;
      ctx.fillStyle = zColor(v[2], front ? 0.95 : 0.35);
      ctx.beginPath(); ctx.arc(p[0], p[1], front ? 4 : 3, 0, Math.PI * 2); ctx.fill();
    }
    // 旗（群衆の平均）
    const r = vecs.reduce((a, v) => [a[0] + v[0], a[1] + v[1], a[2] + v[2]], [0, 0, 0]).map((x) => x / vecs.length);
    const o = proj([0, 0, 0], cx, cy, R, dim, 0), e = proj(r, cx, cy, R, dim, 0);
    if (dim === 1) { o[0] -= R * 0.62; e[0] -= R * 0.62; }   // 1D は数直線の左に旗を立てる
    line(o[0], o[1], e[0], e[1], '#f2f2f5', 3);
    ctx.fillStyle = '#f2f2f5'; ctx.beginPath(); ctx.arc(e[0], e[1], 5, 0, Math.PI * 2); ctx.fill();
    if (dim === 1) label('平均', o[0], cy + R + 16, 0.7);
    return r;
  }

  // ---- 道路 ----
  function roadGeom() { return { top: 70, bottom: H * 0.5, cx: W / 2, half: Math.min(W * 0.42, 220) }; }
  function roadPt(d, laneOff, g) {
    const sc = 9 / (d + 9);
    return [g.cx + laneOff * g.half * sc, g.top + (g.bottom - g.top) * sc, sc];
  }
  const ZONE_COLOR = { precess: 'rgba(127,119,221,0.35)', dephase: 'rgba(216,90,48,0.35)', damp: 'rgba(55,138,221,0.35)', bitflip: 'rgba(212,83,126,0.35)' };
  const ZONE_NAME = { precess: '磁場', dephase: '位相ノイズ', damp: '減衰', bitflip: 'ビット反転' };
  function quad(p1, p2, p3, p4, col) {
    ctx.fillStyle = col; ctx.beginPath();
    ctx.moveTo(p1[0], p1[1]); ctx.lineTo(p2[0], p2[1]); ctx.lineTo(p3[0], p3[1]); ctx.lineTo(p4[0], p4[1]); ctx.closePath(); ctx.fill();
  }
  function drawRoad() {
    const g = roadGeom(), lv = G.level;
    quad(roadPt(VIEW, -1, g), roadPt(VIEW, 1, g), roadPt(0, 1, g), roadPt(0, -1, g), '#2a2a33');
    for (const z of lv.zones) {
      const d1 = Math.max(0, z.from - G.s), d2 = Math.min(VIEW, z.to - G.s);
      if (d2 <= d1) continue;
      const [l0, l1] = z.lane === 'both' ? [-1, 1] : z.lane === 'left' ? [-1, 0] : [0, 1];
      quad(roadPt(d2, l0, g), roadPt(d2, l1, g), roadPt(d1, l1, g), roadPt(d1, l0, g), ZONE_COLOR[z.kind]);
      const m = roadPt((d1 + d2) / 2, (l0 + l1) / 2, g);
      ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.font = font(Math.max(10, 16 * m[2]));
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(ZONE_NAME[z.kind], m[0], m[1]);
    }
    ctx.setLineDash([6, 8]);
    const m1 = roadPt(VIEW, 0, g), m2 = roadPt(0, 0, g);
    line(m1[0], m1[1], m2[0], m2[1], 'rgba(255,255,255,0.35)', 1.5);
    ctx.setLineDash([]);
    const gs = lv.gates.slice(G.gatesPassed).filter((x) => x.at - G.s < VIEW).reverse();
    for (const gt of gs) {
      const dist = gt.at - G.s;
      for (const side of [-1, 1]) {
        const key = side < 0 ? gt.left : gt.right;
        const l = roadPt(dist, side < 0 ? -0.95 : 0.05, g), r = roadPt(dist, side < 0 ? -0.05 : 0.95, g);
        const h = 70 * l[2];
        const special = key === 'M' || key === 'I';
        ctx.fillStyle = special ? 'rgba(186,117,23,0.55)' : 'rgba(29,158,117,0.55)';
        ctx.strokeStyle = special ? 'rgba(239,159,39,0.95)' : 'rgba(93,202,165,0.95)';
        ctx.lineWidth = 2;
        ctx.fillRect(l[0], l[1] - h, r[0] - l[0], h); ctx.strokeRect(l[0], l[1] - h, r[0] - l[0], h);
        ctx.fillStyle = '#fff'; ctx.font = font(Math.max(10, 28 * l[2]));
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(Q.GATES[key].label, (l[0] + r[0]) / 2, l[1] - h / 2);
      }
    }
    const bd = lv.length - G.s;
    if (bd < VIEW) {
      const p = roadPt(bd, 0, g), sz = 90 * p[2];
      ctx.fillStyle = 'rgba(239,159,39,0.9)';
      ctx.beginPath(); ctx.arc(p[0], p[1] - sz * 0.6, sz * 0.5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#412402'; ctx.font = font(Math.max(10, 20 * p[2]));
      ctx.textAlign = 'center'; ctx.fillText(lv.boss.label, p[0], p[1] - sz * 0.6);
    }
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
    ctx.fillStyle = 'rgba(240,240,245,0.95)'; ctx.font = font(15);
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText(lv.name, 14, 12);
    ctx.font = font(12); ctx.fillStyle = 'rgba(220,220,230,0.8)';
    ctx.fillText(`ボス: ${lv.boss.label} の向きで ${lv.boss.hp} 人以上`, 14, 34);
    ctx.fillStyle = 'rgba(255,255,255,0.15)'; ctx.fillRect(14, 54, W - 28, 4);
    ctx.fillStyle = 'rgba(239,159,39,0.9)'; ctx.fillRect(14, 54, (W - 28) * G.s / lv.length, 4);
  }

  function wrapText(text, x, y, maxW, lh) {
    let ln = '';
    for (const ch of text) {
      if (ctx.measureText(ln + ch).width > maxW) { ctx.fillText(ln, x, y); y += lh; ln = ch; } else ln += ch;
    }
    if (ln) ctx.fillText(ln, x, y);
    return y + lh;
  }
  function button(text, x, y, w, h, fn, primary) {
    ctx.fillStyle = primary ? 'rgba(29,158,117,0.9)' : 'rgba(255,255,255,0.12)';
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = '#fff'; ctx.font = font(14); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(text, x + w / 2, y + h / 2);
    buttons.push({ x, y, w, h, fn });
  }

  function drawTitle() {
    ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.font = font(24); ctx.fillText('量子ビット群衆ランナー', W / 2, 28);
    ctx.font = font(12); ctx.fillStyle = 'rgba(220,220,230,0.8)';
    wrapText('60 人の群衆を左右のレーンで導き、最後にボスの向きで観測されます。←→ キーか画面の左右タップでレーン変更。', W / 2, 64, Math.min(W - 40, 420), 17);
    const twoCol = W >= 640;
    const bw = twoCol ? Math.min(260, (W - 60) / 3) : Math.min(W - 40, 320);
    const bh = 34, gap = 6;
    CHAPTERS.forEach((ch, ci) => {
      const list = LEVELS.map((lv, i) => [lv, i]).filter(([lv]) => lv.ch === ci);
      let x, y;
      if (twoCol) { x = 30 + ci * (bw + 15); y = 120; } else {
        x = (W - bw) / 2;
        y = 112 + LEVELS.filter((lv) => lv.ch < ci).length * (bh + gap) + ci * 30;
      }
      ctx.fillStyle = 'rgba(239,159,39,0.95)'; ctx.font = font(13); ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      ctx.fillText(ch.title, x, y);
      list.forEach(([lv, i], k) => {
        const done = G.cleared.includes(i) ? '  ✓' : '';
        button(lv.name + done, x, y + 22 + k * (bh + gap), bw, bh, () => prepareLevel(i), i === firstUncleared());
      });
    });
  }

  function drawIntro() {
    const lv = G.level, ch = CHAPTERS[lv.ch];
    const firstOfChapter = LEVELS.findIndex((l) => l.ch === lv.ch) === G.levelIdx;
    const items = newThings(G.levelIdx);
    const pw = Math.min(W - 24, 460), px = (W - pw) / 2;
    ctx.fillStyle = 'rgba(12,12,16,0.9)'; ctx.fillRect(px, 66, pw, H * 0.5 - 40);
    let y = 80;
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    if (firstOfChapter) {
      ctx.fillStyle = 'rgba(239,159,39,0.95)'; ctx.font = font(13); ctx.fillText(ch.title, px + 14, y); y += 20;
      ctx.fillStyle = 'rgba(230,230,236,0.9)'; ctx.font = font(12);
      y = wrapText(ch.intro, px + 14, y, pw - 28, 17) + 4;
    }
    ctx.fillStyle = '#fff'; ctx.font = font(15); ctx.fillText(lv.name, px + 14, y); y += 22;
    ctx.fillStyle = 'rgba(230,230,236,0.9)'; ctx.font = font(12);
    y = wrapText(lv.hint, px + 14, y, pw - 28, 17) + 4;
    if (items.length) {
      ctx.fillStyle = 'rgba(93,202,165,0.95)'; ctx.fillText('はじめて出てくるもの', px + 14, y); y += 18;
      for (const it of items) {
        ctx.fillStyle = '#fff'; ctx.font = font(12); ctx.fillText(it.name, px + 14, y);
        ctx.fillStyle = 'rgba(220,220,230,0.85)';
        y = wrapText(it.text, px + 80, y, pw - 94, 16);
      }
    }
    const bw = 120;
    button('スタート', W / 2 - bw - 5, H * 0.5 - 18, bw, 36, () => { G.mode = 'run'; }, true);
    button('もどる', W / 2 + 5, H * 0.5 - 18, bw, 36, () => { G.mode = 'title'; }, false);
  }

  function drawResult() {
    const lv = G.level, r = G.result;
    ctx.fillStyle = 'rgba(10,10,14,0.78)'; ctx.fillRect(0, H * 0.16, W, H * 0.34);
    ctx.fillStyle = r.win ? '#5DCAA5' : '#F0997B'; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.font = font(28); ctx.fillText(r.win ? 'クリア！' : 'ざんねん…', W / 2, H * 0.18);
    ctx.fillStyle = '#fff'; ctx.font = font(14);
    ctx.fillText(`${lv.boss.label} に出た人数  ${G.hits} / ${N}（必要 ${lv.boss.hp}）`, W / 2, H * 0.18 + 44);
    ctx.fillText(`そろい度 ${(Math.hypot(...G.rBefore) * 100).toFixed(0)}%   スコア ${r.score}`, W / 2, H * 0.18 + 68);
    const bw = Math.min(130, (W - 50) / 3), gap = 10, bx = (W - (bw * 3 + gap * 2)) / 2, by = H * 0.18 + 100;
    button('もう一度', bx, by, bw, 38, () => prepareLevel(G.levelIdx), !r.win);
    button('次へ', bx + bw + gap, by, bw, 38, () => prepareLevel(Math.min(LEVELS.length - 1, G.levelIdx + 1)), r.win);
    button('タイトル', bx + 2 * (bw + gap), by, bw, 38, () => { G.mode = 'title'; }, false);
  }

  function measureVecs() {
    const u = Q.unit(G.level.boss.axis);
    const t = Math.min(1, G.measureT / 1.2), e = t * t * (3 - 2 * t);
    return G.startVecs.map((v, i) => {
      const tgt = G.outcomes[i] ? u : u.map((x) => -x);
      const w = [0, 1, 2].map((k) => v[k] + (tgt[k] - v[k]) * e);
      const l = Math.hypot(...w);
      // 円・球では弧に沿って動かす（長さは元の長さから 1 へ）。1D は直線上をそのまま動かす
      if (l < 1e-6) return tgt;
      if (G.level.dim === 1) return w;
      const L = Math.hypot(...v) * (1 - e) + e;
      return w.map((x) => (x / l) * L);
    });
  }

  function draw() {
    buttons = [];
    ctx.fillStyle = '#16161c'; ctx.fillRect(0, 0, W, H);
    if (G.mode === 'title') { drawTitle(); return; }
    drawRoad();
    drawHUD();
    const R = Math.min(W * 0.34, H * 0.19);
    const vecs = G.mode === 'measure' || G.mode === 'result' ? measureVecs() : G.crowd.map(Q.bloch);
    const r = drawState(W / 2, H * 0.5 + R + 44, R, vecs);
    const len = Math.hypot(...r);
    ctx.fillStyle = 'rgba(220,220,230,0.8)'; ctx.font = font(12); ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText('そろい度', 14, H - 22);
    ctx.fillStyle = 'rgba(255,255,255,0.15)'; ctx.fillRect(70, H - 27, W - 90, 10);
    ctx.fillStyle = '#5DCAA5'; ctx.fillRect(70, H - 27, (W - 90) * Math.min(1, len), 10);
    if (G.mode === 'measure') {
      const shown = Math.min(G.hits, Math.floor(G.hits * Math.max(0, G.measureT - 1.2) / 0.8));
      ctx.fillStyle = '#EF9F27'; ctx.font = font(30); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(`観測！  ${shown}`, W / 2, H * 0.3);
    }
    if (G.flash) {
      ctx.globalAlpha = Math.min(1, G.flash.t / 0.4);
      ctx.fillStyle = '#fff'; ctx.font = font(34); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(G.flash.label, W / 2, H * 0.3);
      ctx.globalAlpha = 1;
    }
    if (G.mode === 'intro') drawIntro();
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
