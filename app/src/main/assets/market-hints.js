(function installMarketHints(choose,market,undercut){
 window.__satoMarketCleanup?.();
 const style=document.createElement('style');
 style.textContent='.listFUTItem.satodce-best-offer{box-shadow:inset 0 0 0 2px #b9f46c!important}.satodce-price-hint{display:inline!important;color:#b9f46c;font:bold 11px/1.3 system-ui;white-space:nowrap;pointer-events:none}.satodce-best-offer .auction>.auctionValue:nth-child(3) .value{color:#b9f46c!important;font-weight:bold}';
 document.head.append(style);
 let previous='',activeRoot=null,busy=false;
 // The results controller (or its list child) that owns the search shown on screen.
 function searchOwner(node){for(const c of [node,node?._listController,node?.currentController,...(node?.childViewControllers||[])])if(c?.searchCriteria&&typeof c._requestItems==='function')return c;return null;}
 function addSearchButton(node,root,rows){
  if(root.querySelector('.satodce-market-cheapest'))return;
  const button=document.createElement('button');button.type='button';button.className='satodce-market-cheapest';button.textContent='🔎 Moins cher sur tout le marché';button.style.cssText='display:block;box-sizing:border-box;width:calc(100% - 16px);margin:8px;padding:10px;border:1px solid #b9f46c;border-radius:12px;background:#1c3a12;color:#e8ffd0;font:bold 14px system-ui;white-space:normal;touch-action:manipulation;';
  root.insertBefore(button,root.firstChild);
  market.onTap(button,async()=>{if(busy)return;busy=true;button.disabled=true;button.textContent='Recherche sur tout le marché (quelques secondes)…';try{
   const owner=searchOwner(node),criteria=owner?.searchCriteria;
   const ids=new Set((criteria?.defId?.length?criteria.defId:rows().map(r=>r.data?.definitionId)).filter(Number.isSafeInteger));
   if(ids.size!==1)throw Error('Cherche un seul joueur précis pour comparer tout le marché.');
   const definitionId=[...ids][0],limits=rows().map(r=>r.data?._itemPriceLimits).find(Boolean)||{minimum:150,maximum:15000000};
   const wait=ms=>new Promise(r=>setTimeout(r,ms));
   const found=await market.find({definitionId,minimum:limits.minimum,maximum:limits.maximum},{search:market.search,wait,undercut});
   if(found.price===null){button.textContent='Aucune offre en achat immédiat sur le marché.';return;}
   const text='Moins cher du marché : '+found.price.toLocaleString('fr-FR')+' cr.'+(found.verified?'':' (vérification partielle)');
   if(!owner||!button.isConnected){button.textContent=text+' Mets ce prix max d’achat immédiat et relance.';return;}
   // Show that listing in FC's own results: same search capped at the cheapest price, then it gets selected.
   await wait(3000);criteria.maxBuy=found.price;window.services.Item.marketRepository.reset();previous='';owner._requestItems(1);
   button.textContent=text;
  }catch(e){button.textContent=e.message+' Réessaie dans quelques secondes.';}finally{busy=false;button.disabled=false;}});
 }
 function restore(element){for(const label of element.querySelectorAll('[data-satodce-original-label]')){label.textContent=label.dataset.satodceOriginalLabel;delete label.dataset.satodceOriginalLabel;}}
 function clear(){restore(document);for(const e of document.querySelectorAll('.satodce-best-offer'))e.classList.remove('satodce-best-offer');}
 const viewRows=node=>node?.getView?.()?._list?.getRows?.()||[];
 function tick(){try{
  if(document.hidden)return;
  const queue=[window._appMain?._rootViewController],seen=new Set();let rows=null,root=null,owner=null;
  while(queue.length&&seen.size<150){const node=queue.shift();if(!node||typeof node!=='object'||seen.has(node))continue;seen.add(node);
   const view=node.getView?.(),element=view?.getRootElement?.();
   if(/MarketSearchResults|PriceComparison|ComparePrice/.test(node.constructor?.name||'')&&element?.isConnected&&element.getClientRects().length&&typeof view?._list?.getRows==='function'){rows=view._list.getRows();root=element;owner=node;break;}
   for(const key of ['currentController','leftController','rightController','childViewControllers']){const value=node[key];if(Array.isArray(value))queue.push(...value);else if(value)queue.push(value);}
  }
  if(!rows){if(activeRoot)clear();activeRoot=null;previous='';return;}
  addSearchButton(owner,root,()=>viewRows(owner));
  const best=choose(rows),winners=new Map(best.map(b=>[b.row,b]));
  const signature=rows.map(r=>r.data?._auction?.tradeId||r.data?.id).join(',')+'|'+best.map(b=>b.row.data?._auction?.tradeId+':'+b.price).join(',');
  if(root===activeRoot&&signature===previous&&rows.every(row=>{const e=row.getRootElement?.();return !e||e.classList.contains('satodce-best-offer')===winners.has(row)&&(!winners.has(row)||!!e.querySelector('.satodce-price-hint'));}))return;
  for(const row of rows){const element=row.getRootElement?.();if(!element)continue;const offer=winners.get(row),old=element.querySelector('.satodce-price-hint');
   element.classList.toggle('satodce-best-offer',!!offer);
   if(!offer){restore(element);continue;}
   const label=element.querySelector('.auction>.auctionValue:nth-child(3) .label');if(!label)continue;
   const badge=old||document.createElement('span');badge.className='satodce-price-hint';
   const text='Moins cher affiché';
   if(badge.textContent!==text)badge.textContent=text;
   if(!old){if(!label.dataset.satodceOriginalLabel)label.dataset.satodceOriginalLabel=label.textContent;label.replaceChildren(badge);}
  }
  if((root!==activeRoot||signature!==previous)&&best.length===1){const row=best[0].row;row.tapCallback?.(row.data);row.getRootElement?.()?.scrollIntoView({block:'nearest'});}
  activeRoot=root;previous=signature;
 }catch{clear();}}
 const timer=setInterval(tick,1000);tick();
 window.__satoMarketCleanup=()=>{clearInterval(timer);clear();style.remove();document.querySelectorAll('.satodce-market-cheapest').forEach(e=>e.remove());};
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
},{find:async function findCheapestOnMarket({definitionId,excludeId=null,minimum,maximum},{search,wait,undercut,maxSearches=5,spacing=3000}){
 if(!Number.isSafeInteger(definitionId)||!Number.isSafeInteger(minimum)||!Number.isSafeInteger(maximum))throw Error('Carte ou limites FC indisponibles.');
 let ceiling=maximum,best=null,searches=0;
 while(searches<maxSearches){
  if(searches)await wait(spacing);
  let items;
  try{items=await search({definitionId,maxBuy:ceiling});}
  // One refusal can be FC's rate limit: wait longer and retry once, then stop.
  catch(error){searches++;if(searches>=maxSearches)throw error;await wait(spacing*2);items=await search({definitionId,maxBuy:ceiling});}
  searches++;
  if(!Array.isArray(items))throw Error('Résultats FC indisponibles.');
  const offers=items.filter(p=>p?.definitionId===definitionId&&p.id!==excludeId&&p._auction?._tradeState==='active'&&!p._auction.stale&&p._auction.expires>0&&p._auction.buyNowPrice>0);
  if(!offers.length){
   if(items.some(p=>p?.definitionId!==definitionId))throw Error('FC ne permet pas de vérifier la même version.');
   return {price:best?.price??null,item:best?.item??null,verified:true,searches};
  }
  const cheapest=offers.reduce((a,b)=>b._auction.buyNowPrice<a._auction.buyNowPrice?b:a);
  best={price:cheapest._auction.buyNowPrice,item:cheapest};
  if(best.price<=minimum)return {...best,verified:true,searches};
  ceiling=undercut(best.price,minimum,maximum);
 }
 return {...best,verified:false,searches};
},search:function fcMarketSearch({definitionId,maxBuy}){
 const criteria=new window.UTSearchCriteriaDTO();Object.assign(criteria,{type:'player',defId:[definitionId],isExactSearch:true,maxBuy});
 // FC caches by page number: a changed price ceiling needs a fresh page.
 if(typeof window.services?.Item?.marketRepository?.reset!=='function')return Promise.reject(Error('Actualisation du marché FC indisponible.'));
 window.services.Item.marketRepository.reset();
 const obs=window.services.Item.searchTransferMarket(criteria,1);
 return new Promise((resolve,reject)=>{const ctx={};if(!obs?.observe){reject(Error('Recherche FC indisponible.'));return;}
  const timer=setTimeout(()=>{obs.unobserve?.(ctx);reject(Error('FC ne répond pas.'));},15000);
  obs.observe(ctx,(sender,r)=>{clearTimeout(timer);sender?.unobserve?.(ctx);if(r?.success===false)reject(Error('Recherche refusée par FC.'));else{const d=r?.data??r?.response??r;resolve(d?.items);}});});
},onTap:function onTap(element,action){
 let last=0;const run=event=>{event.preventDefault?.();event.stopPropagation?.();const now=Date.now();if(now-last<700)return;last=now;action();};
 element.addEventListener('pointerup',run);element.addEventListener('click',run);
 for(const name of ['pointerdown','touchstart','mousedown'])element.addEventListener(name,e=>e.stopPropagation(),{passive:true});
}},function undercutPrice(price,minimum,maximum){
 if(![price,minimum,maximum].every(Number.isSafeInteger)||price<=0||minimum<=0||maximum<minimum)throw Error('Limites de prix FC indisponibles.');
 const step=price<=1000?50:price<=10000?100:price<=50000?250:price<=100000?500:1000;
 return Math.max(minimum,Math.min(maximum,price-step));
});(function installSalePrice(undercut,market){
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
})(function undercutPrice(price,minimum,maximum){
 if(![price,minimum,maximum].every(Number.isSafeInteger)||price<=0||minimum<=0||maximum<minimum)throw Error('Limites de prix FC indisponibles.');
 const step=price<=1000?50:price<=10000?100:price<=50000?250:price<=100000?500:1000;
 return Math.max(minimum,Math.min(maximum,price-step));
},{find:async function findCheapestOnMarket({definitionId,excludeId=null,minimum,maximum},{search,wait,undercut,maxSearches=5,spacing=3000}){
 if(!Number.isSafeInteger(definitionId)||!Number.isSafeInteger(minimum)||!Number.isSafeInteger(maximum))throw Error('Carte ou limites FC indisponibles.');
 let ceiling=maximum,best=null,searches=0;
 while(searches<maxSearches){
  if(searches)await wait(spacing);
  let items;
  try{items=await search({definitionId,maxBuy:ceiling});}
  // One refusal can be FC's rate limit: wait longer and retry once, then stop.
  catch(error){searches++;if(searches>=maxSearches)throw error;await wait(spacing*2);items=await search({definitionId,maxBuy:ceiling});}
  searches++;
  if(!Array.isArray(items))throw Error('Résultats FC indisponibles.');
  const offers=items.filter(p=>p?.definitionId===definitionId&&p.id!==excludeId&&p._auction?._tradeState==='active'&&!p._auction.stale&&p._auction.expires>0&&p._auction.buyNowPrice>0);
  if(!offers.length){
   if(items.some(p=>p?.definitionId!==definitionId))throw Error('FC ne permet pas de vérifier la même version.');
   return {price:best?.price??null,item:best?.item??null,verified:true,searches};
  }
  const cheapest=offers.reduce((a,b)=>b._auction.buyNowPrice<a._auction.buyNowPrice?b:a);
  best={price:cheapest._auction.buyNowPrice,item:cheapest};
  if(best.price<=minimum)return {...best,verified:true,searches};
  ceiling=undercut(best.price,minimum,maximum);
 }
 return {...best,verified:false,searches};
},search:function fcMarketSearch({definitionId,maxBuy}){
 const criteria=new window.UTSearchCriteriaDTO();Object.assign(criteria,{type:'player',defId:[definitionId],isExactSearch:true,maxBuy});
 // FC caches by page number: a changed price ceiling needs a fresh page.
 if(typeof window.services?.Item?.marketRepository?.reset!=='function')return Promise.reject(Error('Actualisation du marché FC indisponible.'));
 window.services.Item.marketRepository.reset();
 const obs=window.services.Item.searchTransferMarket(criteria,1);
 return new Promise((resolve,reject)=>{const ctx={};if(!obs?.observe){reject(Error('Recherche FC indisponible.'));return;}
  const timer=setTimeout(()=>{obs.unobserve?.(ctx);reject(Error('FC ne répond pas.'));},15000);
  obs.observe(ctx,(sender,r)=>{clearTimeout(timer);sender?.unobserve?.(ctx);if(r?.success===false)reject(Error('Recherche refusée par FC.'));else{const d=r?.data??r?.response??r;resolve(d?.items);}});});
},onTap:function onTap(element,action){
 let last=0;const run=event=>{event.preventDefault?.();event.stopPropagation?.();const now=Date.now();if(now-last<700)return;last=now;action();};
 element.addEventListener('pointerup',run);element.addEventListener('click',run);
 for(const name of ['pointerdown','touchstart','mousedown'])element.addEventListener(name,e=>e.stopPropagation(),{passive:true});
}});