// Домашние задания: ученики и родители смотрят по классу, учителя добавляют.
import { el, ICON, todayISO, addDays, weekday, relDay, fmtDateShort, timeAgo, toast, richText, safeUrl, norm } from '../util.js';
import { chips, empty, openSheet, field, photoGrid, photoPicker, confirmButton, busy } from '../ui.js';
import { classesList, splitClasses, nextLessonDate, subjectsList, teacherById } from '../data.js';

export function renderHomework(app) {
  const { S } = app;
  const pub = S.pub;
  const classes = classesList(pub);
  if (!S.sel.cls || !classes.includes(S.sel.cls)) S.sel.cls = classes[0] || '';
  const mine = S.hwMine && S.me;

  const view = el('div', { class: 'view' });
  view.appendChild(el('div', { class: 'view-head' }, [
    el('h1', { class: 'view-title', text: 'Домашние задания' }),
    S.me ? el('button', { type: 'button', class: 'btn btn-primary btn-sm', onclick: () => hwForm(app, null) }, [el('span', { html: ICON.plus }), 'Задание']) : null
  ]));

  const items = [];
  if (S.me) items.push({ value: '__mine', label: 'Мои задания' });
  classes.forEach(c => items.push(c));
  if (items.length) {
    view.appendChild(chips(items, mine ? '__mine' : S.sel.cls, v => {
      if (v === '__mine') S.hwMine = true; else { S.hwMine = false; S.sel.cls = v; app.saveSel(); }
      app.render();
    }, { scroll: true, label: 'Класс' }));
  }

  const all = (pub?.homework || []).filter(h => mine ? h.author === S.me.id : splitClasses(h.cls).includes(S.sel.cls));
  if (!all.length) {
    view.appendChild(empty(mine ? 'Вы ещё не задавали ДЗ' : 'Заданий нет',
      mine ? 'Нажмите «Задание», чтобы добавить первое.' : (classes.length ? `Для ${S.sel.cls} пока ничего не задано.` : 'Учителя ещё не добавили ни одного задания.')));
    return view;
  }

  const today = todayISO(), tomorrow = addDays(today, 1);
  const endOfWeek = weekday(today) >= 6 ? addDays(today, 14 - weekday(today)) : addDays(today, 7 - weekday(today));
  const groups = [
    { title: 'На сегодня', test: d => d === today },
    { title: 'На завтра', test: d => d === tomorrow },
    { title: weekday(today) >= 6 ? 'На следующей неделе' : 'На этой неделе', test: d => d > tomorrow && d <= endOfWeek },
    { title: 'Позже', test: d => d > endOfWeek },
    { title: 'Без срока', test: d => !d }
  ];
  const sorted = all.slice().sort((a, b) => (a.due || '9999').localeCompare(b.due || '9999') || String(b.created).localeCompare(String(a.created)));
  // каждое задание — ровно в одной группе (первая подходящая)
  const groupOf = h => (h.due && h.due < today) ? -1 : groups.findIndex(g => g.test(h.due || ''));
  groups.forEach((g, gi) => {
    const list = sorted.filter(h => groupOf(h) === gi);
    if (!list.length) return;
    view.appendChild(el('section', { class: 'group' }, [el('h2', { class: 'group-title', text: g.title }), el('div', { class: 'cards' }, list.map(h => hwCard(app, h, mine)))]));
  });
  const past = sorted.filter(h => h.due && h.due < today).reverse();
  if (past.length) {
    const det = el('details', { class: 'group past' }, [
      el('summary', { class: 'group-title', text: `Прошедшие (${past.length})` }),
      el('div', { class: 'cards' }, past.map(h => hwCard(app, h, mine)))
    ]);
    view.appendChild(det);
  }
  return view;
}

function hwCard(app, h, showClass) {
  const { S } = app;
  const author = teacherById(S.pub?.teachers, h.author);
  const canEdit = S.me && (h.author === S.me.id || S.me.role === 'админ');
  return el('article', { class: 'card hw' }, [
    el('div', { class: 'hw-top' }, [
      el('div', { class: 'hw-subject', text: h.subject || 'Задание' }),
      h.due ? el('span', { class: 'pill ' + (h.due < todayISO() ? 'pill-muted' : 'pill-due'), text: 'к ' + relDay(h.due) }) : null
    ]),
    showClass ? el('div', { class: 'hw-class', text: h.cls }) : null,
    h.text ? richText(h.text) : null,
    h.link ? el('a', { class: 'hw-link', href: safeUrl(h.link), target: '_blank', rel: 'noopener' }, [el('span', { html: ICON.link }), 'Открыть материал']) : null,
    photoGrid(h.photos),
    el('div', { class: 'hw-foot' }, [
      el('span', { text: [author?.name, h.created ? timeAgo(h.created) : ''].filter(Boolean).join(' · ') }),
      canEdit ? el('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Изменить задание', title: 'Изменить', html: ICON.edit, onclick: () => hwForm(app, h) }) : null
    ])
  ]);
}

function hwForm(app, h) {
  const { S } = app;
  const pub = S.pub;
  let selected = h ? splitClasses(h.cls) : (S.hwMine ? [] : [S.sel.cls].filter(Boolean));
  const classes = [...new Set([...classesList(pub), ...selected])];
  const classBox = el('div');
  const drawClasses = () => { classBox.replaceChildren(chips(classes, selected, v => {
    selected = selected.includes(v) ? selected.filter(x => x !== v) : [...selected, v];
    drawClasses(); suggestDue();
  }, { label: 'Классы' })); };

  const subjects = subjectsList(pub, S.me);
  const f = {
    subject: el('input', { id: 'hw-subject', type: 'text', list: 'hw-subjects', value: h ? h.subject : (subjects.length === 1 ? subjects[0] : String(S.me?.subjects || '').split(/[,;]/)[0].trim()), autocomplete: 'off' }),
    text: el('textarea', { id: 'hw-text', rows: '4', placeholder: 'Например: параграф 7, вопросы 1–4 письменно' }),
    due: el('input', { id: 'hw-due', type: 'date', value: h?.due || '' }),
    link: el('input', { id: 'hw-link', type: 'url', inputmode: 'url', placeholder: 'https://…', value: h?.link || '' })
  };
  f.text.value = h?.text || '';
  const dueHint = el('span', { class: 'hint' });
  let dueTouched = !!h;
  f.due.addEventListener('input', () => { dueTouched = true; dueHint.textContent = ''; });
  f.subject.addEventListener('change', suggestDue);
  function suggestDue() {
    if (dueTouched) return;
    const d = nextLessonDate(pub, selected[0], f.subject.value);
    f.due.value = d || addDays(todayISO(), 1);
    dueHint.textContent = d ? `Следующий урок — ${fmtDateShort(d)}` : '';
  }
  drawClasses(); suggestDue();

  const photos = photoPicker('hw-photos', h?.photos || []);
  const err = el('div', { class: 'err', role: 'alert', hidden: true });
  const save = el('button', { type: 'submit', class: 'btn btn-primary', text: h ? 'Сохранить' : 'Опубликовать' });
  const form = el('form', { class: 'form', novalidate: true }, [
    el('div', { class: 'field' }, [el('span', { class: 'label', text: 'Класс' }), classBox, el('span', { class: 'hint', text: 'Можно выбрать несколько.' })]),
    field('Предмет', f.subject),
    el('datalist', { id: 'hw-subjects' }, subjects.map(s => el('option', { value: s }))),
    field('Задание', f.text),
    el('div', { class: 'field' }, [el('label', { for: 'hw-due', text: 'К какому дню' }), f.due, dueHint]),
    field('Ссылка на материал (необязательно)', f.link),
    el('div', { class: 'field' }, [el('span', { class: 'label', text: 'Фото (необязательно)' }), photos.node]),
    err,
    el('div', { class: 'form-actions' }, [
      h ? confirmButton('Удалить', 'Точно удалить?', async b => {
        await busy(form, b, 'Удаляю…', async () => {
          try {
            await app.api.post('hw.delete', { id: h.id }, S.code);
            S.pub.homework = S.pub.homework.filter(x => x.id !== h.id);
            close(); app.render(); toast('Задание удалено');
          } catch (e) { showErr(e.message); }
        });
      }) : null,
      el('span', { class: 'spacer' }), save
    ])
  ]);
  function showErr(m) { err.textContent = m; err.hidden = false; }
  form.addEventListener('submit', async e => {
    e.preventDefault();
    if (!selected.length) return showErr('Выберите класс.');
    if (!f.subject.value.trim()) { f.subject.focus(); return showErr('Впишите предмет.'); }
    if (!f.text.value.trim() && !photos.kept.length && !photos.added.length) { f.text.focus(); return showErr('Впишите задание или прикрепите фото.'); }
    if (f.link.value && !/^https?:\/\//i.test(f.link.value.trim())) { f.link.focus(); return showErr('Ссылка должна начинаться с https://'); }
    await busy(form, save, photos.added.length ? 'Загружаю фото…' : 'Сохраняю…', async () => {
      try {
        const res = await app.api.post('hw.save', { item: { id: h?.id, cls: selected.join(', '), subject: f.subject.value.trim(), text: f.text.value.trim(), due: f.due.value, link: f.link.value.trim(),
          keepPhotos: photos.kept, photos: photos.added.map(({ name, type, data, preview }) => ({ name, type, data, preview })) } }, S.code);
        const item = { id: res.item.id, ...normalizeHw(res.item) };
        const list = S.pub.homework || (S.pub.homework = []);
        const i = list.findIndex(x => x.id === item.id);
        if (i >= 0) list[i] = item; else list.push(item);
        close(); app.render(); toast(h ? 'Задание обновлено' : 'Задание опубликовано');
      } catch (e2) { showErr(e2.message); }
    });
  });
  const close = openSheet(h ? 'Изменить задание' : 'Новое задание', form, { focus: '#hw-text' });
}

// Сервер отдаёт строку таблицы с русскими заголовками, демо — готовый объект.
function normalizeHw(r) {
  if ('cls' in r) return r;
  return { created: r['Создано'], cls: r['Класс'], subject: r['Предмет'], text: r['Задание'], link: r['Ссылка'],
    photos: String(r['Фото'] || '').split(',').map(s => s.trim()).filter(Boolean), due: r['Срок'], author: r['Автор'] };
}

export const hwSubjectMatch = (a, b) => norm(a) === norm(b);
