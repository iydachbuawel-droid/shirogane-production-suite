(() => {
  'use strict';

  const VERSION = '3.0.7';
  const PUBLIC_APP_URL = new URL('./', window.location.href).toString();
  const PUBLIC_VERSION_URL = new URL('public-version.json', PUBLIC_APP_URL).toString();
  const A4 = { width: 595.28, height: 841.89, margin: 20 };

  function cleanPhone(value = '') {
    let n = String(value).replace(/\D/g, '');
    if (n.startsWith('0')) n = '62' + n.slice(1);
    if (n && !n.startsWith('62')) n = '62' + n;
    return n;
  }

  function filename(order) {
    return `Nota-${String(order.invoice || 'SHIROGANE').replace(/[^a-zA-Z0-9_-]/g, '-')}.pdf`;
  }

  function getOrder(id) {
    const order = db.orders.find(x => x.id === id) || db.trash.find(x => x.id === id);
    if (!order) toast('Nota tidak ditemukan.');
    return order;
  }

  function sizeExtraDetails(order) {
    const map = {};
    for (const item of (order.items || [])) {
      const sizes = item.sizes || {};
      const rates = { ...(db.settings.sizeExtras || {}), ...((item.extras && typeof item.extras === 'object') ? item.extras : {}) };
      for (const size of SIZE_KEYS) {
        const qty = safeQty(sizes[size]);
        const rate = safeNumber(rates[size]);
        const amount = qty * rate;
        if (amount <= 0) continue;
        if (!map[size]) map[size] = { size, qty: 0, rate, amount: 0 };
        map[size].qty += qty;
        map[size].amount += amount;
        if (!map[size].rate) map[size].rate = rate;
      }
    }
    return SIZE_KEYS.filter(size => map[size]).map(size => map[size]);
  }

  function roundRectPath(ctx, x, y, w, h, r = 12) {
    const radius = Math.max(0, Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2));
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + w - radius, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
    ctx.lineTo(x + w, y + h - radius);
    ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
    ctx.lineTo(x + radius, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
  }

  function loadImage(src) {
    return new Promise(resolve => {
      if (!src) return resolve(null);
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = src;
    });
  }

  function drawContain(ctx, img, x, y, w, h) {
    if (!img || !img.naturalWidth || !img.naturalHeight) return;
    const scale = Math.min(w / img.naturalWidth, h / img.naturalHeight);
    const dw = img.naturalWidth * scale;
    const dh = img.naturalHeight * scale;
    ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
  }

  function text(ctx, value, x, y, size = 17, weight = 400, align = 'left', color = '#0f172a') {
    ctx.font = `${weight} ${size}px Arial, sans-serif`;
    ctx.textAlign = align;
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = color;
    ctx.fillText(String(value ?? ''), x, y);
  }

  function fitText(ctx, value, x, y, maxWidth, size = 17, weight = 400, align = 'left', color = '#0f172a') {
    let v = String(value ?? '');
    ctx.font = `${weight} ${size}px Arial, sans-serif`;
    if (ctx.measureText(v).width > maxWidth) {
      while (v.length > 3 && ctx.measureText(v + '…').width > maxWidth) v = v.slice(0, -1);
      v += '…';
    }
    text(ctx, v, x, y, size, weight, align, color);
  }

  function rule(ctx, x1, y1, x2, y2, color = '#cbd5e1', width = 1) {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }

  function jpegBytes(dataUrl) {
    const raw = atob(dataUrl.split(',')[1]);
    const out = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
    return out;
  }

  function ascii(value) { return new TextEncoder().encode(value); }
  function joinBytes(parts) {
    const total = parts.reduce((sum, p) => sum + p.length, 0);
    const out = new Uint8Array(total);
    let offset = 0;
    for (const part of parts) { out.set(part, offset); offset += part.length; }
    return out;
  }

  function imagePagesToPdf(pageImages) {
    if (!pageImages.length) throw new Error('Tidak ada halaman PDF.');
    const objects = [];
    const addObject = parts => { objects.push(parts); return objects.length; };
    const addText = value => addObject([ascii(value)]);
    const addStream = (dictionary, content) => addObject([ascii(`${dictionary}\nstream\n`), content, ascii('\nendstream')]);

    const pagesId = addText('');
    const pageIds = [];
    for (const page of pageImages) {
      const imageId = addStream(
        `<< /Type /XObject /Subtype /Image /Width ${page.pixelWidth} /Height ${page.pixelHeight} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${page.jpeg.length} >>`,
        page.jpeg
      );
      const commands = ascii(`q\n${page.drawWidth.toFixed(2)} 0 0 ${page.drawHeight.toFixed(2)} ${page.x.toFixed(2)} ${page.y.toFixed(2)} cm\n/Im0 Do\nQ\n`);
      const contentId = addStream(`<< /Length ${commands.length} >>`, commands);
      pageIds.push(addText(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${A4.width} ${A4.height}] /Resources << /XObject << /Im0 ${imageId} 0 R >> >> /Contents ${contentId} 0 R >>`));
    }
    objects[pagesId - 1] = [ascii(`<< /Type /Pages /Kids [${pageIds.map(id => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`)];
    const catalogId = addText(`<< /Type /Catalog /Pages ${pagesId} 0 R >>`);

    const header = ascii('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
    const parts = [header];
    const offsets = [0];
    let length = header.length;
    objects.forEach((objectParts, index) => {
      offsets[index + 1] = length;
      const head = ascii(`${index + 1} 0 obj\n`);
      const tail = ascii('\nendobj\n');
      parts.push(head, ...objectParts, tail);
      length += head.length + objectParts.reduce((sum, p) => sum + p.length, 0) + tail.length;
    });
    const xrefOffset = length;
    let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
    for (let i = 1; i <= objects.length; i++) xref += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
    xref += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
    parts.push(ascii(xref));
    return new Blob([joinBytes(parts)], { type: 'application/pdf' });
  }

  async function buildReceiptCanvas(order) {
    const totals = orderTotals(order);
    const W = 1240;
    const outer = 64;
    const contentW = W - outer * 2;
    const rows = Math.max(1, (order.items || []).length);
    const imageCount = Math.min(3, (order.images || []).length);
    const H = Math.max(1754, 1040 + rows * 64 + (imageCount ? 500 : 0));
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('Canvas tidak tersedia.');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, W, H);

    const logo = await loadImage(db.settings.logo || 'app-icon.png');
    const bankKey = String(db.settings.bank || '').trim().toUpperCase();
    const bankFile = typeof bankAssets !== 'undefined' ? bankAssets[bankKey] : '';
    const bankSource = (db.settings.customBankLogos || {})[bankKey] || (bankFile ? `assets/banks/${bankFile}` : '');
    const bankLogo = await loadImage(bankSource);
    const designImages = (await Promise.all((order.images || []).slice(0, 3).map(image => { const src=image?.data||''; return /^(data:image\/|blob:|https?:\/\/)/i.test(src)?loadImage(src):Promise.resolve(null); }))).filter(Boolean);

    let y = 52;
    drawContain(ctx, logo, outer, y, 108, 108);
    text(ctx, db.settings.business || 'SHIROGANE', outer + 138, y + 32, 36, 700);
    text(ctx, db.settings.subtitle || '', outer + 138, y + 68, 20, 400, 'left', '#475569');
    fitText(ctx, `${db.settings.address || ''}${db.settings.phone ? ` • ${db.settings.phone}` : ''}`, outer + 138, y + 98, contentW - 160, 17, 400, 'left', '#475569');
    rule(ctx, outer, y + 126, W - outer, y + 126, '#111827', 4);

    y += 174;
    text(ctx, `No. ${order.invoice || '-'}`, outer, y, 18, 700);
    text(ctx, `Tanggal ${order.date || '-'}`, W - outer, y, 18, 700, 'right');
    y += 34;
    fitText(ctx, `Pelanggan ${order.customer || '-'}`, outer, y, 500, 18, 700);
    text(ctx, `Selesai ${order.dueDate || '-'}`, W - outer, y, 18, 700, 'right');

    y += 40;
    const widths = [315, 58, 58, 58, 62, 68, 68, 68, 75, 116, 128];
    const xs = [outer];
    widths.forEach((w, i) => { if (i < widths.length - 1) xs.push(xs[xs.length - 1] + w); });
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(outer, y, contentW, 46);
    const heads = ['BARANG', 'XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL', '5XL', 'QTY', 'HARGA', 'JUMLAH'];
    heads.forEach((head, i) => text(ctx, head, xs[i] + (i ? widths[i] / 2 : 8), y + 29, 14, 700, i ? 'center' : 'left', '#475569'));
    y += 46;

    const items = order.items || [];
    if (!items.length) {
      text(ctx, 'Belum ada detail barang.', outer + 8, y + 34, 16, 400, 'left', '#64748b');
      y += 58;
    }
    for (const item of items) {
      const calc = orderTotals({ ...order, items: [item], discount: 0, deposit: 0 });
      const values = [item.name || '', ...SIZE_KEYS.map(size => safeQty((item.sizes || {})[size]) || ''), calc.qty, money(item.price), money(calc.subtotal)];
      fitText(ctx, values[0], xs[0] + 8, y + 35, widths[0] - 14, 16, 600);
      for (let i = 1; i < values.length; i++) text(ctx, values[i], xs[i] + widths[i] / 2, y + 35, 15, 400, 'center');
      y += 58;
      rule(ctx, outer, y, W - outer, y, '#e2e8f0', 1);
    }

    y += 28;
    const summaryX = outer + 570;
    const summaryRight = W - outer;
    // Gunakan rincian dari perhitungan total sebagai sumber utama. Ini menjamin
    // rincian selalu konsisten dengan angka Tambahan ukuran yang masuk ke Total Tagihan.
    let detailExtras = Array.isArray(totals.extraBreakdown) ? totals.extraBreakdown.filter(x => Number(x.amount || 0) > 0) : [];
    if (!detailExtras.length) detailExtras = sizeExtraDetails(order);
    // Fallback terakhir untuk data lama: hitung ulang dari qty ukuran dan tarif pengaturan.
    if (!detailExtras.length && Number(totals.extra || 0) > 0) {
      detailExtras = sizeExtraDetails({ ...order, items: (order.items || []).map(item => ({
        ...item,
        extras: { ...(db.settings.sizeExtras || {}), ...((item.extras && typeof item.extras === 'object') ? item.extras : {}) }
      })) });
    }
    const extraRows = detailExtras.length
      ? [
          ['RINCIAN TAMBAHAN UKURAN', '', 16, true],
          ...detailExtras.map(x => [`${x.size}: ${x.qty} pcs × ${money(x.rate)} =`, money(x.amount), 17, false]),
          ['Total tambahan ukuran', money(totals.extra), 17, true]
        ]
      : [['Tambahan ukuran', money(totals.extra), 17, false]];
    const summaryRows = [
      [`Subtotal barang (${totals.qty} pcs)`, money(totals.subtotal), 18, false],
      ...extraRows,
      ['Diskon', `-${money(totals.discount)}`, 18, false],
      ['Total Tagihan', money(totals.total), 24, true],
      ['Panjar', money(totals.deposit), 18, false]
    ];
    for (const [label, value, size, bold] of summaryRows) {
      if (label === 'Total Tagihan') rule(ctx, summaryX, y - 14, summaryRight, y - 14, '#cbd5e1', 2);
      text(ctx, label, summaryX, y, size, bold ? 700 : 400);
      text(ctx, value, summaryRight, y, size, bold ? 700 : 600, 'right');
      y += bold ? 62 : 45;
    }
    // Samakan dengan tampilan cetak F4: tanpa kotak hitam pada sisa pembayaran.
    text(ctx, 'Sisa Pembayaran', summaryX, y + 4, 24, 800, 'left', '#94a3b8');
    text(ctx, money(totals.balance), summaryRight, y + 4, 18, 400, 'right', '#94a3b8');
    y += 44;

    if (db.settings.account || db.settings.accountName) {
      y += 14;
      roundRectPath(ctx, outer, y, contentW, 116, 14);
      ctx.fillStyle = '#f8fafc';
      ctx.fill();
      ctx.strokeStyle = '#dbe3ec';
      ctx.lineWidth = 2;
      ctx.stroke();
      drawContain(ctx, bankLogo, outer + 20, y + 18, 220, 80);
      text(ctx, `Transfer ke ${db.settings.bank || 'Bank'}`, outer + 276, y + 34, 17, 400, 'left', '#64748b');
      text(ctx, db.settings.account || '-', outer + 276, y + 72, 28, 700);
      text(ctx, `a.n. ${db.settings.accountName || '-'}`, outer + 276, y + 101, 17, 400, 'left', '#64748b');
      y += 140;
    }

    // Catatan pada PDF harus berada di posisi yang sama dengan preview/cetak F4: sebelum gambar.
    if (order.notes) {
      fitText(ctx, `Catatan: ${order.notes}`, outer, y, contentW, 17, 600);
      y += 38;
    }

    const loadedDesigns = designImages.filter(Boolean);
    if (loadedDesigns.length) {
      y += 6;
      const gap = 18;
      const columns = loadedDesigns.length === 1 ? 1 : Math.min(2, loadedDesigns.length);
      const boxW = columns === 1 ? Math.min(660, contentW) : (contentW - gap) / 2;
      const boxH = columns === 1 ? 420 : 340;
      loadedDesigns.forEach((img, index) => {
        const col = index % columns;
        const row = Math.floor(index / columns);
        const rowWidth = columns === 1 ? boxW : (boxW * columns + gap * (columns - 1));
        const startX = outer + (contentW - rowWidth) / 2;
        const x = startX + col * (boxW + gap);
        const yy = y + row * (boxH + gap);
        roundRectPath(ctx, x, yy, boxW, boxH, 14);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
        ctx.strokeStyle = '#dbe3ec';
        ctx.lineWidth = 2;
        ctx.stroke();
        drawContain(ctx, img, x + 12, yy + 12, boxW - 24, boxH - 24);
      });
      y += Math.ceil(loadedDesigns.length / columns) * (boxH + gap) + 12;
    }
    text(ctx, `Terima kasih telah mempercayakan pesanan kepada ${db.settings.business || 'SHIROGANE'}.`, W / 2, y + 26, 16, 400, 'center', '#475569');

    const usedHeight = Math.min(H, Math.max(980, y + 60));
    const result = document.createElement('canvas');
    result.width = W;
    result.height = usedHeight;
    const resultContext = result.getContext('2d', { alpha: false });
    resultContext.fillStyle = '#ffffff';
    resultContext.fillRect(0, 0, W, usedHeight);
    resultContext.drawImage(canvas, 0, 0);
    return result;
  }

  async function buildPdfBlob(order) {
    const canvas = await buildReceiptCanvas(order);
    const drawWidth = A4.width - A4.margin * 2;
    const usableHeight = A4.height - A4.margin * 2;
    const sliceHeight = Math.max(1, Math.floor(canvas.width * usableHeight / drawWidth));
    const pages = [];
    for (let top = 0; top < canvas.height; top += sliceHeight) {
      const height = Math.min(sliceHeight, canvas.height - top);
      const pageCanvas = document.createElement('canvas');
      pageCanvas.width = canvas.width;
      pageCanvas.height = height;
      const pageContext = pageCanvas.getContext('2d', { alpha: false });
      pageContext.fillStyle = '#ffffff';
      pageContext.fillRect(0, 0, pageCanvas.width, pageCanvas.height);
      pageContext.drawImage(canvas, 0, top, canvas.width, height, 0, 0, canvas.width, height);
      const jpeg = jpegBytes(pageCanvas.toDataURL('image/jpeg', 0.92));
      const drawHeight = drawWidth * height / canvas.width;
      pages.push({
        jpeg,
        pixelWidth: pageCanvas.width,
        pixelHeight: pageCanvas.height,
        drawWidth,
        drawHeight,
        x: A4.margin,
        y: A4.height - A4.margin - drawHeight
      });
    }
    const blob = imagePagesToPdf(pages);
    const signature = new TextDecoder().decode(new Uint8Array(await blob.slice(0, 5).arrayBuffer()));
    if (signature !== '%PDF-') throw new Error('File PDF tidak valid.');
    return blob;
  }

  // API internal untuk memastikan PDF, WA dan Bagikan memakai generator yang sama.
  window.__SHIROGANE_BUILD_PDF = buildPdfBlob;
  window.__SHIROGANE_SIZE_EXTRA_DETAILS = sizeExtraDetails;

  function downloadBlob(blob, name) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = name;
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }

  function printFallback(order) {
    const popup = window.open('', '_blank');
    if (!popup) return false;
    popup.document.open();
    popup.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${order.invoice}</title><link rel="stylesheet" href="styles.css"><style>@page{size:A4 portrait;margin:10mm}body{background:#fff;margin:0}.print-area{max-width:190mm;margin:auto}.thumb img{object-fit:contain!important;width:100%!important;height:auto!important;max-height:75mm!important}</style></head><body><div class="print-area f4-print">${receiptHTML(order)}</div><script>window.addEventListener('load',()=>setTimeout(()=>window.print(),500));<\/script></body></html>`);
    popup.document.close();
    return true;
  }

  window.downloadReceiptPDF = async id => {
    const order = getOrder(id);
    if (!order) return;
    const popup = window.open('', '_blank');
    if (!popup) return toast('Popup diblokir. Izinkan popup untuk menyimpan PDF.');
    const html = receiptHTML(order);
    popup.document.open();
    popup.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${order.invoice}</title><link rel="stylesheet" href="styles.css?v=1.7.0"><style>@page{size:A4 portrait;margin:10mm}body{background:#fff;margin:0}.print-area{max-width:190mm;margin:auto}.thumb img{object-fit:contain!important;width:100%!important;height:auto!important;max-height:75mm!important}.extra-title{font-weight:700;margin:12px 0 4px}.extra-detail,.extra-total{display:flex;justify-content:space-between;gap:16px}</style></head><body><div class="print-area f4-print">${html}</div><script>window.addEventListener('load',()=>setTimeout(()=>window.print(),500));<\/script></body></html>`);
    popup.document.close();
    if (typeof logActivity === 'function') logActivity('Simpan Nota PDF', order.invoice);
    toast('Dialog PDF dibuka. Pilih Simpan sebagai PDF.');
  };

  function receiptPayload(order) {
    const totals = orderTotals(order);
    return {
      v: 2,
      business: {
        name: db.settings.business || 'SHIROGANE',
        subtitle: db.settings.subtitle || 'Production Suite',
        address: db.settings.address || '',
        phone: db.settings.phone || '',
        logo: db.settings.logo || '',
        bank: db.settings.bank || '',
        account: db.settings.account || '',
        accountName: db.settings.accountName || ''
      },
      order: {
        invoice: order.invoice || '',
        date: order.date || '',
        dueDate: order.dueDate || '',
        customer: order.customer || '',
        phone: order.phone || '',
        address: order.address || '',
        notes: order.notes || '',
        productionStatus: order.productionStatus || '',
        paymentStatus: order.paymentStatus || '',
        items: (order.items || []).map(item => ({
          name: item.name || '',
          price: Number(item.price || 0),
          sizes: item.sizes || {},
          extras: item.extras || {}
        })),
        images: (order.images || []).slice(0, 3).map(image => ({ name: image.name || '', data: image.data || '' }))
      },
      totals,
      publishedAt: new Date().toISOString()
    };
  }

  function randomToken() {
    const bytes = new Uint8Array(18);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
  }

  function getPublicToken(order) {
    if (!order.publicToken) {
      order.publicToken = randomToken();
      order.publicUpdatedAt = new Date().toISOString();
      if (typeof save === 'function') save();
    }
    return order.publicToken;
  }

  async function publishReceipt(order) {
    const client = window.SHIROGANE_CLOUD_CLIENT;
    const session = window.SHIROGANE_CLOUD_SESSION;
    if (!client || !session?.user?.id) throw new Error('Login Cloud diperlukan untuk membuat link nota.');
    const token = getPublicToken(order);
    const payload = receiptPayload(order);
    const { error } = await client.from('shirogane_public_receipts').upsert({
      token,
      owner_id: session.user.id,
      payload,
      updated_at: new Date().toISOString(),
      expires_at: null
    }, { onConflict: 'token' });
    if (error) throw error;
    const url = new URL(PUBLIC_APP_URL);
    url.searchParams.set('receipt', token);
    return url.toString();
  }


  async function publicPageReady() {
    try {
      const response = await fetch(`${PUBLIC_VERSION_URL}?v=${Date.now()}`, { cache: 'no-store' });
      if (!response.ok) return false;
      const info = await response.json();
      return Number(info.receiptVersion || 0) >= 1;
    } catch (_) { return false; }
  }

  async function makeReceiptLink(order) {
    if (!(await publicPageReady())) throw new Error('Halaman nota publik belum diterbitkan.');
    return publishReceipt(order);
  }

  async function copyText(value) {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(value);
        return true;
      }
    } catch (_) {}
    const area = document.createElement('textarea');
    area.value = value;
    area.readOnly = true;
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    let copied = false;
    try { copied = document.execCommand('copy'); } catch (_) {}
    area.remove();
    return copied;
  }

  window.copyReceiptLink = async id => {
    const order = getOrder(id);
    if (!order) return;
    toast('Membuat link nota...');
    try {
      const link = await makeReceiptLink(order);
      const copied = await copyText(link);
      if (!copied) window.prompt('Salin link nota berikut:', link);
      if (typeof logActivity === 'function') logActivity('Salin Link Nota', order.invoice);
      toast(copied ? 'Link nota berhasil disalin.' : 'Link nota siap disalin.');
      return link;
    } catch (error) {
      console.error('Link gagal:', error);
      toast('Gagal membuat link nota.');
    }
  };

  function waMessage(order, link = '') {
    const totals = orderTotals(order);
    return `Halo ${order.customer || 'Bapak/Ibu'},\n\nTerima kasih telah mempercayakan pesanan kepada ${db.settings.business || 'SHIROGANE'}.\n\nNo. Nota: ${order.invoice}\nTotal: ${money(totals.total)}\nPanjar: ${money(totals.deposit)}\nSisa: ${money(totals.balance)}\nStatus: ${order.productionStatus || '-'}${link ? `\n\nLihat nota: ${link}` : ''}\n\nTerima kasih.`;
  }

  function isMobileShareDevice() {
    return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || '') && typeof navigator.share === 'function';
  }

  window.shareReceipt = async id => {
    const order = getOrder(id);
    if (!order) return;
    toast('Menyiapkan PDF...');
    try {
      const blob = await buildPdfBlob(order);
      const file = new File([blob], filename(order), { type: 'application/pdf' });
      if (navigator.share && (!navigator.canShare || navigator.canShare({ files: [file] }))) {
        await navigator.share({ title: `Nota ${order.invoice}`, text: waMessage(order), files: [file] });
        if (typeof logActivity === 'function') logActivity('Bagikan Nota PDF', order.invoice);
        return;
      }
      downloadBlob(blob, filename(order));
      toast('PDF disimpan. Bagikan file tersebut dari folder Download.');
    } catch (error) {
      if (error?.name === 'AbortError') return;
      console.error('Bagikan gagal:', error);
      toast('Gagal membagikan nota.');
    }
  };

  window.sendReceiptWhatsApp = async id => {
    const order = getOrder(id);
    if (!order) return;
    const phone = cleanPhone(order.phone);
    if (!phone) return toast('Nomor WhatsApp pelanggan belum diisi.');

    let link = '';
    try { link = await makeReceiptLink(order); } catch (error) { console.warn('Link nota tidak disertakan:', error); }
    const message = waMessage(order, link);
    const waUrl = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;

    if (isMobileShareDevice()) {
      toast('Menyiapkan PDF untuk dibagikan...');
      try {
        const blob = await buildPdfBlob(order);
        const file = new File([blob], filename(order), { type: 'application/pdf' });
        if (!navigator.canShare || navigator.canShare({ files: [file] })) {
          await navigator.share({ title: `Nota ${order.invoice}`, text: message, files: [file] });
          if (typeof logActivity === 'function') logActivity('Kirim WA + PDF', order.invoice);
          toast('Pilih WhatsApp lalu pilih chat pelanggan.');
          return;
        }
      } catch (error) {
        if (error?.name === 'AbortError') return;
        console.error('Share PDF mobile gagal:', error);
      }
      window.location.href = waUrl;
      return;
    }

    // Desktop: WhatsApp Web tidak mengizinkan website memasang lampiran otomatis.
    // Chat dibuka segera agar tidak diblokir popup, sementara PDF dibuat dan diunduh.
    const waWindow = window.open(waUrl, '_blank', 'noopener');
    toast('Mengunduh PDF dan membuka WhatsApp...');
    try {
      const blob = await buildPdfBlob(order);
      downloadBlob(blob, filename(order));
      if (!waWindow) window.location.href = waUrl;
      if (typeof logActivity === 'function') logActivity('Kirim WhatsApp', order.invoice);
      toast('PDF tersimpan dan chat WhatsApp terbuka. Pilih ikon lampiran lalu ambil PDF dari folder Download.');
    } catch (error) {
      console.error('WA PDF gagal:', error);
      if (!waWindow) window.location.href = waUrl;
      toast('Chat WhatsApp dibuka, tetapi PDF gagal dibuat.');
    }
  };

  function showReceiptActions(order) {
    document.getElementById('receiptActionModal')?.remove();
    const wrap = document.createElement('div');
    wrap.id = 'receiptActionModal';
    wrap.className = 'receipt-modal';
    wrap.innerHTML = `<div class="receipt-card"><button class="receipt-close" aria-label="Tutup">×</button><div class="receipt-success">✓</div><h2>Pesanan berhasil disimpan</h2><p><b>${order.invoice}</b> • ${order.customer || '-'}</p><div class="receipt-action-grid"><button data-a="print">🖨 Print</button><button data-a="close">Tutup</button></div></div>`;
    document.body.appendChild(wrap);
    const close = () => wrap.remove();
    wrap.querySelector('.receipt-close').onclick = close;
    wrap.addEventListener('click', event => { if (event.target === wrap) close(); });
    wrap.querySelector('[data-a="print"]').onclick = () => printOrder(order.id, 'f4');
    wrap.querySelector('[data-a="close"]').onclick = close;
  }

  const originalOrdersTable = window.ordersTable;
  if (typeof originalOrdersTable === 'function') {
    window.ordersTable = function (orders, bulk = false) {
      let html = originalOrdersTable(orders, bulk);
      for (const order of orders) {
        const marker = `<button class="btn small danger" onclick="moveToTrash('${order.id}')">Hapus</button>`;
        html = html.replace(marker, marker);
      }
      return html;
    };
    if (typeof renderAll === 'function') renderAll();
  }

  const originalSaveCurrent = window.saveCurrent;
  if (typeof originalSaveCurrent === 'function') {
    window.saveCurrent = function (print = false) {
      const candidateId = typeof draft !== 'undefined' ? draft?.id : null;
      const before = db.orders.length;
      originalSaveCurrent(print);
      const saved = candidateId ? db.orders.find(order => order.id === candidateId) : (db.orders.length > before ? db.orders[db.orders.length - 1] : null);
      if (saved) setTimeout(() => showReceiptActions(saved), 180);
    };
  }
})();
