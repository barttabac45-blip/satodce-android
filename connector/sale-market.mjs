// Quote the exact card without navigating away from FC's listing panel.
export async function compareSaleMarket(item,{search,find,undercut,isCancelled,wait,onProgress}){
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
}
