import {
  clearMe,
  describeError,
  formatPhone,
  getMe,
  initChrome, normalizePhone,
  setMe,
  toast,
} from './common.js';
import { getStore } from './store.js';

initChrome();

const $ = (id) => document.getElementById(id);
const form = $('profile-form');
const f = form.elements;
const me = getMe();

const params = new URLSearchParams(location.search);
const nextRaw = params.get('next') || '';
const next = /^(collection\.html\?id=[\w-]+|index\.html(\?new=1)?)$/.test(nextRaw) ? nextRaw : '';

if (next === 'index.html?new=1') {
  $('profile-lede').textContent = 'Чтобы создать сбор, укажите имя и телефон. На этот номер участники будут переводить деньги по СБП.';
  $('profile-submit').textContent = 'Сохранить и создать сбор';
} else if (next.startsWith('collection')) {
  $('profile-lede').textContent = 'Чтобы присоединиться к сбору, укажите имя и телефон. По номеру вас узнают в сборах.';
  $('profile-submit').textContent = 'Сохранить и вернуться к сбору';
}

function showWho(u) {
  $('who-line').hidden = !u;
  if (!u) return;
  $('who-avatar').textContent = (u.name || '?').trim().charAt(0).toUpperCase();
  $('who-name').textContent = u.name;
  $('who-phone').textContent = formatPhone(u.phone);
}

if (me) {
  f.phone.value = formatPhone(me.phone);
  f.name.value = me.name;
  f.bank.value = me.bank || '';
  $('logout').hidden = false;
  showWho(me);
}

// Если номер уже есть в базе — подставляем сохранённое имя (вход с другого устройства).
let nameTouched = !!me;
f.name.addEventListener('input', () => { nameTouched = true; });

f.phone.addEventListener('blur', async () => {
  const phone = normalizePhone(f.phone.value);
  if (!phone) return;
  f.phone.value = formatPhone(phone);
  if (me && me.phone === phone) return;
  try {
    const store = await getStore();
    const found = await store.getUser(phone);
    if (found) {
      if (!nameTouched || !f.name.value.trim()) f.name.value = found.name || '';
      if (!f.bank.value.trim()) f.bank.value = found.bank || '';
      $('phone-hint').textContent = `Нашли профиль «${found.name}» — после сохранения здесь появятся его сборы.`;
    }
  } catch { /* не мешаем заполнению формы */ }
});

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const err = $('profile-error');
  err.textContent = '';
  const phone = normalizePhone(f.phone.value);
  const name = f.name.value.trim().replace(/\s+/g, ' ');
  const bank = f.bank.value.trim();

  if (!phone) { err.textContent = 'Введите российский номер: 11 цифр, например +7 900 123-45-67.'; f.phone.focus(); return; }
  if (!name) { err.textContent = 'Введите имя.'; f.name.focus(); return; }

  if (me && me.phone !== phone) {
    const ok = confirm(`Сменить номер на ${formatPhone(phone)}? Сборы, где вы участвовали с номером ${formatPhone(me.phone)}, здесь больше не будут показаны.`);
    if (!ok) return;
  }

  const btn = $('profile-submit');
  btn.disabled = true;
  try {
    const store = await getStore();
    const user = { phone, name, bank };
    // Регистрация — первое сохранение номера, которого ещё нет в базе.
    // Вход — номер уже есть в базе, а на этом устройстве с ним ещё не входили
    // (новое устройство, вход после «Выйти», смена номера). Правка профиля — ни то ни другое.
    // Если проверить базу не удалось (null), цели не отправляем, чтобы не было лишних.
    const existed = await store.getUser(phone).then((u) => !!u, () => null);
    const current = getMe(); // не me: профиль мог сохраниться уже на этой странице
    const loggedIn = !!current && current.phone === phone;
    await store.saveUser(user);
    setMe(user);
    const sent = window.skAnalytics?.goal('NewUser');
    if (existed === false) window.skAnalytics?.tmrGoal('mt_registration');
    if (existed === true && !loggedIn) window.skAnalytics?.tmrGoal('mt_login');
    if (next) { await sent; location.href = next; return; }
    showWho(user);
    $('whoami').textContent = name;
    $('logout').hidden = false;
    toast('Профиль сохранён');
  } catch (e2) {
    err.textContent = describeError(e2);
  } finally {
    btn.disabled = false;
  }
});

$('logout').addEventListener('click', () => {
  if (!confirm('Выйти на этом устройстве? Чтобы вернуться, достаточно снова ввести свой номер.')) return;
  clearMe();
  location.href = 'index.html';
});
