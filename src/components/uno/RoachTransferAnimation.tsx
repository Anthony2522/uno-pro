// Visual-only, synchronized to the server's public Barata transfer event.
// The backend remains authoritative about which player receives the copy.
import {useEffect,useState,type CSSProperties} from "react";
import type {GameState} from "@/lib/uno/api";
import {sfx} from "@/lib/uno/sound";

export const ROACH_LAUNCH_MS=350;
export const ROACH_TRAVEL_MS=1800;
export const ROACH_SCARE_MS=1150;
export const ROACH_ARRIVAL_MS=ROACH_LAUNCH_MS+ROACH_TRAVEL_MS;
export const ROACH_TOTAL_MS=ROACH_ARRIVAL_MS+ROACH_SCARE_MS;
const WIDTH=148;
const HEIGHT=99;

export type ScreenRect={left:number;top:number;width:number;height:number};
export type ScreenSize={width:number;height:number};
export type RoachFlightPath={
  startX:number;startY:number;
  firstX:number;firstY:number;
  secondX:number;secondY:number;
  endX:number;endY:number;
};
const clamp=(n:number,min:number,max:number)=>Math.max(min,Math.min(max,n));

/** Deterministic viewport-space path: from the discard pile to the recipient's hand.
 * Opponent seats may be beyond a horizontal scroller; clamp those to the visible edge. */
export function roachFlightPath(
  source:ScreenRect|undefined,
  destination:ScreenRect|undefined,
  viewport:ScreenSize,
):RoachFlightPath{
  const cx=(r:ScreenRect|undefined,fallback:number)=>r?r.left+r.width/2:fallback;
  const cy=(r:ScreenRect|undefined,fallback:number)=>r?r.top+r.height/2:fallback;
  const startCenterX=clamp(cx(source,viewport.width*.5),WIDTH*.5,Math.max(WIDTH*.5,viewport.width-WIDTH*.5));
  const startCenterY=clamp(cy(source,viewport.height*.48),HEIGHT*.5,Math.max(HEIGHT*.5,viewport.height-HEIGHT*.5));
  const endCenterX=clamp(cx(destination,viewport.width*.5),WIDTH*.5,Math.max(WIDTH*.5,viewport.width-WIDTH*.5));
  const endCenterY=clamp(cy(destination,viewport.height*.17),HEIGHT*.5,Math.max(HEIGHT*.5,viewport.height-HEIGHT*.5));
  const dx=endCenterX-startCenterX,dy=endCenterY-startCenterY;
  const lift=Math.min(130,Math.max(58,viewport.height*.12));
  return {
    startX:startCenterX-WIDTH/2,startY:startCenterY-HEIGHT/2,
    firstX:startCenterX+dx*.25-WIDTH/2,firstY:startCenterY+dy*.20-lift-HEIGHT/2,
    secondX:startCenterX+dx*.72-WIDTH/2,secondY:startCenterY+dy*.72-lift*.52-HEIGHT/2,
    endX:endCenterX-WIDTH/2,endY:endCenterY-HEIGHT/2,
  };
}

type RoachEvent=GameState["effects"][number];

export function RoachTransferAnimation({
  event,me,language
}:{
  event:RoachEvent;me:string;language:"pt"|"en";
}){
  const elapsedAtMount=Math.max(0,Date.now()-event.show_at);
  const [elapsed]=useState(elapsedAtMount);
  const [flight,setFlight]=useState<CSSProperties|null>(null);
  const [scare,setScare]=useState(false);
  const recipient=event.target===me;
  useEffect(()=>{
    // Coordinate lookup occurs after the GameTable and its seat markers are mounted.
    const from=document.querySelector<HTMLElement>("[data-discard-pile]")?.getBoundingClientRect();
    let to:DOMRect|undefined;
    if(recipient)to=document.querySelector<HTMLElement>("[data-my-hand]")?.getBoundingClientRect();
    else{
      const seat=Array.from(document.querySelectorAll<HTMLElement>("[data-player-seat]"))
        .find(el=>el.dataset.playerSeat===event.target);
      to=(seat?.querySelector<HTMLElement>("[data-seat-cards]")??seat)?.getBoundingClientRect();
    }
    const path=roachFlightPath(from,to,{width:window.innerWidth,height:window.innerHeight});
    const vars={
      "--roach-start-x":path.startX+"px","--roach-start-y":path.startY+"px",
      "--roach-first-x":path.firstX+"px","--roach-first-y":path.firstY+"px",
      "--roach-second-x":path.secondX+"px","--roach-second-y":path.secondY+"px",
      "--roach-end-x":path.endX+"px","--roach-end-y":path.endY+"px",
      "--roach-delay":(-Math.max(0,Date.now()-event.show_at))+"ms",
    } as CSSProperties;
    setFlight(vars);
  },[event.id,event.show_at,event.target,recipient]);

  useEffect(()=>{
    if(elapsed>=ROACH_TOTAL_MS)return;
    const timers:Array<ReturnType<typeof setTimeout>>=[];
    // A subtle scuttle cue is audible to everybody during the visible flight.
    if(elapsed<ROACH_LAUNCH_MS+220){
      timers.push(setTimeout(()=>{if(document.visibilityState==="visible")sfx("roach_scuttle");},
        Math.max(0,ROACH_LAUNCH_MS-elapsed)));
    }
    // Only the selected recipient gets the frontal jumpscare and impact sound.
    if(recipient){
      timers.push(setTimeout(()=>{
        if(document.visibilityState==="hidden")return;
        setScare(true);
        sfx("roach_scare");
      },Math.max(0,ROACH_ARRIVAL_MS-elapsed)));
    }
    return ()=>timers.forEach(clearTimeout);
  },[event.id,elapsed,recipient]);

  const inFlight=elapsed<ROACH_ARRIVAL_MS;
  return <>
    {inFlight&&flight&&<div className="uno-roach-flight pointer-events-none fixed inset-0 z-[81]" aria-hidden="true">
      <div className="uno-roach-traveler" style={flight}>
        <img src="/roach-top.webp" width="148" height="99" draggable={false} alt=""/>
        <span className="uno-roach-destination">{event.target_name||"Jogador"}</span>
      </div>
    </div>}
    {recipient&&scare&&<div key={event.id} className="uno-roach-scare pointer-events-none fixed inset-0 z-[110] flex flex-col items-center justify-center overflow-hidden"
      role="alert" aria-live="assertive" aria-label={language==="en"?"A cockroach invaded your hand!":"Uma barata invadiu sua mão!"}>
      <div className="uno-roach-scare-backdrop absolute inset-0"/>
      <img src="/roach-front.webp" alt="" draggable={false}
        className="uno-roach-scare-image relative h-auto max-h-[85dvh] w-[min(92vw,640px)] object-contain drop-shadow-[0_0_28px_rgba(225,70,15,0.8)]"/>
      <p className="uno-roach-scare-label absolute bottom-[11%] px-3 text-center font-display text-lg font-black text-orange-100 drop-shadow-[0_2px_6px_black] sm:text-2xl">
        {language==="en"?"THE ROACH GOT YOU!":"A BARATA TE PEGOU!"}
      </p>
    </div>}
  </>;
}
