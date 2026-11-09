import type { Balance } from '../core/config';
import type { Fighter } from '../core/combat';
import manifest from '../../assets-source/shanshenbu_action_coverage_v0_3/animation_manifest.json';

export const animations = manifest.animations;
export type AnimationName = keyof typeof animations;
export const animationNames = Object.keys(animations) as AnimationName[];
export const koDuration = animations.ko.frameCount * animations.ko.frameDurationMs;

export function selectAnimation(f: Fighter, guarding: boolean): AnimationName {
  if (f.action === 'ko') return 'ko';
  if (f.action === 'hit') return 'hit';
  if (f.skill) return f.skill;
  if (f.jumpElapsed !== null) return 'jump';
  if (guarding) return 'guard';
  return f.action === 'acting' ? 'idle' : f.action;
}

export function stateFrame(name: AnimationName, elapsed: number): number {
  const spec = animations[name];
  const index = Math.floor(Math.max(0, elapsed) / spec.frameDurationMs);
  return spec.loop ? index % spec.frameCount : Math.min(spec.frameCount - 1, index);
}

// Foot-contact rows measured from the supplied frames; no bitmap edits or
// second movement/jump/knockback are added to the combat position.
const footRows: Partial<Record<AnimationName, number[]>> = {
  idle: [351, 353, 351, 349, 351, 353], walk: [351, 348, 351, 349, 351, 349],
  punch: [351, 350, 349, 351], hit: [351, 344, 340, 346, 351],
  ko: [351, 338, 327, 326, 348, 348],
};
export function frameLayout(name: AnimationName, frame: number) {
  if (name === 'kick' || name === 'nineRings') return { x: 162, y: 364, scale: 180 / 318 };
  if (name === 'dodge') return { x: 200, y: 355, scale: 180 / 332 };
  // Keep the falling silhouette inside the stage even at the existing bounds.
  return { x: name === 'ko' ? [200, 200, 172, 156, 154, 154][frame] : 200,
    y: footRows[name]?.[frame] ?? 352, scale: 180 / 326 };
}

// The supplied sheets are provisional. Sample them from combat time so pause,
// interruption and replay cannot leave an independent animation clock running.
export function actionFrame(skill: keyof Balance['skills'], elapsed: number, timing: Pick<Balance['skills']['dodge'], 'startupMs' | 'activeMs' | 'recoveryMs'>): number | null {
  const { startupMs, activeMs, recoveryMs } = timing;
  if (skill === 'nineRings') {
    if (elapsed >= startupMs + activeMs + recoveryMs) return null;
    if (elapsed < startupMs) return elapsed < startupMs / 2 ? 0 : 1;
    if (elapsed >= startupMs + activeMs) return elapsed < startupMs + activeMs + recoveryMs / 2 ? 9 : 10;
    const part = (elapsed - startupMs) / (activeMs / 3);
    const segment = Math.min(2, Math.floor(part));
    // The extended kicks (2, 5, 8) begin at the three existing hit windows.
    const recovery = Math.min(segment === 2 ? 1 : 2, Math.floor((part - segment) * 3));
    return 2 + segment * 3 + recovery;
  }
  if (skill === 'punch') {
    if (elapsed >= startupMs + activeMs + recoveryMs) return null;
    return elapsed < startupMs ? (elapsed < startupMs / 2 ? 0 : 1) : elapsed < startupMs + activeMs ? 2 : 3;
  }
  const phases = skill === 'dodge' ? [[0, 1], [2, 3, 4], [5, 6, 7]] : [[0, 1, 2], [3, 4], [5, 6]];
  if (elapsed >= startupMs + activeMs + recoveryMs * .85) return null;
  const phase = elapsed < startupMs ? 0 : elapsed < startupMs + activeMs ? 1 : 2;
  const start = phase === 0 ? 0 : phase === 1 ? startupMs : startupMs + activeMs;
  const duration = phase === 0 ? startupMs : phase === 1 ? activeMs : recoveryMs * .85;
  const frames = phases[phase];
  return frames[Math.min(frames.length - 1, Math.floor(Math.max(0, elapsed - start) / Math.max(1, duration) * frames.length))];
}
