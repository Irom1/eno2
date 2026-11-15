/** Keep trackpad movement proportional, with a little resistance and hard end stops. */
export function accountWheelPosition(current: number, delta: number, count: number): number {
  if (!Number.isFinite(delta)) return current;
  return Math.max(0, Math.min(Math.max(0, count - 1) * 76, current + delta * 0.35));
}
