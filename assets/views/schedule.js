// Расписание: день класса так, как его составили завучи, — уроки с группами, учителями и кабинетами,
// перемены, еда, кружки. Или день учителя: где и с каким классом он сейчас.
import { el, ICON, todayISO, addDays, weekday, weekStart, dayNum, DAYS_SHORT, DAYS_FULL, fmtDate, nowHHMM, timeAgo, norm } from '../util.js';
import { chips, segmented, empty } from '../ui.js';
import { classesList, dayFor, itemsFor, defaultDate, hasSaturday, splitClasses, lessonHasSubject, teacherNames, teacherDay } from '../data.js';

const accusative = d => d.replace(/а$/, 'у'); // среда → среду, пятница → пятницу

export function renderSchedule(app) {
  const { S } = app;
  const pub = S.pub;
  const classes = classesList(pub);
  const teachers = teacherNames(pub);
  const sel = S.sel;
  if (!sel.cls || !classes.includes(sel.cls)) sel.cls = classes[0] || '';
  if (sel.mode === 'teacher' && !teachers.length) sel.mode = 'class';
  if (!S.date) S.date = defaultDate(pub, sel.cls, nowHHMM());

  const view = el('div', { class: 'view' });
  view.appendChild(el('div', { class: 'view-head' }, [
    el('h1', { class: 'view-title', text: 'Расписание' }),
    pub?.updated ? el('span', { class: 'updated', text: 'обновлено ' + timeAgo(pub.updated) }) : null
  ]));

  if (pub?.scheduleSource === 'none') {
    view.appendChild(empty('Расписание ещё не подключено', 'Как только в настройках появится таблица завучей, расписание будет здесь.'));
    return view;
  }
  if (pub?.scheduleSource === 'error') {
    view.appendChild(el('div', { class: 'banner banner-warn', text: S.me?.role === 'админ' ? pub.scheduleError : 'Расписание сейчас не загружается. Попробуйте чуть позже.' }));
  }
  if (!classes.length) {
    view.appendChild(empty('Расписания пока нет', 'Завучи ещё не выложили расписание на ближайшие дни.'));
    return view;
  }

  if (teachers.length) {
    view.appendChild(segmented([{ value: 'class', label: 'Класс' }, { value: 'teacher', label: 'Учитель' }], sel.mode,
      v => { sel.mode = v; app.saveSel(); app.render(); }, 'Чьё расписание'));
  }
  if (sel.mode === 'teacher') view.appendChild(teacherPicker(app, teachers));
  else view.appendChild(chips(classes, sel.cls, v => { sel.cls = v; app.saveSel(); app.render(); }, { scroll: true, label: 'Класс' }));

  // неделя
  const nDays = hasSaturday(pub) ? 6 : 5;
  const ws = weekStart(S.date), today = todayISO();
  view.appendChild(el('div', { class: 'week' }, [
    el('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Предыдущая неделя', html: ICON.left, onclick: () => { S.date = addDays(S.date, -7); app.render(); } }),
    el('div', { class: 'week-days' }, Array.from({ length: nDays }, (_, i) => {
      const d = addDays(ws, i);
      const ready = sel.mode === 'teacher' ? !!dayFor(pub, d) : !!itemsFor(pub, sel.cls, d);
      return el('button', { type: 'button', class: 'day' + (d === S.date ? ' on' : '') + (d === today ? ' today' : ''), 'aria-pressed': d === S.date ? 'true' : 'false',
        'aria-label': `${DAYS_FULL[i + 1]}, ${fmtDate(d)}${ready ? '' : ', расписания пока нет'}`, onclick: () => { S.date = d; app.render(); } },
        [el('span', { class: 'day-name', text: DAYS_SHORT[i + 1] }), el('span', { class: 'day-num', text: dayNum(d) }), el('span', { class: 'day-dot' + (ready ? '' : ' none') })]);
    })),
    el('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Следующая неделя', html: ICON.right, onclick: () => { S.date = addDays(S.date, 7); app.render(); } })
  ]));

  const def = defaultDate(pub, sel.cls, nowHHMM());
  view.appendChild(el('div', { class: 'day-title' }, [
    el('span', { text: (S.date === today ? 'Сегодня, ' : S.date === addDays(today, 1) ? 'Завтра, ' : '') + `${DAYS_FULL[weekday(S.date)]}, ${fmtDate(S.date)}` }),
    S.date !== def ? el('button', { type: 'button', class: 'link-btn', text: def === today ? 'К сегодняшнему дню' : 'К ближайшему дню', onclick: () => { S.date = def; app.render(); } }) : null
  ]));

  const day = dayFor(pub, S.date);
  if (!day) {
    view.appendChild(S.date >= today
      ? (weekday(S.date) >= 6 && !hasSaturday(pub)
        ? empty('Выходной', 'В этот день уроков нет.')
        : empty('Расписание ещё не готово', `Завучи пока не выложили расписание на ${accusative(DAYS_FULL[weekday(S.date)])}. Оно появится здесь сразу, как только будет готово.`))
      : empty('Расписания нет', 'На этот день расписание не сохранилось.'));
    return view;
  }

  view.appendChild(sel.mode === 'teacher' ? teacherTimeline(app, day) : classTimeline(app, day));
  view.appendChild(el('p', { class: 'hint center', text: 'Расписание обновляется само, как только завучи что-то поменяют.' }));
  return view;
}

/* ---------- день класса ---------- */
function classTimeline(app, day) {
  const { S } = app;
  const cls = S.sel.cls;
  const items = day.items[cls];
  if (!items || !items.length) return empty('Занятий нет', `В этот день у ${cls.replace(/^(\d+) класс$/, '$1-го класса')} нет занятий.`);

  const now = S.date === todayISO() ? nowHHMM() : null;
  const hwToday = (S.pub.homework || []).filter(h => h.due === S.date && splitClasses(h.cls).includes(cls));
  const shownHw = new Set();
  const firstLesson = items.find(x => x.kind === 'lesson')?.start || '99';
  const list = el('ol', { class: 'timeline-day' });

  items.forEach(it => {
    const state = now ? (now >= it.end ? 'past' : (now >= it.start ? 'now' : '')) : '';
    if (it.kind === 'break') {
      list.appendChild(el('li', { class: 'td td-break' + (it.meal ? ' meal' : '') + (state ? ' ' + state : '') }, [
        el('span', { class: 'td-break-time', text: `${it.start}–${it.end}` }),
        el('span', { class: 'td-break-title', text: it.title }),
        state === 'now' ? el('span', { class: 'pill pill-now', text: 'сейчас' }) : null
      ]));
      return;
    }
    // ДЗ — у первого урока этого предмета за день
    const hw = it.kind === 'lesson' ? hwToday.filter(h => !shownHw.has(h.id) && lessonHasSubject(it, h.subject)) : [];
    hw.forEach(h => shownHw.add(h.id));
    const multi = it.groups.length > 1;

    const label = it.kind === 'activity' ? (it.common ? 'для всех' : it.start < firstLesson ? 'до уроков' : 'после уроков')
      : multi ? 'по группам' : '';
    const body = el('div', { class: 'td-body' }, [
      label ? el('div', { class: 'td-label', text: label }) : null,
      it.kind === 'activity'
        ? (multi ? el('ul', { class: 'td-list' }, it.groups.map(g => el('li', { text: g.subject }))) : el('div', { class: 'td-title', text: it.title }))
        : multi ? el('ul', { class: 'td-groups' }, it.groups.map(groupRow)) : groupBlock(it.groups[0] || { subject: it.title }),
      state === 'now' ? el('span', { class: 'pill pill-now', text: 'идёт сейчас' }) : null,
      hw.length ? el('button', { type: 'button', class: 'lesson-hw', onclick: () => app.go('dz') }, [el('b', { text: 'ДЗ: ' }), hw.map(h => `${h.subject} — ${h.text}`).join(' · ').slice(0, 110)]) : null
    ]);
    const li = el('li', { class: 'td td-' + it.kind + (state ? ' ' + state : '') }, [
      el('div', { class: 'td-num', text: it.kind === 'lesson' && it.num ? it.num : '' }),
      el('div', { class: 'td-time' }, [el('span', { text: it.start }), el('span', { text: it.end })]),
      body
    ]);
    if (it.color) li.style.setProperty('--subj', it.color);
    list.appendChild(li);
  });
  return list;
}

const meta = g => [g.teachers, g.room].filter(Boolean);

function groupBlock(g) {
  return el('div', { class: 'td-one' }, [
    el('div', { class: 'td-title', text: g.subject }),
    meta(g).length ? el('div', { class: 'td-meta' }, metaSpans(g)) : null
  ]);
}

function groupRow(g) {
  return el('li', { class: 'tg' }, [
    g.code ? el('span', { class: 'tg-code', text: g.code, title: 'Группа ' + g.code }) : null,
    el('div', { class: 'tg-main' }, [
      el('div', { class: 'tg-subject', text: g.subject }),
      meta(g).length ? el('div', { class: 'td-meta' }, metaSpans(g)) : null
    ])
  ]);
}

function metaSpans(g) {
  return [
    g.teachers ? el('span', { class: 'td-teachers', text: g.teachers }) : null,
    g.room ? el('span', { class: 'room', text: g.room }) : null
  ];
}

/* ---------- день учителя ---------- */
function teacherPicker(app, teachers) {
  const { S } = app;
  const input = el('input', { id: 'sched-teacher', type: 'search', class: 'search-input', list: 'sched-teachers', autocomplete: 'off',
    placeholder: 'Имя, как в расписании: «Марина пс»', value: S.sel.teacher || '', 'aria-label': 'Учитель' });
  const commit = () => {
    const v = input.value.trim();
    const hit = teachers.find(t => norm(t) === norm(v));
    if (hit && hit !== S.sel.teacher) { S.sel.teacher = hit; app.saveSel(); app.render(); }
  };
  input.addEventListener('change', commit);
  input.addEventListener('input', () => { if (teachers.some(t => norm(t) === norm(input.value.trim()))) commit(); });
  return el('div', { class: 'search' }, [el('span', { html: ICON.search }), input,
    el('datalist', { id: 'sched-teachers' }, teachers.map(t => el('option', { value: t })))]);
}

function teacherTimeline(app, day) {
  const { S } = app;
  const name = S.sel.teacher;
  if (!name) return empty('Выберите учителя', 'Начните вводить имя так, как его пишут в расписании, и выберите из списка.');
  const list = teacherDay(S.pub, name, S.date) || [];
  if (!list.length) return empty('Занятий нет', `В этот день у «${name}» нет занятий по расписанию.`);
  const now = S.date === todayISO() ? nowHHMM() : null;
  const ol = el('ol', { class: 'timeline-day' });
  list.forEach(x => {
    const state = now ? (now >= x.end ? 'past' : (now >= x.start ? 'now' : '')) : '';
    const li = el('li', { class: 'td td-lesson' + (state ? ' ' + state : '') }, [
      el('div', { class: 'td-num', text: x.num || '' }),
      el('div', { class: 'td-time' }, [el('span', { text: x.start }), el('span', { text: x.end })]),
      el('div', { class: 'td-body' }, [
        el('div', { class: 'td-one' }, [
          el('div', { class: 'td-title' }, [x.subject, x.code ? el('span', { class: 'tg-code inline', text: x.code }) : null]),
          el('div', { class: 'td-meta' }, [
            el('span', { class: 'td-class', text: x.classes.join(', ').replace(/ класс(?=,)/g, '') }),
            x.room ? el('span', { class: 'room', text: x.room }) : null,
            x.others.length ? el('span', { class: 'td-teachers', text: 'вместе с: ' + x.others.join(', ') }) : null
          ])
        ]),
        state === 'now' ? el('span', { class: 'pill pill-now', text: 'идёт сейчас' }) : null
      ])
    ]);
    if (x.color) li.style.setProperty('--subj', x.color);
    ol.appendChild(li);
  });
  return ol;
}
