// Слой данных. Два варианта с одинаковым интерфейсом:
//  - Firebase (Firestore + анонимный вход) — когда заполнен js/config.js;
//  - демо-хранилище в localStorage — когда конфиг пустой.

import { FIREBASE_CONFIG } from './config.js';

export const isDemo = !(FIREBASE_CONFIG && FIREBASE_CONFIG.apiKey);

const FIREBASE_SDK = 'https://www.gstatic.com/firebasejs/11.0.2';

let storePromise = null;
export function getStore() {
  if (!storePromise) {
    storePromise = isDemo ? Promise.resolve(createLocalStore()) : createFirebaseStore();
  }
  return storePromise;
}

const toMs = (t) => {
  if (t && typeof t.toMillis === 'function') return t.toMillis();
  if (typeof t === 'number') return t;
  return Date.now();
};

/* ---------------------------------------------------------------- Firebase */

async function createFirebaseStore() {
  const [appMod, authMod, F] = await Promise.all([
    import(`${FIREBASE_SDK}/firebase-app.js`),
    import(`${FIREBASE_SDK}/firebase-auth.js`),
    import(`${FIREBASE_SDK}/firebase-firestore.js`),
  ]);
  const app = appMod.initializeApp(FIREBASE_CONFIG);
  const auth = authMod.getAuth(app);
  if (!auth.currentUser) await authMod.signInAnonymously(auth);
  const db = F.getFirestore(app);
  const {
    doc, collection, getDoc, getDocs, setDoc, updateDoc, addDoc, writeBatch,
    onSnapshot, query, where, serverTimestamp, arrayUnion, increment,
  } = F;

  const colRef = (id) => doc(db, 'collections', id);
  const toCollection = (snap) => {
    const d = snap.data();
    return { id: snap.id, ...d, collected: Number(d.collected) || 0, createdAt: toMs(d.createdAt) };
  };

  return {
    async getUser(phone) {
      const s = await getDoc(doc(db, 'users', phone));
      return s.exists() ? s.data() : null;
    },

    async saveUser(u) {
      await setDoc(doc(db, 'users', u.phone), {
        phone: u.phone, name: u.name, bank: u.bank || '', updatedAt: serverTimestamp(),
      }, { merge: true });
    },

    async createCollection({ title, description, target, organizer }) {
      const ref = doc(collection(db, 'collections'));
      const b = writeBatch(db);
      b.set(ref, {
        title, description: description || '', target, collected: 0, status: 'open',
        organizerPhone: organizer.phone, organizerName: organizer.name, organizerBank: organizer.bank || '',
        participantPhones: [organizer.phone],
        createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
      });
      b.set(doc(ref, 'participants', organizer.phone), {
        phone: organizer.phone, name: organizer.name, joinedAt: serverTimestamp(),
      });
      await b.commit();
      return ref.id;
    },

    async joinCollection(id, user) {
      const b = writeBatch(db);
      b.update(colRef(id), { participantPhones: arrayUnion(user.phone), updatedAt: serverTimestamp() });
      b.set(doc(colRef(id), 'participants', user.phone), {
        phone: user.phone, name: user.name, joinedAt: serverTimestamp(),
      });
      await b.commit();
    },

    async syncParticipant(id, user, isOrganizer) {
      const b = writeBatch(db);
      b.set(doc(colRef(id), 'participants', user.phone), { phone: user.phone, name: user.name }, { merge: true });
      if (isOrganizer) {
        b.update(colRef(id), { organizerName: user.name, organizerBank: user.bank || '', updatedAt: serverTimestamp() });
      }
      await b.commit();
    },

    async addPayment(id, p) {
      await addDoc(collection(colRef(id), 'payments'), {
        phone: p.phone, name: p.name, amount: p.amount, status: 'pending', createdAt: serverTimestamp(),
      });
    },

    async setPaymentStatus(id, payment, status) {
      const delta = (status === 'confirmed' ? payment.amount : 0) - (payment.status === 'confirmed' ? payment.amount : 0);
      const b = writeBatch(db);
      b.update(doc(colRef(id), 'payments', payment.id), { status, reviewedAt: serverTimestamp() });
      if (delta) b.update(colRef(id), { collected: increment(delta), updatedAt: serverTimestamp() });
      await b.commit();
    },

    async setCollectionStatus(id, status) {
      await updateDoc(colRef(id), { status, updatedAt: serverTimestamp() });
    },

    watchCollection(id, cb, onError) {
      const state = { collection: undefined, participants: [], payments: [] };
      const emit = () => { if (state.collection !== undefined) cb({ ...state }); };
      const u1 = onSnapshot(colRef(id), (s) => {
        state.collection = s.exists() ? toCollection(s) : null; emit();
      }, onError);
      const u2 = onSnapshot(collection(colRef(id), 'participants'), (qs) => {
        state.participants = qs.docs.map((d) => ({ ...d.data(), joinedAt: toMs(d.data().joinedAt) })); emit();
      }, onError);
      const u3 = onSnapshot(collection(colRef(id), 'payments'), (qs) => {
        state.payments = qs.docs.map((d) => ({ id: d.id, ...d.data(), amount: Number(d.data().amount) || 0, createdAt: toMs(d.data().createdAt) })); emit();
      }, onError);
      return () => { u1(); u2(); u3(); };
    },

    watchMyCollections(phone, cb, onError) {
      const q = query(collection(db, 'collections'), where('participantPhones', 'array-contains', phone));
      return onSnapshot(q, (qs) => cb(qs.docs.map(toCollection)), onError);
    },

    // Для страницы статистики: сборы пользователя и его переводы во всех этих сборах.
    async getMyStats(phone) {
      const qs = await getDocs(query(collection(db, 'collections'), where('participantPhones', 'array-contains', phone)));
      const collections = qs.docs.map(toCollection);
      const perCollection = await Promise.all(collections.map(async (c) => {
        const ps = await getDocs(query(collection(colRef(c.id), 'payments'), where('phone', '==', phone)));
        return ps.docs.map((d) => ({
          id: d.id, collectionId: c.id, ...d.data(), amount: Number(d.data().amount) || 0, createdAt: toMs(d.data().createdAt),
        }));
      }));
      return { collections, payments: perCollection.flat() };
    },
  };
}

/* ------------------------------------------------------------- Демо-режим */

function createLocalStore() {
  const KEY = 'skinemsya:demo-db';
  const listeners = new Set();
  const empty = () => ({ users: {}, collections: {} });
  const load = () => {
    try { return JSON.parse(localStorage.getItem(KEY)) || empty(); } catch { return empty(); }
  };
  const notify = () => listeners.forEach((fn) => fn());
  const save = (db) => { localStorage.setItem(KEY, JSON.stringify(db)); notify(); };
  window.addEventListener('storage', (e) => { if (e.key === KEY) notify(); });
  const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
  const subscribe = (fn) => { listeners.add(fn); queueMicrotask(fn); return () => listeners.delete(fn); };
  const publicCollection = (id, c) => {
    const { participants, payments, ...rest } = c;
    return { id, ...rest };
  };
  const mutate = (fn) => { const db = load(); fn(db); save(db); };
  const need = (db, id) => {
    const c = db.collections[id];
    if (!c) throw new Error('Сбор не найден');
    return c;
  };

  return {
    async getUser(phone) { return load().users[phone] || null; },

    async saveUser(u) {
      mutate((db) => { db.users[u.phone] = { phone: u.phone, name: u.name, bank: u.bank || '' }; });
    },

    async createCollection({ title, description, target, organizer }) {
      const id = uid();
      const now = Date.now();
      mutate((db) => {
        db.collections[id] = {
          title, description: description || '', target, collected: 0, status: 'open',
          organizerPhone: organizer.phone, organizerName: organizer.name, organizerBank: organizer.bank || '',
          participantPhones: [organizer.phone], createdAt: now, updatedAt: now,
          participants: { [organizer.phone]: { phone: organizer.phone, name: organizer.name, joinedAt: now } },
          payments: {},
        };
      });
      return id;
    },

    async joinCollection(id, user) {
      mutate((db) => {
        const c = need(db, id);
        if (!c.participantPhones.includes(user.phone)) c.participantPhones.push(user.phone);
        c.participants[user.phone] = { phone: user.phone, name: user.name, joinedAt: Date.now() };
      });
    },

    async syncParticipant(id, user, isOrganizer) {
      mutate((db) => {
        const c = need(db, id);
        if (c.participants[user.phone]) c.participants[user.phone].name = user.name;
        if (isOrganizer) { c.organizerName = user.name; c.organizerBank = user.bank || ''; }
      });
    },

    async addPayment(id, p) {
      mutate((db) => {
        const c = need(db, id);
        const pid = uid();
        c.payments[pid] = { phone: p.phone, name: p.name, amount: p.amount, status: 'pending', createdAt: Date.now() };
      });
    },

    async setPaymentStatus(id, payment, status) {
      mutate((db) => {
        const c = need(db, id);
        const p = c.payments[payment.id];
        if (!p) return;
        const delta = (status === 'confirmed' ? p.amount : 0) - (p.status === 'confirmed' ? p.amount : 0);
        p.status = status;
        p.reviewedAt = Date.now();
        c.collected = Math.round(((c.collected || 0) + delta) * 100) / 100;
      });
    },

    async setCollectionStatus(id, status) {
      mutate((db) => { need(db, id).status = status; });
    },

    watchCollection(id, cb) {
      return subscribe(() => {
        const c = load().collections[id];
        if (!c) { cb({ collection: null, participants: [], payments: [] }); return; }
        cb({
          collection: publicCollection(id, c),
          participants: Object.values(c.participants || {}),
          payments: Object.entries(c.payments || {}).map(([pid, p]) => ({ id: pid, ...p })),
        });
      });
    },

    watchMyCollections(phone, cb) {
      return subscribe(() => {
        const all = load().collections;
        cb(Object.entries(all)
          .filter(([, c]) => (c.participantPhones || []).includes(phone))
          .map(([id, c]) => publicCollection(id, c)));
      });
    },

    async getMyStats(phone) {
      const mine = Object.entries(load().collections).filter(([, c]) => (c.participantPhones || []).includes(phone));
      return {
        collections: mine.map(([id, c]) => publicCollection(id, c)),
        payments: mine.flatMap(([id, c]) => Object.entries(c.payments || {})
          .filter(([, p]) => p.phone === phone)
          .map(([pid, p]) => ({ id: pid, collectionId: id, ...p }))),
      };
    },
  };
}
