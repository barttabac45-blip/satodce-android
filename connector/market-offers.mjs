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

export function installMarketHints(choose,market,undercut){
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
  const queue=[window._appMain?._rootViewController],seen=new Set();let rows=null,root=null,owner=null;
  while(queue.length&&seen.size<150){const node=queue.shift();if(!node||typeof node!=='object'||seen.has(node))continue;seen.add(node);
   const view=node.getView?.(),element=view?.getRootElement?.();
   if(/MarketSearchResults|PriceComparison|ComparePrice/.test(node.constructor?.name||'')&&element?.isConnected&&element.getClientRects().length&&typeof view?._list?.getRows==='function'){rows=view._list.getRows();root=element;owner=node;break;}
   for(const key of ['currentController','leftController','rightController','childViewControllers']){const value=node[key];if(Array.isArray(value))queue.push(...value);else if(value)queue.push(value);}
  }
  if(!rows){if(activeRoot)clear();activeRoot=null;previous='';return;}
  addSearchButton(owner,root,()=>viewRows(owner));
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
 window.__satoMarketCleanup=()=>{clearInterval(timer);clear();style.remove();document.querySelectorAll('.satodce-market-cheapest').forEach(e=>e.remove());};
}
