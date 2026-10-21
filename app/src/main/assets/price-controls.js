(()=>{
 if(window.__satoAlbumPriceInstalled)return;window.__satoAlbumPriceInstalled=true;
 document.addEventListener('click',event=>{
  const button=event.target.closest?.('.gallery-player [data-buy]');if(!button)return;
  const price=Number(button.closest('.gallery-player')?.querySelector('[data-price]')?.dataset.price);
  if(!Number.isFinite(price)||price<=0)return;
  event.preventDefault();event.stopImmediatePropagation();
  if(typeof window.SatoApp?.openAlbumMarketAtPrice==='function')window.SatoApp.openAlbumMarketAtPrice(String(button.dataset.buy),String(price));
  else window.SatoApp.openAlbumMarket(String(button.dataset.buy),String(price));
 },true);
})();

(()=>{
 if(window.__satoPaidPriceInstalled)return;window.__satoPaidPriceInstalled=true;
 let applied=new WeakMap();
 function tick(){
  if(document.hidden)return;
  if(window.SatoFcApp?.usePaidSalePriceEnabled?.()!==true||window.SatoFcApp?.autoSalePriceEnabled?.()){applied=new WeakMap();return;}
  const queue=[window._appMain?._rootViewController],seen=new Set();
  while(queue.length&&seen.size<150){
   const node=queue.shift();if(!node||seen.has(node))continue;seen.add(node);
   const quick=node.panel?.quickListView,root=quick?.getRootElement?.();
   if(root){
    const open=root.isConnected&&root.getClientRects().length&&quick._btnToggle?.getRootElement?.()?.classList.contains('open');
    if(!open)applied.delete(root);
    else{
     const item=node.viewmodel?._collection?.[node.viewmodel._index];
     if(item&&applied.get(root)!==item){
      applied.set(root,item);
      const paid=Number(item.lastSalePrice),limits=item._itemPriceLimits;
      if(item.type==='player'&&item.untradeable!==true&&item.isTradeable?.()!==false&&Number.isSafeInteger(paid)&&paid>0&&limits&&paid>=limits.minimum&&paid<=limits.maximum){
       const step=paid<=1000?50:paid<=10000?100:paid<=50000?250:paid<=100000?500:1000;
       quick.setBidValue(Math.max(limits.minimum,paid-step));quick.setBuyNowValue(paid);
      }
     }
    }
   }
   for(const key of ['currentController','leftController','rightController','childViewControllers']){const child=node[key];if(Array.isArray(child))queue.push(...child);else if(child)queue.push(child);}
  }
 }
 setInterval(()=>{try{tick();}catch{}},500);tick();
})();
