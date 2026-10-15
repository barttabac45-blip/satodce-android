(()=>{
 if(window.__satoManualSolveInstalled)return;
 window.__satoManualSolveInstalled=true;
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
