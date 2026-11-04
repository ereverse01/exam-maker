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
    const items = H.planBlocks(H.classify(lines), { autoGap: true });
    return items.reduce((s, it) => s + itemHeight(it), 0);
  }

  // ---------- 문항 단위로 묶기 ----------
  const RE_OPEN = /^\s*[\[<]\s*(박스|상자|보기|대화)\s*[\]>]\s*$/, RE_CLOSE = /^\s*[\[<]\s*\/\s*(박스|상자|보기|대화)\s*[\]>]\s*$/;
  function toUnits(lines) {
    const pre = [], units = []; let cur = null, inside = false, groupLeft = 0;
    const add = l => (cur ? cur.lines : pre).push(l);
    for (const l of lines) {
      const t = plain(l);
      if (RE_OPEN.test(t)) { inside = true; add(l); continue; }
      if (RE_CLOSE.test(t)) { inside = false; add(l); continue; }
      if (inside) { add(l); continue; }
      if (H.RE_COLBREAK.test(t)) continue;
      if (!t.trim()) { if (cur) cur.lines.push(''); else if (pre.length) pre.push(''); continue; }
      if (H.RE_GROUP.test(t)) {
        const m = t.match(/\[\s*(?:서\s*)?(\d+)\s*[-~～]\s*(?:서\s*)?(\d+)\s*\]/);
        groupLeft = m ? Math.max(1, +m[2] - +m[1] + 1) : 1;
        cur = { lines: [l], group: true, idx: units.length }; units.push(cur); continue;
      }
      if (H.RE_Q.test(t)) {
        if (cur && cur.group && groupLeft > 0) { groupLeft--; cur.lines.push(l); continue; }
        groupLeft = 0;
        cur = { lines: [l], group: false, idx: units.length }; units.push(cur); continue;
      }
      add(l);
    }
    for (const u of units) { while (u.lines.length && !plain(u.lines[u.lines.length - 1]).trim()) u.lines.pop(); }
    while (pre.length && !plain(pre[pre.length - 1]).trim()) pre.pop();
    return { pre, units };
  }

  // ---------- 단에 담기 ----------
  function pack(units, firstCap) {
    const rem = units.slice(); const cols = [];
    let col = { units: [], used: 0, cap: firstCap - SAFE, carry: false };
    while (rem.length) {
      let pick = -1;
      for (let i = 0; i < rem.length; i++) {
        const need = rem[i].h + (col.units.length || col.carry ? GAP : 0);
        if (col.used + need <= col.cap) { pick = i; break; }
      }
      if (pick < 0) {
        if (col.units.length || col.carry) { cols.push(col); col = { units: [], used: 0, cap: COL_H - SAFE, carry: false }; continue; }
        pick = 0; // 한 단보다 긴 문항: 단 첫머리에 두고 다음 단으로 넘어가게
      }
      const u = rem.splice(pick, 1)[0];
      col.used += u.h + (col.units.length || col.carry ? GAP : 0); col.units.push(u);
      if (col.used > col.cap) { // 넘친 만큼 다음 단에 이어짐
        const over = col.used - col.cap; u.tooTall = true;
        cols.push(col); col = { units: [], used: over, cap: COL_H - SAFE, carry: true };
      }
    }
    if (col.units.length) cols.push(col);
    return cols;
  }

  // ---------- 번호 다시 매기기 ----------
  const RE_QNUM = /^((?:\s|<[^>]+>)*)(?:서답형\s*|서술형\s*|서\s*)?\d+\s*\./;
  const RE_GNUM = /^((?:\s|<[^>]+>)*)\[\s*[^\]]*?\d+\s*[-~～]\s*[^\]]*?\d+\s*\]/;
  function renumber(orderedUnits) {
    let nO = 0, nS = 0;
    for (const u of orderedUnits) {
      const labels = [];
      u.lines = u.lines.map(l => {
        const t = plain(l);
        if (!H.RE_Q.test(t) || H.RE_GROUP.test(t)) return l;
        const sub = /^\s*서/.test(t);
        const lab = sub ? '서' + (++nS) : String(++nO);
        labels.push(lab);
        return l.replace(RE_QNUM, (m, lead) => lead + lab + '.');
      });
      if (u.group && labels.length) {
        u.lines[0] = u.lines[0].replace(RE_GNUM, (m, lead) => lead + '[' + labels[0] + '-' + labels[labels.length - 1] + ']');
      }
    }
    return { nO, nS };
  }

  // lines(편집기 줄) → 새 줄 + 정보
  function arrange(lines, opt) {
    const { pre, units } = toUnits(lines);
    if (!units.length) return null;
    const preH = pre.length ? heightOf(pre) : 0;
    for (const u of units) u.h = opt && opt.heights ? opt.heights[u.idx] : heightOf(u.lines);
    const cols = pack(units, COL_H - FIRST_TOP - preH - (pre.length ? GAP : 0));
    const order = [].concat(...cols.map(c => c.units));
    const counts = renumber(order);
    const out = pre.slice(); if (pre.length) out.push('');
    cols.forEach((c, ci) => {
      c.units.forEach((u, ui) => {
        if (ui === 0 && ci > 0 && !c.carry) out.push('[다음 단]');
        else if (out.length && plain(out[out.length - 1]).trim()) out.push('');
        out.push(...u.lines);
      });
    });
    // 빈자리를 채우려고 앞으로 당겨 온 문항 수
    const moved = order.filter((u, i) => order.slice(i + 1).some(v => v.idx < u.idx)).length;
    const last = cols[cols.length - 1];
    return {
      lines: out, cols: cols.length, pages: Math.ceil(cols.length / 2), moved,
      tooTall: units.filter(u => u.tooTall).length, endFits: last.used + END_H <= last.cap + SAFE,
      nObj: counts.nO, nSub: counts.nS
    };
  }

  root.ExamLayout = { arrange, heightOf, toUnits, lineCount, itemHeight, COL_W };
})(typeof window !== 'undefined' ? window : globalThis);
