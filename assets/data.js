// Вычисления по расписанию и ДЗ, без интерфейса.
// Расписание приходит днями: { date, title, classes: ['3 класс', …], items: { '3 класс': [{kind, num, start, end, title, groups, meal, color}] } }
// Группа урока: { code: '2.1', subject: 'Русский язык', teachers: 'Ирина, Алина Вл + Катя', room: 'YL' }
import { norm, addDays, todayISO, classSort } from './util.js';

export const splitClasses = s => String(s || '').split(/[,;]\s*/).map(x => x.trim()).filter(Boolean);

export function classesList(pub) {
  const seen = [];
  (pub?.days || []).forEach(d => d.classes.forEach(c => { if (!seen.includes(c)) seen.push(c); }));
  const extra = new Set();
  (pub?.homework || []).forEach(h => splitClasses(h.cls).forEach(c => { if (!seen.includes(c)) extra.add(c); }));
  return [...seen.sort(classSort), ...[...extra].sort(classSort)];
}

export const dayFor = (pub, date) => (pub?.days || []).find(d => d.date === date) || null;
export const hasSaturday = pub => (pub?.days || []).some(d => new Date(d.date + 'T12:00').getDay() === 6);

export function itemsFor(pub, cls, date) {
  const d = dayFor(pub, date);
  return d && d.items[cls] ? d.items[cls] : null;
}

/* Какой день показать при открытии: сегодня, пока уроки не закончились, потом — ближайший готовый */
export function defaultDate(pub, cls, nowHHMM) {
  const t = todayISO();
  const today = itemsFor(pub, cls, t);
  const lastEnd = today && today.length ? today.reduce((m, it) => it.end > m ? it.end : m, '00:00') : '';
  if (today && today.length && nowHHMM < lastEnd) return t;
  const next = (pub?.days || []).map(d => d.date).filter(d => d > t).sort()[0];
  if (next && next <= addDays(t, 7)) return next;
  return t;
}

const subjMatch = (group, subject) => { const g = norm(group), s = norm(subject); return !!s && (g === s || g.startsWith(s + ' ') || g.startsWith(s + ' (')); };

export function lessonHasSubject(it, subject) {
  return it.kind === 'lesson' && (it.groups.length ? it.groups.map(g => g.subject) : [it.title]).some(g => subjMatch(g, subject));
}

/* Ближайший урок по предмету у класса — для срока ДЗ по умолчанию */
export function nextLessonDate(pub, cls, subject, from = todayISO()) {
  if (!pub || !cls || !subject) return '';
  const days = (pub.days || []).filter(d => d.date > from).sort((a, b) => a.date.localeCompare(b.date));
  for (const d of days) if ((d.items[cls] || []).some(it => lessonHasSubject(it, subject))) return d.date;
  return '';
}

export function subjectsList(pub, me) {
  const set = new Set();
  String(me?.subjects || '').split(/[,;]\s*/).forEach(s => s.trim() && set.add(s.trim()));
  (pub?.days || []).forEach(d => Object.values(d.items).forEach(list => list.forEach(it => {
    if (it.kind === 'lesson') it.groups.forEach(g => { if (!/прогулк|индивидуальн/i.test(g.subject)) set.add(g.subject.replace(/\s*\(.*\)$/, '')); });
  })));
  return [...set];
}

export function teacherById(list, id) { return (list || []).find(t => t.id === id) || null; }

/* ---------- учителя в расписании: «Марина пс», «Лиза + Алина», «Алина Вл» ---------- */
export const teacherTokens = s => String(s || '').split(/\s*[,+]\s*/).map(x => x.replace(/\(.*?\)/g, '').trim()).filter(x => /^[А-ЯЁA-Z]/.test(x) && x.length > 1);

export function teacherNames(pub) {
  const set = new Map();
  (pub?.days || []).forEach(d => Object.values(d.items).forEach(list => list.forEach(it => (it.groups || []).forEach(g =>
    teacherTokens(g.teachers).forEach(n => { const k = norm(n); if (!set.has(k)) set.set(k, n); })))));
  return [...set.values()].sort((a, b) => a.localeCompare(b, 'ru'));
}

/* Все занятия учителя за день: по всем классам, общие уроки склеены */
export function teacherDay(pub, name, date) {
  const d = dayFor(pub, date);
  if (!d || !name) return null;
  const key = norm(name), out = [];
  d.classes.forEach(cls => (d.items[cls] || []).forEach(it => (it.groups || []).forEach(g => {
    if (!teacherTokens(g.teachers).some(n => norm(n) === key)) return;
    const same = out.find(o => o.start === it.start && o.subject === g.subject && o.room === (g.room || ''));
    if (same) { if (!same.classes.includes(cls)) same.classes.push(cls); return; }
    out.push({ start: it.start, end: it.end, num: it.num, color: it.color, subject: g.subject, code: g.code || '', room: g.room || '',
      others: teacherTokens(g.teachers).filter(n => norm(n) !== key), classes: [cls] });
  })));
  return out.sort((a, b) => a.start.localeCompare(b.start));
}
