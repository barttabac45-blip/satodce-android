import {cheapestOffers,installMarketHints,createObservedPrices,scanObservedPages} from './market-offers.mjs';
import {installSalePrice,undercutPrice} from './sale-price.mjs';
import {compareSaleMarket} from './sale-market.mjs';
import {findCheapestOnMarket,fcMarketSearch} from './market-search.mjs';
// Source injected into the FC Web App by the app and by the PC bookmark.
export function marketHelpersCode(){
 return `(()=>{const choose=${cheapestOffers.toString()},createHistory=${createObservedPrices.toString()},scan=${scanObservedPages.toString()},saleCompare=${compareSaleMarket.toString()},undercut=${undercutPrice.toString()};const history=window.__satoObservedPrices||createHistory(choose);window.__satoObservedPrices=history;(${installMarketHints.toString()})(choose,history,scan);(${installSalePrice.toString()})(undercut,(item,options)=>saleCompare(item,{...options,search:${fcMarketSearch.toString()},find:${findCheapestOnMarket.toString()},undercut,wait:ms=>new Promise(r=>setTimeout(r,ms))}));})();`;
}
