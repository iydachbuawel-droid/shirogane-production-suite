const $=(s,p=document)=>p.querySelector(s), $$=(s,p=document)=>[...p.querySelectorAll(s)];
const money=n=>'Rp'+Number(n||0).toLocaleString('id-ID');
const today=()=>new Date().toISOString().slice(0,10);
const uid=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,7);

const defaults={
 settings:{business:'SHIROGANE',subtitle:'Konveksi & Sablon',address:'Ulugalung, Sulawesi Selatan',phone:'',logo:'',bank:'BRI',account:'',accountName:'',customBankLogos:{},sizeExtras:{XS:0,S:0,M:0,L:0,XL:0,'2XL':10000,'3XL':10000,'4XL':10000,'5XL':10000},thermalWidth:'80',invoicePrefix:'SG',calculationVersion:100},
 products:[
  {id:uid(),name:'Pendek 24s + Sablon',price:80000},
  {id:uid(),name:'Panjang 24s + Sablon',price:90000},
  {id:uid(),name:'Anak Pendek',price:70000},
  {id:uid(),name:'Anak Panjang',price:75000},
  {id:uid(),name:'Jersey Pendek',price:105000},
  {id:uid(),name:'Jersey Panjang',price:115000}
 ],orders:[]
};
let db=load();
function normalizeSettings(){
 db=db&&typeof db==='object'?db:structuredClone(defaults);
 db.settings={...structuredClone(defaults.settings),...(db.settings&&typeof db.settings==='object'?db.settings:{})};
 db.settings.customBankLogos=(db.settings.customBankLogos&&typeof db.settings.customBankLogos==='object')?db.settings.customBankLogos:{};
 db.settings.sizeExtras={...defaults.settings.sizeExtras,...(db.settings.sizeExtras&&typeof db.settings.sizeExtras==='object'?db.settings.sizeExtras:{})};
 db.products=Array.isArray(db.products)?db.products:structuredClone(defaults.products);
 db.orders=Array.isArray(db.orders)?db.orders:[];
 db.trash=Array.isArray(db.trash)?db.trash:[];
 db.activity=Array.isArray(db.activity)?db.activity:[];
}
normalizeSettings();
let editingOrder=null;
let draft=null;
function load(){
 try{
  const saved=JSON.parse(localStorage.getItem('shirogane-db')||'{}');
  const oldVersion=Number((saved.settings||{}).calculationVersion||0);
  const merged={...structuredClone(defaults),...saved,settings:{...structuredClone(defaults.settings),...(saved.settings||{}),customBankLogos:{...((saved.settings||{}).customBankLogos||{})},sizeExtras:{...defaults.settings.sizeExtras,...((saved.settings||{}).sizeExtras||{})}},products:saved.products||structuredClone(defaults.products),orders:saved.orders||[]};
  if(oldVersion<4){
   // Versi lama memakai tarif bawaan 3XL/4XL yang tidak sesuai nota SHIROGANE.
   if(Number(merged.settings.sizeExtras['3XL'])===15000)merged.settings.sizeExtras['3XL']=10000;
   if(Number(merged.settings.sizeExtras['4XL'])===20000)merged.settings.sizeExtras['4XL']=10000;
   for(const collection of [merged.orders||[],merged.trash||[]])for(const order of collection)for(const item of (order.items||[]))if(item.extras){
    if(Number(item.extras['3XL'])===15000)item.extras['3XL']=10000;
    if(Number(item.extras['4XL'])===20000)item.extras['4XL']=10000;
   }
   merged.settings.calculationVersion=42;
  }
  return merged;
 }catch{return structuredClone(defaults)}
}
function save(){localStorage.setItem('shirogane-db',JSON.stringify(db));}
function toast(msg){const el=$('#toast');el.textContent=msg;el.classList.add('show');setTimeout(()=>el.classList.remove('show'),2200)}
function nextInvoice(){const d=today().replaceAll('-','');const prefix=db.settings.invoicePrefix||'SG';const count=db.orders.filter(o=>o.date===today()).length+1;return `${prefix}-${d}-${String(count).padStart(3,'0')}`}
const SIZE_KEYS=['XS','S','M','L','XL','2XL','3XL','4XL','5XL'];
function safeNumber(value){const n=Number(value);return Number.isFinite(n)&&n>0?n:0}
function safeQty(value){return Math.max(0,Math.floor(safeNumber(value)))}
function sizeExtraDetails(o){
 const map={};
 for(const it of (o.items||[])){
  const sizes=it.sizes||{};
  const rates={...(db.settings.sizeExtras||{}),...((it.extras&&typeof it.extras==='object')?it.extras:{})};
  for(const size of SIZE_KEYS){
   const qty=safeQty(sizes[size]);
   const rate=safeNumber(rates[size]);
   const amount=qty*rate;
   if(amount<=0)continue;
   if(!map[size])map[size]={size,qty:0,rate,amount:0};
   map[size].qty+=qty;
   map[size].amount+=amount;
   if(!map[size].rate)map[size].rate=rate;
  }
 }
 return SIZE_KEYS.filter(size=>map[size]).map(size=>map[size]);
}

function orderTotals(o){
 let subtotal=0,extra=0,qty=0;
 const extraBreakdown={};
 const itemBreakdown=[];
 for(const it of (o.items||[])){
  const sizes=it.sizes||{};
  const rateSource={...(db.settings.sizeExtras||{}),...((it.extras&&typeof it.extras==='object')?it.extras:{})};
  let itemQty=0;
  for(const size of SIZE_KEYS)itemQty+=safeQty(sizes[size]);
  const price=safeNumber(it.price);
  const itemTotal=itemQty*price;
  qty+=itemQty; subtotal+=itemTotal;
  for(const size of SIZE_KEYS){
   const count=safeQty(sizes[size]);
   const rate=safeNumber(rateSource[size]);
   const amount=count*rate;
   if(amount>0){
    if(!extraBreakdown[size])extraBreakdown[size]={size,qty:0,rate,amount:0};
    extraBreakdown[size].qty+=count;
    extraBreakdown[size].amount+=amount;
    extra+=amount;
   }
  }
  itemBreakdown.push({id:it.id,name:it.name||'',qty:itemQty,price,total:itemTotal});
 }
 const discount=safeNumber(o.discount);
 const deposit=safeNumber(o.deposit);
 const total=Math.max(0,subtotal+extra-discount);
 const balance=Math.max(0,total-deposit);
 return{subtotal,extra,total,balance,qty,discount,deposit,extraBreakdown:Object.values(extraBreakdown),itemBreakdown};
}

const bankAssets={
 'BRI':'bri.svg','BCA':'bca.svg','BNI':'bni.svg','MANDIRI':'mandiri.svg','BTN':'btn.svg','BSI':'bsi.svg',
 'CIMB NIAGA':'cimb-niaga.svg','PERMATA':'permata.svg','SEABANK':'seabank.svg','BANK JAGO':'bank-jago.svg',
 'BANK NEO':'bank-neo.svg','DANA':'dana.svg','OVO':'ovo.svg','GOPAY':'gopay.svg','SHOPEEPAY':'shopeepay.svg'
};
function bankLogoHTML(name,large=false){
 const key=String(name||'BANK').trim().toUpperCase();
 const custom=(db.settings.customBankLogos||{})[key];
 const src=custom||((bankAssets[key])?`assets/banks/${bankAssets[key]}`:'');
 if(src)return `<img class="bank-logo-img ${large?'large':''}" src="${src}" alt="Logo ${esc(name||'Bank')}">`;
 return `<span class="bank-logo-fallback ${large?'large':''}">${esc(String(name||'BANK').trim()||'BANK')}</span>`;
}
function businessLogoHTML(cls=''){return db.settings.logo?`<img class="business-logo ${cls}" src="${db.settings.logo}" alt="Logo ${esc(db.settings.business)}">`:`<div class="business-logo-placeholder ${cls}">${esc((db.settings.business||'S').slice(0,1))}</div>`}

function statusClass(s){return s==='Selesai'||s==='Lunas'?'success':s==='Siap Diambil'?'info':s==='Baru Masuk'?'warning':''}

function nav(page){$$('.page').forEach(x=>x.classList.remove('active'));$(`#page-${page}`).classList.add('active');$$('#nav button').forEach(b=>b.classList.toggle('active',b.dataset.page===page));const titles={dashboard:['Dashboard','Ringkasan operasional SHIROGANE'], 'new-order':['Buat Pesanan','Input nota, desain, dan pembayaran'],orders:['Daftar Pesanan','Kelola seluruh pesanan pelanggan'],products:['Daftar Harga','Master produk dan harga dasar'],reports:['Laporan','Omzet, piutang, dan aktivitas pesanan'],settings:['Pengaturan','Identitas usaha, cetak, dan backup']};$('#pageTitle').textContent=titles[page][0];$('#pageSubtitle').textContent=titles[page][1];$('.sidebar').classList.remove('open'); if(page==='new-order')renderOrderForm(); else renderAll();}
$$('#nav button').forEach(b=>b.onclick=()=>nav(b.dataset.page));$('#quickAdd').onclick=()=>{editingOrder=null;draft=null;nav('new-order')};$('#mobileMenu').onclick=()=>$('.sidebar').classList.toggle('open');

function renderAll(){renderDashboard();renderOrders();renderProducts();renderReports();renderSettings();$('#brandNameSide').textContent=db.settings.business||'SHIROGANE';const mark=$('.brand-mark');if(mark)mark.innerHTML=db.settings.logo?`<img src="${db.settings.logo}" alt="Logo">`:esc((db.settings.business||'S').slice(0,1))}
function renderDashboard(){const active=db.orders.filter(o=>!['Selesai'].includes(o.productionStatus)).length;const piutang=db.orders.reduce((a,o)=>a+orderTotals(o).balance,0);const month=today().slice(0,7);const omzet=db.orders.filter(o=>o.date.startsWith(month)).reduce((a,o)=>a+orderTotals(o).total,0);const ready=db.orders.filter(o=>o.productionStatus==='Siap Diambil').length;const recent=[...db.orders].sort((a,b)=>b.createdAt-a.createdAt).slice(0,7);$('#page-dashboard').innerHTML=`
<div class="grid cards"><div class="card"><div class="label">Pesanan Aktif</div><div class="value">${active}</div><div class="hint">Belum selesai</div></div><div class="card"><div class="label">Siap Diambil</div><div class="value">${ready}</div><div class="hint">Menunggu pelanggan</div></div><div class="card"><div class="label">Omzet Bulan Ini</div><div class="value">${money(omzet)}</div><div class="hint">Total nilai nota</div></div><div class="card"><div class="label">Total Piutang</div><div class="value">${money(piutang)}</div><div class="hint">Sisa pembayaran</div></div></div>
<div class="panel"><div class="toolbar"><h2>Pesanan Terbaru</h2><span class="spacer"></span><button class="btn primary" onclick="startNew()">＋ Buat Pesanan</button></div>${recent.length?ordersTable(recent):'<div class="empty">Belum ada pesanan. Klik “Buat Pesanan” untuk memulai.</div>'}</div>`}
function ordersTable(arr){return `<div class="table-wrap"><table><thead><tr><th>No. Nota</th><th>Pelanggan</th><th>Tanggal</th><th>Total</th><th>Sisa</th><th>Status</th><th>Aksi</th></tr></thead><tbody>${arr.map(o=>{const t=orderTotals(o);return `<tr><td><strong>${o.invoice}</strong></td><td>${o.customer||'-'}</td><td>${o.date}</td><td>${money(t.total)}</td><td>${money(t.balance)}</td><td><span class="badge ${statusClass(o.productionStatus)}">${o.productionStatus}</span></td><td><button class="btn small" onclick="editOrder('${o.id}')">Buka</button> <button class="btn small" onclick="printOrder('${o.id}','thermal')">Thermal</button> <button class="btn small" onclick="printOrder('${o.id}','f4')">Print</button></td></tr>`}).join('')}</tbody></table></div>`}
function renderOrders(){const p=$('#page-orders');p.innerHTML=`<div class="panel" style="margin-top:0"><div class="toolbar"><input id="orderSearch" placeholder="Cari nomor nota atau pelanggan..." style="min-width:280px;padding:10px 12px;border:1px solid var(--line);border-radius:12px"><select id="statusFilter" class="btn"><option value="">Semua status</option>${['Baru Masuk','Diproses','Sablon','Jahit','Siap Diambil','Selesai'].map(x=>`<option>${x}</option>`).join('')}</select><span class="spacer"></span><button class="btn primary" onclick="startNew()">＋ Pesanan Baru</button></div><div id="ordersList" style="margin-top:16px"></div></div>`;const refresh=()=>{const q=$('#orderSearch').value.toLowerCase(),s=$('#statusFilter').value;const arr=[...db.orders].sort((a,b)=>b.createdAt-a.createdAt).filter(o=>(!q||o.invoice.toLowerCase().includes(q)||(o.customer||'').toLowerCase().includes(q))&&(!s||o.productionStatus===s));$('#ordersList').innerHTML=arr.length?ordersTable(arr):'<div class="empty">Pesanan tidak ditemukan.</div>'};$('#orderSearch').oninput=refresh;$('#statusFilter').onchange=refresh;refresh()}
window.startNew=()=>{editingOrder=null;draft=null;nav('new-order')};window.editOrder=id=>{editingOrder=id;draft=structuredClone(db.orders.find(o=>o.id===id));nav('new-order')};
function blankDraft(){return{id:uid(),invoice:nextInvoice(),date:today(),dueDate:today(),customer:'',phone:'',address:'',notes:'',productionStatus:'Baru Masuk',paymentStatus:'Belum Bayar',discount:0,deposit:0,items:[],images:[],createdAt:Date.now()}}
function renderOrderForm(){if(!draft)draft=blankDraft();const p=$('#page-new-order');p.innerHTML=`<div class="split"><div>
<div class="panel" style="margin-top:0"><h2>Data Pesanan</h2><div class="form-grid three"><div class="field"><label>No. Nota</label><input id="fInvoice" value="${draft.invoice}"></div><div class="field"><label>Tanggal Masuk</label><input type="date" id="fDate" value="${draft.date}"></div><div class="field"><label>Estimasi Selesai</label><input type="date" id="fDue" value="${draft.dueDate}"></div><div class="field"><label>Nama Pelanggan</label><input id="fCustomer" value="${esc(draft.customer)}" placeholder="Nama pelanggan"></div><div class="field"><label>Nomor WhatsApp</label><input id="fPhone" value="${esc(draft.phone)}" placeholder="08..."></div><div class="field"><label>Status Produksi</label><select id="fProd">${['Baru Masuk','Diproses','Sablon','Jahit','Siap Diambil','Selesai'].map(x=>`<option ${draft.productionStatus===x?'selected':''}>${x}</option>`).join('')}</select></div></div><div class="field" style="margin-top:14px"><label>Alamat / Catatan Pelanggan</label><textarea id="fAddress">${esc(draft.address)}</textarea></div></div>
<div class="panel"><div class="toolbar"><h2>Detail Barang</h2><span class="spacer"></span><button class="btn primary" id="addItem">＋ Tambah Barang</button></div><div id="items"></div></div>
<div class="panel"><h2>Gambar Desain</h2><label class="upload-box" for="imageInput">Klik untuk memasukkan PNG/JPG desain atau mockup<input id="imageInput" type="file" accept="image/*" multiple hidden></label><div id="thumbs" class="thumbs" style="margin-top:12px"></div></div>
<div class="panel"><h2>Pembayaran & Catatan</h2><div class="form-grid three"><div class="field"><label>Diskon</label><input type="number" id="fDiscount" value="${draft.discount||0}"></div><div class="field"><label>Panjar / Uang Muka</label><input type="number" id="fDeposit" value="${draft.deposit||0}"></div><div class="field"><label>Status Pembayaran</label><select id="fPay">${['Belum Bayar','Sudah Panjar','Lunas'].map(x=>`<option ${draft.paymentStatus===x?'selected':''}>${x}</option>`).join('')}</select></div></div><div class="field" style="margin-top:14px"><label>Catatan Pesanan</label><textarea id="fNotes">${esc(draft.notes)}</textarea></div></div>
<div class="toolbar no-print" style="margin-top:18px"><button class="btn danger" onclick="cancelEdit()">Batal</button><span class="spacer"></span><button class="btn" onclick="saveCurrent(false)">Simpan</button><button class="btn gold" onclick="saveCurrent(true)">Simpan & Cetak</button></div>
</div><div class="sticky"><div class="panel" style="margin-top:0"><h2>Preview Nota</h2><div id="livePreview"></div></div></div></div>`;
 bindForm();renderItems();renderThumbs();updatePreview();}
function esc(s=''){return String(s).replace(/[&<>\"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]))}
function bindForm(){['Invoice','Date','Due','Customer','Phone','Address','Prod','Discount','Deposit','Pay','Notes'].forEach(k=>{const el=$('#f'+k);const key={Invoice:'invoice',Date:'date',Due:'dueDate',Customer:'customer',Phone:'phone',Address:'address',Prod:'productionStatus',Discount:'discount',Deposit:'deposit',Pay:'paymentStatus',Notes:'notes'}[k];el.oninput=()=>{draft[key]=el.type==='number'?Number(el.value||0):el.value;updatePreview()}});$('#addItem').onclick=()=>{draft.items.push({id:uid(),productId:'',name:'',price:0,sizes:{XS:0,S:0,M:0,L:0,XL:0,'2XL':0,'3XL':0,'4XL':0,'5XL':0},extras:{...db.settings.sizeExtras}});renderItems();updatePreview()};$('#imageInput').onchange=async e=>{for(const f of e.target.files){if(f.size>2_500_000){toast('Gambar terlalu besar. Maksimal 2,5 MB per file.');continue}draft.images.push({id:uid(),name:f.name,data:await fileData(f)});}renderThumbs();updatePreview()}}
function fileData(f){return new Promise(r=>{const fr=new FileReader();fr.onload=()=>r(fr.result);fr.readAsDataURL(f)})}
function renderItems(){const el=$('#items');if(!draft.items.length){el.innerHTML='<div class="empty">Belum ada barang.</div>';return}el.innerHTML=draft.items.map((it,i)=>{const calc=orderTotals({...draft,items:[it],discount:0,deposit:0});return `<div class="item-card"><div class="item-head"><strong>Barang ${i+1}</strong><span class="item-calc">${calc.qty} pcs × ${money(it.price)} = <b>${money(calc.subtotal)}</b></span><button class="btn small danger" onclick="removeItem(${i})">Hapus</button></div><div class="form-grid three"><div class="field"><label>Pilih Produk</label><select onchange="pickProduct(${i},this.value)"><option value="">-- Pilih daftar harga --</option>${db.products.map(p=>`<option value="${p.id}" ${it.productId===p.id?'selected':''}>${esc(p.name)}</option>`).join('')}</select></div><div class="field"><label>Nama Barang</label><input value="${esc(it.name)}" oninput="changeItem(${i},'name',this.value)"></div><div class="field"><label>Harga Dasar / pcs</label><input type="number" min="0" step="1000" value="${it.price||0}" oninput="changeItem(${i},'price',this.value)"></div></div><div class="sizes" style="margin-top:12px">${SIZE_KEYS.map(s=>`<div class="field"><label>${s}</label><input type="number" min="0" step="1" value="${it.sizes[s]||0}" oninput="changeSize(${i},'${s}',this.value)"></div>`).join('')}</div>${calc.extra>0?`<div class="calc-note">Tambahan ukuran barang ini: ${calc.extraBreakdown.map(x=>`${x.size}: ${x.qty} pcs × ${money(x.rate)} = ${money(x.amount)}`).join(' • ')}</div>`:''}</div>`}).join('')}
window.pickProduct=(i,id)=>{const p=db.products.find(x=>x.id===id);if(!p)return;Object.assign(draft.items[i],{productId:id,name:p.name,price:p.price});renderItems();updatePreview()};window.changeItem=(i,k,v)=>{draft.items[i][k]=k==='price'?safeNumber(v):v;updatePreview()};window.changeSize=(i,s,v)=>{draft.items[i].sizes[s]=safeQty(v);updatePreview()};window.removeItem=i=>{draft.items.splice(i,1);renderItems();updatePreview()};window.removeImage=i=>{draft.images.splice(i,1);renderThumbs();updatePreview()};
function renderThumbs(){$('#thumbs').innerHTML=draft.images.map((im,i)=>`<div class="thumb"><img src="${im.data}" alt=""><button onclick="removeImage(${i})">×</button></div>`).join('')}
function receiptExtraDetails(o,t){
 let rows=sizeExtraDetails(o).filter(x=>safeNumber(x.amount)>0);
 if(rows.length)return rows;
 if(safeNumber(t.extra)<=0)return [];
 const premium=['2XL','3XL','4XL','5XL'];
 const qtyBySize={};
 for(const it of (o.items||[]))for(const size of premium){
  const q=safeQty((it.sizes||{})[size]);
  if(q>0)qtyBySize[size]=(qtyBySize[size]||0)+q;
 }
 const sizes=Object.keys(qtyBySize);
 if(sizes.length===1){
  const size=sizes[0],qty=qtyBySize[size],amount=safeNumber(t.extra);
  return [{size,qty,rate:qty?amount/qty:amount,amount}];
 }
 if(sizes.length>1){
  const configured=db.settings?.sizeExtras||{};
  const calculated=sizes.map(size=>({size,qty:qtyBySize[size],rate:safeNumber(configured[size]),amount:qtyBySize[size]*safeNumber(configured[size])})).filter(x=>x.amount>0);
  if(calculated.length && calculated.reduce((a,x)=>a+x.amount,0)===safeNumber(t.extra))return calculated;
  return sizes.map(size=>({size,qty:qtyBySize[size],rate:null,amount:null}));
 }
 return [{size:'Biaya tambahan khusus',qty:0,rate:null,amount:safeNumber(t.extra)}];
}
function receiptHTML(o){
 const t=orderTotals(o);
 const bankBlock=(db.settings.account||db.settings.accountName)?`<div class="payment-bank">${bankLogoHTML(db.settings.bank,true)}<div><small>Transfer ke ${esc(db.settings.bank||'Bank')}</small><strong>${esc(db.settings.account||'-')}</strong><span>a.n. ${esc(db.settings.accountName||'-')}</span></div></div>`:'';
 const detailExtras=receiptExtraDetails(o,t);
 const extraRows=detailExtras.length
  ? `<div class="extra-title">RINCIAN TAMBAHAN BIAYA UKURAN</div>`+detailExtras.map(x=>{
      const complete=x.rate!==null&&x.rate!==undefined&&x.amount!==null&&x.amount!==undefined;
      const label=complete?`Ukuran ${x.size}: ${x.qty} pcs × ${money(x.rate)} = ${money(x.amount)}`:(x.qty?`Ukuran ${x.size}: ${x.qty} pcs`:`${x.size}`);
      return `<div class="summary-row extra-detail"><span>${label}</span><b>${complete?money(x.amount):(x.amount?money(x.amount):'')}</b></div>`;
    }).join('')+`<div class="summary-row extra-total"><span>Total tambahan biaya ukuran</span><b>${money(t.extra)}</b></div>`
  : `<div class="summary-row extra-detail"><span>Tambahan biaya ukuran</span><b>${money(0)}</b></div>`;
 return `<div class="preview"><div class="receipt-head branded">${businessLogoHTML('receipt-logo')}<div><h3>${esc(db.settings.business)}</h3><p>${esc(db.settings.subtitle)}</p><p>${esc(db.settings.address)} ${db.settings.phone?'• '+esc(db.settings.phone):''}</p></div></div><div class="receipt-meta"><div><b>No.</b> ${esc(o.invoice)}</div><div><b>Tanggal</b> ${o.date}</div><div><b>Pelanggan</b> ${esc(o.customer||'-')}</div><div><b>Selesai</b> ${o.dueDate}</div></div><div class="table-wrap"><table><thead><tr><th>Barang</th>${SIZE_KEYS.map(x=>`<th>${x}</th>`).join('')}<th>Qty</th><th>Harga</th><th>Jumlah</th></tr></thead><tbody>${(o.items||[]).map(it=>{const calc=orderTotals({...o,items:[it],discount:0,deposit:0});return `<tr><td>${esc(it.name)}</td>${SIZE_KEYS.map(s=>`<td>${safeQty((it.sizes||{})[s])||''}</td>`).join('')}<td>${calc.qty}</td><td>${money(safeNumber(it.price))}</td><td>${money(calc.subtotal)}</td></tr>`}).join('')}</tbody></table></div><div class="summary" style="margin-top:12px"><div class="summary-row"><span>Subtotal barang (${t.qty} pcs)</span><b>${money(t.subtotal)}</b></div>${extraRows}<div class="summary-row"><span>Diskon</span><b>-${money(t.discount)}</b></div><div class="summary-row total"><span>Total Tagihan</span><span>${money(t.total)}</span></div><div class="summary-row"><span>Panjar</span><b>${money(t.deposit)}</b></div><div class="summary-row balance"><span>Sisa Pembayaran</span><span>${money(t.balance)}</span></div></div>${bankBlock}${o.notes?`<p style="margin-top:12px"><b>Catatan:</b> ${esc(o.notes)}</p>`:''}${o.images?.length?`<div class="thumbs" style="margin-top:12px">${o.images.slice(0,3).map(im=>`<div class="thumb"><img src="${im.data}"></div>`).join('')}</div>`:''}<p style="text-align:center;margin-top:16px">Terima kasih telah mempercayakan pesanan kepada ${esc(db.settings.business)}.</p></div>`
}
function updatePreview(){$('#livePreview').innerHTML=receiptHTML(draft)}
window.cancelEdit=()=>{draft=null;editingOrder=null;nav('orders')};window.saveCurrent=print=>{if(!draft.customer.trim())return toast('Nama pelanggan wajib diisi.');if(!draft.items.length)return toast('Tambahkan minimal satu barang.');for(let i=0;i<draft.items.length;i++){const it=draft.items[i];if(!String(it.name||'').trim())return toast(`Nama barang ${i+1} wajib diisi.`);const c=orderTotals({...draft,items:[it],discount:0,deposit:0});if(c.qty<=0)return toast(`Jumlah barang ${i+1} masih 0.`);if(safeNumber(it.price)<=0)return toast(`Harga barang ${i+1} belum diisi.`)}draft.discount=safeNumber(draft.discount);draft.deposit=safeNumber(draft.deposit);const idx=db.orders.findIndex(o=>o.id===draft.id);if(idx>=0)db.orders[idx]=structuredClone(draft);else db.orders.push(structuredClone(draft));save();toast('Pesanan berhasil disimpan.');const id=draft.id;draft=null;editingOrder=null;renderAll();if(print)printOrder(id,'f4');else nav('orders')};
function ensureMobilePrintStyles(){
 if(document.getElementById('mobilePrintStyles'))return;
 const style=document.createElement('style');
 style.id='mobilePrintStyles';
 style.textContent=`
 .mobile-print-overlay{position:fixed;inset:0;z-index:99999;background:#eef2f7;display:flex;flex-direction:column}
 .mobile-print-toolbar{display:flex;gap:8px;align-items:center;padding:10px;background:#111827;position:sticky;top:0;z-index:2}
 .mobile-print-toolbar button{flex:1;border:0;border-radius:10px;padding:11px 8px;font-weight:800;background:#fff;color:#111827}
 .mobile-print-toolbar .pdf-button{background:#dc2626;color:#fff}
 .mobile-print-scroll{overflow:auto;-webkit-overflow-scrolling:touch;padding:12px;flex:1}
 .mobile-print-area{background:#fff;margin:0 auto;box-shadow:0 8px 30px rgba(15,23,42,.15)}
 .mobile-print-area.f4-print{width:min(100%,794px)}
 .mobile-print-area.thermal-print{width:min(100%,320px)}
 @media print{
   body.mobile-printing>*:not(.mobile-print-overlay){display:none!important}
   body.mobile-printing .mobile-print-overlay{position:static!important;display:block!important;background:#fff!important}
   body.mobile-printing .mobile-print-toolbar{display:none!important}
   body.mobile-printing .mobile-print-scroll{overflow:visible!important;padding:0!important}
   body.mobile-printing .mobile-print-area{box-shadow:none!important;margin:0 auto!important;width:auto!important}
 }`;
 document.head.appendChild(style);
}
window.closeMobilePrintPreview=()=>{
 const overlay=document.getElementById('mobilePrintOverlay');
 if(overlay)overlay.remove();
 document.body.classList.remove('mobile-printing');
};
window.printMobilePreview=()=>{
 document.body.classList.add('mobile-printing');
 setTimeout(()=>{window.print();setTimeout(()=>document.body.classList.remove('mobile-printing'),700)},80);
};
function openMobilePrintPreview(o,type){
 ensureMobilePrintStyles();
 closeMobilePrintPreview();
 const isThermal=type==='thermal';
 const overlay=document.createElement('div');
 overlay.id='mobilePrintOverlay';
 overlay.className='mobile-print-overlay';
 overlay.innerHTML=`<div class="mobile-print-toolbar no-print"><button onclick="printMobilePreview()">🖨 ${isThermal?'Print Thermal':'Print / PDF'}</button><button onclick="closeMobilePrintPreview()">✕ Tutup</button></div><div class="mobile-print-scroll"><div class="mobile-print-area ${isThermal?'thermal-print':'f4-print'}">${receiptHTML(o)}</div></div>`;
 document.body.appendChild(overlay);
}
window.printOrder=(id,type)=>{
 const o=db.orders.find(x=>x.id===id);if(!o)return;
 const mobileMode=window.matchMedia('(max-width: 820px)').matches||window.matchMedia('(display-mode: standalone)').matches||/Android|iPhone|iPad/i.test(navigator.userAgent);
 if(mobileMode){
   try{
     sessionStorage.setItem('shirogane-mobile-print',JSON.stringify({
       html:receiptHTML(o),
       type:type==='thermal'?'thermal':'f4',
       invoice:o.invoice||'Nota-SHIROGANE'
     }));
     window.location.href='./print-preview.html?v=1.8.2';
   }catch(err){
     console.error('Gagal membuka preview cetak Android:',err);
     openMobilePrintPreview(o,type);
   }
   return;
 }
 const w=window.open('','_blank');
 if(!w)return toast('Jendela preview diblokir.');
 const isThermal=type==='thermal';
 const invoiceJSON=JSON.stringify(o.invoice||'Nota-SHIROGANE');
 const toolbar=isThermal
  ? `<div class="preview-toolbar no-print"><button onclick="window.print()">🖨 Print Thermal</button><button onclick="window.close()">✕ Tutup</button></div>`
  : `<div class="preview-toolbar no-print"><button onclick="window.print()">🖨 Print</button><button class="pdf-button" onclick="saveSamePreviewPDF()">📄 Simpan PDF</button><button onclick="window.close()">✕ Tutup</button><span id="pdfStatus"></span></div>`;
 w.document.open();
 w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(o.invoice)}</title><link rel="stylesheet" href="styles.css"><style>
 @page{size:${isThermal?'80mm auto':'A4 portrait'};margin:${isThermal?'3mm':'10mm'}}
 *{box-sizing:border-box}body{margin:0;background:#eef2f7}.preview-toolbar{position:sticky;top:0;z-index:9999;display:flex;align-items:center;justify-content:center;gap:10px;padding:12px;background:#111827;box-shadow:0 4px 18px rgba(0,0,0,.2)}.preview-toolbar button{border:0;border-radius:9px;padding:10px 16px;background:#fff;color:#111827;font-weight:800;cursor:pointer}.preview-toolbar .pdf-button{background:#dc2626;color:#fff}.preview-toolbar #pdfStatus{color:#fff;font-size:12px}.print-area{background:#fff;margin:18px auto}.pdf-export .preview-toolbar{display:none!important}@media print{body{background:#fff}.preview-toolbar{display:none!important}.print-area{margin:0 auto!important}}
 </style></head><body>${toolbar}<div class="print-area ${isThermal?'thermal-print':'f4-print'}">${receiptHTML(o)}</div><script>
 const invoiceName=${invoiceJSON};
 async function saveSamePreviewPDF(){
   const status=document.getElementById('pdfStatus');
   if(!window.electronPrint?.savePdf){
     if(status)status.textContent='Pilih Simpan sebagai PDF pada dialog cetak';
     alert('Pada Android, pilih printer “Simpan sebagai PDF” di dialog berikutnya. Isi PDF sama dengan preview nota.');
     window.print();
     return;
   }
   if(status)status.textContent='Menyimpan PDF...';
   const result=await window.electronPrint.savePdf(invoiceName);
   if(result?.ok){if(status)status.textContent='PDF berhasil disimpan';alert('PDF berhasil disimpan.');}
   else if(!result?.canceled){if(status)status.textContent='Gagal menyimpan PDF';alert('Gagal menyimpan PDF: '+(result?.message||'Tidak diketahui'));}
   else if(status)status.textContent='';
 }
 window.addEventListener('load',()=>setTimeout(()=>window.print(),500));
 <\/script></body></html>`);
 w.document.close();
};

function renderProducts(){
 const p=$('#page-products');
 const total=db.products.length;
 const avg=total?Math.round(db.products.reduce((a,x)=>a+safeNumber(x.price),0)/total):0;
 p.innerHTML=`<div class="grid cards product-stats" style="grid-template-columns:repeat(2,minmax(0,1fr));margin-bottom:18px"><div class="card"><div class="label">Jumlah Produk</div><div class="value">${total}</div><div class="hint">Produk aktif dalam daftar harga</div></div><div class="card"><div class="label">Rata-rata Harga</div><div class="value">${money(avg)}</div><div class="hint">Hanya sebagai ringkasan</div></div></div><div class="panel" style="margin-top:0"><div class="toolbar product-toolbar"><div><h2 style="margin-bottom:4px">Master Produk</h2><div class="product-subtitle">Harga otomatis dipakai saat membuat pesanan, tetapi masih bisa diubah per nota.</div></div><span class="spacer"></span><div class="product-search"><span>⌕</span><input id="productSearch" placeholder="Cari nama produk..." oninput="filterProducts(this.value)"></div><button class="btn primary" onclick="addProduct()">＋ Tambah Produk</button></div><div id="productTable">${productTableHTML(db.products)}</div></div>`;
}
function productTableHTML(list){
 if(!list.length)return `<div class="empty product-empty"><div class="empty-icon">▦</div><b>Produk tidak ditemukan</b><span>Coba kata pencarian lain atau tambahkan produk baru.</span></div>`;
 return `<div class="table-wrap"><table class="product-table"><thead><tr><th style="width:56px">No.</th><th>Nama Produk</th><th>Harga Dasar</th><th style="width:230px">Aksi</th></tr></thead><tbody>${list.map((x,i)=>`<tr><td><span class="product-number">${i+1}</span></td><td><div class="product-name-cell"><span class="product-icon">▣</span><div><strong>${esc(x.name)}</strong><small>ID: ${esc(String(x.id).slice(0,8))}</small></div></div></td><td><strong class="product-price">${money(x.price)}</strong></td><td><div class="product-actions"><button class="btn small" onclick="editProduct('${x.id}')">Edit</button><button class="btn small" onclick="duplicateProduct('${x.id}')">Duplikat</button><button class="btn small danger" onclick="deleteProduct('${x.id}')">Hapus</button></div></td></tr>`).join('')}</tbody></table></div>`;
}
window.filterProducts=q=>{const term=String(q||'').trim().toLowerCase();const list=!term?db.products:db.products.filter(x=>String(x.name||'').toLowerCase().includes(term));const el=$('#productTable');if(el)el.innerHTML=productTableHTML(list)};
function ensureProductModal(){
 if($('#productModal'))return;
 document.body.insertAdjacentHTML('beforeend',`<div class="modal-backdrop" id="productModal" aria-hidden="true"><div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="productModalTitle"><div class="modal-head"><div><span class="modal-kicker">DAFTAR HARGA</span><h2 id="productModalTitle">Tambah Produk</h2><p id="productModalDesc">Masukkan nama produk dan harga dasar per pcs.</p></div><button class="modal-close" onclick="closeProductModal()" aria-label="Tutup">×</button></div><div class="modal-body"><input type="hidden" id="pmId"><div class="field"><label>Nama Produk <span class="required">*</span></label><input id="pmName" maxlength="80" placeholder="Contoh: Pendek 24s + Sablon"><small class="field-help">Gunakan nama yang mudah dicari saat membuat nota.</small></div><div class="field"><label>Harga Dasar per pcs <span class="required">*</span></label><div class="money-input"><span>Rp</span><input id="pmPrice" type="number" min="0" step="1000" inputmode="numeric" placeholder="80000"></div><div class="price-preview">Tampilan harga: <b id="pmPricePreview">Rp0</b></div></div><div id="pmError" class="form-error" hidden></div></div><div class="modal-actions"><button class="btn" onclick="closeProductModal()">Batal</button><button class="btn primary" id="pmSave" onclick="saveProductFromModal()">Simpan Produk</button></div></div></div>`);
 const modal=$('#productModal');
 modal.addEventListener('click',e=>{if(e.target===modal)closeProductModal()});
 $('#pmPrice').addEventListener('input',()=>{$('#pmPricePreview').textContent=money(safeNumber($('#pmPrice').value));hideProductError()});
 $('#pmName').addEventListener('input',hideProductError);
 ['pmName','pmPrice'].forEach(id=>$('#'+id).addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();saveProductFromModal()}if(e.key==='Escape')closeProductModal()}));
}
function openProductModal(product=null){
 ensureProductModal();
 const editing=!!product;
 $('#pmId').value=product?.id||'';$('#pmName').value=product?.name||'';$('#pmPrice').value=product?.price||'';
 $('#pmPricePreview').textContent=money(safeNumber(product?.price));
 $('#productModalTitle').textContent=editing?'Edit Produk':'Tambah Produk Baru';
 $('#productModalDesc').textContent=editing?'Perbarui nama atau harga dasar produk. Nota lama tidak akan berubah.':'Produk yang disimpan langsung tersedia saat membuat pesanan.';
 $('#pmSave').textContent=editing?'Simpan Perubahan':'Simpan Produk';hideProductError();
 const modal=$('#productModal');modal.classList.add('show');modal.setAttribute('aria-hidden','false');document.body.classList.add('modal-open');setTimeout(()=>$('#pmName').focus(),50);
}
window.closeProductModal=()=>{const modal=$('#productModal');if(!modal)return;modal.classList.remove('show');modal.setAttribute('aria-hidden','true');document.body.classList.remove('modal-open')};
function showProductError(msg){const el=$('#pmError');el.textContent=msg;el.hidden=false}function hideProductError(){const el=$('#pmError');if(el)el.hidden=true}
window.addProduct=()=>openProductModal();
window.editProduct=id=>{const p=db.products.find(x=>x.id===id);if(p)openProductModal(p)};
window.duplicateProduct=id=>{const p=db.products.find(x=>x.id===id);if(!p)return;openProductModal({id:'',name:p.name+' - Salinan',price:p.price})};
window.saveProductFromModal=()=>{
 const id=$('#pmId').value;const name=$('#pmName').value.trim().replace(/\s+/g,' ');const price=safeNumber($('#pmPrice').value);
 if(!name)return showProductError('Nama produk wajib diisi.');
 if(price<=0)return showProductError('Harga dasar harus lebih dari Rp0.');
 const duplicate=db.products.find(x=>x.id!==id&&String(x.name||'').trim().toLowerCase()===name.toLowerCase());
 if(duplicate)return showProductError('Nama produk tersebut sudah ada. Gunakan nama lain atau edit produk yang tersedia.');
 if(id){const p=db.products.find(x=>x.id===id);if(!p)return showProductError('Produk tidak ditemukan.');p.name=name;p.price=price;toast('Produk berhasil diperbarui.');}
 else{db.products.unshift({id:uid(),name,price});toast('Produk baru berhasil ditambahkan.');}
 save();closeProductModal();renderProducts();
};
window.deleteProduct=id=>{const p=db.products.find(x=>x.id===id);if(!p)return;const used=db.orders.reduce((n,o)=>n+(o.items||[]).filter(it=>it.productId===id).length,0);const note=used?`\n\nProduk ini pernah dipakai pada ${used} item pesanan. Nota lama tetap aman dan tidak berubah.`:'';if(confirm(`Hapus \"${p.name}\" dari daftar harga?${note}`)){db.products=db.products.filter(x=>x.id!==id);save();renderProducts();toast('Produk dihapus dari daftar harga.')}};
function renderReports(){const month=today().slice(0,7);const monthly=db.orders.filter(o=>o.date.startsWith(month));const total=monthly.reduce((a,o)=>a+orderTotals(o).total,0);const paid=monthly.reduce((a,o)=>a+Math.min(Number(o.deposit||0),orderTotals(o).total),0);const outstanding=monthly.reduce((a,o)=>a+orderTotals(o).balance,0);const days={};monthly.forEach(o=>days[o.date]=(days[o.date]||0)+orderTotals(o).total);const max=Math.max(1,...Object.values(days));$('#page-reports').innerHTML=`<div class="grid cards"><div class="card"><div class="label">Nilai Nota Bulan Ini</div><div class="value">${money(total)}</div></div><div class="card"><div class="label">Panjar Diterima</div><div class="value">${money(paid)}</div></div><div class="card"><div class="label">Piutang</div><div class="value">${money(outstanding)}</div></div><div class="card"><div class="label">Jumlah Pesanan</div><div class="value">${monthly.length}</div></div></div><div class="panel"><h2>Grafik Omzet Harian</h2><div class="chart-bars">${Object.entries(days).sort().map(([d,v])=>`<div class="bar-wrap"><div class="bar-value">${money(v)}</div><div class="bar" style="height:${Math.max(4,v/max*140)}px"></div><div class="bar-label">${d.slice(8)}</div></div>`).join('')||'<div class="empty">Belum ada transaksi bulan ini.</div>'}</div></div>`}
function renderSettingsBase(){const s=db.settings;const banks=['BRI','BCA','BNI','MANDIRI','BTN','BSI','CIMB NIAGA','PERMATA','SEABANK','BANK JAGO','BANK NEO','DANA','OVO','GOPAY','SHOPEEPAY'];$('#page-settings').innerHTML=`<div class="panel" style="margin-top:0"><h2>Identitas Usaha</h2><div class="logo-setting"><div id="businessLogoPreview">${businessLogoHTML('settings-logo')}</div><div><label class="btn" for="sLogoInput">Pilih Logo Usaha</label><input id="sLogoInput" type="file" accept="image/png,image/jpeg,image/webp" hidden><button class="btn danger" type="button" onclick="removeBusinessLogo()">Hapus Logo</button><p>Gunakan PNG transparan agar hasil nota terlihat lebih rapi. Maksimal 1,5 MB.</p></div></div><div class="form-grid three"><div class="field"><label>Nama Usaha</label><input id="sBusiness" value="${esc(s.business)}"></div><div class="field"><label>Subjudul</label><input id="sSubtitle" value="${esc(s.subtitle)}"></div><div class="field"><label>Nomor WhatsApp</label><input id="sPhone" value="${esc(s.phone)}"></div><div class="field"><label>Alamat</label><input id="sAddress" value="${esc(s.address)}"></div><div class="field"><label>Awalan Nomor Nota</label><input id="sPrefix" value="${esc(s.invoicePrefix)}"></div><div class="field"><label>Lebar Thermal</label><select id="sThermal"><option ${s.thermalWidth==='58'?'selected':''}>58</option><option ${s.thermalWidth==='80'?'selected':''}>80</option></select></div></div></div><div class="panel"><h2>Rekening</h2><div class="bank-setting-preview" id="bankPreview">${bankLogoHTML(s.bank,true)}<span>Logo SVG lokal tampil otomatis dan tetap tajam saat dicetak.</span></div><div class="form-grid three"><div class="field"><label>Bank / Dompet Digital</label><select id="sBank"><option value="">Pilih bank</option>${banks.map(b=>`<option value="${b}" ${String(s.bank||'').toUpperCase()===b?'selected':''}>${b}</option>`).join('')}<option value="__OTHER__" ${s.bank && !banks.includes(String(s.bank).toUpperCase())?'selected':''}>Bank lainnya...</option></select><input id="sBankOther" value="${s.bank && !banks.includes(String(s.bank).toUpperCase())?esc(s.bank):''}" placeholder="Ketik nama bank atau dompet digital" style="margin-top:8px;display:${s.bank && !banks.includes(String(s.bank).toUpperCase())?'block':'none'}"></div><div class="field"><label>Logo Bank Pilihan</label><div class="bank-logo-actions"><label class="btn" for="sBankLogoInput">Unggah Logo</label><input id="sBankLogoInput" type="file" accept="image/svg+xml,image/png,image/jpeg,image/webp" hidden><button class="btn" type="button" onclick="resetCurrentBankLogo()">Pakai Bawaan</button></div><small class="field-help">Opsional. Logo yang diunggah hanya berlaku untuk bank yang sedang dipilih.</small></div><div class="field"><label>Nomor Rekening</label><input id="sAccount" value="${esc(s.account)}"></div><div class="field"><label>Nama Pemilik</label><input id="sAccountName" value="${esc(s.accountName)}"></div></div></div><div class="panel"><h2>Tambahan Harga per Ukuran / pcs</h2><div class="form-grid three">${['XS','S','M','L','XL','2XL','3XL','4XL','5XL'].map(x=>`<div class="field"><label>${x}</label><input type="number" id="ex-${x}" value="${s.sizeExtras[x]||0}"></div>`).join('')}</div></div><div class="toolbar"><button class="btn primary" onclick="saveSettings()">Simpan Pengaturan</button><span class="spacer"></span><button class="btn" onclick="backupData()">Unduh Backup</button><button class="btn" onclick="document.getElementById('restoreInput').click()">Pulihkan Backup</button></div><div class="panel danger-zone"><h2>Zona Berbahaya</h2><p>Menghapus seluruh data pesanan dan daftar harga dari perangkat ini.</p><button class="btn danger" onclick="resetData()">Hapus Semua Data</button></div>`;$('#sLogoInput').onchange=handleBusinessLogo;$('#sBankLogoInput').onchange=handleBankLogo;const updateBankPreview=()=>{const select=$('#sBank');const other=$('#sBankOther');const custom=select.value==='__OTHER__';other.style.display=custom?'block':'none';const name=custom?other.value:select.value;$('#bankPreview').innerHTML=`${bankLogoHTML(name,true)}<span>Logo bank akan tampil otomatis dan tetap tajam saat dicetak.</span>`};$('#sBank').onchange=updateBankPreview;$('#sBankOther').oninput=updateBankPreview}
async function handleBankLogo(e){
 const f=e.target.files?.[0];if(!f)return;
 const select=$('#sBank'),other=$('#sBankOther');
 const name=(select.value==='__OTHER__'?other.value:select.value).trim();
 if(!name)return toast('Pilih nama bank terlebih dahulu.');
 if(f.size>1_500_000)return toast('Logo bank terlalu besar. Maksimal 1,5 MB.');
 db.settings.customBankLogos=db.settings.customBankLogos||{};
 db.settings.customBankLogos[name.toUpperCase()]=await fileData(f);save();renderSettings();toast('Logo bank berhasil dipasang.');
}
window.resetCurrentBankLogo=()=>{
 const select=$('#sBank'),other=$('#sBankOther');const name=(select.value==='__OTHER__'?other.value:select.value).trim();
 if(!name)return toast('Pilih nama bank terlebih dahulu.');
 db.settings.customBankLogos=db.settings.customBankLogos||{};delete db.settings.customBankLogos[name.toUpperCase()];save();renderSettings();toast('Logo bawaan dipakai kembali.');
};
async function handleBusinessLogo(e){const f=e.target.files?.[0];if(!f)return;if(f.size>1_500_000)return toast('Logo terlalu besar. Maksimal 1,5 MB.');db.settings.logo=await fileData(f);save();renderAll();toast('Logo usaha berhasil dipasang.')}
window.removeBusinessLogo=()=>{db.settings.logo='';save();renderAll();toast('Logo usaha dihapus.')};
window.saveSettings=()=>{Object.assign(db.settings,{business:$('#sBusiness').value,subtitle:$('#sSubtitle').value,phone:$('#sPhone').value,address:$('#sAddress').value,invoicePrefix:$('#sPrefix').value,thermalWidth:$('#sThermal').value,bank:($('#sBank').value==='__OTHER__'?$('#sBankOther').value:$('#sBank').value),account:$('#sAccount').value,accountName:$('#sAccountName').value});for(const x of ['XS','S','M','L','XL','2XL','3XL','4XL','5XL'])db.settings.sizeExtras[x]=Number($('#ex-'+x).value||0);save();renderAll();toast('Pengaturan disimpan.')};
window.backupData=()=>{const blob=new Blob([JSON.stringify(db,null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`shirogane-backup-${today()}.json`;a.click();URL.revokeObjectURL(a.href)};$('#restoreInput').onchange=async e=>{try{db=JSON.parse(await e.target.files[0].text());save();renderAll();toast('Backup berhasil dipulihkan.')}catch{toast('File backup tidak valid.')}};window.resetData=()=>{if(confirm('Yakin menghapus semua data?')){db=structuredClone(defaults);save();renderAll();toast('Semua data telah dihapus.')}};




/* ===== SHIROGANE v3.0 — data safety & management ===== */
db.trash=db.trash||[];
db.activity=db.activity||[];
db.settings.adminName=db.settings.adminName||'Admin';
save();
function logActivity(action,detail=''){
 db.activity.unshift({id:uid(),time:new Date().toISOString(),user:db.settings.adminName||'Admin',action,detail});
 db.activity=db.activity.slice(0,1000); save();
}
function fmtDateTime(iso){try{return new Date(iso).toLocaleString('id-ID')}catch{return iso}}
function downloadJSON(data,name){const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),500)}

function nav(page){
 $$('.page').forEach(x=>x.classList.remove('active')); const target=$(`#page-${page}`); if(!target)return;
 target.classList.add('active'); $$('#nav button').forEach(b=>b.classList.toggle('active',b.dataset.page===page));
 const titles={dashboard:['Dashboard','Ringkasan operasional SHIROGANE'],'new-order':['Buat Pesanan','Input nota, desain, dan pembayaran'],orders:['Daftar Pesanan','Kelola seluruh pesanan pelanggan'],customers:['Pelanggan','Riwayat dan ringkasan pelanggan'],products:['Daftar Harga','Master produk dan harga dasar'],reports:['Laporan','Omzet, piutang, dan aktivitas pesanan'],trash:['Sampah','Pulihkan atau hapus data secara permanen'],activity:['Riwayat Aktivitas','Catatan perubahan data aplikasi'],settings:['Pengaturan','Identitas usaha, rekening, keamanan data, dan backup']};
 $('#pageTitle').textContent=titles[page][0]; $('#pageSubtitle').textContent=titles[page][1]; $('.sidebar').classList.remove('open');
 if(page==='new-order')renderOrderForm(); else renderAll();
}

function renderAll(){renderDashboard();renderOrders();renderCustomers();renderProducts();renderReports();renderTrash();renderActivity();renderSettings();$('#brandNameSide').textContent=db.settings.business||'SHIROGANE';const mark=$('.brand-mark');if(mark)mark.innerHTML=db.settings.logo?`<img src="${db.settings.logo}" alt="Logo">`:esc((db.settings.business||'S').slice(0,1))}

function ordersTable(arr,bulk=false){return `<div class="table-wrap"><table><thead><tr>${bulk?'<th><input type="checkbox" onchange="toggleAllOrders(this.checked)"></th>':''}<th>No. Nota</th><th>Pelanggan</th><th>Tanggal</th><th>Total</th><th>Sisa</th><th>Status</th><th>Aksi</th></tr></thead><tbody>${arr.map(o=>{const t=orderTotals(o);return `<tr>${bulk?`<td><input class="order-check" type="checkbox" value="${o.id}" onchange="updateBulkCount()"></td>`:''}<td><strong>${o.invoice}</strong></td><td>${esc(o.customer||'-')}</td><td>${o.date}</td><td>${money(t.total)}</td><td>${money(t.balance)}</td><td><span class="badge ${statusClass(o.productionStatus)}">${o.productionStatus}</span></td><td class="actions-cell"><button class="btn small" onclick="editOrder('${o.id}')">Buka</button> <button class="btn small" onclick="duplicateOrder('${o.id}')">Duplikat</button> <button class="btn small" onclick="printOrder('${o.id}','thermal')">Thermal</button> <button class="btn small" onclick="printOrder('${o.id}','f4')">Print</button> <button class="btn small danger" onclick="moveToTrash('${o.id}')">Hapus</button></td></tr>`}).join('')}</tbody></table></div>`}

function renderOrders(){const p=$('#page-orders');p.innerHTML=`<div class="panel" style="margin-top:0"><div class="toolbar"><input id="orderSearch" placeholder="Cari nomor nota atau pelanggan..." style="min-width:280px;padding:10px 12px;border:1px solid var(--line);border-radius:12px"><select id="statusFilter" class="btn"><option value="">Semua status</option>${['Baru Masuk','Diproses','Sablon','Jahit','Siap Diambil','Selesai'].map(x=>`<option>${x}</option>`).join('')}</select><span class="spacer"></span><button id="bulkDeleteBtn" class="btn danger" onclick="bulkTrash()" disabled>Hapus Terpilih (0)</button><button class="btn primary" onclick="startNew()">＋ Pesanan Baru</button></div><div id="ordersList" style="margin-top:16px"></div></div>`;const refresh=()=>{const q=$('#orderSearch').value.toLowerCase(),s=$('#statusFilter').value;const arr=[...db.orders].sort((a,b)=>b.createdAt-a.createdAt).filter(o=>(!q||o.invoice.toLowerCase().includes(q)||(o.customer||'').toLowerCase().includes(q))&&(!s||o.productionStatus===s));$('#ordersList').innerHTML=arr.length?ordersTable(arr,true):'<div class="empty">Pesanan tidak ditemukan.</div>'};$('#orderSearch').oninput=refresh;$('#statusFilter').onchange=refresh;refresh()}
window.toggleAllOrders=checked=>{$$('.order-check').forEach(x=>x.checked=checked);updateBulkCount()};
window.updateBulkCount=()=>{const n=$$('.order-check:checked').length,b=$('#bulkDeleteBtn');if(b){b.disabled=!n;b.textContent=`Hapus Terpilih (${n})`}};
window.moveToTrash=id=>{const o=db.orders.find(x=>x.id===id);if(!o)return;if(!confirm(`Pindahkan nota ${o.invoice} ke Sampah?`))return;o.deletedAt=new Date().toISOString();db.trash.unshift(o);db.orders=db.orders.filter(x=>x.id!==id);logActivity('Hapus ke Sampah',`${o.invoice} • ${o.customer||'-'}`);renderAll();toast('Nota dipindahkan ke Sampah.')};
window.bulkTrash=()=>{const ids=$$('.order-check:checked').map(x=>x.value);if(!ids.length||!confirm(`Pindahkan ${ids.length} nota ke Sampah?`))return;ids.forEach(id=>{const o=db.orders.find(x=>x.id===id);if(o){o.deletedAt=new Date().toISOString();db.trash.unshift(o)}});db.orders=db.orders.filter(o=>!ids.includes(o.id));logActivity('Hapus banyak ke Sampah',`${ids.length} nota`);renderAll();toast(`${ids.length} nota dipindahkan ke Sampah.`)};
window.duplicateOrder=id=>{const src=db.orders.find(x=>x.id===id);if(!src)return;const copy=structuredClone(src);copy.id=uid();copy.invoice=nextInvoice();copy.date=today();copy.createdAt=Date.now();copy.productionStatus='Baru Masuk';copy.paymentStatus='Belum Bayar';copy.deposit=0;copy.notes=(copy.notes?copy.notes+'\n':'')+`Duplikat dari ${src.invoice}`;db.orders.push(copy);logActivity('Duplikat Nota',`${src.invoice} → ${copy.invoice}`);renderAll();toast(`Nota diduplikasi menjadi ${copy.invoice}.`)};

function renderTrash(){const p=$('#page-trash');if(!p)return;const arr=[...db.trash].sort((a,b)=>String(b.deletedAt).localeCompare(String(a.deletedAt)));p.innerHTML=`<div class="panel" style="margin-top:0"><div class="toolbar"><h2>Sampah (${arr.length})</h2><span class="spacer"></span>${arr.length?'<button class="btn danger" onclick="emptyTrash()">Kosongkan Sampah</button>':''}</div>${arr.length?`<div class="table-wrap"><table><thead><tr><th>No. Nota</th><th>Pelanggan</th><th>Dihapus</th><th>Total</th><th>Aksi</th></tr></thead><tbody>${arr.map(o=>`<tr><td><strong>${o.invoice}</strong></td><td>${esc(o.customer||'-')}</td><td>${fmtDateTime(o.deletedAt)}</td><td>${money(orderTotals(o).total)}</td><td><button class="btn small" onclick="restoreOrder('${o.id}')">Pulihkan</button> <button class="btn small danger" onclick="permanentDelete('${o.id}')">Hapus Permanen</button></td></tr>`).join('')}</tbody></table></div>`:'<div class="empty">Sampah kosong. Nota yang dihapus akan tersimpan di sini.</div>'}</div>`}
window.restoreOrder=id=>{const o=db.trash.find(x=>x.id===id);if(!o)return;delete o.deletedAt;if(db.orders.some(x=>x.invoice===o.invoice))o.invoice=nextInvoice();db.orders.push(o);db.trash=db.trash.filter(x=>x.id!==id);logActivity('Pulihkan Nota',`${o.invoice} • ${o.customer||'-'}`);renderAll();toast('Nota berhasil dipulihkan.')};
window.permanentDelete=id=>{const o=db.trash.find(x=>x.id===id);if(!o)return;const typed=prompt(`Data ${o.invoice} tidak dapat dikembalikan. Ketik HAPUS untuk melanjutkan:`);if(typed!=='HAPUS')return;downloadJSON(o,`backup-sebelum-hapus-${o.invoice}.json`);db.trash=db.trash.filter(x=>x.id!==id);logActivity('Hapus Permanen',`${o.invoice} • backup otomatis diunduh`);renderAll();toast('Data dihapus permanen dan backup telah diunduh.')};
window.emptyTrash=()=>{if(!db.trash.length)return;const typed=prompt(`Semua ${db.trash.length} data akan hilang. Ketik KOSONGKAN:`);if(typed!=='KOSONGKAN')return;downloadJSON(db.trash,`backup-sampah-${today()}.json`);const n=db.trash.length;db.trash=[];logActivity('Kosongkan Sampah',`${n} data • backup otomatis diunduh`);renderAll();toast('Sampah dikosongkan.')};

function renderCustomers(){const p=$('#page-customers');if(!p)return;const map={};db.orders.forEach(o=>{const key=(o.phone||o.customer||'Tanpa Nama').trim().toLowerCase();if(!map[key])map[key]={name:o.customer||'Tanpa Nama',phone:o.phone||'',orders:0,total:0,balance:0,last:o.date};const c=map[key],t=orderTotals(o);c.orders++;c.total+=t.total;c.balance+=t.balance;if(o.date>c.last)c.last=o.date});const arr=Object.values(map).sort((a,b)=>b.last.localeCompare(a.last));p.innerHTML=`<div class="panel" style="margin-top:0"><div class="toolbar"><h2>Data Pelanggan</h2><span class="spacer"></span><input id="customerSearch" placeholder="Cari pelanggan..." style="padding:10px 12px;border:1px solid var(--line);border-radius:12px"></div><div id="customerList"></div></div>`;const refresh=()=>{const q=($('#customerSearch').value||'').toLowerCase();const f=arr.filter(c=>!q||c.name.toLowerCase().includes(q)||c.phone.includes(q));$('#customerList').innerHTML=f.length?`<div class="table-wrap"><table><thead><tr><th>Nama</th><th>WhatsApp</th><th>Pesanan</th><th>Total Nilai</th><th>Piutang</th><th>Terakhir</th></tr></thead><tbody>${f.map(c=>`<tr><td><strong>${esc(c.name)}</strong></td><td>${esc(c.phone||'-')}</td><td>${c.orders}</td><td>${money(c.total)}</td><td>${money(c.balance)}</td><td>${c.last}</td></tr>`).join('')}</tbody></table></div>`:'<div class="empty">Belum ada data pelanggan.</div>'};$('#customerSearch').oninput=refresh;refresh()}

function renderActivity(){const p=$('#page-activity');if(!p)return;p.innerHTML=`<div class="panel" style="margin-top:0"><div class="toolbar"><h2>Riwayat Aktivitas</h2><span class="spacer"></span><button class="btn" onclick="exportActivity()">Export</button><button class="btn danger" onclick="clearActivity()">Bersihkan</button></div>${db.activity.length?`<div class="table-wrap"><table><thead><tr><th>Waktu</th><th>Pengguna</th><th>Aktivitas</th><th>Detail</th></tr></thead><tbody>${db.activity.map(a=>`<tr><td>${fmtDateTime(a.time)}</td><td>${esc(a.user)}</td><td><strong>${esc(a.action)}</strong></td><td>${esc(a.detail||'-')}</td></tr>`).join('')}</tbody></table></div>`:'<div class="empty">Belum ada aktivitas tercatat.</div>'}</div>`}
window.exportActivity=()=>downloadJSON(db.activity,`aktivitas-shirogane-${today()}.json`);
window.clearActivity=()=>{if(confirm('Bersihkan seluruh riwayat aktivitas?')){db.activity=[];save();renderActivity();toast('Riwayat aktivitas dibersihkan.')}};

const originalSaveOrder=window.saveOrder;
window.saveOrder=(print=false)=>{const wasEdit=!!editingOrder;const inv=draft?.invoice;originalSaveOrder(print);logActivity(wasEdit?'Edit Nota':'Buat Nota',inv||'');};
const originalPrintOrder=window.printOrder;
window.printOrder=(id,type)=>{const o=db.orders.find(x=>x.id===id);if(o)logActivity('Cetak Nota',`${o.invoice} • ${type.toUpperCase()}`);originalPrintOrder(id,type)};

function renderSettings(){
 const page=$('#page-settings');
 if(!page)return;
 try{
  normalizeSettings();
  renderSettingsBase();
  const dz=page.querySelector('.danger-zone');
  if(dz){dz.innerHTML=`<h2>Keamanan & Pengelolaan Data</h2><div class="form-grid three"><div class="field"><label>Nama Admin/Pengguna</label><input id="sAdminName" value="${esc(db.settings.adminName||'Admin')}"></div></div><div class="toolbar" style="margin-top:14px"><button class="btn" onclick="saveAdminName()">Simpan Nama Pengguna</button><button class="btn" onclick="exportOrdersCSV()">Export Pesanan CSV</button><button class="btn" onclick="backupData()">Backup Lengkap JSON</button></div><hr style="border:0;border-top:1px solid var(--line);margin:20px 0"><h3>Reset Data Terpilih</h3><p>Pilih kategori yang ingin dihapus. Backup otomatis akan diunduh terlebih dahulu.</p><div class="reset-options"><label><input type="checkbox" id="rOrders"> Pesanan aktif</label><label><input type="checkbox" id="rTrash"> Sampah</label><label><input type="checkbox" id="rProducts"> Daftar harga</label><label><input type="checkbox" id="rActivity"> Aktivitas</label></div><button class="btn danger" onclick="resetSelectedData()">Reset Data Terpilih</button>`}
 }catch(err){
  console.error('Gagal membuka Pengaturan:',err);
  page.innerHTML=`<div class="panel" style="margin-top:0"><h2>Pengaturan perlu diperbaiki</h2><p>Data pengaturan lama tidak terbaca dengan benar. Data pesanan tidak akan dihapus.</p><button class="btn primary" onclick="repairSettings()">Perbaiki Pengaturan</button></div>`;
 }
}
window.repairSettings=()=>{const keep={logo:db.settings?.logo||'',customBankLogos:db.settings?.customBankLogos||{}};db.settings={...structuredClone(defaults.settings),...keep,adminName:'Admin'};save();renderAll();toast('Pengaturan berhasil diperbaiki.');};
window.saveAdminName=()=>{db.settings.adminName=($('#sAdminName').value||'Admin').trim();save();logActivity('Ubah Nama Pengguna',db.settings.adminName);renderAll();toast('Nama pengguna disimpan.')};
window.exportOrdersCSV=()=>{const rows=[['Nomor Nota','Tanggal','Pelanggan','WhatsApp','Status','Total','Panjar','Sisa'],...db.orders.map(o=>{const t=orderTotals(o);return[o.invoice,o.date,o.customer||'',o.phone||'',o.productionStatus,t.total,o.deposit||0,t.balance]})];const csv='\ufeff'+rows.map(r=>r.map(v=>'"'+String(v).replaceAll('"','""')+'"').join(',')).join('\n');const blob=new Blob([csv],{type:'text/csv;charset=utf-8'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`pesanan-shirogane-${today()}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),500);logActivity('Export CSV',`${db.orders.length} pesanan`)};
window.resetSelectedData=()=>{const keys=[];if($('#rOrders')?.checked)keys.push('orders');if($('#rTrash')?.checked)keys.push('trash');if($('#rProducts')?.checked)keys.push('products');if($('#rActivity')?.checked)keys.push('activity');if(!keys.length)return toast('Pilih data yang akan direset.');const typed=prompt(`Backup akan diunduh. Ketik RESET untuk menghapus: ${keys.join(', ')}`);if(typed!=='RESET')return;downloadJSON(db,`backup-sebelum-reset-${today()}.json`);if(keys.includes('orders'))db.orders=[];if(keys.includes('trash'))db.trash=[];if(keys.includes('products'))db.products=structuredClone(defaults.products);if(keys.includes('activity'))db.activity=[];logActivity('Reset Data',keys.join(', '));renderAll();toast('Data terpilih telah direset.')};

if('serviceWorker' in navigator){navigator.serviceWorker.getRegistrations().then(rs=>rs.forEach(r=>r.unregister())).catch(()=>{});} if('caches' in window){caches.keys().then(ks=>Promise.all(ks.map(k=>caches.delete(k)))).catch(()=>{});}
renderAll();




/* Final: fit receipt values to their actual boxes without clipping. */
(function installReceiptAutoFit(){
  function fit(el,maxPx,minPx,origin='center'){
    if(!el||!el.isConnected)return;
    el.style.fontSize=maxPx+'px';
    el.style.whiteSpace='nowrap';
    el.style.transform='none';
    el.style.transformOrigin=origin+' center';
    const parent=el.parentElement;
    const available=Math.max(0,(parent?.clientWidth||el.clientWidth)-4);
    if(!available)return;
    let size=maxPx;
    while(size>minPx && el.scrollWidth>available){
      size-=1;
      el.style.fontSize=size+'px';
    }
    if(el.scrollWidth>available){
      const scale=Math.max(.82,available/el.scrollWidth);
      el.style.transform=`scaleX(${scale})`;
    }
  }
  function apply(){
    document.querySelectorAll('.preview .summary-row.balance>span:last-child').forEach(e=>fit(e,34,23,'center'));
    document.querySelectorAll('.preview .payment-bank strong').forEach(e=>fit(e,15,10,'left'));
  }
  let raf=0;
  const schedule=()=>{cancelAnimationFrame(raf);raf=requestAnimationFrame(apply)};
  new MutationObserver(schedule).observe(document.body,{subtree:true,childList:true,characterData:true});
  if(window.ResizeObserver)new ResizeObserver(schedule).observe(document.body);
  addEventListener('resize',schedule);
  document.fonts?.ready?.then(schedule);
  schedule();
})();
