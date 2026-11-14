const MESSAGES: Record<string, string> = {
  INVALID_SESSION: "Sua sessão expirou. Informe seu apelido novamente.",
  INVALID_NAME: "O apelido precisa ter de 2 a 18 caracteres.",
  INVALID_ROOM_NAME: "O nome da sala precisa ter de 2 a 32 caracteres.",
  INVALID_MAX_PLAYERS: "Escolha entre 2 e 8 jogadores.",
  ROOM_NOT_FOUND: "Sala não encontrada. Confira o código ou o link do convite.",
  ROOM_FULL: "Esta sala está cheia.",
  GAME_STARTED: "A partida já começou nesta sala. Aguarde o fim da rodada ou entre em outra sala.",
  NOT_HOST: "Só o anfitrião pode fazer isso.",
  NOT_ENOUGH_PLAYERS: "São necessários pelo menos 2 jogadores para começar.",
  NOT_MEMBER: "Você não está mais nesta sala.",
  NOT_YOUR_TURN: "Calma! Ainda não é a sua vez.",
  CARD_NOT_IN_HAND: "Essa carta não está na sua mão.",
  INVALID_CARD: "Essa carta não combina com a mesa.",
  MUST_PLAY_DRAWN: "Depois de comprar, só dá para jogar a carta comprada ou passar.",
  COLOR_REQUIRED: "Escolha uma cor para o coringa.",
  ALREADY_DRAWN: "Você já comprou nesta vez.",
  MUST_DRAW_FIRST: "Compre uma carta antes de passar.",
  UNO_NOT_ALLOWED: "Você só pode gritar UNO com 1 carta (ou com 2, na sua vez).",
  CATCH_NOT_ALLOWED: "Tarde demais! Não dá mais para pegar esse jogador.",
  GAME_NOT_ACTIVE: "Não há partida em andamento.",
  INVALID_COMBO: "Essa carta não continua a sequência.",
  CUT_NOT_ALLOWED: "Não é possível cortar agora.",
  NINE_ACTIVE: "Aguarde a rodada do 9 terminar.",
  NINE_NOT_ALLOWED: "Você não pode apertar 9 agora.",
  MUST_COUNTER_OR_DRAW: "Rebata com +2 ou +4 ou aceite comprar as cartas.",
  ALREADY_PLAYED: "Você já jogou cartas; termine sua vez.",
  NOTHING_TO_ACCEPT: "Não há cartas acumuladas para comprar.",
  NOT_BOT: "Esse jogador não é um bot.",
  NETWORK: "Problema de conexão. Verifique sua internet e tente novamente.",
};

export class GameError extends Error {
  code: string;
  constructor(code: string, raw?: string) {
    super(MESSAGES[code] ?? raw ?? "Algo deu errado. Tente novamente.");
    this.code = code;
  }
}

export function toGameError(err: unknown): GameError {
  if (err instanceof GameError) return err;
  const raw = err instanceof Error ? err.message : typeof err === "object" && err && "message" in err ? String((err as { message: unknown }).message) : String(err);
  const code = Object.keys(MESSAGES).find((k) => raw.includes(k));
  if (code) return new GameError(code, raw);
  if (/fetch|network|Failed to|Load failed|timeout/i.test(raw)) return new GameError("NETWORK", raw);
  return new GameError("UNKNOWN", raw);
}

export function errorMessage(err: unknown): string {
  return toGameError(err).message;
}