// 쪽 맞춤: 문항이 단(2단 편집)에서 잘리지 않게 순서를 바꾸고 번호를 다시 매김
// 높이는 한글과 같은 글꼴(함초롬바탕)·폭으로 브라우저에서 줄 수를 재서 계산 (단위 HWPUNIT)
(function (root) {
  'use strict';
  const H = root.ExamHwpx;

  // 양식 실측값 (한글 2022에서 확인)
  const COL_H = 70784;      // 한 단 높이
  const FIRST_TOP = 5234;   // 1쪽 왼쪽 단: 안내 상자 문단 높이
  const COL_W = 26363;      // 단 너비
  const GAP = 2100;         // 문항 사이 빈 줄 (10pt 150% + 위아래 300)
  const SAFE = 1500;        // 한 단마다 남겨 두는 여유 (약 한 줄)
  const MIN_SPLIT = 3000;   // 왼쪽 단 끝에서 오른쪽 단으로 이어 붙이려면 최소 이만큼(약 두 줄) 남아 있어야 함
  const END_H = 9500;       // 마지막 '- 끝 -'과 답안지 확인 상자
  // 문단 모양: 왼/오른 여백, 첫 줄(음수=내어쓰기), 위/아래 간격
  const PP = {
    6: [500, 500, 500, 300, 300], 11: [500, 500, -1166, 300, 300], 14: [500, 500, 0, 0, 0], 19: [500, 500, 0, 0, 0],
    20: [500, 500, 500, 0, 100], 28: [500, 500, 500, 300, 0], 38: [500, 500, 500, 0, 300],
    51: [1000, 500, -966, 0, 0], 52: [1000, 500, -966, 300, 0]
  };
  const FONT = { P: [1000, 0], S: [950, 0], D: [1000, -0.03] }; // 글자 크기, 자간
  const PX = 1 / 25; // HWPUNIT → px (크게 재서 반올림 오차를 줄임)
  const WF = 0.978;   // 한글이 브라우저보다 줄을 조금 일찍 바꿔서 폭을 살짝 줄여 잼

  const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const plain = h => h.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

  // ---------- 높이 재기 ----------
  let box = null;
  function stage() {
    if (box) return box;
    box = document.createElement('div');
    box.style.cssText = 'position:absolute;left:-99999px;top:0;visibility:hidden;font-family:"함초롬바탕","HCR Batang","HANBatang","Batang",serif;';
    document.body.appendChild(box);
    return box;
  }
  function runsHtml(runs) {
    return runs.map(r => { let s = esc(r.t); if (r.b) s = '<b>' + s + '</b>'; if (r.i) s = '<i>' + s + '</i>'; return s; }).join('');
  }
  // 문단 하나의 줄 수
  function lineCount(runs, ppId, base, head, widthHU, tab) {
    const pp = PP[ppId] || PP[6];
    const [fh, ls] = FONT[base];
    const t = H.textOf(runs);
    if (!t.trim() && !head) return 1;
    const lh = fh * PX * 1.4;
    const el = document.createElement('div');
    const hang = pp[2] < 0 ? -pp[2] : 0;
    el.style.cssText = 'box-sizing:content-box;white-space:pre-wrap;word-break:keep-all;overflow-wrap:anywhere;text-align:justify;' +
      'width:' + ((widthHU - pp[0] - pp[1] - hang) * (root.EXAM_WF || WF) * PX) + 'px;padding-left:' + (hang * PX) + 'px;text-indent:' + (pp[2] * PX) + 'px;' +
      'font-size:' + (fh * PX) + 'px;line-height:' + lh + 'px;letter-spacing:' + ls + 'em;tab-size:4;';
    let html = (head ? '<b>' + esc(head) + '</b>　　　' : '') + runsHtml(runs);
    if (tab) html = html.replace(/\t/g, '　　');
    el.innerHTML = html;
    stage().appendChild(el);
    const n = Math.max(1, Math.round(el.offsetHeight / lh));
    el.remove();
    return n;
  }
  const PITCH = { P: 1500, S: 1425, D: 1500 };
  function itemHeight(it) {
    if (it.k === 'box') {
      const inner = 25513 - 848;
      let h = 0;
      if (it.title) h += 1600;
      for (const r of it.lines) h += lineCount(r, it.title ? 19 : 14, 'S', '', inner) * (it.title ? 1520 : 1425);
      return h + 566 + 424 + 600 + 300; // 칸 여백 + 바깥 여백 + 문단 위아래 + 여유
    }
    const pp = PP[it.pp] || PP[6];
    const n = lineCount(it.runs, it.pp, it.base, it.head, COL_W, !!it.tabCols);
    return n * PITCH[it.base] + pp[3] + pp[4];
  }
  function heightOf(lines) {
    const items = H.planBlocks(H.classify(lines), { autoGap: true, answers: !!root.EXAM_ANSWERS });
    return items.reduce((s, it) => s + itemHeight(it), 0);
  }

  // ---------- 문항 단위로 묶기 ----------
  // unit: {lines, group, pin, idx, start, end}  start~end(미포함) = 편집기 줄 번호 범위 ([고정] 줄·뒤 빈 줄 포함)
  const RE_OPEN = /^\s*[\[<]\s*(박스|상자|보기|대화)\s*[\]>]\s*$/, RE_CLOSE = /^\s*[\[<]\s*\/\s*(박스|상자|보기|대화)\s*[\]>]\s*$/;
  const RE_PIN = /^\s*\[\s*고정\s*\]\s*$/;
  function toUnits(lines) {
    const pre = [], units = []; let cur = null, inside = false, groupLeft = 0, pinAt = -1, bound = false, afterBind = false;
    const add = l => (cur ? cur.lines : pre).push(l);
    const start = (i, l, group) => {
      if (cur) cur.end = pinAt >= 0 ? pinAt : i;
      cur = { lines: [l], group, pin: pinAt >= 0, idx: units.length, start: pinAt >= 0 ? pinAt : i };
      units.push(cur); pinAt = -1;
    };
    lines.forEach((l, i) => {
      const t = plain(l);
      // [묶기] ~ [/묶기]: 그 사이는 무엇이 있든 한 덩어리
      const bm = t.match(H.RE_BIND);
      if (bm) {
        if (!bm[1]) { start(i, l, false); cur.bound = true; bound = true; groupLeft = 0; }
        else { add(l); bound = false; afterBind = true; }
        return;
      }
      if (bound) { if (!H.RE_COLBREAK.test(t)) add(l); return; } // 묶음 안의 옛 [다음 단]은 버림
      if (afterBind && plain(l).trim() && !H.RE_COLBREAK.test(t) && !RE_PIN.test(t)) {
        afterBind = false;
        // 묶음 뒤에 바로 이어진 지문 등은 새 덩어리로 (발문·묶음 문항이면 아래에서 새로 시작됨)
        if (!H.isQ(t) && !H.RE_GROUP.test(H.stripForce(t))) { start(i, l, false); cur.lastNum = null; return; }
      }
      if (RE_OPEN.test(t)) { inside = true; add(l); return; }
      if (RE_CLOSE.test(t)) { inside = false; add(l); return; }
      if (inside) { add(l); return; }
      if (H.RE_COLBREAK.test(t)) return;
      if (RE_PIN.test(t)) { pinAt = i; return; }
      const force = H.forcedOf(t), tt = H.stripForce(t);
      if (!tt.trim()) { if (cur) cur.lines.push(''); else if (pre.length) pre.push(''); return; }
      if (!force && H.RE_GROUP.test(tt)) {
        const m = tt.match(/\[\s*(?:서\s*)?(\d+)\s*[-~～]\s*(?:서\s*)?(\d+)\s*\]/);
        groupLeft = m ? Math.max(1, +m[2] - +m[1] + 1) : 1;
        start(i, l, true); return;
      }
      if (H.isQ(t)) {
        const qi = H.qInfo(tt) || { num: null, part: null }; // 직접 지정한 발문은 번호가 없을 수 있음
        // 1-1. 1-2. 는 앞 문항(1. 또는 1-1.)과 한 덩어리
        if (qi.part != null && cur && cur.lastNum === qi.num) { cur.lines.push(l); pinAt = -1; return; }
        if (cur && cur.group && groupLeft > 0) { groupLeft--; cur.lines.push(l); cur.lastNum = qi.num; pinAt = -1; return; }
        groupLeft = 0;
        start(i, l, false); cur.lastNum = qi.num; return;
      }
      pinAt = -1;
      add(l);
    });
    if (cur) cur.end = lines.length;
    for (const u of units) { while (u.lines.length && !plain(u.lines[u.lines.length - 1]).trim()) u.lines.pop(); }
    while (pre.length && !plain(pre[pre.length - 1]).trim()) pre.pop();
    return { pre, units };
  }

  // ---------- 단에 담기 ----------
  // keepOrder: 지금 순서 그대로 (못 들어가면 다음 단으로만 넘김)
  // 아니면: 📌 고정 문항은 지금 순서 자리(몇 번째 문항)에 두고, 나머지로 빈자리를 채움
  function pack(units, firstCap, keepOrder) {
    const cols = [];
    const newCol = () => ({ units: [], used: 0, cap: COL_H - SAFE, carry: false });
    let col = { units: [], used: 0, cap: firstCap - SAFE, carry: false };
    const gapOf = () => (col.units.length || col.carry ? GAP : 0);
    // 같은 쪽 안(왼쪽 단 → 오른쪽 단)에서는 문항이 이어져도 됨 → 왼쪽 단은 오른쪽 단까지 이어 담기
    // 단, 왼쪽 단에 남은 자리가 두세 줄도 안 되면 발문만 덩그러니 남으니 이어 붙이지 않음
    const isLeft = () => cols.length % 2 === 0;
    const fits = u => {
      const need = col.used + u.h + gapOf();
      if (need <= col.cap) return true;
      return isLeft() && need <= col.cap + COL_H - SAFE && col.cap - col.used - gapOf() >= MIN_SPLIT;
    };
    const pinAt = new Map(); const rem = [];
    units.forEach(u => { if (!keepOrder && u.pin) pinAt.set(u.idx, u); else rem.push(u); });
    let n = 0;
    while (n < units.length) {
      let u, i = -1;
      if (pinAt.has(n)) u = pinAt.get(n);
      else if (keepOrder) { i = 0; u = rem[0]; }
      else {
        // 서답형은 객관식이 다 놓인 뒤에만 (빈자리 채우기로 객관식 앞에 끼어들지 않게)
        const objLeft = rem.some(v => !v.sub);
        const ok = v => !v.sub || !objLeft;
        i = rem.findIndex(v => ok(v) && fits(v)); if (i < 0) i = rem.findIndex(ok); u = rem[i];
      }
      if (!fits(u) && (col.units.length || col.carry)) { cols.push(col); col = newCol(); continue; }
      if (i >= 0) rem.splice(i, 1);
      col.used += u.h + gapOf(); col.units.push(u); n++;
      if (col.used > col.cap) { // 넘친 만큼 다음 단에 이어짐
        const over = col.used - col.cap, left = isLeft();
        if (left) u.span = true;                          // 같은 쪽 오른쪽 단으로 이어짐 (괜찮음)
        if (!left || over > COL_H - SAFE) u.tooTall = true; // 다음 쪽으로 넘어감
        cols.push(col); col = newCol(); col.used = over; col.carry = true;
      }
    }
    if (col.units.length) cols.push(col);
    return cols;
  }

  // ---------- 번호 다시 매기기 ----------
  const RE_QNUM = /^((?:\s|<[^>]+>|[\u2060\u2061\u2062\u2064])*)(?:서답형\s*|서술형\s*|서\s*)?\d+(?:\s*[-‐–－]\s*\d+)?\s*\./;
  const RE_GNUM = /^((?:\s|<[^>]+>)*)\[\s*[^\]]*?\d+\s*[-~～]\s*[^\]]*?\d+\s*\]/;
  function renumber(orderedUnits) {
    let nO = 0, nS = 0;
    for (const u of orderedUnits) {
      const labels = []; const parent = new Map(); // 원래 번호 → 새 번호 (1-1. 이 따라가게)
      let gi = -1, gFrom = 0; // 묶음 머리 [a-b] 줄 위치, 그 뒤 첫 번호
      u.lines = u.lines.map((l, li) => {
        const t = plain(l);
        const force = H.forcedOf(t), tt = H.stripForce(t);
        if (!force && H.RE_GROUP.test(tt) && gi < 0) { gi = li; gFrom = labels.length; return l; }
        if (!H.isQ(t) || (!force && H.RE_GROUP.test(tt))) return l;
        const qi = H.qInfo(tt);
        if (!qi) return l; // 번호 없는 발문(직접 지정)은 그대로
        let lab;
        if (qi.part != null && parent.has(qi.num)) lab = parent.get(qi.num) + '-' + qi.part;
        else {
          const base = qi.pre ? '서' + (++nS) : String(++nO);
          parent.set(qi.num, base); labels.push(base);
          lab = qi.part != null ? base + '-' + qi.part : base;
        }
        return l.replace(RE_QNUM, (m, lead) => lead + lab + '.');
      });
      if (gi >= 0 && labels.length > gFrom) {
        u.lines[gi] = u.lines[gi].replace(RE_GNUM, (m, lead) => lead + '[' + labels[gFrom] + '-' + labels[labels.length - 1] + ']');
      }
    }
    return { nO, nS };
  }

  // lines(편집기 줄) → 새 줄 + 정보.  opt.keepOrder: 순서는 그대로 두고 번호·단 나눔만
  function arrange(lines, opt) {
    opt = opt || {};
    const { pre, units } = toUnits(lines);
    if (!units.length) return null;
    const preH = pre.length ? heightOf(pre) : 0;
    for (const u of units) {
      u.h = opt.heights ? opt.heights[u.idx] : heightOf(u.lines);
      const q = u.lines.map(l => H.stripForce(plain(l))).find(t => H.qInfo(t));
      u.sub = !!(q && H.qInfo(q).pre);
    }
    const cols = pack(units, COL_H - FIRST_TOP - preH - (pre.length ? GAP : 0), !!opt.keepOrder);
    const order = [].concat(...cols.map(c => c.units));
    const counts = renumber(order);
    const out = pre.slice(); if (pre.length) out.push('');
    cols.forEach((c, ci) => {
      c.units.forEach((u, ui) => {
        if (ui === 0 && ci > 0 && !c.carry) out.push('[다음 단]');
        else if (out.length && plain(out[out.length - 1]).trim()) out.push('');
        if (u.pin) out.push('[고정]');
        out.push(...u.lines);
      });
    });
    // 빈자리를 채우려고 앞으로 당겨 온 문항 수
    const moved = order.filter((u, i) => order.slice(i + 1).some(v => v.idx < u.idx)).length;
    const last = cols[cols.length - 1];
    return {
      lines: out, cols: cols.length, pages: Math.ceil(cols.length / 2), moved,
      tooTall: units.filter(u => u.tooTall).length, spans: units.filter(u => u.span && !u.tooTall).length, endFits: last.used + END_H <= last.cap + SAFE,
      nObj: counts.nO, nSub: counts.nS, pins: units.filter(u => u.pin).length
    };
  }

  root.ExamLayout = { arrange, heightOf, toUnits, lineCount, itemHeight, COL_W, COL_H, FIRST_TOP, END_H, WF, PP, FONT, PITCH, RE_PIN };
})(typeof window !== 'undefined' ? window : globalThis);
