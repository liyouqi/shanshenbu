import test from 'node:test';
import assert from 'node:assert/strict';
import { CombatCore, STEP, emptyInput } from '../src/core/combat';
import { captureVisual, interpolateVisual } from '../src/view/interpolation';

test('120 Hz display samples move evenly between 60 Hz combat positions without changing core', () => {
  const core = new CombatCore();
  const previous = captureVisual(core.fighters.player);
  core.step({ ...emptyInput(), horizontal: 1 });
  const current = core.fighters.player;
  const before = JSON.stringify(core.snapshot());
  const start = interpolateVisual(previous, current, 0);
  const middle = interpolateVisual(previous, current, .5);
  const end = interpolateVisual(previous, current, 1);
  assert.ok(start.x < middle.x && middle.x < end.x);
  assert.ok(Math.abs((middle.x - start.x) - (end.x - middle.x)) < 1e-9);
  assert.equal(end.x, current.x);
  assert.equal(core.elapsed, STEP);
  assert.equal(JSON.stringify(core.snapshot()), before);
});

test('jump height interpolates; pause/reset samples neither overshoot nor rewind', () => {
  const core = new CombatCore();
  const previous = captureVisual(core.fighters.player);
  core.step({ ...emptyInput(), up: true });
  const current = captureVisual(core.fighters.player);
  assert.equal(interpolateVisual(previous, current, .5).height, current.height / 2);
  assert.equal(interpolateVisual(previous, current, -1).height, previous.height);
  assert.equal(interpolateVisual(previous, current, 2).height, current.height);
  core.pause();
  const frozen = captureVisual(core.fighters.player);
  assert.equal(interpolateVisual(frozen, frozen, .2).height, frozen.height);
  core.reset();
  const reset = captureVisual(core.fighters.player);
  assert.equal(interpolateVisual(reset, reset, .5).height, 0);
});

test('new, completed and interrupted skills never inherit another action clock', () => {
  const core = new CombatCore();
  const idle = captureVisual(core.fighters.player);
  core.step({ ...emptyInput(), skills: ['kick'] });
  const kick = captureVisual(core.fighters.player);
  assert.equal(interpolateVisual(idle, kick, 0).elapsed, kick.elapsed);
  const hit = { ...kick, skill: null, action: 'hit' as const, elapsed: 0 };
  assert.equal(interpolateVisual(kick, hit, .5).elapsed, 0);
  const nextKick = { ...kick, attackId: kick.attackId + 1 };
  assert.equal(interpolateVisual({ ...kick, elapsed: 400 }, nextKick, .5).elapsed, nextKick.elapsed);
});
