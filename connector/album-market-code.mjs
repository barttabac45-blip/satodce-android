import {openAlbumMarket} from './album-market.mjs';
import {findCheapestOnMarket,fcMarketSearch} from './market-search.mjs';
import {cheapestOffers} from './market-offers.mjs';
import {undercutPrice} from './sale-price.mjs';
export function albumMarketCode(){
 return `window.__satoOpenAlbumMarket=(id)=>(${openAlbumMarket.toString()})(id,{find:${findCheapestOnMarket.toString()},search:${fcMarketSearch.toString()},choose:${cheapestOffers.toString()},undercut:${undercutPrice.toString()},wait:ms=>new Promise(r=>setTimeout(r,ms)),onStatus:message=>window.SatoFcApp?.marketProgress?.(message)});`;
}
