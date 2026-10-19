// Open FC's own first results page, then use its visible next-page control.
export async function compareSaleMarket(item,{history,scan,isCancelled,wait,onProgress}){
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
}
