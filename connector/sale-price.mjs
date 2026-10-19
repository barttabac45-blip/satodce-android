export function undercutPrice(price,minimum,maximum){
 if(![price,minimum,maximum].every(Number.isSafeInteger)||price<=0||minimum<=0||maximum<minimum)throw Error('Limites de prix FC indisponibles.');
 const step=price<=1000?50:price<=10000?100:price<=50000?250:price<=100000?500:1000;
 return Math.max(minimum,Math.min(maximum,price-step));
}
export function installSalePrice(undercut,compare){
 window.__satoSaleCleanup?.();let disposed=false,busy=false,cancelled=false;
 const selectedItems=new WeakMap();
 function tick(){try{if(document.hidden)return;const q=[window._appMain?._rootViewController],seen=new Set();while(q.length&&seen.size<150){const n=q.shift();if(!n||seen.has(n))continue;seen.add(n);
  const quick=n.panel?.quickListView,root=quick?.getRootElement?.();
  const open=root?.isConnected&&root.getClientRects().length&&quick._btnToggle?.getRootElement?.().classList.contains('open');
  if(root&&!open&&!busy)selectedItems.delete(root);
  if(open){
   const selected=n.viewmodel?._collection?.[n.viewmodel._index];
   if(!busy&&selected?.type==='player'&&selectedItems.get(root)!==selected){
    selectedItems.set(root,selected);root.querySelector('.satodce-sale-price')?.remove();
    const button=document.createElement('button');button.type='button';button.className='satodce-sale-price';button.textContent='Comparer le marché et préremplir';root.insertBefore(button,root.firstChild);
    const run=async()=>{
     if(busy){cancelled=true;button.textContent='Arrêt de la comparaison…';return;}
     if(window.__satoPriceScanBusy){button.textContent='Une comparaison est déjà en cours.';return;}
     busy=true;cancelled=false;window.__satoPriceScanBusy=true;window.__satoCancelPriceScan=()=>{cancelled=true;};
     const item=n.viewmodel?._collection?.[n.viewmodel._index];
     const unchanged=()=>!disposed&&!cancelled&&root.isConnected&&n.viewmodel?._collection?.[n.viewmodel._index]===item&&quick._btnToggle?.getRootElement?.().classList.contains('open');
     try{
      if(item?.type!=='player'||!Number.isSafeInteger(item.definitionId))throw Error('Carte joueur indisponible.');
      const limits=item._itemPriceLimits;if(!limits)throw Error('Limites FC indisponibles.');
      button.textContent='Comparaison du marché… Appuie pour arrêter.';
      const found=await compare(item,{isCancelled:()=>!unchanged(),onProgress:pages=>{button.textContent='Arrêter — '+pages+' page(s) consultée(s)';}});
      if(!unchanged())throw Error('Comparaison interrompue : prix inchangés.');
      if(!found.verified)throw Error('Comparaison incomplète : prix inchangés.');
      if(found.price===null){button.textContent='Aucune offre disponible : choisis ton prix.';return;}
      const min=limits.minimum,max=limits.maximum;
      const floor=Math.min(max,min+(min<1000?50:min<10000?100:min<50000?250:min<100000?500:1000));
      const price=Math.max(floor,undercut(found.price,min,max));
      quick.setBidValue(undercut(price,min,max));quick.setBuyNowValue(price);
      button.textContent='Marché : '+found.price.toLocaleString('fr-FR')+' → Vente : '+price.toLocaleString('fr-FR')+' cr. — Refaire la comparaison';
     }catch(e){button.textContent=e.message+' Appuie pour réessayer.';}finally{busy=false;window.__satoPriceScanBusy=false;window.__satoCancelPriceScan=null;}
    };
    button.addEventListener('click',run);void run();
   }
  }
  for(const key of ['currentController','leftController','rightController','childViewControllers']){const v=n[key];if(Array.isArray(v))q.push(...v);else if(v)q.push(v);}
 }}catch{}}
 const timer=setInterval(tick,1000);tick();window.__satoSaleCleanup=()=>{disposed=true;cancelled=true;clearInterval(timer);document.querySelectorAll('.satodce-sale-price').forEach(e=>e.remove());};
}
