// Shared hold lifecycle for dock and full PTZ console. No DOM or credentials.
(function(root){
 class PTZHold {
  constructor({send,onError=()=>{}}){this.send=send;this.onError=onError;this.epoch=0;this.current=null;}
  async start(device,command,data){
   await this.stop();const epoch=++this.epoch;
   const current={device,epoch,token:null,timer:null,busy:false};this.current=current;
   try{
    const result=await this.send('ptz_acquire',{device,owner:'PTZ console'});
    if(this.current!==current||epoch!==this.epoch){await this.send('ptz_release',{device,token:result.token});return;}
    current.token=result.token;
    const tick=async()=>{
     if(current.busy||this.current!==current)return;
     current.busy=true;
     try{await this.send(command,{...data,device,token:current.token});}
     catch(error){await this.stop();this.onError(error);}
     finally{current.busy=false;}
    };
    await tick();
    if(this.current===current)current.timer=setInterval(tick,150);
   }catch(error){if(this.current===current)await this.stop();this.onError(error);}
  }
  async stop(){
   ++this.epoch;const current=this.current;this.current=null;
   if(!current)return;clearInterval(current.timer);
   if(current.token)try{await this.send('ptz_release',{device:current.device,token:current.token});}catch(error){this.onError(error);}
  }
 }
 if(typeof module!=='undefined')module.exports={PTZHold};root.PTZHold=PTZHold;
})(typeof window!=='undefined'?window:globalThis);
