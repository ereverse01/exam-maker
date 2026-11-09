// 한글 파일 미리보기: 한글 파일과 같은 문단 계획(planBlocks)을 A4 2단 쪽에 흘려 넣어 보여 줌
// 단위는 HWPUNIT(1/7200인치) → 화면 px (1px = 75 HWPUNIT, 96dpi 실제 크기)
(function (root) {
  'use strict';
  const H = root.ExamHwpx, L = root.ExamLayout;
  const PX = 1 / 75;
  const PAPER_W = 59528, PAPER_H = 84188, MARGIN = 2834;
  const BODY_W = PAPER_W - 2 * MARGIN;          // 53860
  const COL_W = L.COL_W, COL_GAP = BODY_W - 2 * COL_W;
  const BOX_TOP = 7653;                           // 위 여백 + 머리말 (쪽 테두리 시작)
  const PAD_TOP = 280;                            // 테두리 안쪽 위 여백
  const COL_H = L.COL_H;
  const BOX_BOTTOM = BOX_TOP + PAD_TOP + COL_H + 1500; // '계속' 한 줄까지 테두리 안
  const px = hu => (hu * PX).toFixed(2) + 'px';

  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  function runsHtml(runs) {
    return runs.map(r => {
      let s = esc(r.t);
      if (r.u) s = '<u>' + s + '</u>'; if (r.i) s = '<i>' + s + '</i>'; if (r.b) s = '<b>' + s + '</b>';
      return s;
    }).join('');
  }
  // 선지 줄: Tab으로 나뉜 칸을 같은 너비로 (한글의 같은 간격 탭과 비슷하게)
  function choiceHtml(runs, cols) {
    const cells = [[]];
    for (const r of runs) {
      const parts = r.t.split('\t');
      parts.forEach((p, k) => { if (k) cells.push([]); if (p) cells[cells.length - 1].push(Object.assign({}, r, { t: p })); });
    }
    return cells.map(c => '<span class="pv-cell" style="width:' + (100 / cols) + '%">' + runsHtml(c) + '</span>').join('');
  }

  // 문단 계획 하나 → 요소
  function itemEl(it) {
    const el = document.createElement('div');
    if (it.k === 'box') {
      el.className = 'pv-boxp';
      let inner = it.title ? '<div class="pv-bogi-t">&lt; 보 기 &gt;</div>' : '';
      inner += it.lines.map(r => '<div class="pv-boxl">' + (runsHtml(r) || '&nbsp;') + '</div>').join('');
      el.innerHTML = '<div class="pv-box' + (it.title ? ' bogi' : '') + '">' + inner + '</div>';
      el._pitch = 0;
      return el;
    }
    const pp = L.PP[it.pp] || L.PP[6];
    const [fh, ls] = L.FONT[it.base];
    const pitch = L.PITCH[it.base];
    const hang = pp[2] < 0 ? -pp[2] : 0;
    el.className = 'pv-p';
    el.style.cssText = 'margin-left:' + px(pp[0]) + ';margin-right:' + px(pp[1]) + ';padding-left:' + px(hang) +
      ';text-indent:' + px(pp[2]) + ';padding-top:' + px(pp[3]) + ';padding-bottom:' + px(pp[4]) +
      ';font-size:' + px(fh) + ';line-height:' + px(pitch) + ';letter-spacing:' + ls + 'em;';
    if (!it.runs.length && !it.head) { el.innerHTML = '&nbsp;'; }
    else {
      let html = it.head ? '<b>' + esc(it.head) + '</b>　　　' : '';
      if (it.tabCols) { el.classList.add('tabs'); html += choiceHtml(it.runs, it.tabCols); }
      else html += runsHtml(it.runs);
      el.innerHTML = html;
    }
    el._pitch = pitch * PX; el._padTop = pp[3] * PX;
    return el;
  }

  function headTable(meta) {
    const nO = +meta.nObj || 0, nS = +meta.nSub || 0, pO = +meta.ptsObj || 0, pS = +meta.ptsSub || 0;
    const tot = Math.round((pO + pS) * 100) / 100;
    const v = (x, ph) => x ? esc(x) : '<span class="pv-ph">' + ph + '</span>';
    return '<table class="pv-head"><colgroup><col style="width:19.1%"><col style="width:23.6%"><col style="width:10.1%"><col style="width:13.3%"><col style="width:33.9%"></colgroup>' +
      '<tr><td>' + esc((meta.sem || '1') + '학기 ' + (meta.kind || '중간') + '고사') + '</td><td>' + esc((meta.grade || '1') + '학년') + '</td><td>과 목 명</td><td class="big">' + v(meta.subject, '과목명') + '</td>' +
      '<td>총 ' + (nO + nS) + '문항 (' + tot + '점)</td></tr>' +
      '<tr><td>' + v(meta.dateText, '시험일') + '</td><td>' + v(meta.category, '과목 구분') + '</td><td>과목코드</td><td class="big">' + v(meta.code, '코드') + '</td>' +
      '<td class="bold">' + (nO ? '선택형 1~' + nO + '번(' + pO + '점)' : '') + (nS ? '　서답형 1~' + nS + '번 (' + pS + '점)' : '') + '</td></tr></table>';
  }
  function noticeHtml(meta) {
    const nO = +meta.nObj || 0, nS = +meta.nSub || 0;
    const t = nS ? '※ 1번부터 ' + nO + '번까지는 선택형 문항이며, 서답형1~서답형' + nS + '번까지는 서답형 문항입니다. 문제와 선택지를 잘 읽고 문제지의 지시에 따라 답을 하기 바랍니다.'
      : '※ 1번부터 ' + nO + '번까지는 선택형 문항입니다. 문제와 선택지를 잘 읽고 문제지의 지시에 따라 답을 하기 바랍니다.';
    return '<div class="pv-notice">' + esc(t) + '</div>';
  }

  // container 안에 쪽들을 그림. 돌려주는 값: 쪽 수
  function render(container, meta, lines) {
    container.innerHTML = '';
    const items = H.planBlocks(H.classify(lines), { autoGap: true });
    const pages = []; const cols = [];
    const flowW = COL_W * (root.EXAM_WF || L.WF) * PX; // 쪽 맞춤 계산과 같은 폭 (한글이 조금 일찍 줄을 바꿈)
    function newPage() {
      const n = pages.length;
      const pg = document.createElement('div'); pg.className = 'pv-page';
      pg.style.cssText = 'width:' + px(PAPER_W) + ';height:' + px(PAPER_H);
      let html = n === 0 ? '<div class="pv-headwrap" style="left:' + px(MARGIN + 110) + ';top:' + px(2610) + ';width:' + px(BODY_W) + '">' + headTable(meta) + '</div>' : '';
      html += '<div class="pv-border" style="left:' + px(MARGIN) + ';top:' + px(BOX_TOP) + ';width:' + px(BODY_W) + ';height:' + px(BOX_BOTTOM - BOX_TOP) + '"></div>';
      html += '<div class="pv-sep" style="left:' + px(MARGIN + COL_W + COL_GAP / 2) + ';top:' + px(BOX_TOP + PAD_TOP) + ';height:' + px(COL_H) + '"></div>';
      html += '<div class="pv-cont" style="right:' + px(MARGIN + 120) + ';top:' + px(BOX_BOTTOM - 1400) + '"></div>';
      html += '<div class="pv-pnum" style="top:' + px(BOX_BOTTOM + 420) + '"></div>';
      html += '<div class="pv-copy" style="top:' + px(BOX_BOTTOM + 1300) + '">이 시험 문제의 저작권은 ' + esc(meta.school || '면목고등학교') + '에 있습니다. 무단 복제·배포 시 저작권법에 의거, 처벌될 수 있습니다.</div>';
      pg.innerHTML = html;
      [0, 1].forEach(c => {
        const col = document.createElement('div'); col.className = 'pv-col';
        col.style.cssText = 'left:' + px(MARGIN + c * (COL_W + COL_GAP)) + ';top:' + px(BOX_TOP + PAD_TOP) + ';width:' + flowW + 'px;height:' + px(COL_H);
        pg.appendChild(col);
        const o = { el: col, cap: COL_H * PX, used: 0, n: 0 };
        if (n === 0 && c === 0) { // 1쪽 왼쪽 단 첫머리: 안내 상자
          const nb = document.createElement('div'); nb.style.height = px(L.FIRST_TOP); nb.innerHTML = noticeHtml(meta);
          col.appendChild(nb); o.used = L.FIRST_TOP * PX;
        }
        cols.push(o);
      });
      container.appendChild(pg); pages.push(pg);
    }
    let ci = 0;
    const col = () => { while (ci >= cols.length) newPage(); return cols[ci]; };
    const nextCol = () => { ci++; return col(); };
    const clip = (el, off, h) => {
      const w = document.createElement('div'); w.className = 'pv-clip'; w.style.height = h + 'px';
      const e = off ? el.cloneNode(true) : el; if (off) e.style.marginTop = -off + 'px';
      w.appendChild(e); return w;
    };
    function place(el, keep) {
      let c = col();
      c.el.appendChild(el); const h = el.offsetHeight; el.remove();
      if (c.used + h > c.cap + 0.5 && c.n && (keep || el._pitch === 0) && h <= c.cap) c = nextCol(); // 상자·끝 표시는 통째로 다음 단
      let off = 0;
      for (let guard = 0; guard < 200; guard++) {
        const avail = c.cap - c.used, rem = h - off;
        if (rem <= avail + 0.5) { c.el.appendChild(clip(el, off, rem)); c.used += rem; c.n++; return; }
        let end = off + avail;
        if (el._pitch) end = el._padTop + Math.floor((end - el._padTop) / el._pitch + 0.01) * el._pitch; // 줄 단위로 자름
        if (end - off < 1) { if (!c.n) end = off + avail; else { c = nextCol(); continue; } }
        c.el.appendChild(clip(el, off, end - off)); c.used = c.cap; c.n++;
        off = end; c = nextCol();
      }
    }
    // 첫 칸 생성
    col();
    for (const it of items) {
      if (it.cb && (col().n || col().used > 0.5)) nextCol();
      place(itemEl(it));
    }
    // 끝 표시와 답안지 확인 상자
    const end = document.createElement('div'); end.className = 'pv-end';
    end.innerHTML = '<div class="pv-p" style="height:' + px(3000) + '"></div><div class="pv-endmark">- 끝 -</div>' +
      '<div class="pv-check">답안지의 해당란에 필요한 내용을 정확히 기입(표기) 했는지 확인하시오.</div>';
    end._pitch = 0;
    place(end, true);
    // 쪽 번호, '계속' 문구 (마지막 쪽은 없음)
    const last = Math.floor(ci / 2);
    while (pages.length > last + 1) { pages.pop().remove(); }
    pages.forEach((pg, k) => {
      pg.querySelector('.pv-pnum').textContent = '총 ' + pages.length + '면 중 ' + (k + 1) + '면';
      pg.querySelector('.pv-cont').textContent = k === pages.length - 1 ? '' : (k % 2 === 0 ? '뒷면에 계속 ☟' : '다음 장에 계속 ☞');
    });
    return pages.length;
  }

  root.ExamPreview = { render, PAGE_W: PAPER_W * PX };
})(typeof window !== 'undefined' ? window : globalThis);
