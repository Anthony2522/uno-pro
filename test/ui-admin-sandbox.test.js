import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=path=>readFileSync(path,"utf8");

test("configurações avançadas começam pela quantidade de cartas iniciais",()=>{
  const source=read("src/components/uno/AdvancedRoomSettingsFields.tsx");
  const start=source.indexOf('return <div className="space-y-3">');
  const handSize=source.indexOf("Cartas iniciais por jogador",start);
  const rules=source.indexOf("Regras da partida",start);
  assert.ok(start>=0 && handSize>start && handSize<rules);
});
test("manual e opções avançadas renderizam fotos vetoriais estáveis sem CSS cqw ou imagens externas",()=>{
  const adv=read("src/components/uno/AdvancedRoomSettingsFields.tsx");
  const manual=read("src/components/uno/HowToPlayDialog.tsx");
  const preview=read("src/components/uno/StableCardPreview.tsx");
  assert.ok(adv.includes("<StableCardPreview "));
  assert.ok(manual.includes("<StableCardPreview "));
  assert.ok(!adv.includes("<UnoCard "));
  assert.ok(!manual.includes("<UnoCard "));
  assert.ok(!preview.includes("cqw"));
  assert.ok(!preview.includes("<img"));
  assert.ok(preview.includes("width,height")&&preview.includes("background"));
  for(const icon of ["Shield","Sword","Ban","Beer","LockKeyhole","CockroachIcon","Bomb","Scan"]){
    assert.ok(preview.includes(icon),icon);
  }
});
test("apontamento ao manual aparece uma vez, fica 8s e fecha ao tocar na tela",()=>{
  const hint=read("src/components/uno/FirstVisitManualHint.tsx");
  const header=read("src/components/uno/AppHeader.tsx");
  assert.ok(hint.includes("unopro.manual.introduction.v1"));
  assert.ok(hint.includes("setTimeout(hide,8000)"));
  assert.ok(hint.includes('document.addEventListener("pointerdown",clicked'));
  assert.ok(hint.includes("Caso não goste de alguma"));
  assert.ok(header.includes("data-manual-trigger"));
  assert.ok(header.includes("<FirstVisitManualHint />"));
});
test("Tony pede senha sem expor senha no front ou atribuir privilégio apenas pelo apelido",()=>{
  const form=read("src/components/uno/NicknameForm.tsx");
  const provider=read("src/lib/uno/guest.tsx");
  const server=read("server/pro.js");
  assert.ok(form.includes('clean==="Tony"'));
  assert.ok(form.includes('type="password"'));
  assert.ok(provider.includes("await api.devAuth(g.token,adminPassword"));
  assert.ok(server.includes("process.env.UNO_ADMIN_PASSWORD"));
  assert.ok(server.includes("crypto.timingSafeEqual"));
  assert.ok(server.includes('me.nickname.trim()!=="Tony"'));
  assert.ok(server.includes('if(fn==="admin_delete_room"||fn==="dev_delete_public_room")'));
  assert.ok(!server.includes("DEV_ACCESS_KEY"));
});
test("sandbox oferece trocas de mão, carta numérica única, especiais coloridas e coringas separados",()=>{
  const runtime=read("src/lib/uno/offlineRuntime.ts");
  const game=read("src/components/uno/GameTable.tsx");
  const selector=read("src/components/uno/SandboxCardPicker.tsx");
  assert.ok(runtime.includes('p_is_public:false'));
  assert.ok(runtime.includes('room.code="SBX"'));
  assert.ok(runtime.includes('fn==="sandbox_switch"'));
  assert.ok(runtime.includes('fn==="sandbox_grant_card"'));
  assert.ok(game.includes("onClick={()=>{if(state.room.sandbox)actions.sandboxSwitch?.(p.id)}"));
  assert.ok(selector.includes('onGrant("NUMBER")'));
  assert.ok(selector.includes('["W4","+4"]'));
  assert.ok(selector.includes('["A","Barata"]'));
});
