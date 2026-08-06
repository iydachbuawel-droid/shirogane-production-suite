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
    const previous={boxShadow:element.style.boxShadow,margin:element.style.margin,background:element.style.background};
    element.classList.add('pdf-capture-active');
    element.style.boxShadow='none'; element.style.margin='0'; element.style.background='#fff';
    try{
      const canvas=await window.html2canvas(element,{scale:2,useCORS:true,allowTaint:true,backgroundColor:'#ffffff',logging:false,scrollX:0,scrollY:-window.scrollY,windowWidth:Math.max(element.scrollWidth,element.clientWidth)});
      const pdf=new JsPDF({orientation:'portrait',unit:'mm',format:'a4',compress:true});
      const pageW=210,pageH=297,margin=8,printW=pageW-margin*2,printH=pageH-margin*2;
      const pxPerMm=canvas.width/printW;
      const slicePx=Math.floor(printH*pxPerMm);
      let y=0,page=0;
      while(y<canvas.height){
        const h=Math.min(slicePx,canvas.height-y);
        const part=document.createElement('canvas'); part.width=canvas.width; part.height=h;
        part.getContext('2d').drawImage(canvas,0,y,canvas.width,h,0,0,canvas.width,h);
        const img=part.toDataURL('image/jpeg',0.94);
        if(page>0)pdf.addPage();
        const hMm=h/pxPerMm;
        pdf.addImage(img,'JPEG',margin,margin,printW,hMm,undefined,'FAST');
        y+=h; page++;
      }
      pdf.save((filename||'Nota-SHIROGANE.pdf').replace(/\.pdf$/i,'')+'.pdf');
    } finally {
      element.classList.remove('pdf-capture-active');
      element.style.boxShadow=previous.boxShadow;element.style.margin=previous.margin;element.style.background=previous.background;
    }
  }
  window.SHROGANE_downloadPreviewPdf=downloadElementPdf;
  window.SHROGANE_safePdfName=safeName;
})();
