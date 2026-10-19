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
},saleCompare=async function compareSaleMarket(item,{history,scan,isCancelled,wait,onProgress}){
 const nav=window.getAppMain?.()?.getRootViewController?.()?.getPresentedViewController?.()?.getCurrentViewController?.();
 const Results=window.isPhone?.()?window.UTMarketSearchResultsViewController:window.UTMarketSearchResultsSplitViewController;
 if(typeof nav?.pushViewController!=='function'||typeof Results!=='function'||typeof window.UTSearchCriteriaDTO!=='function')throw Error('Navigation du marché FC indisponible.');
 const criteria=new window.UTSearchCriteriaDTO();Object.assign(criteria,{type:'player',defId:[item.definitionId],isExactSearch:true});
 window.services?.Item?.marketRepository?.reset?.();
 const results=new Results();results.initWithSearchCriteria(criteria);nav.pushViewController(results);
 const readRows=()=>results.getView?.()?._list?.getRows?.()||results._listController?.getView?.()?._list?.getRows?.()||[];
 const rootOf=()=>results.getView?.()?.getRootElement?.();
 let root;
 try{
  for(let i=0;i<60;i++){
   if(isCancelled()||document.hidden)throw Error('Comparaison interrompue.');
   root=rootOf();if(root?.isConnected&&root.getClientRects().length&&readRows().length)break;
   await wait(250);
  }
  if(!root?.isConnected||!readRows().length)throw Error('Résultats FC indisponibles : prix inchangés.');
  const active=()=>!isCancelled()&&!document.hidden&&root.isConnected&&root.getClientRects().length>0;
  const exactRows=()=>{const rows=readRows();if(rows.some(r=>r.data?.definitionId!==item.definitionId))throw Error('La version du joueur a changé.');return rows;};
  // A fresh history ensures a sale quote only uses this complete comparison.
  await scan({root,readRows:exactRows,history,isActive:active,isCancelled,onProgress,wait});
  if(!active())throw Error('Comparaison interrompue : prix inchangés.');
  return {price:history.get(item.definitionId,item.id),verified:true};
 }finally{
  // Never navigate away from a different screen opened by the user.
  if(root?.isConnected&&root.getClientRects().length&&typeof nav.popViewController==='function')nav.popViewController();
 }
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
})(function undercutPrice(price,minimum,maximum){
 if(![price,minimum,maximum].every(Number.isSafeInteger)||price<=0||minimum<=0||maximum<minimum)throw Error('Limites de prix FC indisponibles.');
 const step=price<=1000?50:price<=10000?100:price<=50000?250:price<=100000?500:1000;
 return Math.max(minimum,Math.min(maximum,price-step));
},async(item,options)=>{const fresh=createHistory(choose);const result=await saleCompare(item,{...options,history:fresh,scan,wait:ms=>new Promise(r=>setTimeout(r,ms))});return result;});})();