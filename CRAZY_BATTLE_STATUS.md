# Crazy Battle — implementação experimental

O Crazy Battle está isolado do UNO Pro em `src/components/crazy`, `src/routes/crazy-battle.tsx` e `server/crazyBattle.js`.

## Recursos incluídos
- Entrada pela página inicial do UNO Pro e rota `/crazy-battle`.
- Arena voxel 16×16 com paredes, teto físico de 16 unidades, controles mobile e desktop.
- Treino local contra um bot e multiplayer por WebSocket (`/api/crazy/ws`).
- Salas públicas/privadas, códigos de convite, lobby, anfitrião e bots.
- Simulação autoritativa no servidor: posição, vida, ataque, defesa frontal, flechas, vitória.
- Rodadas todos contra todos, até 8 participantes, sem respawn.

## Instalação e validação
```bash
npm install
npm run typecheck
npm run build
npm test
npm start
```
Teste manual em dois navegadores/dispositivos: criar sala, entrar por código, adicionar bot, iniciar, movimentar, trocar armas, defender, atacar, disparar arco, finalizar, reiniciar.

## Limitações conhecidas — não considerar produção concluída
- Os testes acima ainda não foram executados nesta branch.
- Logo oficial ainda não incorporada como asset binário. O arquivo fornecido na conversa não foi enviado ao GitHub.
- A fidelidade visual é parcial: faltam modelos e texturas finais, barras de vida 3D sobre inimigos e animações aprimoradas.
- O multiplayer é um primeiro protótipo: ainda requer reconexão, fila de espectadores, persistência, validação rigorosa contra trapaças, testes de carga e tratamento de latência.
- O jogo não deve ser mesclado na branch principal nem publicado sem testes.
- O modo treino local é separado das partidas online e não compartilha integralmente a simulação do servidor.

## Organização
`server/crazyBattle.js`: salas, bots e combate online.
`src/components/crazy/CrazyOnlineArena.tsx`: cena e controles online.
`src/components/crazy/CrazyArena.tsx`: treino offline.
`src/components/crazy/crazy.css`: HUD responsiva.

As mecânicas e parâmetros devem evoluir em módulos independentes, sem modificar o estado do UNO Pro.
