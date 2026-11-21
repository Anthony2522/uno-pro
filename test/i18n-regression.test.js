import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {newDeck} from "../server/game.js";
import {BOT_NAMES} from "../server/botNames.js";

const read=(file)=>readFileSync(new URL("../"+file,import.meta.url),"utf8");

test("README reflects the current deck and fixed bot name list",()=>{
  assert.equal(newDeck().length,216);
  assert.equal(BOT_NAMES.length,32);
  const readme=read("README.md");
  assert.match(readme,/216 cartas/);
  assert.match(readme,/233 cartas/);
  assert.match(readme,/32 nomes engraçados/);
  assert.doesNotMatch(readme,/191 cartas|100 nomes engraçados/);
});

test("spectators use user-facing labels, never developer-only labels",()=>{
  const waiting=read("src/components/uno/WaitingRoom.tsx");
  const dictionary=read("src/lib/uno/i18n.tsx");
  assert.doesNotMatch(waiting,/Observador \(dev\)/);
  assert.match(waiting,/Na fila de espera/);
  assert.match(waiting,/Espectador/);
  assert.match(dictionary,/"Na fila de espera": "In waiting queue"/);
  assert.match(dictionary,/"Espectador": "Spectator"/);
});

test("new English UI is explicitly localized and dictionary entries are present",()=>{
  const dictionary=read("src/lib/uno/i18n.tsx");
  for(const phrase of [
    "Partida ainda não começou","Assistir / Fila de espera",
    "Partida em andamento, você está na fila de espera. Aguarde a próxima partida.",
    "Você está assistindo à partida. Sua vez de jogar será na próxima rodada, quando houver vaga.",
    "Regras da partida","Com três ou mais participantes, o último a apertar 9 compra cartas.",
    "Por padrão, Cerveja, Barata, Espada e Coringa Metralhadora começam desativados. Você pode ativá-los abaixo; as demais regras e cartas seguem seus padrões atuais.",
    "Compra duas e inverte o sentido.","Copia o último coringa real jogado.",
    "Criar sala offline com bots","Continuar sala Sandbox",
    "Excluir sua partida offline salva neste aparelho? Esta ação não pode ser desfeita.",
    "Não foi possível copiar. Copie manualmente:",
  ])assert.ok(dictionary.includes(JSON.stringify(phrase)+":"),"Missing English translation: "+phrase);
  assert.match(read("src/routes/sala.$code.tsx"),/language==="en"\?"Match in progress/);
  assert.match(read("src/components/uno/GameTable.tsx"),/language==="en"\?"You are watching/);
  assert.match(read("src/components/uno/AdvancedRoomSettingsFields.tsx"),/tr\(item.description\)/);
  assert.match(read("src/components/uno/AdvancedRoomSettingsFields.tsx"),/tr\(description\)/);
});
