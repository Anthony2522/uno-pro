# UNO Pro

Um jogo de cartas multiplayer para jogar com amigos, publicado no Render.

## Executar

```bash
npm install
npm start
```

Para desenvolvimento local, use `npm run dev`. As verificações usam `npm test` e `npm run typecheck`.

## Administrador Tony

O apelido **Tony** exibe um campo de senha. O nome, sozinho, não concede acesso especial: a senha é verificada no servidor, com comparação segura e limite de tentativas por IP.

Para ativar o administrador no Render, abra **Web Service → Environment**, crie `UNO_ADMIN_PASSWORD` e informe a senha de administrador escolhida (mínimo de 8 caracteres). Salve e aguarde o deploy. **Nunca coloque a senha no GitHub, em um arquivo do front-end ou nesta documentação.**

Depois de autenticar, Tony pode visualizar e encerrar todas as salas armazenadas no servidor, públicas ou privadas, inclusive partidas em andamento. Antes da exclusão o painel pede confirmação. As partidas offline não ficam no servidor e só podem ser excluídas no próprio dispositivo. Ao mudar o apelido, o acesso administrativo é revogado e requer nova autenticação.

## Sandbox e configurações

Na tela inicial, **Criar sala Sandbox** inicia uma partida privada, somente neste navegador, com dois humanos controlados pela mesma pessoa. Toque no painel do adversário para controlar a outra mão. Use **Pegar qualquer carta** para acrescentar um número comum aleatório ou escolher cartas coloridas e coringas específicos; cartas coloridas recebem cor aleatória. Esta sala não aparece na lista pública e é salva separadamente da partida offline com bots.

Na opção de partida offline com bots, um **X** ao lado de **Voltar para a sala offline** permite apagar a partida e seu backup no aparelho.

Nas configurações avançadas, a **quantidade de cartas iniciais** é a primeira opção. As prévias do manual e das configurações usam ilustrações vetoriais de tamanho fixo, independentes do sistema de medidas responsivas das cartas.

## Regras recentes

- Turno de **50 segundos**; nas batalhas de compra, quem tem defesa válida pode usar os 50 segundos, quem não tem compra automaticamente após um sorteio de **4 a 7 segundos**. Bots com resposta válida agem em aproximadamente **2 segundos**.
- 8 cartas iniciais, configuráveis de 2 a 30.
- Coringa Detetive: revela privadamente as cartas do adversário selecionado por 10 segundos.
- +2 Volta: inverte a direção e acumula duas compras; com dois jogadores, funciona como um +2 comum.
- Primeiro colocado sai da disputa e os demais jogam até completar as colocações exigidas. Após a carta decisiva, a mesa fica congelada por cinco segundos; o poder dessa última carta não é ativado.
- 32 nomes engraçados para bots (lista fixa atual em `server/botNames.js`) e alternância de português/inglês.

## Atualização Desuno, Bomba e animações

- A mão começa ordenada por número; é possível alternar para organização por cor.
- Desuno é um botão simples: após quatro segundos com uma carta sem chamar UNO, todos os infratores são denunciados por um clique.
- Cada carta jogada agora gera um movimento público de um segundo até o descarte. O resultado é calculado exclusivamente no servidor.
- Bloqueios consecutivos mostram avisos acumulativos com os nomes dos jogadores pulados.
- Coringa Detetive exibe cartas maiores, com identificação legível, apenas ao jogador autorizado pelo prazo de dez segundos.
- Coringa Bomba: uma cópia no baralho, cada adversário compra duas cartas sem perder a vez.
- Desconexão não força o avanço imediato: enquanto o participante está offline, há até trinta segundos de tolerância, limitada também pelo relógio normal de cinquenta segundos. Reconectar não reinicia o tempo gasto. **Sair voluntariamente da sala** remove imediatamente o jogador da partida e libera sua vaga.

## Configurações antes da partida e efeitos por sequência

O anfitrião pode abrir **Configurações avançadas** também na sala de espera, inclusive após uma partida terminar, e alterar a quantidade inicial de cartas (2–30) ou as cinco regras opcionais. Configurações são somente leitura durante partidas em andamento. Os diálogos oferecem rolagem vertical no celular.

O **Desuno** só pode ser acionado por participantes ainda ativos: vencedores e observadores não podem denunciar. A partida termina automaticamente quando somente bots continuam na disputa; se um humano foi o primeiro colocado, ele permanece em primeiro e um bot com menos cartas ocupa o segundo lugar para encerrar a classificação.

Animações especiais de cartas (bloqueios, voltas, mudança de cor, Bomba) são agregadas e reproduzidas **uma vez ao terminar a jogada**, exceto se a carta final já completar as colocações exigidas: nesse caso, nenhuma habilidade dessa carta é executada e sua imagem permanece na mesa por cinco segundos. As animações individuais de cada carta viajando ao descarte continuam acontecendo ao jogá-las.

## Inteligência difícil (nova política)

- O bot fácil mantém exatamente a estratégia anterior (60% da melhor opção e 40% da opção aleatória entre jogadas válidas).
- O bot difícil pesquisa jogadas e combinações legais com busca deduplicada e limitada a 7 mil estados, sem consultar o conteúdo de mãos adversárias.
- Avalia cores que restarão, possibilidades de pares/sequências, economia de coringas e cartas de compra, direção e próximo jogador, risco de rebatida e rivais com 1–3 cartas.
- Memória curta de até cinco ações públicas por participante: compras compulsórias não são confundidas com ausência de uma cor. Evidências antigas decaem.
- Em caso de pontuação praticamente empatada, sorteia entre os melhores planos, evitando um padrão totalmente previsível.
- Testes independentes exercitam ameaças, proteção de especiais, combos, coringas, regras desativadas, sigilo de cartas ocultas e desempenho em partidas simuladas com sementes reproduzíveis.

Para reproduzir os torneios: `node scripts/bot-benchmark.mjs --games=600` (bot difícil anterior vs fácil), `node scripts/bot-benchmark.mjs --enhanced --games=600` (novo difícil vs fácil) e `node scripts/bot-benchmark.mjs --paired --games=600` (novo difícil vs antigo difícil, com o mesmo conjunto de cartas e um jogador de referência).

## Novas regras e cartas (novembro de 2026)

- O baralho padrão tem **215 cartas**, com Cerveja, Barata, Espada e Coringa Metralhadora inicialmente desativadas nas novas salas. Elas continuam disponíveis nas Configurações avançadas. Ao habilitar todas as cartas opcionais, o baralho completo possui **232 cartas**.
- **Negação**: cancela +2, +4 ou +5 acumulados, um Bloqueio direcionado ao usuário ou a proibição do Sem Poderes. O portador escolhe uma nova cor e **gasta a vez**, passando a jogada ao próximo participante; uma decisão de bloqueio expira após nove segundos sem resposta.
- **Sem Poderes**: impede cartas especiais na próxima vez, permitindo apenas números, salvo se o portador usar Negação.
- **Metralhadora**: substitui uma carta especial de cada adversário por uma carta numérica, privilegiando coringas, depois compras, depois Bloqueio/Volta. Nenhum jogador perde a vez por isso.
- **Bloqueios**: sempre percorrem apenas adversários, sem auto-bloquear o autor quando há voltas completas; Volta em partida de dois finaliza automaticamente para devolver a vez.
- **Avisos**: aparecem juntos até três por vez, não bloqueiam ações. Compras automáticas com passagem de vez geram aviso privado.
- **Vitórias**: quantidade configurável de 1 a N−1, ajustada ao número real de participantes no início. Anfitrião pode alterar na espera.
- **Inatividade**: duas passagens de turno consecutivas pelo tempo esgotado e sem ação removem automaticamente o jogador.

## Modo offline de verdade e recuperação de partidas solo (novembro 2026)

### Causa raiz

No plano gratuito do Render o processo pode reiniciar e perder dados em memória. Os arquivos locais do serviço também são efêmeros; **o link da sala não é um backup**. O antigo timeout de cinco minutos não recupera uma sala que já deixou de existir no servidor. Por isso uma partida que depende exclusivamente do servidor pode desaparecer mesmo com um link correto.

### Jogar offline com bots (sem login Google, sem Redis)

1. Abra o UNO Pro **uma vez com internet** depois da atualização. O service worker instala um cache versionado contendo a interface, as cartas e todos os módulos de rotas.
2. Na tela inicial, clique em **Jogar offline com bots**. Uma partida de três jogadores (você, **zero bots fáceis e dois difíceis** por padrão) começa **no seu navegador**, com as mesmas regras e IA do jogo online.
3. Você pode desligar o Wi-Fi, jogar, recarregar a página e voltar a essa partida pelo botão **Continuar partida offline com bots** ou pelo link local da sala.
4. O jogo salva o baralho, suas cartas, as mãos dos bots e o turno no **localStorage deste navegador** após cada ação. Ao ficar em segundo plano, os cronômetros são pausados e ajustados quando você volta. Não há janela de expiração de cinco minutos para partidas inteiramente locais.

**Modo offline significa**: a partida não é sincronizada com o servidor e não pode ser compartilhada com amigos ou retomada em outro aparelho. Não limpe os dados do site, não use modo anônimo e mantenha o mesmo navegador. O navegador pode apagar dados em situações excepcionais; o jogo solicita armazenamento persistente quando disponível.

### Resgatar uma partida online com bots, mesmo após a sala desaparecer

- Durante uma partida **com um único humano e os demais bots**, o cliente baixa periodicamente um **snapshot completo privado**: estado, baralho, mãos dos bots e a própria mão. O endpoint recusa partidas com mais de um humano ou usuários que não fazem parte da sala.
- Se o servidor ficar inacessível ou responder **ROOM_NOT_FOUND / INVALID_SESSION** ao abrir o link antigo, o cliente recupera o snapshot guardado neste aparelho e **continua a partida localmente**, sem perder todas as cartas.
- A tela inicial também mostra os backups locais recuperáveis, com botão de retomada, mesmo se o serviço estiver indisponível.
- Depois do resgate, a partida segue somente no aparelho (sem voltar a sincronizar com o servidor), pois o servidor antigo pode ter desaparecido ou evoluído enquanto você esteve offline.
- **Limite honesto**: o resgate automático só existe se este navegador **já tiver salvo pelo menos um snapshot** daquela partida. Se o servidor cair antes do primeiro salvamento, ou se os dados do site forem apagados, não há como reconstruir exatamente a partida anterior.

### Partidas com outras pessoas

O modo offline e o snapshot de resgate só se aplicam a partidas em que há **um único humano contra bots**. Partidas multiplayer reais continuam usando o servidor e mantendo a reconexão por falha de rede; quem **seleciona Sair da sala** é removido imediatamente, enquanto a expulsão por inatividade continua disponível para quem deixa o jogo aberto sem agir. Não existe fork local de partidas compartilhadas.

### Armazenamento do servidor (opcional)

A persistência externa via Redis continua disponível para quem quiser manter salas *multiplayer* durante reinícios do Render: configure `UPSTASH_REDIS_REST_URL` e `UPSTASH_REDIS_REST_TOKEN` no Render. **Para partidas offline com bots não precisa de Redis nem de Google Cloud.** O servidor também pode usar `.uno-state.json` local, mas esse arquivo não sobrevive necessariamente a novos deploys no plano gratuito.

## Coringa Espelho — aparência

Há uma única carta física Espelho. Enquanto nenhum coringa real tiver sido jogado na partida, ela mostra **sua própria arte de espelho**. Assim que um coringa real é jogado (inclusive pelo próprio portador), sua face mostra a **mesma arte daquele coringa** — por exemplo, o símbolo **+4** — mas conserva a borda branca pulsante e o brilho prateado que passa por cima da carta. A cópia do Espelho não substitui a referência do último coringa real.
