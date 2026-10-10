import { isDemo } from './store.js';

/* ------------------------------------------------ Профиль на этом устройстве */

const ME_KEY = 'skinemsya:me';

export function getMe() {
  try {
    const v = JSON.parse(localStorage.getItem(ME_KEY) || 'null');
    return v && v.phone && v.name ? v : null;
  } catch { return null; }
}
export function setMe(me) {
  try { localStorage.setItem(ME_KEY, JSON.stringify(me)); } catch { /* приватный режим */ }
}
export function clearMe() {
  try { localStorage.removeItem(ME_KEY); } catch { /* ignore */ }
}

/* ------------------------------------------------------------- Форматтеры */

// Приводит номер к виду 7XXXXXXXXXX. Возвращает null, если это не российский мобильный/городской номер.
export function normalizePhone(input) {
  let d = String(input || '').replace(/\D/g, '');
  if (d.length === 10) d = '7' + d;
  if (d.length === 11 && d[0] === '8') d = '7' + d.slice(1);
  return /^7\d{10}$/.test(d) ? d : null;
}

export function formatPhone(p) {
  if (!p || p.length !== 11) return p || '';
  return `+7 ${p.slice(1, 4)} ${p.slice(4, 7)}-${p.slice(7, 9)}-${p.slice(9, 11)}`;
}

const rub = new Intl.NumberFormat('ru-RU', {
  style: 'currency', currency: 'RUB', minimumFractionDigits: 0, maximumFractionDigits: 2,
});
export const money = (n) => rub.format(Number(n) || 0);

export function parseAmount(s) {
  const n = Number(String(s ?? '').replace(/[\s ₽]/g, '').replace(',', '.'));
  if (!Number.isFinite(n) || n <= 0 || n > 10_000_000) return null;
  return Math.round(n * 100) / 100;
}

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));

export function plural(n, one, few, many) {
  const a = Math.abs(n) % 100, b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b === 1) return one;
  if (b >= 2 && b <= 4) return few;
  return many;
}

const dateFmt = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
export const fmtDate = (ms) => dateFmt.format(new Date(ms));

export function percent(collected, target) {
  if (!target) return 0;
  return Math.max(0, Math.min(100, (collected / target) * 100));
}

/* ------------------------------------------------------------- Интерфейс */

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.append(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { ok = false; }
    ta.remove();
    return ok;
  }
}

let toastTimer;
export function toast(message, kind = 'ok') {
  let el = document.getElementById('toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    el.className = 'toast';
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    document.body.append(el);
  }
  el.textContent = message;
  el.dataset.kind = kind;
  el.classList.add('is-visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('is-visible'), 3200);
}

// Плашка демо-режима и имя в шапке — на всех страницах.
export function initChrome() {
  if (isDemo) {
    const bar = document.createElement('div');
    bar.className = 'demo-bar';
    bar.innerHTML = 'Демо-режим: данные хранятся только в этом браузере. Чтобы сборы видели все, подключите Firebase — см. README.';
    document.body.prepend(bar);
  }
  const me = getMe();
  const who = document.getElementById('whoami');
  if (who) who.textContent = me ? me.name : 'Войти';
}

export function describeError(err) {
  const code = err && (err.code || '');
  if (String(code).includes('permission-denied')) return 'Нет доступа к базе. Проверьте правила Firestore из файла firestore.rules.';
  if (String(code).includes('admin-restricted-operation') || String(code).includes('operation-not-allowed')) {
    return 'В Firebase не включён анонимный вход (Authentication → Sign-in method → Anonymous).';
  }
  if (String(code).includes('unavailable') || !navigator.onLine) return 'Нет связи с сервером. Проверьте интернет и обновите страницу.';
  return (err && err.message) || 'Что-то пошло не так. Обновите страницу.';
}
