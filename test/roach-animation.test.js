import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {createHash} from "node:crypto";
import {execFileSync} from "node:child_process";
import {build} from "esbuild";

test("both user-supplied Barata photos are assembled losslessly from optimized assets",()=>{
  execFileSync(process.execPath,["scripts/prepare-roach-images.mjs"],{stdio:"pipe"});
  for(const asset of [
    {file:"public/roach-top.webp",bytes:5780,sha:"6b9f0dcb9bc485228b09e983cd3a7e351bad2d029cf637bc297449d1e650ebbf"},
    {file:"public/roach-front.webp",bytes:10360,sha:"5c3c486ac19e9dea51e53b79001be6e661534f878ec926d0ced5125de04446d0"}
  ]){
    const data=fs.readFileSync(asset.file);
    assert.equal(data.length,asset.bytes);
    assert.equal(createHash("sha256").update(data).digest("hex"),asset.sha);
    assert.equal(data.toString("ascii",0,4),"RIFF");
    assert.equal(data.toString("ascii",8,12),"WEBP");
  }
});
test("Barata animation compiles with source-image flight and target-only jumpscare",async()=>{
  const result=await build({
    entryPoints:["src/components/uno/RoachTransferAnimation.tsx"],
    bundle:true,platform:"browser",format:"esm",write:false,logLevel:"silent",
    external:["react","@/lib/uno/sound"],
  });
  const script=result.outputFiles[0].text;
  assert.ok(script.includes("/roach-top.webp"));
  assert.ok(script.includes("/roach-front.webp"));
  assert.ok(script.includes("roach_scare"));
  assert.ok(script.includes("event.target === me"));
  assert.ok(script.includes("data-discard-pile"));
  assert.ok(script.includes("data-my-hand"));
  assert.ok(script.includes("data-player-seat"));
  assert.ok(script.includes("ROACH_ARRIVAL_MS"));
});
test("manual keeps the requested short rule, shared by the full guide and hand guide",()=>{
  const body=fs.readFileSync("src/components/uno/HowToPlayDialog.tsx","utf8");
  assert.ok(body.includes("Quando jogada cria uma cópia que invade um deck inimigo, sem repetir os jogadores."));
  assert.ok(!body.includes("Há uma Barata original por cor."));
  assert.ok(body.includes("const MINI_ORDER=")&&body.includes('"A"'));
});

test("Barata moves slower, carries no player-name label and remains visible 4s after the scare",()=>{
  const component=fs.readFileSync("src/components/uno/RoachTransferAnimation.tsx","utf8");
  const styles=fs.readFileSync("src/styles.css","utf8");
  assert.match(component,/ROACH_LAUNCH_MS=350/);
  assert.match(component,/ROACH_TRAVEL_MS=2400/);
  assert.match(component,/ROACH_SCARE_MS=700/);
  assert.match(component,/ROACH_HOLD_MS=4000/);
  assert.match(component,/ROACH_FADE_MS=300/);
  assert.match(component,/ROACH_TOTAL_MS=ROACH_ARRIVAL_MS\+ROACH_SCARE_MS\+ROACH_HOLD_MS\+ROACH_FADE_MS/);
  assert.ok(component.includes('"--roach-travel-duration":ROACH_ARRIVAL_MS+"ms"'));
  assert.ok(component.includes('"--roach-scare-duration":(ROACH_SCARE_MS+ROACH_HOLD_MS+ROACH_FADE_MS)+"ms"'));
  assert.ok(!component.includes("uno-roach-destination"),"no target name under the traveling insect");
  assert.ok(!styles.includes(".uno-roach-destination"),"obsolete label style removed");
  assert.match(styles,/14%,94% \{opacity:1;transform:translate3d\(0,0,0\) scale\(1\)/);
  assert.ok(styles.includes("animation:uno-roach-jumpscare var(--roach-scare-duration,5000ms)"));
  assert.ok(styles.includes("animation:uno-roach-travel var(--roach-travel-duration,2750ms)"));
});
