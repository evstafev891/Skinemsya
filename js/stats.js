import { getStore } from './store.js';
import {
  getMe, initChrome, money, esc, plural, describeError,
} from './common.js';

initChrome();

const $ = (id) => document.getElementById(id);
const me = getMe();

if (!me) {
  $('guest').hidden = false;
} else {
  $('stats').hidden = false;
  start();
}

function tile(label, value, note) {
  return `
    <div class="stat">
      <div class="stat-label">${label}</div>
      <div class="stat-value">${value}</div>
      <div class="stat-note">${note}</div>
    </div>`;
}

function render({ collections, payments }) {
  const joined = collections.filter((c) => c.organizerPhone !== me.phone);
  const organized = collections.filter((c) => c.organizerPhone === me.phone);
  const confirmed = payments.filter((p) => p.status === 'confirmed');
  const pending = payments.filter((p) => p.status === 'pending');
  const sum = (list) => list.reduce((s, p) => s + p.amount, 0);

  const joinedOpen = joined.filter((c) => c.status !== 'closed').length;
  const organizedClosed = organized.filter((c) => c.status === 'closed').length;
  const raised = organized.reduce((s, c) => s + c.collected, 0);

  $('tiles').innerHTML = [
    tile(
      'Участвовал в сборах',
      joined.length,
      joined.length ? `идут сейчас: ${joinedOpen}` : 'кроме своих сборов',
    ),
    tile(
      'Организовал сборов',
      organized.length,
      organized.length
        ? `собрано ${money(raised)}, ${organizedClosed} ${plural(organizedClosed, 'завершён', 'завершено', 'завершено')}`
        : 'пока ни одного',
    ),
    tile(
      'Отправил денег',
      money(sum(confirmed)),
      pending.length
        ? `ещё ${money(sum(pending))} ждут подтверждения`
        : `${confirmed.length} ${plural(confirmed.length, 'подтверждённый перевод', 'подтверждённых перевода', 'подтверждённых переводов')}`,
    ),
  ].join('');

  // Переводы по сборам: подтверждённые и ожидающие суммы, новые сборы сверху.
  const byCollection = collections
    .map((c) => {
      const mine = payments.filter((p) => p.collectionId === c.id);
      return { c, confirmed: sum(mine.filter((p) => p.status === 'confirmed')), pending: sum(mine.filter((p) => p.status === 'pending')) };
    })
    .filter((r) => r.confirmed || r.pending)
    .sort((a, b) => b.c.createdAt - a.c.createdAt);

  $('sent-wrap').hidden = byCollection.length === 0;
  $('sent-list').innerHTML = byCollection.map(({ c, confirmed: ok, pending: wait }) => `
    <li class="row">
      <div class="row-main">
        <a class="row-name" href="collection.html?id=${encodeURIComponent(c.id)}">${esc(c.title)}</a>
        <div class="row-sub">${c.organizerPhone === me.phone ? 'ваш сбор' : `организатор ${esc(c.organizerName)}`}</div>
      </div>
      <div class="row-side">
        ${wait ? `<span class="tag tag-wait">ждёт ${money(wait)}</span>` : ''}
        <span class="row-sum">${money(ok)}</span>
      </div>
    </li>`).join('');

  $('state').hidden = true;
  $('content').hidden = false;
}

async function start() {
  try {
    const store = await getStore();
    render(await store.getMyStats(me.phone));
  } catch (err) {
    $('state').textContent = describeError(err);
  }
}
