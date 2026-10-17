export function undercutPrice(price,minimum,maximum){
 if(![price,minimum,maximum].every(Number.isSafeInteger)||price<=0||minimum<=0||maximum<minimum)throw Error('Limites de prix FC indisponibles.');
 const step=price<=1000?50:price<=10000?100:price<=50000?250:price<=100000?500:1000;
 return Math.max(minimum,Math.min(maximum,price-step));
}
export function installSalePrice(undercut,market){
 window.__satoSaleCleanup?.();
 let busy=false;const selectedItems=new WeakMap();
 function tick(){try{if(document.hidden)return;const q=[window._appMain?._rootViewController],seen=new Set();while(q.length&&seen.size<150){const n=q.shift();if(!n||seen.has(n))continue;seen.add(n);
  const quick=n.panel?.quickListView,root=quick?.getRootElement?.();
  if(root?.isConnected&&root.getClientRects().length&&quick._btnToggle?.getRootElement?.().classList.contains('open')){
   const selected=n.viewmodel?._collection?.[n.viewmodel._index];
   if(root.querySelector('.satodce-sale-price')&&selectedItems.get(root)===selected)continue;
   if(busy)continue;
   root.querySelector('.satodce-sale-price')?.remove();
   selectedItems.set(root,selected);
   if(selected?.type!=='player')continue;
   const button=document.createElement('button');button.type='button';button.className='satodce-sale-price';button.textContent='↓ Un palier sous le moins cher du marché';button.style.cssText='display:block;box-sizing:border-box;width:calc(100% - 16px);margin:8px;padding:12px;border:1px solid #83b2ff;border-radius:12px;background:#245fc5;color:white;font:bold 14px system-ui;white-space:normal;touch-action:manipulation;';
   root.insertBefore(button,root.firstChild);
   const updatePrice=async()=>{if(busy)return;busy=true;button.disabled=true;button.textContent='Recherche du moins cher sur tout le marché…';try{
    const item=n.viewmodel?._collection?.[n.viewmodel._index],id=item?.definitionId;
    if(item?.type!=='player'||!Number.isSafeInteger(id))throw Error('Carte joueur indisponible.');
    const limits=item._itemPriceLimits;if(!limits)throw Error('Limites FC indisponibles.');
    const found=await market.find({definitionId:id,excludeId:item.id,minimum:limits.minimum,maximum:limits.maximum},{search:market.search,wait:ms=>new Promise(r=>setTimeout(r,ms)),undercut});
    if(n.viewmodel._collection[n.viewmodel._index]!==item||!root.isConnected||!quick._btnToggle?.getRootElement?.().classList.contains('open'))throw Error('La carte sélectionnée a changé.');
    if(found.price===null){button.textContent='Aucune offre sur le marché : choisis ton prix.';return;}
    // Buy now must stay above the start price, whose lowest value is the FC minimum.
    const floor=Math.min(limits.maximum,limits.minimum+(limits.minimum<1000?50:limits.minimum<10000?100:limits.minimum<50000?250:limits.minimum<100000?500:1000));
    const price=Math.max(floor,undercut(found.price,limits.minimum,limits.maximum));
    quick.setBidValue(undercut(price,limits.minimum,limits.maximum));quick.setBuyNowValue(price);
    button.textContent=(price<found.price?'Marché : '+found.price.toLocaleString('fr-FR')+' → Vente : '+price.toLocaleString('fr-FR')+' cr.':'Marché : '+found.price.toLocaleString('fr-FR')+' → plus bas possible sur FC : '+price.toLocaleString('fr-FR')+' cr.')+(found.verified?'':' (vérification partielle)');
   }catch(e){button.textContent=e.message+' Réessaie dans quelques secondes.';}finally{busy=false;button.disabled=false;}};
   market.onTap(button,updatePrice);
   void updatePrice();
  }
  for(const key of ['currentController','leftController','rightController','childViewControllers']){const v=n[key];if(Array.isArray(v))q.push(...v);else if(v)q.push(v);}
 }}catch{}}
 const timer=setInterval(tick,1000);tick();window.__satoSaleCleanup=()=>{clearInterval(timer);document.querySelectorAll('.satodce-sale-price').forEach(e=>e.remove());};
}
