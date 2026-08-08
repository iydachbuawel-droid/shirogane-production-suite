(function(){
  'use strict';
  async function waitImages(root){
    const imgs=[...root.querySelectorAll('img')];
    await Promise.all(imgs.map(img=>img.complete?Promise.resolve():new Promise(resolve=>{img.onload=img.onerror=resolve;})));
    if(document.fonts?.ready){try{await document.fonts.ready}catch{}}
  }
  function safeName(value){return String(value||'SHIROGANE').replace(/[^a-zA-Z0-9_-]+/g,'-').replace(/^-+|-+$/g,'')||'SHIROGANE';}

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
      transformOrigin:element.style.transformOrigin
    };

    element.classList.add('pdf-capture-active');
    element.style.boxShadow='none';
    element.style.margin='0';
    element.style.background='#fff';
    element.style.transform='none';
    element.style.transformOrigin='top left';

    try{
      // Capture ukuran ASLI preview. Jangan diregangkan ke lebar printable A4.
      const captureWidth=Math.ceil(Math.max(element.scrollWidth,element.getBoundingClientRect().width));
      const captureHeight=Math.ceil(Math.max(element.scrollHeight,element.getBoundingClientRect().height));
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

      const pdf=new JsPDF({orientation:'portrait',unit:'mm',format:'a4',compress:true});
      const pageW=210,pageH=297;
      const pageMargin=10;                 // sama dengan @page preview desktop
      const previewW=165;                  // sama dengan .f4-print di styles.css
      const maxH=pageH-(pageMargin*2);
      const drawW=Math.min(previewW,pageW-(pageMargin*2));
      const pxPerMm=canvas.width/drawW;
      const totalHmm=canvas.height/pxPerMm;
      const x=(pageW-drawW)/2;

      // Jika seluruh preview muat di satu A4, simpan utuh dalam satu halaman.
      if(totalHmm<=maxH){
        const img=canvas.toDataURL('image/jpeg',0.96);
        pdf.addImage(img,'JPEG',x,pageMargin,drawW,totalHmm,undefined,'FAST');
      }else{
        // Hanya pecah halaman bila preview memang lebih tinggi dari area cetak A4.
        const slicePx=Math.floor(maxH*pxPerMm);
        let y=0,page=0;
        while(y<canvas.height){
          const h=Math.min(slicePx,canvas.height-y);
          const part=document.createElement('canvas');
          part.width=canvas.width; part.height=h;
          part.getContext('2d').drawImage(canvas,0,y,canvas.width,h,0,0,canvas.width,h);
          if(page>0)pdf.addPage();
          pdf.addImage(part.toDataURL('image/jpeg',0.96),'JPEG',x,pageMargin,drawW,h/pxPerMm,undefined,'FAST');
          y+=h; page++;
        }
      }

      pdf.save((filename||'Nota-SHIROGANE.pdf').replace(/\.pdf$/i,'')+'.pdf');
    } finally {
      element.classList.remove('pdf-capture-active');
      element.style.boxShadow=previous.boxShadow;
      element.style.margin=previous.margin;
      element.style.background=previous.background;
      element.style.transform=previous.transform;
      element.style.transformOrigin=previous.transformOrigin;
    }
  }

  window.SHROGANE_downloadPreviewPdf=downloadElementPdf;
  window.SHROGANE_safePdfName=safeName;
})();
