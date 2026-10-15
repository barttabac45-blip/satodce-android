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

export function installMarketHints(choose){
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
}
