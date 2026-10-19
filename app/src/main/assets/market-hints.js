(()=>{const choose=function cheapestOffers(rows, now=Date.now()) {
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
},createHistory=function createObservedPrices(choose,clock=Date.now){
 const cards=new Map();
 function prune(){const now=clock();for(const [id,entries] of cards){for(const [key,entry] of entries){if(now-entry.seen>900000||!choose([entry.row],now).length)entries.delete(key);}if(!entries.size)cards.delete(id);}}
 return {
  observe(rows){prune();const now=clock();for(const row of rows){const item=row.data,id=String(item?.definitionId??''),key=item?._auction?.tradeId??item?.id;if(key===undefined)continue;
   if(!choose([row],now).length){cards.get(id)?.delete(String(key));continue;}
   if(!cards.has(id))cards.set(id,new Map());
   const auction={...item._auction,timestamp:Number.isFinite(item._auction.timestamp)?item._auction.timestamp:now};
   cards.get(id).set(String(key),{seen:now,row:{data:{...item,_auction:auction}}});
  }},
  get(id,excludeId=null){prune();const rows=[...(cards.get(String(id))?.values()||[])].map(e=>e.row).filter(r=>excludeId===null||String(r.data.id)!==String(excludeId));return choose(rows,clock())[0]?.price??null;},
  clear(){cards.clear();}
 };
},scan=async function scanObservedPages({root,readRows,history,isActive,isCancelled,onProgress,wait,random=Math.random}){
 const signature=()=>readRows().map(r=>r.data?._auction?.tradeId??r.data?.id).join(',');
 const visited=new Set();let pages=0;
 const active=()=>isActive()&&!isCancelled();
 while(active()){
  const before=signature();if(visited.has(before))throw Error('Page déjà consultée : parcours arrêté.');visited.add(before);
  history.observe(readRows());onProgress(++pages);
  const next=root.querySelector('.pagingContainer .next, .ut-paging-control .next');
  if(!next)throw Error('Bouton page suivante introuvable. Prix limités aux pages consultées.');
  if(next.disabled||next.getAttribute('aria-disabled')==='true'||next.classList.contains('disabled'))return pages;
  await wait(3000+Math.floor(random()*3001));
  if(!active())return pages;
  if(signature()!==before)throw Error('Les résultats ont changé. Relance le parcours.');
  if(!next.isConnected)throw Error('La navigation a changé. Parcours arrêté.');
  next.click();
  let changed=false;
  for(let i=0;i<60&&active();i++){await wait(250);if(signature()!==before&&readRows().length){changed=true;break;}}
  if(!active())return pages;
  if(!changed)throw Error('La page suivante ne répond pas. Parcours arrêté.');
 }
 return pages;
},saleCompare=async function compareSaleMarket(item,{search,find,undercut,isCancelled,wait,onProgress}){
 const limits=item?._itemPriceLimits;
 if(!limits)throw Error('Limites FC indisponibles.');
 const check=()=>{if(isCancelled())throw Error('Comparaison interrompue : prix inchangés.');};
 let requests=0;
 check();
 const result=await find({definitionId:item.definitionId,excludeId:item.id,minimum:limits.minimum,maximum:limits.maximum},{
  undercut,
  search:async criteria=>{check();onProgress(++requests);const items=await search(criteria);check();return items;},
  wait:async ms=>{check();await wait(ms);check();}
 });
 check();
 return result;
},undercut=function undercutPrice(price,minimum,maximum){
 if(![price,minimum,maximum].every(Number.isSafeInteger)||price<=0||minimum<=0||maximum<minimum)throw Error('Limites de prix FC indisponibles.');
 const step=price<=1000?50:price<=10000?100:price<=50000?250:price<=100000?500:1000;
 return Math.max(minimum,Math.min(maximum,price-step));
};const history=window.__satoObservedPrices||createHistory(choose);window.__satoObservedPrices=history;(function installMarketHints(choose,history,scan){
 window.__satoMarketCleanup?.();
 const style=document.createElement('style');
 style.textContent='.listFUTItem.satodce-best-offer{box-shadow:inset 0 0 0 2px #b9f46c!important}.satodce-price-hint{display:inline!important;color:#b9f46c;font:bold 11px/1.3 system-ui;white-space:nowrap;pointer-events:none}.satodce-best-offer .auction>.auctionValue:nth-child(3) .value{color:#b9f46c!important;font-weight:bold}';
 document.head.append(style);
 let previous='',activeRoot=null,scanning=false,cancelled=false,disposed=false;
 function showSummary(root,rows){
  let summary=root.querySelector('.satodce-observed-prices');
  if(!summary){summary=document.createElement('div');summary.className='satodce-observed-prices';summary.style.cssText='margin:8px;padding:10px;color:#e8ffd0;background:#1c3a12;border-radius:12px;font:14px system-ui';root.insertBefore(summary,root.firstChild);}
  const ids=[...new Set(rows.map(r=>r.data?.definitionId).filter(Number.isSafeInteger))];
  const price=ids.length===1?history.get(ids[0]):null;
  const text=price===null?'Ouvre les pages manuellement pour comparer les prix.': 'Moins cher observé : '+price.toLocaleString('fr-FR')+' cr. — pages consultées uniquement (15 min maximum).';
  if(summary.textContent!==text)summary.textContent=text;
  if(!root.querySelector('.satodce-clear-prices')){const reset=document.createElement('button');reset.type='button';reset.className='satodce-clear-prices';reset.textContent='Effacer les prix observés';reset.addEventListener('click',()=>{history.clear();previous='';});root.insertBefore(reset,summary);}
 }
 function addScan(root,owner){
  if(root.querySelector('.satodce-scan-pages'))return;
  const button=document.createElement('button');button.type='button';button.className='satodce-scan-pages';button.textContent='Comparer les pages suivantes';
  button.addEventListener('click',async()=>{
   if(!scanning&&window.__satoPriceScanBusy){window.__satoCancelPriceScan?.();button.textContent='Arrêt de la comparaison…';return;}
   if(scanning){cancelled=true;button.textContent='Arrêt du parcours…';return;}
   scanning=true;cancelled=false;window.__satoPriceScanBusy=true;window.__satoCancelPriceScan=()=>{cancelled=true;};
   try{const pages=await scan({root,readRows:()=>owner.getView?.()?._list?.getRows?.()||[],history,isActive:()=>!disposed&&!document.hidden&&root.isConnected&&activeRoot===root,isCancelled:()=>cancelled,wait:ms=>new Promise(r=>setTimeout(r,ms)),onProgress:n=>{button.textContent='Arrêter — '+n+' page(s) consultée(s)';}});
    button.textContent=(cancelled?'Parcours arrêté': 'Parcours terminé')+' — '+pages+' page(s) consultée(s)';
   }catch(e){button.textContent=e.message;}finally{scanning=false;window.__satoPriceScanBusy=false;window.__satoCancelPriceScan=null;}
  });root.insertBefore(button,root.firstChild);
  if(window.__satoPriceScanBusy)button.textContent='Arrêter la comparaison en cours';
 }
 function restore(element){for(const label of element.querySelectorAll('[data-satodce-original-label]')){label.textContent=label.dataset.satodceOriginalLabel;delete label.dataset.satodceOriginalLabel;}}
 function clear(){restore(document);for(const e of document.querySelectorAll('.satodce-best-offer'))e.classList.remove('satodce-best-offer');}
 function tick(){try{
  if(document.hidden)return;
  const queue=[window._appMain?._rootViewController],seen=new Set();let rows=null,root=null,owner=null;
  while(queue.length&&seen.size<150){const node=queue.shift();if(!node||typeof node!=='object'||seen.has(node))continue;seen.add(node);
   const view=node.getView?.(),element=view?.getRootElement?.();
   if(/MarketSearchResults|PriceComparison|ComparePrice/.test(node.constructor?.name||'')&&element?.isConnected&&element.getClientRects().length&&typeof view?._list?.getRows==='function'){rows=view._list.getRows();root=element;owner=node;break;}
   for(const key of ['currentController','leftController','rightController','childViewControllers']){const value=node[key];if(Array.isArray(value))queue.push(...value);else if(value)queue.push(value);}
  }
  if(!rows){if(activeRoot)clear();activeRoot=null;previous='';return;}
  history.observe(rows);showSummary(root,rows);addScan(root,owner);
  const best=choose(rows),winners=new Map(best.map(b=>[b.row,b]));
  const signature=rows.map(r=>r.data?._auction?.tradeId||r.data?.id).join(',')+'|'+best.map(b=>b.row.data?._auction?.tradeId+':'+b.price).join(',');
  if(root===activeRoot&&signature===previous&&rows.every(row=>{const e=row.getRootElement?.();return !e||e.classList.contains('satodce-best-offer')===winners.has(row)&&(!winners.has(row)||!!e.querySelector('.satodce-price-hint'));}))return;
  for(const row of rows){const element=row.getRootElement?.();if(!element)continue;const offer=winners.get(row),old=element.querySelector('.satodce-price-hint');
   element.classList.toggle('satodce-best-offer',!!offer);
   if(!offer){restore(element);continue;}
   const label=element.querySelector('.auction>.auctionValue:nth-child(3) .label');if(!label)continue;
   const badge=old||document.createElement('span');badge.className='satodce-price-hint';
   const text='Moins cher de cette page';
   if(badge.textContent!==text)badge.textContent=text;
   if(!old){if(!label.dataset.satodceOriginalLabel)label.dataset.satodceOriginalLabel=label.textContent;label.replaceChildren(badge);}
  }
  activeRoot=root;previous=signature;
 }catch{clear();}}
 const timer=setInterval(tick,1000);tick();
 window.__satoMarketCleanup=()=>{disposed=true;cancelled=true;clearInterval(timer);clear();style.remove();document.querySelectorAll('.satodce-observed-prices,.satodce-clear-prices,.satodce-market-cheapest,.satodce-scan-pages').forEach(e=>e.remove());};
})(choose,history,scan);(function installSalePrice(undercut,compare){
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
    const button=document.createElement('button');button.type='button';button.className='satodce-sale-price';button.style.cssText='display:block;box-sizing:border-box;width:calc(100% - 16px);margin:8px;padding:12px;border:1px solid #b9f46c;border-radius:12px;background:#1c3a12;color:#e8ffd0;font:bold 14px system-ui;white-space:normal;';button.textContent='Recherche du prix le plus bas…';root.insertBefore(button,root.firstChild);
    const run=async()=>{
     if(busy){cancelled=true;button.textContent='Arrêt de la comparaison…';return;}
     if(window.__satoPriceScanBusy){button.textContent='Une comparaison est déjà en cours.';return;}
     busy=true;cancelled=false;window.__satoPriceScanBusy=true;window.__satoCancelPriceScan=()=>{cancelled=true;};
     const item=n.viewmodel?._collection?.[n.viewmodel._index];
     const unchanged=()=>!disposed&&!cancelled&&!document.hidden&&root.isConnected&&root.getClientRects().length>0&&n.viewmodel?._collection?.[n.viewmodel._index]===item&&quick._btnToggle?.getRootElement?.().classList.contains('open');
     try{
      if(item?.type!=='player'||!Number.isSafeInteger(item.definitionId))throw Error('Carte joueur indisponible.');
      const limits=item._itemPriceLimits;if(!limits)throw Error('Limites FC indisponibles.');
      button.textContent='Comparaison du marché… Appuie pour arrêter.';
      const found=await compare(item,{isCancelled:()=>!unchanged(),onProgress:requests=>{button.textContent='Recherche du moins cher sur tout le marché… '+requests+' vérification(s). Appuie pour arrêter.';}});
      if(!unchanged())throw Error('Comparaison interrompue : prix inchangés.');
      if(!found.verified)throw Error('Comparaison incomplète : prix inchangés.');
      if(found.price===null){button.textContent='Aucune offre disponible : choisis ton prix.';return;}
      const min=limits.minimum,max=limits.maximum;
      const floor=Math.min(max,min+(min<1000?50:min<10000?100:min<50000?250:min<100000?500:1000));
      const price=Math.max(floor,undercut(found.price,min,max));
      quick.setBidValue(undercut(price,min,max));quick.setBuyNowValue(price);
      button.textContent='Moins cher sur tout le marché : '+found.price.toLocaleString('fr-FR')+' cr. — Ton prix : '+price.toLocaleString('fr-FR')+' cr. — Actualiser';
     }catch(e){button.textContent=e.message+' Appuie pour réessayer.';}finally{busy=false;window.__satoPriceScanBusy=false;window.__satoCancelPriceScan=null;}
    };
    button.addEventListener('click',run);void run();
   }
  }
  for(const key of ['currentController','leftController','rightController','childViewControllers']){const v=n[key];if(Array.isArray(v))q.push(...v);else if(v)q.push(v);}
 }}catch{}}
 const timer=setInterval(tick,1000);tick();window.__satoSaleCleanup=()=>{disposed=true;cancelled=true;clearInterval(timer);document.querySelectorAll('.satodce-sale-price').forEach(e=>e.remove());};
})(undercut,(item,options)=>saleCompare(item,{...options,search:function fcMarketSearch({definitionId,maxBuy,page=1}){
 const criteria=new window.UTSearchCriteriaDTO();Object.assign(criteria,{type:'player',defId:[definitionId],isExactSearch:true,maxBuy});
 // FC caches by page number: a changed price ceiling needs a fresh page.
 if(typeof window.services?.Item?.marketRepository?.reset!=='function')return Promise.reject(Error('Actualisation du marché FC indisponible.'));
 if(page===1)window.services.Item.marketRepository.reset();
 const obs=window.services.Item.searchTransferMarket(criteria,page);
 return new Promise((resolve,reject)=>{const ctx={};if(!obs?.observe){reject(Error('Recherche FC indisponible.'));return;}
  const timer=setTimeout(()=>{obs.unobserve?.(ctx);reject(Error('FC ne répond pas.'));},15000);
  obs.observe(ctx,(sender,r)=>{clearTimeout(timer);sender?.unobserve?.(ctx);if(r?.success===false)reject(Error('Recherche refusée par FC.'));else{const d=r?.data??r?.response??r;resolve(d?.items);}});});
},find:async function findCheapestOnMarket({definitionId,excludeId=null,minimum,maximum},{search,wait,undercut,maxSearches=Infinity,spacing=3000}){
 if(!Number.isSafeInteger(definitionId)||!Number.isSafeInteger(minimum)||!Number.isSafeInteger(maximum)||minimum<=0||maximum<minimum)throw Error('Carte ou limites FC indisponibles.');
 let ceiling=maximum,best=null,searches=0,page=1;const seenPages=new Set();
 while(searches<maxSearches){
  if(searches)await wait(spacing);
  let items;
  try{items=await search({definitionId,maxBuy:ceiling,page});}
  // One refusal can be FC's rate limit: wait longer and retry once, then stop.
  catch(error){searches++;if(searches>=maxSearches)throw error;await wait(spacing*2);items=await search({definitionId,maxBuy:ceiling,page});}
  searches++;
  if(!Array.isArray(items))throw Error('Résultats FC indisponibles.');
  if(items.some(p=>p?.definitionId!==definitionId||p?._auction?.buyNowPrice>ceiling))throw Error('FC ne respecte pas les critères de recherche.');
  const offers=items.filter(p=>{const a=p?._auction;const remaining=Number(a?.expires)-(Number.isFinite(a?.timestamp)?Math.max(0,Date.now()-a.timestamp)/1000:0);return p?.definitionId===definitionId&&(excludeId===null||String(p.id)!==String(excludeId))&&a?._tradeState==='active'&&!a.stale&&remaining>0&&Number.isSafeInteger(a.buyNowPrice)&&a.buyNowPrice>Number(a.currentBid||0);});
  if(!offers.length){
   // A page containing only our own or expired listings does not prove the market is empty.
   if(items.length){const signature=JSON.stringify(items.map(p=>[p._auction?.tradeId??p.id,p._auction?.buyNowPrice]));if(seenPages.has(signature))throw Error('FC répète la même page : comparaison incomplète.');seenPages.add(signature);page++;continue;}
   return {price:best?.price??null,item:best?.item??null,verified:true,searches};
  }
  const cheapest=offers.reduce((a,b)=>b._auction.buyNowPrice<a._auction.buyNowPrice?b:a);
  best={price:cheapest._auction.buyNowPrice,item:cheapest};
  if(best.price<=minimum)return {...best,verified:true,searches};
  ceiling=undercut(best.price,minimum,maximum);
  page=1;seenPages.clear();
 }
 return {...best,verified:false,searches};
},undercut,wait:ms=>new Promise(r=>setTimeout(r,ms))}));})();