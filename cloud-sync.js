(() => {
  'use strict';

  const TABLE = 'shirogane_app_state';
  const META_KEY = 'shirogane-cloud-meta';
  const cfg = window.SHIROGANE_CLOUD_CONFIG || {};
  let client = null;
  let session = null;
  let syncTimer = null;
  let syncing = false;
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
      .sg-cloud-card{width:min(440px,100%);background:#fff;border-radius:20px;padding:24px;box-shadow:0 24px 80px rgba(0,0,0,.35);font-family:system-ui;color:#111827}
      .sg-cloud-card h2{margin:0 0 6px}.sg-cloud-card p{color:#64748b;line-height:1.5}.sg-cloud-card input{box-sizing:border-box;width:100%;padding:12px 14px;margin:7px 0;border:1px solid #cbd5e1;border-radius:12px;font-size:15px}
      .sg-cloud-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px}.sg-cloud-actions button{border:0;border-radius:11px;padding:10px 14px;cursor:pointer;font-weight:700}.sg-cloud-primary{background:#111827;color:#fff}.sg-cloud-secondary{background:#e2e8f0;color:#111827}.sg-cloud-danger{background:#b91c1c;color:#fff}
      .sg-cloud-msg{min-height:20px;margin-top:10px;font-size:13px;color:#b91c1c}.sg-cloud-status{font-size:12px;color:#64748b;margin-top:8px}.sg-cloud-link{border:0;background:transparent;color:#2563eb;padding:8px 0;cursor:pointer;font-weight:700;text-decoration:underline}.sg-cloud-password-row{position:relative}.sg-cloud-password-row input{padding-right:52px}.sg-cloud-eye{position:absolute;right:8px;top:14px;border:0;background:transparent;cursor:pointer;font-size:18px;padding:6px}
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
    return `${window.location.origin}${window.location.pathname}`.replace(/[^/]+$/, '');
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
        history.replaceState({}, document.title, appBaseUrl());
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

  async function fetchCloudRow() {
    if (!session) return { data: null, error: new Error('Belum login') };
    return client.from(TABLE).select('state,updated_at').eq('user_id', session.user.id).maybeSingle();
  }

  async function pushCloud(showToast = false) {
    if (!session || syncing) return 'Cloud belum siap.';
    syncing = true; setStatus('Menyimpan...', 'busy');
    try {
      const payload = structuredClone(db);
      const { data, error } = await client.from(TABLE).upsert({ user_id: session.user.id, state: payload }, { onConflict: 'user_id' }).select('updated_at').single();
      if (error) throw error;
      writeMeta({ updatedAt: data.updated_at, userId: session.user.id });
      setStatus('Tersinkron', 'online');
      if (showToast && typeof toast === 'function') toast('Data berhasil dikirim ke cloud.');
      return 'Data perangkat berhasil dikirim ke cloud.';
    } catch (err) {
      console.error('Cloud push gagal:', err);
      setStatus('Gagal sinkron');
      return `Gagal mengirim: ${err.message || err}`;
    } finally { syncing = false; }
  }

  async function pullCloud(force = false) {
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
      db = data.state;
      if (typeof normalizeSettings === 'function') normalizeSettings();
      localStorage.setItem('shirogane-db', JSON.stringify(db));
      writeMeta({ updatedAt: data.updated_at, userId: session.user.id });
      if (typeof renderAll === 'function') renderAll();
      setStatus('Tersinkron', 'online');
      if (typeof toast === 'function') toast('Data cloud berhasil dimuat.');
      return 'Data cloud berhasil dimuat ke perangkat.';
    } catch (err) {
      console.error('Cloud pull gagal:', err);
      setStatus('Gagal sinkron');
      return `Gagal mengambil: ${err.message || err}`;
    } finally { syncing = false; }
  }

  async function smartSync(interactive = false) {
    if (!session) return 'Belum login.';
    const { data, error } = await fetchCloudRow();
    if (error) return `Gagal membaca cloud: ${error.message}`;
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
        db = cloudRow.state;
        if (typeof normalizeSettings === 'function') normalizeSettings();
        localStorage.setItem('shirogane-db', JSON.stringify(db));
        writeMeta({ updatedAt: cloudRow.updated_at, userId: session.user.id });
        if (typeof renderAll === 'function') renderAll();
        closeModal(); setStatus('Tersinkron', 'online'); resolve('Data cloud dipakai.');
      };
      wrap.querySelector('#sgCancelConflict').onclick = () => { closeModal(); resolve('Dibatalkan.'); };
    });
  }

  function schedulePush() {
    if (!session) return;
    clearTimeout(syncTimer);
    syncTimer = setTimeout(() => pushCloud(false), 1200);
  }

  function wrapLocalSave() {
    if (window.__shiroganeSaveWrapped) return;
    window.__shiroganeSaveWrapped = true;
    const localSave = save;
    save = function () {
      localSave();
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
      } else setStatus('Login Cloud');
    });
    if (session) await smartSync(false); else setStatus('Login Cloud');
  }

  addStyles();
  ensureButton();
  wrapLocalSave();
  initClient();
})();
