import {useEffect,useState} from "react";
import {BookOpen} from "lucide-react";
const KEY="unopro.manual.introduction.v1";
const TEXT="Esse UNO tem regras adicionais, você pode verificá-las no manual.\n\nCaso não goste de alguma, a retire da sua partida em Configurações Avançadas.";
type Anchor={left:number;top:number;arrowLeft:number};

export function FirstVisitManualHint(){
  const [visible,setVisible]=useState(false);
  const [anchor,setAnchor]=useState<Anchor>({left:8,top:80,arrowLeft:120});
  useEffect(()=>{
    try{if(localStorage.getItem(KEY))return;}catch{/* allow ephemeral display */}
    const measure=()=>{
      const trigger=document.querySelector<HTMLElement>("[data-manual-trigger]");
      if(!trigger)return;
      const rect=trigger.getBoundingClientRect();
      const width=Math.min(360,window.innerWidth-24);
      const left=Math.max(12,Math.min(window.innerWidth-width-12,rect.left+rect.width/2-width/2));
      setAnchor({left,top:rect.bottom+14,arrowLeft:Math.max(16,Math.min(width-24,rect.left+rect.width/2-left))});
    };
    measure();setVisible(true);
    try{localStorage.setItem(KEY,"shown");}catch{/* first-visit storage unavailable */}
    const hide=()=>setVisible(false);
    const timer=window.setTimeout(hide,8000);
    const clicked=()=>hide();
    window.addEventListener("resize",measure);
    document.addEventListener("pointerdown",clicked,{capture:true});
    document.addEventListener("keydown",clicked,{capture:true});
    return()=>{
      window.clearTimeout(timer);
      window.removeEventListener("resize",measure);
      document.removeEventListener("pointerdown",clicked,true);
      document.removeEventListener("keydown",clicked,true);
    };
  },[]);
  if(!visible)return null;
  return <aside role="status" aria-live="polite" className="pointer-events-none fixed z-[60] max-w-[calc(100vw-24px)] rounded-2xl border border-cyan/60 bg-navy/95 p-4 text-sm text-foreground shadow-glow-cyan"
    style={{left:anchor.left,top:anchor.top,width:Math.min(360,typeof window!=="undefined"?window.innerWidth-24:360)}}>
    <span aria-hidden="true" className="absolute -top-2 size-4 rotate-45 border-l border-t border-cyan/60 bg-navy"
      style={{left:anchor.arrowLeft-8}}/>
    <p className="mb-2 flex items-center gap-2 font-display font-bold text-cyan"><BookOpen className="size-4"/> Manual de regras</p>
    <p className="whitespace-pre-line leading-relaxed">{TEXT}</p>
  </aside>;
}
