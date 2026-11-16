// Strategic policy for the HARD bot only. Pure and intentionally isolated.
// Receives only its own cards, the PUBLIC opponents' card counts, the
// published turn order, the discard, optional rules and public observations.
// Neither this module nor its callers pass opponents' hidden card identities.
const COLORS=["b","y","g","r"];
const WILDS=new Set(["W","W4","W5","X","B","N","P","M","Q"]);
// Q is physically a wild even before another one is played. Its *effect*
// changes with the latest real wild, without revealing an opponent's hand.
const resolved=(card,mirrorAs="W")=>card==="Q"?(mirrorAs||"W"):card;
const value=(c,mirrorAs="W")=>WILDS.has(c)?resolved(c,mirrorAs):c.slice(1);
const number=(c,mirrorAs="W")=>/^[0-9]$/.test(value(c,mirrorAs));
const wild=c=>WILDS.has(c);
const drawValue=(c,mirrorAs="W")=>{const e=resolved(c,mirrorAs);return e==="W5"?5:e==="W4"?4:e?.slice(1)==="D"||e?.slice(1)==="T"?2:0;};
const attack=(c,mirrorAs="W")=>drawValue(c,mirrorAs)>0;
const canCounter=(c,uncounterable,mirrorAs="W")=>uncounterable?resolved(c,mirrorAs)==="W5":attack(c,mirrorAs);
const advance=(idx,dir,steps,n)=>(idx+dir*steps%n+n*100)%n;
const playable=(c,top,color)=>wild(c)||c[0]===color||(!wild(top)&&value(c)===value(top));
const sum=(a)=>a.reduce((x,y)=>x+y,0);

export function inferColorGaps(actions=[]) {
  // Scores are uncertain evidence, not a peek at the rival's cards.
  const scores={r:0,y:0,g:0,b:0};
  for(const e of actions.slice(-5)){
    for(const c of COLORS)scores[c]*=.86; // more recent evidence counts more
    if(e.kind==="no_play_draw" && COLORS.includes(e.color)){
      scores[e.color]+=1.1;
    }else if(e.kind==="forced_draw" || e.kind==="voluntary_draw"){
      for(const c of COLORS)scores[c]*=e.kind==="forced_draw"?.78:.9;
    }else if(e.kind==="play"){
      for(const c of e.cards||[]){
        if(COLORS.includes(c[0]))scores[c[0]]-=.95;
      }
      if(COLORS.includes(e.chosen_color)&&e.cards?.some(wild))
        scores[e.chosen_color]-=.35;
    }
  }
  for(const c of COLORS)scores[c]=Math.max(0,Math.min(2.8,scores[c]));
  return scores;
}

function handQuality(cards,rules,mirrorAs="W") {
  const colored=cards.filter(c=>COLORS.includes(c[0]));
  const colorCounts=Object.fromEntries(COLORS.map(c=>[c,0]));
  for(const c of colored)colorCounts[c[0]]++;
  const variety=COLORS.filter(c=>colorCounts[c]>0).length;
  const nonzero=COLORS.map(c=>colorCounts[c]).filter(Boolean);
  const spread=nonzero.length?1-(Math.max(...nonzero)-Math.min(...nonzero))/Math.max(1,colored.length):0;
  const coverage=Math.min(1,(variety+cards.filter(wild).length*1.1)/4);
  let pairs=0,adj=0;
  if(rules.repeat){
    const grouped=new Map();
    for(const c of colored) {
      const v=value(c),arr=grouped.get(v)||new Set();arr.add(c[0]);grouped.set(v,arr);
    }
    for(const set of grouped.values())pairs+=Math.max(0,set.size-1);
  }
  if(rules.sequence)for(const color of COLORS){
    const nums=new Set(colored.filter(c=>c[0]===color&&number(c)).map(c=>Number(value(c))));
    for(const x of nums)if(nums.has(x+1))adj++;
  }
  const wilds=cards.filter(wild).length, attacks=cards.filter(c=>attack(c,mirrorAs)).length;
  const remaining=cards.length;
  const specialWeight=remaining<=3?.25:remaining<=6?1:remaining<=10?.83:.45;
  const defense=(attacks>0?3.6:0)+(attacks>1?1.3:0);
  const emergency=(wilds>0?4.2:0)+(wilds>1?1.0:0);
  // Keep high-quality routes across colors and connected future combos.
  return 3.1*variety+1.0*spread+6.0*coverage+
    (rules.repeat?pairs*2.7:0)+(rules.sequence?adj*1.35:0)+
    specialWeight*(defense+emergency);
}

function threatLevel(cards) {
  if(cards<=0)return 0;
  return cards===1?5:cards===2?3.2:cards===3?1.9:0;
}

function nextSeat(order,selfIndex,dir,skips,reverseCount){
  const n=order.length;
  const direction=n===2?dir:dir*(reverseCount%2?-1:1);
  const steps=1+(n===2&&skips>0?1:skips);
  return {direction,nextIndex:advance(selfIndex,direction,steps,n),
    skipped:Array.from({length:skips},(_,i)=>order[advance(selfIndex,direction,n===2?1:i+1,n)])};
}

function remainingCards(hand,plan) {
  const remaining=[...hand];
  for(const c of plan)remaining.splice(remaining.indexOf(c),1);
  return remaining;
}

function threatened(color,nextId,counts,history) {
  const danger=threatLevel(counts[nextId]??100);
  if(!danger)return 0;
  const gaps=inferColorGaps(history[nextId]||[]);
  return (gaps[color]||0)*danger*1.15;
}

function evaluate(plan,color,context,remaining) {
  const {hand,turnOrder:order,selfId,turnIndex,direction,counts,rules,
    history,pendingDraw=0,mirrorAs="W",profile={}}=context;
  const tune={
    negationKeep:profile?.negationKeep??16.5,
    drawKeep:profile?.drawKeep??1.0,
    wildKeep:profile?.wildKeep??1.0,
    handShape:profile?.handShape??1.0,
    aggression:profile?.aggression??1.0,
    urgency:profile?.urgency??1.0,
    perCard:profile?.perCard??1.0,
    colorFit:profile?.colorFit??1.0,
    vortexValue:profile?.vortexValue??1.0,
    shieldValue:profile?.shieldValue??1.0,
    swordValue:profile?.swordValue??1.0,
    lockValue:profile?.lockValue??1.0,
    restrictionsValue:profile?.restrictionsValue??1.0,
  };
  if(!plan.length) return -Infinity;
  const n=order.length;
  const len=hand.length;
  if(plan.length===len)return 1_000_000; // exact legal immediate victory
  const remainder=remaining.length;
  let skips=0,reverses=0,owed=0,hasBomb=false;
  for(const c of plan){
    if(value(c,mirrorAs)==="S")skips++;
    if(value(c,mirrorAs)==="R"){reverses++;if(n===2)skips++;}
    if(value(c,mirrorAs)==="T"&&n>2)reverses++;
    owed+=drawValue(c,mirrorAs);
    if(resolved(c,mirrorAs)==="B")hasBomb=true;
  }
  const {nextIndex,skipped}=nextSeat(order,turnIndex,direction,skips,reverses);
  const nextId=order[nextIndex];
  const nextCount=counts[nextId]??12;
  const danger=threatLevel(nextCount);
  const otherThreat=order.filter(id=>id!==selfId).map(id=>({
    id,level:threatLevel(counts[id]??12),cards:counts[id]??12,
    distance:advance(nextIndex,direction,order.indexOf(id)-nextIndex,n)
  }));
  const threatTotal=otherThreat.reduce((v,x)=>v+x.level,0);
  const urgency=threatTotal>0?1:0;
  // Small hands must finish; intermediate hands protect valuable resources.
  const basePerCard=(len>=7?7.5:len>=4?6.3:11.0)*tune.perCard;
  // Vortex automatically plays ALL remaining cards of its color, not just V itself.
  // Previous hard AI evaluated it as only a one-card discard, often leaving a
  // powerful multi-discard on the table. Its follow-up is server-controlled.
  const vortexColors=new Set(plan.filter(c=>value(c,mirrorAs)==="V").map(c=>c[0]));
  const pulled=remaining.filter(c=>vortexColors.has(c[0]));
  const afterVortex=remaining.filter(c=>!vortexColors.has(c[0]));
  if(vortexColors.size&&afterVortex.length===0)return 999_000;
  let score=plan.length*basePerCard+
    pulled.length*basePerCard*tune.vortexValue+
    handQuality(afterVortex,rules,mirrorAs)*.91*tune.handShape;
  const released=plan.filter(c=>attack(c,mirrorAs));
  const resources=plan.filter(c=>attack(c,mirrorAs)||wild(c));
  const protectionScale=len<=3?.10:len<=6?1.20:len<=10?1:.72;
  // All effects below are computed only from our hand and public rival counts.
  const specialPlayed=plan.map(c=>value(c,mirrorAs));
  if(specialPlayed.includes("H")){
    score+=tune.shieldValue*(context.shieldArmed?-3:5.5+Math.min(2,threatTotal*.20));
  }
  if(specialPlayed.includes("E")){
    const futureAttacks=afterVortex.some(c=>attack(c,mirrorAs));
    score+=tune.swordValue*(context.swordArmed?-2:futureAttacks?5.2:2.0);
  }
  if(specialPlayed.includes("L")){
    score+=tune.lockValue*(2.4+Math.max(0,Math.min(8,danger*1.25)));
  }
  if(specialPlayed.includes("P")){
    score+=tune.restrictionsValue*(1.4+danger*1.05);
  }
  if(specialPlayed.includes("M")){
    score+=tune.restrictionsValue*(.8+Math.min(3,threatTotal*.55));
  }
  // Beer is compulsory random play for rivals, and may help a near-winner.
  if(specialPlayed.includes("C") && danger)score-=danger*.9;
  if(specialPlayed.includes("9")&&n>=3&&value(plan.at(-1),mirrorAs)==="9")
    score+=Math.min(4,2+threatTotal*.3);
  for(const c of resources){
    // Negação is a scarce universal defense. Save it, except when it is
    // itself the winning move or the sole legal way out of an immediate debt.
    const effect=resolved(c,mirrorAs);
    if(effect==="N"){
      const phase=len<=2?.45:len<=4?.65:len<=7?1:1.25;
      score-=tune.negationKeep*phase*(c==="Q"?.73:1);
    }
    else if(effect==="W")score-=4*protectionScale*tune.wildKeep;
    else if(effect==="W4")score-=7.8*protectionScale*tune.drawKeep;
    else if(effect==="W5")score-=10*protectionScale*tune.drawKeep;
    else if(effect==="X")score-=2.6*protectionScale*tune.wildKeep;
    else if(effect==="B"||effect==="M"||effect==="P")score-=3.3*protectionScale*tune.wildKeep;
    else if(drawValue(c,mirrorAs))score-=(2.8+drawValue(c,mirrorAs)*.45)*protectionScale*tune.drawKeep;
  }
  const nextDangerCount=Math.max(0,Math.min(1,(nextCount-1)/9));
  const retaliationRisk=nextCount>7?.5:nextCount>4?.29:.12;
  if(owed){
    const effect=threatLevel(nextCount);
    score+=Math.min(owed,12)*(effect?2.8+effect*.95:.24)*tune.aggression;
    if(effect)score+=effect*4;
    else score-=Math.min(6,owed)*retaliationRisk;
    if(pendingDraw)score+=Math.min(12,pendingDraw)*2.5;
    if(nextCount>8 && !threatTotal && released.length && remaining.filter(c=>attack(c,mirrorAs)).length===0){
      score-=Math.min(15,owed+pendingDraw)*1.4; // counter-war can boomerang
    }
  }else if(pendingDraw)score-=10000; // not legal in engine; defensive guard
  if(hasBomb){
    const victims=order.filter(id=>id!==selfId);
    score+=victims.reduce((v,id)=>v+threatLevel(counts[id]??12)*2.7,0);
  }
  for(const id of skipped){
    const level=threatLevel(counts[id]??12);
    score+=level?level*4.5:1.1;
  }
  if(danger){
    // If next player is critical, a draw attack or a skip is worth sacrificing resources.
    if(owed)score+=danger*3.8*tune.urgency;
    else score-=danger*5.4;
  }
  if(urgency && !owed && !skips && !hasBomb && nextCount>3){
    // Reversing away from a threatened seat can be better than spending an attack
    // on the wrong opponent; it is NOT always good merely because it reverses.
    const closest=otherThreat.filter(v=>v.level>0)
      .sort((a,b)=>a.cards-b.cards)[0];
    const badIndex=order.indexOf(closest?.id);
    if(badIndex>=0){
      const dist=advance(nextIndex,direction,badIndex-nextIndex,n);
      score-=Math.max(0,2.5-dist)*closest.level;
    }
  }
  // Choose a color matching our remaining hand unless public evidence of
  // a rival's difficulty with that color is reasonably strong.
  const ownMatching=remaining.filter(c=>c[0]===color).length;
  score+=ownMatching*1.65*tune.colorFit;
  if(ownMatching===0 && remaining.length && !remaining.some(wild))score-=3.2;
  if(urgency)score+=threatened(color,nextId,counts,history);
  // Better future draw odds from multiple colors and kept flexible cards.
  const unique=new Set(remaining.filter(c=>COLORS.includes(c[0])).map(c=>c[0])).size;
  score+=Math.min(4,unique+remaining.filter(wild).length)*.8;
  // If still holding 1 card, prefer leaving a useful card (any wild or
  // matching selected color), rather than holding only a dead color.
  if(remainder===1&&!wild(remaining[0])&&remaining[0][0]!==color)score-=2;
  return score;
}

function enumerate(context) {
  const {hand,rules,topCard,currentColor,pendingDraw=0,
    pendingUncounterable=false,mirrorAs="W"}=context;
  const counts=new Map();
  for(const c of hand)counts.set(c,(counts.get(c)||0)+1);
  const keys=[...counts.keys()];
  const plans=[];
  const maxDepth=Math.min(hand.length,12),maxNodes=7000;
  let nodes=0;
  function walk(plan,mode,step){
    if(nodes++>=maxNodes)return;
    if(plan.length){
      plans.push([...plan]);
      // A Vortex immediately starts a server-controlled pull. There can be no
      // additional manual cards in that plan, even another differently colored Vortex.
      if(plan.some(card=>value(card,mirrorAs)==="V")||plan.length>=maxDepth)return;
    }
    for(const c of keys){
      if(!counts.get(c))continue;
      if(!plan.length){
        if(pendingDraw?!canCounter(c,pendingUncounterable,mirrorAs):!playable(c,topCard,currentColor))continue;
      }else{
        const first=plan[0],prev=plan.at(-1),same=value(c,mirrorAs)===value(first,mirrorAs);
        const delta=Number(value(c,mirrorAs))-Number(value(prev,mirrorAs));
        const isRun=number(c,mirrorAs)&&number(prev,mirrorAs)&&c[0]===prev[0]&&
          Math.abs(delta)===1 && (!step||Math.sign(delta)===step);
        if(mode==="repeat" && !same)continue;
        if(mode==="sequence" && !isRun)continue;
        if(!mode && !(same&&rules.repeat)&&!(isRun&&rules.sequence))continue;
      }
      let nextMode=mode,nextStep=step;
      if(plan.length===1){
        if(value(plan[0],mirrorAs)===value(c,mirrorAs)){nextMode="repeat";}
        else {nextMode="sequence";nextStep=Math.sign(Number(value(c,mirrorAs))-Number(value(plan[0],mirrorAs)));}
      }
      counts.set(c,counts.get(c)-1);
      plan.push(c);walk(plan,nextMode,nextStep);plan.pop();
      counts.set(c,counts.get(c)+1);
      if(nodes>=maxNodes)return;
    }
  }
  walk([],null,0);
  return plans;
}

export function chooseHardPlan(context){
  const {hand,turnOrder,selfId,counts={},history={},random=Math.random}=context;
  const mine=[...hand];
  if(!mine.length)return {kind:"pass",cards:[],score:0};
  const others=turnOrder.filter(id=>id!==selfId);
  const target=others.slice().sort((a,b)=>(counts[a]??50)-(counts[b]??50))[0]??null;
  const choices=enumerate(context);
  const scored=[];
  for(const cards of choices){
    const remainder=remainingCards(mine,cards);
    const endsWild=wild(cards.at(-1));
    const colors=endsWild?COLORS:[cards.at(-1)[0]];
    for(const color of colors){
      scored.push({kind:"play",cards,color,target,score:evaluate(cards,color,context,remainder)});
    }
  }
  if(context.pendingDraw){
    // Consider accepting an attack when returning it is especially likely
    // to bounce back larger and none of our rivals are close to winning.
    const many=others.filter(id=>(counts[id]??0)>8).length;
    const threat=others.some(id=>(counts[id]??100)<=3);
    const hugeHand=mine.length>=7;
    const soleDefense=mine.filter(c=>attack(c,context.mirrorAs)).length===1;
    const nextId=turnOrder[(context.turnIndex+context.direction+turnOrder.length)%turnOrder.length];
    const bigHandNext=(counts[nextId]??0)>=9;
    const likelyCounterWar=bigHandNext&&!threat&&hugeHand&&soleDefense;
    const acceptance=handQuality(mine,context.rules,context.mirrorAs)*.91*(context.profile?.handShape??1)-context.pendingDraw*3.1+
      (likelyCounterWar?23:0);
    scored.push({kind:"accept",cards:[],color:null,target:null,score:acceptance});
  }
  if(!scored.length)return {kind:"draw",cards:[],color:null,target:null,score:-500};
  scored.sort((a,b)=>b.score-a.score||b.cards.length-a.cards.length);
  // Select among near-equal options without making strong decisions random.
  const top=scored[0].score;
  const shortlist=scored.filter(x=>x.score>=top-1.15).slice(0,7);
  const chosen=shortlist.length>1?shortlist[Math.floor(random()*shortlist.length)]:scored[0];
  return {...chosen,explored:choices.length};
}
