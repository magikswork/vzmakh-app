// Общие помощники: разметка, даты, хранение, уведомления, фото.

export function el(tag, attrs, kids) {
  const n = document.createElement(tag);
  if (attrs) for (const k in attrs) {
    const v = attrs[k];
    if (v === null || v === undefined || v === false) continue;
    if (k === 'text') n.textContent = v;
    else if (k === 'html') n.innerHTML = v;
    else if (k === 'class') n.className = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else if (k === 'value') n.value = v;
    else n.setAttribute(k, v === true ? '' : v);
  }
  (kids || []).flat().forEach(c => { if (c !== null && c !== undefined && c !== false) n.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c); });
  return n;
}

export const norm = s => String(s ?? '').toLowerCase().replace(/ё/g, 'е').trim();

export function plural(n, a, b, c) {
  const m10 = n % 10, m100 = n % 100;
  return m10 === 1 && m100 !== 11 ? a : (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20) ? b : c);
}

/* ---------- даты (строки YYYY-MM-DD в местном времени) ---------- */
const pad = n => String(n).padStart(2, '0');
export const toISO = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const fromISO = s => { const [y, m, d] = String(s).split('-').map(Number); return new Date(y, m - 1, d); };
export const todayISO = () => toISO(new Date());
export const addDays = (iso, n) => { const d = fromISO(iso); d.setDate(d.getDate() + n); return toISO(d); };
export const weekday = iso => { const w = fromISO(iso).getDay(); return w === 0 ? 7 : w; }; // 1 = пн … 7 = вс
export const weekStart = iso => addDays(iso, 1 - weekday(iso));
export const DAYS_SHORT = ['', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
export const DAYS_FULL = ['', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота', 'воскресенье'];
const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const MONTHS_SHORT = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
export const dayNum = iso => fromISO(iso).getDate();
export const fmtDate = iso => { const d = fromISO(iso); return `${d.getDate()} ${MONTHS[d.getMonth()]}`; };
export const fmtDateShort = iso => { const d = fromISO(iso); return `${DAYS_SHORT[weekday(iso)].toLowerCase()}, ${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`; };

export function relDay(iso) {
  const t = todayISO();
  if (iso === t) return 'сегодня';
  if (iso === addDays(t, 1)) return 'завтра';
  if (iso === addDays(t, -1)) return 'вчера';
  return fmtDateShort(iso);
}

export function timeAgo(ts) {
  if (!ts) return '';
  const d = new Date(ts); const s = (Date.now() - d.getTime()) / 1000;
  if (s < 60) return 'только что';
  if (s < 3600) { const m = Math.floor(s / 60); return `${m} ${plural(m, 'минуту', 'минуты', 'минут')} назад`; }
  if (s < 86400 && toISO(d) === todayISO()) return `сегодня в ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  if (toISO(d) === addDays(todayISO(), -1)) return `вчера в ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

export const nowHHMM = () => { const d = new Date(); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };

/* ---------- хранение в браузере (может быть недоступно) ---------- */
export const store = {
  get(k, def) { try { const v = localStorage.getItem('vz.' + k); return v === null ? def : JSON.parse(v); } catch { return def; } },
  set(k, v) { try { localStorage.setItem('vz.' + k, JSON.stringify(v)); } catch {} },
  del(k) { try { localStorage.removeItem('vz.' + k); } catch {} }
};

/* ---------- уведомление внизу экрана ---------- */
let toastTimer;
export function toast(msg, kind) {
  let t = document.getElementById('toast');
  if (!t) { t = el('div', { id: 'toast', class: 'toast', role: 'status' }); document.body.appendChild(t); }
  t.textContent = msg; t.dataset.kind = kind || ''; t.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, kind === 'error' ? 5000 : 2600);
}

/* ---------- текст: ссылки кликабельные, переносы строк сохраняются ---------- */
export function richText(text) {
  const wrap = el('div', { class: 'rich' });
  String(text || '').split(/(https?:\/\/[^\s<>"]+)/g).forEach((part, i) => {
    if (i % 2) wrap.appendChild(el('a', { href: part, target: '_blank', rel: 'noopener', text: part.length > 48 ? part.slice(0, 45) + '…' : part }));
    else if (part) wrap.appendChild(document.createTextNode(part));
  });
  return wrap;
}

export const safeUrl = u => /^https?:\/\//i.test(u || '') ? u : '#';

/* ---------- фото: уменьшаем до 1600px и отдаём base64 ---------- */
export async function prepPhoto(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
    const max = 1600, k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement('canvas');
    c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    const dataUrl = c.toDataURL('image/jpeg', 0.82);
    return { name: (file.name || 'photo').replace(/\.\w+$/, '') + '.jpg', type: 'image/jpeg', data: dataUrl.split(',')[1], preview: dataUrl };
  } finally { URL.revokeObjectURL(url); }
}

/* Картинка с Google Диска по id файла (или data: для демо и только что выбранных) */
export const photoThumb = id => id.startsWith('data:') ? id : `https://drive.google.com/thumbnail?id=${encodeURIComponent(id)}&sz=w800`;
export const photoFull = id => id.startsWith('data:') ? id : `https://drive.google.com/file/d/${encodeURIComponent(id)}/view`;

/* Сортировка классов: 5А, 5Б, 6А … 10А, 11Б */
export function classSort(a, b) {
  const na = parseInt(a, 10), nb = parseInt(b, 10);
  if (!isNaN(na) && !isNaN(nb) && na !== nb) return na - nb;
  return String(a).localeCompare(String(b), 'ru');
}

export const ICON = {
  plus: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  back: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>',
  left: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>',
  right: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5l7 7-7 7"/></svg>',
  edit: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 20h4L19 9l-4-4L4 16z"/></svg>',
  camera: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>',
  link: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/></svg>',
  close: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  copy: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h8"/></svg>',
  search: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/></svg>',
  // нижнее меню
  tSchedule: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="5" width="17" height="15" rx="3"/><path d="M3.5 10h17M8 3v4M16 3v4M8 14h3M8 17h6"/></svg>',
  tHomework: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 4h10l4 4v12H5z"/><path d="M15 4v4h4M8.5 13l2 2 4-4"/></svg>',
  tRequests: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5h16v11H9l-5 4z"/><path d="M8.5 10.5l2 2 4.5-4.5"/></svg>',
  tGrades: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="4" width="17" height="16" rx="3"/><path d="M3.5 9.5h17M9 9.5V20"/><path d="M13 13.5l1.5-1v5M17 14.2a1.3 1.3 0 1 1 1.6 1.9L16.8 17.5h2.4"/></svg>',
  tLinks: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/></svg>',
  sheet: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="4" y="3" width="16" height="18" rx="2.5"/><path d="M4 9h16M4 15h16M10 9v12"/></svg>',
  form: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="4" y="3" width="16" height="18" rx="2.5"/><path d="M8 8.5l1.5 1.5L12 7.5M14 9h2.5M8 15l1.5 1.5L12 14M14 15.5h2.5"/></svg>',
  doc: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 3h8l4 4v14H6z"/><path d="M9 12h6M9 16h6"/></svg>'
};
