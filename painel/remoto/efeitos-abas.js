'use strict';
// Presentation only. No backend, polling, input resets or mutation events.
(()=>{
 const names=['quality','local-captions','creative-effects'];
 const tabs=names.map(id=>document.getElementById('tab-'+id)),panels=names.map(id=>document.getElementById(id));
 if(tabs.some(t=>!t)||panels.some(p=>!p))return;
 function select(id,{focus=false,hash=false}={}){const index=names.indexOf(id);if(index<0)return false;tabs.forEach((tab,i)=>{tab.setAttribute('aria-selected',String(i===index));tab.tabIndex=i===index?0:-1;panels[i].hidden=i!==index;});if(focus)tabs[index].focus();if(hash&&location.hash!=='#'+id)history.replaceState(null,'','#'+id);return true;}
 const hashId=()=>{try{return decodeURIComponent(location.hash.slice(1));}catch{return'';}};
 for(const[at,tab]of tabs.entries()){
  tab.addEventListener('click',()=>select(names[at],{hash:true}));
  tab.addEventListener('keydown',e=>{let next;if(e.key==='ArrowRight')next=(at+1)%names.length;else if(e.key==='ArrowLeft')next=(at+names.length-1)%names.length;else if(e.key==='Home')next=0;else if(e.key==='End')next=names.length-1;else return;e.preventDefault();select(names[next],{focus:true,hash:true});});
 }
 select(names.includes(hashId())?hashId():'quality');
 window.addEventListener('hashchange',()=>select(names.includes(hashId())?hashId():'quality'));
})();
