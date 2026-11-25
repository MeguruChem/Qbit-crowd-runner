// game.js — 描画とゲームループ（Canvas 2D）
(function () {
  'use strict';
  const { Q, LEVELS, CHAPTERS, gateDesc, zoneDesc } = window;
  const N0 = 60;            // 初期人数
  const SPEED = 7;          // 距離単位 / 秒
  const VIEW = 55;          // 前方の可視距離
  const SKIP_COST = 150;    // スキップの値段（ケット）
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

  // ---- スキン（群衆の見た目）：top = |0⟩ 側の色、bottom = |1⟩ 側の色 ----
  const SKINS = [
    { id: 'classic', name: 'クラシック', price: 0, top: [55, 138, 221], bottom: [226, 75, 74], shape: 'circle' },
    { id: 'pastel', name: 'パステル', price: 100, top: [93, 202, 165], bottom: [237, 147, 177], shape: 'circle' },
    { id: 'mono', name: 'モノクロ', price: 150, top: [245, 245, 245], bottom: [110, 110, 118], shape: 'square' },
    { id: 'neon', name: 'ネオン', price: 200, top: [80, 230, 255], bottom: [255, 80, 220], shape: 'diamond' },
    { id: 'gold', name: '金の星', price: 300, top: [250, 199, 117], bottom: [127, 119, 221], shape: 'star' },
  ];

  // ---- 保存データ ----
  const SAVE_KEY = 'qcr_save_v3';
  function load() {
    const d = { cleared: [], ket: 0, owned: ['classic'], skin: 'classic', best: {} };
    try { Object.assign(d, JSON.parse(localStorage.getItem(SAVE_KEY) || '{}')); } catch (e) { /* 初期値で続行 */ }
    return d;
  }
  const SAVE = load();
  function save() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(SAVE)); } catch (e) { /* 保存できなくても続行 */ } }
  const skin = () => SKINS.find((s) => s.id === SAVE.skin) || SKINS[0];
  const unlocked = (i) => i === 0 || SAVE.cleared.includes(i - 1) || SAVE.cleared.includes(i);

  // ---- 状態 ----
  const G = {
    mode: 'title',          // title | shop | intro | run | measure | result
    levelIdx: 0, level: null, crowd: null,
    s: 0, lane: -1, laneX: -1,
    gatesPassed: 0, flash: null, yaw: 0.6,
    measureT: 0, outcomes: null, rBefore: null, dmg: 0, hits: 0, result: null, toast: null,
  };

  function prepareLevel(i) {
    if (!unlocked(i)) return;
    G.levelIdx = i; G.level = LEVELS[i];
    G.crowd = Q.makeCrowd(N0, G.level.start);
    G.s = 0; G.lane = -1; G.laneX = -1; G.gatesPassed = 0; G.flash = null;
    G.outcomes = null; G.result = null; G.measureT = 0;
    G.mode = 'intro';
  }
  function skipLevel() {
    if (SAVE.ket < SKIP_COST || SAVE.cleared.includes(G.levelIdx)) return;
    SAVE.ket -= SKIP_COST; SAVE.cleared.push(G.levelIdx); save();
    G.toast = { text: `${G.level.name.split(' ')[0]} をスキップしました`, t: 2 };
    if (G.levelIdx < LEVELS.length - 1) prepareLevel(G.levelIdx + 1); else G.mode = 'title';
  }

  // このステージで初めて出てくる説明（次元で意味が変わるものは別扱い）
  function collect(lv) {
    const out = [], keys = new Set();
    const add = (key, name, text) => { if (!keys.has(key) && text) { keys.add(key); out.push({ key, name, text }); } };
    for (const g of lv.gates) for (const k of [g.left, g.right]) add(k + '@' + gateDesc(k, lv.dim), Q.GATES[k].label, gateDesc(k, lv.dim));
    for (const z of lv.zones) add(z.kind + '@' + zoneDesc(z.kind, lv.dim), ZONE_NAME[z.kind], zoneDesc(z.kind, lv.dim));
    return out;
  }
  function newThings(idx) {
    const seen = new Set();
    for (let i = 0; i < idx; i++) collect(LEVELS[i]).forEach((d) => seen.add(d.key));
    return collect(LEVELS[idx]).filter((d) => !seen.has(d.key));
  }

  // ---- 入力 ----
  let buttons = [];
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
    for (const b of buttons) if (b.fn && x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) { b.fn(); return; }
  });
  function firstUncleared() { for (let i = 0; i < LEVELS.length; i++) if (!SAVE.cleared.includes(i)) return i; return 0; }
  function onConfirm() {
    if (G.mode === 'title') prepareLevel(firstUncleared());
    else if (G.mode === 'intro') G.mode = 'run';
    else if (G.mode === 'result') prepareLevel(G.result.win ? Math.min(LEVELS.length - 1, G.levelIdx + 1) : G.levelIdx);
  }

  // ---- 更新 ----
  function update(dt) {
    G.yaw += dt * 0.15;
    if (G.toast) { G.toast.t -= dt; if (G.toast.t <= 0) G.toast = null; }
    if (G.flash) { G.flash.t -= dt; if (G.flash.t <= 0) G.flash = null; }
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
        const before = G.crowd.length;
        Q.applyGate(G.crowd, key);
        const diff = G.crowd.length - before;
        G.flash = { label: Q.GATES[key].label + (diff ? `  →  ${G.crowd.length}人` : ''), t: 0.9 };
        G.gatesPassed++;
      }
      G.s = s1;
      if (G.s >= lv.length) beginMeasure();
    } else if (G.mode === 'measure') {
      G.measureT += dt;
      if (G.measureT > 2.4) finishMeasure();
    }
  }
  function beginMeasure() {
    const n = G.level.boss.axis;
    G.rBefore = Q.meanBloch(G.crowd);
    G.startVecs = G.crowd.map(Q.bloch);
    G.outcomes = Q.measureAlong(G.crowd, n);
    G.hits = G.outcomes.filter(Boolean).length;
    G.dmg = Q.damage(G.outcomes);
    G.measureT = 0; G.mode = 'measure';
  }
  function finishMeasure() {
    const lv = G.level, i = G.levelIdx;
    const win = G.dmg >= lv.boss.hp;
    const sc = Q.score(G.dmg, G.rBefore, lv.boss.axis);
    const ket = Q.ketReward(G.dmg, lv.boss.hp);
    const best = SAVE.best[i] || 0;
    if (sc > best) SAVE.best[i] = sc;
    SAVE.ket += ket;
    if (win && !SAVE.cleared.includes(i)) SAVE.cleared.push(i);
    save();
    G.result = { win, score: sc, ket, newBest: sc > best };
    G.mode = 'result';
  }

  // ---- 状態の表示（1D 線 / 2D 円 / 3D 球） ----
  const PITCH = 0.38;
  function proj(v, cx, cy, R, dim, jit) {
    if (dim === 1) return [cx + (jit || 0) * R * 0.42, cy - v[2] * R, 1];
    if (dim === 2) return [cx + v[0] * R, cy - v[2] * R, 1];
    const c = Math.cos(G.yaw), s = Math.sin(G.yaw);
    const x1 = v[0] * c - v[1] * s, y1 = v[0] * s + v[1] * c;
    const cp = Math.cos(PITCH), sp = Math.sin(PITCH);
    return [cx + x1 * R, cy - (y1 * sp + v[2] * cp) * R, -y1 * cp + v[2] * sp];
  }
  function personColor(z, alpha, sk) {
    const t = (1 - z) / 2;
    const c = [0, 1, 2].map((k) => Math.round(sk.top[k] + t * (sk.bottom[k] - sk.top[k])));
    return `rgba(${c[0]},${c[1]},${c[2]},${alpha})`;
  }
  function drawPerson(x, y, rad, z, alpha, sk) {
    sk = sk || skin();
    ctx.fillStyle = personColor(z, alpha, sk);
    ctx.beginPath();
    if (sk.shape === 'square') ctx.rect(x - rad, y - rad, rad * 2, rad * 2);
    else if (sk.shape === 'diamond') { ctx.moveTo(x, y - rad * 1.3); ctx.lineTo(x + rad * 1.1, y); ctx.lineTo(x, y + rad * 1.3); ctx.lineTo(x - rad * 1.1, y); }
    else if (sk.shape === 'star') {
      for (let k = 0; k < 10; k++) {
        const a = -Math.PI / 2 + k * Math.PI / 5, rr = k % 2 ? rad * 0.6 : rad * 1.5;
        ctx[k ? 'lineTo' : 'moveTo'](x + rr * Math.cos(a), y + rr * Math.sin(a));
      }
    } else ctx.arc(x, y, rad, 0, Math.PI * 2);
    ctx.fill();
  }
  const GUIDE = 'rgba(160,160,170,0.55)', GUIDE_FAINT = 'rgba(160,160,170,0.2)';
  function line(x1, y1, x2, y2, col, w) { ctx.strokeStyle = col; ctx.lineWidth = w || 1; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); }
  function label(text, x, y, alpha, align) {
    ctx.fillStyle = `rgba(220,220,230,${alpha == null ? 0.9 : alpha})`;
    ctx.font = font(12); ctx.textAlign = align || 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, x, y);
  }

  function drawGuides(cx, cy, R, dim) {
    if (dim === 1) {
      line(cx, cy - R, cx, cy + R, GUIDE, 1.5);
      for (const [z, t] of [[1, '|0⟩'], [0, '半々'], [-1, '|1⟩']]) {
        line(cx - 8, cy - z * R, cx + 8, cy - z * R, GUIDE, 1.5);
        label(t, cx + R * 0.5, cy - z * R, 0.9, 'left');
      }
      return;
    }
    if (dim === 2) {
      ctx.strokeStyle = GUIDE; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.stroke();
      line(cx, cy - R, cx, cy + R, 'rgba(160,160,170,0.35)', 1.5);   // 第1章の縦の線
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
    const dim = G.level.dim, sk = skin();
    drawGuides(cx, cy, R, dim);
    const n = Q.unit(G.level.boss.axis);
    const tp = proj(n, cx, cy, R, dim, 0);
    ctx.strokeStyle = 'rgba(239,159,39,0.95)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(tp[0], tp[1], 11 + 2 * Math.sin(performance.now() / 200), 0, Math.PI * 2); ctx.stroke();
    const rad = vecs.length > 200 ? 2.5 : vecs.length > 100 ? 3 : 4;
    const pts = vecs.map((v, i) => {
      const p = proj(v, cx, cy, R, dim, G.crowd[i].j);
      if (dim > 1) { p[0] += G.crowd[i].j * 6; p[1] += Math.max(-1, Math.min(1, G.crowd[i].w / 2)) * 6; }
      return [p, v];
    }).sort((a, b) => a[0][2] - b[0][2]);
    for (const [p, v] of pts) drawPerson(p[0], p[1], p[2] >= 0 ? rad : rad * 0.75, v[2], p[2] >= 0 ? 0.95 : 0.35, sk);
    // 旗（群衆の平均）
    const r = vecs.reduce((a, v) => [a[0] + v[0], a[1] + v[1], a[2] + v[2]], [0, 0, 0]).map((x) => x / vecs.length);
    const o = proj([0, 0, 0], cx, cy, R, dim, 0), e = proj(r, cx, cy, R, dim, 0);
    if (dim === 1) { o[0] -= R * 0.62; e[0] -= R * 0.62; }
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
  function gateStyle(key) {
    if (key === 'ADD10' || key === 'CLONE') return ['rgba(24,95,165,0.6)', 'rgba(133,183,235,0.95)'];
    if (key === 'SUB10') return ['rgba(163,45,45,0.6)', 'rgba(240,149,149,0.95)'];
    if (key === 'M' || key === 'I') return ['rgba(186,117,23,0.55)', 'rgba(239,159,39,0.95)'];
    return ['rgba(29,158,117,0.55)', 'rgba(93,202,165,0.95)'];
  }
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
        const h = 70 * l[2], [fill, stroke] = gateStyle(key);
        ctx.fillStyle = fill; ctx.strokeStyle = stroke; ctx.lineWidth = 2;
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
    // 群衆（人数に応じて隊列の幅と奥行きを決める）
    const n = G.crowd.length, cols = Math.max(10, Math.min(24, Math.ceil(Math.sqrt(n * 1.6))));
    const dx = 0.9 / cols, rows = Math.ceil(n / cols), dy = Math.min(0.07, 0.9 / rows), sk = skin();
    const rad = n > 200 ? 2.5 : 3.5;
    let topY = Infinity, cxCrowd = 0;
    for (let k = 0; k < n; k++) {
      const p = G.crowd[k], col = k % cols, row = Math.floor(k / cols);
      const ox = (col - (cols - 1) / 2) * dx + p.j * dx * 0.25, oy = row * dy + Math.abs(p.w) * 0.01;
      const pt = roadPt(1.2 + oy * 8, G.laneX * 0.5 + ox, g);
      drawPerson(pt[0], pt[1] - 4, rad, p.r[2], 0.95, sk);
      topY = Math.min(topY, pt[1] - 4); cxCrowd = roadPt(1.2, G.laneX * 0.5, g)[0];
    }
    ctx.fillStyle = '#fff'; ctx.font = font(15); ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    ctx.fillText(`${n}人`, cxCrowd, topY - 6);
  }

  function drawHUD() {
    const lv = G.level;
    ctx.fillStyle = 'rgba(240,240,245,0.95)'; ctx.font = font(15);
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText(lv.name, 14, 12);
    ctx.font = font(12); ctx.fillStyle = 'rgba(220,220,230,0.8)';
    ctx.fillText(`ボス ${lv.boss.label}：必要ダメージ ${lv.boss.hp}（当たり − はずれ）`, 14, 34);
    ctx.textAlign = 'right'; ctx.fillStyle = 'rgba(250,199,117,0.95)';
    ctx.fillText(`${SAVE.ket} ケット`, W - 14, 14);
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
  function button(text, x, y, w, h, fn, style) {
    ctx.fillStyle = style === 'primary' ? 'rgba(29,158,117,0.9)' : style === 'off' ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.12)';
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = style === 'off' ? 'rgba(255,255,255,0.35)' : '#fff';
    ctx.font = font(14); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(text, x + w / 2, y + h / 2);
    buttons.push({ x, y, w, h, fn: style === 'off' ? null : fn });
  }

  function drawTitle() {
    ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.font = font(24); ctx.fillText('量子ビット群衆ランナー', W / 2, 24);
    ctx.font = font(12); ctx.fillStyle = 'rgba(220,220,230,0.8)';
    wrapText('群衆を左右のレーンで導き、最後にボスの向きで観測されます。←→ キーか画面の左右タップでレーン変更。', W / 2, 58, Math.min(W - 40, 420), 17);
    const bwTop = 130;
    ctx.fillStyle = 'rgba(250,199,117,0.95)'; ctx.font = font(14); ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText(`${SAVE.ket} ケット`, Math.max(20, W / 2 - 160), 106);
    button('ショップ', Math.min(W - bwTop - 20, W / 2 + 30), 92, bwTop, 30, () => { G.mode = 'shop'; });
    const twoCol = W >= 640;
    const bw = twoCol ? Math.min(260, (W - 60) / 3) : Math.min(W - 40, 320);
    const bh = 32, gap = 5;
    CHAPTERS.forEach((ch, ci) => {
      const list = LEVELS.map((lv, i) => [lv, i]).filter(([lv]) => lv.ch === ci);
      let x, y;
      if (twoCol) { x = 30 + ci * (bw + 15); y = 136; } else {
        x = (W - bw) / 2;
        y = 134 + LEVELS.filter((lv) => lv.ch < ci).length * (bh + gap) + ci * 26;
      }
      ctx.fillStyle = 'rgba(239,159,39,0.95)'; ctx.font = font(13); ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      ctx.fillText(ch.title, x, y);
      list.forEach(([lv, i], k) => {
        const open = unlocked(i), done = SAVE.cleared.includes(i);
        const text = lv.name + (done ? '  ✓' : open ? '' : '  （未開放）');
        button(text, x, y + 20 + k * (bh + gap), bw, bh, () => prepareLevel(i), !open ? 'off' : i === firstUncleared() ? 'primary' : '');
      });
    });
  }

  function drawShop() {
    ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.font = font(22); ctx.fillText('ショップ', W / 2, 24);
    ctx.fillStyle = 'rgba(250,199,117,0.95)'; ctx.font = font(14);
    ctx.fillText(`所持 ${SAVE.ket} ケット`, W / 2, 58);
    ctx.fillStyle = 'rgba(220,220,230,0.8)'; ctx.font = font(12);
    wrapText(`ケットはクリアで 20、必要ダメージを超えた分 1 につき 2 もらえます。ステージ開始前の画面で ${SKIP_COST} ケット払うとスキップできます。`, W / 2, 82, Math.min(W - 40, 420), 17);
    const pw = Math.min(W - 32, 420), px = (W - pw) / 2;
    SKINS.forEach((s, k) => {
      const y = 140 + k * 62;
      ctx.fillStyle = 'rgba(255,255,255,0.06)'; ctx.fillRect(px, y, pw, 54);
      for (let m = 0; m < 5; m++) drawPerson(px + 22 + m * 16, y + 27, 5, 1 - m / 2, 1, s);
      ctx.fillStyle = '#fff'; ctx.font = font(14); ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillText(s.name, px + 110, y + 27);
      const owned = SAVE.owned.includes(s.id), using = SAVE.skin === s.id;
      const bx = px + pw - 112;
      if (using) button('使用中', bx, y + 11, 100, 32, null, 'off');
      else if (owned) button('使う', bx, y + 11, 100, 32, () => { SAVE.skin = s.id; save(); }, 'primary');
      else button(`${s.price} ケット`, bx, y + 11, 100, 32, () => {
        SAVE.ket -= s.price; SAVE.owned.push(s.id); SAVE.skin = s.id; save();
        G.toast = { text: `${s.name} を手に入れました`, t: 2 };
      }, SAVE.ket >= s.price ? 'primary' : 'off');
    });
    button('もどる', W / 2 - 60, 140 + SKINS.length * 62 + 10, 120, 36, () => { G.mode = 'title'; });
  }

  function drawIntro() {
    const lv = G.level, ch = CHAPTERS[lv.ch];
    const firstOfChapter = LEVELS.findIndex((l) => l.ch === lv.ch) === G.levelIdx;
    const items = newThings(G.levelIdx);
    const pw = Math.min(W - 24, 460), px = (W - pw) / 2;
    ctx.fillStyle = 'rgba(12,12,16,0.92)'; ctx.fillRect(px, 66, pw, H * 0.5 - 30);
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
    const by = H * 0.5 - 8, bw = Math.min(110, (pw - 40) / 3), x0 = W / 2 - (bw * 3 + 20) / 2;
    button('スタート', x0, by, bw, 34, () => { G.mode = 'run'; }, 'primary');
    const canSkip = !SAVE.cleared.includes(G.levelIdx) && SAVE.ket >= SKIP_COST;
    button(`スキップ ${SKIP_COST}`, x0 + bw + 10, by, bw, 34, skipLevel, canSkip ? '' : 'off');
    button('もどる', x0 + 2 * (bw + 10), by, bw, 34, () => { G.mode = 'title'; });
  }

  function drawResult() {
    const lv = G.level, r = G.result;
    ctx.fillStyle = 'rgba(10,10,14,0.82)'; ctx.fillRect(0, H * 0.13, W, H * 0.38);
    ctx.fillStyle = r.win ? '#5DCAA5' : '#F0997B'; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.font = font(28); ctx.fillText(r.win ? 'クリア！' : 'ざんねん…', W / 2, H * 0.14);
    ctx.fillStyle = '#fff'; ctx.font = font(14);
    const miss = G.outcomes.length - G.hits;
    ctx.fillText(`当たり ${G.hits} − はずれ ${miss} = ダメージ ${G.dmg}（必要 ${lv.boss.hp}）`, W / 2, H * 0.14 + 42);
    ctx.fillText(`スコア ${r.score}${r.newBest ? '（自己ベスト）' : ''}`, W / 2, H * 0.14 + 64);
    ctx.fillStyle = 'rgba(250,199,117,0.95)';
    ctx.fillText(r.ket ? `+${r.ket} ケット（所持 ${SAVE.ket}）` : `所持 ${SAVE.ket} ケット`, W / 2, H * 0.14 + 86);
    const bw = Math.min(120, (W - 50) / 3), gap = 10, bx = (W - (bw * 3 + gap * 2)) / 2, by = H * 0.14 + 116;
    button('もう一度', bx, by, bw, 38, () => prepareLevel(G.levelIdx), r.win ? '' : 'primary');
    const next = Math.min(LEVELS.length - 1, G.levelIdx + 1);
    button('次へ', bx + bw + gap, by, bw, 38, () => prepareLevel(next), unlocked(next) ? (r.win ? 'primary' : '') : 'off');
    button('タイトル', bx + 2 * (bw + gap), by, bw, 38, () => { G.mode = 'title'; });
  }

  function measureVecs() {
    const u = Q.unit(G.level.boss.axis);
    const t = Math.min(1, G.measureT / 1.2), e = t * t * (3 - 2 * t);
    return G.startVecs.map((v, i) => {
      const tgt = G.outcomes[i] ? u : u.map((x) => -x);
      const w = [0, 1, 2].map((k) => v[k] + (tgt[k] - v[k]) * e);
      const l = Math.hypot(...w);
      if (l < 1e-6) return tgt;
      if (G.level.dim === 1) return w;
      const L = Math.hypot(...v) * (1 - e) + e;
      return w.map((x) => (x / l) * L);
    });
  }

  function drawToast() {
    if (!G.toast) return;
    ctx.globalAlpha = Math.min(1, G.toast.t);
    ctx.fillStyle = 'rgba(29,158,117,0.95)';
    ctx.font = font(13); const w = ctx.measureText(G.toast.text).width + 28;
    ctx.fillRect((W - w) / 2, H - 70, w, 32);
    ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(G.toast.text, W / 2, H - 54);
    ctx.globalAlpha = 1;
  }

  function draw() {
    buttons = [];
    ctx.fillStyle = '#16161c'; ctx.fillRect(0, 0, W, H);
    if (G.mode === 'title') { drawTitle(); drawToast(); return; }
    if (G.mode === 'shop') { drawShop(); drawToast(); return; }
    drawRoad();
    drawHUD();
    const R = Math.min(W * 0.34, H * 0.19);
    const vecs = G.mode === 'measure' || G.mode === 'result' ? measureVecs() : G.crowd.map(Q.bloch);
    const cyState = H * 0.5 + R + 44;
    const r = drawState(W / 2, cyState, R, vecs);
    // ボスの向きに当たる確率と期待ダメージ
    if (G.mode === 'run' || G.mode === 'intro') {
      const u = Q.unit(G.level.boss.axis), p = (1 + r[0] * u[0] + r[1] * u[1] + r[2] * u[2]) / 2;
      const expD = Math.round(Q.expectedDamage(G.crowd, G.level.boss.axis));
      label(`当たる確率 ${Math.round(p * 100)}%`, 14, H * 0.5 + 16, 0.85, 'left');
      label(`期待ダメージ ${expD} / ${G.level.boss.hp}`, 14, H * 0.5 + 34, 0.85, 'left');
    }
    const len = Math.hypot(...r);
    label('そろい度', 14, H - 22, 0.8, 'left');
    ctx.fillStyle = 'rgba(255,255,255,0.15)'; ctx.fillRect(70, H - 27, W - 90, 10);
    ctx.fillStyle = '#5DCAA5'; ctx.fillRect(70, H - 27, (W - 90) * Math.min(1, len), 10);
    if (G.mode === 'measure') {
      const f = Math.max(0, Math.min(1, (G.measureT - 1.2) / 0.9));
      ctx.fillStyle = '#EF9F27'; ctx.font = font(28); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(`観測！  ダメージ ${Math.round(G.dmg * f)}`, W / 2, H * 0.2);
    }
    if (G.flash) {
      ctx.globalAlpha = Math.min(1, G.flash.t / 0.4);
      ctx.fillStyle = '#fff'; ctx.font = font(30); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(G.flash.label, W / 2, H * 0.2);
      ctx.globalAlpha = 1;
    }
    if (G.mode === 'intro') drawIntro();
    if (G.mode === 'result') drawResult();
    drawToast();
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
