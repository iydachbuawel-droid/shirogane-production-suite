(() => {
  'use strict';

  const TABLE = 'shirogane_app_state';
  const IMAGE_BUCKET = 'shirogane-images';
  const DELETE_QUEUE_KEY = 'shirogane-cloud-image-delete-queue';
  const DIRTY_KEY = 'shirogane-cloud-local-dirty';
  const META_KEY = 'shirogane-cloud-meta';
  const AUTH_VERSION = '1.8.1';
  const cfg = window.SHIROGANE_CLOUD_CONFIG || {};
  let client = null;
  let session = null;
  let syncTimer = null;
  let syncing = false;
  let suppressPush = false;
  let realtimeChannel = null;
  let localDirty = localStorage.getItem(DIRTY_KEY) === '1';
  let lastMessage = 'Cloud belum dikonfigurasi';

  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const localHasData = state => !!(state && ((state.orders?.length || 0) + (state.trash?.length || 0) + (state.activity?.length || 0) > 0));
  const readMeta = () => { try { return JSON.parse(localStorage.getItem(META_KEY) || '{}'); } catch { return {}; } };
  const writeMeta = meta => localStorage.setItem(META_KEY, JSON.stringify(meta));

  function addStyles() {
    if (document.getElementById('shiroganeCloudStyles')) return;
    const style = document.createElement('style');
    style.id = 'shiroganeCloudStyles';
    style.textContent = `
      .sg-cloud-fab{position:fixed;right:18px;bottom:18px;z-index:9998;border:0;border-radius:999px;padding:11px 16px;background:#111827;color:#fff;box-shadow:0 8px 28px rgba(0,0,0,.22);font:600 13px system-ui;cursor:pointer}
      .sg-cloud-fab.online{background:#166534}.sg-cloud-fab.busy{background:#92400e}
      .sg-cloud-modal{position:fixed;inset:0;z-index:100000;background:rgba(15,23,42,.72);display:flex;align-items:center;justify-content:center;padding:20px}
      .sg-cloud-card{width:min(440px,100%);max-height:calc(100vh - 32px);overflow:auto;background:#fff;border-radius:20px;padding:24px;box-shadow:0 24px 80px rgba(0,0,0,.35);font-family:system-ui;color:#111827}
      .sg-cloud-card h2{margin:0 0 6px}.sg-cloud-card p{color:#64748b;line-height:1.5}.sg-cloud-card input{box-sizing:border-box;width:100%;padding:12px 14px;margin:7px 0;border:1px solid #cbd5e1;border-radius:12px;font-size:15px}
      .sg-cloud-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px}.sg-cloud-actions button{border:0;border-radius:11px;padding:10px 14px;cursor:pointer;font-weight:700}.sg-cloud-primary{background:#111827;color:#fff}.sg-cloud-secondary{background:#e2e8f0;color:#111827}.sg-cloud-danger{background:#b91c1c;color:#fff}
      .sg-cloud-msg{min-height:20px;margin-top:10px;font-size:13px;color:#b91c1c}.sg-cloud-status{font-size:12px;color:#64748b;margin-top:8px}.sg-cloud-link{display:inline-flex;border:0;background:transparent;color:#1d4ed8;padding:12px 2px 2px;cursor:pointer;font-weight:800;text-decoration:underline;font-size:14px}.sg-cloud-password-row{position:relative}.sg-cloud-password-row input{padding-right:52px}.sg-cloud-eye{position:absolute;right:8px;top:14px;border:0;background:transparent;cursor:pointer;font-size:18px;padding:6px}
    `;
    document.head.appendChild(style);
  }

  function setStatus(text, mode = '') {
    lastMessage = text;
    const btn = document.getElementById('sgCloudButton');
    if (btn) {
      btn.textContent = `☁ ${text}`;
      btn.className = `sg-cloud-fab ${mode}`;
    }
    const side = document.getElementById('storageStatus');
    const sideText = document.getElementById('storageStatusText');
    if (side && sideText) {
      let label = text;
      if (/^Tersinkron$/i.test(text)) label = 'Online • Tersinkron';
      else if (/Menyimpan|Mengambil|Memeriksa|Sinkron/i.test(text) && !/Gagal/i.test(text)) label = `Menyinkronkan • ${text}`;
      else if (/Login/i.test(text)) label = 'Cloud • Login diperlukan';
      else if (/Gagal|Offline|Library/i.test(text)) label = `Offline • Data aman di perangkat`;
      sideText.textContent = label;
      side.dataset.mode = mode || (/Gagal|Offline/i.test(text) ? 'offline' : '');
    }
  }

  function ensureButton() {
    if (document.getElementById('sgCloudButton')) return;
    const btn = document.createElement('button');
    btn.id = 'sgCloudButton';
    btn.className = 'sg-cloud-fab';
    btn.textContent = `☁ ${lastMessage}`;
    btn.onclick = () => session ? openAccountModal() : openLoginModal();
    document.body.appendChild(btn);
  }

  function modal(html) {
    closeModal();
    const wrap = document.createElement('div');
    wrap.id = 'sgCloudModal';
    wrap.className = 'sg-cloud-modal';
    wrap.innerHTML = `<div class="sg-cloud-card">${html}</div>`;
    wrap.addEventListener('click', e => { if (e.target === wrap) closeModal(); });
    document.body.appendChild(wrap);
    return wrap;
  }

  function closeModal() { document.getElementById('sgCloudModal')?.remove(); }
  window.closeShiroganeCloudModal = closeModal;

  function configReady() {
    return /^https:\/\/.+\.supabase\.co$/.test(cfg.url || '') && String(cfg.anonKey || '').length > 30;
  }

  function openConfigModal() {
    const wrap = modal(`
      <h2>Aktifkan Cloud SHIROGANE</h2>
      <p>Project Supabase sudah terpasang. Masukkan hanya <b>Publishable/anon key</b>. Jangan pernah memasukkan service_role key.</p>
      <input id="sgAnonKey" type="password" placeholder="Publishable / anon key">
      <div class="sg-cloud-actions"><button class="sg-cloud-primary" id="sgSaveKey">Simpan & Aktifkan</button></div>
      <div class="sg-cloud-msg" id="sgCloudMsg"></div>
    `);
    wrap.querySelector('#sgSaveKey').onclick = () => {
      const key = wrap.querySelector('#sgAnonKey').value.trim();
      if (key.length < 30) return wrap.querySelector('#sgCloudMsg').textContent = 'Key belum benar.';
      cfg.anonKey = key;
      localStorage.setItem('shirogane-supabase-anon-key', key);
      closeModal();
      initClient();
    };
  }

  function openLoginModal() {
    if (!client) return openConfigModal();
    const wrap = modal(`
      <h2>Login Cloud SHIROGANE</h2>
      <p>Gunakan akun yang sama di Windows, Android, dan iPhone agar datanya sama.</p>
      <input id="sgEmail" type="email" autocomplete="email" placeholder="Email">
      <div class="sg-cloud-password-row"><input id="sgPassword" type="password" autocomplete="current-password" placeholder="Password minimal 6 karakter"><button class="sg-cloud-eye" id="sgTogglePassword" type="button" title="Tampilkan password">👁</button></div>
      <div class="sg-cloud-actions">
        <button class="sg-cloud-primary" id="sgLogin">Masuk</button>
        <button class="sg-cloud-secondary" id="sgSignup">Buat Akun</button>
      </div>
      <button class="sg-cloud-link" id="sgForgot" type="button">Lupa Password?</button>
      <div class="sg-cloud-msg" id="sgCloudMsg"></div>
    `);
    const msg = wrap.querySelector('#sgCloudMsg');
    const emailInput = wrap.querySelector('#sgEmail');
    const passwordInput = wrap.querySelector('#sgPassword');
    const credentials = () => ({ email: emailInput.value.trim(), password: passwordInput.value });
    wrap.querySelector('#sgTogglePassword').onclick = () => {
      const show = passwordInput.type === 'password';
      passwordInput.type = show ? 'text' : 'password';
      wrap.querySelector('#sgTogglePassword').textContent = show ? '🙈' : '👁';
    };
    wrap.querySelector('#sgForgot').onclick = () => openForgotPasswordModal(emailInput.value.trim());
    wrap.querySelector('#sgLogin').onclick = async () => {
      msg.textContent = 'Memeriksa akun...';
      const { error } = await client.auth.signInWithPassword(credentials());
      msg.textContent = error ? friendlyAuthError(error) : '';
      if (!error) closeModal();
    };
    wrap.querySelector('#sgSignup').onclick = async () => {
      msg.textContent = 'Membuat akun...';
      const { error } = await client.auth.signUp(credentials());
      msg.textContent = error ? friendlyAuthError(error) : 'Akun dibuat. Jika diminta, konfirmasi email lalu masuk.';
    };
  }

  function appBaseUrl() {
    const url = new URL(window.location.href);
    url.hash = '';
    url.search = '';
    if (!url.pathname.endsWith('/')) url.pathname = url.pathname.replace(/[^/]+$/, '');
    return url.toString();
  }

  function hasRecoveryParameters() {
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const query = new URLSearchParams(window.location.search);
    return hash.get('type') === 'recovery' || query.get('type') === 'recovery' ||
      hash.has('access_token') || query.has('code');
  }

  function cleanRecoveryUrl() {
    try{history.replaceState(null,'',appBaseUrl());}catch{}
  }

  function friendlyAuthError(error) {
    const text = String(error?.message || error || 'Terjadi kesalahan.');
    if (/invalid login credentials/i.test(text)) return 'Email atau password salah.';
    if (/email not confirmed/i.test(text)) return 'Email belum dikonfirmasi. Periksa kotak masuk email.';
    if (/user already registered/i.test(text)) return 'Email ini sudah terdaftar. Silakan masuk.';
    if (/password/i.test(text) && /characters/i.test(text)) return 'Password minimal 6 karakter.';
    return text;
  }

  function openForgotPasswordModal(prefill = '') {
    if (!client) return openConfigModal();
    const wrap = modal(`
      <h2>Lupa Password</h2>
      <p>Masukkan email akun Cloud SHIROGANE. Link ganti password akan dikirim ke email tersebut.</p>
      <input id="sgResetEmail" type="email" autocomplete="email" placeholder="Email" value="${escapeHtml(prefill)}">
      <div class="sg-cloud-actions">
        <button class="sg-cloud-primary" id="sgSendReset">Kirim Link Reset</button>
        <button class="sg-cloud-secondary" id="sgBackLogin">Kembali</button>
      </div>
      <div class="sg-cloud-msg" id="sgCloudMsg"></div>
    `);
    const msg = wrap.querySelector('#sgCloudMsg');
    wrap.querySelector('#sgBackLogin').onclick = openLoginModal;
    wrap.querySelector('#sgSendReset').onclick = async () => {
      const email = wrap.querySelector('#sgResetEmail').value.trim();
      if (!email) return msg.textContent = 'Masukkan email terlebih dahulu.';
      msg.style.color = '#64748b';
      msg.textContent = 'Mengirim email reset...';
      const redirectTo = appBaseUrl();
      const { error } = await client.auth.resetPasswordForEmail(email, { redirectTo });
      if (error) {
        msg.style.color = '#b91c1c';
        msg.textContent = friendlyAuthError(error);
      } else {
        msg.style.color = '#166534';
        msg.textContent = 'Link reset sudah dikirim. Buka email terbaru lalu klik tautannya.';
      }
    };
  }

  function openNewPasswordModal() {
    if (!client) return;
    const wrap = modal(`
      <h2>Ganti Password</h2>
      <p>Buat password baru untuk akun Cloud SHIROGANE.</p>
      <div class="sg-cloud-password-row"><input id="sgNewPassword" type="password" autocomplete="new-password" placeholder="Password baru minimal 6 karakter"><button class="sg-cloud-eye" id="sgToggleNewPassword" type="button">👁</button></div>
      <div class="sg-cloud-password-row"><input id="sgConfirmPassword" type="password" autocomplete="new-password" placeholder="Ulangi password baru"><button class="sg-cloud-eye" id="sgToggleConfirmPassword" type="button">👁</button></div>
      <div class="sg-cloud-actions">
        <button class="sg-cloud-primary" id="sgSavePassword">Simpan Password</button>
      </div>
      <div class="sg-cloud-msg" id="sgCloudMsg"></div>
    `);
    const msg = wrap.querySelector('#sgCloudMsg');
    const p1 = wrap.querySelector('#sgNewPassword');
    const p2 = wrap.querySelector('#sgConfirmPassword');
    const toggle = (input, button) => {
      const show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      button.textContent = show ? '🙈' : '👁';
    };
    wrap.querySelector('#sgToggleNewPassword').onclick = e => toggle(p1, e.currentTarget);
    wrap.querySelector('#sgToggleConfirmPassword').onclick = e => toggle(p2, e.currentTarget);
    wrap.querySelector('#sgSavePassword').onclick = async () => {
      if (p1.value.length < 6) return msg.textContent = 'Password minimal 6 karakter.';
      if (p1.value !== p2.value) return msg.textContent = 'Ulangi password belum sama.';
      msg.style.color = '#64748b';
      msg.textContent = 'Menyimpan password baru...';
      const { error } = await client.auth.updateUser({ password: p1.value });
      if (error) {
        msg.style.color = '#b91c1c';
        msg.textContent = friendlyAuthError(error);
        return;
      }
      msg.style.color = '#166534';
      msg.textContent = 'Password berhasil diubah. Silakan masuk memakai password baru.';
      setTimeout(async () => {
        await client.auth.signOut();
        cleanRecoveryUrl();
        openLoginModal();
      }, 1200);
    };
  }

  function openAccountModal() {
    const email = session?.user?.email || '-';
    const wrap = modal(`
      <h2>Cloud SHIROGANE</h2>
      <p>Akun: <b>${escapeHtml(email)}</b></p>
      <div class="sg-cloud-actions">
        <button class="sg-cloud-primary" id="sgSyncNow">Sinkronkan Sekarang</button>
        <button class="sg-cloud-secondary" id="sgPullCloud">Ambil dari Cloud</button>
        <button class="sg-cloud-secondary" id="sgPushCloud">Kirim Data Perangkat</button>
        <button class="sg-cloud-danger" id="sgLogout">Keluar</button>
      </div>
      <div class="sg-cloud-status">${escapeHtml(lastMessage)}</div>
      <div class="sg-cloud-msg" id="sgCloudMsg"></div>
    `);
    const msg = wrap.querySelector('#sgCloudMsg');
    wrap.querySelector('#sgSyncNow').onclick = async () => { msg.textContent = await smartSync(true); };
    wrap.querySelector('#sgPullCloud').onclick = async () => { msg.textContent = await pullCloud(true); };
    wrap.querySelector('#sgPushCloud').onclick = async () => { msg.textContent = await pushCloud(true); };
    wrap.querySelector('#sgLogout').onclick = async () => { await client.auth.signOut(); closeModal(); };
  }

  function escapeHtml(value = '') {
    return String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }


  function dataUrlToBlob(dataUrl) {
    const parts = String(dataUrl || '').split(',');
    if (parts.length < 2) return null;
    const mime = (parts[0].match(/data:([^;]+)/) || [])[1] || 'image/webp';
    const bin = atob(parts[1]);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Blob([bytes], { type: mime });
  }

  function publicImageUrl(path) {
    if (!client || !path) return '';
    try {
      const { data } = client.storage.from(IMAGE_BUCKET).getPublicUrl(path);
      return data?.publicUrl || '';
    } catch { return ''; }
  }

  async function uploadBusinessLogo(dataUrl = db?.settings?.logo) {
    if (!session || !db?.settings) return db?.settings?.logo || '';
    if (!String(dataUrl || '').startsWith('data:image/')) {
      if (db.settings.logoCloudPath) {
        const publicUrl = publicImageUrl(db.settings.logoCloudPath);
        if (publicUrl) {
          db.settings.logoCloudUrl = publicUrl;
          db.settings.logo = publicUrl;
        }
      }
      return db.settings.logo || '';
    }

    const blob = dataUrlToBlob(dataUrl);
    if (!blob) return db.settings.logo || '';
    const ext = blob.type.includes('png') ? 'png' : blob.type.includes('jpeg') ? 'jpg' : 'webp';
    const oldPath = db.settings.logoCloudPath || '';
    const path = `${session.user.id}/business-logo.${ext}`;
    const { error } = await client.storage.from(IMAGE_BUCKET).upload(path, blob, {
      upsert: true,
      contentType: blob.type,
      cacheControl: '3600'
    });
    if (error) throw error;
    if (oldPath && oldPath !== path) {
      try { await client.storage.from(IMAGE_BUCKET).remove([oldPath]); } catch {}
    }
    const publicUrl = publicImageUrl(path);
    db.settings.logoCloudPath = path;
    db.settings.logoCloudUrl = publicUrl || '';
    if (publicUrl) db.settings.logo = `${publicUrl}?v=${Date.now()}`;
    return db.settings.logo || '';
  }

  async function prepareBusinessLogoForCloud() {
    if (!db?.settings) return;
    if (String(db.settings.logo || '').startsWith('data:image/')) {
      await uploadBusinessLogo(db.settings.logo);
      return;
    }
    if (db.settings.logoCloudPath) {
      const publicUrl = publicImageUrl(db.settings.logoCloudPath);
      if (publicUrl) {
        db.settings.logoCloudUrl = publicUrl;
        db.settings.logo = publicUrl;
      }
    }
  }

  async function uploadOneImage(image) {
    if (!session || !image) return image;

    // Jika gambar sudah ada di Storage, selalu bangun kembali URL publiknya.
    // image.data tetap diisi URL untuk kompatibilitas dengan SHIROGANE PC lama
    // yang membaca image.data, bukan image.url/path.
    if (image.path) {
      const publicUrl = publicImageUrl(image.path);
      if (publicUrl) {
        image.url = publicUrl;
        image.data = publicUrl;
      }
      if (!String(image.data || '').startsWith('data:image/')) return image;
    }

    if (!String(image.data || '').startsWith('data:image/')) return image;
    const blob = dataUrlToBlob(image.data);
    if (!blob) return image;
    const ext = blob.type.includes('png') ? 'png' : blob.type.includes('jpeg') ? 'jpg' : 'webp';
    const path = `${session.user.id}/${image.id || crypto.randomUUID()}.${ext}`;
    const { error } = await client.storage.from(IMAGE_BUCKET).upload(path, blob, { upsert: true, contentType: blob.type, cacheControl: '31536000' });
    if (error) throw error;
    image.path = path;
    const publicUrl = publicImageUrl(path);
    if (publicUrl) {
      image.url = publicUrl;
      image.data = publicUrl;
    }
    return image;
  }

  async function prepareImagesForCloud() {
    await prepareBusinessLogoForCloud();
    for (const collectionName of ['orders', 'trash']) {
      for (const order of (db?.[collectionName] || [])) {
        for (const image of (order.images || [])) await uploadOneImage(image);
      }
    }
  }

  function cloudStateFromLocal() {
    const state = structuredClone(db || {});
    if (state.settings) {
      const logoPath = state.settings.logoCloudPath || '';
      const sourceLogo = String(state.settings.logoCloudUrl || state.settings.logo || '');
      const durableLogoUrl = logoPath ? publicImageUrl(logoPath) : (/^https?:\/\//i.test(sourceLogo) ? sourceLogo : '');
      state.settings.logoCloudPath = logoPath;
      state.settings.logoCloudUrl = durableLogoUrl;
      state.settings.logo = durableLogoUrl;
    }
    for (const collectionName of ['orders', 'trash']) {
      for (const order of (state[collectionName] || [])) {
        order.images = (order.images || []).map(image => {
          const copy = { ...image };
          delete copy.original;

          // Jangan kirim base64 ke database cloud. Tetapi pertahankan URL Storage
          // pada BOTH data + url agar Android baru dan PC lama membaca gambar sama.
          const durableUrl = copy.path ? publicImageUrl(copy.path) : (/^https?:\/\//i.test(String(copy.url || copy.data || '')) ? String(copy.url || copy.data) : '');
          copy.url = durableUrl;
          copy.data = durableUrl;
          return copy;
        });
      }
    }
    return state;
  }


  async function hydrateCloudState(state) {
    const result = structuredClone(state || {});
    if (result.settings) {
      const path = result.settings.logoCloudPath || '';
      if (path) {
        const publicUrl = publicImageUrl(path);
        if (publicUrl) {
          result.settings.logoCloudUrl = publicUrl;
          result.settings.logo = publicUrl;
        }
      } else if (/^https?:\/\//i.test(String(result.settings.logoCloudUrl || ''))) {
        result.settings.logo = result.settings.logoCloudUrl;
      }
    }
    const all = [];
    for (const collectionName of ['orders', 'trash']) {
      for (const order of (result[collectionName] || [])) {
        for (const image of (order.images || [])) if (image?.path) all.push(image);
      }
    }
    await Promise.all(all.map(async image => {
      // v3.0.11 memakai bucket public agar URL gambar permanen dan bisa dibaca PC.
      const publicUrl = publicImageUrl(image.path);
      if (publicUrl) {
        image.url = publicUrl;
        image.data = publicUrl;
        return;
      }
      // Fallback untuk bucket lama/private selama migrasi belum dijalankan.
      const { data, error } = await client.storage.from(IMAGE_BUCKET).createSignedUrl(image.path, 60 * 60 * 24 * 7);
      if (!error && data?.signedUrl) {
        image.url = data.signedUrl;
        image.data = data.signedUrl;
      }
    }));
    return result;
  }

  function readDeleteQueue() {
    try { return JSON.parse(localStorage.getItem(DELETE_QUEUE_KEY) || '[]'); } catch { return []; }
  }
  function writeDeleteQueue(list) { localStorage.setItem(DELETE_QUEUE_KEY, JSON.stringify([...new Set(list.filter(Boolean))])); }
  function queueImageDeletes(images = []) {
    const paths = images.map(x => x?.path).filter(Boolean);
    if (!paths.length) return;
    writeDeleteQueue(readDeleteQueue().concat(paths));
    flushImageDeletes().catch(() => {});
  }
  async function flushImageDeletes() {
    if (!client || !session || !navigator.onLine) return;
    const paths = readDeleteQueue();
    if (!paths.length) return;
    const { error } = await client.storage.from(IMAGE_BUCKET).remove(paths);
    if (!error) writeDeleteQueue([]);
  }

  async function startRealtime() {
    if (!client || !session) return;
    if (realtimeChannel) { try { await client.removeChannel(realtimeChannel); } catch {} realtimeChannel = null; }
    realtimeChannel = client.channel(`shirogane-${session.user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: TABLE, filter: `user_id=eq.${session.user.id}` }, async payload => {
        const remoteUpdated = payload?.new?.updated_at || '';
        const meta = readMeta();
        if (syncing || (remoteUpdated && meta.updatedAt === remoteUpdated)) return;
        if (localDirty) { setStatus('Konflik • buka Cloud', 'busy'); return; }
        await pullCloud(true, true);
      })
      .subscribe();
  }

  async function fetchCloudRow() {
    if (!session) return { data: null, error: new Error('Belum login') };
    return client.from(TABLE).select('state,updated_at').eq('user_id', session.user.id).maybeSingle();
  }

  async function pushCloud(showToast = false) {
    if (!session || syncing) return 'Cloud belum siap.';
    if(window.SHIROGANE_STORAGE_READY) await window.SHIROGANE_STORAGE_READY;
    syncing = true; setStatus('Menyimpan...', 'busy');
    try {
      await prepareImagesForCloud();
      if (window.ShiroganeStorage) await window.ShiroganeStorage.saveDB(db);
      await flushImageDeletes();
      const payload = cloudStateFromLocal();
      const { data, error } = await client.from(TABLE).upsert({ user_id: session.user.id, state: payload }, { onConflict: 'user_id' }).select('updated_at').single();
      if (error) throw error;
      writeMeta({ updatedAt: data.updated_at, userId: session.user.id });
      localDirty = false; localStorage.removeItem(DIRTY_KEY);
      setStatus('Tersinkron', 'online');
      if (showToast && typeof toast === 'function') toast('Data berhasil dikirim ke cloud.');
      return 'Data perangkat berhasil dikirim ke cloud.';
    } catch (err) {
      console.error('Cloud push gagal:', err);
      setStatus('Gagal sinkron');
      return `Gagal mengirim: ${err.message || err}`;
    } finally { syncing = false; }
  }

  async function pullCloud(force = false, fromRealtime = false) {
    if (!session || syncing) return 'Cloud belum siap.';
    syncing = true; setStatus('Mengambil...', 'busy');
    try {
      const { data, error } = await fetchCloudRow();
      if (error) throw error;
      if (!data?.state) {
        setStatus('Cloud kosong', 'online');
        return 'Belum ada data di cloud.';
      }
      if (!force && localHasData(db)) return 'Data lokal tidak ditimpa otomatis.';
      suppressPush = true;
      const hydratedState = await hydrateCloudState(data.state);
      db = window.ShiroganeStorage?.mergeMissingImages ? window.ShiroganeStorage.mergeMissingImages(db, hydratedState) : hydratedState;
      if (typeof normalizeSettings === 'function') normalizeSettings();
      if(typeof save==='function') save(); else if(window.ShiroganeStorage) window.ShiroganeStorage.saveDB(db).catch(console.error);
      suppressPush = false;
      writeMeta({ updatedAt: data.updated_at, userId: session.user.id });
      if (typeof renderAll === 'function') renderAll();
      setStatus('Tersinkron', 'online');
      if (typeof toast === 'function') toast('Data cloud berhasil dimuat.');
      return 'Data cloud berhasil dimuat ke perangkat.';
    } catch (err) {
      console.error('Cloud pull gagal:', err);
      setStatus('Gagal sinkron');
      return `Gagal mengambil: ${err.message || err}`;
    } finally { syncing = false; suppressPush = false; }
  }

  async function smartSync(interactive = false) {
    if (!session) return 'Belum login.';
    const { data, error } = await fetchCloudRow();
    if (error) { setStatus('Gagal sinkron'); return `Gagal membaca cloud: ${error.message}`; }
    if (!data?.state) return pushCloud(interactive);

    const localData = localHasData(db);
    const cloudData = localHasData(data.state);
    const meta = readMeta();

    if (!localData && cloudData) return pullCloud(true);
    if (localData && !cloudData) return pushCloud(interactive);
    if (!localData && !cloudData) return pushCloud(false);

    if (meta.updatedAt && meta.updatedAt === data.updated_at) {
      setStatus('Tersinkron', 'online');
      return 'Data sudah sama.';
    }

    if (!interactive) {
      setStatus('Perlu dipilih', 'busy');
      return 'Ada data di perangkat dan cloud. Buka tombol Cloud untuk memilih.';
    }

    return await conflictModal(data);
  }

  function conflictModal(cloudRow) {
    return new Promise(resolve => {
      const wrap = modal(`
        <h2>Pilih Data Utama</h2>
        <p>Perangkat dan cloud sama-sama memiliki data. Pilih dengan hati-hati. Backup lokal akan dibuat sebelum data ditimpa.</p>
        <div class="sg-cloud-actions">
          <button class="sg-cloud-primary" id="sgKeepLocal">Pakai Data Perangkat</button>
          <button class="sg-cloud-secondary" id="sgKeepCloud">Pakai Data Cloud</button>
          <button class="sg-cloud-secondary" id="sgCancelConflict">Batal</button>
        </div>
      `);
      wrap.querySelector('#sgKeepLocal').onclick = async () => { closeModal(); resolve(await pushCloud(true)); };
      wrap.querySelector('#sgKeepCloud').onclick = async () => {
        try {
          if (typeof downloadJSON === 'function') downloadJSON(db, `backup-sebelum-cloud-${new Date().toISOString().slice(0,10)}.json`);
        } catch {}
        const hydratedState = await hydrateCloudState(cloudRow.state);
        suppressPush = true;
        db = window.ShiroganeStorage?.mergeMissingImages ? window.ShiroganeStorage.mergeMissingImages(db, hydratedState) : hydratedState;
        if (typeof normalizeSettings === 'function') normalizeSettings();
        if(typeof save==='function') save(); else if(window.ShiroganeStorage) window.ShiroganeStorage.saveDB(db).catch(console.error);
        suppressPush = false; localDirty = false; localStorage.removeItem(DIRTY_KEY);
        writeMeta({ updatedAt: cloudRow.updated_at, userId: session.user.id });
        if (typeof renderAll === 'function') renderAll();
        closeModal(); setStatus('Tersinkron', 'online'); resolve('Data cloud dipakai.');
      };
      wrap.querySelector('#sgCancelConflict').onclick = () => { closeModal(); resolve('Dibatalkan.'); };
    });
  }

  function schedulePush() {
    if (!session || suppressPush) return;
    clearTimeout(syncTimer);
    if (!navigator.onLine) { setStatus('Offline'); return; }
    syncTimer = setTimeout(() => pushCloud(false), 350);
  }

  function wrapLocalSave() {
    if (window.__shiroganeSaveWrapped) return;
    window.__shiroganeSaveWrapped = true;
    const localSave = save;
    save = function () {
      localSave();
      if (!suppressPush) { localDirty = true; localStorage.setItem(DIRTY_KEY, '1'); }
      schedulePush();
    };
  }

  async function initClient() {
    cfg.anonKey = cfg.anonKey || localStorage.getItem('shirogane-supabase-anon-key') || '';
    if (!configReady()) {
      setStatus('Aktifkan Cloud');
      return;
    }
    if (!window.supabase?.createClient) {
      setStatus('Library cloud gagal');
      return;
    }
    const recoveryRequested = hasRecoveryParameters();
    client = window.supabase.createClient(cfg.url, cfg.anonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    });
    window.SHIROGANE_CLOUD_CLIENT = client;
    const { data } = await client.auth.getSession();
    session = data.session;
    window.SHIROGANE_CLOUD_SESSION = session;
    client.auth.onAuthStateChange(async (event, newSession) => {
      session = newSession;
      window.SHIROGANE_CLOUD_SESSION = newSession;
      if (event === 'PASSWORD_RECOVERY') {
        setStatus('Ganti Password', 'busy');
        setTimeout(openNewPasswordModal, 50);
        return;
      }
      if (session) {
        setStatus('Memeriksa cloud...', 'busy');
        await sleep(100);
        await smartSync(false);
        await startRealtime();
        await flushImageDeletes();
      } else { if (realtimeChannel) { try { await client.removeChannel(realtimeChannel); } catch {} realtimeChannel = null; } setStatus('Login Cloud'); }
    });
    if (recoveryRequested && session) {
      setStatus('Ganti Password', 'busy');
      setTimeout(openNewPasswordModal, 80);
    } else if (session) {
      await smartSync(false);
      await startRealtime();
      await flushImageDeletes();
    } else {
      setStatus('Login Cloud');
    }
  }


  window.ShiroganeCloud = {
    queueImageDeletes,
    uploadBusinessLogo,
    syncNow: () => smartSync(true),
    pushNow: () => pushCloud(true),
    pullNow: () => pullCloud(true)
  };
  window.addEventListener('offline', () => setStatus('Offline'));
  window.addEventListener('online', async () => {
    if (!session) return setStatus('Login Cloud');
    setStatus('Menyinkronkan...', 'busy');
    await pushCloud(false);
    await startRealtime();
  });

  addStyles();
  ensureButton();
  wrapLocalSave();
  initClient();
})();
