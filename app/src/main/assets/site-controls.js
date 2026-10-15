(()=>{
 if(window.__satoManualSolveInstalled)return;
 window.__satoManualSolveInstalled=true;
 const rememberEmail=email=>{if(typeof email==='string'&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))window.SatoApp?.setProfileEmail?.(email);};
 window.addEventListener('satodce-account-changed',e=>{rememberEmail(e.detail?.user?.email);window.SatoApp?.setAccountConnected?.(!!e.detail?.user);});
 fetch('/api/account',{credentials:'same-origin'}).then(r=>r.ok?r.json():null).then(d=>{rememberEmail(d?.user?.email);window.SatoApp?.setAccountConnected?.(!!d?.user);}).catch(()=>window.SatoApp?.setAccountConnected?.(false));
 rememberEmail(document.querySelector('#account-identity')?.textContent);
 let manualChallenge=false;
 const submit=HTMLFormElement.prototype.requestSubmit;
 HTMLFormElement.prototype.requestSubmit=function(...args){
  if(this.id==='solver-form'&&manualChallenge){manualChallenge=false;return;}
  return submit.apply(this,args);
 };
 window.addEventListener('message',e=>{
  if(e.origin!=='https://www.ea.com'||e.source!==window.opener||e.data?.type!=='SATODCE_FC'||e.data.token!==new URLSearchParams(location.search).get('fc'))return;
  if(e.data.kind==='challenge'&&e.data.manualSolve)manualChallenge=true;
 },true);
})();
