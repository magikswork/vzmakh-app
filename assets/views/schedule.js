// Расписание: по классу или по учителю, неделя, замены, ДЗ к урокам.
import { el, ICON, todayISO, addDays, weekday, weekStart, dayNum, DAYS_SHORT, DAYS_FULL, fmtDate, nowHHMM, toast, norm } from '../util.js';
import { chips, segmented, empty, openSheet, field, confirmButton, busy } from '../ui.js';
import { classesList, scheduleTeachers, lessonsFor, bellFor, hasSaturday, isCancelled, splitClasses, sameName } from '../data.js';

export function defaultDate(pub) {
  const t = todayISO(), w = weekday(t);
  if (w === 7 || (w === 6 && !hasSaturday(pub))) return addDays(t, 8 - w);
  return t;
}

export function renderSchedule(app) {
  const { S } = app;
  const pub = S.pub;
  const classes = classesList(pub);
  const teachers = scheduleTeachers(pub);
  const sel = S.sel;
  if (!sel.cls || !classes.includes(sel.cls)) sel.cls = classes[0] || '';
  if (sel.mode === 'teacher' && !teachers.some(t => sameName(t, sel.teacher))) {
    sel.teacher = (S.me && teachers.find(t => sameName(t, S.me.name))) || teachers[0] || '';
  }
  if (!S.date) S.date = defaultDate(pub);

  const view = el('div', { class: 'view' });

  if (!pub?.schedule?.length) {
    view.appendChild(el('h1', { class: 'view-title', text: 'Расписание' }));
    view.appendChild(empty('Расписание ещё не заполнено', 'Как только администратор внесёт его в таблицу, оно появится здесь.'));
    return view;
  }

  // кто: класс или учитель
  const head = el('div', { class: 'view-head' }, [
    el('h1', { class: 'view-title', text: 'Расписание' }),
    segmented([{ value: 'class', label: 'Класс' }, { value: 'teacher', label: 'Учитель' }], sel.mode, v => { sel.mode = v; app.saveSel(); app.render(); }, 'Показать расписание')
  ]);
  view.appendChild(head);

  if (sel.mode === 'teacher') {
    const s = el('select', { id: 'sched-teacher', class: 'select', 'aria-label': 'Учитель', onchange: e => { sel.teacher = e.target.value; app.saveSel(); app.render(); } },
      teachers.map(t => el('option', { value: t, text: t, selected: sameName(t, sel.teacher) || null })));
    view.appendChild(s);
  } else {
    view.appendChild(chips(classes, sel.cls, v => { sel.cls = v; app.saveSel(); app.render(); }, { scroll: true, label: 'Класс' }));
  }

  // неделя
  const days = hasSaturday(pub) ? 6 : 5;
  const ws = weekStart(S.date), today = todayISO();
  const strip = el('div', { class: 'week' }, [
    el('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Предыдущая неделя', html: ICON.left, onclick: () => { S.date = addDays(S.date, -7); app.render(); } }),
    el('div', { class: 'week-days' }, Array.from({ length: days }, (_, i) => {
      const d = addDays(ws, i);
      const n = lessonsFor(pub, sel, d).filter(l => !l.removed && !isCancelled(l)).length;
      return el('button', { type: 'button', class: 'day' + (d === S.date ? ' on' : '') + (d === today ? ' today' : ''), 'aria-pressed': d === S.date ? 'true' : 'false',
        'aria-label': `${DAYS_FULL[i + 1]}, ${fmtDate(d)}${n ? '' : ', уроков нет'}`, onclick: () => { S.date = d; app.render(); } },
        [el('span', { class: 'day-name', text: DAYS_SHORT[i + 1] }), el('span', { class: 'day-num', text: dayNum(d) }), el('span', { class: 'day-dot' + (n ? '' : ' none') })]);
    })),
    el('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Следующая неделя', html: ICON.right, onclick: () => { S.date = addDays(S.date, 7); app.render(); } })
  ]);
  view.appendChild(strip);

  const dayTitle = el('div', { class: 'day-title' }, [
    el('span', { text: (S.date === today ? 'Сегодня, ' : '') + `${DAYS_FULL[weekday(S.date)]}, ${fmtDate(S.date)}` }),
    S.date !== defaultDate(pub) ? el('button', { type: 'button', class: 'link-btn', text: 'К сегодняшнему дню', onclick: () => { S.date = defaultDate(pub); app.render(); } }) : null
  ]);
  view.appendChild(dayTitle);

  // уроки
  const lessons = lessonsFor(pub, sel, S.date);
  const isAdmin = S.me?.role === 'админ';
  if (!lessons.length) {
    view.appendChild(empty(weekday(S.date) >= 6 ? 'Выходной' : 'Уроков нет', sel.mode === 'teacher' ? 'В этот день у учителя нет уроков по расписанию.' : 'В этот день у класса нет уроков по расписанию.'));
  } else {
    const now = nowHHMM();
    const list = el('ol', { class: 'lessons' });
    lessons.forEach(l => {
      const bell = bellFor(pub, l.lesson);
      const cancelled = isCancelled(l) || l.removed;
      let state = '';
      if (S.date === today && bell && !cancelled) state = now >= bell.end ? 'past' : (now >= bell.start ? 'now' : '');
      const who = sel.mode === 'teacher' ? l.cls : l.teacher;
      const meta = [who, l.room ? `каб. ${l.room}` : ''].filter(Boolean).join(' · ');

      const hw = sel.mode === 'class' && !cancelled ? (pub.homework || []).filter(h => h.due === S.date && splitClasses(h.cls).includes(sel.cls) && norm(h.subject) === norm(l.subject)) : [];

      const body = el('div', { class: 'lesson-body' }, [
        el('div', { class: 'lesson-subject' }, [
          cancelled ? el('s', { text: l.base?.subject || l.subject }) : (l.subject || '—'),
          l.sub && !cancelled ? el('span', { class: 'pill pill-sub', text: 'замена' }) : null,
          cancelled ? el('span', { class: 'pill pill-off', text: l.removed ? 'передан' : 'отменён' }) : null,
          state === 'now' ? el('span', { class: 'pill pill-now', text: 'идёт сейчас' }) : null
        ]),
        meta && !cancelled ? el('div', { class: 'lesson-meta', text: meta }) : null,
        l.sub && l.base && !cancelled && (l.base.subject !== l.subject || !sameName(l.base.teacher, l.teacher)) ?
          el('div', { class: 'lesson-was', text: `было: ${[l.base.subject, l.base.teacher].filter(Boolean).join(', ')}` }) : null,
        l.sub?.comment ? el('div', { class: 'lesson-note', text: l.sub.comment }) : null,
        hw.length ? el('button', { type: 'button', class: 'lesson-hw', onclick: () => app.go('dz') }, [el('b', { text: 'ДЗ: ' }), hw.map(h => h.text).join(' / ').slice(0, 90)]) : null
      ]);
      const li = el('li', { class: 'lesson' + (state ? ' ' + state : '') + (cancelled ? ' off' : '') }, [
        el('div', { class: 'lesson-num', text: l.lesson }),
        el('div', { class: 'lesson-time' }, bell ? [el('span', { text: bell.start }), el('span', { text: bell.end })] : []),
        body,
        isAdmin && sel.mode === 'class' ? el('button', { type: 'button', class: 'icon-btn lesson-edit', 'aria-label': `Замена на ${l.lesson}-й урок`, title: 'Замена', html: ICON.edit, onclick: () => subForm(app, l) }) : null
      ]);
      list.appendChild(li);
    });
    view.appendChild(list);
  }

  if (isAdmin && sel.mode === 'class') {
    view.appendChild(el('button', { type: 'button', class: 'btn btn-ghost add-sub', onclick: () => subForm(app, null) }, [el('span', { html: ICON.plus }), 'Добавить замену']));
  }
  return view;
}

/* ---------- замена (только администратор) ---------- */
function subForm(app, lesson) {
  const { S } = app;
  const existing = lesson?.sub || null;
  const base = lesson?.base || null;
  const f = {
    date: el('input', { id: 'sub-date', type: 'date', value: S.date, required: true }),
    lesson: el('input', { id: 'sub-lesson', type: 'number', min: '1', max: '10', inputmode: 'numeric', value: lesson?.lesson || '' }),
    subject: el('input', { id: 'sub-subject', type: 'text', value: existing ? existing.subject : (base?.subject || ''), placeholder: 'или «Нет урока»' }),
    teacher: el('input', { id: 'sub-teacher', type: 'text', value: existing ? existing.teacher : '', list: 'sub-teachers' }),
    room: el('input', { id: 'sub-room', type: 'text', value: existing ? existing.room : (base?.room || '') }),
    comment: el('input', { id: 'sub-comment', type: 'text', value: existing?.comment || '', placeholder: 'Например: учитель на курсах' })
  };
  const err = el('div', { class: 'err', role: 'alert', hidden: true });
  const save = el('button', { type: 'submit', class: 'btn btn-primary', text: 'Сохранить замену' });
  const form = el('form', { class: 'form', novalidate: true }, [
    el('p', { class: 'form-lead', text: `Класс ${S.sel.cls}. Замена видна всем сразу после сохранения.` }),
    el('div', { class: 'row2' }, [field('Дата', f.date), field('Урок №', f.lesson)]),
    field('Предмет', f.subject, 'Чтобы отменить урок, впишите «Нет урока».'),
    field('Учитель', f.teacher),
    el('datalist', { id: 'sub-teachers' }, scheduleTeachers(S.pub).map(t => el('option', { value: t }))),
    el('div', { class: 'row2' }, [field('Кабинет', f.room), field('Комментарий', f.comment)]),
    err,
    el('div', { class: 'form-actions' }, [
      existing ? confirmButton('Убрать замену', 'Точно убрать?', async b => {
        await busy(form, b, 'Убираю…', async () => {
          try { await app.api.post('sub.delete', { id: existing.id }, S.code); close(); toast('Замена убрана'); app.refreshPublic(); }
          catch (e) { err.textContent = e.message; err.hidden = false; }
        });
      }) : null,
      el('span', { class: 'spacer' }), save
    ])
  ]);
  form.addEventListener('submit', async e => {
    e.preventDefault();
    if (!f.date.value || !f.lesson.value) { err.textContent = 'Укажите дату и номер урока.'; err.hidden = false; return; }
    await busy(form, save, 'Сохраняю…', async () => {
      try {
        await app.api.post('sub.save', { item: { id: existing?.id, date: f.date.value, cls: S.sel.cls, lesson: f.lesson.value, subject: f.subject.value, teacher: f.teacher.value, room: f.room.value, comment: f.comment.value } }, S.code);
        close(); toast('Замена сохранена'); S.date = f.date.value; app.refreshPublic();
      } catch (e2) { err.textContent = e2.message; err.hidden = false; }
    });
  });
  const close = openSheet(existing ? 'Изменить замену' : 'Замена', form);
}
