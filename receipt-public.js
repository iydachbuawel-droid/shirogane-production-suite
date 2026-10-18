(() => {
  'use strict';
  const token = new URLSearchParams(location.search).get('receipt');
  if (!token) return;

  const esc = (value = '') => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const money = value => 'Rp' + Number(value || 0).toLocaleString('id-ID');
  const sizes = ['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL', '5XL'];

  document.documentElement.classList.add('public-receipt-mode');
  document.addEventListener('DOMContentLoaded', () => {
    document.body.innerHTML = '<main id="publicReceiptRoot" class="public-receipt-page"><div class="public-receipt-loading">Memuat nota...</div></main>';
    loadReceipt();
  });

  async function loadReceipt() {
    const root = document.getElementById('publicReceiptRoot');
    try {
      const config = window.SHIROGANE_CLOUD_CONFIG || {};
      if (!config.url || !config.anonKey) throw new Error('Konfigurasi cloud tidak tersedia.');
      const endpoint = `${config.url}/rest/v1/shirogane_public_receipts?token=eq.${encodeURIComponent(token)}&select=payload&limit=1`;
      const response = await fetch(endpoint, {
        headers: { apikey: config.anonKey, Authorization: `Bearer ${config.anonKey}` },
        cache: 'no-store'
      });
      if (!response.ok) throw new Error(`Nota tidak dapat dimuat (${response.status}).`);
      const rows = await response.json();
      if (!rows.length) throw new Error('Nota tidak ditemukan atau link sudah tidak berlaku.');
      renderReceipt(root, rows[0].payload || {});
    } catch (error) {
      root.innerHTML = `<div class="public-receipt-error"><h2>Nota tidak dapat dibuka</h2><p>${esc(error.message || error)}</p></div>`;
    }
  }

  function computeExtraDetails(order) {
    const map = {};
    for (const item of (order.items || [])) {
      const itemSizes = item.sizes || {};
      const rates = { ...((payload.settings && payload.settings.sizeExtras) || {}), ...((item.extras && typeof item.extras === 'object') ? item.extras : {}) };
      for (const size of sizes) {
        const qty = Number(itemSizes[size] || 0);
        const rate = Number(rates[size] || 0);
        const amount = qty * rate;
        if (amount <= 0) continue;
        if (!map[size]) map[size] = { size, qty: 0, rate, amount: 0 };
        map[size].qty += qty;
        map[size].amount += amount;
        if (!map[size].rate) map[size].rate = rate;
      }
    }
    return sizes.filter(size => map[size]).map(size => map[size]);
  }

  function renderReceipt(root, data) {
    const business = data.business || {};
    const order = data.order || {};
    const totals = data.totals || {};
    root.innerHTML = `
      <article class="public-receipt-sheet">
        <header class="public-receipt-head">
          ${business.logo ? `<img src="${business.logo}" alt="Logo" class="public-receipt-logo">` : ''}
          <div><h1>${esc(business.name || 'SHIROGANE')}</h1><p>${esc(business.subtitle || 'Production Suite')}</p><p>${esc(business.address || '')}${business.phone ? ' • ' + esc(business.phone) : ''}</p></div>
        </header>
        <section class="public-receipt-meta"><div><b>No.</b> ${esc(order.invoice || '-')}</div><div><b>Tanggal</b> ${esc(order.date || '-')}</div><div><b>Pelanggan</b> ${esc(order.customer || '-')}</div><div><b>Selesai</b> ${esc(order.dueDate || '-')}</div></section>
        <div class="public-receipt-table-wrap"><table><thead><tr><th>Barang</th>${sizes.map(size => `<th>${size}</th>`).join('')}<th>Qty</th><th>Harga</th><th>Jumlah</th></tr></thead><tbody>${(order.items || []).map(item => {
          const qty = sizes.reduce((sum, size) => sum + (Number((item.sizes || {})[size]) || 0), 0);
          return `<tr><td><b>${esc(item.name || '')}</b></td>${sizes.map(size => `<td>${Number((item.sizes || {})[size]) || ''}</td>`).join('')}<td>${qty}</td><td>${money(item.price)}</td><td>${money(qty * Number(item.price || 0))}</td></tr>`;
        }).join('')}</tbody></table></div>
        <section class="public-receipt-summary">
          <div><span>Subtotal barang (${Number(totals.qty || 0)} pcs)</span><b>${money(totals.subtotal)}</b></div>
          ${(() => {
            const details = computeExtraDetails(order);
            return details.length
              ? `<div class="extra-title">Rincian tambahan ukuran</div>` +
                details.map(x => `<div class="extra-detail"><span>Ukuran ${esc(x.size)}: ${Number(x.qty || 0)} pcs × ${money(x.rate)}</span><b>${money(x.amount)}</b></div>`).join('') +
                `<div class="extra-detail extra-total"><span>Total tambahan ukuran</span><b>${money(totals.extra)}</b></div>`
              : `<div class="extra-detail"><span>Tambahan ukuran</span><b>${money(0)}</b></div>`;
          })()}
          <div><span>Diskon</span><b>-${money(totals.discount)}</b></div>
          <div class="total"><span>Total Tagihan</span><b>${money(totals.total)}</b></div>
          <div><span>Panjar</span><b>${money(totals.deposit)}</b></div>
          <div class="balance"><span>Sisa Pembayaran</span><b>${money(totals.balance)}</b></div>
        </section>
        ${(business.account || business.accountName) ? `<section class="public-receipt-bank"><small>Transfer ke ${esc(business.bank || 'Bank')}</small><strong>${esc(business.account || '-')}</strong><span>a.n. ${esc(business.accountName || '-')}</span></section>` : ''}
        ${order.notes ? `<p class="public-receipt-note"><b>Catatan:</b> ${esc(order.notes)}</p>` : ''}
        ${(order.images || []).length ? `<section class="public-receipt-designs">${order.images.slice(0, 3).map(image => `<figure><img src="${image.data}" alt="Desain"></figure>`).join('')}</section>` : ''}
        <footer>Terima kasih telah mempercayakan pesanan kepada ${esc(business.name || 'SHIROGANE')}.</footer>
        <div class="public-receipt-actions"><button onclick="window.print()">Cetak / Simpan PDF</button><button id="publicShareButton">Bagikan</button></div>
      </article>`;
    document.getElementById('publicShareButton').onclick = async () => {
      try {
        if (navigator.share) await navigator.share({ title: `Nota ${order.invoice || ''}`, text: `Nota ${order.invoice || ''} - ${business.name || 'SHIROGANE'}`, url: location.href });
        else { await navigator.clipboard.writeText(location.href); alert('Link nota disalin.'); }
      } catch (error) { if (error?.name !== 'AbortError') alert('Tidak dapat membagikan link.'); }
    };
  }
})();
