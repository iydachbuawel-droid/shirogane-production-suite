/* SHIROGANE Large Storage v2.2.0 — IndexedDB + safe local fallback */
(() => {
  const DB_NAME = 'shirogane-large-storage';
  const STORE = 'state';
  const KEY = 'shirogane-db';

  function openDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error('IndexedDB tidak dapat dibuka'));
    });
  }

  async function put(value) {
    const idb = await openDB();
    await new Promise((resolve, reject) => {
      const tx = idb.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(value, KEY);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error || new Error('Gagal menyimpan ke IndexedDB'));
      tx.onabort = () => reject(tx.error || new Error('Penyimpanan dibatalkan'));
    });
    idb.close();
  }

  async function get() {
    const idb = await openDB();
    const value = await new Promise((resolve, reject) => {
      const tx = idb.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(KEY);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error || new Error('Gagal membaca IndexedDB'));
    });
    idb.close();
    return value;
  }

  function lightweight(value) {
    const copy = structuredClone(value || {});
    for (const collectionName of ['orders', 'trash']) {
      for (const order of (copy[collectionName] || [])) {
        if (Array.isArray(order.images)) {
          order.images = order.images.map(im => ({
            id: im.id,
            name: im.name,
            storedInIndexedDB: true
          }));
        }
      }
    }
    if (copy.settings?.logo?.startsWith?.('data:')) copy.settings.logo = '';
    if (copy.settings?.customBankLogos) copy.settings.customBankLogos = {};
    return copy;
  }

  async function saveDB(value) {
    await put(value);
    try {
      localStorage.setItem(KEY, JSON.stringify(lightweight(value)));
    } catch (err) {
      console.warn('LocalStorage penuh; data lengkap tetap aman di IndexedDB.', err);
      try { localStorage.removeItem(KEY); } catch {}
    }
    return true;
  }

  async function loadDB() {
    try {
      const large = await get();
      if (large && typeof large === 'object') return large;
    } catch (err) {
      console.warn('IndexedDB belum tersedia, memakai data lokal lama.', err);
    }
    try {
      return JSON.parse(localStorage.getItem(KEY) || 'null');
    } catch {
      return null;
    }
  }

  async function migrateLegacy(value) {
    if (!value || typeof value !== 'object') return;
    try {
      const existing = await get();
      if (!existing) await saveDB(value);
    } catch (err) {
      console.warn('Migrasi penyimpanan lama gagal:', err);
    }
  }

  window.ShiroganeStorage = { saveDB, loadDB, migrateLegacy, lightweight };
})();
