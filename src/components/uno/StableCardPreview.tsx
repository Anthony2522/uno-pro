// Previews are deliberately independent from the responsive cards on the table.
// Fixed SVG dimensions and inline colors avoid intermittent blank previews caused
// by container query sizing or stale responsive CSS on mobile/offline devices.
import type {CSSProperties,ReactNode} from "react";
import {Ban,Repeat2,Eye,Bomb,Shield,ShieldOff,ZapOff,Crosshair,Beer,LockKeyhole,Sword,Scan,Orbit} from "lucide-react";
import {cardLabel,cardValue,isWild} from "@/lib/uno/cards";
import {CockroachIcon} from "./CockroachIcon";

const COLORS:Record<string,string>={r:"#de343b",b:"#2782ed",g:"#28ae65",y:"#e7bd2c"};
const WILD_BG="conic-gradient(#d8373e 0 25%,#e5bf32 25% 50%,#2aa65e 50% 75%,#2486e3 75% 100%)";
const ink="#17233c";

function PreviewSymbol({card}:{card:string}):ReactNode{
  const v=cardValue(card);
  const icons:Record<string,typeof Shield>={
    S:Ban,R:Repeat2,H:Shield,E:Sword,L:LockKeyhole,V:Orbit,C:Beer,
    X:Eye,B:Bomb,N:ShieldOff,P:ZapOff,M:Crosshair,Q:Scan,
  };
  if(v==="A")return <CockroachIcon width={33} height={38} style={{color:ink,"--cockroach-wing-line":"#e9f3fd"} as CSSProperties}/>;
  if(v==="T")return <span style={{display:"flex",alignItems:"center",flexDirection:"column",lineHeight:1}}><Repeat2 width={25} height={23} strokeWidth={3}/><span style={{fontSize:18,fontWeight:900}}>+2</span></span>;
  const Icon=icons[v];
  if(Icon)return <Icon width={29} height={29} strokeWidth={2.7}/>;
  const text=v==="D"?"+2":v==="W4"?"+4":v==="W5"?"+5":v==="W"?"✦":v;
  return <span style={{fontSize:text.length>1?23:31,fontWeight:900,lineHeight:1,fontFamily:"system-ui,sans-serif"}}>{text}</span>;
}

/** One reliable and accessible mini-card in the advanced settings and both manuals. */
export function StableCardPreview({card,width=54}:{card:string;width?:number}){
  const v=cardValue(card);
  const wild=isWild(card);
  const height=width*1.5;
  const color=wild?ink:COLORS[card[0]!]??ink;
  const background=wild?WILD_BG:color;
  return <div role="img" aria-label={cardLabel(card)} data-stable-card-preview={v}
    style={{position:"relative",width,height,flexShrink:0,boxSizing:"border-box",
      overflow:"hidden",borderRadius:Math.max(7,width*.13),
      border:`${Math.max(2,Math.round(width*.055))}px solid #f5e7d8`,background,
      boxShadow:"0 3px 10px rgba(0,0,0,.4)"}}>
    <div aria-hidden="true" style={{
      position:"absolute",left:"21%",top:"13%",width:"58%",height:"74%",
      transform:"rotate(26deg)",borderRadius:"50%",
      background:wild?"rgba(10,18,36,.90)":"#fff8e7",
    }}/>
    <div aria-hidden="true" style={{position:"absolute",left:0,top:0,width:"100%",height:"100%",
      display:"flex",alignItems:"center",justifyContent:"center",
      color:wild?"#fff":ink}}>
      <PreviewSymbol card={card}/>
    </div>
    <div aria-hidden="true" style={{position:"absolute",top:2,left:3,color:"#fff",fontWeight:900,fontSize:11,lineHeight:1,
      textShadow:"0 1px 2px rgba(0,0,0,.9)"}}>{["D","W4","W5"].includes(v)?v==="D"?"+2":v==="W4"?"+4":"+5":/^\d$/.test(v)?v:""}</div>
  </div>;
}
