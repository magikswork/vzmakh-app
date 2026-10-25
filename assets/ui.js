// Общие элементы интерфейса: всплывающая панель, переключатели, выбор фото.
import { el, ICON, prepPhoto, photoThumb, photoFull, toast } from './util.js';

/* ---------- панель снизу (на компьютере — по центру) ---------- */
export function openSheet(title, body, opts = {}) {
  const prevFocus = document.activeElement;
  const closeBtn = el('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Закрыть', html: ICON.close, onclick: () => close() });
  const panel = el('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': title }, [
    el('div', { class: 'sheet-head' }, [el('h2', { text: title }), closeBtn]),
    el('div', { class: 'sheet-body' }, [body])
  ]);
  const overlay = el('div', { class: 'overlay', onclick: e => { if (e.target === overlay) close(); } }, [panel]);
  function onKey(e) {
    if (e.key === 'Escape') close();
    if (e.key === 'Tab') {
      const f = [...panel.querySelectorAll('button,input,select,textarea,a[href]')].filter(x => !x.disabled && x.offsetParent);
      if (!f.length) return;
      if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
    }
  }
  function close() {
    document.removeEventListener('keydown', onKey);
    overlay.remove();
    document.body.classList.remove('no-scroll');
    if (prevFocus && prevFocus.focus) prevFocus.focus();
    opts.onClose && opts.onClose();
  }
  document.addEventListener('keydown', onKey);
  document.body.appendChild(overlay);
  document.body.classList.add('no-scroll');
  const first = panel.querySelector(opts.focus || 'input,textarea,select');
  (first || closeBtn).focus();
  return close;
}

/* ---------- ряд «таблеток» для выбора (класс, вкладка) ---------- */
export function chips(items, active, onPick, opts = {}) {
  return el('div', { class: 'chips' + (opts.scroll ? ' chips-scroll' : ''), role: 'group', 'aria-label': opts.label || '' },
    items.map(it => {
      const value = typeof it === 'string' ? it : it.value;
      const label = typeof it === 'string' ? it : it.label;
      const on = Array.isArray(active) ? active.includes(value) : active === value;
      return el('button', { type: 'button', class: 'chip' + (on ? ' on' : ''), 'aria-pressed': on ? 'true' : 'false', onclick: () => onPick(value) },
        [label, it.count ? el('span', { class: 'chip-count', text: it.count }) : null]);
    }));
}

export function segmented(items, active, onPick, label) {
  return el('div', { class: 'seg', role: 'tablist', 'aria-label': label || '' }, items.map(it =>
    el('button', { type: 'button', role: 'tab', class: 'seg-btn' + (it.value === active ? ' on' : ''), 'aria-selected': it.value === active ? 'true' : 'false', onclick: () => onPick(it.value) },
      [it.label, it.count ? el('span', { class: 'seg-count', text: it.count }) : null])));
}

export function empty(title, text, action) {
  return el('div', { class: 'empty' }, [el('div', { class: 'empty-title', text: title }), text ? el('p', { text }) : null, action || null]);
}

export function field(label, control, hint, id) {
  return el('div', { class: 'field' }, [el('label', { for: id || control.id, text: label }), control, hint ? el('span', { class: 'hint', text: hint }) : null]);
}

/* ---------- фото: просмотр ---------- */
export function photoGrid(ids) {
  if (!ids || !ids.length) return null;
  return el('div', { class: 'photos' }, ids.map(id => el('a', { href: photoFull(id), target: '_blank', rel: 'noopener', class: 'photo', 'aria-label': 'Открыть фото' },
    [el('img', { src: photoThumb(id), alt: 'Фото', loading: 'lazy', referrerpolicy: 'no-referrer' })])));
}

/* ---------- фото: выбор с предпросмотром ---------- */
export function photoPicker(id, keep = []) {
  let kept = [...keep];
  let added = [];
  const input = el('input', { id, type: 'file', accept: 'image/*', multiple: true, class: 'visually-hidden' });
  const list = el('div', { class: 'photos photos-edit' });
  const addBtn = el('label', { for: id, class: 'photo-add', tabindex: '0', role: 'button',
    onkeydown: e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); } } },
    [el('span', { html: ICON.camera }), el('span', { text: 'Добавить фото' })]);
  function draw() {
    list.innerHTML = '';
    kept.forEach((pid, i) => list.appendChild(thumb(photoThumb(pid), () => { kept.splice(i, 1); draw(); })));
    added.forEach((p, i) => list.appendChild(thumb(p.preview, () => { added.splice(i, 1); draw(); })));
    list.appendChild(addBtn);
  }
  function thumb(src, onRemove) {
    return el('div', { class: 'photo' }, [el('img', { src, alt: 'Выбранное фото' }),
      el('button', { type: 'button', class: 'photo-x', 'aria-label': 'Убрать фото', html: ICON.close, onclick: onRemove })]);
  }
  input.addEventListener('change', async () => {
    const files = [...input.files].slice(0, 6 - kept.length - added.length);
    input.value = '';
    for (const f of files) {
      try { added.push(await prepPhoto(f)); } catch { toast('Это фото не получилось открыть. Попробуйте другое.', 'error'); }
    }
    if (kept.length + added.length >= 6) toast('Можно прикрепить до 6 фото');
    draw();
  });
  draw();
  return {
    node: el('div', { class: 'photo-picker' }, [input, list]),
    get kept() { return kept; },
    get added() { return added; },
    clear() { kept = []; added = []; draw(); }
  };
}

/* ---------- кнопка, которая просит подтвердить вторым нажатием ---------- */
export function confirmButton(label, confirmLabel, onConfirm, cls = 'btn btn-danger') {
  let armed = false, timer;
  const b = el('button', { type: 'button', class: cls, text: label, onclick: () => {
    if (!armed) { armed = true; b.textContent = confirmLabel; timer = setTimeout(() => { armed = false; b.textContent = label; }, 4000); return; }
    clearTimeout(timer); onConfirm(b);
  } });
  return b;
}

/* ---------- блокировка кнопок, пока идёт сохранение ---------- */
export async function busy(form, btn, label, fn) {
  const buttons = [...form.querySelectorAll('button')];
  const old = btn.textContent;
  buttons.forEach(b => b.disabled = true);
  btn.textContent = label;
  try { return await fn(); }
  finally { buttons.forEach(b => b.disabled = false); btn.textContent = old; }
}
