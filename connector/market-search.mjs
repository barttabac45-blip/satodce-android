// Cheapest listing of one exact card on the whole transfer market.
// FC sorts results by end time, not price: instead of reading every page, each search lowers the
// maximum buy-now price below the best price seen, so a few spaced searches prove the minimum.
export async function findCheapestOnMarket({definitionId,excludeId=null,minimum,maximum},{search,wait,undercut,maxSearches=5,spacing=3000}){
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
}

// FC Web App transfer market search, as a promise of the listed items.
export function fcMarketSearch({definitionId,maxBuy}){
 const criteria=new window.UTSearchCriteriaDTO();Object.assign(criteria,{type:'player',defId:[definitionId],isExactSearch:true,maxBuy});
 // FC caches by page number: a changed price ceiling needs a fresh page.
 if(typeof window.services?.Item?.marketRepository?.reset!=='function')return Promise.reject(Error('Actualisation du marché FC indisponible.'));
 window.services.Item.marketRepository.reset();
 const obs=window.services.Item.searchTransferMarket(criteria,1);
 return new Promise((resolve,reject)=>{const ctx={};if(!obs?.observe){reject(Error('Recherche FC indisponible.'));return;}
  const timer=setTimeout(()=>{obs.unobserve?.(ctx);reject(Error('FC ne répond pas.'));},15000);
  obs.observe(ctx,(sender,r)=>{clearTimeout(timer);sender?.unobserve?.(ctx);if(r?.success===false)reject(Error('Recherche refusée par FC.'));else{const d=r?.data??r?.response??r;resolve(d?.items);}});});
}

// Runs on a finger tap as well as a click: FC's touch handling can swallow the click event.
export function onTap(element,action){
 let last=0;const run=event=>{event.preventDefault?.();event.stopPropagation?.();const now=Date.now();if(now-last<700)return;last=now;action();};
 element.addEventListener('pointerup',run);element.addEventListener('click',run);
 for(const name of ['pointerdown','touchstart','mousedown'])element.addEventListener(name,e=>e.stopPropagation(),{passive:true});
}
