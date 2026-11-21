/* ============================================================
   database.js — Lapisan akses data (IndexedDB)
   Buku Kas menyimpan seluruh data transaksional di IndexedDB.
   LocalStorage HANYA dipakai untuk pengaturan aplikasi (tema, dll)
   yang diatur di script.js, bukan di sini.
   ============================================================ */

const DB_NAME = 'bukukas-db';   // data milik "tamu" (tanpa akun); akun memakai bukukas-db-<uid>
const DB_VERSION = 5;

const STORES = {
  wallets: 'wallets',
  categories: 'categories',
  transactions: 'transactions',
  goals: 'goals',
  budgets: 'budgets',
  debts: 'debts',
  bills: 'bills',
  assets: 'assets',
  audit: 'audit',
  items: 'items',
  stockmoves: 'stockmoves',
  sales: 'sales',
  groups: 'groups'
};

let _dbPromise = null;
let _dbName = DB_NAME;

/** Nama database untuk pemilik tertentu: 'guest' = tanpa akun, selain itu = uid akun. */
function dbNameFor(owner) {
  const safe = String(owner || 'guest').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64);
  return !safe || safe === 'guest' ? DB_NAME : DB_NAME + '-' + safe;
}

/** Membuka (atau membuat) koneksi database. Di-cache supaya hanya sekali. */
function openDB() {
  if (_dbPromise) return _dbPromise;

  _dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(_dbName, DB_VERSION);

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
      if (!db.objectStoreNames.contains(STORES.bills)) {
        db.createObjectStore(STORES.bills, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORES.assets)) {
        db.createObjectStore(STORES.assets, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORES.audit)) {
        db.createObjectStore(STORES.audit, { keyPath: 'id' });
      }
      [STORES.items, STORES.stockmoves, STORES.sales, STORES.groups].forEach((n) => {
        if (!db.objectStoreNames.contains(n)) db.createObjectStore(n, { keyPath: 'id' });
      });
    };

    request.onsuccess = (event) => {
      const db = event.target.result;
      // Tab/versi lain meminta upgrade, atau browser menutup koneksi: lepaskan agar tidak macet.
      db.onversionchange = () => { db.close(); _dbPromise = null; };
      db.onclose = () => { _dbPromise = null; };
      resolve(db);
    };
    request.onerror = (event) => { _dbPromise = null; reject(event.target.error); }; // boleh dicoba lagi
    request.onblocked = () => { _dbPromise = null; reject(new Error('Database sedang dipakai jendela lain. Tutup yang lain lalu coba lagi.')); };
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

/* Daftar bersarang yang boleh ada di dalam satu data (dengan batas jumlah). */
const NESTED_LIMITS = { payments: 500, lines: 100, members: 300, entries: 5000 };

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
    } else if (Array.isArray(v) && depth === 0 && NESTED_LIMITS[key]) {
      out[key] = v.slice(0, NESTED_LIMITS[key]).map((p) => cleanRecord(p, 1)).filter((p) => p && p.id);
    }
  }
  return out.id ? out : null;
}

/* Bentuk wajib tiap data: field angka harus angka, teks harus teks, dan data yang
   tidak lengkap dibuang — agar file backup rusak tidak membuat aplikasi error. */
const BACKUP_SHAPES = {
  wallets:      { str: { name: 'Dompet', createdAt: '' }, num: { initialBalance: 0 } },
  categories:   { str: { name: 'Kategori', createdAt: '' }, num: {}, enumOf: ['income', 'expense'] },
  transactions: { str: { note: '', categoryId: '', walletId: '', createdAt: '' }, num: { amount: null }, enumOf: ['income', 'expense', 'transfer'], needDate: 'date' },
  goals:        { str: { name: 'Target', createdAt: '' }, num: { targetAmount: 0, currentAmount: 0 } },
  budgets:      { str: { categoryId: '' }, num: { monthlyLimit: 0 } },
  debts:        { str: { person: '', note: '' }, num: { amount: null, remindBefore: 0 }, enumOf: ['owe', 'lent'], enumDefault: 'owe' },
  bills:        { str: { name: 'Tagihan', repeat: 'monthly', categoryId: '', walletId: '', note: '', createdAt: '' }, num: { amount: 0 }, needDate: 'dueDate' },
  assets:       { str: { name: 'Aset', note: '', createdAt: '' }, num: { value: 0 } },
  audit:        { str: { at: '', action: '', entity: '', summary: '' }, num: {} },
  items:        { str: { name: 'Barang', sku: '', unit: 'pcs', note: '', createdAt: '' }, num: { buyPrice: 0, sellPrice: 0, openingStock: 0, minStock: 0 } },
  stockmoves:   { str: { itemId: '', kind: 'in', note: '', refId: '', createdAt: '' }, num: { qty: 0, unitCost: 0 }, needDate: 'date' },
  sales:        { str: { customer: '', walletId: '', method: 'cash', note: '', createdAt: '' }, num: { subtotal: 0, discount: 0, tax: 0, total: 0, cost: 0, paid: 0 }, needDate: 'date' },
  groups:       { str: { name: 'Kelompok', kind: 'kas', repeat: 'monthly', startDate: '', note: '', createdAt: '' }, num: { dues: 0 } }
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
  if (name === 'transactions' && rec.type === 'transfer' && (!rec.walletId || !rec.toWalletId || rec.walletId === rec.toWalletId)) return null;
  if (name === 'bills' && !['once', 'weekly', 'monthly', 'yearly'].includes(rec.repeat)) rec.repeat = 'monthly';
  if (name === 'audit') { rec.summary = rec.summary.slice(0, 200); }
  if (name === 'stockmoves' && !rec.itemId) return null;
  if (name === 'sales') {
    if (!Array.isArray(rec.lines)) rec.lines = [];
    rec.lines = rec.lines.filter((l) => typeof l.qty === 'number' && typeof l.price === 'number' && typeof l.itemId === 'string');
  }
  if (name === 'groups') {
    if (!['kas', 'arisan', 'iuran', 'patungan'].includes(rec.kind)) rec.kind = 'kas';
    if (!['weekly', 'monthly', 'once'].includes(rec.repeat)) rec.repeat = 'monthly';
    if (!Array.isArray(rec.members)) rec.members = [];
    if (!Array.isArray(rec.entries)) rec.entries = [];
    rec.members = rec.members.filter((m) => typeof m.name === 'string');
    rec.entries = rec.entries.filter((e) => typeof e.amount === 'number' && typeof e.date === 'string');
  }
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
    const out = list.slice(0, BACKUP_LIMITS.perStore).map((r) => cleanRecord(r, 0)).filter(Boolean).map((r) => shapeRecord(name, r)).filter(Boolean);
    // id ganda dibuang (yang terakhir dipakai); anggaran juga unik per kategori (aturan indeks database)
    const seen = new Map();
    out.forEach((r) => seen.set(name === 'budgets' ? r.categoryId : r.id, r));
    return Array.from(seen.values());
  };
  return {
    wallets: pick('wallets'), categories: pick('categories'), transactions: pick('transactions'),
    goals: pick('goals'), budgets: pick('budgets'), debts: pick('debts'),
    bills: pick('bills'), assets: pick('assets'), audit: pick('audit').slice(-500),
    items: pick('items'), stockmoves: pick('stockmoves'), sales: pick('sales'), groups: pick('groups')
  };
}

const DB = {
  /** Pindah ke database milik pemilik lain (tamu / akun). Data tiap pemilik terpisah di perangkat. */
  useOwner: async function (owner) {
    const name = dbNameFor(owner);
    if (name === _dbName && _dbPromise) return;
    if (_dbPromise) { try { (await _dbPromise).close(); } catch (e) { /* abaikan */ } }
    _dbName = name;
    _dbPromise = null;
  },

  /** True jika database pemilik ini masih kosong (belum ada transaksi/dompet tambahan/target/hutang). */
  isEmpty: async function () {
    const [w, t, g, d] = await Promise.all([getAll(STORES.wallets), getAll(STORES.transactions), getAll(STORES.goals), getAll(STORES.debts)]);
    return w.length <= 1 && !t.length && !g.length && !d.length;
  },

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

  // Tagihan & langganan
  getBills: () => getAll(STORES.bills),
  // Aset
  getAssets: () => getAll(STORES.assets),
  // Riwayat perubahan (audit trail)
  getAudit: () => getAll(STORES.audit),
  // Usaha & kelompok
  getItems: () => getAll(STORES.items),
  getStockMoves: () => getAll(STORES.stockmoves),
  getSales: () => getAll(STORES.sales),
  getGroups: () => getAll(STORES.groups),

  /** Beberapa penulisan dalam SATU transaksi IndexedDB: semuanya berhasil atau semuanya dibatalkan.
   *  ops: [{ s: 'transactions', put: {...} } | { s: 'transactions', del: 'id' }]. Catatan audit ikut di sini. */
  atomic: async function (ops) {
    const db = await openDB();
    const names = Array.from(new Set(ops.map((o) => STORES[o.s]).concat(STORES.audit)));
    const tx = db.transaction(names, 'readwrite');
    const finished = new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error || new Error('Gagal menyimpan'));
      tx.onabort = () => reject(tx.error || new Error('Penyimpanan dibatalkan; data tetap utuh'));
    });
    try {
      ops.forEach((o) => {
        const store = tx.objectStore(STORES[o.s]);
        if (o.del !== undefined) { store.delete(o.del); return; }
        const item = o.put;
        if (!item.id) item.id = genId();
        if (o.s !== 'audit' && o.s !== 'budgets' && !item.createdAt) item.createdAt = new Date().toISOString();
        store.put(item);
      });
    } catch (e) {
      try { tx.abort(); } catch (e2) { /* sudah selesai */ }
      await finished.catch(() => {});
      throw e;
    }
    await finished;
    // jaga ukuran riwayat: simpan 500 terbaru
    try {
      const all = await getAll(STORES.audit);
      if (all.length > 600) {
        all.sort((a, b) => a.at.localeCompare(b.at));
        const t2 = db.transaction(STORES.audit, 'readwrite');
        all.slice(0, all.length - 500).forEach((r) => t2.objectStore(STORES.audit).delete(r.id));
      }
    } catch (e) { /* pemangkasan opsional */ }
    return true;
  },

  // Backup / restore
  exportAll: async function () {
    const [wallets, categories, transactions, goals, budgets, debts, bills, assets, audit, items, stockmoves, sales, groups] = await Promise.all([
      getAll(STORES.wallets),
      getAll(STORES.categories),
      getAll(STORES.transactions),
      getAll(STORES.goals),
      getAll(STORES.budgets),
      getAll(STORES.debts),
      getAll(STORES.bills),
      getAll(STORES.assets),
      getAll(STORES.audit),
      getAll(STORES.items),
      getAll(STORES.stockmoves),
      getAll(STORES.sales),
      getAll(STORES.groups)
    ]);
    return {
      app: 'buku-kas',
      version: DB_VERSION,
      exportedAt: new Date().toISOString(),
      data: { wallets, categories, transactions, goals, budgets, debts, bills, assets, audit, items, stockmoves, sales, groups }
    };
  },

  importAll: async function (payload) {
    // Validasi & bersihkan SEBELUM menghapus apa pun, supaya file rusak/berbahaya
    // tidak menghapus data yang ada dan tidak menyusupkan markup ke tampilan.
    const { wallets, categories, transactions, goals, budgets, debts, bills, assets, audit, items, stockmoves, sales, groups } = sanitizeBackup(payload);
    // Hapus + tulis dalam SATU transaksi: jika ada yang gagal (mis. data ganda), semuanya dibatalkan
    // dan data lama tetap utuh — tidak ada kondisi "sudah terhapus tapi belum terisi".
    const db = await openDB();
    const tx = db.transaction(
      [STORES.wallets, STORES.categories, STORES.transactions, STORES.goals, STORES.budgets, STORES.debts, STORES.bills, STORES.assets, STORES.audit, STORES.items, STORES.stockmoves, STORES.sales, STORES.groups],
      'readwrite'
    );
    const data = { wallets, categories, transactions, goals, budgets, debts, bills, assets, audit, items, stockmoves, sales, groups };
    const finished = new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error || new Error('Gagal menulis data'));
      tx.onabort = () => reject(tx.error || new Error('Impor dibatalkan; data lama tetap aman'));
    });
    try {
      Object.keys(data).forEach((name) => {
        const store = tx.objectStore(STORES[name]);
        store.clear();
        data[name].forEach((item) => store.put(item));
      });
    } catch (e) {
      // Kesalahan sinkron (mis. data tidak bisa disimpan) tidak otomatis membatalkan transaksi: batalkan manual.
      try { tx.abort(); } catch (e2) { /* sudah selesai */ }
      await finished.catch(() => {});
      throw e;
    }
    return finished;
  },

  resetAll: async function () {
    await clearStore(STORES.wallets);
    await clearStore(STORES.categories);
    await clearStore(STORES.transactions);
    await clearStore(STORES.goals);
    await clearStore(STORES.budgets);
    await clearStore(STORES.debts);
    await clearStore(STORES.bills);
    await clearStore(STORES.assets);
    await clearStore(STORES.audit);
    await clearStore(STORES.items);
    await clearStore(STORES.stockmoves);
    await clearStore(STORES.sales);
    await clearStore(STORES.groups);
    await ensureDefaultCategories();
  },

  genId
};
