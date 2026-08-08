(function(){
  'use strict';

  async function waitImages(root){
    const imgs=[...root.querySelectorAll('img')];
    await Promise.all(imgs.map(img=>{
      // Jika browser sudah selesai memuat gambar (berhasil ATAU gagal), jangan
      // menunggu event load/error lagi. Event itu mungkin sudah terjadi sebelum
      // fungsi ini memasang handler dan sebelumnya membuat tombol PDF macet.
      if(img.complete)return Promise.resolve();
      return new Promise(resolve=>{
        let done=false;
        const finish=()=>{
          if(done)return;
          done=true;
          clearTimeout(timer);
          img.removeEventListener('load',finish);
          img.removeEventListener('error',finish);
          resolve();
        };
        img.addEventListener('load',finish,{once:true});
        img.addEventListener('error',finish,{once:true});
        // Jangan pernah biarkan satu gambar jaringan menahan proses PDF selamanya.
        const timer=setTimeout(finish,3500);
      });
    }));
    if(document.fonts?.ready){
      try{await Promise.race([document.fonts.ready,new Promise(r=>setTimeout(r,2500))])}catch{}
    }
  }

  function safeName(value){
    return String(value||'SHIROGANE').replace(/[^a-zA-Z0-9_-]+/g,'-').replace(/^-+|-+$/g,'')||'SHIROGANE';
  }

  function buildExactClone(element){
    const rect=element.getBoundingClientRect();
    const width=Math.max(1,Math.ceil(rect.width));

    const host=document.createElement('div');
    host.setAttribute('data-shirogane-pdf-capture','true');
    host.style.cssText=[
      'position:fixed',
      'left:-100000px',
      'top:0',
      'z-index:-2147483647',
      'margin:0',
      'padding:0',
      'background:#fff',
      'overflow:visible',
      'pointer-events:none'
    ].join(';');

    const clone=element.cloneNode(true);
    clone.removeAttribute('id');
    clone.classList.add('pdf-exact-clone');
    clone.style.setProperty('width',width+'px','important');
    clone.style.setProperty('min-width',width+'px','important');
    clone.style.setProperty('max-width',width+'px','important');
    clone.style.setProperty('height','auto','important');
    clone.style.setProperty('min-height','0','important');
    clone.style.setProperty('max-height','none','important');
    clone.style.setProperty('margin','0','important');
    clone.style.setProperty('transform','none','important');
    clone.style.setProperty('transform-origin','top left','important');
    clone.style.setProperty('box-shadow','none','important');
    clone.style.setProperty('overflow','visible','important');
    clone.style.setProperty('background','#fff','important');

    // Hilangkan kontrol yang memang tidak menjadi bagian nota jika fungsi ini
    // dipakai dari halaman nota publik.
    clone.querySelectorAll('.no-print,.actions,.preview-toolbar').forEach(el=>el.remove());

    host.appendChild(clone);
    document.body.appendChild(host);
    return {host,clone,width};
  }

  async function downloadElementPdf(element,filename){
    if(!element)throw new Error('Area preview tidak ditemukan.');
    if(typeof window.html2canvas!=='function')throw new Error('html2canvas belum dimuat.');
    const JsPDF=window.jspdf?.jsPDF;
    if(!JsPDF)throw new Error('jsPDF belum dimuat.');

    await waitImages(element);

    const {host,clone,width}=buildExactClone(element);
    try{
      await waitImages(clone);
      // Tunggu satu frame agar layout clone benar-benar selesai dihitung browser.
      await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));

      const captureWidth=width;
      const captureHeight=Math.max(1,Math.ceil(clone.getBoundingClientRect().height),clone.scrollHeight);

      const canvas=await window.html2canvas(clone,{
        scale:2,
        useCORS:true,
        allowTaint:true,
        backgroundColor:'#ffffff',
        logging:false,
        scrollX:0,
        scrollY:0,
        x:0,
        y:0,
        width:captureWidth,
        height:captureHeight,
        windowWidth:window.innerWidth,
        windowHeight:Math.max(window.innerHeight,captureHeight),
        removeContainer:true
      });

      if(!canvas.width||!canvas.height)throw new Error('Preview gagal ditangkap.');

      // v3.0.14:
      // 1. PDF memakai ukuran dokumen yang mengikuti ukuran PREVIEW.
      // 2. Tidak ada lagi pemotongan A4/F4 dan tidak ada page slicing.
      // 3. Seluruh preview diraster sebagai SATU gambar lalu dimasukkan ke SATU halaman PDF.
      // 4. Rasio dipertahankan, sehingga tidak ada sisi kanan/bawah yang terpotong.
      const PX_TO_MM=25.4/96;
      const contentW=canvas.width/2*PX_TO_MM;
      const contentH=canvas.height/2*PX_TO_MM;
      const bleed=0.8; // ruang aman agar rounding PDF tidak memotong tepi
      const pageW=contentW+bleed;
      const pageH=contentH+bleed;
      const offset=bleed/2;
      const orientation=pageW>pageH?'landscape':'portrait';

      const pdf=new JsPDF({
        orientation,
        unit:'mm',
        format:[pageW,pageH],
        compress:true,
        hotfixes:['px_scaling']
      });

      const actualW=pdf.internal.pageSize.getWidth();
      const actualH=pdf.internal.pageSize.getHeight();
      const targetW=actualW-bleed;
      const targetH=actualH-bleed;
      const ratio=Math.min(targetW/contentW,targetH/contentH);
      const drawW=contentW*ratio;
      const drawH=contentH*ratio;
      const x=(actualW-drawW)/2;
      const y=(actualH-drawH)/2;

      const img=canvas.toDataURL('image/png');
      pdf.addImage(img,'PNG',x,y,drawW,drawH,undefined,'FAST');
      pdf.save((filename||'Nota-SHIROGANE.pdf').replace(/\.pdf$/i,'')+'.pdf');
    } finally {
      host.remove();
    }
  }

  window.SHROGANE_downloadPreviewPdf=downloadElementPdf;
  window.SHROGANE_safePdfName=safeName;
})();
