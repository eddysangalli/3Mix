// Compatibility URL only; there is one settings module.
(() => {document.documentElement.style.visibility='hidden';try{if(!sessionStorage.getItem('freemix.panel.url'))sessionStorage.setItem('freemix.panel.url',location.href);}catch{}location.replace('/configuracoes'+location.search+location.hash);})();
