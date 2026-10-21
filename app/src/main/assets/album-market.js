window.__satoOpenAlbumMarket=(id,autoCheapest=false,announcedPrice=null)=>(async function openAlbumMarket(definitionId,{search,find,choose,undercut,wait,autoCheapest=false,announcedPrice=null,random=Math.random,onStatus=()=>{}}){
 if(!Number.isSafeInteger(definitionId)||definitionId<=0)throw Error('Joueur invalide.');
 if(window.__satoPriceScanBusy)throw Error('Une recherche de prix est déjà en cours.');
 const delay=()=>3000+Math.floor(random()*3001);
 let cancelled=false,panel,nav,initial,destination;
 const current=()=>nav?.getCurrentViewController?.()??nav?.currentController;
 const check=()=>{if(cancelled||document.hidden||nav&&current()!==initial&&current()!==destination)throw Error('Recherche interrompue. Aucun achat effectué.');};
 const pause=async ms=>{check();await wait(ms);check();};
 const navigation=()=>{
  const q=[window._appMain?._rootViewController??window.getAppMain?.()?.getRootViewController?.()],seen=new Set();let fallback;
  while(q.length&&seen.size<200){const n=q.shift();if(!n||seen.has(n))continue;seen.add(n);
   for(const c of [n.getNavigationController?.(),n])if(typeof c?.pushViewController==='function'){
    fallback=c;const root=c.getView?.()?.getRootElement?.();if(root?.isConnected&&root.getClientRects().length)return c;
   }
   for(const key of ['currentController','leftController','rightController','_childViewControllers','childViewControllers']){const value=n[key];if(Array.isArray(value))q.push(...value);else if(value)q.push(value);}
  }return fallback;
 };
 const status=text=>{if(panel)panel.textContent=text+' — Appuie pour arrêter';onStatus(text);};
 window.__satoPriceScanBusy=true;window.__satoCancelPriceScan=()=>{cancelled=true;};
 try{
  panel=document.createElement('button');panel.type='button';panel.className='satodce-album-search';panel.style.cssText='position:fixed;bottom:16px;left:10%;width:80%;z-index:99999;padding:14px;border-radius:12px;border:1px solid #b9f46c;background:#1c3a12;color:#e8ffd0;font:14px system-ui;white-space:normal';panel.addEventListener('click',()=>{cancelled=true;});document.body.append(panel);
  status('Préparation du marché FC…');
  for(let i=0;i<60;i++){
   nav=navigation();if(nav&&typeof window.UTSearchCriteriaDTO==='function'&&typeof window.services?.Item?.searchTransferMarket==='function')break;
   nav=null;await pause(250);
  }
  if(!nav)throw Error('Connecte-toi à FC, puis réessaie « Acheter dans FC ».');
  initial=current();
  const bounded=Number.isFinite(announcedPrice)&&announcedPrice>0;
  if(!autoCheapest||bounded){
   const Results=window.isPhone?.()?window.UTMarketSearchResultsViewController:window.UTMarketSearchResultsSplitViewController;
   if(typeof Results!=='function')throw Error('Affichage du marché FC indisponible.');
   const criteria=new window.UTSearchCriteriaDTO();Object.assign(criteria,{type:'player',defId:[definitionId],isExactSearch:true});
   if(bounded)Object.assign(criteria,{minBuy:Math.max(150,Math.floor(announcedPrice)-300),maxBuy:Math.min(15000000,Math.max(150,Math.ceil(announcedPrice)+300))});
   window.services.Item.marketRepository?.reset?.();
   const results=new Results();results.initWithSearchCriteria(criteria);destination=results;nav.pushViewController(results);
   if(bounded){
    const displayedRows=()=>{const queue=[results],seen=new Set();while(queue.length&&seen.size<40){const node=queue.shift();if(!node||seen.has(node))continue;seen.add(node);const rows=node.getView?.()?._list?.getRows?.();if(rows?.length)return rows;for(const key of ['_listController','currentController','leftController','rightController','childViewControllers','_childViewControllers']){const child=node[key];if(Array.isArray(child))queue.push(...child);else if(child)queue.push(child);}}return [];};
    for(let i=0;i<60;i++){
     check();const cheapest=choose(displayedRows()).filter(o=>o.definitionId===String(definitionId)).sort((a,b)=>a.price-b.price)[0];
     if(cheapest&&typeof cheapest.row.tapCallback==='function'){
      cheapest.row.tapCallback(cheapest.row.data);cheapest.row.getRootElement?.()?.scrollIntoView?.({block:'nearest'});
      const message='Offre la moins chère affichée sélectionnée : '+cheapest.price.toLocaleString('fr-FR')+' cr. Confirme l’achat dans FC.';onStatus(message);return {price:cheapest.price,message};
     }
     await pause(250);
    }
    const message='Aucune offre disponible dans la fourchette annoncée. Ajuste les prix dans FC.';onStatus(message);return {price:null,message};
   }
   const message='Marché du joueur ouvert. Le prix le plus bas de la liste affichée est en vert.';
   onStatus(message);return {price:null,message};
  }
  await pause(delay());
  let requests=0;
  const request=async criteria=>{
   for(let attempt=0;attempt<2;attempt++){
    check();status('Recherche du moins cher sur tout le marché… '+(++requests)+' vérification(s)');
    let items;
    try{items=await search(criteria);}catch(error){check();if(attempt)throw error;await pause(delay()*2);continue;}
    check();
    if(!Array.isArray(items))throw Error('Résultats FC indisponibles.');
    // A single empty response can be transient, including the very first search.
    // Repeat the same criteria before declaring absence or proving a minimum.
    if(items.length||attempt)return items;
    await pause(delay());
   }
  };
  const first=await request({definitionId,maxBuy:15000000,page:1});
  if(!Array.isArray(first))throw Error('Résultats FC indisponibles.');
  if(first.some(p=>p?.definitionId!==definitionId))throw Error('La version du joueur ne correspond pas.');
  const limits=first.find(p=>p?._itemPriceLimits)?._itemPriceLimits??{minimum:150,maximum:15000000};
  let cached=true;
  const found=await find({definitionId,minimum:limits.minimum,maximum:limits.maximum},{undercut,spacing:delay,wait:pause,search:criteria=>{
   if(cached&&criteria.page===1&&criteria.maxBuy>=Math.max(0,...first.map(p=>p?._auction?.buyNowPrice||0))){cached=false;return first;}
   cached=false;return request(criteria);
  }});
  check();if(!found.verified)throw Error('Minimum du marché non vérifié : réessaie.');
  if(found.price===null)throw Error('Aucune offre en achat immédiat pour cette version.');
  status('Minimum vérifié : '+found.price.toLocaleString('fr-FR')+' cr. Ouverture de l’offre…');await pause(delay());
  const Results=window.isPhone?.()?window.UTMarketSearchResultsViewController:window.UTMarketSearchResultsSplitViewController;
  if(typeof Results!=='function')throw Error('Affichage du marché FC indisponible.');
  const criteria=new window.UTSearchCriteriaDTO();Object.assign(criteria,{type:'player',defId:[definitionId],isExactSearch:true,maxBuy:found.price});
  window.services.Item.marketRepository?.reset?.();
  const results=new Results();results.initWithSearchCriteria(criteria);destination=results;nav.pushViewController(results);
  const rows=()=>{const q=[results],seen=new Set();while(q.length&&seen.size<40){const n=q.shift();if(!n||seen.has(n))continue;seen.add(n);const list=n.getView?.()?._list?.getRows?.();if(list?.length)return list;for(const key of ['_listController','currentController','leftController','rightController','childViewControllers','_childViewControllers']){const c=n[key];if(Array.isArray(c))q.push(...c);else if(c)q.push(c);}}return [];};
  let offer;
  for(let i=0;i<60;i++){check();const root=results.getView?.()?.getRootElement?.();if(root?.isConnected&&root.getClientRects().length)offer=choose(rows()).find(o=>o.definitionId===String(definitionId)&&o.price===found.price);if(offer)break;await pause(250);}
  if(!offer)throw Error('L’offre a changé ou expiré. Relance la recherche.');
  initial=current();destination=null;
  await pause(1000+Math.floor(random()*1001));
  const fresh=choose(rows()).find(o=>o.definitionId===String(definitionId)&&o.price===found.price);
  if(!fresh||typeof fresh.row.tapCallback!=='function')throw Error('Offre affichée à '+found.price.toLocaleString('fr-FR')+' cr. Sélectionne-la dans FC.');
  fresh.row.tapCallback(fresh.row.data);fresh.row.getRootElement?.()?.scrollIntoView?.({block:'nearest'});
  const message='Offre la moins chère sélectionnée : '+found.price.toLocaleString('fr-FR')+' cr. Vérifie puis confirme l’achat dans FC.';
  onStatus(message);return {price:found.price,message};
 }finally{panel?.remove();window.__satoPriceScanBusy=false;window.__satoCancelPriceScan=null;}
})(id,{autoCheapest,announcedPrice,find:async function findCheapestOnMarket({definitionId,excludeId=null,minimum,maximum},{search,wait,undercut,maxSearches=Infinity,spacing=3000}){
 if(!Number.isSafeInteger(definitionId)||!Number.isSafeInteger(minimum)||!Number.isSafeInteger(maximum)||minimum<=0||maximum<minimum)throw Error('Carte ou limites FC indisponibles.');
 let ceiling=maximum,best=null,searches=0,page=1;const seenPages=new Set();
 const delay=()=>typeof spacing==='function'?spacing():spacing;
 while(searches<maxSearches){
  if(searches)await wait(delay());
  let items;
  try{items=await search({definitionId,maxBuy:ceiling,page});}
  // One refusal can be FC's rate limit: wait longer and retry once, then stop.
  catch(error){searches++;if(searches>=maxSearches)throw error;await wait(delay()*2);items=await search({definitionId,maxBuy:ceiling,page});}
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
},search:function fcMarketSearch({definitionId,maxBuy,page=1}){
 const criteria=new window.UTSearchCriteriaDTO();Object.assign(criteria,{type:'player',defId:[definitionId],isExactSearch:true,maxBuy});
 // FC caches by page number: a changed price ceiling needs a fresh page.
 if(typeof window.services?.Item?.marketRepository?.reset!=='function')return Promise.reject(Error('Actualisation du marché FC indisponible.'));
 if(page===1)window.services.Item.marketRepository.reset();
 const obs=window.services.Item.searchTransferMarket(criteria,page);
 return new Promise((resolve,reject)=>{const ctx={};if(!obs?.observe){reject(Error('Recherche FC indisponible.'));return;}
  const timer=setTimeout(()=>{obs.unobserve?.(ctx);reject(Error('FC ne répond pas.'));},15000);
  obs.observe(ctx,(sender,r)=>{clearTimeout(timer);sender?.unobserve?.(ctx);if(r?.success===false)reject(Error('Recherche refusée par FC.'));else{const d=r?.data??r?.response??r;resolve(d?.items);}});});
},choose:function cheapestOffers(rows, now=Date.now()) {
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
},undercut:function undercutPrice(price,minimum,maximum){
 if(![price,minimum,maximum].every(Number.isSafeInteger)||price<=0||minimum<=0||maximum<minimum)throw Error('Limites de prix FC indisponibles.');
 const step=price<=1000?50:price<=10000?100:price<=50000?250:price<=100000?500:1000;
 return Math.max(minimum,Math.min(maximum,price-step));
},wait:ms=>new Promise(r=>setTimeout(r,ms)),onStatus:message=>window.SatoFcApp?.marketProgress?.(message)});