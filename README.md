# UNO Pro

Um jogo de cartas multiplayer para jogar com amigos, publicado no Render.

## Executar

```bash
npm install
npm start
```

Para desenvolvimento local, use `npm run dev`. As verificações usam `npm test` e `npm run typecheck`.

## Acesso de desenvolvedor

**Segurança:** ninguém recebe privilégios só por usar o apelido **Toninho**. Isso permitiria que qualquer pessoa removesse salas.

Para habilitar o painel de desenvolvedor, no painel do seu Web Service no Render, abra **Environment**, adicione a variável de ambiente `DEV_ACCESS_KEY` com uma senha aleatória de no mínimo 16 caracteres e salve. Nunca insira essa senha em arquivos do GitHub ou no front-end.

Entre no jogo com o apelido `Toninho`, abra o perfil e selecione **Acesso desenvolvedor** para digitar a senha. Após autenticar, você poderá apagar salas públicas e assumir o cargo de anfitrião nas salas que entrar. O acesso é vinculado à sessão no servidor e pode precisar ser renovado após reinícios do Render.

## Regras recentes

- 50 segundos de turno, com anúncios que não consomem tempo.
- 8 cartas iniciais, configuráveis de 2 a 20.
- Coringa Detetive: revela privadamente as cartas do adversário selecionado por 10 segundos.
- +2 Volta: inverte a direção e acumula duas compras; com dois jogadores, funciona como um +2 comum.
- Primeiro colocado sai da disputa e os demais jogam pelo segundo.
- 100 nomes engraçados para bots e alternância de português/inglês.

## Atualização Desuno, Bomba e animações

- A mão começa ordenada por número; é possível alternar para organização por cor.
- Desuno é um botão simples: após quatro segundos com uma carta sem chamar UNO, todos os infratores são denunciados por um clique.
- Cada carta jogada agora gera um movimento público de um segundo até o descarte. O resultado é calculado exclusivamente no servidor.
- Bloqueios consecutivos mostram avisos acumulativos com os nomes dos jogadores pulados.
- Coringa Detetive exibe cartas maiores, com identificação legível, apenas ao jogador autorizado pelo prazo de dez segundos.
- Coringa Bomba: uma cópia no baralho, cada adversário compra duas cartas sem perder a vez.
- Desconexão não força o avanço imediato: enquanto o participante está offline, há até trinta segundos de tolerância, limitada também pelo relógio normal de cinquenta segundos. Reconectar não reinicia o tempo gasto.

## Configurações antes da partida e efeitos por sequência

O anfitrião pode abrir **Configurações avançadas** também na sala de espera, inclusive após uma partida terminar, e alterar a quantidade inicial de cartas (2–20) ou as cinco regras opcionais. Configurações são somente leitura durante partidas em andamento. Os diálogos oferecem rolagem vertical no celular.

O **Desuno** só pode ser acionado por participantes ainda ativos: vencedores e observadores não podem denunciar. A partida termina automaticamente quando somente bots continuam na disputa; se um humano foi o primeiro colocado, ele permanece em primeiro e um bot com menos cartas ocupa o segundo lugar para encerrar a classificação.

Animações especiais de cartas (bloqueios, voltas, mudança de cor, Bomba) são agregadas e reproduzidas **uma vez ao terminar a jogada**, inclusive quando ela termina automaticamente. As animações individuais de cada carta viajando ao descarte continuam acontecendo ao jogá-las.

## Inteligência difícil (nova política)

- O bot fácil mantém exatamente a estratégia anterior (60% da melhor opção e 40% da opção aleatória entre jogadas válidas).
- O bot difícil pesquisa jogadas e combinações legais com busca deduplicada e limitada a 7 mil estados, sem consultar o conteúdo de mãos adversárias.
- Avalia cores que restarão, possibilidades de pares/sequências, economia de coringas e cartas de compra, direção e próximo jogador, risco de rebatida e rivais com 1–3 cartas.
- Memória curta de até cinco ações públicas por participante: compras compulsórias não são confundidas com ausência de uma cor. Evidências antigas decaem.
- Em caso de pontuação praticamente empatada, sorteia entre os melhores planos, evitando um padrão totalmente previsível.
- Testes independentes exercitam ameaças, proteção de especiais, combos, coringas, regras desativadas, sigilo de cartas ocultas e desempenho em partidas simuladas com sementes reproduzíveis.

Para reproduzir os torneios: `node scripts/bot-benchmark.mjs --games=600` (bot difícil anterior vs fácil), `node scripts/bot-benchmark.mjs --enhanced --games=600` (novo difícil vs fácil) e `node scripts/bot-benchmark.mjs --paired --games=600` (novo difícil vs antigo difícil, com o mesmo conjunto de cartas e um jogador de referência).

## Novas regras e cartas (novembro de 2026)

- O baralho tem 191 cartas: 1 Negação (N), 1 Sem Poderes (P) e 1 Metralhadora (M), além das cartas existentes.
- **Negação**: cancela +2, +4 ou +5 acumulados, um Bloqueio direcionado ao usuário ou a proibição do Sem Poderes. O portador escolhe uma nova cor e ainda pode jogar normalmente; uma decisão de bloqueio expira após nove segundos sem resposta.
- **Sem Poderes**: impede cartas especiais na próxima vez, permitindo apenas números, salvo se o portador usar Negação.
- **Metralhadora**: substitui uma carta especial de cada adversário por uma carta numérica, privilegiando coringas, depois compras, depois Bloqueio/Volta. Nenhum jogador perde a vez por isso.
- **Bloqueios**: sempre percorrem apenas adversários, sem auto-bloquear o autor quando há voltas completas; Volta em partida de dois finaliza automaticamente para devolver a vez.
- **Avisos**: aparecem juntos até três por vez, não bloqueiam ações. Compras automáticas com passagem de vez geram aviso privado.
- **Vitórias**: quantidade configurável de 1 a N−1, ajustada ao número real de participantes no início. Anfitrião pode alterar na espera.
- **Inatividade**: duas passagens de turno consecutivas pelo tempo esgotado e sem ação removem automaticamente o jogador.
