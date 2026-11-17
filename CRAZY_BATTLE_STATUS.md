# Crazy Battle — documentação técnica e registro de implementação

**Data:** 17/11/2026  
**Repositório:** Anthony2522/uno-pro  
**Branch de desenvolvimento:** `feature/crazy-battle` — Pull Request #17  
**Backup anterior a qualquer integração:** `backup/uno-pro-before-crazy-battle-2026-11-17`, commit `11f45e422f0d31d30e553fda47b756048e89e51b`.

## 1. Separação entre os jogos

Crazy Battle possui rota `/crazy-battle`, componentes em `src/components/crazy/`, lógica própria em `server/crazyBattle.js` e canal WebSocket exclusivo em `/api/crazy/ws`. O motor, as cartas, as salas e a persistência do UNO Pro não são reaproveitados indevidamente. A home do UNO Pro ganha apenas um acesso ao novo jogo no fim da página.

## 2. Recursos implementados

- **Identidade:** arte oficial enviada pelo usuário em `public/crazy-battle-logo.webp` (versão otimizada/transparente); paleta vermelho/laranja/amarelo e controles translúcidos.
- **Arena:** mundo voxel 16×16, limite físico vertical de 16 unidades, paredes, chão, pedras texturizadas, lava, tochas, bandeiras e céu aberto visualmente. Renderização estática com InstancedMesh, texturas 16×16 e poucos draw calls.
- **Câmera e controles:** primeira pessoa, joystick e olhar multitouch em celulares, layout móvel 9:16, desktop WASD, mouse com pointer lock, espaço, tecla Q e botões de ataque/defesa.
- **Armas:** espada e escudo com ataque direcional e cooldown; defesa mantida pressionada bloqueia 90% do dano frontal; arco carrega enquanto pressionado e dispara ao soltar, com flechas 3D, gravidade, colisão e munição ilimitada.
- **HUD:** vida própria vertical com porcentagem e cor dinâmica; nome e vida dos inimigos flutuando acima da cabeça; mira, cronômetro, participantes, troca de armas, botões 1:1/2:1, feedback de golpes.
- **Personagens:** proporção de cerca de dois blocos; armas e equipamentos visíveis, animações voxel simples de caminhada e golpes.
- **Salas:** públicas/privadas, código de convite, link direto `?room=CODIGO`, lobby, anfitrião, adição/remoção de bots, listagem pública atualizada em tempo real, revanche e retorno.
- **Multiplayer:** WebSocket, simulação de movimentação, dano e resultados no servidor, controle de taxa, tokens individuais de reconexão e janela de tolerância de desconexão de 30 segundos, heartbeat e encerramento de salas vazias.
- **Bots:** perseguem jogadores, alternam espada/arco de acordo com a distância, usam escudo ocasionalmente, pulam e respeitam o mesmo cálculo de dano.
- **Partidas:** todos contra todos, 100 pontos de vida, último sobrevivente vence, sem respawn; tela de resultados e reinício autorizado pelo anfitrião.
- **Treino local:** partida separada contra bot simples, sem simular multiplayer.

## 3. Valores da implementação

- 100 pontos iniciais de vida.
- Espada: 20 pontos, intervalo mínimo 650 ms e alcance aproximado 2,4 unidades.
- Escudo: mitigação frontal de 90% enquanto estiver pressionado; não funciona ao equipar arco.
- Arco: dano base 12, tempo máximo de carregamento de 1,2 s, flecha com gravidade e TTL de 3 s.
- Movimentação: 4 unidades/s; salto inicial de 5,3 unidades/s sob gravidade de 15 unidades/s².
- Salas: até 8 participantes, humanos e bots.
- Servidor: simulação por passos fixos de 50 ms (20 Hz).

Esses parâmetros estão centralizados parcialmente em `RULES` em `server/crazyBattle.js`. Em futuras expansões, consolidar todos os parâmetros no mesmo módulo de configuração compartilhada.

## 4. Testes e verificação

Workflow `.github/workflows/crazy-battle.yml` executa `npm install --ignore-scripts`, `npm run build`, `npm run typecheck`, `npm test`. A suíte `test/crazyBattle.test.js` inclui testes reais de comunicação WebSocket para criação/entrada em salas, privacidade, anfitrião, bots, reconexão, disparos, salto e bloqueio de 90%.

**Não confundir** suíte automatizada aprovada com testes manuais em celulares diferentes. Antes de afirmar desempenho e jogabilidade em produção, verificar Android e iOS reais, latência, toque simultâneo, rotação, WebGL, Render e reconexão diante de queda de rede.

## 5. Considerações de produção

O processo Node do Render pode servir UNO e Crazy Battle juntos. O estado das partidas Crazy Battle fica em memória e **não é persistido** após reinicialização/deploy, diferente de eventuais mecanismos externos do UNO; jogadores precisam criar nova sala após reinício. Por segurança, não há senha ou segredo no cliente para permitir dano, vitória ou administração de partidas.

**Não são garantidos por testes automatizados:** paridade visual perfeita com a simulação enviada pelo usuário, taxa de quadros mínima em todos os celulares, suporte a interrupções do navegador em segundo plano e resiliência a grandes quantidades de salas simultâneas. A experiência online básica é implementada, mas convém acompanhar o comportamento no uso real.

## 6. Recuperação do UNO Pro

O backup mencionado acima preserva o código da branch `main` antes de Crazy Battle. Para reverter uma integração, preferir um pull request de **revert** do PR #17 em vez de sobrescrever o histórico. Conferir separadamente qualquer estado Redis/Upstash de partidas UNO: backup de branch **não é backup de banco de dados**.

## 7. Evolução futura

Novos mapas, armas, partículas, habilidades e IA de bots devem ser adicionados nos módulos Crazy Battle, preservando a separação com UNO Pro. Registrar novas decisões e testes no documento do projeto e em changelog datado.
