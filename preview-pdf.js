(function(){
  'use strict';
  // SHIROGANE PDF v4: A4 landscape, teks dan garis tabel berupa objek PDF vektor.
  // Gambar logo/desain tetap boleh menjadi gambar tersendiri; halaman tidak pernah dirasterkan.
  const PAGE_W=297, PAGE_H=210, M=8, CONTENT_W=PAGE_W-M*2;
  const C={ink:[17,24,39],muted:[100,116,139],line:[203,213,225],pale:[248,250,252],white:[255,255,255]};
  function clean(s){return String(s??'').replace(/\s+/g,' ').trim()}
  function txt(el){return clean(el?.innerText||el?.textContent||'')}
  function moneyText(s){return clean(s)}
  function safeName(v){return String(v||'SHIROGANE').replace(/[^a-zA-Z0-9_-]+/g,'-').replace(/^-+|-+$/g,'')||'SHIROGANE'}
  function color(pdf,c){pdf.setTextColor(...c)}
  function line(pdf,x1,y1,x2,y2,c=C.line,w=.2){pdf.setDrawColor(...c);pdf.setLineWidth(w);pdf.line(x1,y1,x2,y2)}
  function rect(pdf,x,y,w,h,fill,stroke=C.line,r=0){if(fill)pdf.setFillColor(...fill);if(stroke)pdf.setDrawColor(...stroke);pdf.setLineWidth(.2);pdf.roundedRect(x,y,w,h,r,r,fill&&stroke?'FD':fill?'F':'S')}
  function wrap(pdf,s,max,font=8,style='normal'){pdf.setFont('helvetica',style);pdf.setFontSize(font);return pdf.splitTextToSize(clean(s),max)}
  function addText(pdf,s,x,y,opt={}){const {size=8,bold=false,color:c=C.ink,align='left',maxWidth,leading=1.15}=opt;pdf.setFont('helvetica',bold?'bold':'normal');pdf.setFontSize(size);color(pdf,c);const lines=maxWidth?pdf.splitTextToSize(clean(s),maxWidth):[String(s??'')];pdf.text(lines,x,y,{align,maxWidth});return Math.max(1,lines.length)*size*0.3528*leading}
  async function imageReady(img){if(!img)return; if(img.complete)return; await Promise.race([new Promise(r=>{img.onload=r;img.onerror=r}),new Promise(r=>setTimeout(r,2500))])}
  function imageData(img){try{if(!img||!img.complete||!img.naturalWidth)return null;const src=img.currentSrc||img.src;if(src.startsWith('data:'))return src;const c=document.createElement('canvas');c.width=img.naturalWidth;c.height=img.naturalHeight;c.getContext('2d').drawImage(img,0,0);return c.toDataURL('image/png')}catch(_){return null}}
  function fitImage(pdf,img,x,y,w,h){const data=imageData(img);if(!data)return;try{const p=pdf.getImageProperties(data),r=Math.min(w/p.width,h/p.height),iw=p.width*r,ih=p.height*r;pdf.addImage(data,'PNG',x+(w-iw)/2,y+(h-ih)/2,iw,ih)}catch(_){}}
  function find(root,selectors){for(const s of selectors){const el=root.querySelector(s);if(el)return el}return null}
  function collect(root){
    const table=root.querySelector('table');
    const rows=table?[...table.querySelectorAll('tr')].map(tr=>[...tr.children].map(td=>txt(td))):[];
    const header=find(root,['.head','.receipt-head']);
    const logo=find(root,['.logo','.receipt-logo img','.receipt-head img','.branded img']);
    const brand=find(root,['.brand h1','.receipt-head h3','.receipt-head h2','h1','h3']);
    const brandParas=header?[...header.querySelectorAll('p')].map(txt).filter(Boolean):[];
    const badge=find(root,['.badge']);
    const meta=find(root,['.meta','.receipt-meta']);
    const metaItems=meta?[...meta.children].map(txt).filter(Boolean):[];
    const totals=find(root,['.totals','.summary']);
    const totalRows=totals?[...totals.querySelectorAll(':scope > .row, :scope > .summary-row')].map(el=>({text:txt(el),left:txt(el.querySelector('span,small')),right:txt(el.querySelector('b'))||txt(el.querySelectorAll('span').length>1?el.querySelectorAll('span')[1]:null),cls:el.className})):[];
    const extraTitles=totals?[...totals.querySelectorAll('.extra-title')].map(txt):[];
    const payment=find(root,['.payment','.payment-bank']);
    const notes=find(root,['p b','p']);
    const noteText=[...root.querySelectorAll('p')].map(txt).find(s=>/^Catatan:/i.test(s))||'';
    const designs=[...root.querySelectorAll('.design img,.thumb img,.designs img,.thumbs img')].slice(0,3);
    const footer=find(root,['.foot']);
    const thanks=[...root.querySelectorAll('p')].map(txt).find(s=>s.startsWith('Terima kasih'))||txt(footer);
    return {table,rows,header,logo,brand:txt(brand)||'SHIROGANE',brandParas,badge:txt(badge),metaItems,totalRows,extraTitles,payment,paymentText:txt(payment),noteText,designs,thanks};
  }
  async function downloadElementPdf(root,filename){
    if(!root)throw new Error('Area nota tidak ditemukan.');
    const JsPDF=window.jspdf?.jsPDF;if(!JsPDF)throw new Error('jsPDF belum dimuat. Periksa koneksi internet lalu muat ulang aplikasi.');
    await Promise.all([...root.querySelectorAll('img')].map(imageReady));
    const d=collect(root);
    const pdf=new JsPDF({orientation:'landscape',unit:'mm',format:'a4',compress:true});
    let y=M;
    const newPage=()=>{pdf.addPage('a4','landscape');y=M};
    const ensure=h=>{if(y+h>PAGE_H-M){newPage()}};
    // Header
    if(d.logo){fitImage(pdf,d.logo,M,y,18,18)}
    const bx=d.logo?M+22:M;
    addText(pdf,d.brand,bx,y+6,{size:17,bold:true});
    let by=y+10;
    for(const p of d.brandParas.slice(0,2)){by+=addText(pdf,p,bx,by,{size:7.5,color:C.muted,maxWidth:175})+1}
    if(d.badge){const bw=Math.min(48,Math.max(23,d.badge.length*2.0+8));rect(pdf,PAGE_W-M-bw,y+1,bw,8,C.ink,C.ink,3);addText(pdf,d.badge,PAGE_W-M-bw/2,y+6.2,{size:7,bold:true,color:C.white,align:'center'})}
    y=Math.max(y+21,by+1);line(pdf,M,y, PAGE_W-M,y,C.ink,.8);y+=4;
    // Metadata in four equal cards
    const meta=d.metaItems.length?d.metaItems:[];
    if(meta.length){const gap=3,w=(CONTENT_W-gap*3)/4,h=13;meta.slice(0,4).forEach((s,i)=>{const x=M+i*(w+gap);rect(pdf,x,y,w,h,null,C.line,1.5);const m=s.match(/^([^:]+):?\s*(.*)$/);addText(pdf,m?.[1]||s,x+3,y+4,{size:6.5,color:C.muted});addText(pdf,m?.[2]||'',x+3,y+9,{size:8,bold:true,maxWidth:w-6})});y+=h+5}
    // Item table with a compact 13-column layout that fits A4 landscape.
    if(d.rows.length){
      const heads=d.rows[0];const data=d.rows.slice(1);const n=heads.length;
      let widths;
      if(n>=13){widths=[48,...Array(n-4).fill(10.3),13,31,34]}else{const first=52,remain=CONTENT_W-first; widths=[first,...Array(n-1).fill(remain/Math.max(1,n-1))]}
      // Ensure widths sum to available page width.
      const sum=widths.reduce((a,b)=>a+b,0);widths=widths.map(v=>v*CONTENT_W/sum);
      const rowH=7.2;ensure(rowH+3);
      let x=M;rect(pdf,M,y,CONTENT_W,rowH,C.pale,C.line,0);
      heads.forEach((h,i)=>{addText(pdf,h,x+widths[i]/2,y+4.6,{size:6.2,bold:true,color:C.muted,align:'center',maxWidth:widths[i]-.8});x+=widths[i]});y+=rowH;
      for(const row of data){
        const first=wrap(pdf,row[0]||'',widths[0]-3,7,'bold');const h=Math.max(7.1,first.length*3.1+3);ensure(h);
        x=M;pdf.setDrawColor(...C.line);pdf.setLineWidth(.15);pdf.rect(M,y,CONTENT_W,h);
        for(let i=0;i<heads.length;i++){if(i>0)line(pdf,x,y,x,y+h,C.line,.12);const v=row[i]||'';if(i===0){pdf.setFont('helvetica','bold');pdf.setFontSize(7);color(pdf,C.ink);pdf.text(first,x+1.5,y+3.2,{maxWidth:widths[i]-3})}else{addText(pdf,v,x+widths[i]/2,y+4.5,{size:(i>=heads.length-2?6.1:6.5),align:'center',maxWidth:widths[i]-.7})}x+=widths[i]}
        y+=h;
      }
      y+=4;
    }
    // Totals, one line per item; emphasize total and balance.
    for(const r of d.totalRows){
      const isBalance=/balance/.test(r.cls),isTotal=/total/.test(r.cls)&&!isBalance;
      const h=isBalance?12:isTotal?9:5.5;ensure(h+1);
      if(isBalance)rect(pdf,PAGE_W-M-90,y,90,h,C.ink,C.ink,2);
      else if(isTotal)line(pdf,PAGE_W-M-90,y,PAGE_W-M,y,C.line,.6);
      const leftX=isBalance?PAGE_W-M-86:PAGE_W-M-90;
      addText(pdf,r.left||r.text,leftX,y+(isBalance?7.5:isTotal?5.8:3.8),{size:isBalance?9:isTotal?9:7,bold:isBalance||isTotal,color:isBalance?C.white:C.ink,maxWidth:63});
      addText(pdf,r.right||'',PAGE_W-M-4,y+(isBalance?7.5:isTotal?5.8:3.8),{size:isBalance?9:isTotal?9:7,bold:isBalance||isTotal,color:isBalance?C.white:C.ink,align:'right',maxWidth:28});
      y+=h;
    }
    y+=2;
    if(d.paymentText){ensure(15);rect(pdf,M,y,CONTENT_W,14,null,C.line,2);addText(pdf,d.paymentText,M+4,y+5,{size:7,maxWidth:CONTENT_W-8});y+=17}
    if(d.noteText){const nt=d.noteText.replace(/^Catatan:\s*/i,'');const lines=wrap(pdf,nt,CONTENT_W-3,8);const h=lines.length*4+5;ensure(h);addText(pdf,'Catatan: '+nt,M,y+4,{size:8,maxWidth:CONTENT_W-3});y+=h}
    if(d.designs.length){const w=Math.min(65,(CONTENT_W-4*(d.designs.length-1))/d.designs.length);ensure(48);for(let i=0;i<d.designs.length;i++){const x=M+i*(w+4);rect(pdf,x,y,w,43,null,C.line,1.5);fitImage(pdf,d.designs[i],x+2,y+2,w-4,39)}y+=47}
    if(d.thanks){ensure(8);line(pdf,M,y,PAGE_W-M,y,C.line,.2);addText(pdf,d.thanks,PAGE_W/2,y+5,{size:7,color:C.muted,align:'center',maxWidth:CONTENT_W});}
    pdf.save((filename||'Nota-SHIROGANE.pdf').replace(/\.pdf$/i,'')+'.pdf');
  }
  window.SHROGANE_downloadPreviewPdf=downloadElementPdf;
  window.SHROGANE_safePdfName=safeName;
})();
