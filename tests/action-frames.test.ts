import { test } from 'node:test';
import assert from 'node:assert/strict';
import { actionFrame, animations, frameLayout, selectAnimation, stateFrame } from '../src/view/action-frames.ts';
import { balance } from '../src/core/config.ts';
import { CombatCore } from '../src/core/combat.ts';

test('trial action frames follow the configured startup, active and recovery windows', () => {
  for (const skill of ['dodge', 'kick'] as const) {
    const timing = balance.skills[skill];
    const activeFrames = skill === 'dodge' ? [2, 3, 4] : [3, 4];
    for (let elapsed = 0; elapsed < timing.startupMs; elapsed++) {
      assert.ok(!activeFrames.includes(actionFrame(skill, elapsed, timing)!));
    }
    for (let elapsed = timing.startupMs; elapsed < timing.startupMs + timing.activeMs; elapsed++) {
      assert.ok(activeFrames.includes(actionFrame(skill, elapsed, timing)!));
    }
    assert.equal(actionFrame(skill, timing.startupMs + timing.activeMs, timing), 5);
    assert.equal(actionFrame(skill, timing.startupMs + timing.activeMs + timing.recoveryMs, timing), null);
  }
});

test('punch extension and each nine-rings strike align with the existing hit windows', () => {
  const punch = balance.skills.punch;
  assert.equal(actionFrame('punch', punch.startupMs - 1, punch), 1);
  assert.equal(actionFrame('punch', punch.startupMs, punch), 2);
  assert.equal(actionFrame('punch', punch.startupMs + punch.activeMs, punch), 3);
  const nine = balance.skills.nineRings;
  for (let segment = 0; segment < nine.hits; segment++) {
    assert.equal(actionFrame('nineRings', nine.startupMs + segment * nine.activeMs / nine.hits, nine), 2 + segment * 3);
  }
  assert.equal(actionFrame('nineRings', nine.startupMs + nine.activeMs, nine), 9);
});

test('reactions override locomotion, skills override guard, and airborne punch stays a punch', () => {
  const f = new CombatCore().fighters.player;
  assert.equal(selectAnimation(f, false), 'idle');
  f.action = 'walk'; assert.equal(selectAnimation(f, false), 'walk');
  assert.equal(selectAnimation(f, true), 'guard');
  f.action = 'crouch'; assert.equal(selectAnimation(f, false), 'crouch');
  f.jumpElapsed = 100; assert.equal(selectAnimation(f, true), 'jump');
  f.skill = 'punch'; assert.equal(selectAnimation(f, true), 'punch');
  f.action = 'hit'; assert.equal(selectAnimation(f, true), 'hit');
  f.action = 'ko'; assert.equal(selectAnimation(f, true), 'ko');
});

test('looping states wrap; crouch and KO hold their last frame with valid foot anchors', () => {
  for (const name of Object.keys(animations) as (keyof typeof animations)[]) {
    const spec = animations[name];
    assert.equal(stateFrame(name, 0), 0);
    assert.equal(stateFrame(name, spec.frameCount * spec.frameDurationMs), spec.loop ? 0 : spec.frameCount - 1);
    for (let i = 0; i < spec.frameCount; i++) {
      const { x, y, scale } = frameLayout(name, i);
      assert.ok(x > 0 && x < 400 && y > 0 && y <= 370 && scale > .5 && scale < .6);
    }
  }
});

test('replay restarts at frame zero; sampling a paused action is deterministic', () => {
  const timing = balance.skills.kick;
  const first = actionFrame('kick', timing.startupMs + 30, timing);
  actionFrame('kick', timing.startupMs + timing.activeMs + timing.recoveryMs, timing);
  assert.equal(actionFrame('kick', 0, timing), 0);
  assert.equal(actionFrame('kick', timing.startupMs + 30, timing), first);
});
