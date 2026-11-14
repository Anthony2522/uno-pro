export type CardColor = "r" | "y" | "g" | "b";
export const COLORS: CardColor[] = ["r", "y", "g", "b"];

export const COLOR_NAMES: Record<CardColor, string> = {
  r: "Vermelho",
  y: "Amarelo",
  g: "Verde",
  b: "Azul",
};

export function isWild(card: string): boolean {
  return card === "W" || card === "W4" || card === "W5" || card === "X";
}

export function cardColor(card: string): CardColor | null {
  return isWild(card) ? null : (card[0] as CardColor);
}

export function cardValue(card: string): string {
  return isWild(card) ? card : card.slice(1);
}

/** Mirrors the server rule in public._playable. */
export function isPlayable(card: string, top: string, currentColor: string): boolean {
  if (isWild(card)) return true;
  if (card[0] === currentColor) return true;
  if (!isWild(top) && cardValue(card) === cardValue(top)) return true;
  return false;
}

export function cardLabel(card: string): string {
  if (card === "W") return "Coringa";
  if (card === "W4") return "Coringa +4";
  if (card === "W5") return "Coringa +5";
  if (card === "X") return "Coringa Detetive";
  const color = COLOR_NAMES[card[0] as CardColor] ?? "";
  const v = cardValue(card);
  const name = v === "S" ? "Pular" : v === "R" ? "Inverter" : v === "D" ? "+2" : v === "T" ? "+2 Volta" : v;
  return `${name} ${color}`;
}

/** Normalizes a pasted code or invite URL into a room code, or null. */
export function parseRoomCode(input: string): string | null {
  const trimmed = input.trim();
  const fromUrl = trimmed.match(/sala\/([A-Za-z0-9]+)/);
  const raw = (fromUrl?.[1] ?? trimmed).replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  return raw.length >= 4 && raw.length <= 10 ? raw : null;
}

/** Sort hand by color then value for a tidy fan. */
export function sortHand(cards: string[]): string[] {
  const order = (c: string) => {
    if (c === "W") return 400;
    if (c === "W4") return 401;
    if (c === "W5") return 402;
    if (c === "X") return 403;
    const ci = COLORS.indexOf(c[0] as CardColor) * 100;
    const v = cardValue(c);
    const vi = v === "S" ? 10 : v === "R" ? 11 : v === "D" ? 12 : v === "T" ? 13 : Number(v);
    return ci + vi;
  };
  return [...cards].sort((a, b) => order(a) - order(b));
}