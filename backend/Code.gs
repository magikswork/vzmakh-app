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

// Вкладки таблицы данных. manual: true — заполняете вы, иначе — само приложение.
var SHEETS = {
  settings:  { name: 'Настройки',   manual: true, head: ['Параметр', 'Значение', 'Пояснение'], widths: [190, 420, 420] },
  teachers:  { name: 'Учителя',     manual: true, head: ['id', 'ФИО', 'Предметы', 'Email', 'Код', 'Роль', 'Активен'], widths: [110, 220, 220, 230, 110, 90, 80] },
  homework:  { name: 'ДЗ',          head: ['id', 'Создано', 'Класс', 'Предмет', 'Задание', 'Ссылка', 'Фото', 'Срок', 'Автор'] },
  requests:  { name: 'Запросы',     head: ['id', 'Создано', 'От', 'Кому', 'Тема', 'Описание', 'Ссылка', 'Фото', 'Статус', 'Обновлено'] },
  comments:  { name: 'Комментарии', head: ['id', 'Запрос', 'Автор', 'Текст', 'Фото', 'Статус', 'Создано'] }
};

var GUIDE_ = [
  ['Взмах · данные приложения', ''],
  ['', ''],
  ['Вкладка', 'Что в ней и кто заполняет'],
  ['Настройки', 'ЗАПОЛНЯЕТЕ ВЫ. Ссылка на таблицу расписания завучей, свои кабинеты, ссылки на таблицы «Значимые оценки» по классам.'],
  ['Учителя', 'ЗАПОЛНЯЕТЕ ВЫ. Одна строка — один учитель: ФИО, Предметы, Email (туда приходят письма о запросах), Роль («админ» или пусто). id и Код не трогайте: нажмите меню «Взмах → Выдать коды учителям без кода». Чтобы отключить учителя — «нет» в «Активен».'],
  ['ДЗ', 'Заполняет приложение, когда учитель публикует домашнее задание. Руками не правьте.'],
  ['Запросы', 'Заполняет приложение: запросы учителей друг другу. Руками не правьте.'],
  ['Комментарии', 'Заполняет приложение: ответы на запросы. Руками не правьте.'],
  ['', ''],
  ['Чего здесь нет', ''],
  ['Расписание', 'Его ведут завучи в своей таблице. Сюда — только ссылка на неё (вкладка «Настройки»).'],
  ['Оценки', 'Остаются в таблицах «Значимые оценки». Приложение читает их на лету и никуда не копирует.'],
  ['Фото', 'Лежат в папке Google Диска «Взмах · фото из приложения».'],
  ['', ''],
  ['Меню «Взмах»', 'Появляется сверху, рядом с «Справка». «Выдать коды учителям без кода» — после добавления новых учителей.']
];

function guideSheet_(ss) {
  var sh = ss.getSheetByName('Как заполнять') || ss.insertSheet('Как заполнять', 0);
  sh.clear();
  sh.getRange(1, 1, GUIDE_.length, 2).setValues(GUIDE_).setWrap(true).setVerticalAlignment('top');
  sh.getRange('A1').setFontSize(16).setFontWeight('bold');
  sh.getRange('A3:B3').setFontWeight('bold').setBackground('#FDEEDF');
  sh.getRange('A4:A8').setFontWeight('bold');
  sh.getRange('A10').setFontWeight('bold');
  sh.getRange('A4:B5').setBackground('#FFF8F0');
  sh.setColumnWidth(1, 170); sh.setColumnWidth(2, 640);
  sh.setTabColor('#E8731A');
}

var STATUS = { review: 'На проверке', fix: 'Нужно поправить', ok: 'Принято' };

/* ============================== Установка ============================== */

/** Запустите один раз из редактора: создаст вкладки, папку для фото и ваш код входа. */
function setup() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  guideSheet_(ss);
  Object.keys(SHEETS).forEach(function (key, i) {
    var def = SHEETS[key];
    var sh = ss.getSheetByName(def.name) || ss.insertSheet(def.name);
    if (sh.getLastRow() === 0) sh.appendRow(def.head);
    var head = sh.getRange(1, 1, 1, def.head.length).setFontWeight('bold');
    sh.setFrozenRows(1);
    if (def.manual) { head.setBackground('#FDEEDF'); sh.setTabColor('#2D5C93'); }
    else {
      head.setBackground('#E8E8E8').setNote('Эту вкладку заполняет приложение. Руками не правьте.');
      sh.setTabColor('#B7B7B7');
    }
    (def.widths || []).forEach(function (w, c) { sh.setColumnWidth(c + 1, w); });
    ss.setActiveSheet(sh); ss.moveActiveSheet(i + 2);
  });
  ['Sheet1', 'Лист1', 'Звонки', 'Расписание', 'Замены'].forEach(function (n) {
    var s = ss.getSheetByName(n);
    if (s && s.getLastRow() <= 1 && ss.getSheets().length > 1) ss.deleteSheet(s);
  });

  // Учителя: коды — текстом, подсказки и выпадающие списки
  var tsh = ss.getSheetByName(SHEETS.teachers.name);
  tsh.getRange('E:E').setNumberFormat('@');
  tsh.getRange('A1').setNote('Заполнится само (меню «Взмах → Выдать коды»).');
  tsh.getRange('B1').setNote('Как зовут учителя. Так его увидят коллеги в запросах.');
  tsh.getRange('C1').setNote('Через запятую: «Русский язык, Литература». Подставляется в форму ДЗ.');
  tsh.getRange('D1').setNote('На эту почту приходят письма о новых запросах и ответах.');
  tsh.getRange('E1').setNote('Личный код входа. Заполнится сам (меню «Взмах → Выдать коды»). Раздавайте лично.');
  tsh.getRange('F1').setNote('«админ» — может всё, иначе оставьте пустым.');
  tsh.getRange('G1').setNote('«да» — код работает, «нет» — отключён.');
  tsh.getRange('F2:F200').setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(['админ'], true).setAllowInvalid(true).build());
  tsh.getRange('G2:G200').setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(['да', 'нет'], true).build());

  photoFolder_();

  var settings = ss.getSheetByName(SHEETS.settings.name);
  settings.getRange('C:C').setWrap(true).setFontColor('#5A6678');
  if (settings.getLastRow() < 2) settings.appendRow(['Таблица расписания', '', 'Ссылка на Google Таблицу, где завучи ведут расписание. Её нужно открыть для вас (хотя бы на просмотр).']);
  if (settings.getLastRow() < 3) settings.appendRow(['Кабинеты', '', 'Новые кабинеты через запятую, если приложение их не узнаёт (основные уже знает).']);
  var have = readAll_('settings').map(function (s) { return norm_(s['Параметр']); });
  Object.keys(DEFAULT_GRADE_SHEETS).forEach(function (cls) {
    if (have.indexOf(norm_('Оценки ' + cls)) < 0) settings.appendRow(['Оценки ' + cls, 'https://docs.google.com/spreadsheets/d/' + DEFAULT_GRADE_SHEETS[cls] + '/edit', 'Таблица «Значимые оценки». Видят только учителя после входа.']);
  });

  var teachers = ss.getSheetByName(SHEETS.teachers.name);
  var msg = 'Готово. Вкладки созданы.';
  if (teachers.getLastRow() < 2) {
    var code = newCode_();
    teachers.appendRow([newId_('t'), 'Лео (впишите ФИО)', 'Обществознание', Session.getEffectiveUser().getEmail(), code, 'админ', 'да']);
    msg += ' Ваш код входа в приложение: ' + code;
  }
  ss.setActiveSheet(ss.getSheetByName('Как заполнять'));
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

  'grades.classes': function () {
    return { classes: gradeSheets_().map(function (g) { return g.cls; }) };
  },

  'grades.get': function (me, b) {
    var g = gradeSheets_().filter(function (x) { return x.cls === b.cls; })[0];
    if (!g) throw new Error('Для этого класса нет таблицы оценок. Её можно добавить во вкладке «Настройки».');
    var ss;
    try { ss = SpreadsheetApp.openById(g.id); } catch (e) { throw new Error('Не получилось открыть таблицу оценок ' + g.cls + '. Проверьте, что у владельца приложения есть к ней доступ.'); }
    var subjects = [], summary = null;
    ss.getSheets().forEach(function (sh) {
      var name = sh.getName();
      if (GRADE_SKIP_RE_.test(name) || sh.getLastRow() < 3 || sh.getLastColumn() < 3) return;
      var range = sh.getRange(1, 1, sh.getLastRow(), sh.getLastColumn());
      var merges = range.getMergedRanges().map(function (m) { return { r1: m.getRow() - 1, c1: m.getColumn() - 1, r2: m.getLastRow() - 1, c2: m.getLastColumn() - 1 }; });
      var parsed = parseGradeSheet_(range.getDisplayValues(), merges);
      if (!parsed.sections.length) return;
      parsed.name = /предварит/i.test(name) ? 'Предварительные оценки' : pretty_(gradeTabName_(name));
      if (/предварит/i.test(name)) summary = parsed; else subjects.push(parsed);
    });
    return { cls: g.cls, summary: summary, subjects: subjects, url: 'https://docs.google.com/spreadsheets/d/' + g.id + '/edit' };
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
  var hw = readAll_('homework').filter(function (h) { return !h['Срок'] || h['Срок'] >= addDays_(today, -21); }).map(hwOut_);
  var sched = scheduleDays_();
  return {
    updated: new Date().toISOString(),
    days: sched.days,
    scheduleSource: sched.source,
    scheduleError: sched.error || '',
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

/* ============================== Расписание завучей ==============================
 * Завучи ведут расписание в своей Google Таблице, как привыкли в Excel:
 * блок «Понедельник 26.10» → строка с классами («3 класс», «4 класс»…) →
 * строки по времени («1 урок: 10:15-10:55», «10:55-11:05» …).
 * Группы в ячейке — через «/», своё время урока можно писать прямо в ячейке.
 * Вкладок может быть сколько угодно: по дню, по неделе, всё на одной.
 */

var SCHEDULE_CACHE_SEC = 60;
var SCHEDULE_DAYS_BACK = 7, SCHEDULE_DAYS_AHEAD = 21;

function scheduleSourceId_() {
  var rows = readAll_('settings');
  for (var i = 0; i < rows.length; i++) {
    if (/расписан/i.test(rows[i]['Параметр'])) {
      var m = /\/d\/([a-zA-Z0-9_-]{20,})/.exec(String(rows[i]['Значение'])) || /^([a-zA-Z0-9_-]{20,})$/.exec(String(rows[i]['Значение']).trim());
      return m ? m[1] : '';
    }
  }
  return '';
}

/** Дни расписания из таблицы завучей (с кэшем на минуту). */
function scheduleDays_() {
  var id = scheduleSourceId_();
  if (!id) return { days: [], source: 'none' };
  var cache = CacheService.getScriptCache();
  var hit = cache.get('days:' + id);
  if (hit) { try { return JSON.parse(hit); } catch (e) {} }
  var out;
  try {
    var ss = SpreadsheetApp.openById(id);
    var rooms = settingList_('кабинет');
    var today = isoDate_(new Date());
    var from = addDays_(today, -SCHEDULE_DAYS_BACK), to = addDays_(today, SCHEDULE_DAYS_AHEAD);
    var days = [];
    ss.getSheets().forEach(function (sh) {
      var lastRow = sh.getLastRow(), lastCol = sh.getLastColumn();
      if (lastRow < 3 || lastCol < 2) return;
      // быстрый отсев: есть ли на вкладке нужные даты
      var head = sh.getRange(1, 1, Math.min(lastRow, 400), Math.min(lastCol, 30)).getDisplayValues();
      var titleText = sh.getName() + ' ' + head.map(function (r) { return r.join(' '); }).join(' ');
      var any = false;
      findDates_(titleText).forEach(function (d) { if (d >= from && d <= to) any = true; });
      if (!any) return;
      var range = sh.getRange(1, 1, lastRow, lastCol);
      var merges = range.getMergedRanges().map(function (m) {
        return { r1: m.getRow() - 1, c1: m.getColumn() - 1, r2: m.getLastRow() - 1, c2: m.getLastColumn() - 1 };
      });
      parseScheduleGrid_(valuesWithoutRed_(range), merges, range.getBackgrounds(), sh.getName(), today, { rooms: rooms }).forEach(function (d) {
        if (d.date >= from && d.date <= to) days.push(d);
      });
    });
    // если один день встречается дважды — берём последний (свежая вкладка обычно правее)
    var byDate = {};
    days.forEach(function (d) { byDate[d.date] = d; });
    out = { days: Object.keys(byDate).sort().map(function (k) { return byDate[k]; }), source: 'ok' };
  } catch (err) {
    return { days: [], source: 'error', error: 'Не получилось открыть таблицу с расписанием: ' + (err && err.message || err) };
  }
  try { cache.put('days:' + id, JSON.stringify(out), SCHEDULE_CACHE_SEC); } catch (e) {}
  return out;
}

/** Текст ячеек без красных фрагментов: красным завучи пишут индивидуальные занятия с именами детей. */
function valuesWithoutRed_(range) {
  var values = range.getDisplayValues(), rich = range.getRichTextValues();
  for (var r = 0; r < values.length; r++) for (var c = 0; c < values[r].length; c++) {
    var rt = rich[r] && rich[r][c];
    if (!rt || !values[r][c]) continue;
    try {
      var runs = rt.getRuns(), kept = '', dropped = false;
      runs.forEach(function (run) {
        if (isRed_(run.getTextStyle().getForegroundColor())) dropped = true; else kept += run.getText();
      });
      if (dropped) values[r][c] = kept;
    } catch (e) {}
  }
  return values;
}
function isRed_(hex) {
  var m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(String(hex || ''));
  if (!m) return false;
  var r = parseInt(m[1], 16), g = parseInt(m[2], 16), b = parseInt(m[3], 16);
  return r >= 170 && g <= 110 && b <= 110;
}

/** Значение из вкладки «Настройки» списком: строка, где «Параметр» содержит слово. */
function settingList_(word) {
  var row = readAll_('settings').filter(function (s) { return norm_(s['Параметр']).indexOf(word) >= 0; })[0];
  return row ? String(row['Значение']).split(/[,;\n]/).map(function (s) { return s.trim(); }).filter(String) : [];
}
function norm_(s) { return String(s || '').toLowerCase().replace(/ё/g, 'е').trim(); }

var WEEKDAYS_RE_ = /(понедельник|вторник|сред[аы]|четверг|пятниц[аы]|суббот[аы]|воскресень[ея])[^0-9]{0,6}(\d{1,2})[.\/](\d{1,2})(?:[.\/](\d{2,4}))?/i;

function findDates_(text) {
  var re = new RegExp(WEEKDAYS_RE_.source, 'gi'), m, out = [];
  var today = isoDate_(new Date());
  while ((m = re.exec(text))) out.push(dateFromParts_(m[2], m[3], m[4], today));
  // вкладка может называться просто «26.10»
  var re2 = /(^|\s)(\d{1,2})\.(\d{1,2})(?=\s|$)/g;
  while ((m = re2.exec(text.slice(0, 40)))) out.push(dateFromParts_(m[2], m[3], '', today));
  return out;
}

/** «26», «10», «» → ближайшая к сегодня дата с таким днём и месяцем. */
function dateFromParts_(d, m, y, todayIso) {
  d = Number(d); m = Number(m);
  if (!d || !m || m > 12 || d > 31) return '';
  var ty = Number(todayIso.slice(0, 4));
  var year = y ? (String(y).length === 2 ? 2000 + Number(y) : Number(y)) : ty;
  if (!y) {
    var tm = Number(todayIso.slice(5, 7));
    if (tm >= 9 && m <= 6) year = ty + 1;      // осенью видим «12.01» → следующий год
    else if (tm <= 6 && m >= 9) year = ty - 1; // весной видим «26.10» → прошлый год
  }
  return year + '-' + ('0' + m).slice(-2) + '-' + ('0' + d).slice(-2);
}

/**
 * Разбор сетки. Чистая функция: на входе значения, объединения и цвета, на выходе дни.
 * values[r][c] — текст ячеек, merges — [{r1,c1,r2,c2}] (с нуля, включительно), colors[r][c] — фон.
 */
function parseScheduleGrid_(values, merges, colors, sheetName, todayIso, opts) {
  opts = opts || {};
  var rooms = roomList_(opts.rooms);
  var R = values.length, C = R ? values[0].length : 0;
  var v = values.map(function (row) { return row.map(function (x) {
    return String(x == null ? '' : x).replace(/\r/g, '').replace(/(\d)\s*([:.])\s*\n\s*(\d)/g, '$1$2$3').trim();
  }); });
  var bg = (colors || []).map(function (row) { return row.slice(); });
  var span = []; // сколько классов накрывает объединённая ячейка
  for (var r0 = 0; r0 < R; r0++) { span.push([]); for (var c0 = 0; c0 < C; c0++) span[r0].push(1); }
  (merges || []).forEach(function (m) {
    var val = (v[m.r1] || [])[m.c1] || '', col = bg[m.r1] ? bg[m.r1][m.c1] : '';
    for (var r = m.r1; r <= m.r2 && r < R; r++) for (var c = m.c1; c <= m.c2 && c < C; c++) {
      v[r][c] = val; if (bg[r]) bg[r][c] = col; span[r][c] = m.c2 - m.c1 + 1;
    }
  });

  // начало каждого дня — строка с «Понедельник 26.10»
  var starts = [];
  for (var r = 0; r < R; r++) {
    var line = v[r].join(' ');
    var m = WEEKDAYS_RE_.exec(line);
    if (m) {
      if (starts.length && starts[starts.length - 1].row === r - 1 && starts[starts.length - 1].date === dateFromParts_(m[2], m[3], m[4], todayIso)) continue;
      starts.push({ row: r, date: dateFromParts_(m[2], m[3], m[4], todayIso), title: cap_(m[1].toLowerCase()) + ', ' + m[2] + '.' + ('0' + m[3]).slice(-2) });
    }
  }
  if (!starts.length) {
    var fromName = findDates_(String(sheetName || ''));
    if (fromName.length && fromName[0]) starts.push({ row: 0, date: fromName[0], title: String(sheetName) });
  }

  var days = [];
  starts.forEach(function (st, i) {
    var end = i + 1 < starts.length ? starts[i + 1].row : R;
    // строка с классами
    var headerRow = -1, cols = [];
    for (var r = st.row; r < end && headerRow < 0; r++) {
      var found = [];
      for (var c = 0; c < C; c++) {
        var cl = className_(v[r][c]);
        if (cl && !found.some(function (f) { return f.name === cl; })) found.push({ col: c, name: cl });
      }
      if (found.length >= 2 || (found.length === 1 && C <= 3)) { headerRow = r; cols = found; }
    }
    if (headerRow < 0) return;
    var labelCol = Math.max(0, cols[0].col - 1);

    var items = {};
    cols.forEach(function (cl) { items[cl.name] = []; });
    var seenLesson = false;
    for (var r2 = headerRow + 1; r2 < end; r2++) {
      var label = v[r2][labelCol] || '';
      var lessonNum = (/(\d{1,2})\s*-?\s*(й\s*)?урок/i.exec(label) || [])[1];
      var labelTime = timeRanges_(label)[0] || null;
      if (lessonNum) seenLesson = true;
      cols.forEach(function (cl) {
        var raw = v[r2][cl.col];
        if (!raw || raw === label) return;
        if (className_(raw)) return;
        var ranges = timeRanges_(raw);
        var text = stripTimes_(raw);
        var time = ranges.length ? ranges[ranges.length - 1] : labelTime;
        if (!time) return;
        var flat = text.replace(/\s+/g, ' ').trim();
        var bm = BREAK_RE_.exec(flat);
        var kind, groups = [], title;
        if (!flat.replace(/[\s\-–—\/:.,]+/g, '')) { kind = 'break'; title = 'Перемена'; }
        else if (bm) { kind = 'break'; title = cap_(bm[0].toLowerCase().replace(/\s+/g, ' ')); } // «Обед ДОЛЖНЫ ОСТАТЬСЯ…» → «Обед»
        else {
          if (lessonNum) kind = 'lesson';
          else if (!seenLesson || /самоподготовк|кружк|•/i.test(text)) kind = 'activity';
          else kind = 'lesson';
          groups = kind === 'lesson' ? lessonGroups_(text, rooms) : activityGroups_(text);
          if (!groups.length) return;
          title = groups.map(function (g) { return g.subject; }).join(' / ');
        }
        var it = { kind: kind, start: time[0], end: time[1], title: title, groups: groups };
        if (!ranges.length) it._labelTime = true;
        if (kind === 'lesson' && lessonNum) it.num = Number(lessonNum);
        if (kind === 'break' && /обед|полдник|завтрак|ужин/i.test(title)) it.meal = true;
        if (span[r2][cl.col] > 1) it.common = true; // одно на несколько классов
        var color = bg[r2] && bg[r2][cl.col];
        if (color && !/^#?(fff|ffffff|000000)$/i.test(color)) it.color = color;
        items[cl.name].push(it);
      });
    }
    // по порядку времени; уроки без номера после последнего — продолжаем нумерацию
    Object.keys(items).forEach(function (k) {
      var list = items[k].sort(function (a, b) { return a.start < b.start ? -1 : a.start > b.start ? 1 : 0; });
      // перемена без своего времени у класса со своим временем (как у 7 класса) — встаёт между соседями
      list.forEach(function (it, j) {
        var prev = list[j - 1], next = list[j + 1];
        if (it.kind === 'break' && it._labelTime) {
          if (prev && it.start < prev.end) it.start = prev.end;
          if (next && (it.end > next.start || it.end <= it.start)) it.end = next.start;
        }
        delete it._labelTime;
      });
      var last = 0;
      list.forEach(function (it) {
        if (it.kind !== 'lesson') return;
        if (it.num) last = it.num; else if (last) it.num = ++last;
      });
      // одинаковые строки подряд (объединённые по вертикали) — оставляем одну
      items[k] = list.filter(function (it, j) { var p = list[j - 1]; return !p || p.title !== it.title || p.start !== it.start; });
    });
    days.push({ date: st.date, title: st.title, classes: cols.map(function (c) { return c.name; }), items: items });
  });
  return days;
}

/** «3 класс», «5А», «10 Б класс» → название класса; иначе пусто. */
function className_(s) {
  s = String(s || '').trim();
  var m = /^(\d{1,2})\s*[«"]?([а-яё])?[»"]?\s*класс(ы)?$/i.exec(s) || /^(\d{1,2})\s*[«"\-]?([а-яё])[»"]?$/i.exec(s);
  if (!m) return '';
  return m[2] ? m[1] + m[2].toUpperCase() : m[1] + ' класс';
}

/** Все интервалы времени в тексте: «10:15-10:55», «9.10 - 9.50», «09:30 – 09:50». */
function timeRanges_(s) {
  var re = /(\d{1,2})[:.](\d{2})\s*[-–—]\s*(\d{1,2})[:.](\d{2})/g, m, out = [];
  while ((m = re.exec(String(s || '')))) out.push([('0' + m[1]).slice(-2) + ':' + m[2], ('0' + m[3]).slice(-2) + ':' + m[4]]);
  return out;
}
function stripTimes_(s) {
  return String(s || '').replace(/(\d{1,2})[:.](\d{2})\s*[-–—]\s*(\d{1,2})[:.](\d{2})/g, ' ').replace(/[ \t]+/g, ' ').trim();
}

var BREAK_RE_ = /^(большая\s+|спортивная\s+)?(перемена|обед|полдник|завтрак|ужин|динамическая\s+пауза)/i;

// Кабинеты, как их пишут завучи. Свои можно дописать во вкладке «Настройки» (строка «Кабинеты»).
var DEFAULT_ROOMS = ['Харбор бол', 'Харбор мал', 'Харбор', 'Мюнх', 'Драгон', 'РоузБокс', 'Нарния', 'Бриз', 'Театр', 'Библ 2эт', 'Библиотека',
  'Дэнс', 'Поточка 2 эт', 'Поточка', 'Англ кабинеты', 'Англ каб', 'YellowLife', 'Mount', 'Forest', 'LS', 'YL', 'WF', 'МР', 'Спортзал', 'Актовый зал'];

function roomList_(extra) {
  var seen = {}, out = [];
  (extra || []).concat(DEFAULT_ROOMS).forEach(function (r) {
    r = String(r || '').trim(); var k = norm_(r).replace(/\s+/g, '');
    if (r && !seen[k]) { seen[k] = true; out.push(r); }
  });
  return out.sort(function (a, b) { return b.length - a.length; });
}

/** Находит кабинеты в тексте: «Харбор Бол», «ХарборБол», «харборМал», «(mount)», «артТеатр». */
function takeRooms_(s, rooms) {
  var found = [];
  rooms.forEach(function (room) {
    var re = new RegExp(room.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s*'), 'gi');
    s = s.replace(re, function (m, off, all) {
      var before = all.charAt(off - 1), after = all.charAt(off + m.length);
      var letterBefore = /[A-Za-zА-Яа-яЁё]/.test(before), camel = /[а-яёa-z]/.test(before) && /[А-ЯЁA-Z]/.test(m.charAt(0));
      if ((letterBefore && !camel) || /[A-Za-zА-Яа-яЁё0-9]/.test(after)) return m;
      if (m === m.toUpperCase() && m.length >= 3 && room !== room.toUpperCase()) return m; // «ТЕАТР» капсом — это предмет
      if (found.indexOf(room) < 0) found.push(room);
      return ' ';
    });
  });
  return { rooms: found, rest: s };
}

var SUBJECT_NAMES_ = { 'ИНД РАБ': 'Индивидуальная работа', '2 ЯЗЫК': 'Второй язык', 'ДОП МАТЕМАТИКА': 'Доп. математика', 'ИНГЛИШ ТАЙМ': 'English Time' };

/** Урок: группы через «/» или с новой строки, каждая — ПРЕДМЕТ капсом, потом учителя и кабинет. */
function lessonGroups_(text, rooms) {
  var segs = String(text || '').split(/\s*\/\s*|\n/).map(function (s) { return s.trim(); }).filter(function (s) { return s && !/^[,.;+\-–]+$/.test(s); });
  var parts = [];
  segs.forEach(function (s) {
    if (!parts.length || /^(\d+(\.\d+)?\s+)?[А-ЯЁ]{3,}(?![а-яё])/.test(s) || /^\d\s+ЯЗЫК/.test(s)) parts.push([s]);
    else parts[parts.length - 1].push(s); // «Драгон», «и англ каб», «Ирина, Алина Вл» — продолжение группы
  });
  return parts.map(function (p) { return parseGroup_(p.join(' '), rooms); }).filter(function (g) { return g.subject; });
}

function parseGroup_(s, rooms) {
  s = s.replace(/\s+/g, ' ').trim();
  var code = '';
  var m = /^(\d+(?:\.\d+)?)\s+(?!язык)/i.exec(s);
  if (m && /^[А-ЯЁ]{2,}/.test(s.slice(m[0].length))) { code = m[1]; s = s.slice(m[0].length); }
  var r = takeRooms_(s, rooms);
  var tokens = r.rest.replace(/\s+/g, ' ').trim().split(' ');
  var subj = [], i = 0;
  while (i < tokens.length && (/^\(?[А-ЯЁ0-9.\-]*[А-ЯЁ][А-ЯЁ0-9.\-]*\)?,?$/.test(tokens[i]) || (i === 0 && /^\d$/.test(tokens[i])))) subj.push(tokens[i++]);
  var subject = subj.join(' ').replace(/,$/, '');
  var teachers = tokens.slice(i).join(' ')
    .replace(/\(\s*\)/g, ' ').replace(/\s*\+\s*/g, ' + ').replace(/\s*,\s*/g, ', ').replace(/\s+/g, ' ')
    .replace(/^[\s,;\/+\-–]+|[\s,;\/+\-–]+$/g, '').replace(/(\s+и)+$/, '').trim();
  if (!subject) { subject = teachers; teachers = ''; } // ячейку написали не капсом — показываем как есть
  var g = { subject: SUBJECT_NAMES_[subject] || pretty_(subject) };
  if (code) g.code = code;
  if (teachers) g.teachers = teachers;
  if (r.rooms.length) g.room = r.rooms.join(', ');
  return g;
}

/** Кружки и самоподготовка: пункты списка («•», «-») или через «/». */
function activityGroups_(text) {
  return String(text || '').split(/\n\s*[•\-–]\s*|^\s*[•\-–]\s*|\s*\/\s*|\s*•\s*/).map(function (p) {
    return p.replace(/\s*\n\s*/g, ' ').replace(/\s+/g, ' ').replace(/^[-–•\s]+|[\s:;,]+$/g, '').trim();
  }).filter(String).map(function (p) { return { subject: pretty_(p) }; });
}

/** «РУССКИЙ ЯЗЫК (ПРЕДЗАЧЕТ)» → «Русский язык (предзачет)», аббревиатуры (РПС, ТДФ) не трогаем. */
function pretty_(s) {
  if (/[а-яё]/.test(s) || !/[А-ЯЁ]/.test(s)) return s;
  var t = s.replace(/[А-ЯЁA-Z]+/g, function (w) {
    return (w.length >= 2 && w.length <= 4 && !/[АЕЁИОУЫЭЮЯAEIOUY]/.test(w)) ? w : w.toLowerCase();
  });
  return cap_(t);
}
function cap_(s) { return s.charAt(0).toUpperCase() + s.slice(1); }


/* ============================== Оценки (только для учителей) ==============================
 * Таблицы «Значимые оценки» по классам. Приложение читает их на лету и никуда не копирует.
 * Вкладка предмета: строки 1–2 — названия работ, дальше блоки «6 класс (1 группа)» / «Группа 6.1»
 * и строки «№ | Фамилия Имя | оценки…».
 */

var DEFAULT_GRADE_SHEETS = {
  '3 класс': '1tQO7ZpuQdHvSBvaXAff-2MKN42nJJ36XsnH4qeAjk8E',
  '4 класс': '1lEiwPcd1e8KZcEc_MEs034H_VcVR2QJKhJWP5gCEc3U',
  '5 класс': '1I6NOoW_iZABiyCgaLxIhCs1DcovvgkXeFUuMb0i4XqI',
  '6 класс': '1t-p50KxtHZ-kqZS_yrGFXogawUOekLWaLRsLUj_xSo8',
  '7 класс': '1Nye6wsTND7eLEIm6BP4JpQd8sLPu1P-ssJOTjJxa-cs'
};
var GRADE_SKIP_RE_ = /список|подгрупп|пустограф|^лист\s*\d*$|^sheet\s*\d*$/i;

function gradeSheets_() {
  return readAll_('settings').filter(function (s) { return /^оценки\s/i.test(String(s['Параметр']).trim()); }).map(function (s) {
    var m = /\/d\/([a-zA-Z0-9_-]{20,})/.exec(String(s['Значение'])) || /^([a-zA-Z0-9_-]{20,})$/.exec(String(s['Значение']).trim());
    return m ? { cls: String(s['Параметр']).trim().replace(/^оценки\s+/i, ''), id: m[1] } : null;
  }).filter(Boolean);
}

function gradeTabName_(s) {
  var map = { 'инЯз 2 немец': 'Немецкий язык', 'иняз 2 испанск': 'Испанский язык', 'иняз 2 француз': 'Французский язык' };
  var k = Object.keys(map).filter(function (x) { return norm_(x) === norm_(s); })[0];
  return k ? map[k] : String(s).trim();
}

/** Разбор вкладки с оценками. Чистая функция: значения и объединения → { works, sections }. */
function parseGradeSheet_(values, merges) {
  var R = values.length, C = R ? values[0].length : 0;
  var v = values.map(function (row) { return row.map(function (x) { return String(x == null ? '' : x).replace(/\r/g, '').trim(); }); });
  (merges || []).forEach(function (m) {
    var val = (v[m.r1] || [])[m.c1] || '';
    for (var r = m.r1; r <= m.r2 && r < R; r++) for (var c = m.c1; c <= m.c2 && c < C; c++) v[r][c] = val;
  });
  var isSection = function (s) { return /класс|групп/i.test(s) && !/^\d+$/.test(s); };
  var isName = function (s) { return /^[А-ЯЁA-Z][а-яёa-z\-]+(\s+[А-ЯЁA-Z][а-яёa-z\-\.]*){1,3}$/.test(s); };

  // где имена: обычно столбец B (A — номер), иногда A
  var nameCol = 1;
  var countIn = function (c) { var n = 0; for (var r = 0; r < R; r++) if (isName(v[r][c] || '')) n++; return n; };
  if (C > 1 && countIn(0) > countIn(1)) nameCol = 0;

  // первая строка с учеником или блоком — всё выше неё заголовки
  var title = v[0][0] || v[0][1];
  var dataStart = -1;
  for (var r = 1; r < R && dataStart < 0; r++) {
    var s0 = v[r][nameCol];
    if (s0 && s0 !== title && (isName(s0) || isSection(s0))) dataStart = r;
  }
  if (dataStart < 0) return { works: [], sections: [] };

  var works = [];
  for (var c = nameCol + 1; c < C; c++) {
    var parts = [];
    for (var h = 0; h < dataStart; h++) {
      var x = v[h][c];
      if (x && x !== title && parts.indexOf(x) < 0 && !isSection(x)) parts.push(x);
    }
    works.push({ col: c, title: parts.join(' · ') });
  }

  var sections = [], cur = null;
  for (var r2 = dataStart; r2 < R; r2++) {
    var cell = v[r2][nameCol];
    if (!cell || cell === title) continue;
    if (isSection(cell)) { cur = { label: cell, rows: [] }; sections.push(cur); continue; }
    if (!isName(cell)) continue;
    if (!cur) { cur = { label: '', rows: [] }; sections.push(cur); }
    cur.rows.push({ name: cell.replace(/\s+/g, ' '), marks: works.map(function (w) { return v[r2][w.col]; }) });
  }
  sections = sections.filter(function (s) { return s.rows.length; });

  // столбцы без названия и без единой оценки — убираем
  var keep = works.map(function (w, i) {
    return !!w.title || sections.some(function (s) { return s.rows.some(function (row) { return row.marks[i]; }); });
  });
  return {
    works: works.filter(function (w, i) { return keep[i]; }).map(function (w, i) { return { title: w.title || 'Работа ' + (i + 1) }; }),
    sections: sections.map(function (s) {
      return { label: s.label, rows: s.rows.map(function (row) { return { name: row.name, marks: row.marks.filter(function (m, i) { return keep[i]; }) }; }) };
    })
  };
}
