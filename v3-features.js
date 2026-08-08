/* SHIROGANE Stability Features v3.0.11
 * Splash, exit confirmation, automatic update, automatic backup, restore.
 */
(() => {
  'use strict';

  const APP_VERSION = '3.0.21';
  const BACKUP_DB = 'shirogane-auto-backups';
  const BACKUP_STORE = 'backups';
  const MAX_BACKUPS = 10;
  let backupTimer = null;
  let updateChecked = false;
  let availableVersion = null;

  // Bersihkan penanda update lama segera setelah script versi baru benar-benar termuat.
  try {
    const staleTarget = localStorage.getItem('shirogane-update-target');
    if (staleTarget) {
      const partsA = APP_VERSION.split('.').map(Number);
      const partsB = String(staleTarget).split('.').map(Number);
      let cmp = 0;
      for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
        const diff = (partsA[i] || 0) - (partsB[i] || 0);
        if (diff) { cmp = diff; break; }
      }
      if (cmp >= 0) localStorage.removeItem('shirogane-update-target');
    }
  } catch {}

  const clone = value => {
    try { return structuredClone(value); }
    catch { return JSON.parse(JSON.stringify(value)); }
  };

  function openBackupDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(BACKUP_DB, 1);
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(BACKUP_STORE)) {
          const store = database.createObjectStore(BACKUP_STORE, { keyPath: 'id', autoIncrement: true });
          store.createIndex('createdAt', 'createdAt');
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('Backup database tidak dapat dibuka.'));
    });
  }

  async function listBackups() {
    const database = await openBackupDB();
    try {
      return await new Promise((resolve, reject) => {
        const tx = database.transaction(BACKUP_STORE, 'readonly');
        const req = tx.objectStore(BACKUP_STORE).getAll();
        req.onsuccess = () => resolve((req.result || []).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))));
        req.onerror = () => reject(req.error);
      });
    } finally { database.close(); }
  }

  async function createAutomaticBackup(snapshot, reason = 'autosave') {
    if (!snapshot || typeof snapshot !== 'object') return;
    const database = await openBackupDB();
    try {
      await new Promise((resolve, reject) => {
        const tx = database.transaction(BACKUP_STORE, 'readwrite');
        tx.objectStore(BACKUP_STORE).add({
          createdAt: new Date().toISOString(),
          reason,
          version: APP_VERSION,
          data: clone(snapshot)
        });
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
      });
    } finally { database.close(); }

    const backups = await listBackups();
    if (backups.length > MAX_BACKUPS) {
      const database2 = await openBackupDB();
      try {
        await new Promise((resolve, reject) => {
          const tx = database2.transaction(BACKUP_STORE, 'readwrite');
          const store = tx.objectStore(BACKUP_STORE);
          backups.slice(MAX_BACKUPS).forEach(item => store.delete(item.id));
          tx.oncomplete = resolve;
          tx.onerror = () => reject(tx.error);
        });
      } finally { database2.close(); }
    }
    updateBackupPanel();
  }

  function scheduleBackup(snapshot) {
    clearTimeout(backupTimer);
    backupTimer = setTimeout(() => {
      createAutomaticBackup(snapshot, 'autosave').catch(error => console.error('Backup otomatis gagal:', error));
    }, 1200);
  }

  async function restoreSnapshot(snapshot, label = 'backup') {
    if (!snapshot || typeof snapshot !== 'object') throw new Error('Isi backup tidak valid.');
    if (typeof window.db === 'undefined') throw new Error('Database aplikasi belum siap.');
    window.db = clone(snapshot);
    // Global `let db` may not be writable through window in every browser; use an app helper when present.
    try { db = clone(snapshot); } catch {}
    if (typeof normalizeSettings === 'function') normalizeSettings();
    if (window.ShiroganeStorage?.saveDB) await window.ShiroganeStorage.saveDB(clone(snapshot));
    else localStorage.setItem('shirogane-db', JSON.stringify(snapshot));
    if (typeof renderAll === 'function') renderAll();
    if (typeof toast === 'function') toast(`Data berhasil dipulihkan dari ${label}.`);
    setTimeout(() => location.reload(), 550);
  }

  async function restoreLatestBackup() {
    const backups = await listBackups();
    if (!backups.length) {
      if (typeof toast === 'function') toast('Belum ada backup otomatis.');
      return;
    }
    const latest = backups[0];
    const when = new Date(latest.createdAt).toLocaleString('id-ID');
    if (!confirm(`Pulihkan backup otomatis terakhir?\n\nTanggal: ${when}\n\nData saat ini akan diganti.`)) return;
    await restoreSnapshot(latest.data, `backup ${when}`);
  }

  function downloadCurrentBackup() {
    const snapshot = typeof db !== 'undefined' ? clone(db) : null;
    if (!snapshot) return;
    const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `shirogane-backup-${new Date().toISOString().slice(0,10)}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function ensureUpdateModal() {
    let modal = document.getElementById('sgUpdateModal');
    if (modal) return modal;
    document.body.insertAdjacentHTML('beforeend', `
      <div id="sgUpdateModal" class="sg-system-modal" aria-hidden="true">
        <div class="sg-system-card" role="dialog" aria-modal="true">
          <div class="sg-system-icon">↻</div>
          <h2>Versi baru tersedia</h2>
          <p id="sgUpdateText">Pembaruan SHIROGANE siap dipasang.</p>
          <div class="sg-system-actions">
            <button id="sgUpdateLater" class="secondary">Nanti</button>
            <button id="sgUpdateNow" class="primary">Perbarui Sekarang</button>
          </div>
        </div>
      </div>`);
    modal = document.getElementById('sgUpdateModal');
    document.getElementById('sgUpdateLater').onclick = () => {
      if (availableVersion) sessionStorage.setItem('shirogane-update-later', availableVersion);
      modal.classList.remove('show');
      modal.setAttribute('aria-hidden', 'true');
    };
    document.getElementById('sgUpdateNow').onclick = async () => {
      const button = document.getElementById('sgUpdateNow');
      button.disabled = true;
      button.textContent = 'Memperbarui...';
      try {
        if ('serviceWorker' in navigator) {
          const regs = await navigator.serviceWorker.getRegistrations();
          await Promise.all(regs.map(reg => reg.unregister()));
        }
        if ('caches' in window) {
          const keys = await caches.keys();
          await Promise.all(keys.map(key => caches.delete(key)));
        }
      } catch {}
      // Remember which version is expected. The new script clears this marker
      // after it is actually loaded, preventing an endless update loop.
      if (availableVersion) localStorage.setItem('shirogane-update-target', availableVersion);
      const url = new URL(location.href);
      url.searchParams.set('v', availableVersion || Date.now().toString());
      url.searchParams.set('update', Date.now().toString());
      location.replace(url.toString());
    };
    return modal;
  }

  function compareVersions(a, b) {
    const pa = String(a).split('.').map(Number);
    const pb = String(b).split('.').map(Number);
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
      const diff = (pa[i] || 0) - (pb[i] || 0);
      if (diff) return diff;
    }
    return 0;
  }

  async function checkForUpdate(silent = true) {
    if (updateChecked && silent) return;
    updateChecked = true;
    try {
      const response = await fetch(`public-version.json?t=${Date.now()}`, { cache: 'no-store' });
      if (!response.ok) throw new Error('Versi publik tidak dapat dibaca.');
      const info = await response.json();
      const remoteVersion = String(info.version || '').trim();
      if (!remoteVersion) throw new Error('Nomor versi publik tidak valid.');

      // If this JavaScript version has really loaded, clear any old update marker.
      const target = localStorage.getItem('shirogane-update-target');
      if (target && compareVersions(APP_VERSION, target) >= 0) {
        localStorage.removeItem('shirogane-update-target');
      }

      if (compareVersions(remoteVersion, APP_VERSION) <= 0) {
        availableVersion = null;
        sessionStorage.removeItem('shirogane-update-later');
        if (!silent && typeof toast === 'function') toast(`Aplikasi sudah versi terbaru (v${APP_VERSION}).`);
        return;
      }

      availableVersion = remoteVersion;
      if (silent && sessionStorage.getItem('shirogane-update-later') === remoteVersion) return;
      const modal = ensureUpdateModal();
      const notes = info.notes ? `<br><small>${String(info.notes).replace(/[<>]/g, '')}</small>` : '';
      document.getElementById('sgUpdateText').innerHTML = `Versi <b>${remoteVersion}</b> tersedia.${notes}`;
      modal.classList.add('show');
      modal.setAttribute('aria-hidden', 'false');
    } catch (error) {
      console.warn('Pemeriksaan update gagal:', error);
      if (!silent && typeof toast === 'function') toast('Belum dapat memeriksa update.');
    }
  }

  async function updateBackupPanel() {
    const status = document.getElementById('sgBackupStatus');
    if (!status) return;
    try {
      const backups = await listBackups();
      status.textContent = backups.length
        ? `${backups.length} backup tersimpan • terakhir ${new Date(backups[0].createdAt).toLocaleString('id-ID')}`
        : 'Backup otomatis akan dibuat setelah data disimpan.';
    } catch { status.textContent = 'Status backup belum tersedia.'; }
  }

  function injectStabilityPanel() {
    const page = document.getElementById('page-settings');
    if (!page || document.getElementById('sgStabilityPanel')) return;
    const panel = document.createElement('div');
    panel.id = 'sgStabilityPanel';
    panel.className = 'panel sg-stability-panel';
    panel.innerHTML = `
      <div class="sg-stability-head">
        <div><h2>Keamanan Data & Pembaruan</h2><p>Backup otomatis aktif dan disimpan di perangkat ini.</p></div>
        <span class="sg-version-badge">v${APP_VERSION}</span>
      </div>
      <div id="sgBackupStatus" class="sg-backup-status">Memeriksa backup...</div>
      <div class="sg-stability-actions">
        <button class="btn primary" id="sgRestoreLatest">Pulihkan Backup Terakhir</button>
        <button class="btn" id="sgDownloadBackup">Unduh Backup Sekarang</button>
        <button class="btn" id="sgChooseBackup">Restore dari File</button>
        <button class="btn" id="sgCheckUpdate">Cek Update</button>
      </div>`;
    page.prepend(panel);
    document.getElementById('sgRestoreLatest').onclick = () => restoreLatestBackup().catch(error => alert(error.message));
    document.getElementById('sgDownloadBackup').onclick = downloadCurrentBackup;
    document.getElementById('sgChooseBackup').onclick = () => document.getElementById('restoreInput')?.click();
    document.getElementById('sgCheckUpdate').onclick = () => checkForUpdate(false);
    updateBackupPanel();
  }

  function installPanelObserver() {
    const page = document.getElementById('page-settings');
    if (!page) return;
    const observer = new MutationObserver(() => injectStabilityPanel());
    observer.observe(page, { childList: true });
    injectStabilityPanel();
  }

  window.addEventListener('shirogane:data-saved', event => scheduleBackup(event.detail?.snapshot));
  window.addEventListener('load', () => {
    installPanelObserver();
    setTimeout(() => checkForUpdate(true), 1800);
    // First safety snapshot after storage initialization.
    Promise.resolve(window.SHIROGANE_STORAGE_READY).then(() => {
      try { if (typeof db !== 'undefined') createAutomaticBackup(clone(db), 'startup'); } catch {}
    });
  });

  // Expose only the operations needed by the UI.
  window.ShiroganeStability = { checkForUpdate, restoreLatestBackup, createAutomaticBackup, version: APP_VERSION };
})();
