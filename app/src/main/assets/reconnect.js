(()=>{// Original read-only adapter. EA internals are undocumented and may change.
// Reference for field names: docs/webapp-internals.md in theblakelalonde/fc-sbc-solver.
(() => {
 if(window.__satoDCEReaderVersion===3)return;
 window.__satoDCEReaderVersion=3;
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
   let squadVerified=false,squadIds=new Set();
   const active=api.Squad?.activeSquad??read(api.Squad,'getActiveSquadId');
   if(active!=null&&typeof api.Squad?.requestSquadById==='function'){
    try{const result=await response(api.Squad.requestSquadById(active));const squad=result.squad??result;const slots=read(squad,'getPlayers');if(Array.isArray(slots)){for(const slot of slots){const card=read(slot,'getItem')??slot.item??slot._item;if(card?.id>0){squadIds.add(String(card.id));items.set(String(card.id),card);}}squadVerified=squadIds.size>0;}}catch{}
   }
   // Canonical club links merge the men's and women's clubs when supplied by FC.
   const links=new Map();try{for(const [a,b] of repos.TeamConfig.teamLinks||[])links.set(String(a),String(b));}catch{}
   const result=[];let skipped=0;
   for(const [key,p] of items){
    const price=Number(read(p,'getMarketAverage'));const rating=Number(p.rating??p._rating);const rareFlag=Number(p.rareflag??p._rareflag);
    const loan=Number(p.loans);const activeEvolution=read(p,'isActiveInAcademy')===true||read(p,'isActiveInTimedEvolution')===true;const cardType=read(p,'isLegend')===true?'icon':read(p,'isLeagueHeroItem')===true?'hero':read(p,'isSpecial')===true||![0,1].includes(rareFlag)?'special':'normal';
    const pos=[...new Set((read(p,'getBasePossiblePositions')??p.basePossiblePositions??[p.preferredPosition]).map(x=>positions[x]).filter(Boolean))];
    if(!(loan<0)||!Number.isFinite(rating)||!pos.length){skipped++;continue;}
    const data=p._staticData??{};const name=data.knownAs||data.name||[data.firstName,data.lastName].filter(Boolean).join(' ')||`Joueur ${p.definitionId}`;
    if(p.teamId==null||p.leagueId==null||p.nationId==null){skipped++;continue;}
    const assets=window.AssetLocationUtils;const absolute=value=>{try{const u=new URL(value,location.href||location.origin);return u.protocol==='https:'?u.href:'';}catch{return '';}};
    const image=(method,...args)=>{try{return absolute(assets?.[method]?.(...args));}catch{return '';}};
    const rarity=repos.Rarity?.getRarity?.(rareFlag);const tier=read(p,'getTier')??(rating>=75?3:rating>=65?2:1);
    const tradeable=read(p,'isTradeable')??p.tradable;const priceAvailable=Number.isFinite(price)&&price>0;
    result.push({id:key,playerId:String(p.databaseId??p.definitionId),sbsScore:Number.isSafeInteger(p.sbsScore)?p.sbsScore:0,definitionId:String(p.definitionId),name,rating,positions:pos,club:`Club ${links.get(String(p.teamId))??p.teamId}`,league:`Ligue ${p.leagueId}`,nation:`Nation ${p.nationId}`,price:priceAvailable?price:null,priceAverage:priceAvailable?price:null,priceAvailable,priceSource:'Moyenne EA',priceUpdatedAt:new Date().toISOString(),dataSource:'ea',portraitUrl:image('getPortraitImageUri',p.databaseId??p.definitionId),cardBackgroundUrl:image('getShellUri',window.ItemViewSize?.LARGE,1,rareFlag,tier,read(rarity,'getGuid')??''),clubBadgeUrl:image('getBadgeImageUri',p.teamId),nationFlagUrl:image('getFlagImageUri',p.nationId),owned:true,tradeable:tradeable===true,tradeableKnown:typeof tradeable==='boolean',inSquad:squadVerified?squadIds.has(key):true,lockedReason:activeEvolution?'Évolution en cours':typeof tradeable!=='boolean'?'Statut échangeable inconnu':'',protected:activeEvolution||typeof tradeable!=='boolean',rarityId:rareFlag,groups:Array.isArray(p.groups)?p.groups:[],firstOwner:p.owners===1,clubId:String(links.get(String(p.teamId))??p.teamId),leagueId:String(p.leagueId),nationId:String(p.nationId),rare:read(p,'isRare')??rareFlag===1,type:cardType});
   }
   send(id,'EASYDCE_READ_RESULT',{players:result,total:items.size,skipped,squadVerified,complete:expected!=null?items.size>=expected:ended});
  }catch(error){send(id,'EASYDCE_READ_RESULT',{error:error.message});}finally{busy=false;}
 });
})();

(function connectSatoDCE(origin,intent='catalogue',freshWindow=false){
 if(location.origin!=='https://www.ea.com'||!location.pathname.includes('/ultimate-team/web-app')){alert('Ouvre la Web App FC pour connecter SatoDCE.');return;}
 window.__easyDceDisconnect?.();const token=crypto.randomUUID(),popup=window.open(`${origin}/?fc=${encodeURIComponent(token)}`,freshWindow?token:'SatoDCE');
 if(!popup){alert('Autorise l’ouverture de la fenêtre SatoDCE pour connecter les deux sites.');return;}
 let busy=false,selectedChallenge=null;const rewardCache=new Map();let lastCatalog=null,rewardTimer=null;const rewardKey=name=>String(name||'').trim().replace(/\s+/g,' ');
 function completeRewardCard(reward){
  const card=reward?.querySelector('.player'),source=card?.querySelector('canvas');if(!source)return '';
  const bounds=card.getBoundingClientRect();if(!bounds.width||!bounds.height)return '';
  const output=document.createElement('canvas');output.width=Math.ceil(bounds.width*2);output.height=Math.ceil(bounds.height*2);const ctx=output.getContext('2d');ctx.scale(2,2);
  for(const canvas of card.querySelectorAll('canvas')){const b=canvas.getBoundingClientRect();if(b.width&&b.height)ctx.drawImage(canvas,b.left-bounds.left,b.top-bounds.top,b.width,b.height);}
  for(const el of card.querySelectorAll('.name.main-view,.playerOverview .rating,.playerOverview .position,.item-view--player-stats span')){
   const text=el.textContent?.trim(),b=el.getBoundingClientRect(),style=getComputedStyle(el);if(!text||!b.width||!b.height||style.visibility==='hidden')continue;
   ctx.font=`${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;ctx.fillStyle=style.color;ctx.textAlign=style.textAlign==='center'?'center':style.textAlign==='right'?'right':'left';ctx.textBaseline='alphabetic';
   const metrics=ctx.measureText(text),ascent=metrics.fontBoundingBoxAscent??parseFloat(style.fontSize)*.8,descent=metrics.fontBoundingBoxDescent??parseFloat(style.fontSize)*.2;
   const x=b.left-bounds.left+(ctx.textAlign==='center'?b.width/2:ctx.textAlign==='right'?b.width:0),y=b.top-bounds.top+(b.height-ascent-descent)/2+ascent;
   ctx.fillText(text,x,y,b.width);
  }
  const data=output.toDataURL('image/png');return data.length<500000?data:'';
 }
 function readVisibleRewards(){
  if(typeof document==='undefined')return;
  for(const tile of document.querySelectorAll('.ut-sbc-set-tile-view')){
   const title=tile.querySelector('.tileTitle')?.textContent?.trim();if(!title)continue;
   const name=tile.querySelector('.reward-container .type')?.textContent?.trim()||'';
   const reward=tile.querySelector('.main-reward');let imageUrl='';
   const pack=reward?.querySelector('img.ut-pack-graphic-view--background');
   if(pack?.src?.startsWith('https://')){imageUrl=pack.src;if(pack.complete&&pack.naturalWidth){try{const canvas=document.createElement('canvas');const scale=Math.min(1,400/pack.naturalHeight);canvas.width=Math.ceil(pack.naturalWidth*scale);canvas.height=Math.ceil(pack.naturalHeight*scale);canvas.getContext('2d').drawImage(pack,0,0,canvas.width,canvas.height);const png=canvas.toDataURL('image/png');if(png.length<500000)imageUrl=png;}catch{}}}
   else {try{imageUrl=completeRewardCard(reward);}catch{}}
   if(name||imageUrl){const key=rewardKey(title),old=rewardCache.get(key),iconUrl=tile.querySelector('img.set-image')?.src||'',entry={title,description:tile.querySelector('.tileContent')?.textContent?.trim()||'',name:name||old?.name||'',imageUrl:imageUrl||old?.imageUrl||''};rewardCache.set(key,entry);if(iconUrl)rewardCache.set('icon:'+iconUrl,entry);}
  }
 }
 function platformFromFc(){try{const user=window.services?.User?.getUser?.();const persona=user?.getSelectedPersona?.()??user?.selectedPersona;const sku=String(persona?.sku||persona?.getCurrentClub?.()?.sku||'').toUpperCase();if(/(?:PS4|PS5)$/.test(sku))return 'ps';if(/(?:XBO|XSX|XBX)$/.test(sku))return 'xbox';if(/(?:PCC|PC|STM)$/.test(sku))return 'pc';if(/(?:SWT|SW2|NX|NSW|SWI|SPR)$/.test(sku))return 'switch';return null;}catch{return null;}}
 const send=data=>{if(!popup.closed)popup.postMessage({type:'SATODCE_FC',token,platform:platformFromFc(),...data},origin);};
 const observe=obs=>new Promise((resolve,reject)=>{const ctx={};let settled=false;const timer=setTimeout(()=>{settled=true;obs?.unobserve?.(ctx);reject(Error('La Web App ne répond pas.'));},20000);if(typeof obs?.observe!=='function'){clearTimeout(timer);reject(Error('Interface FC indisponible.'));return;}obs.observe(ctx,(sender,r)=>{if(settled)return;settled=true;clearTimeout(timer);sender?.unobserve?.(ctx);if(r?.success===false)reject(Error('FC a refusé cette opération.'));else resolve(r?.data??r?.response??r);});});
 function scoreArea(){const queue=[window._appMain?._rootViewController??window.getAppMain?.()?._rootViewController],seen=new Set();while(queue.length&&seen.size<200){const node=queue.shift();if(!node||typeof node!=='object'||seen.has(node))continue;seen.add(node);const model=node.viewModel??node._viewmodel??node.getViewModel?.();if(model?.getChallenge?.()?.isOneClickChallenge?.()&&typeof model.selectItem==='function')return {model,node};for(const key of ['currentController','leftController','rightController','workAreaController','_childViewControllers','childViewControllers']){const value=node[key];if(Array.isArray(value))queue.push(...value);else if(value)queue.push(value);}}throw Error('Ouvre le DCE simplifié dans FC avant de placer ses cartes.');}
 function challenge(){try{return scoreArea().model.getChallenge();}catch{} const root=window._appMain?._rootViewController??window.getAppMain?.()?._rootViewController;const queue=[root],seen=new Set();while(queue.length&&seen.size<200){const node=queue.shift();if(!node||typeof node!=='object'||seen.has(node))continue;seen.add(node);if(node._challenge?.squad)return node._challenge;if(node.challenge?.squad)return node.challenge;for(const key of ['currentController','leftController','rightController','workAreaController','_childViewControllers','childViewControllers']){const value=node[key];if(Array.isArray(value))queue.push(...value);else if(value)queue.push(value);}}throw Error('Ouvre le terrain du DCE à remplir dans la Web App.');}
 function describe(ch=challenge()){
 if(ch.isOneClickChallenge?.()){let area;try{area=scoreArea();}catch{}const target=ch.scoreRequirement-ch.submittedScore;const pickLimit=area?.model.getSelectionLimit?.()??window.services?.Configuration?.getFeatureSetting?.(window.UTServerSettingsRepository?.KEY?.ONE_CLICK_SBC_SUBMIT_LIMIT)??window.UTOneClickSBCWorkAreaViewModel?.DEFAULT_PAGE_SIZE;if(!Number.isSafeInteger(target)||target<=0||!Number.isSafeInteger(pickLimit)||pickLimit<1||pickLimit>100)throw Error('Ouvre ce DCE simplifié dans FC pour lire son score et sa limite de cartes.');return {kind:'score',challengeId:String(ch.id),setId:String(ch.setId??''),challenge:ch.name||'DCE à score',scoreTarget:target,pickLimit,size:1,rating:0,minRating:1,maxRating:99,rare:0,maxLeagues:11,minNations:1,chemistry:0,rules:[],slots:[],visualSlots:[],lockedSlots:[]};}
 if(!ch.squad||typeof ch.squad.getPlayers!=='function')throw Error('Ce défi n’a pas de terrain classique disponible.');
 const field=ch.squad.getPlayers().filter(s=>s.position);if(field.length!==11||field.some(s=>s.requirement?.playerType&&!['DEFAULT','BRICK'].includes(s.requirement.playerType)))throw Error('Ce type d’emplacement FC n’est pas pris en charge.');
 const free=field.filter(s=>s.requirement?.playerType!=='BRICK'),keys=window.SBCEligibilityKey??{},reverse=new Map(Object.entries(keys).map(([key,id])=>[String(id),key]));
 const allowed=new Set(['TEAM_RATING','PLAYER_COUNT','PLAYER_QUALITY','PLAYER_LEVEL','NATION_ID','LEAGUE_ID','CLUB_ID','NATION_COUNT','LEAGUE_COUNT','CLUB_COUNT','SAME_NATION_COUNT','SAME_LEAGUE_COUNT','SAME_CLUB_COUNT','LEGEND_COUNT','PLAYER_RARITY','PLAYER_RARITY_GROUP','PLAYER_MAX_OVR','PLAYER_MIN_OVR','PLAYER_EXACT_OVR','FIRST_OWNER_PLAYERS_COUNT','PLAYER_TRADABILITY','CHEMISTRY_POINTS','ALL_PLAYERS_CHEMISTRY_POINTS']);
 const predicate=new Set(['NATION_ID','LEAGUE_ID','CLUB_ID','PLAYER_LEVEL','PLAYER_RARITY','PLAYER_RARITY_GROUP','PLAYER_MAX_OVR','PLAYER_MIN_OVR','PLAYER_EXACT_OVR','PLAYER_TRADABILITY']);
 const rules=(ch.eligibilityRequirements??[]).map(req=>{const conditions=Object.entries(req.kvPairs?._collection??{}).map(([id,values])=>({key:reverse.get(String(id)),values}));if(!conditions.length||conditions.some(c=>!allowed.has(c.key)||!Array.isArray(c.values)||!c.values.length||c.values.some(v=>!Number.isFinite(v)))||![0,1,2].includes(req.scope)||conditions.length>1&&conditions.some(c=>!predicate.has(c.key)))throw Error('Ce DCE comporte une exigence encore non prise en charge.');return {conditions,scope:req.scope,count:req.count};});
 const options={challengeId:String(ch.id),setId:String(ch.setId??''),challenge:ch.name||'DCE FC',size:free.length,rating:0,minRating:1,maxRating:99,rare:0,maxLeagues:11,minNations:1,chemistry:0,rules,requirementOperation:ch.eligibilityOperation==='OR'?'OR':'AND'};
 if(options.requirementOperation==='AND')for(const rule of rules){if(rule.conditions.length!==1)continue;const {key,values}=rule.conditions[0],v=values[0];if(key==='TEAM_RATING'&&rule.scope===0)options.rating=v;else if(key==='PLAYER_COUNT'&&rule.scope===2&&v!==free.length)throw Error('Nombre de joueurs incompatible avec les emplacements FC.');else if(key==='LEAGUE_COUNT'&&rule.scope===1)options.maxLeagues=v;else if(key==='NATION_COUNT'&&rule.scope===0)options.minNations=v;else if(key==='CHEMISTRY_POINTS'&&rule.scope===0)options.chemistry=v;else if(key==='PLAYER_QUALITY'&&values.length===1&&[1,2,3].includes(v)){const tiers={1:[1,64],2:[65,74],3:[75,99]};if(rule.scope!==1)options.minRating=tiers[v][0];if(rule.scope!==0)options.maxRating=tiers[v][1];}}
 const names={0:'GK',3:'RB',4:'CB',5:'CB',6:'CB',7:'LB',9:'CDM',10:'CDM',11:'CDM',12:'RM',13:'CM',14:'CM',15:'CM',16:'LM',17:'CAM',18:'CAM',19:'CAM',23:'RW',24:'ST',25:'ST',26:'ST',27:'LW'};
 options.visualSlots=free.map(s=>names[s.position.typeId??s.position.id]);if(options.visualSlots.some(s=>!s))options.visualSlots=[];options.lockedSlots=field.filter(s=>s.requirement?.playerType==='BRICK').map(s=>names[s.position.typeId??s.position.id]||'');options.slots=rules.some(r=>r.conditions.some(c=>['CHEMISTRY_POINTS','ALL_PLAYERS_CHEMISTRY_POINTS'].includes(c.key)))?free.map(s=>names[s.position.typeId??s.position.id]):[];if(options.slots.some(x=>!x))throw Error('Formation FC non prise en charge.');return options;
 }
 async function scoreEligibility(ch){const scores={},marketScores={};if(typeof window.UTSearchCriteriaDTO!=='function'||typeof window.services?.Club?.search!=='function')throw Error('Lecture des cartes admissibles indisponible.');for(let offset=0;offset<10000;offset+=100){const criteria=new window.UTSearchCriteriaDTO();Object.assign(criteria,{type:'player',count:100,offset,sbcChallengeId:ch.id,pileSearchType:window.PileSearchType?.CLUB});const response=await observe(window.services.Club.search(criteria));if(!Array.isArray(response.items))throw Error('Format des cartes admissibles FC modifié.');for(const item of response.items)if(item.type==='player'&&Number.isSafeInteger(item.sbsScore)&&item.sbsScore>0){scores[String(item.id)]=item.sbsScore;if(Number.isSafeInteger(Number(item.databaseId))&&Number(item.databaseId)>0)marketScores[String(item.databaseId)]=item.sbsScore;}if(response.retrievedAll||response.items.length<100)return {scores,marketScores};send({kind:'progress',message:'Lecture des cartes admissibles au DCE simplifié : '+Object.keys(scores).length});}throw Error('Lecture des cartes admissibles incomplète.');}
 // Each FC tab keeps its own navigation stack: prefer the one on screen.
 function shown(nav){try{const el=nav.getView?.()?.getRootElement?.()??nav._view?.getRootElement?.();return !!el&&el.getClientRects().length>0&&getComputedStyle(el).visibility!=='hidden';}catch{return false;}}
 function navigationController(){
  const root=window._appMain?._rootViewController??window.getAppMain?.()?._rootViewController;const queue=[root],seen=new Set();let navigation;
  while(queue.length&&seen.size<200){const node=queue.shift();if(!node||typeof node!=='object'||seen.has(node))continue;seen.add(node);const nav=node.getNavigationController?.();if(nav?.pushViewController&&(!navigation||!shown(navigation)))navigation=nav;for(const key of ['currentController','leftController','rightController','_childViewControllers','childViewControllers']){const value=node[key];if(Array.isArray(value))queue.push(...value);else if(value)queue.push(value);}}
  return navigation;
 }
 // Shows a classic DCE squad on screen; the placement itself does not depend on it.
 // Opens FC's own SBC tab first, so the DCE appears where players expect it.
 async function sbcTab(){const button=document.querySelector('.ut-tab-bar-item.icon-sbc,.ut-tab-bar .icon-sbc');if(button&&!button.classList.contains('selected')){button.click();await new Promise(r=>setTimeout(r,500));}}
 function showSquad(set,ch){try{const Controller=window.isPhone?.()?window.UTSBCSquadOverviewViewController:window.UTSBCSquadSplitViewController;const navigation=navigationController();if(!navigation||typeof Controller!=='function')return;const controller=new Controller();controller.initWithSBCSet(set,ch.id);navigation.pushViewController(controller,true);}catch{}}
 async function openChallenge(setId,challengeId,anySingle=false){
  const service=window.services.SBC;const setsResponse=await observe(service.requestSets());const sets=setsResponse.sets??service.repository?.getSets?.()??[];const set=Array.from(sets).find(s=>String(s.id)===String(setId));if(!set)throw Error('Ce DCE n’est plus disponible. Actualise le catalogue.');if(set.hasExpired?.()||set.isComplete?.()&&!set.isRepeatable)throw Error('Ce DCE est terminé ou expiré.');if(typeof service.requestChallengesForSet!=='function')throw Error('Chargement des défis indisponible.');const response=await observe(service.requestChallengesForSet(set));const challenges=Array.from(response.challenges??set.getChallenges?.()??[]);
  if(anySingle&&challenges.length!==1)return {set,challenges};
  const ch=challenges.find(c=>String(c.id)===String(challengeId)||(anySingle&&challenges.length===1));if(!ch)throw Error('Défi introuvable.');
  if(ch.isOneClickChallenge?.()){await sbcTab();await openScoreChallenge(set,ch);for(let i=0;i<60;i++){try{if(String(scoreArea().model.getChallenge().id)===String(ch.id))break;}catch{}await new Promise(r=>setTimeout(r,100));}}
  else{await observe(service.loadChallenge(ch));await sbcTab();showSquad(set,ch);}
  selectedChallenge=ch;return {set,ch,challenges};
 }
 async function openScoreChallenge(set,ch){
  const navigation=navigationController();
  const Controller=window.isPhone?.()?window.UTOneClickSBCWorkAreaViewController:window.UTOneClickSBCWorkAreaSplitViewController;
  if(!navigation||typeof Controller!=='function')throw Error('Ouvre ce DCE à points dans FC, puis clique sur Lire le DCE ouvert.');
  if(ch.hasNotStarted?.()){if(typeof window.services?.SBC?.initiateOneClickChallenge!=='function')throw Error('Ouverture du DCE à points indisponible.');await observe(window.services.SBC.initiateOneClickChallenge(ch));}
  const controller=new Controller();controller.initWithSBCSet(set,ch.id);navigation.pushViewController(controller,true);
 }
 async function optionsFor(ch){const options=describe(ch);if(options.kind==='score'){const eligibility=await scoreEligibility(ch);options.eligibleScores=eligibility.scores;options.eligibleMarketScores=eligibility.marketScores;}return options;}
 async function fillScore(data){const {model,node}=scoreArea(),ch=model.getChallenge();if(String(ch.id)!==String(data.challengeId))throw Error('Le DCE simplifié ouvert a changé.');const cards=new Map(Array.from(window.repositories?.Item?.club?.items?.values?.()??[]).map(p=>[String(p.id),p]));const chosen=(data.ids||[]).map(id=>cards.get(String(id)));if(!chosen.length||chosen.length>model.getSelectionLimit()||new Set(data.ids).size!==chosen.length||chosen.some(p=>!p||p.type!=='player'||!model.isItemSelectable(p)))throw Error('Une carte n’est pas admissible dans ce DCE. Réimporte ton club.');if(chosen.reduce((s,p)=>s+p.sbsScore,0)+ch.submittedScore<ch.scoreRequirement)throw Error('Score insuffisant : relance le calcul.');if(!model._itemScoreMap||!model._itemEntityMap||!model._itemTabMap)throw Error('Interface FC modifiée : placement indisponible.');const original=model.getSelectedItemIds().map(id=>model._itemEntityMap.get(id));try{model.clearSelection();for(const item of chosen){model._itemScoreMap.set(item.id,item.sbsScore);model._itemEntityMap.set(item.id,item);model._itemTabMap.set(item.id,window.OneClickSBCWorkAreaTab?.CLUB);if(!model.selectItem(item))throw Error('FC a refusé une carte.');}if(model.getSelectedScore()+ch.submittedScore<ch.scoreRequirement)throw Error('FC a refusé le score.');node._refreshSelectionControls?.();node.selectionChanged?.();return {message:'Cartes sélectionnées dans le DCE simplifié. Vérifie la sélection puis confirme dans FC.'};}catch(error){model.clearSelection();for(const item of original)if(item)model.selectItem(item);node._refreshSelectionControls?.();throw error;}}
 async function fill(data){
  let current=null;try{current=challenge();}catch{}const same=c=>!!c&&String(c.id)===String(data.challengeId);
  // A DCE left open in another FC tab still counts as "current": also open it when its title is not on screen.
  const setName=Array.from(window.services?.SBC?.repository?.getSets?.()??[]).find(s=>String(s.id)===String(data.setId))?.name,onScreen=!setName||Array.from(document.querySelectorAll('h1')).some(h=>h.offsetParent&&h.textContent.trim()===String(setName).trim());
  if((!onScreen||!same(selectedChallenge)&&!same(current))&&/^\d{1,12}$/.test(String(data.setId||'')))await openChallenge(data.setId,data.challengeId);
  if(selectedChallenge?.isOneClickChallenge?.()){return fillScore(data);}try{if(challenge().isOneClickChallenge?.())return fillScore(data);}catch{} 
  const ch=selectedChallenge&&String(selectedChallenge.id)===String(data.challengeId)?selectedChallenge:challenge();if(String(ch.id)!==String(data.challengeId))throw Error('Le DCE ouvert a changé. Importe à nouveau ses exigences.');
  const slots=ch.squad.getPlayers();const starters=slots.map((s,i)=>s.position&&s.requirement?.playerType!=='BRICK'?i:-1).filter(i=>i>=0);
  if(!starters.length||data.ids?.length!==starters.length||new Set(data.ids).size!==starters.length)throw Error('L’envoi doit correspondre aux emplacements libres du DCE.');
  if(starters.some(i=>slots[i].requirement?.playerType&&slots[i].requirement.playerType!=='DEFAULT'))throw Error('Emplacements verrouillés non pris en charge.');
  const cards=new Map(Array.from(window.repositories?.Item?.club?.items?.values?.()??[]).map(p=>[String(p.id),p]));
  // A reopened FC session has an empty in-memory club. Resolve the selected
  // owned cards inside FC without replacing the inventory saved in SatoDCE.
  const ownedIds=(data.players||data.ids.map(id=>({id,owned:true}))).filter(p=>p.owned).map(p=>String(p.id));
  if(ownedIds.some(id=>!cards.has(id))&&typeof window.UTSearchCriteriaDTO==='function'&&typeof window.services?.Club?.search==='function'){
   for(let offset=0;offset<10000&&ownedIds.some(id=>!cards.has(id));offset+=100){
    const criteria=new window.UTSearchCriteriaDTO();Object.assign(criteria,{type:'player',count:100,offset,sortBy:'ovr',sort:'desc'});
    const page=await observe(window.services.Club.search(criteria));const batch=page.items;
    if(!Array.isArray(batch))throw Error('Lecture des cartes FC indisponible.');
    for(const item of batch)cards.set(String(item.id),item);
    if(batch.length<100)break;
   }
  }
  const requests=data.players||data.ids.map(id=>({id,owned:true}));
  if(requests.length!==starters.length||requests.some(p=>typeof p.owned!=='boolean'))throw Error('Solution invalide.');
  const missing=requests.filter(p=>!p.owned);
  let concepts=[];
  if(missing.length){
   if(typeof window.UTSearchCriteriaDTO!=='function'||typeof window.services?.Item?.searchConceptItems!=='function')throw Error('Les cartes concept FC sont indisponibles.');
   if(missing.some(p=>!/^\d{1,12}$/.test(String(p.definitionId))))throw Error('Identifiant de carte marché invalide.');
   const criteria=new window.UTSearchCriteriaDTO();criteria.type=window.SearchType.PLAYER;criteria.defId=missing.map(p=>Number(p.definitionId));criteria.isExactSearch=true;
   const response=await observe(window.services.Item.searchConceptItems(criteria));concepts=response?.items||[];
   for(const p of missing){if(concepts.some(c=>String(c.databaseId??c.definitionId)===String(p.definitionId)&&c.concept===true))continue;criteria.defId=[Number(p.definitionId)];const exact=await observe(window.services.Item.searchConceptItems(criteria));concepts.push(...(exact?.items||[]));}
  }
  const chosen=requests.map(p=>p.owned?cards.get(String(p.id)):concepts.find(c=>String(c.databaseId??c.definitionId)===String(p.definitionId)&&c.concept===true));
  if(chosen.some(p=>!p||p.type!=='player'))throw Error('Une carte du club ou sa version concept exacte est indisponible. Réimporte puis relance la solution.');
  if(typeof ch.squad.setPlayers!=='function'||typeof ch.meetsRequirements!=='function'||typeof window.services?.SBC?.saveChallenge!=='function')throw Error('Interface FC modifiée : envoi désactivé.');
  const original=slots.map(s=>s.getItem());const planned=[...original];starters.forEach((index,i)=>planned[index]=chosen[i]);
  let saveStarted=false;
  try{ch.squad.setPlayers(planned,true);if(!missing.length&&!ch.meetsRequirements())throw Error('FC refuse cette combinaison : les exigences ne sont pas satisfaites.');saveStarted=true;await observe(window.services.SBC.saveChallenge(ch));const after=ch.squad.getPlayers();if(starters.some((index,i)=>{const item=after[index].getItem();return chosen[i].concept?String(item?.databaseId)!==String(chosen[i].databaseId):String(item?.id)!==String(chosen[i].id);}))throw Error('Le placement ne correspond pas à la solution envoyée.');ch.onDataChange?.notify?.({squad:ch.squad});return {message:(missing.length?`Équipe placée avec ${missing.length} cartes concept à acheter. Recherche-les sur le marché depuis FC, puis remplace les concepts par les cartes achetées. DCE non soumis.`:'Équipe placée et sauvegardée dans le DCE. Vérifie-la puis valide dans FC.')};}
  catch(error){ch.squad.setPlayers(original,true);ch.onDataChange?.notify?.({squad:ch.squad});if(saveStarted)throw Error(`${error.message} Le terrain local a été restauré ; recharge le DCE pour vérifier l’état serveur.`);throw error;}
 }
 async function catalog(){
  readVisibleRewards();
  const service=window.services?.SBC;if(typeof service?.requestSets!=='function')throw Error('Catalogue FC indisponible : ouvre les DCE dans la Web App.');
  const response=await observe(service.requestSets());const data=response?.data??response;
  const sets=data?.sets??service.repository?.getSets?.();if(!sets)throw Error('Le format du catalogue FC a changé.');
  const state=(item,key)=>typeof item?.[key]==='function'?!!item[key]():null;
  const visual=(method,id)=>{if(id===undefined||id===null||id==='')return '';try{const value=window.AssetLocationUtils?.[method]?.(id);if(!value)return '';const u=new URL(value,location.href);return u.protocol==='https:'?u.href:'';}catch{return '';}};return lastCatalog={syncedAt:new Date().toISOString(),sets:Array.from(sets).map(set=>({id:String(set.id),name:(rewardCache.get('icon:'+visual('getSquadBuildingSetImageUri',set.assetId))||rewardCache.get(rewardKey(set.name)))?.title||String(set.name||'DCE FC'),description:(rewardCache.get('icon:'+visual('getSquadBuildingSetImageUri',set.assetId))||rewardCache.get(rewardKey(set.name)))?.description||String(set.description||''),iconUrl:visual('getSquadBuildingSetImageUri',set.assetId),rewardImageUrl:(rewardCache.get('icon:'+visual('getSquadBuildingSetImageUri',set.assetId))||rewardCache.get(rewardKey(set.name)))?.imageUrl||visual('getSquadBuildingRewardImageUri',set.getPreviewImageId?.()),rewardName:(rewardCache.get('icon:'+visual('getSquadBuildingSetImageUri',set.assetId))||rewardCache.get(rewardKey(set.name)))?.name||String(set.awards?.[0]?.name||set.awards?.[0]?.description||''),completed:state(set,'isComplete'),expired:state(set,'hasExpired'),repeatable:!!set.isRepeatable,timesCompleted:Number.isFinite(set.timesCompleted)?set.timesCompleted:null,endTime:!set.notExpirable&&Number.isFinite(set.endTime)?set.endTime:null,completedCount:Number.isFinite(set.challengesCompletedCount)?set.challengesCompletedCount:null,challengeCount:Number.isFinite(set.challengesCount)?set.challengesCount:null,challenges:Array.from(set.getChallenges?.()??[]).map(ch=>({id:String(ch.id),name:String(ch.name||'Défi FC'),completed:state(ch,'isCompleted'),expired:state(ch,'hasExpired'),timesCompleted:Number.isFinite(ch.timesCompleted)?ch.timesCompleted:null}))}))};
 }
 let collectionCancelled=false;
 // Album purchase: FC's own market results for one exact card, then the whole-market cheapest search.
 async function openMarket(definitionId){
  if(!Number.isSafeInteger(definitionId)||definitionId<=0)throw Error('Joueur invalide.');
  const nav=window.getAppMain?.()?.getRootViewController?.()?.getPresentedViewController?.()?.getCurrentViewController?.();
  if(typeof nav?.pushViewController!=='function'||typeof window.UTSearchCriteriaDTO!=='function')throw Error('La Web App FC n’est pas prête : affiche son accueil (et quitte FUT sur la console) puis réessaie.');
  const criteria=new window.UTSearchCriteriaDTO();Object.assign(criteria,{type:'player',defId:[definitionId],isExactSearch:true});
  window.services.Item.marketRepository?.reset?.();
  const Results=window.isPhone?.()?window.UTMarketSearchResultsViewController:window.UTMarketSearchResultsSplitViewController;
  const results=new Results();results.initWithSearchCriteria(criteria);nav.pushViewController(results);
  for(let i=0;i<40;i++){await new Promise(r=>setTimeout(r,250));const button=document.querySelector('.satodce-market-cheapest');if(button&&!button.disabled){button.click();return {message:'Marché FC ouvert : recherche du moins cher sur tout le marché…'};}}
  return {message:'Marché FC ouvert sur ce joueur.'};
 }
 const handler=async e=>{
  if(e.source!==popup||e.origin!==origin||e.data?.token!==token||e.data.type!=='SATODCE_COMMAND')return;
  const command=e.data.command;
  if(command==='hello'){send({kind:'connected',version:3,resume:true,intent,collectionSupported:typeof window.__satoDCEReadCollection==='function'});return;}
  if(command==='collection-cancel'){collectionCancelled=true;return;}
  if(busy){send({kind:'error',message:'Une opération est déjà en cours.'});return;}
  busy=true;
  try{if(command==='import')window.postMessage({type:'EASYDCE_READ_REQUEST',requestId:token},location.origin);
  else if(command==='challenge'){selectedChallenge=null;send({kind:'challenge',options:await optionsFor(challenge()),solve:intent==='solve'});}
 else if(command==='select-set'||command==='select-challenge'){const {set,ch,challenges}=await openChallenge(e.data.setId,e.data.challengeId,command==='select-set');if(!ch){send({kind:'set-details',setId:String(set.id),challenges:challenges.map(c=>({id:String(c.id),name:String(c.name),completed:!!c.isCompleted?.()}))});}else{const options=await optionsFor(ch);send({kind:'challenge',options,solve:true});}}
  else if(command==='collection'){if(typeof window.__satoDCEReadCollection!=='function')throw Error('Mets le connecteur SatoDCE à jour.');const start=Number(e.data.start)||0;if(!Number.isSafeInteger(start)||start<0||start>100000)throw Error('Position de reprise invalide.');collectionCancelled=false;await window.__satoDCEReadCollection(start,page=>send({kind:'collection-page',...page}),()=>collectionCancelled||popup.closed);}
  else if(command==='catalog')send({kind:'catalog',...await catalog()});
  else if(command==='buy'){window.SatoFcApp?.showFc?.();send({kind:'market',...await openMarket(Number(e.data.definitionId))});}
  else if(command==='fill'){window.SatoFcApp?.showFc?.();send({kind:'filled',...await fill(e.data)});}
  else throw Error('Commande inconnue.');}
  catch(error){send({kind:command==='collection'?'collection-error':'error',message:error.message});}
  finally{if(command!=='import')busy=false;}
 };
 const reader=e=>{if(e.source!==window||e.origin!==location.origin||e.data?.requestId!==token)return;if(e.data.type==='EASYDCE_READ_PROGRESS')send({kind:'progress',message:e.data.message});if(e.data.type==='EASYDCE_READ_RESULT'){busy=false;const {players,complete,squadVerified,skipped,total,error}=e.data;send(error?{kind:'error',message:error}:{kind:'inventory',players,complete,squadVerified,skipped,total});}};
 
 const rewardObserver=typeof MutationObserver==='function'?new MutationObserver(records=>{
  const changed=records.some(record=>record.target?.closest?.('.ut-sbc-set-tile-view')||Array.from(record.addedNodes||[]).some(node=>node.matches?.('.ut-sbc-set-tile-view')||node.querySelector?.('.ut-sbc-set-tile-view')));
  if(!changed)return;clearTimeout(rewardTimer);rewardTimer=setTimeout(()=>{
   readVisibleRewards();if(!lastCatalog)return;
   let updated=false;const sets=lastCatalog.sets.map(set=>{const reward=rewardCache.get('icon:'+set.iconUrl)||rewardCache.get(rewardKey(set.name));if(!reward?.imageUrl||reward.imageUrl===set.rewardImageUrl&&reward.name===set.rewardName)return set;updated=true;return {...set,name:reward.title||set.name,description:reward.description||set.description,rewardImageUrl:reward.imageUrl,rewardName:reward.name||set.rewardName};});
   if(updated){lastCatalog={...lastCatalog,sets};send({kind:'catalog',...lastCatalog});}
  },500);
 }):null;
 if(rewardObserver&&document.body)rewardObserver.observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['src','class'],characterData:true});
 readVisibleRewards();
 window.__satoDceHasChallenge=()=>{try{challenge();return true;}catch{return false;}};
 window.__satoDceSolve=async()=>{selectedChallenge=null;send({kind:'challenge',manualSolve:true,options:await optionsFor(challenge())});};
 window.addEventListener('message',handler);window.addEventListener('message',reader);window.__easyDceDisconnect=()=>{delete window.__satoDceHasChallenge;delete window.__satoDceSolve;rewardObserver?.disconnect();clearTimeout(rewardTimer);clearInterval(cleanup);window.removeEventListener('message',handler);window.removeEventListener('message',reader);};
 const cleanup=setInterval(()=>{if(popup.closed){rewardObserver?.disconnect();clearTimeout(rewardTimer);clearInterval(cleanup);window.removeEventListener('message',handler);window.removeEventListener('message',reader);}},3000);
})('https://satodce.fr','resume',true);})();