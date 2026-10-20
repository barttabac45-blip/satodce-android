(()=>{
 if(window.__satoSettingsInstalled)return;
 window.__satoSettingsInstalled=true;
 let lastOpen=0;
 const activate=event=>{const button=event.target.closest?.('#satodce-fc-settings');if(!button)return;event.preventDefault();event.stopImmediatePropagation();if(Date.now()-lastOpen<600)return;lastOpen=Date.now();window.SatoFcApp?.openSettings?.();};
 document.addEventListener('touchend',activate,{capture:true,passive:false});
 document.addEventListener('click',activate,true);
 const install=()=>{
  if(document.getElementById('satodce-fc-settings'))return;
  const club=[...document.querySelectorAll('button')].find(b=>/\bClub\s*$/.test(b.textContent.trim())&&!b.closest('[role="dialog"]'));
  if(!club)return;
  const button=document.createElement('button');button.id='satodce-fc-settings';button.type='button';button.className=club.className;button.setAttribute('aria-label','Réglages SATODCE');button.textContent='◇ SATODCE';button.style.fontSize='12px';button.style.whiteSpace='normal';button.onclick=()=>window.SatoFcApp?.openSettings?.();club.insertAdjacentElement('afterend',button);
 };
 new MutationObserver(install).observe(document.body,{childList:true,subtree:true});install();
})();
