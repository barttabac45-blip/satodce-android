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
 style.textContent='.satodce-scan-pages,.satodce-clear-prices{background:#26364b;color:#fff;border:1px solid #6c829d;border-radius:8px;padding:8px;margin:4px;font:13px system-ui}.listFUTItem.satodce-best-offer{box-shadow:inset 0 0 0 2px #b9f46c!important}.satodce-price-hint{display:inline!important;color:#b9f46c;font:bold 11px/1.3 system-ui;white-space:nowrap;pointer-events:none}.satodce-best-offer .auction>.auctionValue:nth-child(3) .value{color:#b9f46c!important;font-weight:bold}';
 document.head.append(style);
 let previous='',activeRoot=null,scanning=false,cancelled=false,disposed=false;
 const autoScanned=new WeakSet();
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
   if(/MarketSearchResults|PriceComparison|ComparePrice/.test(node.constructor?.name||'')&&element?.isConnected&&element.getClientRects().length&&typeof view?._list?.getRows==='function'){
    const desktop=window.SatoFcApp?.nativePlatform?.()==='windows';
    if(!rows||element.closest?.('.ui-layout-right')){rows=view._list.getRows();root=element;owner=node;}
    if(!desktop)break;
   }
   for(const key of ['currentController','leftController','rightController','childViewControllers']){const value=node[key];if(Array.isArray(value))queue.push(...value);else if(value)queue.push(value);}
  }
  if(!rows){if(activeRoot)clear();for(const old of document.querySelectorAll('.satodce-market-wide')){old.classList.remove('satodce-market-wide');old.classList.remove('satodce-market-comparison');}activeRoot=null;previous='';return;}
  if(window.SatoFcApp?.nativePlatform?.()==='android'&&/PriceComparison|ComparePrice/.test(owner.constructor?.name||'')){
   clear();for(const old of document.querySelectorAll('.satodce-market-grid,.satodce-market-list,.satodce-market-wide,.satodce-market-comparison'))for(const cls of ['satodce-market-grid','satodce-market-list','satodce-market-wide','satodce-market-comparison'])old.classList.remove(cls);
   root.querySelectorAll('.satodce-observed-prices,.satodce-clear-prices,.satodce-scan-pages').forEach(e=>e.remove());activeRoot=null;previous='';return;
  }
  history.observe(rows);showSummary(root,rows);addScan(root,owner);
  if(window.SatoFcApp?.autoMarketCheapestEnabled?.()===true&&!autoScanned.has(root)&&!window.__satoPriceScanBusy){const button=root.querySelector('.satodce-scan-pages');if(typeof button?.click==='function'){autoScanned.add(root);setTimeout(()=>{if(root.isConnected&&!disposed&&!window.__satoPriceScanBusy)button.click();},100);}}
  const mode=window.SatoFcApp?.marketView?.()||(window.SatoFcApp?.marketGridEnabled?.()===true?'grid':'normal');
  const grid=mode==='grid';
  const desktop=window.SatoFcApp?.nativePlatform?.()==='windows';
  for(const old of document.querySelectorAll('.satodce-market-list'))if(mode!=='list'||(!desktop&&!root.contains(old)))old.classList.remove('satodce-market-list');
  for(const old of document.querySelectorAll('.satodce-market-grid'))if(!grid||(!desktop&&!root.contains(old)))old.classList.remove('satodce-market-grid');
  const list=rows[0]?.getRootElement?.()?.parentElement;if(list)list.classList.toggle('satodce-market-grid',grid);
  if(list)list.classList.toggle('satodce-market-list',mode==='list');
  const layout=list?.closest?.('.ut-content');layout?.classList.toggle('satodce-market-wide',mode!=='normal');
  layout?.classList.toggle('satodce-market-comparison',mode!=='normal'&&!!list?.closest?.('.ui-layout-right'));
  if(document.getElementById&&!document.getElementById('satodce-market-grid-style')){const css=document.createElement('style');css.id='satodce-market-grid-style';css.textContent=`
   .satodce-market-wide>.ui-layout-left{width:calc(100% - 240px)!important;max-width:none!important;flex:1 1 auto!important}
   .satodce-market-wide>.ui-layout-right{width:240px!important;min-width:240px!important;flex:0 0 240px!important}
   .satodce-market-wide.satodce-market-comparison>.ui-layout-left{width:240px!important;min-width:240px!important;flex:0 0 240px!important}
   .satodce-market-wide.satodce-market-comparison>.ui-layout-right{width:calc(100% - 240px)!important;min-width:0!important;max-width:none!important;flex:1 1 auto!important}
   .satodce-market-grid{display:grid!important;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:2px;padding:2px!important;box-sizing:border-box;align-content:start}
   .satodce-market-grid>.listFUTItem{height:auto!important;min-width:0!important;width:auto!important;margin:0!important;position:relative!important;display:block!important;border-radius:12px}
   .satodce-market-grid .rowContent{display:block!important;position:relative!important;height:136px!important;min-height:136px!important;width:100%!important;box-sizing:border-box;padding:4px!important;border-radius:2px!important}
   .satodce-market-grid .rowContent::before{display:none!important}
   .satodce-market-grid .entityContainer{position:static!important;float:none!important;display:block!important;width:100%!important;min-height:0!important;padding:0!important;margin:0!important}
   .satodce-market-grid .entityContainer .item{position:absolute!important;left:3px!important;top:3px!important;float:none!important;margin:0!important;zoom:1;transform:scale(.9)!important;transform-origin:top left!important}
   .satodce-market-grid .entityContainer>.name{position:absolute!important;left:80px!important;right:3px!important;top:4px!important;display:block!important;max-width:none!important;width:auto!important;text-align:left!important;padding:0!important;margin:0!important;font-size:12px!important;line-height:16px!important;white-space:nowrap!important;box-sizing:border-box}
   .satodce-market-grid .entityContainer>.player-stats-data-component,.satodce-market-grid .entityContainer>.dataString{display:none!important}
   .satodce-market-grid .auction{position:absolute!important;left:80px!important;right:3px!important;top:23px!important;display:grid!important;grid-template-columns:1fr 1fr;gap:4px 2px;width:auto!important;max-width:none!important;height:auto!important;padding:0!important;margin:0!important;box-sizing:border-box}
   .satodce-market-grid .auction>*{min-width:0!important;width:auto!important;flex:none!important;text-align:left!important}
   .satodce-market-grid .auction .label{font-size:10px!important;line-height:1.2!important;white-space:normal!important;text-align:left!important}
   .satodce-market-grid .auction .value,.satodce-market-grid .auction .time{font-size:12px!important;text-align:left!important}
   .satodce-market-grid .satodce-price-hint{font-size:10px!important;white-space:normal!important}
   .satodce-market-list>.listFUTItem{margin:2px!important;border-radius:3px!important}
   .satodce-market-list .rowContent{position:relative!important;height:58px!important;min-height:58px!important;padding:0!important;box-sizing:border-box}
   .satodce-market-list .rowContent::before{display:none!important}
   .satodce-market-list .entityContainer{position:static!important;padding:0!important;width:100%!important}
   .satodce-market-list .entityContainer .item{position:absolute!important;left:3px!important;top:1px!important;margin:0!important;transform:scale(.48)!important;transform-origin:top left!important}
   .satodce-market-list .entityContainer>.name{position:absolute!important;left:48px!important;top:18px!important;width:22%!important;max-width:22%!important;padding:0!important;font-size:12px!important;line-height:16px!important;white-space:nowrap!important}
   .satodce-market-list .entityContainer>.player-stats-data-component,.satodce-market-list .entityContainer>.dataString{display:none!important}
   .satodce-market-list .auction{position:absolute!important;left:calc(22% + 55px)!important;right:4px!important;top:10px!important;width:auto!important;max-width:none!important;display:grid!important;grid-template-columns:repeat(4,minmax(0,1fr));gap:4px!important}
   .satodce-market-list .auction>*{min-width:0!important;flex:none!important}
   .satodce-market-list .auction .label{font-size:10px!important;white-space:nowrap!important}
   .satodce-market-list .auction .value,.satodce-market-list .auction .time{font-size:12px!important}
   .satodce-market-list .satodce-price-hint{font-size:10px!important;white-space:nowrap!important}
  `;document.head.append(css);}
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
