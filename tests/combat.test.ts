import test from 'node:test';
import assert from 'node:assert/strict';
import { CombatCore, emptyInput, STEP, type Input, type CombatEvent } from '../src/core/combat';
import { balance, validateBalance, type Skill } from '../src/core/config';
import { AIController } from '../src/ai/controller';
const input = (changes: Partial<Input> = {}): Input => ({ ...emptyInput(), ...changes });
const skill = (key: Skill) => input({ skills: [key] });
function close(distance = 60, config = structuredClone(balance)) {
  const core = new CombatCore(config); core.fighters.player.x = 400; core.fighters.cpu.x = 400 + distance; return core;
}
function run(core: CombatCore, ms: number, p = emptyInput(), q = emptyInput()) {
  const events: CombatEvent[] = [];
  for (let t = 0; t < ms; t += STEP) events.push(...core.step(p, q));
  return events;
}

test('ready remains frozen; first input both starts and acts', () => {
  const core = new CombatCore();
  run(core, 1000, emptyInput(), skill('kick'));
  assert.equal(core.phase, 'ready'); assert.equal(core.elapsed, 0);
  const x = core.fighters.player.x;
  const events = core.step(input({ horizontal: 1 }));
  assert.equal(core.phase, 'playing'); assert.ok(core.fighters.player.x > x); assert.ok(events.some(e => e.type === 'round-start'));
  const other = close(); other.step(skill('kick')); assert.equal(other.fighters.player.skill, 'kick');
});

test('attacks out of range miss, in range one segment only damages once', () => {
  const far = close(200); far.step(skill('punch')); run(far, 300); assert.equal(far.fighters.cpu.hp, 100);
  const core = close(); core.step(skill('punch'));
  const hits = run(core, 300).filter(e => e.type === 'hit');
  assert.equal(core.fighters.cpu.hp, 95); assert.equal(hits.length, 1);
});

test('guard requires normal ground state, backward direction; chip uses integer rounding', () => {
  const core = close(); core.step(skill('kick'), input({ down: true, horizontal: 1 }));
  run(core, 300, emptyInput(), input({ down: true, horizontal: 1 }));
  assert.equal(core.fighters.cpu.hp, 97);
  const attacking = close(); attacking.step(skill('kick'), input({ skills: ['nineRings'], horizontal: 1 }));
  run(attacking, 165, emptyInput(), input({ horizontal: 1 }));
  assert.equal(attacking.fighters.cpu.hp, 85); // startup cannot guard
  const stunned = close(); stunned.fighters.cpu.stun = 500;
  stunned.step(skill('punch'), input({ horizontal: 1 })); run(stunned, 100, emptyInput(), input({ horizontal: 1 }));
  assert.equal(stunned.fighters.cpu.hp, 95);
});

test('dodge is invulnerable only inside active window', () => {
  const config = structuredClone(balance); config.skills.dodge.travelDistance = 0;
  const core = close(60, config); core.step(skill('punch'), skill('dodge')); run(core, 160);
  assert.equal(core.fighters.cpu.hp, 100);
  const startup = close(60, config); startup.step(skill('punch')); run(startup, 34);
  startup.step(emptyInput(), skill('dodge')); run(startup, 17);
  assert.equal(startup.fighters.cpu.hp, 95);
  const recovery = close(60, config); recovery.step(input({ down: true }), skill('dodge')); run(recovery, 210);
  recovery.step(skill('punch'), input({ horizontal: 1 })); run(recovery, 100, emptyInput(), input({ horizontal: 1 }));
  assert.equal(recovery.fighters.cpu.hp, 95);
});

test('dodge direction stays fixed through side change; default forward and explicit backward', () => {
  const core = close(); core.step(skill('dodge')); run(core, 400);
  assert.ok(Math.abs(core.fighters.player.x - 540) < .001);
  assert.equal(core.fighters.player.facing, -1); assert.equal(core.fighters.cpu.facing, 1);
  const back = close(); back.step(input({ skills: ['dodge'], horizontal: -1 })); run(back, 400);
  assert.ok(Math.abs(back.fighters.player.x - 260) < .001);
});

test('locked attack cannot reverse to track a crossing opponent', () => {
  const core = close(); core.step(skill('kick'), input({ skills: ['dodge'], horizontal: -1 }));
  run(core, 200);
  assert.equal(core.fighters.player.facing, 1); assert.equal(core.fighters.cpu.hp, 100);
  run(core, 300); assert.equal(core.fighters.player.facing, -1);
});

test('nine rings deals at most 3 hits, only final segment knocks back', () => {
  const core = close(); core.step(skill('nineRings'));
  run(core, 200); assert.equal(core.fighters.cpu.hp, 92); assert.equal(core.fighters.cpu.x, 460);
  run(core, 160); assert.equal(core.fighters.cpu.hp, 84); assert.equal(core.fighters.cpu.x, 460);
  run(core, 300); assert.equal(core.fighters.cpu.hp, 76); assert.equal(core.fighters.cpu.x, 490);
  run(core, 500); assert.equal(core.fighters.cpu.hp, 76);
});

test('nine rings missing its final segment does not transfer knockback to an earlier hit', () => {
  const core = close(); core.step(skill('nineRings')); run(core, 200);
  assert.equal(core.fighters.cpu.x, 460); core.fighters.cpu.x = 700;
  run(core, 600); assert.equal(core.fighters.cpu.hp, 92); assert.equal(core.fighters.cpu.x, 700);
});

test('same-tick attacks trade and simultaneous KO is a draw', () => {
  const core = close(); core.fighters.player.hp = core.fighters.cpu.hp = 5;
  core.step(skill('punch'), skill('punch'));
  const events = run(core, 100);
  assert.equal(core.fighters.player.hp, 0); assert.equal(core.fighters.cpu.hp, 0);
  assert.equal(core.winner, 'draw'); assert.equal(core.phase, 'result');
  assert.equal(events.filter(e => e.type === 'hit').length, 2);
  assert.deepEqual(core.step(skill('kick'), skill('kick')), []);
});

test('action locks, legal input order and cooldown prevent duplicate starts', () => {
  const core = close(); const e = core.step(input({ skills: ['kick', 'nineRings'] }));
  assert.equal(e.filter(e => e.type === 'action-start').length, 1);
  assert.equal(core.fighters.player.skill, 'kick'); assert.equal(core.fighters.player.cooldown.nineRings, 0);
  assert.equal(run(core, 450, skill('kick')).filter(e => e.type === 'action-start').length, 0);
  core.step(skill('kick')); assert.equal(core.fighters.player.skill, null);
  run(core, 210); assert.ok(core.step(skill('kick')).some(e => e.type === 'action-start'));
});

test('jump supports air punch, rejects ground specials without consuming cooldown', () => {
  const core = close(180); core.step(input({ up: true }));
  assert.ok(core.fighters.player.height > 0);
  core.step(skill('kick')); assert.equal(core.fighters.player.skill, null); assert.equal(core.fighters.player.cooldown.kick, 0);
  core.step(skill('punch')); assert.equal(core.fighters.player.skill, 'punch');
  run(core, 700); assert.equal(core.fighters.player.height, 0);
});

test('walk collision, jump-over, boundaries and implemented switches', () => {
  const core = close(); run(core, 1000, input({ horizontal: 1 }));
  assert.ok(core.fighters.cpu.x - core.fighters.player.x >= 59.99);
  const jump = close(90); jump.step(input({ up: true, horizontal: 1 })); run(jump, 650, input({ horizontal: 1 }));
  assert.ok(jump.fighters.player.x > jump.fighters.cpu.x); assert.equal(jump.fighters.player.facing, -1);
  assert.ok(Math.abs(jump.fighters.player.x - jump.fighters.cpu.x) >= 59.99);
  run(jump, 4000, input({ horizontal: 1 })); assert.equal(jump.fighters.player.x, balance.arena.rightBound);
  const config = structuredClone(balance); config.rules.walkThrough = true;
  const through = close(60, config); run(through, 700, input({ horizontal: 1 })); assert.ok(through.fighters.player.x > through.fighters.cpu.x);
  config.rules.walkThrough = false; config.rules.dodgeThrough = false;
  const noDodge = close(60, config); noDodge.step(skill('dodge')); run(noDodge, 400); assert.ok(noDodge.fighters.player.x < noDodge.fighters.cpu.x);
  config.rules.jumpOver = false;
  const noJump = close(60, config); noJump.step(input({ up: true, horizontal: 1 })); run(noJump, 700, input({ horizontal: 1 })); assert.ok(noJump.fighters.player.x < noJump.fighters.cpu.x);
});

test('pause freezes all simulation; reset fully clears a played round', () => {
  const core = close(); core.step(skill('nineRings')); run(core, 100); core.pause();
  const frozen = JSON.stringify(core.snapshot()); run(core, 2000, skill('kick'), skill('kick'));
  assert.equal(JSON.stringify(core.snapshot()), frozen);
  core.resume(); core.step(); assert.ok(core.elapsed > 100);
  core.reset(); const clean = new CombatCore(); assert.deepEqual(core.snapshot(), clean.snapshot());
});

test('time limit compares remaining health and ties draw', () => {
  const config = structuredClone(balance); config.match.durationSeconds = .1;
  const core = close(250, config); core.fighters.player.hp = 50;
  run(core, 200, input({ down: true })); assert.equal(core.winner, 'cpu');
  const tie = close(250, config); run(tie, 200, input({ down: true })); assert.equal(tie.winner, 'draw');
});

test('config edits affect actual damage; invalid config reports its source', () => {
  const config = structuredClone(balance); config.skills.punch.damage = 17;
  const core = close(60, config); core.step(skill('punch')); run(core, 180); assert.equal(core.fighters.cpu.hp, 83);
  config.skills.punch.startupMs = -1; assert.throws(() => validateBalance(config), /balance.json.*startupMs/);
  assert.throws(() => validateBalance({}), /balance.json/);
});

test('AI waits for start and only reacts after configured delay', () => {
  const core = close(250); const ai = new AIController(() => 0);
  assert.deepEqual(ai.update(core), emptyInput());
  core.step(skill('nineRings'));
  assert.equal(ai.update(core).horizontal, -1);
  run(core, 200); assert.equal(ai.update(core).horizontal, -1);
  run(core, 100); assert.equal(ai.update(core).horizontal, 1);
  ai.reset(); core.reset(); assert.deepEqual(ai.update(core), emptyInput());
});
