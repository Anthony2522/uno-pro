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

test("padrão offline e limite de 30 cartas permanecem sincronizados no formulário",()=>{
  const create=read("src/components/uno/CreateRoomDialog.tsx");
  const advanced=read("src/components/uno/AdvancedRoomSettingsFields.tsx");
  const i18n=read("src/lib/uno/i18n.tsx");
  assert.match(create,/setEasyBots\(offline\?0:1\)/);
  assert.match(create,/setHardBots\(offline\?2:1\)/);
  assert.match(advanced,/Array\.from\(\{length:29\},\(_,i\)=>i\+2\)/);
  assert.match(advanced,/De 2 a 30 cartas; padrão de 8\./);
  assert.match(i18n,/From 2 to 30 cards; default is 8\./);
});

test("indicador fixo da direção permanece; avisos temporários de Volta e cor são ocultados",()=>{
  const board=read("src/components/uno/GameTable.tsx");
  const route=read("src/routes/sala.$code.tsx");
  const describe=read("src/lib/uno/describe.ts");
  const server=read("server/pro.js");
  for(const icon of ["RotateCw","RotateCcw"])assert.ok(board.includes(icon),icon);
  assert.match(board,/Sentido horário/);
  assert.match(board,/Sentido anti-horário/);
  assert.match(board,/Clockwise/);
  assert.match(board,/Counterclockwise/);
  assert.match(board,/game\.direction===1/);
  assert.match(route,/\["shield_defense","roach","reverse","color_wave"\]\.includes\(e\.type\)/);
  assert.match(route,/event\.type==="reverse"\|\|event\.type==="color_wave"/);
  assert.doesNotMatch(route,/Nova cor escolhida/);
  assert.doesNotMatch(route,/Repeat2/);
  assert.doesNotMatch(describe,/sentido invertido/);
  // Gameplay/server events continue unchanged; only presentation is suppressed.
  assert.match(server,/effect\(r,"reverse"/);
  assert.match(server,/effect\(r,"color_wave"/);
  assert.match(route,/top-\[11rem\] sm:top-\[12rem\]/);
});
test("mensagem de impossibilidade de revide e congelamento final têm versões em inglês",()=>{
  const board=read("src/components/uno/GameTable.tsx");
  const dict=read("src/lib/uno/i18n.tsx");
  const exit=read("src/components/uno/RoomTopBar.tsx");
  assert.match(board,/tr\("Você não tem como revidar"\)/);
  assert.match(dict,/"Você não tem como revidar": "You have no way to counter"/);
  assert.match(board,/roundEnding&&"pointer-events-none"/);
  assert.match(board,/Final card on the table/);
  assert.match(exit,/Leaving removes you from this match/);
});

test("resposta de compra respeita filtro privado do servidor e avisa a cor do Cadeado",()=>{
  const source=read("src/components/uno/GameTable.tsx");
  const api=read("src/lib/uno/api.ts");
  const server=read("server/pro.js");
  const dict=read("src/lib/uno/i18n.tsx");
  assert.match(source,/game\.legal_draw_counters\.includes\(c\)/);
  assert.match(source,/myTurn&&game\.lock_remaining\?\.includes\(me\)/);
  assert.match(source,/game\.can_answer_draw===false/);
  assert.match(source,/Cadeado: só pode revidar com \+2 ou \+2 Volta/);
  assert.match(source,/Lock: counter only with/);
  assert.match(source,/hand\.some\(c=>counterCard\(c\)&&cardValue\(c\)==="T"\)/);
  assert.match(api,/legal_draw_counters\?: string\[\]/);
  assert.match(server,/viewingDebt\?legalDrawCounters\(r,result\.me\):\[\]/);
  assert.match(source,/\+5 exige outro \+5, mas coringas de compra estão proibidos/);
  assert.match(source,/\+5 requires another \+5, but draw wilds are blocked/);
  assert.match(dict,/Você não tem como revidar/);
});

test("avisos 6, 8, 12 e 13 não aparecem abaixo dos adversários; denúncia indica autor e alvo",()=>{
  const route=read("src/routes/sala.$code.tsx");
  const engine=read("server/pro.js");
  const hidden=["shield_armed","roach_end","sword_armed","sword_boost"];
  assert.match(route,/\["shield_defense","roach","reverse","color_wave","shield_armed","roach_end","sword_armed","sword_boost"\]\.includes\(e\.type\)/);
  assert.match(route,/e\.type==="catch"\?language==="en"\?/);
  assert.match(route,/\$\{e\.name\} denunciou \$\{e\.target_name\?\?"um jogador"\}/);
  assert.match(route,/\$\{e\.name\} reported \$\{e\.target_name\?\?"a player"\}/);
  assert.doesNotMatch(route,/denunciado!/);
  // Hiding a banner must not disable card mechanics or the special animations.
  for(const kind of hidden)assert.ok(engine.includes('effect(r,"'+kind+'"'),kind);
  assert.match(route,/e\.type==="sword_strike"/);
  assert.match(route,/const shieldDefenses=/);
  assert.match(route,/const roachTransfers=/);
});
