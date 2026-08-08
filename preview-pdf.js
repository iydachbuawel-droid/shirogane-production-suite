(function(){
  'use strict';

  async function waitImages(root){
    const imgs=[...root.querySelectorAll('img')];
    await Promise.all(imgs.map(img=>img.complete?Promise.resolve():new Promise(resolve=>{img.onload=img.onerror=resolve;})));
    if(document.fonts?.ready){try{await document.fonts.ready}catch{}}
  }

  function safeName(value){
    return String(value||'SHIROGANE').replace(/[^a-zA-Z0-9_-]+/g,'-').replace(/^-+|-+$/g,'')||'SHIROGANE';
  }

  async function downloadElementPdf(element, filename){
    if(!element)throw new Error('Area preview tidak ditemukan.');
    if(typeof window.html2canvas!=='function')throw new Error('html2canvas belum dimuat.');
    const JsPDF=window.jspdf?.jsPDF;
    if(!JsPDF)throw new Error('jsPDF belum dimuat.');

    await waitImages(element);

    const previous={
      boxShadow:element.style.boxShadow,
      margin:element.style.margin,
      background:element.style.background,
      transform:element.style.transform,
      transformOrigin:element.style.transformOrigin,
      overflow:element.style.overflow
    };

    element.classList.add('pdf-capture-active');
    element.style.boxShadow='none';
    element.style.margin='0';
    element.style.background='#fff';
    element.style.transform='none';
    element.style.transformOrigin='top left';
    element.style.overflow='visible';

    try{
      // Capture SELURUH preview persis seperti yang terlihat, tanpa membelah elemen.
      const rect=element.getBoundingClientRect();
      const captureWidth=Math.ceil(Math.max(element.scrollWidth,rect.width));
      const captureHeight=Math.ceil(Math.max(element.scrollHeight,rect.height));

      const canvas=await window.html2canvas(element,{
        scale:2,
        useCORS:true,
        allowTaint:true,
        backgroundColor:'#ffffff',
        logging:false,
        scrollX:0,
        scrollY:0,
        width:captureWidth,
        height:captureHeight,
        windowWidth:Math.max(document.documentElement.scrollWidth,captureWidth),
        windowHeight:Math.max(document.documentElement.scrollHeight,captureHeight)
      });

      if(!canvas.width || !canvas.height)throw new Error('Preview gagal ditangkap.');

      // v3.0.13: PDF digital mengikuti rasio preview dan dibuat SATU HALAMAN.
      // Tidak lagi memotong canvas setiap tinggi A4, sehingga kotak Sisa Pembayaran,
      // rekening, mockup, dan footer tidak pernah terbelah di tengah.
      const pageW=210; // lebar PDF tetap nyaman dibuka/dibagikan
      const margin=8;
      const drawW=pageW-(margin*2);
      const drawH=drawW*(canvas.height/canvas.width);
      const pageH=drawH+(margin*2);

      const orientation=pageH>=pageW?'portrait':'landscape';
      const pdf=new JsPDF({
        orientation,
        unit:'mm',
        format:[pageW,pageH],
        compress:true,
        hotfixes:['px_scaling']
      });

      const img=canvas.toDataURL('image/jpeg',0.97);
      pdf.addImage(img,'JPEG',margin,margin,drawW,drawH,undefined,'FAST');
      pdf.save((filename||'Nota-SHIROGANE.pdf').replace(/\.pdf$/i,'')+'.pdf');
    } finally {
      element.classList.remove('pdf-capture-active');
      element.style.boxShadow=previous.boxShadow;
      element.style.margin=previous.margin;
      element.style.background=previous.background;
      element.style.transform=previous.transform;
      element.style.transformOrigin=previous.transformOrigin;
      element.style.overflow=previous.overflow;
    }
  }

  window.SHROGANE_downloadPreviewPdf=downloadElementPdf;
  window.SHROGANE_safePdfName=safeName;
})();
