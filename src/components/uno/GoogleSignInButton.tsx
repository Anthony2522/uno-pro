import {useEffect,useRef,useState} from "react";
import {api} from "@/lib/uno/api";
type GoogleAccounts={
  initialize(config:{client_id:string;callback:(response:{credential:string})=>void;ux_mode?:string}):void;
  renderButton(target:HTMLElement,options:{theme:string;size:string;width:number;text:string;shape:string}):void;
};
declare global {interface Window {google?:{accounts:{id:GoogleAccounts}}}}
let scriptPromise:Promise<void>|null=null;
function loadGoogle(){
  if(window.google)return Promise.resolve();
  if(!scriptPromise)scriptPromise=new Promise<void>((resolve,reject)=>{
    const element=document.createElement("script");
    element.src="https://accounts.google.com/gsi/client";
    element.async=true;element.defer=true;
    element.onload=()=>resolve();
    element.onerror=()=>{scriptPromise=null;reject(new Error("Não foi possível carregar o login do Google."))};
    document.head.appendChild(element);
  });
  return scriptPromise;
}
/** Official Google Identity Services button; only rendered when configured on the server. */
export function GoogleSignInButton({
  onCredential,
  label="Entrar com Google",
}:{
  onCredential:(credential:string)=>Promise<void>;
  label?:string;
}){
  const container=useRef<HTMLDivElement>(null),handler=useRef(onCredential);
  const [error,setError]=useState<string|null>(null);
  const [enabled,setEnabled]=useState(false);
  handler.current=onCredential;
  useEffect(()=>{
    let mounted=true;
    api.authConfig().then(async config=>{
      if(!mounted)return;
      if(!config.google_client_id){setEnabled(false);return}
      await loadGoogle();
      if(!mounted||!container.current||!window.google)return;
      window.google.accounts.id.initialize({
        client_id:config.google_client_id,
        ux_mode:"popup",
        callback:response=>{void handler.current(response.credential).catch(e=>{if(mounted)setError((e as Error).message||"Não foi possível entrar com Google.")})}
      });
      container.current.replaceChildren();
      window.google.accounts.id.renderButton(container.current,{theme:"outline",size:"large",width:295,text:"continue_with",shape:"pill"});
      setEnabled(true);
    }).catch(e=>{if(mounted)setError((e as Error).message||"Google indisponível.")});
    return()=>{mounted=false};
  },[]);
  return <div className="flex w-full flex-col items-center gap-2">
    <div ref={container} aria-label={label} className="flex min-h-11 w-full justify-center"/>
    {error&&<p role="alert" className="text-center text-xs text-destructive">{error}</p>}
    {!enabled&&!error&&<p className="text-center text-xs text-muted-foreground">O login Google estará disponível após a configuração no servidor.</p>}
  </div>;
}
