// Оценки: только для учителей после входа. Данные читаются из таблиц «Значимые оценки» на лету
// и живут только в памяти открытой страницы — в телефоне ничего не сохраняется.
import { el, ICON, norm, plural } from '../util.js';
import { chips, empty } from '../ui.js';

const marksOf = s => (String(s || '').match(/[1-5](?![0-9])/g) || []).map(Number);
const avg = list => list.length ? list.reduce((a, b) => a + b, 0) / list.length : null;
const fmtAvg = x => x === null ? '' : x.toFixed(1).replace('.', ',');
const avgClass = a => a === null ? '' : a >= 4.5 ? 'm5' : a >= 3.5 ? 'm4' : a >= 2.5 ? 'm3' : 'm2';
function markClass(s) {
  const m = marksOf(s);
  if (!m.length) return s ? 'mx' : '';
  const a = avg(m);
  return a >= 4.5 ? 'm5' : a >= 3.5 ? 'm4' : a >= 2.5 ? 'm3' : 'm2';
}

export function renderGrades(app) {
  const { S } = app;
  const view = el('div', { class: 'view' });
  view.appendChild(el('div', { class: 'view-head' }, [el('h1', { class: 'view-title', text: 'Оценки' })]));

  if (!S.me) {
    view.appendChild(empty('Только для учителей', 'Оценки видны после входа по личному коду.', el('button', { type: 'button', class: 'btn btn-primary', text: 'Войти', onclick: () => app.login() })));
    return view;
  }
  const G = S.grades || (S.grades = { classes: null, data: {}, cls: '', subj: '', q: '', loading: '', error: '' });

  if (!G.classes) {
    if (!G.loading && !G.error) load(app, 'classes');
    view.appendChild(G.error ? empty('Не получилось загрузить', G.error, retry(app)) : el('div', { class: 'loading', text: 'Загружаю список классов…' }));
    return view;
  }
  if (!G.classes.length) {
    view.appendChild(empty('Таблицы оценок не подключены', 'Ссылки на таблицы «Значимые оценки» добавляются во вкладке «Настройки» таблицы приложения.'));
    return view;
  }
  if (!G.cls || !G.classes.includes(G.cls)) G.cls = G.classes.includes(S.sel.cls) ? S.sel.cls : G.classes[0];
  view.appendChild(chips(G.classes, G.cls, v => { G.cls = v; G.subj = ''; G.error = ''; app.render(); }, { scroll: true, label: 'Класс' }));

  const data = G.data[G.cls];
  if (!data) {
    if (G.loading !== G.cls && !G.error) load(app, G.cls);
    view.appendChild(G.error ? empty('Не получилось загрузить оценки', G.error, retry(app)) : el('div', { class: 'loading', text: `Открываю таблицу оценок, ${G.cls}…` }));
    return view;
  }

  const tabs = [];
  if (data.summary) tabs.push({ value: '__summary', label: 'Сводка' });
  data.subjects.forEach(s => tabs.push({ value: s.name, label: s.name }));
  if (!tabs.length) { view.appendChild(empty('В таблице пока нет оценок', '')); return view; }
  if (!G.subj || !tabs.some(t => t.value === G.subj)) G.subj = tabs[0].value;
  view.appendChild(chips(tabs, G.subj, v => { G.subj = v; app.render(); }, { scroll: true, label: 'Предмет' }));

  const sheet = G.subj === '__summary' ? data.summary : data.subjects.find(s => s.name === G.subj);
  const input = el('input', { id: 'grades-q', type: 'search', class: 'search-input', placeholder: 'Найти ученика', autocomplete: 'off', value: G.q,
    'aria-label': 'Найти ученика', oninput: e => { G.q = e.target.value; drawTable(); } });
  view.appendChild(el('div', { class: 'grades-tools' }, [
    el('div', { class: 'search' }, [el('span', { html: ICON.search }), input]),
    el('button', { type: 'button', class: 'btn btn-ghost btn-sm', onclick: () => { delete G.data[G.cls]; app.render(); } }, ['Обновить'])
  ]));
  const box = el('div', { class: 'grades-box' });
  view.appendChild(box);
  view.appendChild(el('p', { class: 'hint' }, [
    'Оценки открываются прямо из таблицы и не сохраняются в телефоне. Исправить оценку можно только в самой ',
    data.url ? el('a', { href: data.url, target: '_blank', rel: 'noopener', text: 'таблице' }) : 'таблице', '.'
  ]));

  function drawTable() {
    box.innerHTML = '';
    const words = norm(G.q).split(/\s+/).filter(Boolean);
    const works = sheet.works;
    const table = el('table', { class: 'grades' });
    table.appendChild(el('thead', {}, [el('tr', {}, [
      el('th', { class: 'g-name', scope: 'col', text: 'Ученик' }),
      ...works.map(w => el('th', { scope: 'col', title: w.title }, [el('span', { text: w.title })])),
      G.subj === '__summary' ? null : el('th', { scope: 'col', class: 'g-avg', text: 'Ср.' })
    ])]));
    const tbody = el('tbody');
    let shown = 0;
    sheet.sections.forEach(sec => {
      const rows = sec.rows.filter(r => words.every(w => norm(r.name).includes(w)));
      if (!rows.length) return;
      if (sec.label && sheet.sections.length > 1) tbody.appendChild(el('tr', { class: 'g-sec' }, [el('th', { colspan: String(works.length + 2), scope: 'colgroup', text: sec.label })]));
      rows.forEach(r => {
        shown++;
        const all = r.marks.flatMap(marksOf);
        tbody.appendChild(el('tr', {}, [
          el('th', { class: 'g-name', scope: 'row', text: r.name }),
          ...r.marks.map(m => el('td', { class: markClass(m), text: m })),
          G.subj === '__summary' ? null : el('td', { class: 'g-avg ' + avgClass(avg(all)), text: fmtAvg(avg(all)) })
        ]));
      });
    });
    table.appendChild(tbody);
    if (!shown) { box.appendChild(empty('Никого не нашлось', `По запросу «${G.q}» учеников нет.`)); return; }
    const total = sheet.sections.reduce((n, s) => n + s.rows.length, 0);
    const twos = sheet.sections.reduce((n, s) => n + s.rows.filter(r => r.marks.some(m => marksOf(m).includes(2))).length, 0);
    box.appendChild(el('div', { class: 'grades-sum' }, [
      `${total} ${plural(total, 'ученик', 'ученика', 'учеников')} · ${works.length} ${plural(works.length, 'работа', 'работы', 'работ')}`,
      twos ? el('span', { class: 'pill pill-fix', text: `с «2»: ${twos}` }) : null
    ]));
    box.appendChild(el('div', { class: 'grades-scroll', tabindex: '0', role: 'region', 'aria-label': 'Таблица оценок' }, [table]));
  }
  drawTable();
  return view;
}

function retry(app) {
  return el('button', { type: 'button', class: 'btn btn-ghost', text: 'Попробовать ещё раз', onclick: () => { app.S.grades.error = ''; app.render(); } });
}

async function load(app, what) {
  const { S } = app;
  const G = S.grades;
  G.loading = what; G.error = '';
  try {
    if (what === 'classes') G.classes = (await app.api.post('grades.classes', {}, S.code)).classes || [];
    else G.data[what] = await app.api.post('grades.get', { cls: what }, S.code);
  } catch (e) { G.error = e.message; }
  G.loading = '';
  app.render();
}
