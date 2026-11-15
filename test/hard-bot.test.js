import test from "node:test";
import assert from "node:assert/strict";
import {chooseHardPlan,inferColorGaps} from "../server/hardBotStrategy.js";

function ctx(cards,extras={}){
  return {hand:cards,topCard:"b9",currentColor:"b",selfId:"bot",
    turnOrder:["bot","rival","neutral"],turnIndex:0,direction:1,
    counts:{rival:7,neutral:8},history:{},
    rules:{repeat:true,sequence:true,nine:true,cut:true,stack:true},
    pendingDraw:0,pendingUncounterable:false,random:()=>0,...extras};
}
test("difficult bot preserves a cross-color pair rather than splitting it",()=>{
  const move=chooseHardPlan(ctx(["b3","r3","b8"]));
  assert.deepEqual(move.cards,["b8"]);
});
test("saves a +4 when a normal card offers the same immediate progress",()=>{
  const move=chooseHardPlan(ctx(["W4","b6","r1","g5","y2","b4"]));
  assert.notEqual(move.cards[0],"W4");
});
test("attacks a critical next player with one card, even at the cost of a +2",()=>{
  const move=chooseHardPlan(ctx(["bD","b5","r1","g4","y6"],{counts:{rival:1,neutral:8}}));
  assert.equal(move.cards[0],"bD");
});
test("does not spend +5 on a non-threatening player merely because another player is close",()=>{
  const move=chooseHardPlan(ctx(["W5","bR","r4","g7","y1"],{
    turnOrder:["bot","unimportant","rival","neutral"],
    counts:{unimportant:9,rival:1,neutral:8}
  }));
  assert.notEqual(move.cards[0],"W5");
});
test("inference treats forced drawing as no evidence of a missing color",()=>{
  const gaps=inferColorGaps([{kind:"forced_draw",color:"b",n:4}]);
  assert.equal(gaps.b,0);
  assert.equal(gaps.y,0);
});
test("recent repeated automatic no-play draws increase uncertain missing-color evidence",()=>{
  const gaps=inferColorGaps([{kind:"no_play_draw",color:"b"},
    {kind:"no_play_draw",color:"b"},{kind:"forced_draw",color:"r"}]);
  assert.ok(gaps.b>.8);
  assert.equal(gaps.r,0);
  assert.ok(gaps.b<2.8);
});
test("revealing a played color reduces its absence suspicion",()=>{
  const gaps=inferColorGaps([{kind:"no_play_draw",color:"b"},
    {kind:"play",cards:["b7"],chosen_color:"b"}]);
  assert.ok(gaps.b<.2);
});
test("selects a wild color that works with the remaining hand",()=>{
  const move=chooseHardPlan(ctx(["W","b4","b5","r3","g7"],{
    currentColor:"y",topCard:"y9"
  }));
  assert.equal(move.cards[0],"W");
  assert.equal(move.color,"b");
});
test("color memory can change the choice against an imminent winner",()=>{
  const input=ctx(["W","r1","r2","b3"],{
    topCard:"g9",currentColor:"g",counts:{rival:1,neutral:8},
    history:{rival:[{kind:"no_play_draw",color:"b"},{kind:"no_play_draw",color:"b"}]}
  });
  const move=chooseHardPlan(input);
  assert.equal(move.color,"b");
});
test("finds immediate victory using a legal same-color number sequence",()=>{
  const move=chooseHardPlan(ctx(["b3","b4","b5"],{topCard:"b2"}));
  assert.deepEqual(move.cards,["b3","b4","b5"]);
});
test("finds immediate victory using a legal repeated-number combination",()=>{
  const move=chooseHardPlan(ctx(["b3","r3","y3"],{topCard:"b7"}));
  assert.equal(move.cards.length,3);
});
test("never invents combos when repeat and sequence are disabled",()=>{
  const move=chooseHardPlan(ctx(["b3","r3","b4","b5"],{
    topCard:"b9",rules:{repeat:false,sequence:false,cut:false,nine:false,stack:false}
  }));
  assert.equal(move.cards.length,1);
});
test("only +5 answers an uncounterable +5 debt",()=>{
  const move=chooseHardPlan(ctx(["bD","W4","rT","W5","b3"],{
    pendingDraw:5,pendingUncounterable:true
  }));
  assert.deepEqual(move.cards,["W5"]);
});
test("a one-card hand uses the wildcard to win without hoarding it",()=>{
  const move=chooseHardPlan(ctx(["W4"]));
  assert.equal(move.cards[0],"W4");
});
test("no hidden opponent hand access: private-hand fields do not alter a decision",()=>{
  const args=ctx(["b3","r3","b8","W"],{counts:{rival:2,neutral:8}});
  const a=chooseHardPlan({...args,privateHands:{rival:["r0","W5"]}});
  const b=chooseHardPlan({...args,privateHands:{rival:["b9","b9"]}});
  assert.deepEqual(a.cards,b.cards);
  assert.equal(a.color,b.color);
});
test("search is bounded on long hands",()=>{
  const cards=[];
  for(const color of ["r","y","g","b"])
    for(const n of ["0","1","2","3","4","5","6","7","8","9"])cards.push(color+n);
  const started=performance.now();
  const res=chooseHardPlan(ctx(cards));
  assert.ok(res.explored<=7000);
  assert.ok(performance.now()-started<500);
});


test("can accept a small debt instead of risking its sole counter in a large counter-war",()=>{
  const cards=["bD","b2","r1","g2","y5","g5","r8","y8","b7"];
  const move=chooseHardPlan(ctx(cards,{
    pendingDraw:2,counts:{rival:13,neutral:12}
  }));
  assert.equal(move.kind,"accept");
});
test("an imminent rival overrides counter-war caution",()=>{
  const cards=["bD","b2","r1","g2","y5","g5","r8","y8","b7"];
  const move=chooseHardPlan(ctx(cards,{
    pendingDraw:2,counts:{rival:1,neutral:12}
  }));
  assert.equal(move.kind,"play");
  assert.ok(move.cards[0].endsWith("D"));
});
test("a normal voluntary purchase alone never creates color-absence certainty",()=>{
  const gaps=inferColorGaps([{kind:"voluntary_draw",color:"y"},
    {kind:"forced_draw",color:"y"}]);
  assert.deepEqual(gaps,{r:0,y:0,g:0,b:0});
});
