import { getStore } from './store.js';
import {
  getMe, initChrome, money, esc, plural, percent, parseAmount, formatPhone, fmtDate,
  copyText, toast, describeError,
} from './common.js';

initChrome();

const $ = (id) => document.getElementById(id);
const me = getMe();
const id = new URLSearchParams(location.search).get('id') || '';
const pageUrl = `${location.origin}${location.pathname}?id=${encodeURIComponent(id)}`;

let store = null;
let current = null;      // последний снимок { collection, participants, payments }
let synced = false;      // имя в сборе уже сверено с профилем

const STATUS = {
  pending: ['Ждёт подтверждения', 'tag-wait'],
  confirmed: ['Подтверждён', 'tag-ok'],
  rejected: ['Отклонён', 'tag-bad'],
};
const statusTag = (s) => `<span class="tag ${STATUS[s][1]}">${STATUS[s][0]}</span>`;
const initial = (name) => esc((name || '?').trim().charAt(0).toUpperCase());

function fail(text) {
  $('state').hidden = false;
  $('state').textContent = text;
  $('collection').hidden = true;
}

function renderQr() {
  if (typeof window.qrcode !== 'function') {
    $('qr').textContent = 'QR-код не загрузился';
    return;
  }
  const qr = window.qrcode(0, 'M');
  qr.addData(pageUrl);
  qr.make();
  $('qr').innerHTML = qr.createSvgTag({ cellSize: 4, margin: 0, scalable: true });
}

function sums(payments) {
  const byPhone = {};
  let confirmed = 0;
  let pending = 0;
  for (const p of payments) {
    const s = (byPhone[p.phone] ||= { confirmed: 0, pending: 0 });
    if (p.status === 'confirmed') { s.confirmed += p.amount; confirmed += p.amount; }
    if (p.status === 'pending') { s.pending += p.amount; pending += p.amount; }
  }
  return { byPhone, confirmed, pending };
}

function paymentRow(p, { showName, actions }) {
  const btns = [];
  if (actions) {
    if (p.status !== 'confirmed') btns.push(`<button class="btn btn-ok btn-small" type="button" data-act="confirmed" data-pid="${esc(p.id)}">Подтвердить</button>`);
    if (p.status === 'pending') btns.push(`<button class="btn btn-bad btn-small" type="button" data-act="rejected" data-pid="${esc(p.id)}">Отклонить</button>`);
    if (p.status === 'confirmed') btns.push(`<button class="btn btn-ghost btn-small" type="button" data-act="pending" data-pid="${esc(p.id)}">Отменить подтверждение</button>`);
  }
  return `
    <li class="row">
      <div class="row-main">
        <div class="row-name">${showName ? esc(p.name) + ' · ' : ''}${money(p.amount)}</div>
        <div class="row-sub">${fmtDate(p.createdAt)}</div>
      </div>
      <div class="row-side">${actions && p.status === 'pending' ? '' : statusTag(p.status)}${btns.join('')}</div>
    </li>`;
}

function render(snapshot) {
  current = snapshot;
  const { collection: c, participants, payments } = snapshot;
  if (!c) { fail('Сбор не найден. Проверьте ссылку или попросите организатора прислать её ещё раз.'); return; }

  $('state').hidden = true;
  $('collection').hidden = false;

  const phones = c.participantPhones || [];
  const isOrg = !!me && me.phone === c.organizerPhone;
  const isMember = !!me && phones.includes(me.phone);
  const closed = c.status === 'closed';
  const { byPhone, confirmed, pending } = sums(payments);

  document.title = `${c.title} — Скинемся`;

  /* Заголовок */
  $('c-title').textContent = c.title;
  $('c-meta').innerHTML = [
    closed ? '<span class="tag">Завершён</span>' : '<span class="tag tag-ok">Идёт сбор</span>',
    `<span>${isOrg ? 'Вы организатор' : `Организатор: ${esc(c.organizerName)}`}</span>`,
  ].join('');
  $('c-desc').hidden = !c.description;
  $('c-desc').textContent = c.description || '';

  /* Шкала */
  const pct = percent(confirmed, c.target);
  const pendPct = Math.min(percent(pending, c.target), 100 - pct);
  $('c-collected').textContent = money(confirmed);
  $('c-target').textContent = money(c.target);
  $('c-bar-fill').style.width = `${pct}%`;
  $('c-bar-pending').style.left = `${pct}%`;
  $('c-bar-pending').style.width = `${pendPct}%`;
  $('c-bar').dataset.zero = String(pct === 0);
  $('c-bar').setAttribute('aria-valuenow', String(Math.round(pct)));
  $('c-bar').setAttribute('aria-label', `Собрано ${money(confirmed)} из ${money(c.target)}`);

  const left = Math.max(0, c.target - confirmed);
  const n = Math.max(1, phones.length);
  const share = Math.ceil(c.target / n);
  const notes = [];
  if (left === 0) {
    notes.push(confirmed > c.target
      ? `<strong>Цель собрана</strong>, сверх нужного — ${money(confirmed - c.target)}.`
      : '<strong>Цель собрана.</strong>');
  } else {
    notes.push(`Осталось <strong>${money(left)}</strong>. Если делить поровну на ${n} ${plural(n, 'участника', 'участников', 'участников')}, это ${money(share)} с человека.`);
  }
  if (pending > 0) notes.push(`Ещё ${money(pending)} ждут подтверждения организатора.`);
  $('c-note').innerHTML = notes.join(' ');

  /* Присоединиться */
  $('join-box').hidden = isMember || closed;
  if (!isMember && !closed) {
    if (me) {
      $('join-text').textContent = `Вы присоединитесь как ${me.name}, ${formatPhone(me.phone)}. Сбор появится в вашем списке, и вы сможете отметить перевод.`;
      $('join-btn').hidden = false;
      $('join-profile').hidden = true;
    } else {
      $('join-text').textContent = 'Сначала укажите имя и телефон — по ним организатор узнает ваш перевод.';
      $('join-btn').hidden = true;
      $('join-profile').hidden = false;
      $('join-profile').href = `profile.html?next=${encodeURIComponent(`collection.html?id=${id}`)}`;
    }
  }

  /* Перевод */
  $('pay-box').hidden = !isMember;
  if (isMember) {
    $('sbp-block').hidden = isOrg;
    $('pay-title').textContent = isOrg ? 'Ваш вклад' : 'Перевести организатору';
    $('pay-label').textContent = isOrg ? 'Сколько вы вложили сами, ₽' : 'Сколько вы перевели, ₽';
    if (!isOrg) {
      $('sbp-phone').textContent = formatPhone(c.organizerPhone);
      $('sbp-bank').textContent = c.organizerBank
        ? `${c.organizerName}, ${c.organizerBank}`
        : `${c.organizerName}, банк не указан — уточните у организатора`;
      $('share-hint').textContent = 'Переведите по СБП в своём банке, затем отметьте сумму ниже. Организатор подтвердит, когда увидит деньги.';
    }
    $('pay-form').hidden = closed;
    const mine = payments.filter((p) => p.phone === me.phone).sort((a, b) => b.createdAt - a.createdAt);
    $('my-payments-wrap').hidden = mine.length === 0;
    $('my-payments').innerHTML = mine.map((p) => paymentRow(p, { showName: false, actions: false })).join('');
  }

  /* Подтверждение — только организатору */
  const pendingList = payments.filter((p) => p.status === 'pending').sort((a, b) => a.createdAt - b.createdAt);
  $('review-box').hidden = !isOrg || pendingList.length === 0;
  if (isOrg) {
    $('pending-list').innerHTML = pendingList.map((p) => paymentRow(p, { showName: true, actions: true })).join('');
  }

  /* Участники */
  $('p-count').textContent = String(phones.length);
  const sorted = [...participants].sort((a, b) => {
    if (a.phone === c.organizerPhone) return -1;
    if (b.phone === c.organizerPhone) return 1;
    return (a.joinedAt || 0) - (b.joinedAt || 0);
  });
  $('participants').innerHTML = sorted.map((p) => {
    const s = byPhone[p.phone] || { confirmed: 0, pending: 0 };
    const tags = [];
    if (p.phone === c.organizerPhone) tags.push('<span class="tag">организатор</span>');
    if (me && p.phone === me.phone) tags.push('<span class="tag">вы</span>');
    const sub = isOrg ? formatPhone(p.phone) : (p.joinedAt ? `в сборе с ${fmtDate(p.joinedAt)}` : '');
    const side = [];
    side.push(s.confirmed > 0
      ? `<span class="row-sum">${money(s.confirmed)}</span>`
      : '<span class="muted">ещё не скинулся</span>');
    if (s.pending > 0) side.push(`<span class="tag tag-wait">+${money(s.pending)} ждёт</span>`);
    return `
      <li class="row">
        <div class="row-who">
          <span class="avatar" aria-hidden="true">${initial(p.name)}</span>
          <div class="row-main">
            <div class="row-name">${esc(p.name)} ${tags.join(' ')}</div>
            <div class="row-sub">${esc(sub)}</div>
          </div>
        </div>
        <div class="row-side">${side.join('')}</div>
      </li>`;
  }).join('');

  /* Управление */
  $('organizer-box').hidden = !isOrg;
  if (isOrg) {
    $('status-text').textContent = closed
      ? 'Сбор завершён: новые участники не могут присоединиться, переводы не отмечаются.'
      : 'Когда всё собрано, завершите сбор — он переместится в «Завершённые» у всех участников.';
    $('toggle-status').textContent = closed ? 'Возобновить сбор' : 'Завершить сбор';
    const all = [...payments].sort((a, b) => b.createdAt - a.createdAt);
    $('all-payments').innerHTML = all.length
      ? all.map((p) => paymentRow(p, { showName: true, actions: p.status !== 'pending' })).join('')
      : '<li class="row muted">Переводов пока нет.</li>';
  }

  /* Сверяем имя и банк из профиля с данными в сборе */
  if (isMember && !synced) {
    synced = true;
    const mineEntry = participants.find((p) => p.phone === me.phone);
    const nameDiffers = mineEntry && mineEntry.name !== me.name;
    const orgDiffers = isOrg && (c.organizerName !== me.name || (c.organizerBank || '') !== (me.bank || ''));
    if (nameDiffers || orgDiffers) store.syncParticipant(id, me, isOrg).catch(() => {});
  }
}

function bindActions() {
  $('join-btn').addEventListener('click', async () => {
    const btn = $('join-btn');
    btn.disabled = true;
    try {
      await store.joinCollection(id, me);
      toast('Вы присоединились к сбору');
    } catch (err) {
      toast(describeError(err), 'bad');
    } finally {
      btn.disabled = false;
    }
  });

  $('pay-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = $('pay-amount');
    const amount = parseAmount(input.value);
    $('pay-error').textContent = '';
    if (!amount) { $('pay-error').textContent = 'Укажите сумму числом, например 1500.'; input.focus(); return; }
    const btn = $('pay-submit');
    btn.disabled = true;
    try {
      await store.addPayment(id, { phone: me.phone, name: me.name, amount });
      input.value = '';
      const isOrg = current?.collection?.organizerPhone === me.phone;
      toast(isOrg ? 'Перевод отмечен — подтвердите его в списке ниже' : 'Перевод отмечен — ждёт подтверждения организатора');
    } catch (err) {
      $('pay-error').textContent = describeError(err);
    } finally {
      btn.disabled = false;
    }
  });

  // Кнопки подтверждения/отклонения — их перерисовывает render(), поэтому делегируем.
  document.addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-act]');
    if (!btn || !current) return;
    const payment = current.payments.find((p) => p.id === btn.dataset.pid);
    if (!payment) return;
    btn.disabled = true;
    try {
      await store.setPaymentStatus(id, payment, btn.dataset.act);
      const done = { confirmed: 'Перевод подтверждён', rejected: 'Перевод отклонён', pending: 'Подтверждение отменено' };
      toast(done[btn.dataset.act]);
    } catch (err) {
      btn.disabled = false;
      toast(describeError(err), 'bad');
    }
  });

  $('toggle-status').addEventListener('click', async () => {
    const closed = current?.collection?.status === 'closed';
    if (!closed && !confirm('Завершить сбор? Его можно будет возобновить.')) return;
    try {
      await store.setCollectionStatus(id, closed ? 'open' : 'closed');
      toast(closed ? 'Сбор возобновлён' : 'Сбор завершён');
    } catch (err) {
      toast(describeError(err), 'bad');
    }
  });

  $('copy-link').addEventListener('click', async () => {
    toast(await copyText(pageUrl) ? 'Ссылка скопирована' : 'Не удалось скопировать — выделите адрес в строке браузера', 'ok');
  });

  if (navigator.share) {
    $('share-link').hidden = false;
    $('share-link').addEventListener('click', () => {
      navigator.share({ title: current?.collection?.title || 'Сбор', url: pageUrl }).catch(() => {});
    });
  }

  $('copy-phone').addEventListener('click', async () => {
    const phone = current?.collection?.organizerPhone;
    if (!phone) return;
    toast(await copyText(`+${phone}`) ? 'Номер скопирован' : 'Не удалось скопировать номер');
  });
}

async function main() {
  if (!/^[\w-]+$/.test(id)) { fail('В ссылке нет номера сбора. Откройте сбор из списка или по QR-коду.'); return; }
  try {
    store = await getStore();
  } catch (err) {
    fail(describeError(err));
    return;
  }
  renderQr();
  bindActions();
  store.watchCollection(id, render, (err) => fail(describeError(err)));
}

main();
