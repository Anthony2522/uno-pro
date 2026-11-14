import {createContext,useContext,useEffect,useMemo,useRef,useState,type ReactNode} from "react";
import {localizeBotNames} from "./botNames";
export type Language="pt"|"en";
const dictionary:Record<string,string>={
  "Como jogar": "How to play",
  "Ativar sons": "Enable sound",
  "Desativar sons": "Mute sound",
  "Editar apelido": "Edit nickname",
  "Apelido atualizado!": "Nickname updated!",
  "Todos nas suas salas verão o novo nome na hora.": "Everyone in your rooms will see your new name immediately.",
  "Salvar": "Save",
  "Continuar": "Continue",
  "Apelido": "Nickname",
  "Seu apelido": "Your nickname",
  "O apelido precisa ter de 2 a 18 caracteres.": "Your nickname must be 2 to 18 characters.",
  "De 2 a 18 caracteres. Seus amigos vão ver esse nome.": "2 to 18 characters. Your friends will see this name.",
  "Como podemos te chamar?": "What should we call you?",
  "Sem cadastro, sem e-mail. Só um apelido e bora jogar.": "No account or email. Just a nickname and play.",
  "Você foi convidado para a sala": "You were invited to room",
  "Depois do apelido, você entra direto.": "Enter your nickname to join directly.",
  "Bem-vindo de volta": "Welcome back",
  "Bora jogar,": "Ready to play,",
  "Crie uma sala e mande o link, ou entre numa sala aberta. Tudo em tempo real.": "Create a room and share the link, or join an open room. Play in real time.",
  "Criar sala": "Create room",
  "Entrar em uma sala": "Join a room",
  "Você ainda está na sala": "You're still in room",
  "— voltar": "— go back",
  "Salas públicas": "Public rooms",
  "ao vivo": "live",
  "Atualizar lista de salas": "Refresh rooms",
  "Sem conexão com o servidor. Tentando novamente…": "Server offline. Reconnecting…",
  "Nenhuma sala pública aberta agora": "No public rooms available",
  "Crie a sua e chame a galera — ela aparece aqui na hora.": "Create a room and invite friends — it will appear here immediately.",
  "Em jogo": "Playing",
  "Cheia": "Full",
  "Aguardando": "Waiting",
  "Entrar": "Join",
  "jogadores": "players",
  "Tem um código?": "Have a room code?",
  "Salas privadas não aparecem na lista. Digite o código ou cole o link que seu amigo mandou.": "Private rooms don't appear in the list. Enter the code or paste your friend's invite link.",
  "Código ou link da sala": "Room code or link",
  "Código ou link": "Code or link",
  "Criar e abrir sala": "Create and open room",
  "Você será o anfitrião e poderá iniciar a partida.": "You'll be the host and can start the match.",
  "Nome da sala": "Room name",
  "Visibilidade": "Visibility",
  "Pública": "Public",
  "Privada": "Private",
  "Aparece na lista": "Listed in lobby",
  "Só com link/código": "Invite link/code only",
  "Máximo de jogadores": "Maximum players",
  "Configurações avançadas": "Advanced settings",
  "Cartas iniciais por jogador": "Starting cards per player",
  "Quantidade distribuída no começo de cada partida (padrão: 8).": "Cards dealt at the beginning of each match (default: 8).",
  "Todas as regras opcionais vêm ativadas. Desmarque as que não quiser usar nesta sala.": "Optional rules are on by default. Uncheck any you don't want.",
  "Cartas repetidas": "Repeated cards",
  "Sequências numéricas": "Number runs",
  "Desafio do 9": "9 challenge",
  "Corte de turno": "Jump-in",
  "Rebater +2 e +4": "Stack draw cards",
  "Jogue duas ou mais cartas com o mesmo número ou símbolo, mesmo com cores diferentes.": "Play multiple cards with the same number or symbol, even in different colors.",
  "Jogue números consecutivos da mesma cor em ordem crescente ou decrescente.": "Play ascending or descending consecutive numbers of the same color.",
  "Com 3 ou mais jogadores, o último a apertar 9 compra uma carta por 9 jogado.": "With 3+ players, the last to press 9 draws one card for each 9.",
  "Quem tiver a carta exatamente igual à mesa pode jogar fora da vez.": "Anyone with the exact same top card can jump in out of turn.",
  "Acumule compras e permita que o próximo jogador rebata ou aceite a punição.": "Stack draw penalties; the next player can counter or accept them.",
  "Sala pública": "Public room",
  "Sala privada": "Private room",
  "Anfitrião:": "Host:",
  "Código da sala": "Room code",
  "Copiar link de convite": "Copy invite link",
  "Convidar": "Invite",
  "Jogadores": "Players",
  "Bot difícil": "Hard bot",
  "Bot fácil": "Easy bot",
  "Online": "Online",
  "Desconectado": "Disconnected",
  "Anfitrião": "Host",
  "Vaga livre": "Open seat",
  "Adicionar bots": "Add bots",
  "Preencha as vagas com jogadores automáticos. O modo fácil escolhe a melhor jogada em 60% das decisões; o difícil sempre prioriza as melhores jogadas disponíveis.": "Fill seats with bots. Easy bots pick the best move 60% of the time, while hard bots prioritize strong moves.",
  "+ Bot fácil": "+ Easy bot",
  "+ Bot difícil": "+ Hard bot",
  "Jogar novamente": "Play again",
  "Iniciar partida": "Start match",
  "Ver sala de espera": "Back to lobby",
  "Aguardando mais jogadores (mínimo 2). Mande o link!": "Waiting for at least 2 players. Share the link!",
  "Aguardando o anfitrião iniciar a revanche…": "Waiting for the host to start a rematch…",
  "Sua vez": "Your turn",
  "Vez de": "Turn:",
  "Terminar vez": "End turn",
  "Jogando…": "Playing…",
  "cartas": "cards",
  "carta": "card",
  "Cor:": "Color:",
  "Sentido horário": "Clockwise",
  "Sentido anti-horário": "Counterclockwise",
  "Vermelho": "Red",
  "Amarelo": "Yellow",
  "Verde": "Green",
  "Azul": "Blue",
  "Por cor": "By color",
  "Por número": "By number",
  "Denunciar": "Catch UNO",
  "Segure 5 segundos para denunciar UNO": "Hold 5 seconds to catch UNO",
  "Gritar UNO": "Call UNO",
  "Sua mão": "Your hand",
  "Adversários": "Opponents",
  "Mesa": "Table",
  "Comprar carta": "Draw card",
  "Escolha a nova cor": "Choose a new color",
  "O próximo jogador terá que seguir essa cor.": "The next player must follow this color.",
  "Você quer comprar": "Do you want to draw",
  "cartas ou rebater?": "cards or counter?",
  "Escolha uma carta de compra permitida (+5 também pode rebater) ou aceite a penalidade.": "Play a compatible draw card (+5 can counter too), or take the penalty.",
  "Comprar": "Draw",
  "e passar": "and pass",
  "Aviso na mesa — jogadas liberadas após 2 segundos.": "Notice on table — first play available after 2 seconds.",
  "DESAFIO DO 9": "9 CHALLENGE",
  "Você está salvo!": "You're safe!",
  "Aguardando os demais jogadores…": "Waiting for the others…",
  "O último a apertar compra": "The last player to press draws",
  "A partida começou! Boa sorte.": "Match started! Good luck.",
  "Coringa": "Wild",
  "Coringa +4": "Wild +4",
  "Coringa +5": "Wild +5",
  "Pular": "Skip",
  "Inverter": "Reverse",
  "+2 Volta": "+2 Reverse",
  "Coringa Detetive": "Detective Wild",
  "Você venceu!": "You won!",
  "venceu!": "won!",
  "Mão zerada. Que jogada!": "No cards left. Nice move!",
  "Fim da rodada. Revanche?": "Round over. Rematch?",
  "É preciso pelo menos 2 jogadores na sala.": "At least 2 players are required.",
  "Sair da sala?": "Leave the room?",
  "Ficar": "Stay",
  "Sair da sala": "Leave room",
  "Carregando": "Loading",
  "Não foi possível entrar": "Unable to join",
  "Sala não encontrada": "Room not found",
  "Sala cheia": "Room full",
  "Partida em andamento": "Match in progress",
  "Voltar ao início": "Back to home",
  "Tentar de novo": "Try again",
  "Entrando na sala": "Joining room",
  "gritou UNO!": "called UNO!",
  "inverteu o sentido!": "reversed direction!",
  "cartas!": "cards!",
  "Jogador": "Player",
  "jogador": "player",
  "UNO e denúncia": "UNO and catching",
  "Objetivo": "Goal",
  "Na sua vez": "On your turn",
  "Sequências repetidas": "Repeated sequences",
  "O desafio do 9": "The 9 challenge",
  "Corte": "Jump-in",
  "Rebater compras": "Stacking draw cards",
  "Tempo": "Timer",
  "Bots": "Bots",
  "Regras opcionais podem ser ativadas ou desativadas pelo anfitrião antes da partida.": "Optional rules can be toggled by the host before the match.",
  "Digite um código de sala válido (ex.: K7MX2P) ou cole o link do convite.": "Enter a valid room code (e.g. K7MX2P) or paste an invite link.",
  "Link de convite copiado!": "Invite link copied!",
  "Código copiado!": "Code copied!",
  "Acesso desenvolvedor": "Developer access",
  "Senha de desenvolvedor": "Developer password",
  "Excluir sala": "Delete room",
  "Excluir esta sala pública?": "Delete this public room?",
  "Cancelar": "Cancel",
  "Confirmar": "Confirm",
  "Autenticar": "Authenticate",
  "Senha incorreta": "Incorrect password",
  "Dev ativado": "Dev enabled",
  "2º colocado": "Runner-up",
  "1º colocado": "Winner",
  "Revelar cartas": "Reveal cards",
  "Escolha um jogador": "Choose a player",
  "Cartas do jogador": "Player's hand",
  "Tempo restante": "Time left",
  "Detetive": "Detective",
  "Você": "You",
  "você": "you",
  "Sala": "Room",
  "Regra do 9": "9 rule",
  "Aguardando o segundo colocado…": "Waiting for second place…",
  "1º colocado! Aguardando o segundo colocado…": "First place! Waiting for the runner-up…",
  "Escolha um jogador para ver as cartas dele por 10 segundos.": "Choose a player to reveal their hand for 10 seconds.",
  "Nova cor": "New color",
  "Você comprou": "You drew",
  "Termine a vez": "End your turn",
  "Não há cartas válidas": "No playable cards",
  "Carta comprada. Você pode jogar qualquer carta compatível.": "Card drawn. You may play any compatible card.",
  "Sem jogada possível: você comprou e a vez passou automaticamente.": "No playable cards: you drew one and your turn passed automatically.",
  "Baralho infinito": "Infinite deck",
  "A sua vez terminou.": "Your turn ended.",
  "Você já terminou a partida!": "You already finished!",
  "Aguardando mais jogadores": "Waiting for more players",
  "Conexão instável — reconectando…": "Unstable connection — reconnecting…",
  "Segure": "Hold",
  "Denunciar UNO": "Catch UNO",
  "1º": "1st",
  "2º": "2nd"
};
const longPairs=Object.entries(dictionary).filter(([pt])=>pt.length>=10).sort((a,b)=>b[0].length-a[0].length);
function translatePiece(value:string,lang:Language){
  if(lang==="pt")return value;
  let s=localizeBotNames(value,"en");
  const full=dictionary[s];
  if(full)return full;
  const trim=s.trim();if(dictionary[trim])return s.replace(trim,dictionary[trim]);
  for(const [pt,en] of longPairs){if(s.includes(pt))s=s.replaceAll(pt,en);}
  s=s.replace(/(\d+) cartas\b/g,"$1 cards").replace(/(\d+) carta\b/g,"$1 card");
  return s;
}
type LanguageCtx={language:Language;setLanguage:(lang:Language)=>void;toggleLanguage:()=>void;tr:(text:string)=>string};
const Ctx=createContext<LanguageCtx|null>(null);
export function LanguageProvider({children}:{children:ReactNode}){
  const [language,setLanguage]=useState<Language>(()=>{
    try{return localStorage.getItem("unopro.lang")==="en"?"en":"pt"}catch{return "pt"}
  });
  const originals=useRef(new WeakMap<Text,{original:string;output:string;lang?:Language}>());
  const attrs=useRef(new WeakMap<Element,Map<string,{original:string;output:string;lang?:Language}>>());
  useEffect(()=>{
    try{localStorage.setItem("unopro.lang",language)}catch{/* storage may be blocked */}
    document.documentElement.lang=language==="pt"?"pt-BR":"en-US";
    const process=()=>{
      const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);
      let node:Node|null;
      while((node=walker.nextNode())){
        const n=node as Text;
        if(n.parentElement?.closest("script,style,textarea,code"))continue;
        let rec=originals.current.get(n);
        if(rec?.output===n.data&&rec.lang===language)continue;
        if(!rec || rec.output!==n.data){rec={original:n.data,output:n.data};originals.current.set(n,rec)}
        const converted=translatePiece(rec.original,language);rec.output=converted;rec.lang=language;
        if(n.data!==converted)n.data=converted;
      }
      for(const el of Array.from(document.querySelectorAll("*"))){
        let map=attrs.current.get(el);
        if(!map){map=new Map();attrs.current.set(el,map)}
        for(const attr of ["title","aria-label","placeholder","alt"]){
          const val=el.getAttribute(attr);if(val===null)continue;
          let rec=map.get(attr);
          if(rec?.output===val&&rec.lang===language)continue;
          if(!rec || rec.output!==val){rec={original:val,output:val};map.set(attr,rec)}
          const converted=translatePiece(rec.original,language);rec.output=converted;rec.lang=language;
          if(val!==converted)el.setAttribute(attr,converted);
        }
      }
    };
    process();
    let scheduled=false;
    const obs=new MutationObserver(()=>{
      if(scheduled)return;scheduled=true;
      queueMicrotask(()=>{scheduled=false;process()});
    });
    obs.observe(document.body,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:["title","aria-label","placeholder","alt"]});
    return ()=>obs.disconnect();
  },[language]);
  const value=useMemo(()=>({language,setLanguage,toggleLanguage:()=>setLanguage(v=>v==="pt"?"en":"pt"),tr:(text:string)=>translatePiece(text,language)}),[language]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
export function useLanguage(){const c=useContext(Ctx);if(!c)throw Error("useLanguage outside LanguageProvider");return c;}
