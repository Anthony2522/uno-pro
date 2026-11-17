/** Render at a bounded pixel budget on high-DPI phones and 4K desktops.
 * The world is deliberately pixel-art; super-sampling at 3x DPR wastes GPU time.
 * Keep this helper independent of browser globals for deterministic tests. */
export function crazyPixelRatio(width: number, height: number, deviceDpr: number): number {
  const pixels = Math.max(1, width) * Math.max(1, height);
  const budgetDpr = Math.sqrt(2_000_000 / pixels);
  return Math.max(.5, Math.min(1.35, Math.max(1, deviceDpr || 1), budgetDpr));
}

/** 14ms minimum between frames: smooth at ~60 Hz, throttles 120/144/240 Hz displays. */
export const CRAZY_MIN_FRAME_MS = 14;
export function crazyShouldRender(now: number, previous: number): boolean {
  return previous===0 || now-previous >= CRAZY_MIN_FRAME_MS;
}

/** The camera may own the mouse only during a live round with a living player. */
export function crazyMustUnlockCursor(status: string, hp: number): boolean {
  return status !== "playing" || hp <= 0;
}
