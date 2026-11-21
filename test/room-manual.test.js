import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import {DEFAULT_CARDS_ENABLED} from "../server/game.js";

const read=file=>readFileSync(new URL("../"+file,import.meta.url),"utf8");
// Compile the real TSX module, stubbing view-only imports. This runs the same
// filtering function that the in-game manual calls, not a duplicate of it.
const compileManual=()=>{
  const source=read("src/components/uno/HowToPlayDialog.tsx");
  const js=ts.transpileModule(source,{compilerOptions:{
    module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX
  }}).outputText;
  const exports={};
  vm.runInNewContext(js,{exports,require(id){
    if(id==="lucide-react")return new Proxy({}, {get:(_,key)=>String(key)});
    if(id==="@/lib/uno/cardSettings")return {DEFAULT_CARD_SETTINGS:DEFAULT_CARDS_ENABLED};
    return {};
  }},{filename:"HowToPlayDialog.tsx"});
  return exports;
};
const {RULES,rulesForRoom}=compileManual();
const rules={repeat:true,sequence:true,nine:true,cut:true,stack:true};
const keys=entries=>Array.from(entries,r=>r.key);
const find=(entries,key)=>entries.find(e=>e.key===key);

test("manual inicial conserva a lista integral de regras e cartas",()=>{
  const original=keys(RULES);
  assert.ok(original.includes("nine")&&original.includes("cut")&&original.includes("sequence"));
  assert.ok(original.includes("WD")&&original.includes("A")&&original.includes("M"));
  const header=read("src/components/uno/AppHeader.tsx");
  const home=read("src/routes/index.tsx");
  assert.match(header,/<HowToPlayDialog roomRules=\{manualRules\} roomCards=\{manualCards\}/);
  assert.match(home,/<AppHeader \/>/);
});

test("manual da sala mostra apenas regras básicas e cartas permanentes quando opcionais desligadas",()=>{
  const none=Object.fromEntries(Object.keys(DEFAULT_CARDS_ENABLED).map(key=>[key,false]));
  const entries=rulesForRoom({repeat:false,sequence:false,nine:false,cut:false,stack:false},none);
  assert.deepEqual(keys(entries),["win","uno","draws","R","S","D","W","W4"]);
  assert.equal(find(entries,"draws").pt,"Compras");
  assert.doesNotMatch(find(entries,"draws").descPt,/Coringa Dobro|\+5|rebatidas por cartas permitidas/);
  assert.doesNotMatch(find(entries,"W4").descPt,/rebatido com outra compra/);
  assert.ok(!keys(entries).includes("WD"));
});

test("manual da sala filtra cada carta e regra usando os controles da partida",()=>{
  const enabled={...DEFAULT_CARDS_ENABLED,C:true,E:true,A:false,M:false,WD:true,W5:false,N:false};
  const entries=rulesForRoom({...rules,nine:false,repeat:false},enabled);
  for(const key of ["cut","sequence","C","E","WD","H","L","P","B","X"])
    assert.ok(keys(entries).includes(key),key);
  for(const key of ["nine","repeat","A","M","W5","N"])
    assert.ok(!keys(entries).includes(key),key);
  assert.doesNotMatch(find(entries,"draws").descPt,/\+5/);
  assert.match(find(entries,"draws").descPt,/Coringa Dobro/);
  assert.doesNotMatch(find(entries,"L").descPt,/Negação/);
  assert.doesNotMatch(find(entries,"P").descPt,/Negação/);
});

test("manual adapta as explicações ao empilhamento, Dobro e regras desabilitadas",()=>{
  const noDobro=rulesForRoom(rules,{...DEFAULT_CARDS_ENABLED,WD:false});
  assert.match(find(noDobro,"W5").descPt,/outro \+5/);
  assert.doesNotMatch(find(noDobro,"W5").descPt,/Coringa Dobro/);
  const noStack=rulesForRoom({...rules,stack:false},DEFAULT_CARDS_ENABLED);
  assert.equal(find(noStack,"draws").pt,"Compras");
  assert.match(find(noStack,"WD").descPt,/apenas como coringa comum/);
  assert.match(find(noStack,"W5").descPt,/não é possível rebater/);
  assert.match(find(noStack,"D").descPt,/não é possível rebater/);
  assert.match(find(noStack,"T").descPt,/não é possível rebater/);
  const noDefense=rulesForRoom(rules,{...DEFAULT_CARDS_ENABLED,B:false,X:false});
  assert.doesNotMatch(find(noDefense,"H").descPt,/Bomba|Detetive/);
});

test("as regras da sala são repassadas ao manual pela página da partida",()=>{
  const room=read("src/routes/sala.$code.tsx");
  const manual=read("src/components/uno/HowToPlayDialog.tsx");
  assert.match(room,/<AppHeader manualRules=\{state\.room\.rules\} manualCards=\{state\.room\.cards_enabled\}>/);
  assert.match(manual,/roomRules&&roomCards\?rulesForRoom\(roomRules,roomCards\):RULES/);
  assert.match(manual,/GROUPS\.filter\(group=>entries\.some\(r=>r\.group===group\.id\)\)/);
});
