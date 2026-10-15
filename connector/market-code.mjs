import {cheapestOffers,installMarketHints} from './market-offers.mjs';
import {undercutPrice,installSalePrice} from './sale-price.mjs';
import {findCheapestOnMarket,fcMarketSearch,onTap} from './market-search.mjs';
// Source injected into the FC Web App by the app and by the PC bookmark.
export function marketHelpersCode(){
 const market=`{find:${findCheapestOnMarket.toString()},search:${fcMarketSearch.toString()},onTap:${onTap.toString()}}`;
 return `(${installMarketHints.toString()})(${cheapestOffers.toString()},${market},${undercutPrice.toString()});(${installSalePrice.toString()})(${undercutPrice.toString()},${market});`;
}
