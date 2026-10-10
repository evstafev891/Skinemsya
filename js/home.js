import { getStore } from './store.js';
import {
  getMe, initChrome, money, esc, plural, percent, parseAmount, toast, describeError,
} from './common.js';

initChrome();

const $ = (id) => document.getElementById(id);
const me = getMe();

if (!me) {
  $('welcome').hidden = false;
} else {
  $('dashboard').hidden = false;
  start();
}

function cardHtml(c) {
  const p = percent(c.collected, c.target);
  const count = (c.participantPhones || []).length;
  const role = c.organizerPhone === me.phone ? 'вы организатор' : `организатор ${esc(c.organizerName)}`;
  const closed = c.status === 'closed';
  return `
    <li>
      <a class="c-card${closed ? ' is-closed' : ''}" href="collection.html?id=${encodeURIComponent(c.id)}">
        <div class="c-card-top">
          <span class="c-card-title">${esc(c.title)}</span>
          <span class="c-card-sum">${money(c.collected)} <span class="muted">из ${money(c.target)}</span></span>
        </div>
        <div class="c-card-meta">${count} ${plural(count, 'участник', 'участника', 'участников')}, ${role}</div>
        <div class="bar bar-thin" data-zero="${p === 0}" aria-hidden="true">
          <div class="bar-fill" style="width:${p}%"></div>
        </div>
      </a>
    </li>`;
}

async function start() {
  let store;
  try {
    store = await getStore();
  } catch (err) {
    $('list-state').textContent = describeError(err);
    return;
  }

  store.watchMyCollections(me.phone, (list) => {
    $('list-state').hidden = true;
    const sorted = [...list].sort((a, b) => b.createdAt - a.createdAt);
    const active = sorted.filter((c) => c.status !== 'closed');
    const closed = sorted.filter((c) => c.status === 'closed');
    $('active-list').innerHTML = active.map(cardHtml).join('');
    $('closed-list').innerHTML = closed.map(cardHtml).join('');
    $('active-wrap').hidden = active.length === 0;
    $('closed-wrap').hidden = closed.length === 0;
    $('empty').hidden = sorted.length > 0;
  }, (err) => {
    $('list-state').hidden = false;
    $('list-state').textContent = describeError(err);
  });

  const dialog = $('new-dialog');
  const form = $('new-form');
  const open = () => {
    form.reset();
    $('new-error').textContent = '';
    dialog.showModal();
    $('f-title').focus();
  };
  $('new-btn').addEventListener('click', open);
  $('empty-new-btn').addEventListener('click', open);
  $('new-cancel').addEventListener('click', () => dialog.close());

  // Пришли из профиля по кнопке «Создать сбор» — сразу открываем форму.
  if (new URLSearchParams(location.search).get('new') === '1') {
    history.replaceState(null, '', 'index.html');
    open();
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const title = form.elements.title.value.trim();
    const target = parseAmount(form.elements.target.value);
    const description = form.elements.description.value.trim();
    if (!title) { $('new-error').textContent = 'Введите название сбора.'; form.elements.title.focus(); return; }
    if (!target) { $('new-error').textContent = 'Укажите сумму числом больше нуля, например 15000.'; form.elements.target.focus(); return; }

    const btn = $('new-submit');
    btn.disabled = true;
    try {
      const id = await store.createCollection({ title, description, target, organizer: me });
      location.href = `collection.html?id=${encodeURIComponent(id)}`;
    } catch (err) {
      btn.disabled = false;
      $('new-error').textContent = describeError(err);
      toast('Сбор не создан', 'bad');
    }
  });
}
