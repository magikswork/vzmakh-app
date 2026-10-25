// Связь с сервером (Google Apps Script). Без адреса сервера — демо на примерах.
import { CONFIG } from './config.js';
import { demoApi } from './demo.js';

export const isDemo = !CONFIG.API_URL;

const NET_ERROR = 'Нет связи с сервером. Проверьте интернет и попробуйте ещё раз.';

async function readJson(res) {
  let j;
  try { j = await res.json(); } catch { throw new Error('Сервер ответил непонятно. Попробуйте обновить страницу.'); }
  if (j && j.error) { const e = new Error(j.error); e.code = j.code; throw e; }
  return j;
}

const realApi = {
  async getPublic() {
    let res;
    try { res = await fetch(`${CONFIG.API_URL}?action=public&_=${Date.now()}`); }
    catch { throw new Error(NET_ERROR); }
    return readJson(res);
  },
  // Запрос без лишних заголовков: браузер не делает предварительную проверку, Apps Script принимает его как есть.
  async post(action, payload, code) {
    let res;
    try { res = await fetch(CONFIG.API_URL, { method: 'POST', body: JSON.stringify({ ...payload, action, code }) }); }
    catch { throw new Error(NET_ERROR); }
    return readJson(res);
  }
};

export const api = isDemo ? demoApi : realApi;
