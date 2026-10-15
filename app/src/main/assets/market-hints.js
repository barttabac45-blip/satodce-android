(function installMarketHints(choose){
 window.__satoMarketCleanup?.();
 const style=document.createElement('style');
 style.textContent='.listFUTItem.satodce-best-offer{box-shadow:inset 0 0 0 2px #b9f46c!important}.satodce-price-hint{display:inline!important;color:#b9f46c;font:bold 11px/1.3 system-ui;white-space:nowrap;pointer-events:none}.satodce-best-offer .auction>.auctionValue:nth-child(3) .value{color:#b9f46c!important;font-weight:bold}';
 document.head.append(style);
 let previous='',activeRoot=null;
 function restore(element){for(const label of element.querySelectorAll('[data-satodce-original-label]')){label.textContent=label.dataset.satodceOriginalLabel;delete label.dataset.satodceOriginalLabel;}}
 function clear(){restore(document);for(const e of document.querySelectorAll('.satodce-best-offer'))e.classList.remove('satodce-best-offer');}
 function tick(){try{
  const queue=[window._appMain?._rootViewController],seen=new Set();let rows=null,root=null;
  while(queue.length&&seen.size<150){const node=queue.shift();if(!node||typeof node!=='object'||seen.has(node))continue;seen.add(node);
   const view=node.getView?.(),element=view?.getRootElement?.();
   if(/MarketSearchResults|PriceComparison|ComparePrice/.test(node.constructor?.name||'')&&element?.isConnected&&element.getClientRects().length&&typeof view?._list?.getRows==='function'){rows=view._list.getRows();root=element;break;}
   for(const key of ['currentController','leftController','rightController','childViewControllers']){const value=node[key];if(Array.isArray(value))queue.push(...value);else if(value)queue.push(value);}
  }
  if(!rows){if(activeRoot)clear();activeRoot=null;previous='';return;}
  const best=choose(rows),winners=new Map(best.map(b=>[b.row,b]));
  for(const row of rows){const element=row.getRootElement?.();if(!element)continue;const offer=winners.get(row),old=element.querySelector('.satodce-price-hint');
   element.classList.toggle('satodce-best-offer',!!offer);
   if(!offer){restore(element);continue;}
   const label=element.querySelector('.auction>.auctionValue:nth-child(3) .label');if(!label)continue;
   const badge=old||document.createElement('span');badge.className='satodce-price-hint';
   const text='Moins cher affiché';
   if(badge.textContent!==text)badge.textContent=text;
   if(!old){if(!label.dataset.satodceOriginalLabel)label.dataset.satodceOriginalLabel=label.textContent;label.replaceChildren(badge);}
  }
  const signature=rows.map(r=>r.data?._auction?.tradeId||r.data?.id).join(',')+'|'+best.map(b=>b.row.data?._auction?.tradeId+':'+b.price).join(',');
  if((root!==activeRoot||signature!==previous)&&best.length===1){const row=best[0].row;row.tapCallback?.(row.data);row.getRootElement?.()?.scrollIntoView({block:'nearest'});}
  activeRoot=root;previous=signature;
 }catch{clear();}}
 const timer=setInterval(tick,1000);tick();
 window.__satoMarketCleanup=()=>{clearInterval(timer);clear();style.remove();};
})(function cheapestOffers(rows, now=Date.now()) {
 const groups=new Map();
 for(const row of rows){
  const item=row.data,auction=item?._auction;
  const definitionId=String(item?.definitionId??'');
  if(item?.type!=='player'||!/^\d+$/.test(definitionId)||!auction)continue;
  const remaining=Number(auction.expires)-(Number.isFinite(auction.timestamp)?Math.max(0,now-auction.timestamp)/1000:0);
  const price=Number(auction.buyNowPrice);
  if(auction.stale||auction._tradeState!=='active'||remaining<=0||!Number.isSafeInteger(price)||price<=0||price<=Number(auction.currentBid||0))continue;
  if(!groups.has(definitionId)||price<groups.get(definitionId).price)groups.set(definitionId,{row,price,definitionId});
 }
 return [...groups.values()];
});(function installSalePrice(undercut){
 window.__satoSaleCleanup?.();
 const observe=obs=>new Promise((resolve,reject)=>{const ctx={};const timer=setTimeout(()=>{obs?.unobserve?.(ctx);reject(Error('FC ne répond pas.'));},15000);if(!obs?.observe){clearTimeout(timer);reject(Error('Recherche FC indisponible.'));return;}obs.observe(ctx,(sender,r)=>{clearTimeout(timer);sender?.unobserve?.(ctx);if(r?.success===false)reject(Error('Recherche refusée par FC.'));else resolve(r?.data??r?.response??r);});});
 let busy=false;
 function tick(){try{const q=[window._appMain?._rootViewController],seen=new Set();while(q.length&&seen.size<150){const n=q.shift();if(!n||seen.has(n))continue;seen.add(n);
  const quick=n.panel?.quickListView,root=quick?.getRootElement?.();
  if(root?.isConnected&&root.getClientRects().length&&quick._btnToggle?.getRootElement?.().classList.contains('open')){
   if(root.querySelector('.satodce-sale-price'))continue;
   const button=document.createElement('button');button.type='button';button.className='satodce-sale-price';button.textContent='↓ Un palier sous le moins cher';button.style.cssText='display:block;box-sizing:border-box;width:calc(100% - 16px);margin:8px;padding:12px;border:1px solid #83b2ff;border-radius:12px;background:#245fc5;color:white;font:bold 14px system-ui;white-space:normal;';
   root.insertBefore(button,root.firstChild);
   button.onclick=async()=>{if(busy)return;busy=true;button.disabled=true;button.textContent='Comparaison de cette version…';try{
    const item=n.viewmodel?._collection?.[n.viewmodel._index],id=item?.definitionId;
    if(item?.type!=='player'||!Number.isSafeInteger(id))throw Error('Carte joueur indisponible.');
    const limits=item._itemPriceLimits;if(!limits)throw Error('Limites FC indisponibles.');
    let ceiling=limits.maximum,best=null,verified=false;
    for(let attempt=0;attempt<12;attempt++){
     const criteria=new window.UTSearchCriteriaDTO();Object.assign(criteria,{type:'player',defId:[id],isExactSearch:true,maxBuy:ceiling});
     // FC caches by page number. A changed price ceiling needs a fresh page.
     if(typeof window.services.Item.marketRepository?.reset!=='function')throw Error('Actualisation du marché FC indisponible.');
     window.services.Item.marketRepository.reset();
     const response=await observe(window.services.Item.searchTransferMarket(criteria,1));
     if(!Array.isArray(response.items))throw Error('Résultats FC indisponibles.');
     const prices=response.items.filter(p=>p.definitionId===id&&p.id!==item.id&&p._auction?._tradeState==='active'&&!p._auction.stale&&p._auction.expires>0&&p._auction.buyNowPrice>0).map(p=>p._auction.buyNowPrice);
     if(!prices.length){if(response.items.length)throw Error('FC ne permet pas de vérifier la même version.');verified=true;break;}
     best=Math.min(...prices);
     if(best<=limits.minimum){verified=true;break;}
     ceiling=undercut(best,limits.minimum,limits.maximum);
    }
    if(!verified||best===null)throw Error('Prix le plus bas non vérifié. Utilise Comparer le prix.');
    if(n.viewmodel._collection[n.viewmodel._index]!==item||!root.isConnected)throw Error('La carte sélectionnée a changé.');
    const price=undercut(best,limits.minimum,limits.maximum);
    quick.setBuyNowValue(price);quick.setBidValue(undercut(price,limits.minimum,limits.maximum));
    button.textContent=price<best?'Marché : '+best.toLocaleString('fr-FR')+' → Vente : '+price.toLocaleString('fr-FR')+' cr.':'Minimum FC atteint : '+price.toLocaleString('fr-FR')+' cr.';
   }catch(e){button.textContent=e.message;}finally{busy=false;button.disabled=false;}};
  }
  for(const key of ['currentController','leftController','rightController','childViewControllers']){const v=n[key];if(Array.isArray(v))q.push(...v);else if(v)q.push(v);}
 }}catch{}}
 const timer=setInterval(tick,1000);tick();window.__satoSaleCleanup=()=>{clearInterval(timer);document.querySelectorAll('.satodce-sale-price').forEach(e=>e.remove());};
})(function undercutPrice(price,minimum,maximum){
 if(![price,minimum,maximum].every(Number.isSafeInteger)||price<=0||minimum<=0||maximum<minimum)throw Error('Limites de prix FC indisponibles.');
 const step=price<=1000?50:price<=10000?100:price<=50000?250:price<=100000?500:1000;
 return Math.max(minimum,Math.min(maximum,price-step));
});