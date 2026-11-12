/* ============================================================
   database.js — Lapisan akses data (IndexedDB)
   Buku Kas menyimpan seluruh data transaksional di IndexedDB.
   LocalStorage HANYA dipakai untuk pengaturan aplikasi (tema, dll)
   yang diatur di script.js, bukan di sini.
   ============================================================ */

const DB_NAME = 'bukukas-db';
const DB_VERSION = 3;

const STORES = {
  wallets: 'wallets',
  categories: 'categories',
  transactions: 'transactions',
  goals: 'goals',
  budgets: 'budgets',
  debts: 'debts'
};

let _dbPromise = null;

/** Membuka (atau membuat) koneksi database. Di-cache supaya hanya sekali. */
function openDB() {
  if (_dbPromise) return _dbPromise;

  _dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;

      if (!db.objectStoreNames.contains(STORES.wallets)) {
        db.createObjectStore(STORES.wallets, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORES.categories)) {
        const catStore = db.createObjectStore(STORES.categories, { keyPath: 'id' });
        catStore.createIndex('type', 'type', { unique: false });
      }
      if (!db.objectStoreNames.contains(STORES.transactions)) {
        const txStore = db.createObjectStore(STORES.transactions, { keyPath: 'id' });
        txStore.createIndex('date', 'date', { unique: false });
        txStore.createIndex('walletId', 'walletId', { unique: false });
        txStore.createIndex('categoryId', 'categoryId', { unique: false });
        txStore.createIndex('type', 'type', { unique: false });
      }
      if (!db.objectStoreNames.contains(STORES.goals)) {
        db.createObjectStore(STORES.goals, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORES.debts)) {
        db.createObjectStore(STORES.debts, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORES.budgets)) {
        const budgetStore = db.createObjectStore(STORES.budgets, { keyPath: 'id' });
        budgetStore.createIndex('categoryId', 'categoryId', { unique: true });
      }
    };

    request.onsuccess = (event) => resolve(event.target.result);
    request.onerror = (event) => reject(event.target.error);
  });

  return _dbPromise;
}

function genId() {
  return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 9);
}

/** Helper generik untuk transaksi IndexedDB */
async function withStore(storeName, mode, callback) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    const store = tx.objectStore(storeName);
    const result = callback(store);

    tx.oncomplete = () => resolve(result && result.value !== undefined ? result.value : result);
    tx.onerror = () => reject(tx.error);
  });
}

function reqToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function getAll(storeName) {
  const db = await openDB();
  const tx = db.transaction(storeName, 'readonly');
  const store = tx.objectStore(storeName);
  return reqToPromise(store.getAll());
}

async function getById(storeName, id) {
  const db = await openDB();
  const tx = db.transaction(storeName, 'readonly');
  const store = tx.objectStore(storeName);
  return reqToPromise(store.get(id));
}

async function putItem(storeName, item) {
  const db = await openDB();
  const tx = db.transaction(storeName, 'readwrite');
  tx.objectStore(storeName).put(item);
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve(item);
    tx.onerror = () => reject(tx.error);
  });
}

async function deleteItem(storeName, id) {
  const db = await openDB();
  const tx = db.transaction(storeName, 'readwrite');
  tx.objectStore(storeName).delete(id);
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  });
}

async function clearStore(storeName) {
  const db = await openDB();
  const tx = db.transaction(storeName, 'readwrite');
  tx.objectStore(storeName).clear();
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  });
}

/* ===================== Kategori default ===================== *
 * Sesuai brief: kategori default dibuat sekali di awal supaya
 * pengguna langsung bisa mencatat transaksi. Ini BUKAN data
 * transaksi contoh — buku kas (transaksi & dompet) tetap kosong.
 * ============================================================= */
const DEFAULT_CATEGORIES = [
  { name: 'Gaji', type: 'income' },
  { name: 'Bonus', type: 'income' },
  { name: 'Lainnya', type: 'income' },
  { name: 'Makan', type: 'expense' },
  { name: 'Transportasi', type: 'expense' },
  { name: 'Belanja', type: 'expense' },
  { name: 'Pendidikan', type: 'expense' },
  { name: 'Kesehatan', type: 'expense' },
  { name: 'Hiburan', type: 'expense' },
  { name: 'Lainnya', type: 'expense' }
];

async function ensureDefaultCategories() {
  const existing = await getAll(STORES.categories);
  if (existing.length > 0) return;
  const db = await openDB();
  const tx = db.transaction(STORES.categories, 'readwrite');
  const store = tx.objectStore(STORES.categories);
  DEFAULT_CATEGORIES.forEach((c) => {
    store.put({ id: genId(), name: c.name, type: c.type, isDefault: true });
  });
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  });
}

/* ===================== API Publik ===================== */

/* ---------- Validasi cadangan (impor file & tarik dari cloud) ---------- */
const BACKUP_LIMITS = { bytes: 5 * 1024 * 1024, perStore: 20000, text: 300, num: 1e13 };
const ID_RE = /^[A-Za-z0-9_.-]{1,64}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}/;
const ENUM_RE = /^[a-z_]{1,24}$/;

function cleanRecord(rec, depth) {
  if (!rec || typeof rec !== 'object' || Array.isArray(rec)) return null;
  const out = {};
  for (const key of Object.keys(rec)) {
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue;
    const v = rec[key];
    const isId = key === 'id' || /Id$/.test(key);
    if (typeof v === 'string') {
      if (isId) { if (!ID_RE.test(v)) { if (key === 'id') return null; continue; } out[key] = v; }
      else if (key === 'type' || key === 'kind') { if (ENUM_RE.test(v)) out[key] = v; }
      else if (/date$/i.test(key) || key === 'date') { if (DATE_RE.test(v)) out[key] = v.slice(0, 10); }
      else out[key] = v.slice(0, BACKUP_LIMITS.text);
    } else if (typeof v === 'number') {
      if (Number.isFinite(v) && Math.abs(v) < BACKUP_LIMITS.num) out[key] = v;
    } else if (typeof v === 'boolean' || v === null) {
      out[key] = v;
    } else if (Array.isArray(v) && key === 'payments' && depth === 0) {
      out[key] = v.slice(0, 500).map((p) => cleanRecord(p, 1)).filter((p) => p && p.id);
    }
  }
  return out.id ? out : null;
}

/* Bentuk wajib tiap data: field angka harus angka, teks harus teks, dan data yang
   tidak lengkap dibuang — agar file backup rusak tidak membuat aplikasi error. */
const BACKUP_SHAPES = {
  wallets:      { str: { name: 'Dompet', createdAt: '' }, num: { initialBalance: 0 } },
  categories:   { str: { name: 'Kategori', createdAt: '' }, num: {}, enumOf: ['income', 'expense'] },
  transactions: { str: { note: '', categoryId: '', walletId: '', createdAt: '' }, num: { amount: null }, enumOf: ['income', 'expense'], needDate: 'date' },
  goals:        { str: { name: 'Target', createdAt: '' }, num: { targetAmount: 0, currentAmount: 0 } },
  budgets:      { str: { categoryId: '' }, num: { monthlyLimit: 0 } },
  debts:        { str: { person: '', note: '' }, num: { amount: null, remindBefore: 0 }, enumOf: ['owe', 'lent'], enumDefault: 'owe' }
};
function shapeRecord(name, rec) {
  const shape = BACKUP_SHAPES[name];
  for (const k of Object.keys(shape.str)) if (typeof rec[k] !== 'string') rec[k] = shape.str[k];
  for (const k of Object.keys(shape.num)) {
    if (typeof rec[k] !== 'number') { if (shape.num[k] === null) return null; rec[k] = shape.num[k]; }
  }
  if (shape.enumOf && !shape.enumOf.includes(rec.type)) {
    if (shape.enumDefault) rec.type = shape.enumDefault; else return null;
  }
  if (shape.needDate && !rec[shape.needDate]) return null;
  if (name === 'debts' && typeof rec.dueDate !== 'string') rec.dueDate = '';
  if (name === 'debts' && !Array.isArray(rec.payments)) rec.payments = [];
  if (name === 'debts') rec.payments = rec.payments.filter((p) => typeof p.amount === 'number' && typeof p.date === 'string');
  return rec;
}

function sanitizeBackup(payload) {
  if (!payload || typeof payload !== 'object' || !payload.data || typeof payload.data !== 'object') {
    throw new Error('Format backup tidak valid');
  }
  if (JSON.stringify(payload).length > BACKUP_LIMITS.bytes) throw new Error('Backup terlalu besar');
  const pick = (name) => {
    const list = payload.data[name];
    if (list == null) return [];
    if (!Array.isArray(list)) throw new Error('Format backup tidak valid');
    return list.slice(0, BACKUP_LIMITS.perStore).map((r) => cleanRecord(r, 0)).filter(Boolean).map((r) => shapeRecord(name, r)).filter(Boolean);
  };
  return {
    wallets: pick('wallets'), categories: pick('categories'), transactions: pick('transactions'),
    goals: pick('goals'), budgets: pick('budgets'), debts: pick('debts')
  };
}

const DB = {
  init: async function () {
    await openDB();
    await ensureDefaultCategories();
  },

  // Wallets
  getWallets: () => getAll(STORES.wallets),
  getWallet: (id) => getById(STORES.wallets, id),
  saveWallet: (wallet) => {
    if (!wallet.id) wallet.id = genId();
    if (!wallet.createdAt) wallet.createdAt = new Date().toISOString();
    return putItem(STORES.wallets, wallet);
  },
  deleteWallet: (id) => deleteItem(STORES.wallets, id),

  // Categories
  getCategories: () => getAll(STORES.categories),
  saveCategory: (cat) => {
    if (!cat.id) cat.id = genId();
    return putItem(STORES.categories, cat);
  },
  deleteCategory: (id) => deleteItem(STORES.categories, id),

  // Transactions
  getTransactions: () => getAll(STORES.transactions),
  getTransaction: (id) => getById(STORES.transactions, id),
  saveTransaction: (trx) => {
    if (!trx.id) trx.id = genId();
    if (!trx.createdAt) trx.createdAt = new Date().toISOString();
    return putItem(STORES.transactions, trx);
  },
  deleteTransaction: (id) => deleteItem(STORES.transactions, id),

  // Savings goals
  getGoals: () => getAll(STORES.goals),
  saveGoal: (goal) => {
    if (!goal.id) goal.id = genId();
    if (!goal.createdAt) goal.createdAt = new Date().toISOString();
    return putItem(STORES.goals, goal);
  },
  deleteGoal: (id) => deleteItem(STORES.goals, id),

  // Anggaran (budget bulanan per kategori pengeluaran)
  getBudgets: () => getAll(STORES.budgets),
  saveBudget: (budget) => {
    if (!budget.id) budget.id = genId();
    return putItem(STORES.budgets, budget);
  },
  deleteBudget: (id) => deleteItem(STORES.budgets, id),

  // Hutang & piutang (hutang saya / hutang orang lain ke saya)
  getDebts: () => getAll(STORES.debts),
  saveDebt: (debt) => {
    if (!debt.id) debt.id = genId();
    if (!debt.createdAt) debt.createdAt = new Date().toISOString();
    if (!Array.isArray(debt.payments)) debt.payments = [];
    return putItem(STORES.debts, debt);
  },
  deleteDebt: (id) => deleteItem(STORES.debts, id),

  // Backup / restore
  exportAll: async function () {
    const [wallets, categories, transactions, goals, budgets, debts] = await Promise.all([
      getAll(STORES.wallets),
      getAll(STORES.categories),
      getAll(STORES.transactions),
      getAll(STORES.goals),
      getAll(STORES.budgets),
      getAll(STORES.debts)
    ]);
    return {
      app: 'buku-kas',
      version: DB_VERSION,
      exportedAt: new Date().toISOString(),
      data: { wallets, categories, transactions, goals, budgets, debts }
    };
  },

  importAll: async function (payload) {
    // Validasi & bersihkan SEBELUM menghapus apa pun, supaya file rusak/berbahaya
    // tidak menghapus data yang ada dan tidak menyusupkan markup ke tampilan.
    const { wallets, categories, transactions, goals, budgets, debts } = sanitizeBackup(payload);
    await clearStore(STORES.wallets);
    await clearStore(STORES.categories);
    await clearStore(STORES.transactions);
    await clearStore(STORES.goals);
    await clearStore(STORES.budgets);
    await clearStore(STORES.debts);

    const db = await openDB();
    const tx = db.transaction(
      [STORES.wallets, STORES.categories, STORES.transactions, STORES.goals, STORES.budgets, STORES.debts],
      'readwrite'
    );
    wallets.forEach((w) => tx.objectStore(STORES.wallets).put(w));
    categories.forEach((c) => tx.objectStore(STORES.categories).put(c));
    transactions.forEach((t) => tx.objectStore(STORES.transactions).put(t));
    goals.forEach((g) => tx.objectStore(STORES.goals).put(g));
    budgets.forEach((b) => tx.objectStore(STORES.budgets).put(b));
    debts.forEach((d) => tx.objectStore(STORES.debts).put(d));

    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
    });
  },

  resetAll: async function () {
    await clearStore(STORES.wallets);
    await clearStore(STORES.categories);
    await clearStore(STORES.transactions);
    await clearStore(STORES.goals);
    await clearStore(STORES.budgets);
    await clearStore(STORES.debts);
    await ensureDefaultCategories();
  },

  genId
};
