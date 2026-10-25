// Расписание: день класса так, как его составили завучи, — уроки с группами, перемены, еда, кружки.
import { el, ICON, todayISO, addDays, weekday, weekStart, dayNum, DAYS_SHORT, DAYS_FULL, fmtDate, nowHHMM, norm, timeAgo } from '../util.js';
import { chips, empty } from '../ui.js';
import { classesList, dayFor, itemsFor, defaultDate, hasSaturday, splitClasses, lessonHasSubject } from '../data.js';

export function renderSchedule(app) {
  const { S } = app;
  const pub = S.pub;
  const classes = classesList(pub);
  if (!S.sel.cls || !classes.includes(S.sel.cls)) S.sel.cls = classes[0] || '';
  const cls = S.sel.cls;
  if (!S.date) S.date = defaultDate(pub, cls, nowHHMM());

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

  view.appendChild(chips(classes, cls, v => { S.sel.cls = v; app.saveSel(); app.render(); }, { scroll: true, label: 'Класс' }));

  // неделя
  const nDays = hasSaturday(pub) ? 6 : 5;
  const ws = weekStart(S.date), today = todayISO();
  view.appendChild(el('div', { class: 'week' }, [
    el('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Предыдущая неделя', html: ICON.left, onclick: () => { S.date = addDays(S.date, -7); app.render(); } }),
    el('div', { class: 'week-days' }, Array.from({ length: nDays }, (_, i) => {
      const d = addDays(ws, i);
      const ready = !!itemsFor(pub, cls, d);
      return el('button', { type: 'button', class: 'day' + (d === S.date ? ' on' : '') + (d === today ? ' today' : ''), 'aria-pressed': d === S.date ? 'true' : 'false',
        'aria-label': `${DAYS_FULL[i + 1]}, ${fmtDate(d)}${ready ? '' : ', расписания пока нет'}`, onclick: () => { S.date = d; app.render(); } },
        [el('span', { class: 'day-name', text: DAYS_SHORT[i + 1] }), el('span', { class: 'day-num', text: dayNum(d) }), el('span', { class: 'day-dot' + (ready ? '' : ' none') })]);
    })),
    el('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Следующая неделя', html: ICON.right, onclick: () => { S.date = addDays(S.date, 7); app.render(); } })
  ]));

  const def = defaultDate(pub, cls, nowHHMM());
  view.appendChild(el('div', { class: 'day-title' }, [
    el('span', { text: (S.date === today ? 'Сегодня, ' : S.date === addDays(today, 1) ? 'Завтра, ' : '') + `${DAYS_FULL[weekday(S.date)]}, ${fmtDate(S.date)}` }),
    S.date !== def ? el('button', { type: 'button', class: 'link-btn', text: def === today ? 'К сегодняшнему дню' : 'К ближайшему дню', onclick: () => { S.date = def; app.render(); } }) : null
  ]));

  const day = dayFor(pub, S.date);
  const items = itemsFor(pub, cls, S.date);
  if (!day) {
    view.appendChild(S.date >= today
      ? (weekday(S.date) >= 6 && !hasSaturday(pub)
        ? empty('Выходной', 'В этот день уроков нет.')
        : empty('Расписание ещё не готово', `Завучи пока не выложили расписание на ${DAYS_FULL[weekday(S.date)] === 'среда' ? 'среду' : DAYS_FULL[weekday(S.date)].replace(/а$/, 'у')}. Оно появится здесь сразу, как только будет готово.`))
      : empty('Расписания нет', 'На этот день расписание не сохранилось.'));
    return view;
  }
  if (!items || !items.length) {
    view.appendChild(empty('Уроков нет', `В этот день у ${cls.replace(' класс', '-го класса')} нет занятий.`));
    return view;
  }

  // лента дня
  const now = S.date === today ? nowHHMM() : null;
  const hwToday = (pub.homework || []).filter(h => h.due === S.date && splitClasses(h.cls).includes(cls));
  const shownHw = new Set();
  const list = el('ol', { class: 'timeline-day' });
  items.forEach(it => {
    let state = '';
    if (now) state = now >= it.end ? 'past' : (now >= it.start ? 'now' : '');
    const time = el('div', { class: 'td-time' }, [el('span', { text: it.start }), el('span', { text: it.end })]);

    if (it.kind === 'break') {
      list.appendChild(el('li', { class: 'td td-break' + (it.meal ? ' meal' : '') + (state ? ' ' + state : '') }, [
        el('span', { class: 'td-break-time', text: `${it.start}–${it.end}` }),
        el('span', { class: 'td-break-title', text: it.title }),
        state === 'now' ? el('span', { class: 'pill pill-now', text: 'сейчас' }) : null
      ]));
      return;
    }

    // ДЗ показываем у первого урока этого предмета за день
    const hw = it.kind === 'lesson' ? hwToday.filter(h => !shownHw.has(h.id) && lessonHasSubject(it, h.subject)) : [];
    hw.forEach(h => shownHw.add(h.id));
    const multi = it.groups.length > 1;
    const body = el('div', { class: 'td-body' }, [
      it.kind === 'activity' ? el('div', { class: 'td-label', text: it.common ? 'для всех' : (it.start < (items.find(x => x.kind === 'lesson')?.start || '99') ? 'до уроков' : 'после уроков') }) : null,
      multi && it.kind === 'lesson' ? el('div', { class: 'td-label', text: 'по группам' }) : null,
      multi
        ? el('ul', { class: 'td-groups' }, it.groups.map(g => el('li', { text: g })))
        : el('div', { class: 'td-title', text: it.title }),
      state === 'now' ? el('span', { class: 'pill pill-now', text: 'идёт сейчас' }) : null,
      hw.length ? el('button', { type: 'button', class: 'lesson-hw', onclick: () => app.go('dz') }, [el('b', { text: 'ДЗ: ' }), hw.map(h => `${h.subject} — ${h.text}`).join(' · ').slice(0, 110)]) : null
    ]);
    const li = el('li', { class: 'td td-' + it.kind + (state ? ' ' + state : '') }, [
      el('div', { class: 'td-num', text: it.kind === 'lesson' && it.num ? it.num : '' }),
      time, body
    ]);
    if (it.color) li.style.setProperty('--subj', it.color);
    list.appendChild(li);
  });
  view.appendChild(list);
  view.appendChild(el('p', { class: 'hint center', text: 'Расписание обновляется само, как только завучи что-то поменяют.' }));
  return view;
}
