/* SHIROGANE v3.0.2 — robust Android/PWA Back confirmation */
(() => {
  'use strict';

  const stateKey = 'shiroganeExitGuard';
  let armed = false;
  let leaving = false;

  const currentPage = () =>
    document.querySelector('.page.active')?.id?.replace('page-', '') || 'dashboard';

  function ensureModal() {
    let modal = document.getElementById('exitConfirmModal');
    if (modal) return modal;

    document.body.insertAdjacentHTML('beforeend', `
      <div id="exitConfirmModal" class="exit-confirm" aria-hidden="true">
        <div class="exit-confirm-card" role="dialog" aria-modal="true" aria-labelledby="exitConfirmTitle">
          <div class="exit-confirm-icon">S</div>
          <h2 id="exitConfirmTitle">Keluar dari SHIROGANE?</h2>
          <p>Apakah Anda yakin ingin keluar dari aplikasi?</p>
          <small>Semua data yang sudah disimpan tetap aman.</small>
          <div class="exit-confirm-actions">
            <button type="button" class="stay" id="exitStayBtn">Tetap di Aplikasi</button>
            <button type="button" class="leave" id="exitLeaveBtn">Keluar</button>
          </div>
        </div>
      </div>`);

    modal = document.getElementById('exitConfirmModal');
    document.getElementById('exitStayBtn').addEventListener('click', () => {
      hideModal();
      installGuard();
    });
    document.getElementById('exitLeaveBtn').addEventListener('click', () => {
      leaving = true;
      hideModal();
      // Browser/PWA tidak mengizinkan window.close() secara paksa.
      // Kembali melewati sentinel akan menutup PWA atau kembali ke halaman sebelumnya.
      history.back();
      setTimeout(() => {
        try { window.close(); } catch (_) {}
      }, 250);
    });
    modal.addEventListener('click', event => {
      if (event.target === modal) {
        hideModal();
        installGuard();
      }
    });
    return modal;
  }

  function showModal() {
    const modal = ensureModal();
    modal.classList.add('show');
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('exit-confirm-open');
  }

  function hideModal() {
    const modal = document.getElementById('exitConfirmModal');
    if (!modal) return;
    modal.classList.remove('show');
    modal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('exit-confirm-open');
  }

  function installGuard() {
    if (leaving) return;
    history.pushState({ [stateKey]: true, page: currentPage() }, '', location.href);
    armed = true;
  }

  function closeTopLayer() {
    const sidebar = document.querySelector('.sidebar.open');
    if (sidebar) {
      sidebar.classList.remove('open');
      return true;
    }
    const modal = document.querySelector('.modal-backdrop.show');
    if (modal) {
      modal.classList.remove('show');
      modal.setAttribute('aria-hidden', 'true');
      document.body.classList.remove('modal-open');
      return true;
    }
    if (document.getElementById('exitConfirmModal')?.classList.contains('show')) {
      hideModal();
      return true;
    }
    return false;
  }

  window.addEventListener('popstate', () => {
    if (leaving) return;

    if (closeTopLayer()) {
      installGuard();
      return;
    }

    const page = currentPage();
    if (page !== 'dashboard' && typeof window.nav === 'function') {
      window.nav('dashboard', { push: false });
      installGuard();
      return;
    }

    // Dashboard: confirmation appears on the first Back press.
    showModal();
    installGuard();
  });

  function init() {
    if (!('pushState' in history)) return;
    history.replaceState({ ...(history.state || {}), shiroganeRoot: true }, '', location.href);
    installGuard();

    // Re-arm when returning to the foreground if Android discarded history state.
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && !leaving && !armed) installGuard();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
