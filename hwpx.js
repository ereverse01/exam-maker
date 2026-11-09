// 시험지 hwpx 생성기 — 브라우저(index.html)와 Node 테스트에서 같이 씀
(function (root) {
  'use strict';

  const ICON = ''; // 원본 '뒷면에 계속' 앞의 책 모양 기호
  const CONT_L = 1500;   // 꼬리말에 '계속' 줄을 넣으려고 늘리는 높이 (본문은 그만큼 줄어듦)

  // ---------- 한 줄(간단한 HTML) → 글자 조각 ----------
  const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
  function decode(s) {
    return s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e) => {
      if (e[0] === '#') return String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : +e.slice(1));
      return ENT[e.toLowerCase()] != null ? ENT[e.toLowerCase()] : m;
    });
  }
  function parseLine(html) {
    const runs = []; const st = { b: 0, u: 0, i: 0 };
    const re = /<(\/?)(b|strong|u|i|em)\b[^>]*>|<[^>]+>|([^<]+)/gi; let m;
    while ((m = re.exec(html))) {
      if (m[3] != null) {
        const t = decode(m[3]); if (!t) continue;
        const r = { t, b: st.b > 0, u: st.u > 0, i: st.i > 0 };
        const last = runs[runs.length - 1];
        if (last && last.b === r.b && last.u === r.u && last.i === r.i) last.t += t; else runs.push(r);
      } else if (m[2]) {
        const k = { b: 'b', strong: 'b', u: 'u', i: 'i', em: 'i' }[m[2].toLowerCase()];
        st[k] += m[1] ? -1 : 1; if (st[k] < 0) st[k] = 0;
      }
    }
    return runs;
  }
  const textOf = runs => runs.map(r => r.t).join('');

  // ---------- 줄 → 블록 분류 ----------
  const RE_GROUP = /^\s*\[\s*(서\s*)?\d+\s*[-~～]\s*(서\s*)?\d+\s*\]/;
  const RE_Q = /^\s*(서답형\s*|서술형\s*|서\s*)?\d+(\s*[-‐–－]\s*\d+)?\s*\.(\s|$)/;
  // 발문 번호 읽기: '서1-2.' → {pre:true, num:1, part:2}, '3.' → {pre:false, num:3, part:null}
  function qInfo(t) {
    const m = t.match(/^\s*(서답형\s*|서술형\s*|서\s*)?(\d+)(?:\s*[-‐–－]\s*(\d+))?\s*\./);
    return m ? { pre: !!m[1], num: +m[2], part: m[3] != null ? +m[3] : null } : null;
  }
  // 줄 종류 직접 지정: 줄 맨 앞의 보이지 않는 글자 (편집기에서 고름)
  const FORCE = { '\u2061': 'q', '\u2062': 'passage', '\u2064': 'choice', '\u2060': 'answer' };
  const FORCE_CH = { q: '\u2061', passage: '\u2062', choice: '\u2064', answer: '\u2060' };
  const RE_FORCE = /[\u2060\u2061\u2062\u2064]/g;
  const forcedOf = s => { const m = String(s).match(/[\u2060\u2061\u2062\u2064]/); return m ? FORCE[m[0]] : null; };
  // 정답 줄: '정답: ③' / '[정답] ③' — 문항에 붙어 다니지만 한글 파일·미리보기에는 안 나옴
  const RE_ANSWER = /^\s*(\[\s*정답\s*\]|정답\s*[:：])/;
  const stripForce = s => String(s).replace(RE_FORCE, '');
  // 발문 줄인지 (직접 지정한 것 포함)
  function isQ(t) { const f = forcedOf(t); return f ? f === 'q' : RE_Q.test(t); }
  const RE_COLBREAK = /^\s*\[\s*다음\s*단\s*\]\s*$/;
  const RE_CHOICE = /^\s*[①②③④⑤]/;
  const RE_OPEN = /^\s*[\[<]\s*(박스|상자|보기|대화)\s*[\]>]\s*$/;
  const RE_CLOSE = /^\s*[\[<]\s*\/\s*(박스|상자|보기|대화)\s*[\]>]\s*$/;
  const BLOCK_KIND = { 박스: 'box', 상자: 'box', 보기: 'bogi', 대화: 'dialog' };

  function classify(lineHtmls) {
    const out = []; let cur = null; // cur: 열린 박스/보기/대화
    let lastQ = null; // 1-1. 처럼 딸린 문항은 앞 문항(1. / 서1.)의 서답형 여부를 이어받음
    for (const h0 of lineHtmls) {
      const force = forcedOf(h0);
      const runs = parseLine(stripForce(h0)); const t = textOf(runs);
      let m;
      if ((m = t.match(RE_OPEN))) { cur = { type: BLOCK_KIND[m[1]], lines: [] }; out.push(cur); continue; }
      if (RE_CLOSE.test(t)) { cur = null; continue; }
      if (cur) { cur.lines.push(runs); continue; }
      if (RE_COLBREAK.test(t)) { out.push({ type: 'colbreak' }); continue; }
      if (/^\s*\[\s*고정\s*\]\s*$/.test(t)) continue; // 📌 고정 표시 (편집기에서만)
      const ty = !t.trim() ? 'blank' : force || (RE_ANSWER.test(t) ? 'answer' : RE_GROUP.test(t) ? 'group' : RE_Q.test(t) ? 'q' : RE_CHOICE.test(t) ? 'choice' : 'passage');
      if (ty === 'blank') out.push({ type: 'blank' });
      else if (ty === 'q') {
        const qi = qInfo(t); // 직접 발문으로 지정한 줄은 번호가 없을 수도 있음
        let sub = qi ? qi.pre : /^\s*서/.test(t);
        if (qi && !sub && qi.part != null && lastQ && lastQ.num === qi.num) sub = lastQ.sub;
        const pm = t.match(/\[\s*(\d+(?:\.\d+)?)\s*점/);
        lastQ = { type: 'q', runs, sub, pts: pm ? +pm[1] : null, num: qi ? qi.num : null, part: qi ? qi.part : null, forced: !!force };
        out.push(lastQ);
      }
      else out.push({ type: ty, runs, forced: !!force });
    }
    return out;
  }

  // ---------- XML 도우미 ----------
  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  function textXml(s) { // 탭 → hp:tab
    return s.split('\t').map(esc).join('<hp:tab width="4000" leader="0" type="1"/>');
  }
  function splitParas(sec) {
    let depth = 0, start = -1; const ps = []; const re = /<(\/?)hp:p[ >]/g; let m;
    while ((m = re.exec(sec))) {
      if (m[1] === '') { if (depth === 0) start = m.index; depth++; }
      else { depth--; if (depth === 0) ps.push([start, sec.indexOf('>', m.index) + 1]); }
    }
    return ps;
  }

  // ---------- 글자 모양: 있으면 찾고 없으면 header.xml에 새로 추가 ----------
  function CharTable(header) {
    this.header = header; this.added = [];
    const list = []; const re = /<hh:charPr id="(\d+)"[\s\S]*?<\/hh:charPr>/g; let m;
    while ((m = re.exec(header))) list.push({ id: +m[1], xml: m[0] });
    this.list = list; this.next = Math.max.apply(null, list.map(c => c.id)) + 1;
    this.cache = {};
  }
  CharTable.prototype.sig = function (xml) {
    const h = +xml.match(/height="(\d+)"/)[1];
    const font = xml.match(/<hh:fontRef hangul="(\d+)"/)[1];
    const sp = +xml.match(/<hh:spacing hangul="(-?\d+)"/)[1];
    const ul = (xml.match(/<hh:underline type="(\w+)"/) || [0, 'NONE'])[1] !== 'NONE';
    return [h, font, sp, /<hh:bold\/>/.test(xml) ? 1 : 0, ul ? 1 : 0, /<hh:italic\/>/.test(xml) ? 1 : 0,
      /textColor="#000000"/.test(xml) ? 1 : 0, /<hh:ratio hangul="100"/.test(xml) ? 1 : 0, /<hh:offset hangul="0"/.test(xml) ? 1 : 0].join(',');
  };
  // o: {h:1000|950, sp, b, u, i}
  CharTable.prototype.get = function (o) {
    const key = [o.h, 3, o.sp || 0, o.b ? 1 : 0, o.u ? 1 : 0, o.i ? 1 : 0, 1, 1, 1].join(',');
    if (this.cache[key] != null) return this.cache[key];
    for (const c of this.list) if (this.sig(c.xml) === key && /borderFillIDRef="2"/.test(c.xml)) return (this.cache[key] = c.id);
    // 새로 만들기: 기본(id 2: 10pt 함초롬바탕)에서 바꿈
    let x = this.list.find(c => c.id === 2).xml;
    const id = this.next++;
    const sp = o.sp || 0;
    x = x.replace(/id="2"/, 'id="' + id + '"').replace(/height="\d+"/, 'height="' + o.h + '"')
      .replace(/<hh:spacing [^>]*\/>/, '<hh:spacing hangul="' + sp + '" latin="' + sp + '" hanja="' + sp + '" japanese="' + sp + '" other="' + sp + '" symbol="' + sp + '" user="' + sp + '"/>')
      .replace(/<hh:bold\/>|<hh:italic\/>/g, '');
    const deco = (o.i ? '<hh:italic/>' : '') + (o.b ? '<hh:bold/>' : '');
    x = x.replace(/<hh:underline type="\w+"/, deco + '<hh:underline type="' + (o.u ? 'BOTTOM' : 'NONE') + '"');
    this.list.push({ id, xml: x }); this.added.push(x);
    return (this.cache[key] = id);
  };
  CharTable.prototype.finish = function () {
    if (!this.added.length) return this.header;
    const n = this.list.length;
    return this.header.replace(/<hh:charProperties itemCnt="\d+">/, '<hh:charProperties itemCnt="' + n + '">')
      .replace('</hh:charProperties>', this.added.join('') + '</hh:charProperties>');
  };

  // 한 줄에 선지 k개(2~5)를 Tab으로 띄울 때 쓰는 균등 탭 문단 모양 (선지 문단 51번을 복제)
  const COL_W = 26363;   // 단 너비 (HWPUNIT)
  function addChoiceTabs(header) {
    const tabCnt = +header.match(/<hh:tabProperties itemCnt="(\d+)">/)[1];
    const ppCnt = +header.match(/<hh:paraProperties itemCnt="(\d+)">/)[1];
    const a = header.indexOf('<hh:paraPr id="51"'), b = header.indexOf('</hh:paraPr>', a) + 12;
    const base = header.slice(a, b);
    const avail = COL_W - (2000 + 1000) / 2; // 문단 여백 값은 2배 단위, 탭 위치는 HWPUNIT
    const map = {}; let tabs = '', pps = '';
    for (let k = 2; k <= 5; k++) {
      const tid = tabCnt + k - 2, pid = ppCnt + k - 2;
      let items = '';
      for (let i = 1; i < k; i++) items += '<hh:tabItem pos="' + Math.round(i * avail / k) + '" type="LEFT" leader="NONE"/>';
      tabs += '<hh:tabPr id="' + tid + '" autoTabLeft="0" autoTabRight="0">' + items + '</hh:tabPr>';
      pps += base.replace('id="51"', 'id="' + pid + '"').replace(/tabPrIDRef="\d+"/, 'tabPrIDRef="' + tid + '"');
      map[k] = pid;
    }
    header = header.replace(/<hh:tabProperties itemCnt="\d+">/, '<hh:tabProperties itemCnt="' + (tabCnt + 4) + '">')
      .replace('</hh:tabProperties>', tabs + '</hh:tabProperties>')
      .replace(/<hh:paraProperties itemCnt="\d+">/, '<hh:paraProperties itemCnt="' + (ppCnt + 4) + '">')
      .replace('</hh:paraProperties>', pps + '</hh:paraProperties>');
    return { header, map };
  }

  // ---------- 문단 만들기 ----------
  const PID = '2147483648';
  function para(pp, style, runsXml, cb) {
    return '<hp:p id="' + PID + '" paraPrIDRef="' + pp + '" styleIDRef="' + style + '" pageBreak="0" columnBreak="' + (cb ? 1 : 0) + '" merged="0">' + runsXml + '</hp:p>';
  }
  function runsXml(ct, runs, base) { // base: {h, sp, b}
    if (!runs.length) return '<hp:run charPrIDRef="' + ct.get(base) + '"/>';
    return runs.map(r => '<hp:run charPrIDRef="' + ct.get({ h: base.h, sp: base.sp, b: base.b || r.b, u: r.u, i: r.i }) + '"><hp:t>' + textXml(r.t) + '</hp:t></hp:run>').join('');
  }
  // 앞부분(정규식에 맞는 부분)을 굵게
  function boldPrefix(runs, re) {
    const t = textOf(runs); const m = t.match(re); if (!m) return runs;
    let n = m[0].length; const out = [];
    for (const r of runs) {
      if (n <= 0) { out.push(r); continue; }
      if (r.t.length <= n) { out.push(Object.assign({}, r, { b: true })); n -= r.t.length; }
      else { out.push(Object.assign({}, r, { t: r.t.slice(0, n), b: true })); out.push(Object.assign({}, r, { t: r.t.slice(n) })); n = 0; }
    }
    return out;
  }
  let tblSeq = 0;
  function tableXml(innerParas, height) {
    const id = 1300000000 + (Date.now() % 100000000) + (tblSeq++);
    return '<hp:tbl id="' + id + '" zOrder="' + (20 + tblSeq) + '" numberingType="TABLE" textWrap="TOP_AND_BOTTOM" textFlow="BOTH_SIDES" lock="0" dropcapstyle="None" pageBreak="CELL" repeatHeader="1" rowCnt="1" colCnt="1" cellSpacing="0" borderFillIDRef="4" noAdjust="0">' +
      '<hp:sz width="25513" widthRelTo="ABSOLUTE" height="' + height + '" heightRelTo="ABSOLUTE" protect="0"/>' +
      '<hp:pos treatAsChar="1" affectLSpacing="0" flowWithText="1" allowOverlap="0" holdAnchorAndSO="0" vertRelTo="PARA" horzRelTo="PARA" vertAlign="TOP" horzAlign="LEFT" vertOffset="0" horzOffset="0"/>' +
      '<hp:outMargin left="141" right="141" top="141" bottom="283"/><hp:inMargin left="424" right="424" top="113" bottom="113"/>' +
      '<hp:tr><hp:tc name="" header="0" hasMargin="1" protect="0" editable="0" dirty="0" borderFillIDRef="4">' +
      '<hp:subList id="" textDirection="HORIZONTAL" lineWrap="BREAK" vertAlign="CENTER" linkListIDRef="0" linkListNextIDRef="0" textWidth="0" textHeight="0" hasTextRef="0" hasNumRef="0">' +
      innerParas + '</hp:subList><hp:cellAddr colAddr="0" rowAddr="0"/><hp:cellSpan colSpan="1" rowSpan="1"/>' +
      '<hp:cellSz width="25513" height="282"/><hp:cellMargin left="424" right="424" top="283" bottom="283"/></hp:tc></hp:tr></hp:tbl>';
  }
  function boxPara(ct, inner, height, cb) {
    return '<hp:p id="' + PID + '" paraPrIDRef="11" styleIDRef="1" pageBreak="0" columnBreak="' + (cb ? 1 : 0) + '" merged="0"><hp:run charPrIDRef="8">' +
      tableXml(inner, height) + '<hp:t/></hp:run></hp:p>';
  }

  // 블록들 → 문단 계획 (한글 파일 XML과 쪽 맞춤 높이 계산이 같이 씀)
  // item: {k:'p', pp, style, base:'P'|'S'|'D', runs, head, tabCols, cb} | {k:'box', lines, title, cb}
  function planBlocks(blocks, opt) {
    opt = opt || {};
    blocks = blocks.filter(b => b.type !== 'answer'); // 정답 줄은 시험지에 안 찍음
    const bl = []; let cb = false;
    blocks.forEach((b, k) => {
      if (b.type === 'colbreak') { cb = true; return; }
      // 선지 사이(발문과 첫 선지 사이 포함) 빈 줄은 뺌
      if (b.type === 'blank' && bl.length && (bl[bl.length - 1].type === 'choice' || bl[bl.length - 1].type === 'q')) {
        let j = k; while (j < blocks.length && (blocks[j].type === 'blank' || blocks[j].type === 'colbreak')) j++;
        if (blocks[j] && blocks[j].type === 'choice') return;
      }
      if (cb && b.type === 'blank') return; // 단 첫머리 빈 줄은 뺌
      // 문항/묶음 앞 빈 줄 자동 (단 첫머리는 빼고)
      if (opt.autoGap && !cb && (b.type === 'q' || b.type === 'group') && bl.length) {
        const prev = bl[bl.length - 1];
        if (prev.type !== 'blank' && prev.type !== 'group') bl.push({ type: 'blank', auto: true });
      }
      bl.push(cb ? Object.assign({}, b, { cb: true }) : b); cb = false;
    });
    const items = [];
    for (let k = 0; k < bl.length; k++) {
      const b = bl[k], cb = !!b.cb;
      if (b.type === 'blank') items.push({ k: 'p', pp: 6, style: 0, base: 'P', runs: [], cb });
      else if (b.type === 'group') items.push({ k: 'p', pp: 11, style: 1, base: 'S', runs: boldPrefix(b.runs, RE_GROUP), cb });
      else if (b.type === 'q') items.push({ k: 'p', pp: 11, style: 1, base: 'S', runs: boldPrefix(b.runs, RE_Q), cb });
      else if (b.type === 'choice') {
        // 이어진 선지 줄들 중 한 줄에 가장 많이 들어간 개수로 칸을 맞춤 (①②③ / ④⑤ → 3칸)
        let s = k, cols = 0;
        while (s > 0 && bl[s - 1].type === 'choice') s--;
        for (let j = s; j < bl.length && bl[j].type === 'choice'; j++) cols = Math.max(cols, (textOf(bl[j].runs).match(/[①②③④⑤]/g) || []).length);
        const tab = textOf(b.runs).indexOf('\t') >= 0 && cols >= 2;
        items.push({ k: 'p', pp: 51, tabCols: tab ? cols : 0, style: 2, base: 'S', runs: b.runs, cb });
      }
      else if (b.type === 'passage') {
        const prevP = bl[k - 1] && bl[k - 1].type === 'passage' && !cb, nextP = bl[k + 1] && bl[k + 1].type === 'passage' && !bl[k + 1].cb;
        const pp = !prevP ? (nextP ? 28 : 6) : nextP ? 20 : 38;
        items.push({ k: 'p', pp, style: 0, base: 'P', runs: b.runs, cb });
      }
      else if (b.type === 'box') items.push({ k: 'box', lines: b.lines.length ? b.lines : [[]], title: false, cb });
      else if (b.type === 'bogi') items.push({ k: 'box', lines: b.lines.length ? b.lines : [[]], title: true, cb });
      else if (b.type === 'dialog') {
        b.lines.forEach((runs, j) => {
          const c = cb && j === 0;
          const t = textOf(runs);
          if (!t.trim()) { items.push({ k: 'p', pp: 6, style: 0, base: 'P', runs: [], cb: c }); return; }
          let speaker = '', rest = runs;
          if (runs[0] && runs[0].b && runs.length > 1) { speaker = runs[0].t.trim(); rest = runs.slice(1); }
          else {
            const m = t.match(/^\s*([^:：\t]{1,25}?)\s*(?:[:：]|\t)\s*/);
            if (m) { speaker = m[1]; rest = sliceRuns(runs, m[0].length); }
          }
          items.push({ k: 'p', pp: j === 0 ? 51 : 52, style: 2, base: 'D', head: speaker, runs: trimStart(rest), cb: c });
        });
      }
    }
    return items;
  }

  // 문단 계획 → 본문 XML
  function renderBlocks(ct, blocks, opt) {
    const BASE = { P: { h: 1000, sp: 0 }, S: { h: 950, sp: 0 }, D: { h: 1000, sp: -3 } };
    let xml = '';
    for (const it of planBlocks(blocks, opt)) {
      if (it.k === 'box') {
        let inner = it.title ? para(19, 3, '<hp:run charPrIDRef="' + ct.get({ h: 1000, sp: 0, b: true }) + '"><hp:t>&lt; 보 기 &gt;</hp:t></hp:run>') : '';
        inner += it.lines.map(r => para(it.title ? 19 : 14, 3, runsXml(ct, r, BASE.S))).join('');
        xml += boxPara(ct, inner, it.title ? 282 + 1520 * (it.lines.length + 1) : 282 + 1430 * it.lines.length, it.cb);
        continue;
      }
      const base = BASE[it.base];
      if (!it.runs.length && !it.head) { xml += para(it.pp, it.style, '<hp:run charPrIDRef="' + ct.get(base) + '"/>', it.cb); continue; }
      const pp = it.tabCols && opt.choiceTabs[it.tabCols] ? opt.choiceTabs[it.tabCols] : it.pp;
      const head = it.head ? '<hp:run charPrIDRef="' + ct.get({ h: 1000, sp: -3, b: true }) + '"><hp:t>' + esc(it.head) + '</hp:t></hp:run>' +
        '<hp:run charPrIDRef="' + ct.get(base) + '"><hp:t><hp:fwSpace/><hp:fwSpace/><hp:fwSpace/></hp:t></hp:run>' : '';
      xml += para(pp, it.style, head + (it.runs.length ? runsXml(ct, it.runs, base) : ''), it.cb);
    }
    return xml;
  }
  function sliceRuns(runs, n) {
    const out = [];
    for (const r of runs) {
      if (n >= r.t.length) { n -= r.t.length; continue; }
      out.push(Object.assign({}, r, { t: r.t.slice(n) })); n = 0;
    }
    return out;
  }
  function trimStart(runs) {
    const out = runs.slice();
    while (out.length && !out[0].t.trim()) out.shift();
    if (out.length) out[0] = Object.assign({}, out[0], { t: out[0].t.replace(/^\s+/, '') });
    return out;
  }

  // ---------- 첫 문단(머리 표, 안내 상자, 머리말/꼬리말) 채우기 ----------
  function fillHead(p0, meta) {
    const nO = +meta.nObj || 0, nS = +meta.nSub || 0, pO = +meta.ptsObj || 0, pS = +meta.ptsSub || 0;
    const tot = Math.round((pO + pS) * 100) / 100;
    const title = meta.sem + '학기 ' + meta.kind + '고사';
    const rep = (a, b) => { if (p0.indexOf(a) < 0) throw new Error('틀에서 찾을 수 없음: ' + a); p0 = p0.split(a).join(b); };
    const T = s => '<hp:t>' + esc(s) + '</hp:t>';
    rep(T('1학기 기말고사'), T(title));
    rep(T('1학년 '), T(meta.grade + '학년 '));
    rep(T('제 1학년'), T('제 ' + meta.grade + '학년'));
    rep(T('공통영어1'), T(meta.subject));
    rep(T('공통영어 1'), T(meta.subject));
    rep(T('총 26문항 (100점)'), T('총 ' + (nO + nS) + '문항 (' + tot + '점)'));
    rep(T('2026년 6월 26일 '), T(meta.dateText + ' '));
    rep(T('공통과목'), T(meta.category));
    rep(T('05'), T(meta.code));
    rep(T('과목코드 ( 05 )'), T('과목코드 ( ' + meta.code + ' )'));
    rep('<hp:t>선택형 1~22번<hp:fwSpace/>(80점)</hp:t>', nO ? '<hp:t>선택형 1~' + nO + '번<hp:fwSpace/>(' + pO + '점)</hp:t>' : '<hp:t/>');
    rep(T('서답형 1~4번 (20점)'), nS ? T('서답형 1~' + nS + '번 (' + pS + '점)') : '<hp:t/>');
    // 안내 상자
    if (nS) {
      rep(T('1번부터 22번까지는 선택형 문항이며'), T('1번부터 ' + nO + '번까지는 선택형 문항이며'));
      rep(T(', 서답형1~서답형4번'), T(', 서답형1~서답형' + nS + '번'));
    } else {
      rep(T('1번부터 22번까지는 선택형 문항이며'), T('1번부터 ' + nO + '번까지는 선택형 문항입니다.'));
      rep(T(', 서답형1~서답형4번'), '<hp:t/>');
      rep(T('까지는 서답형 문항입니다. 문제와 선택지를 잘 읽고 문제지'), T(' 문제와 선택지를 잘 읽고 문제지'));
    }
    if (meta.school) p0 = p0.split('면목고등학교').join(esc(meta.school));
    return p0;
  }

  // 꼬리말: 홀수쪽 '뒷면에 계속', 짝수쪽 '다음 장에 계속', 마지막 쪽은 없음
  // 꼬리말 영역은 '계속' 한 줄(CONT_L)만 쓰고 쪽 테두리 안에 포함시킴(footerInside).
  // 쪽 번호·저작권 문구는 테두리 아래 원래 자리에 글상자처럼 띄운 표로 넣음.
  const FOOT_ORIG = 2834, BOTTOM_ORIG = 1417, PAPER_H = 84188;
  const PN_TOP = CONT_L - 460; // 꼬리말 영역 위쪽 기준 → 원래 테두리 바로 아래
  function pageNumTable(innerParas) {
    const w = 53860, h = FOOT_ORIG - 120;
    return '<hp:tbl id="' + (1400000000 + (tblSeq++)) + '" zOrder="0" numberingType="TABLE" textWrap="TOP_AND_BOTTOM" textFlow="BOTH_SIDES" lock="0" dropcapstyle="None" pageBreak="NONE" repeatHeader="0" rowCnt="1" colCnt="1" cellSpacing="0" borderFillIDRef="1" noAdjust="0">' +
      '<hp:sz width="' + w + '" widthRelTo="ABSOLUTE" height="' + h + '" heightRelTo="ABSOLUTE" protect="0"/>' +
      '<hp:pos treatAsChar="0" affectLSpacing="0" flowWithText="1" allowOverlap="1" holdAnchorAndSO="0" vertRelTo="PAPER" horzRelTo="PAPER" vertAlign="TOP" horzAlign="CENTER" vertOffset="' + PN_TOP + '" horzOffset="0"/>' +
      '<hp:outMargin left="0" right="0" top="0" bottom="0"/><hp:inMargin left="0" right="0" top="0" bottom="0"/>' +
      '<hp:tr><hp:tc name="" header="0" hasMargin="1" protect="0" editable="0" dirty="0" borderFillIDRef="1">' +
      '<hp:subList id="" textDirection="HORIZONTAL" lineWrap="BREAK" vertAlign="BOTTOM" linkListIDRef="0" linkListNextIDRef="0" textWidth="0" textHeight="0" hasTextRef="0" hasNumRef="0">' +
      innerParas + '</hp:subList><hp:cellAddr colAddr="0" rowAddr="0"/><hp:cellSpan colSpan="1" rowSpan="1"/>' +
      '<hp:cellSz width="' + w + '" height="' + h + '"/><hp:cellMargin left="0" right="0" top="0" bottom="0"/></hp:tc></hp:tr></hp:tbl>';
  }
  function setupFooters(p0) {
    const re = /<hp:footer id="\d+" applyPageType="\w+">([\s\S]*?)<\/hp:footer>/g;
    const footers = p0.match(re); if (!footers || footers.length < 1) throw new Error('꼬리말을 찾을 수 없음');
    const plain = footers[footers.length - 1];
    const subOpen = plain.match(/<hp:subList [^>]*>/)[0].replace(/textHeight="\d+"/, 'textHeight="' + CONT_L + '"');
    const pnParas = plain.slice(plain.indexOf(subOpen.slice(0, 20)) >= 0 ? plain.indexOf('>', plain.indexOf('<hp:subList ')) + 1 : 0, plain.lastIndexOf('</hp:subList>'));
    const make = (id, type, cont) => '<hp:footer id="' + id + '" applyPageType="' + type + '">' + subOpen +
      '<hp:p id="' + PID + '" paraPrIDRef="74" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0"><hp:run charPrIDRef="8">' + pageNumTable(pnParas) +
      (cont ? '<hp:t>' + ICON + '</hp:t></hp:run><hp:run charPrIDRef="6"><hp:t>' + cont + '</hp:t></hp:run>' : '<hp:t/></hp:run>') +
      '</hp:p></hp:subList></hp:footer>';
    let i = 0;
    p0 = p0.replace(re, () => { i++; return i === 1 ? make(2, 'ODD', '뒷면에 계속☟') : make(1, 'EVEN', '다음 장에 계속☞'); });
    if (i === 1) throw new Error('꼬리말이 하나뿐임');
    // 꼬리말 높이를 줄인 만큼 아래 여백을 늘려 테두리 아래 끝은 원본과 같은 자리
    p0 = p0.replace(/footer="2834"/, 'footer="' + CONT_L + '"')
      .replace(/bottom="1417"\/><\/hp:pagePr>/, 'bottom="' + (BOTTOM_ORIG + FOOT_ORIG) + '"/></hp:pagePr>')
      .replace(/(<hp:pageBorderFill type="BOTH"[^>]*?)footerInside="0"/, '$1footerInside="1"');
    return { p0, lastFooter: make(3, 'BOTH', '') };
  }

  // ---------- 전체 ----------
  async function build(JSZip, templateBytes, meta, lineHtmls, opt) {
    opt = Object.assign({ autoGap: true }, opt || {});
    const zin = await JSZip.loadAsync(templateBytes);
    let header = await zin.file('Contents/header.xml').async('string');
    const sec = await zin.file('Contents/section0.xml').async('string');
    const ps = splitParas(sec);
    const head = sec.slice(0, ps[0][0]), tail = sec.slice(ps[ps.length - 1][1]);
    let p0 = sec.slice(ps[0][0], ps[0][1]);
    let pEnd = sec.slice(ps[ps.length - 2][0], ps[ps.length - 2][1]);
    const pBox = sec.slice(ps[ps.length - 1][0], ps[ps.length - 1][1]);

    p0 = fillHead(p0, meta);
    const f = setupFooters(p0); p0 = f.p0;
    // 마지막 쪽: '- 끝 -' 문단에 '계속' 없는 꼬리말을 새로 넣음
    pEnd = pEnd.replace(/(<hp:run charPrIDRef="\d+">)/, '$1<hp:ctrl>' + f.lastFooter + '</hp:ctrl>');

    const tabsAdded = addChoiceTabs(header);
    header = tabsAdded.header; opt.choiceTabs = tabsAdded.map;
    const ct = new CharTable(header);
    const blocks = classify(lineHtmls);
    const body = renderBlocks(ct, blocks, opt);
    const gap = para(36, 0, '<hp:run charPrIDRef="41"/>');
    header = ct.finish();

    const z = new JSZip();
    for (const name of Object.keys(zin.files)) {
      const fz = zin.files[name]; if (fz.dir) continue;
      if (name === 'Contents/section0.xml') z.file(name, head + p0 + body + gap + gap + pEnd + pBox + tail);
      else if (name === 'Contents/header.xml') z.file(name, header);
      else z.file(name, await fz.async('uint8array'), name === 'mimetype' ? { compression: 'STORE' } : {});
    }
    const prv = blocks.filter(b => b.type !== 'answer').map(b => b.runs ? textOf(b.runs) : (b.lines || []).map(textOf).join('\n')).join('\n');
    z.file('Preview/PrvText.txt', prv.slice(0, 1000));
    return z.generateAsync({ type: opt.type || 'uint8array', compression: 'DEFLATE', mimeType: 'application/hwp+zip' });
  }

  function stats(lineHtmls) {
    const bl = classify(lineHtmls);
    // 직접 발문으로 지정했지만 번호도 배점도 없는 줄(예: 안내 문장)은 문항으로 세지 않음
    const qs = bl.filter(b => b.type === 'q' && (b.num != null || b.pts != null));
    // 1-1. 1-2. 처럼 딸린 문항은 앞 번호(1)와 한 문항으로 셈 (배점은 모두 더함)
    // 배점 없는 1. 바로 뒤에 1-1. 이 이어지면 1. 은 묶음 발문이라 배점이 없어도 됨
    const head = qs.map((q, i) => !(q.part != null && i > 0 && qs[i - 1].num === q.num && qs[i - 1].sub === q.sub));
    const isParent = (q, i) => q.part == null && qs[i + 1] && qs[i + 1].part != null && qs[i + 1].num === q.num;
    const obj = qs.filter(q => !q.sub), sub = qs.filter(q => q.sub);
    const sum = a => Math.round(a.reduce((s, q) => s + (q.pts || 0), 0) * 100) / 100;
    const cnt = isSub => qs.filter((q, i) => head[i] && q.sub === isSub).length;
    return { blocks: bl, nObj: cnt(false), nSub: cnt(true), ptsObj: sum(obj), ptsSub: sum(sub), noPts: qs.filter((q, i) => q.pts == null && !isParent(q, i)).length };
  }

  const api = { build, classify, parseLine, stats, planBlocks, textOf, qInfo, isQ, forcedOf, stripForce, FORCE_CH, RE_FORCE, RE_ANSWER, RE_Q, RE_GROUP, RE_COLBREAK };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.ExamHwpx = api;
})(typeof window !== 'undefined' ? window : globalThis);
