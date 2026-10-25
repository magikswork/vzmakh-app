// Запросы между учителями: «посмотри, пожалуйста» с фото, статусами и ответами.
import { el, ICON, timeAgo, toast, richText, safeUrl } from '../util.js';
import { segmented, empty, openSheet, field, photoGrid, photoPicker, busy } from '../ui.js';
import { teacherById } from '../data.js';

export const STATUS_CLASS = { 'На проверке': 'pill-review', 'Нужно поправить': 'pill-fix', 'Принято': 'pill-ok' };

export function waitingCount(S) {
  if (!S.req || !S.me) return 0;
  return S.req.requests.filter(r => (r.to === S.me.id && r.status === 'На проверке') || (r.from === S.me.id && r.status === 'Нужно поправить')).length;
}

export function renderRequests(app, id) {
  const { S } = app;
  const view = el('div', { class: 'view' });
  if (!S.me) {
    view.appendChild(el('h1', { class: 'view-title', text: 'Запросы' }));
    view.appendChild(empty('Раздел для учителей', 'Здесь учителя просят друг друга что-то проверить и получают ответ. Войдите по личному коду.',
      el('button', { type: 'button', class: 'btn btn-primary', text: 'Войти', onclick: () => app.login() })));
    return view;
  }
  if (!S.req) {
    view.appendChild(el('h1', { class: 'view-title', text: 'Запросы' }));
    if (S.reqError) view.appendChild(empty('Не получилось загрузить запросы', S.reqError, el('button', { type: 'button', class: 'btn btn-ghost', text: 'Попробовать ещё раз', onclick: () => app.loadRequests() })));
    else view.appendChild(el('div', { class: 'loading', text: 'Загружаю запросы…' }));
    return view;
  }
  return id ? detail(app, id) : list(app);
}

function list(app) {
  const { S } = app;
  const me = S.me.id;
  const incoming = S.req.requests.filter(r => r.to === me);
  const outgoing = S.req.requests.filter(r => r.from === me);
  const tab = S.reqTab || 'in';
  const view = el('div', { class: 'view' });
  view.appendChild(el('div', { class: 'view-head' }, [
    el('h1', { class: 'view-title', text: 'Запросы' }),
    el('button', { type: 'button', class: 'btn btn-primary btn-sm', onclick: () => newRequest(app) }, [el('span', { html: ICON.plus }), 'Запрос'])
  ]));
  const inWaiting = incoming.filter(r => r.status === 'На проверке').length;
  const outFix = outgoing.filter(r => r.status === 'Нужно поправить').length;
  view.appendChild(segmented([
    { value: 'in', label: 'Мне', count: inWaiting || null },
    { value: 'out', label: 'Мои', count: outFix || null }
  ], tab, v => { S.reqTab = v; app.render(); }, 'Запросы'));

  const items = (tab === 'in' ? incoming : outgoing).slice().sort((a, b) => {
    const wa = needsMe(S, a) ? 0 : (a.status === 'Принято' ? 2 : 1), wb = needsMe(S, b) ? 0 : (b.status === 'Принято' ? 2 : 1);
    return wa - wb || String(b.updated).localeCompare(String(a.updated));
  });
  if (!items.length) {
    view.appendChild(tab === 'in'
      ? empty('Вам пока ничего не присылали', 'Когда коллега попросит вас что-то посмотреть, запрос появится здесь, а на почту придёт письмо.')
      : empty('Вы ещё ничего не отправляли', 'Нажмите «Запрос», прикрепите фото или ссылку и выберите коллегу.'));
    return view;
  }
  view.appendChild(el('div', { class: 'cards' }, items.map(r => {
    const other = teacherById(S.req.teachers, tab === 'in' ? r.from : r.to);
    const cnt = S.req.comments.filter(c => c.request === r.id && c.text).length;
    return el('a', { class: 'card req' + (needsMe(S, r) ? ' attention' : ''), href: '#zaprosy/' + r.id }, [
      el('div', { class: 'req-top' }, [el('span', { class: 'pill ' + (STATUS_CLASS[r.status] || ''), text: r.status }), el('span', { class: 'req-time', text: timeAgo(r.updated || r.created) })]),
      el('div', { class: 'req-subject', text: r.subject }),
      el('div', { class: 'req-who', text: (tab === 'in' ? 'от ' : 'кому: ') + (other?.name || 'коллега') + (cnt ? ` · ${cnt} ${cnt === 1 ? 'ответ' : (cnt < 5 ? 'ответа' : 'ответов')}` : '') + (r.photos?.length ? ' · фото' : '') })
    ]);
  })));
  return view;
}

const needsMe = (S, r) => (r.to === S.me.id && r.status === 'На проверке') || (r.from === S.me.id && r.status === 'Нужно поправить');

function detail(app, id) {
  const { S } = app;
  const r = S.req.requests.find(x => x.id === id);
  const view = el('div', { class: 'view' });
  view.appendChild(el('a', { class: 'back', href: '#zaprosy' }, [el('span', { html: ICON.back }), 'Все запросы']));
  if (!r) { view.appendChild(empty('Запрос не найден', 'Возможно, он адресован не вам или ссылка устарела.')); return view; }
  const from = teacherById(S.req.teachers, r.from), to = teacherById(S.req.teachers, r.to);
  const iAmRecipient = r.to === S.me.id, iAmAuthor = r.from === S.me.id;

  view.appendChild(el('article', { class: 'req-detail' }, [
    el('span', { class: 'pill ' + (STATUS_CLASS[r.status] || ''), text: r.status }),
    el('h1', { class: 'req-title', text: r.subject }),
    el('div', { class: 'req-who', text: `${from?.name || 'Коллега'} → ${to?.name || 'коллега'} · ${timeAgo(r.created)}` }),
    r.text ? richText(r.text) : null,
    r.link ? el('a', { class: 'hw-link', href: safeUrl(r.link), target: '_blank', rel: 'noopener' }, [el('span', { html: ICON.link }), 'Открыть ссылку']) : null,
    photoGrid(r.photos)
  ]));

  const comments = S.req.comments.filter(c => c.request === r.id).sort((a, b) => String(a.created).localeCompare(String(b.created)));
  if (comments.length) {
    view.appendChild(el('ol', { class: 'timeline' }, comments.map(c => {
      const a = teacherById(S.req.teachers, c.author);
      return el('li', { class: 'tl' + (c.author === S.me.id ? ' mine' : '') }, [
        el('div', { class: 'tl-head' }, [el('b', { text: c.author === S.me.id ? 'Вы' : (a?.name || 'Коллега') }), el('span', { text: timeAgo(c.created) }),
          c.status ? el('span', { class: 'pill ' + (STATUS_CLASS[c.status] || ''), text: c.status }) : null]),
        c.text ? richText(c.text) : null,
        photoGrid(c.photos)
      ]);
    })));
  }

  // ответ
  const text = el('textarea', { id: 'reply-text', rows: '3', placeholder: iAmRecipient ? 'Что поправить или что понравилось' : 'Ответ или что исправили' });
  const photos = photoPicker('reply-photos');
  const err = el('div', { class: 'err', role: 'alert', hidden: true });
  const form = el('form', { class: 'reply', novalidate: true });
  const buttons = [];
  const send = (status, label) => el('button', { type: 'button', class: status === 'ok' ? 'btn btn-ok' : status === 'fix' ? 'btn btn-danger' : status === 'review' ? 'btn btn-primary' : 'btn btn-ghost', text: label,
    onclick: async e => {
      const btn = e.currentTarget;
      if (!status && !text.value.trim() && !photos.added.length) { err.textContent = 'Напишите ответ или прикрепите фото.'; err.hidden = false; text.focus(); return; }
      if (status === 'fix' && !text.value.trim()) { err.textContent = 'Напишите, что нужно поправить.'; err.hidden = false; text.focus(); return; }
      await busy(form, btn, 'Отправляю…', async () => {
        try {
          const res = await app.api.post('req.comment', { id: r.id, text: text.value.trim(), status, photos: photos.added.map(({ name, type, data, preview }) => ({ name, type, data, preview })) }, S.code);
          S.req.comments.push(res.comment);
          r.status = res.status || r.status; r.updated = res.comment.created;
          app.render(); toast(status === 'ok' ? 'Отмечено: принято' : status === 'fix' ? 'Отправлено на доработку' : 'Отправлено');
        } catch (e2) { err.textContent = e2.message; err.hidden = false; }
      });
    } });
  if (iAmRecipient && r.status !== 'Принято') buttons.push(send('ok', 'Принято'), send('fix', 'Нужно поправить'));
  if (iAmAuthor && r.status === 'Нужно поправить') buttons.push(send('review', 'Исправил(а), посмотри снова'));
  buttons.push(send('', 'Ответить'));
  form.append(el('h2', { class: 'group-title', text: 'Ответить' }), field('Комментарий', text), photos.node, err, el('div', { class: 'reply-actions' }, buttons));
  form.addEventListener('submit', e => e.preventDefault());
  view.appendChild(form);
  return view;
}

function newRequest(app) {
  const { S } = app;
  const colleagues = S.req.teachers.filter(t => t.id !== S.me.id).sort((a, b) => a.name.localeCompare(b.name, 'ru'));
  const f = {
    to: el('select', { id: 'rq-to', class: 'select' }, [el('option', { value: '', text: 'Выберите коллегу' }), ...colleagues.map(t => el('option', { value: t.id, text: t.subjects ? `${t.name} — ${t.subjects}` : t.name }))]),
    subject: el('input', { id: 'rq-subject', type: 'text', placeholder: 'Например: проверь вопросы к контрольной 6А', maxlength: '140' }),
    text: el('textarea', { id: 'rq-text', rows: '3', placeholder: 'Что именно посмотреть' }),
    link: el('input', { id: 'rq-link', type: 'url', inputmode: 'url', placeholder: 'https://… (необязательно)' })
  };
  const photos = photoPicker('rq-photos');
  const err = el('div', { class: 'err', role: 'alert', hidden: true });
  const save = el('button', { type: 'submit', class: 'btn btn-primary', text: 'Отправить' });
  const form = el('form', { class: 'form', novalidate: true }, [
    field('Кому', f.to), field('Тема', f.subject), field('Подробности', f.text), field('Ссылка', f.link),
    el('div', { class: 'field' }, [el('span', { class: 'label', text: 'Фото' }), photos.node]),
    el('p', { class: 'hint', text: 'Коллеге придёт письмо на почту, если она указана в таблице учителей.' }),
    err, el('div', { class: 'form-actions' }, [el('span', { class: 'spacer' }), save])
  ]);
  const showErr = m => { err.textContent = m; err.hidden = false; };
  form.addEventListener('submit', async e => {
    e.preventDefault();
    if (!f.to.value) { f.to.focus(); return showErr('Выберите, кому отправить.'); }
    if (!f.subject.value.trim()) { f.subject.focus(); return showErr('Впишите тему.'); }
    if (f.link.value && !/^https?:\/\//i.test(f.link.value.trim())) { f.link.focus(); return showErr('Ссылка должна начинаться с https://'); }
    await busy(form, save, photos.added.length ? 'Загружаю фото…' : 'Отправляю…', async () => {
      try {
        const res = await app.api.post('req.create', { item: { to: f.to.value, subject: f.subject.value.trim(), text: f.text.value.trim(), link: f.link.value.trim(),
          photos: photos.added.map(({ name, type, data, preview }) => ({ name, type, data, preview })) } }, S.code);
        S.req.requests.push(res.request);
        S.reqTab = 'out';
        close(); app.go('zaprosy/' + res.request.id); toast('Запрос отправлен');
      } catch (e2) { showErr(e2.message); }
    });
  });
  const close = openSheet('Новый запрос', form);
}
