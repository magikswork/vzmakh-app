// Работа с данными расписания и ДЗ: без интерфейса, только вычисления.
import { norm, weekday, addDays, todayISO, classSort } from './util.js';

export function classesList(pub) {
  const set = new Set();
  (pub?.schedule || []).forEach(s => set.add(s.cls));
  (pub?.homework || []).forEach(h => splitClasses(h.cls).forEach(c => set.add(c)));
  return [...set].filter(Boolean).sort(classSort);
}

export function scheduleTeachers(pub) {
  const set = new Set();
  (pub?.schedule || []).forEach(s => s.teacher && set.add(s.teacher.trim()));
  (pub?.subs || []).forEach(s => s.teacher && set.add(s.teacher.trim()));
  return [...set].sort((a, b) => a.localeCompare(b, 'ru'));
}

export const splitClasses = s => String(s || '').split(/[,;]\s*/).map(x => x.trim()).filter(Boolean);
export const sameName = (a, b) => !!a && !!b && norm(a) === norm(b);

export function bellFor(pub, n) { return (pub?.bells || []).find(b => b.lesson === n) || null; }

export function hasSaturday(pub) { return (pub?.schedule || []).some(s => s.day === 6); }

/* Уроки на дату для класса или учителя, с учётом замен */
export function lessonsFor(pub, sel, date) {
  if (!pub) return [];
  const day = weekday(date);
  const subs = (pub.subs || []).filter(s => s.date === date);
  const out = new Map(); // ключ: класс|урок

  if (sel.mode === 'teacher') {
    const T = sel.teacher;
    pub.schedule.filter(s => s.day === day && sameName(s.teacher, T)).forEach(s => out.set(`${s.cls}|${s.lesson}`, { ...s, base: s }));
    // замены: урок у этого учителя забрали или ему дали новый
    subs.forEach(sub => {
      const key = `${sub.cls}|${sub.lesson}`;
      const base = pub.schedule.find(s => s.day === day && s.cls === sub.cls && s.lesson === sub.lesson) || null;
      if (sameName(sub.teacher, T)) out.set(key, { cls: sub.cls, lesson: sub.lesson, subject: sub.subject || base?.subject, teacher: sub.teacher, room: sub.room || base?.room, base, sub });
      else if (out.has(key)) out.set(key, { ...out.get(key), sub, removed: true });
    });
  } else {
    const C = sel.cls;
    pub.schedule.filter(s => s.day === day && s.cls === C).forEach(s => out.set(`${s.cls}|${s.lesson}`, { ...s, base: s }));
    subs.filter(s => s.cls === C).forEach(sub => {
      const key = `${sub.cls}|${sub.lesson}`;
      const base = out.get(key)?.base || null;
      out.set(key, { cls: C, lesson: sub.lesson, subject: sub.subject || base?.subject, teacher: sub.teacher || base?.teacher, room: sub.room || base?.room, base, sub });
    });
  }
  return [...out.values()].sort((a, b) => a.lesson - b.lesson);
}

export const isCancelled = l => !!l.sub && /нет урока|отмен/i.test(l.sub.subject || '');

/* Ближайшая дата урока по предмету у класса — для срока ДЗ по умолчанию */
export function nextLessonDate(pub, cls, subject, from = todayISO()) {
  if (!pub || !cls || !subject) return '';
  const days = new Set(pub.schedule.filter(s => s.cls === cls && norm(s.subject) === norm(subject)).map(s => s.day));
  if (!days.size) return '';
  for (let i = 1; i <= 14; i++) { const d = addDays(from, i); if (days.has(weekday(d))) return d; }
  return '';
}

export function subjectsList(pub, me) {
  const set = new Set();
  String(me?.subjects || '').split(/[,;]\s*/).forEach(s => s.trim() && set.add(s.trim()));
  (pub?.schedule || []).forEach(s => s.subject && set.add(s.subject));
  return [...set];
}

export function teacherById(list, id) { return (list || []).find(t => t.id === id) || null; }
