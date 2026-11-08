import type { Fighter } from '../core/combat';

// Only presentation values are retained; this never writes to combat state.
export type VisualSample = Pick<Fighter, 'x' | 'height' | 'elapsed' | 'skill' | 'attackId' | 'action'>;
export function captureVisual(fighter: Fighter): VisualSample {
  const { x, height, elapsed, skill, attackId, action } = fighter;
  return { x, height, elapsed, skill, attackId, action };
}
export function interpolateVisual(previous: VisualSample, current: VisualSample, fraction: number) {
  const alpha = Math.max(0, Math.min(1, fraction));
  const sameAction = previous.action === current.action && previous.skill === current.skill && previous.attackId === current.attackId;
  return {
    x: previous.x + (current.x - previous.x) * alpha,
    height: previous.height + (current.height - previous.height) * alpha,
    // A newly accepted/interrupted action is visible immediately; don't blend unrelated clocks.
    elapsed: sameAction ? previous.elapsed + (current.elapsed - previous.elapsed) * alpha : current.elapsed,
  };
}
