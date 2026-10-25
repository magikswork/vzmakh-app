// Ссылки: та же Google Таблица, что у страницы vzmakh-links.
import { el, ICON, norm, toast, safeUrl, store } from '../util.js';
import { empty } from '../ui.js';
import { CONFIG } from '../config.js';

let state = { links: store.get('links', null), status: 'idle', q: '' };

export function loadLinks(onDone) {
  if (state.status === 'loading') return;
  state.status = 'loading';
  const cb = '__vzLinks' + Date.now();
  let done = false;
  const finish = ok => { if (done) return; done = true; state.status = ok ? 'fresh' : 'failed'; delete window[cb]; onDone && onDone(); };
  const timer = setTimeout(() => finish(false), 9000);
  window[cb] = resp => {
    clearTimeout(timer);
    const rows = resp?.table?.rows || [];
    const v = (c, i) => { const x = c[i]; return x ? String(x.f ?? x.v ?? '').trim() : ''; };
    const list = rows.map(r => { const c = r.c || []; return { section: v(c, 0), title: v(c, 1), url: v(c, 2), note: v(c, 3) }; })
      .filter(l => l.title && /^https?:\/\//i.test(l.url));
    if (list.length) { state.links = list; store.set('links', list); }
    finish(!!list.length);
  };
  const s = document.createElement('script');
  s.src = `https://docs.google.com/spreadsheets/d/${CONFIG.LINKS_SHEET_ID}/gviz/tq?headers=1&tqx=out:json;responseHandler:${cb}&_=${Date.now()}`;
  s.onerror = () => { clearTimeout(timer); finish(false); };
  document.head.appendChild(s);
}

function kind(url) {
  if (/docs\.google\.com\/spreadsheets/.test(url)) return { label: 'Таблица', icon: ICON.sheet, cls: '' };
  if (/docs\.google\.com\/forms|forms\.gle/.test(url)) return { label: 'Форма', icon: ICON.form, cls: 'form' };
  if (/docs\.google\.com\/(document|presentation)/.test(url)) return { label: 'Документ', icon: ICON.doc, cls: '' };
  try { return { label: new URL(url).hostname.replace(/^www\./, ''), icon: ICON.link, cls: '' }; } catch { return { label: 'Ссылка', icon: ICON.link, cls: '' }; }
}

export function renderLinks(app) {
  if (state.status === 'idle') loadLinks(() => app.render());
  const view = el('div', { class: 'view' });
  view.appendChild(el('h1', { class: 'view-title', text: 'Ссылки' }));
  if (!state.links) {
    view.appendChild(state.status === 'failed'
      ? empty('Не получилось загрузить ссылки', 'Проверьте интернет и обновите страницу.')
      : el('div', { class: 'loading', text: 'Загружаю ссылки…' }));
    return view;
  }
  const results = el('div', { class: 'link-results' });
  const input = el('input', { id: 'links-q', type: 'search', class: 'search-input', placeholder: 'Найти: 5 класс, олимпиады…', autocomplete: 'off', value: state.q,
    'aria-label': 'Поиск по ссылкам', oninput: e => { state.q = e.target.value; draw(); } });
  view.appendChild(el('div', { class: 'search' }, [el('span', { html: ICON.search }), input]));
  view.appendChild(results);

  function draw() {
    results.innerHTML = '';
    const words = norm(state.q).split(/\s+/).filter(Boolean);
    const sections = [];
    state.links.forEach(l => {
      const [title, ...rest] = (l.section || 'Другое').split(/\s+[—–-]\s+/);
      let s = sections.find(x => x.key === l.section);
      if (!s) { s = { key: l.section, title: title.trim(), note: rest.join(' — '), items: [] }; sections.push(s); }
      s.items.push(l);
    });
    let shown = 0;
    sections.forEach(s => {
      const items = s.items.filter(l => { const hay = norm([l.title, l.note, s.title, s.note].join(' ')); return words.every(w => hay.includes(w)); });
      if (!items.length) return;
      shown += items.length;
      const tiles = s.items.every(l => /^\d{1,2}\s/.test(l.title + ' '));
      results.appendChild(el('section', { class: 'group' }, [
        el('h2', { class: 'group-title' }, [s.title, s.note ? el('span', { class: 'hand', text: ' ' + s.note }) : null]),
        tiles
          ? el('div', { class: 'tiles' }, items.map(l => { const m = /^(\d{1,2})\s*(.*)$/.exec(l.title); return el('a', { class: 'tile', href: safeUrl(l.url), target: '_blank', rel: 'noopener' }, [el('span', { class: 'tile-num', text: m[1] }), el('span', { class: 'tile-lbl', text: m[2] || '' })]); }))
          : el('div', { class: 'list' }, items.map(l => { const k = kind(l.url); return el('div', { class: 'row' }, [
              el('a', { class: 'row-main', href: safeUrl(l.url), target: '_blank', rel: 'noopener' }, [
                el('span', { class: 'badge ' + k.cls, html: k.icon, 'aria-hidden': 'true' }),
                el('span', { class: 'row-text' }, [el('span', { class: 'row-title', text: l.title }), el('span', { class: 'row-sub', text: l.note ? `${l.note} · ${k.label}` : k.label })])
              ]),
              el('button', { type: 'button', class: 'icon-btn', 'aria-label': `Скопировать ссылку «${l.title}»`, title: 'Скопировать', html: ICON.copy, onclick: () => {
                try { navigator.clipboard.writeText(l.url).then(() => toast('Ссылка скопирована'), () => toast('Не получилось скопировать', 'error')); } catch { toast('Не получилось скопировать', 'error'); }
              } })
            ]); }))
      ]));
    });
    if (!shown) results.appendChild(empty('Ничего не нашлось', `По запросу «${state.q}» ссылок нет.`));
  }
  draw();
  return view;
}
