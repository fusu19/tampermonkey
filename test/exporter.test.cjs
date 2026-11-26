const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { test } = require('node:test');
const { setTimeout: delay } = require('node:timers/promises');

const { JSDOM } = require('jsdom');
const script = readFileSync(process.argv[2], 'utf8');

function buildExercise(context, { matchingPrompts = false, initial = 1, questionTotal = 2, nextDelay = 0 } = {}) {
  const dom = new JSDOM(`<!doctype html><body>
    <div class="unit-title">测试一</div>
    <div class="tabbar"><i class="iconfont">上一题</i><span class="curent"></span>
      <span class="total">/2</span><i class="iconfont right">下一题</i></div>
    <div class="question"></div><div class="answer showUntil"></div>
  </body>`, {
    url: 'https://www.xuetangx.com/learn/space/course/course/section/exercise/100',
    runScripts: 'outside-only',
  });
  const { window } = dom;
  context.after(() => window.close());
  const { document } = window;
  const alerts = [];
  const blobs = new Map();
  const downloads = [];
  let latest;
  let current;
  let section = 1;
  let total = questionTotal;

  window.alert = message => alerts.push(message);
  window.console.error = () => {};
  window.console.info = () => {};
  Object.defineProperty(window.navigator, 'clipboard', {
    value: { writeText: async text => { latest = JSON.parse(text); } },
  });
  window.URL.createObjectURL = blob => {
    const url = `blob:https://www.xuetangx.com/${blobs.size + 1}`;
    blobs.set(url, blob);
    return url;
  };
  window.URL.revokeObjectURL = url => blobs.delete(url);
  document.addEventListener('click', event => {
    const link = event.target.closest('a[download]');
    if (!link) return;
    event.preventDefault();
    downloads.push({ name: link.download, blob: blobs.get(link.href) });
  });

  function render(number) {
    current = number;
    document.querySelector('.curent').textContent = String(number);
    document.querySelector('.total').textContent = `/${total}`;
    const text = matchingPrompts ? '相同题干' : `第 ${section} 份测试的第 ${number} 题`;
    document.querySelector('.question').innerHTML = `<p class="title">单选题 <span>(1分)</span></p>
      <div class="leftQuestion showUntil"><div class="fuwenben"><p>${text}</p></div>
        <div class="leftradio"><span class="radio_xtb">A</span><span>选项甲</span></div>
        <div class="leftradio"><span class="radio_xtb">B</span><span>选项乙</span></div>
      </div>`;
    document.querySelector('.answer').innerHTML = `<div class="answerCon">
      <span class="radio_xtb">A</span><span class="radio_xtb">B</span></div>`;
  }

  document.querySelector('.tabbar > i:first-of-type').onclick = () => render(Math.max(1, current - 1));
  document.querySelector('.tabbar > i.right').onclick = () => {
    const next = Math.min(total, current + 1);
    document.querySelector('.curent').textContent = String(next);
    if (nextDelay) window.setTimeout(() => render(next), nextDelay);
    else render(next);
  };
  render(initial);
  window.eval(script);

  return {
    document,
    switchAssignment(assignment = { id: 101, name: '测试二' }, { wait = 0 } = {}) {
      section = assignment.id - 99;
      total = assignment.total ?? 2;
      window.history.pushState({}, '', String(assignment.id));
      document.querySelector('.unit-title').textContent = assignment.name;
      const row = document.getElementById(`unit-item-${assignment.id}`);
      document.querySelector('.menu-content-item.is-active')?.classList.remove('is-active');
      row?.classList.add('is-active');
      if (wait) window.setTimeout(() => render(1), wait);
      else render(1);
    },
    async click(action) {
      const button = document.querySelector(`[data-act="${action}"]`);
      assert.ok(button, `Missing ${action} button`);
      button.click();
      const deadline = Date.now() + 10000;
      while (button.disabled && Date.now() < deadline) await delay(20);
      assert.equal(button.disabled, false, `${action} did not finish`);
      assert.deepEqual(alerts, [], alerts.join('\n'));
    },
    downloadData() { return latest; },
    async readDownloads() {
      return Promise.all(downloads.map(({ name, blob }) => new Promise((resolve, reject) => {
        const reader = new window.FileReader();
        reader.onload = () => resolve({ name, text: reader.result });
        reader.onerror = () => reject(reader.error);
        reader.readAsText(blob);
      })));
    },
  };
}

test('未作答时仍导出完整题干和选项', async context => {
  const exercise = buildExercise(context);
  exercise.document.querySelector('.answer').remove();
  await exercise.click('one');
  await exercise.click('raw');
  assert.deepEqual(exercise.downloadData().questions, [{
    number: 1, type: '单选题', score: '1 分', prompt: '第 1 份测试的第 1 题',
    options: [{ letter: 'A', text: '选项甲' }, { letter: 'B', text: '选项乙' }],
    answer: '', analysis: '',
  }]);
});

test('从第二题开始全量导出时，两道相同的题仍保留各自题号', async context => {
  const exercise = buildExercise(context, { matchingPrompts: true, initial: 2 });
  await exercise.click('scan');
  await exercise.click('raw');
  const { questions, total } = exercise.downloadData();
  assert.equal(total, 2);
  assert.deepEqual(questions.map(question => [question.number, question.prompt]), [[1, '相同题干'], [2, '相同题干']]);
});

test('单题导出保留原题号和可见的已选选项', async context => {
  const exercise = buildExercise(context, { initial: 2 });
  exercise.document.querySelector('.answerCon span:last-child').classList.add('active');
  await exercise.click('one');
  await exercise.click('raw');
  const [question] = exercise.downloadData().questions;
  assert.equal(question.number, 2);
  assert.equal(question.answer, 'B');
});

test('切换作业后导出当前作业的数据', async context => {
  const exercise = buildExercise(context);
  await exercise.click('one');
  exercise.switchAssignment();
  await exercise.click('raw');
  const result = exercise.downloadData();
  assert.equal(result.title, '测试二');
  assert.equal(result.questions[0].prompt, '第 2 份测试的第 1 题');
});

function installCourseMenu(exercise, { missingAfterNavigation = false } = {}) {
  const { document } = exercise;
  const nav = document.createElement('nav');
  nav.innerHTML = `<h1 class="course-title">课程名称</h1>
    <div class="lesson-graph-menu">
      <div class="menu-title"><span class="menu-title-text">总论</span></div>
      <div class="menu-content">
        <div id="unit-item-100" class="menu-content-item is-active"><div class="item-type">作业</div><div class="item-name">测试一</div></div>
        <div id="unit-item-199" class="menu-content-item"><div class="item-type">视频</div><div class="item-name">导学视频</div></div>
      </div>
    </div>
    <div class="lesson-graph-menu">
      <div class="menu-title"><span class="menu-title-text">第二章</span></div>
      <div class="menu-content" style="display:none">
        <div id="unit-item-101" class="menu-content-item"><div class="item-type">作业</div><div class="item-name">测试二</div></div>
      </div>
    </div>
    <div id="unit-item-102" class="menu-content-item"><div class="item-type">作业</div><div class="item-name">期中作业</div></div>`;
  document.body.prepend(nav);
  const visited = [];
  const open = nav.querySelectorAll('.menu-title')[1];
  open.onclick = () => { open.nextElementSibling.style.display = ''; };
  nav.querySelector('#unit-item-199').onclick = () => visited.push('video');
  for (const assignment of [{ id: 100, name: '测试一' }, { id: 101, name: '测试二' }, { id: 102, name: '期中作业' }]) {
    nav.querySelector(`#unit-item-${assignment.id}`).onclick = () => {
      visited.push(assignment.id);
      if (assignment.id === 101) {
        assert.equal(open.nextElementSibling.style.display, '');
        if (missingAfterNavigation) nav.querySelector('#unit-item-102').remove();
      }
      exercise.switchAssignment(assignment, { wait: 250 });
    };
  }
  return visited;
}

test('课程按钮按目录读取三份作业并自动下载合并 Markdown', async context => {
  const exercise = buildExercise(context, { initial: 2 });
  const visited = installCourseMenu(exercise);
  await exercise.click('course');
  const exports = await exercise.readDownloads();
  assert.equal(exports.length, 1);
  const [{ name, text }] = exports;
  assert.match(name, /^课程名称.*\.md$/);
  assert.match(text, /已导出 3\/3 份作业，共 6 题/);
  const headings = ['## 总论 · 测试一', '## 第二章 · 测试二', '## 期中作业'];
  assert.deepEqual(text.split('\n').filter(line => /^## /.test(line)), headings);
  for (let section = 1; section <= 3; section++) {
    for (let number = 1; number <= 2; number++) assert.ok(text.includes(`第 ${section} 份测试的第 ${number} 题`));
  }
  assert.match(text, /\*\*A\.\*\* 选项甲/);
  assert.deepEqual(visited, [101, 102, 100]);
  assert.equal(exercise.document.querySelector('.curent').textContent, '2');
});

test('无法打开的作业列在合并文件中，已完成的作业仍可下载', async context => {
  const exercise = buildExercise(context);
  installCourseMenu(exercise, { missingAfterNavigation: true });
  await exercise.click('course');
  const [{ text }] = await exercise.readDownloads();
  assert.match(text, /已导出 2\/3 份作业，共 4 题/);
  assert.match(text, /## 未导出的作业\s+- 期中作业/);
});

test('题号先变化、题干稍后加载时，导出等待新的题干', async context => {
  const exercise = buildExercise(context, { nextDelay: 1600 });
  await exercise.click('scan');
  await exercise.click('raw');
  assert.deepEqual(exercise.downloadData().questions.map(({ prompt }) => prompt), [
    '第 1 份测试的第 1 题', '第 1 份测试的第 2 题',
  ]);
});

test('按真实题量模拟 10 份作业，584 题逐份保留原题号', async context => {
  const totals = [13, 80, 57, 69, 66, 65, 66, 85, 82, 1];
  const exercise = buildExercise(context, { questionTotal: totals[0] });
  const nav = exercise.document.createElement('nav');
  exercise.document.body.prepend(nav);
  for (const [index, total] of totals.entries()) {
    const assignment = { id: 100 + index, name: `测试 ${index + 1}`, total };
    const row = exercise.document.createElement('div');
    row.id = `unit-item-${assignment.id}`;
    row.className = 'menu-content-item';
    row.innerHTML = `<div class="item-type">作业</div><div class="item-name">${assignment.name}</div>`;
    row.onclick = () => exercise.switchAssignment(assignment);
    nav.append(row);
  }
  exercise.document.querySelector('.unit-title').textContent = '测试 1';

  await exercise.click('course');
  const [{ text }] = await exercise.readDownloads();
  assert.match(text, /已导出 10\/10 份作业，共 584 题/);
  const sections = text.split(/^## 测试 \d+$/m).slice(1);
  assert.deepEqual(sections.map(section => [...section.matchAll(/^### (\d+)\./gm)].map(match => Number(match[1]))),
    totals.map(total => Array.from({ length: total }, (_, index) => index + 1)));
});
