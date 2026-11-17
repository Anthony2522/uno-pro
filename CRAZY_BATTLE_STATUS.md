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
- **Câmera e controles:** primeira pessoa, joystick e olhar multitouch em celulares, layout móvel 9:16, desktop WASD, mouse com pointer lock, espaço para pular, E para trocar arma e Q mantida para defender. Os botões de toque são ocultados no desktop em favor de uma legenda de teclas, e o cursor é liberado ao fim da rodada.
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

## 8. 17/11/2026 — skins e controles desktop (PR #18)

- **Backup anterior a esta atualização:** `backup/uno-pro-pre-skins-controls-2026-11-17`, commit `4b86363c911f306e8fc2f259f6fc5c4686d377b9`.
- **Skins oficiais desta atualização:** `public/crazy/skins/warrior-red.png` e `warrior-blue.png`. Ambas são texturas PNG 64×64 no formato de UV clássico do Minecraft, adaptadas das duas artes previamente produzidas; não são simplesmente as planificações artísticas ampliadas. As faces são mapeadas para cabeça, torso, braços e pernas via `src/components/crazy/visuals.ts`.
- **Jogadores:** escolha entre Guerreiro Rubro e Cavaleiro Azul no menu inicial e no lobby; identificação sincronizada pelo servidor. Bots usam aparências alternadas.
- **Armas:** modelos voxel aprimorados de espada, escudo com emblema e arco com corda e flecha de carregamento; utilizados no treino e multiplayer.
- **Controles PC:** WASD; espaço pula; E troca espada/escudo ↔ arco; Q segura o escudo; clique esquerdo ataca ou prepara/solta arco; clique direito opcional para defesa; Esc libera cursor. A interface mostra uma legenda com teclas no canto em vez de joystick/botões.
- **Cursor:** ao concluir a partida, sair do pointer lock para possibilitar clicar em Jogar novamente/Sair. Também evitar travar novamente quando a rodada já terminou. No treino local, Jogar novamente reinicia o componente sem voltar à tela de entrada.
- **Testes:** novos casos verificam formato PNG 64×64 e transmissão das skins pelo WebSocket. A aprovação de CI e testes manuais em desktop/mobile devem ser registrados a partir dos resultados reais da execução correspondente.
- **Escopo:** os estilos e visuais pertencem ao Crazy Battle; o motor e o baralho do UNO Pro não foram modificados.

## 9. 17/11/2026 — estabilidade do cursor, FPS e animação inspirada no Minecraft (PR #19)

- **Backup anterior:** `backup/uno-before-crazy-performance-2026-11-17` (snapshot do commit `96b26750f9b8716865a59d37f695c989ce286a42`).
- **Cursor:** o modo treino solta imediatamente `Pointer Lock` em vitória/derrota. No multiplayer, a liberação também ocorre ao receber estados de derrota ou partida encerrada; guardas contra bloqueio tardio através de `pointerlockchange`, efeito React e quadro de animação. A tela final para de solicitar mouse/câmera e permite escolher ações de resultado.
- **Renderização:** DPR limitado por orçamento total de aproximadamente 2 milhões de pixels renderizados; redução automática em displays 4K/HiDPI; loop 3D limitado a cerca de 60 FPS, sem desenhar quando a aba não está visível e sem atualizar o fundo do resultado encerrado. O arco atualiza a porcentagem em passos de 5 pontos, evitando `setState` a cada quadro.
- **Movimento:** aceleração/frenagem com atrito nos dois modos (no multiplayer calculados no servidor), preservando WASD e velocidade de caminhada. No treino, há colisão com o bot e menos alocações temporárias por quadro.
- **Animação:** modelo articulado com braços e pernas sincronizados aos passos, salto e aterrissagem, postura ao levantar escudo, ataque de espada em arco com impacto de aproximadamente 320–350 ms, braço de arco e deslocamento sutil do corpo. O bot no treino também consegue saltar e atacar com animação.
- **Testes:** `test/crazyPerformance.test.js` verifica os limites de DPR/FPS e quando o cursor obrigatoriamente deve ser liberado. Os testes de rede e do UNO Pro continuam no fluxo CI.
- **Verificação manual ainda necessária:** testar a liberação efetiva de `Pointer Lock` nos navegadores em que o problema foi observado e medir FPS/frame time com e sem bot em computadores e celulares reais. Os testes automatizados não garantem desempenho em hardware específico.
