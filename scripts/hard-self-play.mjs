// Complete-rule, 228-card self-play league. Each active seat is an actual HARD bot,
// running the production UNO engine on a deterministic virtual clock.
// The single host is a non-participating spectator; no hidden opponent hands are given to AI.
// Usage: UNO_SELF_PLAY=1 node scripts/hard-self-play.mjs [--full|--quick]
import crypto from "node:crypto";
import {store,newDeck,setClock} from "../server/game.js";
import {proRpc,proSweep} from "../server/pro.js";

if(process.env.UNO_SELF_PLAY!=="1")throw Error("Set UNO_SELF_PLAY=1 for isolated tournament");
const rawNow=Date.now,rawRandom=Math.random,rawRandomInt=crypto.randomInt;
let virtualNow=1800000000000;
Date.now=()=>virtualNow;setClock(()=>virtualNow);
const makeRandom=seed=>()=>{
  let x=seed+=0x6d2b79f5;
  x=Math.imul(x^x>>>15,x|1);x^=x+Math.imul(x^x>>>7,x|61);
  return ((x^x>>>14)>>>0)/4294967296;
};
const rawArgs=process.argv;
const full=rawArgs.includes("--full"),quick=rawArgs.includes("--quick");
const stageSeeds=full?18:quick?5:10;
const finalSeeds=full?140:quick?20:60;
const selfSeeds=full?24:quick?5:12;
const seedOffset=Number(rawArgs.find(a=>a.startsWith("--seed="))?.slice(7)||0);
const base={negationKeep:16.5,drawKeep:1,wildKeep:1,handShape:1,aggression:1,urgency:1,perCard:1,colorFit:1};
const tuned=[
  {name:"balanced",params:{...base}},
  {name:"defensive",params:{...base,negationKeep:22,drawKeep:.74,handShape:1.13,urgency:1.1}},
  {name:"speed",params:{...base,negationKeep:14,perCard:1.24,handShape:.8,aggression:1.12}},
  {name:"press",params:{...base,negationKeep:18,aggression:1.4,urgency:1.4,drawKeep:.9}},
  {name:"flex",params:{...base,negationKeep:19.5,handShape:1.25,colorFit:1.22,perCard:.95}},
];
const clamp=(n,lo,hi)=>Math.min(hi,Math.max(lo,n));
const perturb=(champion,generation)=>[
  {name:"retain_"+generation,params:{...champion.params}},
  {name:"protect_"+generation,params:{...champion.params,negationKeep:clamp(champion.params.negationKeep*1.22,10,33),drawKeep:clamp(champion.params.drawKeep*.84,.5,1.6)}},
  {name:"tempo_"+generation,params:{...champion.params,perCard:clamp(champion.params.perCard*1.17,.65,1.55),handShape:clamp(champion.params.handShape*.87,.6,1.6)}},
  {name:"attack_"+generation,params:{...champion.params,aggression:clamp(champion.params.aggression*1.2,.6,1.8),urgency:clamp(champion.params.urgency*1.25,.6,2)}},
  {name:"diverse_"+generation,params:{...champion.params,handShape:clamp(champion.params.handShape*1.19,.65,1.65),colorFit:clamp(champion.params.colorFit*1.16,.65,1.75)}},
];
function match(seed,variants){
  const n=variants.length;
  if(n!==2&&n!==3)throw Error("Invalid tournament size");
  let rand=makeRandom(seed*17293+71);
  Math.random=rand;crypto.randomInt=(cap)=>Math.floor(rand()*cap);
  virtualNow=1800000000000+seed*100000000;
  let room=null,host=null,bots=[];
  try{
    host=proRpc("register_guest",{p_nickname:"Torneio"});
    const {code}=proRpc("create_room",{p_token:host.token,p_name:"IA "+seed,p_is_public:false,p_max_players:n+1,
      p_rules:{repeat:true,sequence:true,nine:true,cut:true,stack:true},p_winners:1,p_starting_cards:8});
    room=store.roomsByCode.get(code);
    for(let seat=0;seat<n;seat++){
      const player=proRpc("add_bot",{p_token:host.token,p_code:code,p_difficulty:"hard"});
      bots.push(player.id);
      const guest=store.guestsById.get(player.id);
      guest.ai_variant=variants[seat].name==="baseline"?"original-hard":"trained-hard";
      guest.ai_profile=variants[seat].params||null;
    }
    proRpc("start_game",{p_token:host.token,p_code:code});
    const g=room.game;
    g.self_play_benchmark=true;
    room.members.find(member=>member.guest_id===host.guest_id).spectator=true;
    room.hands.delete(host.guest_id);
    g.turn_order=[...bots];g.turn_idx=seed%n;g.direction=seed%2?1:-1;
    g.placements=[];g.winners_target=1;g.nine=null;g.effects=[];g.public_history={};
    g.turn_cards=[];g.turn_mode=null;g.turn_step=0;g.pending_draw=0;g.pending_uncounterable=false;g.pending_source=null;
    g.bot_move=null;g.bot_cut=null;g.last_wild=null;g.mirror_played_as=null;g.status="playing";room.status="playing";
    // Seed again after setup. All seats see the same physical 228-card distribution for a given seed.
    rand=makeRandom(seed*971+5107);Math.random=rand;crypto.randomInt=(cap)=>Math.floor(rand()*cap);
    const d=newDeck();
    if(d.length!==228||!d.includes("Q")||!d.includes("rE")||!d.includes("bH")||!d.includes("rC"))throw Error("incomplete deck");
    const topIndex=d.findIndex(c=>/^[rygb][0-9]$/.test(c));
    const [first]=d.splice(topIndex,1);
    g.discard_pile=[first];g.current_color=first[0];g.turn_start_color=first[0];
    for(const id of bots){
      const hand=room.hands.get(id);
      hand.cards=d.splice(0,8);hand.uno_called=false;hand.uno_since=null;hand.bot_uno_plan=null;
    }
    g.draw_pile=d;g.turn_started_at=virtualNow;g.visual_until=0;g.seq=1;
    let steps=0,firstError=null,seenSpecial=new Set(),draws=0,decisionCount=0;
    for(steps=0;steps<4000&&g.status==="playing";steps++){
      virtualNow+=1500;
      const previous=room.game.last_action;
      try{proSweep()}catch(err){firstError=String(err?.code||err?.stack||err);break;}
      if(g.last_action!==previous){decisionCount++;if(g.last_action?.card)seenSpecial.add(g.last_action.card);}
      if(g.last_action?.type==="stack_take")draws+=g.last_action.n||0;
    }
    const winner=g.winner_id;
    return {winner:Math.max(-1,bots.indexOf(winner)),completed:g.status==="finished",
      error:firstError,steps,draws,decisions:decisionCount,seen:seenSpecial.size,finalStatus:g.status};
  }finally{
    if(room){store.rooms.delete(room.id);store.roomsByCode.delete(room.code);}
    if(host){
      const ids=new Set([host.guest_id,...bots]);
      for(const id of ids)store.guestsById.delete(id);
      for(const [hash,guest] of store.guestsByHash)if(ids.has(guest.id))store.guestsByHash.delete(hash);
    }
  }
}
const baseline={name:"baseline"};
let totalMatches=0,failed=0,totalSteps=0,errors=[];
function playSeries(candidate,foe,seeds,seedBase){
  const stats={two:{wins:0,total:0},three:{wins:0,total:0}};
  for(let i=0;i<seeds;i++){
    const seed=seedOffset+seedBase+i;
    for(let seat=0;seat<2;seat++){
      const seats=[foe,foe];seats[seat]=candidate;
      const result=match(seed*13+1,seats);
      totalMatches++;totalSteps+=result.steps;
      if(!result.completed||result.error||result.winner<0){
        failed++;if(errors.length<5)errors.push({seat,n:2,seed,result});continue;
      }
      stats.two.total++;if(result.winner===seat)stats.two.wins++;
    }
    for(let seat=0;seat<3;seat++){
      const seats=[foe,foe,foe];seats[seat]=candidate;
      const result=match(seed*13+2,seats);
      totalMatches++;totalSteps+=result.steps;
      if(!result.completed||result.error||result.winner<0){
        failed++;if(errors.length<5)errors.push({seat,n:3,seed,result});continue;
      }
      stats.three.total++;if(result.winner===seat)stats.three.wins++;
    }
  }
  const rate=(x)=>x.total?+(100*x.wins/x.total).toFixed(2):0;
  // A candidate needs to exceed both chance baselines (50% in duels, 33.33% in trios).
  return {...stats,twoWinPct:rate(stats.two),threeWinPct:rate(stats.three),
    advantage:+((rate(stats.two)-50)*.5+(rate(stats.three)-33.333)*.5).toFixed(2)};
}
function selfPlay(n,seeds,baseSeed,variant){
  const wins=Array(n).fill(0),allResults=[];
  for(let k=0;k<seeds;k++){
    const result=match(seedOffset+baseSeed+k,Array(n).fill(variant));
    totalMatches++;totalSteps+=result.steps;
    if(!result.completed||result.error||result.winner<0){
      failed++;if(errors.length<5)errors.push({type:"self",n,k,result});
    }else wins[result.winner]++;
  }
  return {players:n,games:seeds,wins};
}
try{
  const league=[];
  let champion=tuned[0];
  for(let generation=0;generation<3;generation++){
    const contestants=generation===0?tuned:perturb(champion,generation);
    const trial=contestants.map((p,index)=>{
      const result=playSeries(p,baseline,stageSeeds,1000+generation*2000);
      return {name:p.name,params:p.params,...result};
    }).sort((a,b)=>b.advantage-a.advantage);
    champion={name:trial[0].name,params:trial[0].params};
    league.push({generation,seeds:stageSeeds,leader:trial[0],ranking:trial.map(({name,twoWinPct,threeWinPct,advantage})=>({name,twoWinPct,threeWinPct,advantage}))});
    console.log("UNO_TRAIN_GEN "+JSON.stringify(league.at(-1)));
  }
  const holdout=playSeries(champion,baseline,finalSeeds,99000);
  const self2=selfPlay(2,selfSeeds,790001,champion);
  const self3=selfPlay(3,selfSeeds,790901,champion);
  const report={method:"full_228_card_turn_engine_selfplay",
    rules:{nine:true,cut:true,repeat:true,sequence:true,stack:true},
    cards:"all optional enabled",seedOffset,stageSeeds,finalSeeds,selfSeeds,
    champion,holdout,self2,self3,totalMatches,avgSteps:Math.round(totalSteps/totalMatches),
    failed,errors};
  console.log("UNO_TRAIN_RESULT "+JSON.stringify(report));
  if(failed>totalMatches*.025)process.exitCode=1;
}finally{
  Date.now=rawNow;setClock(rawNow);Math.random=rawRandom;crypto.randomInt=rawRandomInt;
}
