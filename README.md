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
