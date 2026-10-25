// Каркас приложения: шапка, нижнее меню, вход учителя, загрузка данных, переходы.
import { el, ICON, store, toast } from './util.js';
import { api, isDemo } from './api.js';
import { openSheet, field, busy } from './ui.js';
import { renderSchedule } from './views/schedule.js';
import { renderHomework } from './views/homework.js';
import { renderRequests, waitingCount } from './views/requests.js';
import { renderLinks } from './views/links.js';

const S = {
  pub: store.get('pub', null),
  pubError: '',
  me: store.get('me', null),
  code: store.get('code', ''),
  sel: Object.assign({ mode: 'class', cls: '', teacher: '' }, store.get('sel', {})),
  date: '',
  hwMine: false,
  req: null, reqError: '', reqTab: 'in'
};

const TABS = [
  { id: 'raspisanie', label: 'Расписание', icon: ICON.tSchedule },
  { id: 'dz', label: 'Домашка', icon: ICON.tHomework },
  { id: 'zaprosy', label: 'Запросы', icon: ICON.tRequests, teachers: true },
  { id: 'ssylki', label: 'Ссылки', icon: ICON.tLinks }
];

const app = {
  S, api,
  render,
  go: hash => { if (location.hash === '#' + hash) render(); else location.hash = hash; },
  saveSel: () => store.set('sel', S.sel),
  login: loginSheet,
  loadRequests,
  refreshPublic
};

const root = document.getElementById('app');

function route() {
  const h = decodeURIComponent(location.hash.replace(/^#\/?/, ''));
  const [tab, id] = h.split('/');
  return { tab: TABS.some(t => t.id === tab) ? tab : 'raspisanie', id };
}

/* ---------- отрисовка ---------- */
let lastTab = '';
function render() {
  const { tab, id } = route();
  const keepScroll = tab === lastTab ? window.scrollY : 0;
  lastTab = tab;
  const waiting = waitingCount(S);

  const header = el('header', { class: 'top' }, [
    el('a', { class: 'brand', href: '#raspisanie', 'aria-label': 'Взмах, на главную' }, [
      el('span', { class: 'logo', role: 'img', 'aria-label': 'Логотип школы «Взмах»' }),
      el('span', { class: 'brand-text' }, [el('span', { class: 'brand-name', text: 'Взмах' }), el('span', { class: 'brand-city', text: 'Москва' })])
    ]),
    el('nav', { class: 'nav-top', 'aria-label': 'Разделы' }, tabLinks(tab, waiting)),
    S.me
      ? el('button', { type: 'button', class: 'me', onclick: accountSheet, 'aria-label': `Вы вошли как ${S.me.name}` }, [el('span', { class: 'me-avatar', text: initials(S.me.name) }), el('span', { class: 'me-name', text: S.me.name.split(' ')[0] })])
      : el('button', { type: 'button', class: 'btn btn-ghost btn-sm', text: 'Вход для учителей', onclick: loginSheet })
  ]);

  const main = el('main', { id: 'main', class: 'main', tabindex: '-1' });
  if (isDemo) main.appendChild(el('div', { class: 'banner' }, [el('b', { text: 'Демо-режим. ' }), 'Это примерные данные: приложение ещё не подключено к школьной таблице. Вход — любой код от 4 символов.']));
  if (S.pubError && S.pub) main.appendChild(el('div', { class: 'banner banner-warn', text: 'Не удалось обновить данные — показана сохранённая версия. ' + S.pubError }));

  if (!S.pub && tab !== 'ssylki') {
    main.appendChild(S.pubError
      ? el('div', { class: 'empty' }, [el('div', { class: 'empty-title', text: 'Не получилось загрузить данные' }), el('p', { text: S.pubError }), el('button', { type: 'button', class: 'btn btn-primary', text: 'Попробовать ещё раз', onclick: refreshPublic })])
      : skeleton());
  } else if (tab === 'raspisanie') main.appendChild(renderSchedule(app));
  else if (tab === 'dz') main.appendChild(renderHomework(app));
  else if (tab === 'zaprosy') { main.appendChild(renderRequests(app, id)); if (S.me && !S.req && !S.reqError && !S.reqLoading) loadRequests(); }
  else if (tab === 'ssylki') main.appendChild(renderLinks(app));

  const bottom = el('nav', { class: 'tabbar', 'aria-label': 'Разделы' }, tabLinks(tab, waiting));
  root.replaceChildren(header, main, bottom);
  document.title = (TABS.find(t => t.id === tab)?.label || 'Взмах') + ' · Взмах';
  if (keepScroll) window.scrollTo(0, keepScroll);
  // выбранный класс всегда виден в ленте классов
  document.querySelectorAll('.chips-scroll').forEach(row => {
    const on = row.querySelector('.chip.on');
    if (on) row.scrollLeft = on.offsetLeft - row.clientWidth / 2 + on.offsetWidth / 2;
  });
}

function tabLinks(active, waiting) {
  return TABS.filter(t => !t.teachers || S.me).map(t => el('a', { href: '#' + t.id, class: 'tab' + (t.id === active ? ' on' : ''), 'aria-current': t.id === active ? 'page' : null }, [
    el('span', { class: 'tab-icon', html: t.icon }),
    el('span', { class: 'tab-label', text: t.label }),
    t.id === 'zaprosy' && waiting ? el('span', { class: 'tab-badge', text: waiting, 'aria-label': `${waiting} ждут ответа` }) : null
  ]));
}

function skeleton() {
  return el('div', { class: 'view', 'aria-busy': 'true' }, [el('div', { class: 'sk sk-title' }), el('div', { class: 'sk sk-chips' }), ...Array.from({ length: 5 }, () => el('div', { class: 'sk sk-row' }))]);
}

const initials = name => name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();

/* ---------- данные ---------- */
let refreshing = false, lastRefresh = 0;
async function refreshPublic() {
  if (refreshing) return;
  refreshing = true;
  try {
    const pub = await api.getPublic();
    S.pub = pub; S.pubError = ''; lastRefresh = Date.now();
    store.set('pub', pub);
  } catch (e) { S.pubError = e.message; }
  finally { refreshing = false; render(); }
}

async function loadRequests() {
  if (!S.me || S.reqLoading) return;
  S.reqError = ''; S.reqLoading = true;
  try { S.req = await api.post('req.list', {}, S.code); }
  catch (e) { S.reqLoading = false; if (e.code === 'auth') return logout('Код больше не действует. Войдите заново.'); S.reqError = e.message; }
  S.reqLoading = false;
  render();
}

/* ---------- вход и выход ---------- */
function loginSheet() {
  const input = el('input', { id: 'login-code', type: 'text', autocomplete: 'one-time-code', autocapitalize: 'characters', spellcheck: 'false', placeholder: 'Например: K7M2Q9XA', maxlength: '20' });
  const err = el('div', { class: 'err', role: 'alert', hidden: true });
  const btn = el('button', { type: 'submit', class: 'btn btn-primary btn-wide', text: 'Войти' });
  const form = el('form', { class: 'form', novalidate: true }, [
    el('p', { class: 'form-lead', text: 'Учителя входят по личному коду. Его выдаёт администратор. После входа можно задавать ДЗ и отправлять запросы коллегам.' }),
    field('Личный код', input), err, btn
  ]);
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const code = input.value.trim().toUpperCase();
    if (!code) { err.textContent = 'Введите код.'; err.hidden = false; return; }
    await busy(form, btn, 'Проверяю…', async () => {
      try {
        const res = await api.post('login', {}, code);
        S.me = res.teacher; S.code = code; S.req = null; S.reqError = '';
        store.set('me', S.me); store.set('code', code);
        close(); toast(`Здравствуйте, ${S.me.name.split(' ')[0]}!`);
        render();
      } catch (e2) { err.textContent = e2.message; err.hidden = false; input.select(); }
    });
  });
  const close = openSheet('Вход для учителей', form);
}

function accountSheet() {
  const body = el('div', { class: 'form' }, [
    el('p', { class: 'form-lead', text: `Вы вошли как ${S.me.name}${S.me.subjects ? ' (' + S.me.subjects + ')' : ''}.` }),
    S.me.role === 'админ' ? el('p', { class: 'hint', text: 'У вас права администратора: можно вносить замены в расписание.' }) : null,
    S.me.hasEmail === false ? el('p', { class: 'hint', text: 'В таблице учителей не указана ваша почта, поэтому письма о новых запросах не приходят.' }) : null,
    el('button', { type: 'button', class: 'btn btn-ghost btn-wide', text: 'Выйти', onclick: () => { close(); logout(); } })
  ]);
  const close = openSheet('Аккаунт', body);
}

function logout(msg) {
  S.me = null; S.code = ''; S.req = null; S.hwMine = false;
  store.del('me'); store.del('code');
  if (route().tab === 'zaprosy') location.hash = 'raspisanie';
  render();
  if (msg) toast(msg, 'error');
}

/* ---------- запуск ---------- */
window.addEventListener('hashchange', () => { render(); document.getElementById('main')?.focus({ preventScroll: true }); });
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  if (Date.now() - lastRefresh > 2 * 60e3) refreshPublic();
  if (S.me && route().tab === 'zaprosy') loadRequests();
});

render();
refreshPublic();
// Пока приложение открыто, раз в минуту подтягиваем изменения расписания и ДЗ.
setInterval(() => {
  const typing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName || '') || document.querySelector('.overlay');
  if (document.visibilityState === 'visible' && !typing) refreshPublic();
}, 60e3);
// Проверяем сохранённый код (могли отозвать) и обновляем роль.
if (S.code) api.post('login', {}, S.code).then(res => { S.me = res.teacher; store.set('me', S.me); render(); }, e => { if (e.code === 'auth') logout('Код больше не действует. Войдите заново.'); });
