/**
 * Взмах · Москва — сервер приложения (Google Apps Script).
 *
 * Скрипт живёт внутри Google Таблицы с данными (Расширения → Apps Script).
 * Публикуется как веб-приложение: «Запуск от имени: я», «Доступ: все».
 * Подробная инструкция — docs/SETUP.md в репозитории.
 */

var APP_URL = 'https://magikswork.github.io/vzmakh-app/';
var PHOTO_FOLDER_NAME = 'Взмах · фото из приложения';
var MAX_PHOTOS = 6;

var SHEETS = {
  teachers:  { name: 'Учителя',     head: ['id', 'ФИО', 'Предметы', 'Email', 'Код', 'Роль', 'Активен'] },
  bells:     { name: 'Звонки',      head: ['Урок', 'Начало', 'Конец'] },
  schedule:  { name: 'Расписание',  head: ['Класс', 'День', 'Урок', 'Предмет', 'Учитель', 'Кабинет'] },
  subs:      { name: 'Замены',      head: ['id', 'Дата', 'Класс', 'Урок', 'Предмет', 'Учитель', 'Кабинет', 'Комментарий', 'Автор'] },
  homework:  { name: 'ДЗ',          head: ['id', 'Создано', 'Класс', 'Предмет', 'Задание', 'Ссылка', 'Фото', 'Срок', 'Автор'] },
  requests:  { name: 'Запросы',     head: ['id', 'Создано', 'От', 'Кому', 'Тема', 'Описание', 'Ссылка', 'Фото', 'Статус', 'Обновлено'] },
  comments:  { name: 'Комментарии', head: ['id', 'Запрос', 'Автор', 'Текст', 'Фото', 'Статус', 'Создано'] }
};

var STATUS = { review: 'На проверке', fix: 'Нужно поправить', ok: 'Принято' };

/* ============================== Установка ============================== */

/** Запустите один раз из редактора: создаст вкладки, папку для фото и ваш код входа. */
function setup() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  Object.keys(SHEETS).forEach(function (key) {
    var def = SHEETS[key];
    var sh = ss.getSheetByName(def.name) || ss.insertSheet(def.name);
    if (sh.getLastRow() === 0) sh.appendRow(def.head);
    sh.getRange(1, 1, 1, def.head.length).setFontWeight('bold').setBackground('#FDEEDF');
    sh.setFrozenRows(1);
  });
  var first = ss.getSheetByName('Sheet1') || ss.getSheetByName('Лист1');
  if (first && first.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(first);

  // Текстовый формат для дат и кодов, чтобы таблица не превращала их во что-то своё.
  ss.getSheetByName(SHEETS.teachers.name).getRange('E:E').setNumberFormat('@');
  ss.getSheetByName(SHEETS.bells.name).getRange('B:C').setNumberFormat('@');

  photoFolder_();

  var teachers = ss.getSheetByName(SHEETS.teachers.name);
  var msg = 'Готово. Вкладки созданы.';
  if (teachers.getLastRow() < 2) {
    var code = newCode_();
    teachers.appendRow([newId_('t'), 'Лео (впишите ФИО)', 'Обществознание', Session.getEffectiveUser().getEmail(), code, 'админ', 'да']);
    msg += ' Ваш код входа в приложение: ' + code;
  }
  Logger.log(msg);
  try { SpreadsheetApp.getUi().alert(msg); } catch (e) {}
}

/** Меню в таблице: выдать коды учителям, у которых их ещё нет. */
function onOpen() {
  SpreadsheetApp.getUi().createMenu('Взмах')
    .addItem('Выдать коды учителям без кода', 'fillCodes')
    .addItem('Проверить настройку', 'setup')
    .addToUi();
}

function fillCodes() {
  var sh = sheet_('teachers');
  var data = sh.getDataRange().getValues();
  var made = 0;
  for (var r = 1; r < data.length; r++) {
    if (!String(data[r][1]).trim()) continue;
    if (!String(data[r][0]).trim()) { sh.getRange(r + 1, 1).setValue(newId_('t')); }
    if (!String(data[r][4]).trim()) { sh.getRange(r + 1, 5).setValue(newCode_()); made++; }
    if (!String(data[r][6]).trim()) { sh.getRange(r + 1, 7).setValue('да'); }
  }
  SpreadsheetApp.getUi().alert(made ? 'Выдано кодов: ' + made + '. Разошлите их учителям лично.' : 'У всех учителей уже есть коды.');
}

/* ============================== HTTP ============================== */

function doGet(e) {
  var action = (e && e.parameter && e.parameter.action) || 'public';
  try {
    if (action === 'public') return json_(publicData_());
    if (action === 'ping') return json_({ ok: true });
    return json_({ error: 'Неизвестное действие' });
  } catch (err) {
    return json_({ error: String(err && err.message || err) });
  }
}

function doPost(e) {
  var body;
  try { body = JSON.parse(e.postData.contents); } catch (err) { return json_({ error: 'Некорректный запрос' }); }
  try {
    var me = auth_(body.code);
    if (!me) return json_({ error: 'Код не подошёл. Проверьте его или попросите новый у администратора.', code: 'auth' });
    var h = HANDLERS[body.action];
    if (!h) return json_({ error: 'Неизвестное действие' });
    var lock = LockService.getScriptLock();
    lock.waitLock(20000);
    try { return json_(h(me, body)); }
    finally { lock.releaseLock(); }
  } catch (err) {
    return json_({ error: String(err && err.message || err) });
  }
}

var HANDLERS = {
  login: function (me) { return { teacher: publicTeacher_(me, true) }; },

  'hw.save': function (me, b) {
    var it = b.item || {};
    var classes = String(it.cls || '').trim();
    if (!classes) throw new Error('Выберите класс');
    if (!String(it.text || '').trim() && !(it.photos || []).length && !(it.keepPhotos || []).length) throw new Error('Впишите задание или прикрепите фото');
    var photos = (it.keepPhotos || []).concat(savePhotos_(it.photos));
    var row = [it.id || newId_('h'), new Date(), classes, clean_(it.subject, 80), clean_(it.text, 4000), cleanUrl_(it.link),
               photos.join(','), isoDate_(it.due) || '', me.id];
    if (it.id) {
      var found = findRow_('homework', it.id);
      if (!found) throw new Error('Задание не найдено — возможно, его уже удалили');
      if (found.obj['Автор'] !== me.id && me.role !== 'админ') throw new Error('Изменять задание может только его автор');
      row[1] = found.obj['Создано'] || new Date();
      found.sheet.getRange(found.row, 1, 1, row.length).setValues([row]);
    } else {
      sheet_('homework').appendRow(row);
    }
    return { ok: true, item: hwOut_(rowToObj_(SHEETS.homework.head, row)) };
  },

  'hw.delete': function (me, b) {
    var found = findRow_('homework', b.id);
    if (!found) return { ok: true };
    if (found.obj['Автор'] !== me.id && me.role !== 'админ') throw new Error('Удалить задание может только его автор');
    found.sheet.deleteRow(found.row);
    return { ok: true };
  },

  'sub.save': function (me, b) {
    if (me.role !== 'админ') throw new Error('Замены вносит администратор');
    var it = b.item || {};
    if (!isoDate_(it.date) || !String(it.cls || '').trim() || !it.lesson) throw new Error('Нужны дата, класс и номер урока');
    var row = [it.id || newId_('s'), isoDate_(it.date), String(it.cls).trim(), Number(it.lesson) || it.lesson, clean_(it.subject, 80),
               clean_(it.teacher, 80), clean_(it.room, 30), clean_(it.comment, 300), me.id];
    if (it.id) {
      var found = findRow_('subs', it.id);
      if (!found) throw new Error('Замена не найдена');
      found.sheet.getRange(found.row, 1, 1, row.length).setValues([row]);
    } else sheet_('subs').appendRow(row);
    return { ok: true };
  },

  'sub.delete': function (me, b) {
    if (me.role !== 'админ') throw new Error('Замены удаляет администратор');
    var found = findRow_('subs', b.id);
    if (found) found.sheet.deleteRow(found.row);
    return { ok: true };
  },

  'req.list': function (me) {
    var reqs = readAll_('requests').filter(function (r) { return r['От'] === me.id || r['Кому'] === me.id; });
    var ids = {}; reqs.forEach(function (r) { ids[r.id] = true; });
    var comments = readAll_('comments').filter(function (c) { return ids[c['Запрос']]; });
    return { requests: reqs.map(reqOut_), comments: comments.map(commentOut_), teachers: teachersList_() };
  },

  'req.create': function (me, b) {
    var it = b.item || {};
    var to = teacherById_(it.to);
    if (!to) throw new Error('Выберите, кому отправить');
    if (!String(it.subject || '').trim()) throw new Error('Впишите тему');
    var now = new Date();
    var row = [newId_('r'), now, me.id, to.id, clean_(it.subject, 140), clean_(it.text, 4000), cleanUrl_(it.link),
               savePhotos_(it.photos).join(','), STATUS.review, now];
    sheet_('requests').appendRow(row);
    var out = reqOut_(rowToObj_(SHEETS.requests.head, row));
    notify_(to, 'Новый запрос от ' + me.name + ': ' + out.subject,
      me.name + ' просит посмотреть: «' + out.subject + '».\n\n' + (out.text ? out.text + '\n\n' : '') + 'Открыть: ' + APP_URL + '#zaprosy/' + out.id);
    return { ok: true, request: out };
  },

  'req.comment': function (me, b) {
    var found = findRow_('requests', b.id);
    if (!found) throw new Error('Запрос не найден');
    var r = found.obj;
    if (r['От'] !== me.id && r['Кому'] !== me.id) throw new Error('Это не ваш запрос');
    var status = '';
    if (b.status === 'ok' || b.status === 'fix') {
      if (r['Кому'] !== me.id) throw new Error('Статус ставит тот, кого попросили проверить');
      status = STATUS[b.status];
    } else if (b.status === 'review') {
      if (r['От'] !== me.id) throw new Error('Отправить на повторную проверку может только автор запроса');
      status = STATUS.review;
    }
    var text = clean_(b.text, 4000);
    var photos = savePhotos_(b.photos);
    if (!text && !photos.length && !status) throw new Error('Напишите комментарий или прикрепите фото');
    var now = new Date();
    var crow = [newId_('c'), r.id, me.id, text, photos.join(','), status, now];
    sheet_('comments').appendRow(crow);
    var head = SHEETS.requests.head;
    if (status) found.sheet.getRange(found.row, head.indexOf('Статус') + 1).setValue(status);
    found.sheet.getRange(found.row, head.indexOf('Обновлено') + 1).setValue(now);

    var otherId = r['От'] === me.id ? r['Кому'] : r['От'];
    var other = teacherById_(otherId);
    var what = status ? ('Статус: ' + status + '. ') : '';
    notify_(other, (status ? status + ' — ' : 'Ответ — ') + r['Тема'],
      me.name + ' ответил(а) по запросу «' + r['Тема'] + '». ' + what + '\n\n' + (text ? text + '\n\n' : '') + 'Открыть: ' + APP_URL + '#zaprosy/' + r.id);
    return { ok: true, comment: commentOut_(rowToObj_(SHEETS.comments.head, crow)), status: status || r['Статус'] };
  }
};

/* ============================== Данные ============================== */

function publicData_() {
  var today = isoDate_(new Date());
  var from = addDays_(today, -7);
  var subs = readAll_('subs').filter(function (s) { return s['Дата'] >= from; }).map(function (s) {
    return { id: s.id, date: s['Дата'], cls: s['Класс'], lesson: Number(s['Урок']) || 0, subject: s['Предмет'],
             teacher: s['Учитель'], room: s['Кабинет'], comment: s['Комментарий'] };
  });
  var hw = readAll_('homework').filter(function (h) { return !h['Срок'] || h['Срок'] >= addDays_(today, -21); }).map(hwOut_);
  return {
    updated: new Date().toISOString(),
    bells: readAll_('bells').map(function (b) { return { lesson: Number(b['Урок']) || 0, start: hhmm_(b['Начало']), end: hhmm_(b['Конец']) }; })
             .filter(function (b) { return b.lesson; }),
    schedule: readAll_('schedule').map(function (s) {
      return { cls: String(s['Класс']).trim(), day: dayNum_(s['День']), lesson: Number(s['Урок']) || 0,
               subject: s['Предмет'], teacher: s['Учитель'], room: s['Кабинет'] };
    }).filter(function (s) { return s.cls && s.day && s.lesson; }),
    subs: subs,
    homework: hw,
    teachers: teachersList_()
  };
}

function hwOut_(h) {
  return { id: h.id, created: h['Создано'], cls: h['Класс'], subject: h['Предмет'], text: h['Задание'], link: h['Ссылка'],
           photos: splitIds_(h['Фото']), due: h['Срок'], author: h['Автор'] };
}
function reqOut_(r) {
  return { id: r.id, created: r['Создано'], from: r['От'], to: r['Кому'], subject: r['Тема'], text: r['Описание'],
           link: r['Ссылка'], photos: splitIds_(r['Фото']), status: r['Статус'], updated: r['Обновлено'] };
}
function commentOut_(c) {
  return { id: c.id, request: c['Запрос'], author: c['Автор'], text: c['Текст'], photos: splitIds_(c['Фото']), status: c['Статус'], created: c['Создано'] };
}

function teachersAll_() {
  return readAll_('teachers').filter(function (t) { return t.id && t['ФИО'] && String(t['Активен']).toLowerCase() !== 'нет'; })
    .map(function (t) {
      return { id: t.id, name: String(t['ФИО']).trim(), subjects: String(t['Предметы'] || ''), email: String(t['Email'] || '').trim(),
               code: String(t['Код'] || '').trim(), role: String(t['Роль'] || '').trim().toLowerCase() };
    });
}
function teachersList_() { return teachersAll_().map(function (t) { return publicTeacher_(t, false); }); }
function publicTeacher_(t, self) {
  var o = { id: t.id, name: t.name, subjects: t.subjects };
  if (self) { o.role = t.role; o.hasEmail = !!t.email; }
  return o;
}
function teacherById_(id) { return teachersAll_().filter(function (t) { return t.id === id; })[0] || null; }
function auth_(code) {
  code = String(code || '').trim().toUpperCase();
  if (code.length < 6) return null;
  return teachersAll_().filter(function (t) { return t.code.toUpperCase() === code; })[0] || null;
}

/* ============================== Таблица ============================== */

function sheet_(key) {
  var def = SHEETS[key];
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(def.name);
  if (!sh) { sh = ss.insertSheet(def.name); sh.appendRow(def.head); sh.setFrozenRows(1); }
  return sh;
}

function readAll_(key) {
  var sh = sheet_(key);
  var values = sh.getDataRange().getValues();
  if (values.length < 2) return [];
  var head = values[0].map(function (h) { return String(h).trim(); });
  var out = [];
  for (var r = 1; r < values.length; r++) {
    if (values[r].every(function (v) { return v === '' || v === null; })) continue;
    out.push(rowToObj_(head, values[r]));
  }
  return out;
}

function rowToObj_(head, row) {
  var o = {};
  head.forEach(function (h, i) {
    var v = row[i];
    if (v instanceof Date) v = (h === 'Создано' || h === 'Обновлено') ? v.toISOString() : isoDate_(v);
    o[h] = (v === null || v === undefined) ? '' : (typeof v === 'string' ? v.trim() : v);
  });
  o.id = String(o.id || '');
  return o;
}

function findRow_(key, id) {
  if (!id) return null;
  var sh = sheet_(key);
  var values = sh.getDataRange().getValues();
  for (var r = 1; r < values.length; r++) {
    if (String(values[r][0]) === String(id)) return { sheet: sh, row: r + 1, obj: rowToObj_(values[0].map(String), values[r]) };
  }
  return null;
}

/* ============================== Фото ============================== */

function photoFolder_() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('PHOTO_FOLDER_ID');
  if (id) { try { return DriveApp.getFolderById(id); } catch (e) {} }
  var it = DriveApp.getFoldersByName(PHOTO_FOLDER_NAME);
  var folder = it.hasNext() ? it.next() : DriveApp.createFolder(PHOTO_FOLDER_NAME);
  props.setProperty('PHOTO_FOLDER_ID', folder.getId());
  return folder;
}

function savePhotos_(list) {
  list = (list || []).slice(0, MAX_PHOTOS);
  if (!list.length) return [];
  var folder = photoFolder_();
  return list.map(function (p) {
    var type = /^image\/(jpeg|png|webp)$/.test(p.type) ? p.type : 'image/jpeg';
    var blob = Utilities.newBlob(Utilities.base64Decode(String(p.data || '')), type, clean_(p.name, 80) || 'photo.jpg');
    if (blob.getBytes().length > 8 * 1024 * 1024) throw new Error('Фото слишком большое');
    var f = folder.createFile(blob);
    f.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    return f.getId();
  });
}

/* ============================== Почта ============================== */

function notify_(teacher, subject, body) {
  if (!teacher || !teacher.email) return;
  try {
    if (MailApp.getRemainingDailyQuota() < 1) return;
    MailApp.sendEmail({ to: teacher.email, subject: 'Взмах: ' + subject, body: body + '\n\n— Приложение школы «Взмах», Москва', name: 'Взмах · приложение' });
  } catch (e) { Logger.log('mail: ' + e); }
}

/* ============================== Мелочи ============================== */

function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
function newId_(p) { return p + Utilities.getUuid().replace(/-/g, '').slice(0, 10); }
function newCode_() {
  var abc = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789', s = '';
  for (var i = 0; i < 8; i++) s += abc.charAt(Math.floor(Math.random() * abc.length));
  return s;
}
function clean_(s, max) { return String(s === undefined || s === null ? '' : s).trim().slice(0, max || 500); }
function cleanUrl_(u) { u = clean_(u, 2000); return /^https?:\/\//i.test(u) ? u : ''; }
function splitIds_(s) { return String(s || '').split(',').map(function (x) { return x.trim(); }).filter(String); }
function isoDate_(v) {
  if (!v) return '';
  if (v instanceof Date) return Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  var s = String(v).trim(), m;
  if ((m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s))) return m[1] + '-' + m[2] + '-' + m[3];
  if ((m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(s))) return m[3] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[1]).slice(-2);
  return '';
}
function addDays_(iso, n) {
  var p = iso.split('-');
  var d = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]) + n);
  return Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM-dd');
}
function hhmm_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, Session.getScriptTimeZone(), 'HH:mm');
  var m = /^(\d{1,2})[:.](\d{2})/.exec(String(v || '').trim());
  return m ? ('0' + m[1]).slice(-2) + ':' + m[2] : '';
}
function dayNum_(v) {
  var s = String(v || '').trim().toLowerCase();
  var map = { 'пн': 1, 'по': 1, 'вт': 2, 'ср': 3, 'чт': 4, 'че': 4, 'пт': 5, 'пя': 5, 'сб': 6, 'су': 6, 'вс': 7, 'во': 7 };
  if (/^\d$/.test(s)) return Number(s);
  return map[s.slice(0, 2)] || 0;
}
