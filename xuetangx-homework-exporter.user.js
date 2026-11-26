// ==UserScript==
// @name         学堂在线作业导出
// @namespace    https://www.xuetangx.com/
// @version      0.3.1
// @description  一键合并导出学堂在线各章作业题目；支持单份作业 Markdown、JSON 与打印/PDF。
// @author       Codex
// @match        https://www.xuetangx.com/learn/space/*/*/*/exercise/*
// @match        https://www.xuetangx.com/h5/homework/*
// @run-at       document-idle
// @grant        GM_registerMenuCommand
// ==/UserScript==
(function () {
  'use strict';
  const VERSION = '0.3.1';
  const S = { busy: false, data: null, logs: [] };
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const txt = el => (el?.innerText || el?.textContent || '').replace(/\r/g, '').replace(/[ \t]+\n/g, '\n').trim();
  const clean = s => String(s ?? '').replace(/\u00a0/g, ' ').replace(/[ \t]*\n[ \t]*/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const pad = n => String(n).padStart(2, '0');
  const stamp = () => { const d = new Date(); return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`; };
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  function log(m) { S.logs.push(`[${new Date().toLocaleTimeString()}] ${m}`); S.logs = S.logs.slice(-80); const e = $('#xtx-he-log'); if (e) e.textContent = S.logs.join('\n'); }
  function download(name, data, type = 'text/plain;charset=utf-8') {
    const b = new Blob([data], { type }); const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = name;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }
  function ensureUI() {
    if ($('#xtx-he-root')) return;
    const r = document.createElement('div'); r.id = 'xtx-he-root'; r.innerHTML = `
      <style>
      #xtx-he-root{position:fixed;right:20px;top:110px;z-index:2147483000;font:14px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei",sans-serif;color:#172033;pointer-events:none}#xtx-he-root>*{pointer-events:auto}
      #xtx-he-toggle{background:#3766ff;color:#fff;border:0;border-radius:12px;padding:10px 16px;box-shadow:0 8px 30px #293d7a44;cursor:pointer;font-weight:600}
      #xtx-he-panel{display:none;width:360px;max-height:72vh;overflow:auto;background:#fff;border:1px solid #dfe6f4;border-radius:16px;box-shadow:0 20px 60px #1c2d5540;margin-top:8px;padding:16px}
      #xtx-he-root.open #xtx-he-panel{display:block}
      #xtx-he-panel h3{margin:0 0 6px;font-size:17px}
      .xtx-he-muted{color:#69758a;font-size:12px}
      .xtx-he-actions{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:12px 0}
      .xtx-he-actions button{border:1px solid #dce4f2;background:#f7f9fe;border-radius:9px;padding:8px;cursor:pointer;color:#22355c}
      .xtx-he-actions button.primary{background:#3766ff;color:#fff;border-color:#3766ff}
      .xtx-he-actions button:disabled{opacity:.5;cursor:wait}
      #xtx-he-log{white-space:pre-wrap;background:#f6f8fc;border-radius:9px;padding:8px;font:11px/1.5 ui-monospace,Consolas,monospace;max-height:200px;overflow:auto}
      .xtx-he-close{float:right;background:none;border:0;font-size:18px;cursor:pointer;color:#7a8497}
      </style>
      <button id="xtx-he-toggle">导出作业</button>
      <div id="xtx-he-panel">
        <button class="xtx-he-close" title="收起">×</button>
        <h3>学堂作业导出 <span class="xtx-he-muted">v${VERSION}</span></h3>
        <div class="xtx-he-muted">只读取页面，不会提交作业。</div>
        <div class="xtx-he-actions">
          <button data-act="course" class="primary">一键导出全课程</button>
          <button data-act="scan">导出全部题目</button>
          <button data-act="one">导出当前题</button>
          <button data-act="md">Markdown</button>
          <button data-act="json">JSON</button>
          <button data-act="print">打印 / PDF</button>
          <button data-act="raw">复制原始数据</button>
        </div>
        <div class="xtx-he-muted" id="xtx-he-summary">尚未读取</div>
        <div id="xtx-he-log"></div>
      </div>`;
    document.documentElement.appendChild(r);
    const toggle = r.querySelector('#xtx-he-toggle');
    const close = r.querySelector('.xtx-he-close');
    if (toggle) toggle.onclick = () => r.classList.toggle('open');
    if (close) close.onclick = () => r.classList.toggle('open');
    r.addEventListener('click', e => { const b = e.target.closest('[data-act]'); if (b) run(b.dataset.act, b); });
    log('导出面板已就绪');
  }
  function summary(d) { const e = $('#xtx-he-summary'); if (e) e.textContent = d ? `${d.title || '当前作业'} · ${d.questions.length} 题 · ${new Date().toLocaleString()}` : '尚未读取'; }
  function currentIndex() { const m = txt($('.tabbar .curent')).match(/(\d+)/); return Number(m && m[1]) || 0; }
  function totalCount() { return Number((txt($('.tabbar .total')).match(/(\d+)/) || [])[1]) || 0; }
  function questionView() {
    const question = $('.question');
    if (!question) return null;
    const body = $('.leftQuestion', question) || question;
    const stem = $('.fuwenben', body) || body;
    return { body, markup: body.innerHTML, ready: Boolean(txt(stem) || $('img', stem)) };
  }
  async function waitForQuestion(atExpectedPage, previous, timeout) {
    const deadline = Date.now() + timeout;
    let unchangedSince = 0;
    while (true) {
      const current = atExpectedPage() ? questionView() : null;
      if (current?.ready) {
        if (current.body !== previous?.body || current.markup !== previous?.markup) return true;
        unchangedSince ||= Date.now();
      } else {
        unchangedSince = 0;
      }
      if (Date.now() >= deadline) {
        // Identical questions may reuse the existing markup. Give the site its
        // full loading window before accepting content that never changed.
        return Boolean(unchangedSince && Date.now() - unchangedSince >= 5000);
      }
      await sleep(100);
    }
  }
  async function goTo(target) {
    const page = location.href;
    if (!currentIndex() || target < 1 || target > totalCount()) return false;
    while (currentIndex() !== target) {
      const current = currentIndex();
      const backward = target < current;
      const control = $(backward ? '.tabbar > i:first-of-type' : '.tabbar > i:last-of-type');
      if (!control) return false;
      const previous = questionView();
      const next = current + (backward ? -1 : 1);
      control.click();
      if (!(await waitForQuestion(() => location.href === page && currentIndex() === next, previous, 7000))) return false;
    }
    return true;
  }
  function richText(el) {
    if (!el) return '';
    const images = $$('img', el).map(img => img.currentSrc || img.src).filter(src => /^https?:/.test(src));
    const body = clean(txt(el));
    return [body, ...images.map(src => `[图片: ${src}]`)].filter(Boolean).join('\n');
  }
  function parseRich(el) { return richText(el); }
  function answerValue(q) {
    let nodes = $$('.answerCon .radio_xtb', q);
    if (!nodes.length) nodes = $$('.answerCon .radio_xtb');
    if (!nodes.length) return '';
    const isJudge = nodes.some(n => /panduan/.test(n.className));
    if (isJudge) {
      const chosen = nodes.findIndex(n => /\bactive\b/.test(n.className));
      if (chosen >= 0) return chosen === 0 ? '正确' : '错误';
      const checked = nodes.findIndex(n => /\btrue\b/.test(n.className));
      return checked >= 0 ? '正确（答案）' : '';
    }
    return nodes.filter(n => /\bactive\b/.test(n.className)).map(n => clean(txt(n))).filter(Boolean).join('');
  }
  function parseQuestion(q, index) {
    const heading = clean(txt($('.title', q)));
    const type = heading.replace(/\s*\(\d+(?:\.\d+)?\s*分\)\s*$/, '').trim() || '题目';
    const score = (heading.match(/\((\d+(?:\.\d+)?)\s*分\)/) || [])[1] || '';
    const left = $('.leftQuestion', q) || q;
    const optionsContainer = $$('.leftradio', left).length ? left : null;
    const prompt = parseRich($('.fuwenben', left) || left);
    const options = optionsContainer ? $$('.leftradio', optionsContainer).map((e, j) => {
      const letter = clean(txt($('.radio_xtb', e))) || String.fromCharCode(65 + j);
      const label = e.querySelectorAll('span')[1] || e;
      return { letter, text: parseRich(label) };
    }) : [];
    return { number: index, type, score: score ? score + ' 分' : '', prompt, options, answer: answerValue(q), analysis: parseRich($('.analysis,.answerAnalysis,.explain,.jiexi', q)) };
  }
  function makeData(questions, source) {
    return { title: title(), url: location.href, exportedAt: new Date().toISOString(), current: currentIndex(), total: totalCount(), source, questions };
  }
  function captureOne() {
    const q = $('.question'); if (!q) throw new Error('未找到题目；请打开作业作答页。');
    return makeData([parseQuestion(q, currentIndex() || 1)], 'current-question');
  }
  async function captureAll() {
    const page = location.href;
    const total = totalCount(); if (!total) throw new Error('未识别题目总数；请确认页面已加载完成。');
    const original = currentIndex();
    log(`准备从第 1 题读取到第 ${total} 题`);
    if (!(await goTo(1))) throw new Error('无法回到第 1 题；请手动点击左侧箭头后再试。');
    const questions = [];
    for (let i = 1; i <= total; i++) {
      if (location.href !== page || totalCount() !== total) throw new Error('读取时切换了作业');
      if (currentIndex() !== i) {
        if (!(await goTo(i))) throw new Error(`无法切换到第 ${i} 题`);
      }
      const qEl = $('.question'); if (!qEl) throw new Error(`第 ${i} 题未渲染`);
      const q = parseQuestion(qEl, i); if (!q.prompt) throw new Error(`第 ${i} 题题干为空，页面可能尚未加载`);
      questions.push(q);
      log(`已读取 ${i}/${total}`);
    }
    log(`完成 ${questions.length} 题；原题号 ${original}`);
    return makeData(questions, 'all-questions');
  }
  function title() {
    for (const s of ['.unit-title', '.menu-content-item.is-active .item-name', '.classNameTitle', '.unit-name', '.course-title', '.course-name', 'h1']) { const t = clean(txt($(s))); if (t && t.length < 120) return t; }
    return document.title.replace(/\s*[-|].*$/, '').trim() || '学堂在线作业';
  }
  function chapterMenus(item) {
    const menus = [];
    for (let parent = item.parentElement; parent; parent = parent.parentElement) {
      if (parent.matches('.lesson-graph-menu')) menus.unshift(parent);
    }
    return menus;
  }
  function courseAssignments() {
    const assignments = new Map();
    for (const item of $$('.menu-content-item[id^="unit-item-"]')) {
      const kind = txt($('.item-type', item));
      const name = txt($('.item-name', item));
      const id = item.id.slice('unit-item-'.length);
      if (!id || !name || !/^(作业|测验|练习|习题)$/.test(kind) || assignments.has(id)) continue;
      const chapters = chapterMenus(item).map(menu => txt($(':scope > .menu-title .menu-title-text', menu))).filter(Boolean);
      assignments.set(id, { id, name, chapters });
    }
    return [...assignments.values()];
  }
  function activeAssignment() {
    return location.pathname.match(/\/exercise\/([^/]+)\/?$/)?.[1] || '';
  }
  async function openAssignment(assignment) {
    const current = activeAssignment() === assignment.id;
    const expected = () => activeAssignment() === assignment.id && currentIndex() > 0 &&
      currentIndex() <= totalCount() && title().replace(/\s/g, '') === assignment.name.replace(/\s/g, '');
    if (current && expected() && questionView()?.ready) return;

    const previous = current ? null : questionView();
    if (!current) {
      const itemId = `unit-item-${assignment.id}`;
      const item = document.getElementById(itemId);
      if (!item) throw new Error('目录中找不到作业入口');
      for (const menu of chapterMenus(item)) {
        const content = $(':scope > .menu-content', menu);
        if (content && (content.hidden || getComputedStyle(content).display === 'none')) {
          $(':scope > .menu-title', menu)?.click();
          await Promise.resolve();
        }
      }
      const row = document.getElementById(itemId);
      if (!row) throw new Error('无法打开作业入口');
      row.click();
    }
    if (!(await waitForQuestion(expected, previous, 12000))) throw new Error('等待作业题目加载超时');
  }
  function fileTitle(name) {
    return name.replace(/[\\/:*?"<>|]+/g, '_').slice(0, 80);
  }
  async function exportCourse() {
    const assignments = courseAssignments();
    if (!assignments.length) throw new Error('请打开新版课程的作业页，并将目录筛选设为“全部”');
    const course = txt($('.course-title, .course-name')) || document.title.split(' - ')[0].trim() || '学堂在线';
    const original = assignments.find(assignment => assignment.id === activeAssignment());
    const originalQuestion = currentIndex();
    const completed = [];
    const failures = [];
    const status = $('#xtx-he-summary');

    for (const [index, assignment] of assignments.entries()) {
      const progress = `${index + 1}/${assignments.length} · ${assignment.name}`;
      status.textContent = progress;
      log(progress);
      try {
        await openAssignment(assignment);
        const { questions } = await captureAll();
        completed.push({ ...assignment, questions });
      } catch (error) {
        failures.push({ name: assignment.name, reason: error.message });
        log(`未导出 ${assignment.name} · ${error.message}`);
      }
    }

    if (original) {
      try {
        await openAssignment(original);
        if (originalQuestion && !(await goTo(originalQuestion))) log('无法恢复原题号');
      } catch (error) {
        log(`无法返回原作业 · ${error.message}`);
      }
    }

    const total = completed.reduce((sum, assignment) => sum + assignment.questions.length, 0);
    const report = `已导出 ${completed.length}/${assignments.length} 份作业，共 ${total} 题`;
    status.textContent = report;
    if (!completed.length) throw new Error('本次没有成功读取的作业，请查看面板日志');
    const parts = [`# ${course} · 课程题目`, '', report, ''];
    for (const assignment of completed) {
      parts.push(`## ${[...assignment.chapters, assignment.name].join(' · ')}`, '', `${assignment.questions.length} 题`, '');
      for (const question of assignment.questions) parts.push(questionMarkdown(question, '###', false));
    }
    if (failures.length) {
      parts.push('## 未导出的作业', '', ...failures.map(({name, reason}) => `- ${name} · ${reason}`), '');
    }
    download(`${fileTitle(course)}-课程题目-${stamp()}.md`, parts.join('\n'), 'text/markdown;charset=utf-8');
    log(report);
  }
  async function run(act, btn) {
    if (S.busy) return;
    S.busy = true; if (btn) btn.disabled = true;
    try {
      if (act === 'course') {
        await exportCourse();
        return;
      }
      let d = S.data?.url === location.href ? S.data : null;
      if (act === 'scan') d = await captureAll();
      else if (act === 'one') d = captureOne();
      else if (!d) d = captureOne();
      S.data = d; summary(d);
      const name = fileTitle(d.title || '学堂在线作业');
      if (act !== 'scan' && act !== 'one') log(`使用缓存数据（${d.questions.length} 题）`);
      if (act === 'md') download(`${name}-${stamp()}.md`, toMarkdown(d), 'text/markdown;charset=utf-8');
      if (act === 'json') download(`${name}-${stamp()}.json`, JSON.stringify(d, null, 2), 'application/json;charset=utf-8');
      if (act === 'raw') { if (!navigator.clipboard?.writeText) throw new Error('浏览器未提供剪贴板权限'); await navigator.clipboard.writeText(JSON.stringify(d, null, 2)); log('原始 JSON 已复制'); }
      if (act === 'print') printInline(d);
    } catch (e) { console.error('[XTX-HE]', e); log('失败: ' + e.message); alert('操作失败：' + e.message + '\n\n可在控制台查看 [XTX-HE] 日志。'); }
    finally { S.busy = false; if (btn) btn.disabled = false; }
  }
  function questionMarkdown(q, heading, withAnswers) {
    let s = `${heading} ${q.number}. ${q.type}${q.score ? '（' + q.score + '）' : ''}\n\n${q.prompt}\n\n`;
    for (const o of q.options || []) s += `- **${o.letter}.** ${o.text}\n`;
    if (withAnswers) {
      if (q.answer) s += `\n> 作答：${q.answer}\n`;
      if (q.analysis) s += `\n**解析：** ${q.analysis}\n`;
    }
    return `${s}\n---\n\n`;
  }
  function toMarkdown(d) {
    const header = `# ${d.title}\n\n- 来源：${d.url}\n- 导出时间：${new Date(d.exportedAt || Date.now()).toLocaleString()}\n- 题数：${d.questions.length}\n\n`;
    return header + d.questions.map(question => questionMarkdown(question, '##', true)).join('');
  }
  function printInline(d) {
    const old = $('#xtx-he-print'); if (old) old.remove();
    const root = document.createElement('div'); root.id = 'xtx-he-print';
    root.innerHTML = `<style>#xtx-he-print{position:fixed;inset:0;z-index:2147483647;overflow:auto;background:#fff;color:#172033;font:16px/1.8 "Microsoft YaHei",sans-serif;padding:0 24px 60px}#xtx-he-print .bar{position:sticky;top:0;background:#fff;border-bottom:1px solid #dbe3f1;padding:12px 0;display:flex;justify-content:space-between;align-items:center;z-index:2}#xtx-he-print .bar button{background:#3766ff;border:0;border-radius:8px;color:#fff;padding:8px 16px;cursor:pointer}#xtx-he-print main{max-width:900px;margin:24px auto}#xtx-he-print h1{font-size:28px}#xtx-he-print h2{font-size:19px;color:#234;margin-top:32px}#xtx-he-print blockquote{background:#f4f7ff;padding:8px 14px;border-left:3px solid #3766ff;margin:14px 0}@media print{#xtx-he-print .bar{display:none}#xtx-he-print{position:static;padding:0}#xtx-he-print main{margin:0}body>*:not(#xtx-he-print){display:none!important}#xtx-he-print section{break-inside:avoid}}</style><div class="bar"><strong>打印预览</strong><span><button id="xtx-he-do-print">打印 / 另存为 PDF</button> <button id="xtx-he-close-print" style="background:#eef2fb;color:#22355c">关闭</button></span></div><main><h1>${esc(d.title)}</h1><p>导出于 ${new Date().toLocaleString()} · ${d.questions.length} 题</p>${d.questions.map(q => `<section><h2>${q.number}. ${esc(q.type)}${q.score ? '（' + esc(q.score) + '）' : ''}</h2><div>${esc(q.prompt).replace(/\n/g, '<br>')}</div>${(q.options || []).map(o => `<p><b>${esc(o.letter)}.</b> ${esc(o.text)}</p>`).join('')}${q.answer ? `<blockquote>作答：${esc(q.answer)}</blockquote>` : ''}${q.analysis ? `<p><b>解析：</b>${esc(q.analysis)}</p>` : ''}</section>`).join('<hr>')}</main>`;
    document.documentElement.appendChild(root);
    $('#xtx-he-do-print').onclick = () => window.print();
    $('#xtx-he-close-print').onclick = () => root.remove();
    log('已打开页面内打印预览');
  }
  ensureUI();
  if (typeof GM_registerMenuCommand === 'function') GM_registerMenuCommand('导出全部作业题', () => run('scan'));
  log('脚本版本 ' + VERSION); console.info('[XTX-HE] ready', VERSION);
})();
