// Original read-only adapter. EA internals are undocumented and may change.
// Reference for field names: docs/webapp-internals.md in theblakelalonde/fc-sbc-solver.
(() => {
 if(window.__satoDCEReaderVersion===4)return;
 window.__satoDCEReaderVersion=4;
 let busy=false;
 const send=(requestId,type,data)=>window.postMessage({requestId,type,...data},location.origin);
 const read=(obj,method)=>typeof obj?.[method]==='function'?obj[method]():undefined;
 function response(observable){return new Promise((resolve,reject)=>{
  if(typeof observable?.observe!=='function'){reject(Error('Interface FC indisponible.'));return;}
  const context={};const timer=setTimeout(()=>{observable.unobserve?.(context);reject(Error('FC ne répond pas à la lecture.'));},20000);
  observable.observe(context,(sender,value)=>{clearTimeout(timer);sender?.unobserve?.(context);if(value?.success===false)reject(Error('FC a refusé la lecture. Réessaie plus tard.'));else resolve(value?.data??value?.response??value);});
 });}
 const positions={0:'GK',3:'RB',4:'CB',5:'CB',6:'CB',7:'LB',9:'CDM',10:'CDM',11:'CDM',12:'RM',13:'CM',14:'CM',15:'CM',16:'LM',17:'CAM',18:'CAM',19:'CAM',23:'RW',24:'ST',25:'ST',26:'ST',27:'LW'};
 window.addEventListener('message',async e=>{
  if(e.source!==window||e.origin!==location.origin||e.data?.type!=='EASYDCE_READ_REQUEST'||typeof e.data.requestId!=='string'||busy)return;
  const id=e.data.requestId;busy=true;
  try{
   const api=window.services,repos=window.repositories,Criteria=window.UTSearchCriteriaDTO;
   if(!api?.Club||!repos?.Item)throw Error('Connecte-toi à la Web App FC avant de lancer l’import.');
   let expected=null;try{const stats=await response(api.Club.getStats());expected=stats.stats?.find(s=>s.type==='players')?.count??null;}catch{}
   const items=new Map();const cache=repos.Item.club?.items?.values?.();if(cache)for(const item of cache)if(item?.type==='player')items.set(String(item.id),item);
   let ended=expected!=null&&items.size>=expected;
   if(!ended&&typeof Criteria==='function'&&typeof api.Club.search==='function'){
    for(let offset=0;offset<10000;offset+=100){
     send(id,'EASYDCE_READ_PROGRESS',{message:`Lecture du club : ${items.size} / ${expected??'?'} cartes…`});
     const criteria=new Criteria();Object.assign(criteria,{type:'player',count:100,offset,sortBy:'ovr',sort:'desc'});
     const page=await response(api.Club.search(criteria));const batch=page.items;
     if(!Array.isArray(batch))throw Error('Le format de réponse FC a changé. Import interrompu.');
     for(const item of batch)if(item?.type==='player')items.set(String(item.id),item);
     if(page.retrievedAll||batch.length<100){ended=true;break;}
     await new Promise(r=>setTimeout(r,1500));
    }
   }
   let squadVerified=false,squadIds=new Set(),squadSlots=new Map();
   const active=api.Squad?.activeSquad??read(api.Squad,'getActiveSquadId');
   const captureSquad=(squad,authoritative=false)=>{const slots=read(squad,'getPlayers');if(!Array.isArray(slots))return;for(const [squadIndex,slot] of slots.entries()){const card=read(slot,'getItem')??slot.item??slot._item;if(card?.id>0){const position=slot.position??slot._position;squadIds.add(String(card.id));squadSlots.set(String(card.id),{squadIndex,squadPosition:positions[position?.typeId??position]||''});items.set(String(card.id),card);}}squadVerified=squadIds.size>0||authoritative;};
   try{const persona=read(api.User,'getUser')?.selectedPersona;captureSquad(repos.Squad?.squads?.get?.(persona)?.get?.(active));}catch{}
   if(!squadVerified&&active!=null&&typeof api.Squad?.requestSquadById==='function'){
    try{const result=await response(api.Squad.requestSquadById(active));captureSquad(result.response?.squad??result.data?.squad??result.squad??result.response??result,true);if(!squadVerified){const persona=read(api.User,'getUser')?.selectedPersona;captureSquad(repos.Squad?.squads?.get?.(persona)?.get?.(active));}}catch{}
   }
   // Canonical club links merge the men's and women's clubs when supplied by FC.
   const links=new Map();try{for(const [a,b] of repos.TeamConfig.teamLinks||[])links.set(String(a),String(b));}catch{}
   const result=[];let skipped=0;
   for(const [key,p] of items){
    const price=Number(read(p,'getMarketAverage'));const rating=Number(p.rating??p._rating);const rareFlag=Number(p.rareflag??p._rareflag);
    const loan=Number(p.loans);const activeEvolution=read(p,'isActiveInAcademy')===true||read(p,'isActiveInTimedEvolution')===true;const cardType=read(p,'isLegend')===true?'icon':read(p,'isLeagueHeroItem')===true?'hero':read(p,'isSpecial')===true||![0,1].includes(rareFlag)?'special':'normal';
    const pos=[...new Set((read(p,'getBasePossiblePositions')??p.basePossiblePositions??[p.preferredPosition]).map(x=>positions[x]).filter(Boolean))];
    if(!(loan<0)||!Number.isFinite(rating)||!pos.length){skipped++;continue;}
    const data=p._staticData??{};// EA sends placeholders such as "---" for some new cards: skip names without a letter.
    const real=v=>typeof v==='string'&&/\p{L}/u.test(v)?v:'';const name=real(data.knownAs)||real(data.name)||real([data.firstName,data.lastName].filter(Boolean).join(' '))||`Joueur ${p.definitionId}`;
    if(p.teamId==null||p.leagueId==null||p.nationId==null){skipped++;continue;}
    const assets=window.AssetLocationUtils;const absolute=value=>{try{const u=new URL(value,location.href||location.origin);return u.protocol==='https:'?u.href:'';}catch{return '';}};
    const image=(method,...args)=>{try{return absolute(assets?.[method]?.(...args));}catch{return '';}};
    const rarity=repos.Rarity?.getRarity?.(rareFlag);const tier=read(p,'getTier')??(rating>=75?3:rating>=65?2:1);
    const tradeable=read(p,'isTradeable')??p.tradable;const priceAvailable=Number.isFinite(price)&&price>0;
    result.push({...squadSlots.get(key),id:key,playerId:String(p.databaseId??p.definitionId),sbsScore:Number.isSafeInteger(p.sbsScore)?p.sbsScore:0,definitionId:String(p.definitionId),name,rating,positions:pos,club:`Club ${links.get(String(p.teamId))??p.teamId}`,league:`Ligue ${p.leagueId}`,nation:`Nation ${p.nationId}`,price:priceAvailable?price:null,priceAverage:priceAvailable?price:null,priceAvailable,priceSource:'Moyenne EA',priceUpdatedAt:new Date().toISOString(),dataSource:'ea',portraitUrl:image('getPortraitImageUri',p.databaseId??p.definitionId),cardBackgroundUrl:image('getShellUri',window.ItemViewSize?.LARGE,1,rareFlag,tier,read(rarity,'getGuid')??''),clubBadgeUrl:image('getBadgeImageUri',p.teamId),nationFlagUrl:image('getFlagImageUri',p.nationId),owned:true,tradeable:tradeable===true,tradeableKnown:typeof tradeable==='boolean',inSquad:squadVerified?squadIds.has(key):true,lockedReason:activeEvolution?'Évolution en cours':typeof tradeable!=='boolean'?'Statut échangeable inconnu':'',protected:activeEvolution||typeof tradeable!=='boolean',rarityId:rareFlag,groups:Array.isArray(p.groups)?p.groups:[],firstOwner:p.owners===1,clubId:String(links.get(String(p.teamId))??p.teamId),leagueId:String(p.leagueId),nationId:String(p.nationId),rare:read(p,'isRare')??rareFlag===1,type:cardType});
   }
   send(id,'EASYDCE_READ_RESULT',{players:result,total:items.size,skipped,squadVerified,complete:expected!=null?items.size>=expected:ended});
  }catch(error){send(id,'EASYDCE_READ_RESULT',{error:error.message});}finally{busy=false;}
 });
})();
