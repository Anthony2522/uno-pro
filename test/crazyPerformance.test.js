import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import ts from "typescript";

// Exercise the exact client-side TypeScript logic without a DOM or GPU.
const source=await readFile(new URL("../src/components/crazy/performance.ts",import.meta.url),"utf8");
const js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
const rules=await import("data:text/javascript;base64,"+Buffer.from(js).toString("base64"));

test("Crazy Battle: clamp high resolution renderer to a sane GPU pixel budget",()=>{
 const {crazyPixelRatio}=rules;
 assert.ok(crazyPixelRatio(3840,2160,2)<.7);
 assert.equal(crazyPixelRatio(390,844,3),1.35);
 assert.equal(crazyPixelRatio(1280,720,1),1);
 assert.ok(crazyPixelRatio(8000,4000,3)>=.5);
});
test("Crazy Battle: high-refresh monitors do not run the entire render loop at 240Hz",()=>{
 const {crazyShouldRender}=rules;
 assert.equal(crazyShouldRender(4,0),true);
 assert.equal(crazyShouldRender(11,4),false);
 assert.equal(crazyShouldRender(19,4),true);
});
test("Crazy Battle: always release the cursor after defeat or round completion",()=>{
 const {crazyMustUnlockCursor}=rules;
 assert.equal(crazyMustUnlockCursor("playing",100),false);
 assert.equal(crazyMustUnlockCursor("playing",1),false);
 assert.equal(crazyMustUnlockCursor("playing",0),true);
 assert.equal(crazyMustUnlockCursor("finished",100),true);
 assert.equal(crazyMustUnlockCursor("lobby",100),true);
});
