export function cheapestOffers(rows, now=Date.now()) {
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
}

export function createObservedPrices(choose,clock=Date.now){
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
}

export async function scanObservedPages({root,readRows,history,isActive,isCancelled,onProgress,wait,random=Math.random}){
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
}

export function installMarketHints(choose,history,scan){
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
  const grid=window.SatoFcApp?.marketGridEnabled?.()===true;
  for(const old of document.querySelectorAll('.satodce-market-grid'))if(!grid||!root.contains(old))old.classList.remove('satodce-market-grid');
  const list=rows[0]?.getRootElement?.()?.parentElement;if(list)list.classList.toggle('satodce-market-grid',grid);
  if(document.getElementById&&!document.getElementById('satodce-market-grid-style')){const css=document.createElement('style');css.id='satodce-market-grid-style';css.textContent='.satodce-market-grid{display:grid!important;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:8px;padding:8px!important}.satodce-market-grid>.listFUTItem{height:auto!important;min-height:280px;position:relative!important;display:flex!important;flex-direction:column;align-items:center;width:auto!important}.satodce-market-grid .auction{position:static!important;display:flex!important;flex-wrap:wrap;justify-content:center;width:100%!important}.satodce-market-grid .auctionValue{display:block!important;min-width:70px}.satodce-market-grid .entityContainer{position:relative!important;width:100%!important;min-height:180px}.satodce-market-grid .name{white-space:normal!important}';document.head.append(css);}
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
}
