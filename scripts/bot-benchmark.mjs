// Deterministic tournament against the real UNO Pro turn engine.
// Uses public state and virtual time; never delays a real multiplayer session.
import {store,setClock} from "../server/game.js";
import {proRpc,proSweep} from "../server/pro.js";

const origNow=Date.now,origRandom=Math.random;
let fakeNow=1_800_000_000_000;
Date.now=()=>fakeNow;
setClock(()=>fakeNow);
const args=process.argv.slice(2);
const mode=args.includes("--paired")?"paired":args.includes("--enhanced")?"enhanced":"baseline";
const nArg=args.find(a=>a.startsWith("--games="));
const games=Math.max(1,Math.min(1000,Number(nArg?.slice(8)||120)));
const repeatCheck=args.some(a=>a.startsWith("--repeat-check"));
const call=(fn,args)=>proRpc(fn,args);
const val=c=>["W","W4","W5","X","B"].includes(c)?c:c.slice(1);
const wild=c=>["W","W4","W5","X","B"].includes(c);
const drawCard=c=>c==="W4"||c==="W5"||c?.slice(1)==="D"||c?.slice(1)==="T";
const canPlay=(c,g)=>wild(c)||c[0]===g.current_color||(!wild(g.discard_pile.at(-1))&&val(c)===val(g.discard_pile.at(-1)));
const counter=(c,g)=>g.pending_uncounterable?c==="W5":drawCard(c);
const makeRandom=seed=>()=>{
  let a=seed+=0x6d2b79f5;
  a=Math.imul(a^a>>>15,a|1);a^=a+Math.imul(a^a>>>7,a|61);
  return ((a^a>>>14)>>>0)/4294967296;
};
function deck(seed){
  const seeded=makeRandom(seed);
  // Build the actual deck, then shuffle it independently of crypto.randomInt.
  const d=[];
  for(const col of ["r","y","g","b"]){
    for(const v of ["0","1","2","3","4","5","6","7","8","9","S","R","D"])
      for(let i=0;i<3;i++)d.push(col+v);
    d.push(col+"T",col+"T");
  }
  for(let i=0;i<10;i++)d.push("W","W4");
  d.push("W5","W5","X","B");
  for(let k=d.length-1;k>0;k--){
    const j=Math.floor(seeded()*(k+1));[d[j],d[k]]=[d[k],d[j]];
  }
  return d;
}
function colorChoice(hand){
  const counts={r:0,y:0,g:0,b:0};
  for(const c of hand)if(c[0] in counts)counts[c[0]]++;
  return Object.keys(counts).sort((a,b)=>counts[b]-counts[a])[0];
}
function runMatch(seed){
  let random=makeRandom(seed*19997+17);
  Math.random=random;
  fakeNow=1_800_000_000_000+seed*100000000;
  const human=call("register_guest",{p_nickname:"Benchmark Humano"});
  const code=call("create_room",{p_token:human.token,p_name:"Torneio "+seed,p_max_players:3}).code;
  const hardId=call("add_bot",{p_token:human.token,p_code:code,p_difficulty:"hard"}).id;
  const otherId=call("add_bot",{p_token:human.token,p_code:code,p_difficulty:mode==="paired"?"hard":"easy"}).id;
  const room=store.roomsByCode.get(code);
  const hard=store.guestsById.get(hardId),other=store.guestsById.get(otherId);
  hard.ai_variant=mode==="baseline"?"legacy":"enhanced";
  other.ai_variant=mode==="paired"?"legacy":"easy";
  call("start_game",{p_token:human.token,p_code:code});
  const g=room.game;
  const d=deck(seed);
  g.turn_order=[hardId,otherId,human.guest_id];
  g.turn_idx=seed%3;
  g.direction=seed%2===0?1:-1;
  g.discard_pile=[...d.splice(0,1)];
  while(wild(g.discard_pile[0])||!/^[0-9]$/.test(val(g.discard_pile[0]))){
    g.discard_pile=[...d.splice(0,1)];
  }
  g.current_color=g.discard_pile[0][0];
  g.turn_start_color=g.current_color;
  g.bot_cut=null;g.bot_move=null;g.public_history={};g.nine=null;
  random=makeRandom(seed*19997+17);
  Math.random=random; // Discard random draws made while creating the room.
  for(const id of g.turn_order){
    const h=room.hands.get(id);h.cards=d.splice(0,8);h.uno_called=false;h.uno_since=null;h.bot_uno_plan=null;
  }
  g.draw_pile=[...d,...deck(seed+501),...deck(seed+502)];
  g.turn_started_at=fakeNow;g.effects=[];g.visual_until=0;g.last_action={type:"start"};
  const seen=[],counts={hard:0,other:0,human:0};
  let errors=0,rounds=0,turns=0,lastId=null;
  function safe(fn,params){
    try{return call(fn,params);}
    catch(e){
      if(["ANNOUNCEMENT_WAIT","NINE_ACTIVE","CATCH_NOT_ALLOWED","NOT_YOUR_TURN"].includes(e.code))return null;
      errors++;if(errors<=2)throw e;
      return null;
    }
  }
  for(let k=0;k<2500&&g.status==="playing";k++){
    fakeNow+=2200;
    store.guestsById.get(human.guest_id).last_seen=fakeNow;
    const id=g.turn_order[g.turn_idx];
    if(id!==lastId){turns++;lastId=id;}
    if(g.nine?.eligible.includes(human.guest_id)&&!g.nine.pressed.includes(human.guest_id)){
      safe("press_nine",{p_token:human.token,p_code:code});
    }
    if(id===human.guest_id&&!g.nine){
      const h=room.hands.get(id);
      if(h.cards.length===1&&!h.uno_called)safe("call_uno",{p_token:human.token,p_code:code});
      if(g.pending_draw&&!g.turn_cards.length){
        const choices=h.cards.filter(c=>counter(c,g));
        if(choices.length && random()<.75){
          const c=choices[Math.floor(random()*choices.length)];
          safe("play_card",{p_token:human.token,p_code:code,p_card:c,p_color:colorChoice(h.cards.filter(x=>x!==c)),p_target_id:c==="X"?hardId:undefined});
          if(g.status==="playing"&&g.turn_order[g.turn_idx]===id)safe("end_turn",{p_token:human.token,p_code:code});
        }else safe("accept_draw",{p_token:human.token,p_code:code});
      } else if(!g.turn_cards.length){
        let choices=h.cards.filter(c=>canPlay(c,g));
        if(!choices.length&&!g.has_drawn){
          safe("draw_card",{p_token:human.token,p_code:code});
          choices=h.cards.filter(c=>canPlay(c,g));
        }
        if(choices.length){
          const c=choices[Math.floor(random()*choices.length)];
          if(h.cards.length===2&&!h.uno_called)safe("call_uno",{p_token:human.token,p_code:code});
          const others=g.turn_order.filter(x=>x!==id);
          const target=c==="X"?others[Math.floor(random()*others.length)]:undefined;
          const res=safe("play_card",{p_token:human.token,p_code:code,p_card:c,p_color:colorChoice(h.cards.filter(x=>x!==c)),p_target_id:target});
          if(res&&g.status==="playing"&&g.turn_order[g.turn_idx]===id)safe("end_turn",{p_token:human.token,p_code:code});
        } else if(g.status==="playing"&&g.turn_order[g.turn_idx]===id)safe("end_turn",{p_token:human.token,p_code:code});
      }
    }
    proSweep();
    if(g.status!=="playing")break;
    if(k===2499)errors++;
  }
  const winner=g.winner_id;
  if(winner===hardId)counts.hard++;
  else if(winner===otherId)counts.other++;
  else if(winner===human.guest_id)counts.human++;
  const completed=g.status==="finished";
  const result={winner:winner===hardId?"hard":winner===otherId?"other":winner===human.guest_id?"human":"none",
    completed,errors,turns,first: g.placements?.[0]?.id||null};
  // Matches are independent. Delete the room; one hundred bots are not left in memory.
  store.rooms.delete(room.id);store.roomsByCode.delete(code);
  return result;
}
let hardWins=0,otherWins=0,humanWins=0,finished=0,errors=0,steps=0,failures=[];
try{
  for(let seed=1;seed<=games;seed++){
    const m=runMatch(seed);
    if(repeatCheck){
      const repeat=runMatch(seed);
      if(JSON.stringify(repeat)!==JSON.stringify(m))
        throw new Error("NONDETERMINISTIC_SEED "+seed+": "+JSON.stringify({m,repeat}));
    }
    if(m.completed)finished++;
    if(m.winner==="hard")hardWins++;
    if(m.winner==="other")otherWins++;
    if(m.winner==="human")humanWins++;
    errors+=m.errors;steps+=m.turns;
    if(!m.completed||m.errors)failures.push({seed,...m});
  }
  const data={mode,games,finished,hardWins,otherWins,humanWins,
    hardWinRate:+(hardWins/games*100).toFixed(1),otherWinRate:+(otherWins/games*100).toFixed(1),
    avgTurnChanges:+(steps/games).toFixed(1),errors,failures:failures.slice(0,4)};
  console.log("UNO_BENCHMARK "+JSON.stringify({...data,repeatCheck}));
  if(finished<Math.ceil(.97*games)||errors>0)process.exitCode=1;
}finally{Date.now=origNow;Math.random=origRandom;}
