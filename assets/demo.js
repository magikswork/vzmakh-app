// Демо-режим: примерные данные в памяти браузера. Ничего не сохраняется.
// Включается сам, пока в config.js не указан адрес сервера.
import { todayISO, addDays, weekday } from './util.js';
import { DEMO_DAYS } from './demo-days.js';

const T = [
  { id: 't1', name: 'Лео', subjects: 'Обществознание', role: 'админ' },
  { id: 't2', name: 'Анна Сергеевна', subjects: 'Русский язык, Литература' },
  { id: 't3', name: 'Игорь Павлович', subjects: 'Математика' },
  { id: 't4', name: 'Мария Олеговна', subjects: 'Английский язык' },
  { id: 't5', name: 'Ольга Николаевна', subjects: 'История, География' },
  { id: 't6', name: 'Денис Андреевич', subjects: 'Физкультура' },
  { id: 't7', name: 'Елена Викторовна', subjects: 'Биология' }
];
const t0 = todayISO();
const nextWorkday = n => { let d = t0, k = 0; while (k < n) { d = addDays(d, 1); if (weekday(d) <= 5) k++; } return d; };
const hoursAgo = h => new Date(Date.now() - h * 3600e3).toISOString();

const db = {
  bells: [],
  schedule: [],
  days: DEMO_DAYS,
  subs: [
    
  ],
  homework: [
    { id: 'h1', created: hoursAgo(20), cls: '6 класс', subject: 'Информатика', text: 'Доделать презентацию «Мой цифровой след», 5–7 слайдов.', link: '', photos: [], due: nextWorkday(2), author: 't1' },
    { id: 'h2', created: hoursAgo(5), cls: '6 класс', subject: 'Математика', text: '№ 412, 415, 418. Повторить правило сложения дробей с разными знаменателями.', link: '', photos: [], due: nextWorkday(1), author: 't3' },
    { id: 'h3', created: hoursAgo(30), cls: '5 класс, 6 класс', subject: 'Английский язык', text: 'Выучить слова Unit 3 (стр. 46). Тренажёр по ссылке.', link: 'https://quizlet.com/', photos: [], due: nextWorkday(1), author: 't4' },
    { id: 'h4', created: hoursAgo(50), cls: '7 класс', subject: 'Литература', text: 'Выучить наизусть стихотворение на стр. 54.', link: '', photos: [], due: nextWorkday(3), author: 't1' },
    { id: 'h5', created: hoursAgo(80), cls: '4 класс', subject: 'Экономика', text: 'Посчитать семейный бюджет на неделю по образцу из тетради.', link: '', photos: [], due: nextWorkday(2), author: 't2' },
    { id: 'h6', created: hoursAgo(120), cls: '6 класс', subject: 'Русский язык', text: 'Упр. 254 — списать, расставить знаки препинания.', link: '', photos: [], due: addDays(t0, -2), author: 't2' }
  ],
  requests: [
    { id: 'r1', created: hoursAgo(3), from: 't2', to: 't1', subject: 'Проверь, пожалуйста, вопросы к предзачёту 6 класса', text: 'Прикрепила вопросы. Посмотри формулировки 3 и 5, мне кажется, слишком сложно для шестого класса.', link: '', photos: [], status: 'На проверке', updated: hoursAgo(3) },
    { id: 'r2', created: hoursAgo(26), from: 't1', to: 't5', subject: 'План урока по теме «Права ребёнка»', text: 'Посмотрите план открытого урока, пожалуйста. Особенно блок с игрой.', link: 'https://docs.google.com/', photos: [], status: 'Нужно поправить', updated: hoursAgo(22) },
    { id: 'r3', created: hoursAgo(70), from: 't1', to: 't3', subject: 'Таблица оценок 7А за сентябрь', text: '', link: '', photos: [], status: 'Принято', updated: hoursAgo(60) }
  ],
  comments: [
    { id: 'c1', request: 'r2', author: 't5', text: 'Игра хорошая, но на неё уйдёт минут 20, урок не уложится. Предлагаю сократить до двух раундов.', photos: [], status: 'Нужно поправить', created: hoursAgo(22) },
    { id: 'c2', request: 'r3', author: 't3', text: 'Всё сходится, спасибо!', photos: [], status: 'Принято', created: hoursAgo(60) }
  ]
};

const clone = o => JSON.parse(JSON.stringify(o));
const wait = ms => new Promise(r => setTimeout(r, ms));
let n = 100;
const STATUS = { review: 'На проверке', fix: 'Нужно поправить', ok: 'Принято' };
const ME = 't1';

export const demoApi = {
  async getPublic() {
    await wait(150);
    return clone({ updated: new Date().toISOString(), bells: db.bells, schedule: db.schedule, subs: db.subs, days: db.days, scheduleSource: 'ok', homework: db.homework,
      teachers: T.map(({ id, name, subjects }) => ({ id, name, subjects })) });
  },
  async post(action, p, code) {
    await wait(350);
    const me = T.find(t => t.id === ME);
    switch (action) {
      case 'login':
        if (!code || String(code).trim().length < 4) throw Object.assign(new Error('В демо подойдёт любой код от 4 символов'), { code: 'auth' });
        return { teacher: { ...me, hasEmail: true } };
      case 'hw.save': {
        const it = p.item;
        if (!it.cls) throw new Error('Выберите класс');
        const photos = [...(it.keepPhotos || []), ...(it.photos || []).map(ph => ph.preview)];
        const row = { id: it.id || 'h' + (++n), created: new Date().toISOString(), cls: it.cls, subject: it.subject, text: it.text, link: it.link, photos, due: it.due, author: ME };
        const i = db.homework.findIndex(h => h.id === row.id);
        if (i >= 0) db.homework[i] = row; else db.homework.push(row);
        return { ok: true, item: clone(row) };
      }
      case 'hw.delete': db.homework = db.homework.filter(h => h.id !== p.id); return { ok: true };
      case 'sub.save': {
        const it = { ...p.item, id: p.item.id || 's' + (++n), lesson: Number(p.item.lesson) };
        const i = db.subs.findIndex(s => s.id === it.id);
        if (i >= 0) db.subs[i] = it; else db.subs.push(it);
        return { ok: true };
      }
      case 'sub.delete': db.subs = db.subs.filter(s => s.id !== p.id); return { ok: true };
      case 'req.list': {
        const reqs = db.requests.filter(r => r.from === ME || r.to === ME);
        const ids = new Set(reqs.map(r => r.id));
        return clone({ requests: reqs, comments: db.comments.filter(c => ids.has(c.request)), teachers: T.map(({ id, name, subjects }) => ({ id, name, subjects })) });
      }
      case 'req.create': {
        const it = p.item;
        if (!it.to) throw new Error('Выберите, кому отправить');
        if (!String(it.subject || '').trim()) throw new Error('Впишите тему');
        const now = new Date().toISOString();
        const row = { id: 'r' + (++n), created: now, from: ME, to: it.to, subject: it.subject, text: it.text, link: it.link, photos: (it.photos || []).map(ph => ph.preview), status: STATUS.review, updated: now };
        db.requests.push(row);
        return { ok: true, request: clone(row) };
      }
      case 'req.comment': {
        const r = db.requests.find(x => x.id === p.id);
        if (!r) throw new Error('Запрос не найден');
        const status = p.status ? STATUS[p.status] : '';
        const c = { id: 'c' + (++n), request: r.id, author: ME, text: p.text || '', photos: (p.photos || []).map(ph => ph.preview), status, created: new Date().toISOString() };
        db.comments.push(c);
        if (status) r.status = status;
        r.updated = c.created;
        return { ok: true, comment: clone(c), status: r.status };
      }
      case 'grades.classes': return { classes: ['3 класс', '4 класс', '5 класс', '6 класс', '7 класс'] };
      case 'grades.get': return clone(demoGrades(p.cls));
    }
    throw new Error('Неизвестное действие');
  }
};

/* Выдуманные «Ученик 1…» — в демо никаких настоящих детей */
function demoGrades(cls) {
  let seed = cls.charCodeAt(0) * 7 + 3;
  const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
  const mark = () => { const x = rnd(); return x < 0.08 ? '' : x < 0.14 ? 'н' : x < 0.2 ? '2' : x < 0.42 ? '3' : x < 0.72 ? '4' : '5'; };
  const kids = n => Array.from({ length: n }, (_, i) => ({ name: `Ученик ${i + 1}` }));
  const sheet = (works, sections) => ({ works: works.map(title => ({ title })), sections: sections.map(([label, n, start]) => ({ label,
    rows: kids(n).map((k, i) => ({ name: `Ученик ${start + i}`, marks: works.map(mark) })) })) });
  const subjects = [
    { name: 'Русский язык', ...sheet(['Входной диктант', 'Проверочная работа', 'Словарный диктант', 'Самостоятельная', 'Проверочная работа 2'], [[cls + ' (1 группа)', 7, 1], [cls + ' (2 группа)', 7, 8]]) },
    { name: 'Математика', ...sheet(['Входная работа', 'Действия с дробями', 'НОД и НОК', 'Разложение на множители'], [['', 14, 1]]) },
    { name: 'Английский язык', ...sheet(['чтение · произношение', 'чтение · понимание', 'входное · грамматика', 'входное · письмо', 'словарный диктант', 'тест по юниту'], [['Группа 1', 5, 1], ['Группа 2', 5, 6], ['Группа 3', 4, 11]]) },
    { name: 'История', ...sheet(['Самостоятельная', 'Тестовая работа'], [['', 14, 1]]) }
  ];
  const summary = { works: subjects.map(s => ({ title: s.name })), sections: [{ label: '', rows: kids(14).map((k, i) => ({ name: `Ученик ${i + 1}`, marks: subjects.map(() => String(3 + Math.floor(rnd() * 3))) })) }] };
  return { cls, summary, subjects, url: '' };
}
