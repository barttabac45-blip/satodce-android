(()=>{
 if(document.getElementById('satodce-detail-scroll'))return;
 const style=document.createElement('style');style.id='satodce-detail-scroll';
 style.textContent=`.ut-split-view .ui-layout-right{min-height:0!important;overflow-y:auto!important;overscroll-behavior-y:contain;touch-action:pan-y;-webkit-overflow-scrolling:touch;padding-bottom:32px!important}.ut-split-view .ui-layout-right .DetailView{height:auto!important;min-height:100%;overflow:visible!important;padding-bottom:48px!important;box-sizing:border-box}`;
 (document.head||document.documentElement).append(style);
})();
