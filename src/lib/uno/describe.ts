import type { LastAction } from "./api";
import { cardLabel, cardValue, COLOR_NAMES, type CardColor } from "./cards";

export function describeAction(a: LastAction, me: string): string | null {
  if (!a) return null;
  const who = a.by === me ? "Você" : a.name ?? "Alguém";
  const target = a.target === me ? "você" : a.target_name ?? "o próximo";
  switch (a.type) {
    case "start":
      return "A partida começou! Boa sorte.";
    case "play": {
      if (!a.card) return null;
      // No text announcing that a penalty card or a wild was PLAYED.
      // Draw penalties are announced separately; no color-change or reversal notice.
      const v = cardValue(a.card);
      if (["W","W4","W5"].includes(a.card) || v==="D" || v==="T")return null;
      let s = `${who} jogou ${cardLabel(a.card)}`;
      if ((v === "D" || v === "W4") && a.n) s += ` — ${target} compra ${a.n} e perde a vez`;
      else if (v === "S" || (v === "R" && a.target)) s += ` — ${target} perde a vez`;
      
      if ((a.card === "W" || a.card === "W4" || a.card === "W5") && a.color) s += ` · cor: ${COLOR_NAMES[a.color as CardColor]}`;
      if (a.win) s = `${who} jogou a última carta!`;
      return s;
    }
    case "cut":
      return `${who} cortou a rodada com ${a.card ? cardLabel(a.card) : "uma carta"}!`;
    case "end":
      return `${who} encerrou a vez.`;
    case "stack_take":
      return `${who} comprou ${a.n} cartas e perdeu a vez.`;
    case "auto_draw":
      return `${who} não tinha carta válida e comprou automaticamente.`;
    case "nine":
      return `${target} perdeu o desafio do 9 e comprou ${a.n} carta(s)!`;
    case "draw":
      return `${who} comprou uma carta`;
    case "draw_pass":
      return `${who} comprou e passou a vez`;
    case "pass":
      return a.empty ? `Baralho vazio — ${who.toLowerCase() === "você" ? "você passou" : `${who} passou`} a vez` : `${who} passou a vez`;
    case "uno":
      return `${who} gritou UNO!`;
    case "catch":
      return `${who} pegou ${target} sem UNO! +2 cartas`;
    case "auto":
      return `${who} está desconectado — comprou e passou automaticamente`;
    case "left":
      return `${who} saiu da partida`;
    case "abandon":
      return `${who} saiu — partida encerrada`;
    default:
      return null;
  }
}