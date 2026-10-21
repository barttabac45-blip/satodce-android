// Explicit album action: find and select an offer, never buy or bid.
export async function openAlbumMarket(definitionId,{search,find,choose,undercut,wait,autoCheapest=false,announcedPrice=null,random=Math.random,onStatus=()=>{}}){
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
}
