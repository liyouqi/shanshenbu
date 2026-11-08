import { balance, validateBalance, type Balance, type Skill } from './config';

export const STEP = 1000 / 60;
export type Id = 'player' | 'cpu';
export type Direction = -1 | 1;
export type Phase = 'ready' | 'playing' | 'paused' | 'result';
export type Input = { horizontal: -1 | 0 | 1; up: boolean; down: boolean; skills: Skill[] };
export const emptyInput = (): Input => ({ horizontal: 0, up: false, down: false, skills: [] });
export type Action = 'idle' | 'walk' | 'crouch' | 'jump' | 'acting' | 'hit' | 'ko';
export type Fighter = {
  id: Id; x: number; height: number; facing: Direction; hp: number;
  action: Action; skill: Skill | null; elapsed: number; jumpElapsed: number | null;
  direction: Direction; attackId: number; resolved: Set<number>;
  cooldown: Record<Skill, number>; stun: number; input: Input;
};
export type CombatEvent =
  | { type: 'action-start'; fighter: Id; skill: Skill }
  | { type: 'hit' | 'blocked' | 'evaded'; attacker: Id; defender: Id; damage: number }
  | { type: 'jump' | 'land'; fighter: Id }
  | { type: 'round-start' }
  | { type: 'round-end'; winner: Id | 'draw' };
const opposite = (id: Id): Id => id === 'player' ? 'cpu' : 'player';
const sign = (x: number, fallback: Direction = 1): Direction => x === 0 ? fallback : x > 0 ? 1 : -1;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export class CombatCore {
  readonly config: Balance;
  fighters!: Record<Id, Fighter>;
  phase: Phase = 'ready';
  elapsed = 0;
  winner: Id | 'draw' | null = null;
  private resumePhase: 'ready' | 'playing' = 'ready';
  private serial = 0;
  constructor(config: Balance = balance) { validateBalance(config); this.config = structuredClone(config); this.reset(); }
  reset() {
    const c = this.config;
    const fighter = (id: Id, ratio: number, facing: Direction): Fighter => ({
      id, x: c.arena.leftBound + (c.arena.rightBound - c.arena.leftBound) * ratio,
      height: 0, facing, hp: c.match.maxHp, action: 'idle', skill: null,
      elapsed: 0, jumpElapsed: null, direction: facing, attackId: 0,
      resolved: new Set(), cooldown: { punch: 0, dodge: 0, kick: 0, nineRings: 0 }, stun: 0, input: emptyInput(),
    });
    this.fighters = { player: fighter('player', .30, 1), cpu: fighter('cpu', .70, -1) };
    this.phase = 'ready'; this.elapsed = 0; this.winner = null; this.serial = 0; this.resumePhase = 'ready';
  }
  pause() {
    if (this.phase !== 'ready' && this.phase !== 'playing') return;
    this.resumePhase = this.phase; this.phase = 'paused';
    for (const f of Object.values(this.fighters)) f.input = emptyInput();
  }
  resume() { if (this.phase === 'paused') this.phase = this.resumePhase; }
  get secondsLeft() { return Math.max(0, this.config.match.durationSeconds - this.elapsed / 1000); }
  duration(skill: Skill) { const s = this.config.skills[skill]; return s.startupMs + s.activeMs + s.recoveryMs; }
  canAct(f: Fighter) { return f.hp > 0 && f.stun <= 0 && f.skill === null; }
  private face() {
    for (const f of Object.values(this.fighters)) {
      if (f.skill && f.skill !== 'dodge') continue;
      f.facing = sign(this.fighters[opposite(f.id)].x - f.x, f.facing);
    }
  }
  private begin(f: Fighter, key: Skill, events: CombatEvent[]) {
    if (!this.canAct(f) || this.elapsed + .001 < f.cooldown[key]) return false;
    if (f.jumpElapsed !== null && (key !== 'punch' || !this.config.rules.airPunch)) return false;
    f.skill = key; f.action = 'acting'; f.elapsed = 0; f.resolved.clear(); f.attackId = ++this.serial;
    f.direction = key === 'dodge' ? (f.input.horizontal || sign(this.fighters[opposite(f.id)].x - f.x, f.facing)) : f.facing;
    f.cooldown[key] = this.elapsed + this.config.skills[key].cooldownMs;
    events.push({ type: 'action-start', fighter: f.id, skill: key });
    return true;
  }
  private advance(f: Fighter, dt: number, events: CombatEvent[]) {
    const c = this.config;
    f.stun = Math.max(0, f.stun - dt);
    if (f.skill && f.elapsed + .001 >= this.duration(f.skill)) { f.skill = null; f.elapsed = 0; }
    if (!f.skill) f.facing = sign(this.fighters[opposite(f.id)].x - f.x, f.facing);
    if (this.canAct(f)) {
      for (const key of f.input.skills) if (this.begin(f, key, events)) break;
      if (!f.skill && f.input.up && f.jumpElapsed === null) {
        f.jumpElapsed = 0; events.push({ type: 'jump', fighter: f.id });
      }
    }
    if (f.jumpElapsed !== null) {
      f.jumpElapsed += dt;
      const t = Math.min(1, f.jumpElapsed / c.movement.jumpDurationMs);
      f.height = 4 * c.movement.jumpHeight * t * (1 - t);
      if (t >= 1) { f.jumpElapsed = null; f.height = 0; events.push({ type: 'land', fighter: f.id }); }
    }
    if (f.skill) {
      const prev = f.elapsed; f.elapsed += dt;
      if (f.skill === 'dodge') {
        const s = c.skills.dodge;
        const activeDelta = clamp(f.elapsed - s.startupMs, 0, s.activeMs) - clamp(prev - s.startupMs, 0, s.activeMs);
        f.x += f.direction * s.travelDistance * activeDelta / s.activeMs;
      } else if (f.jumpElapsed !== null && f.stun <= 0) f.x += f.input.horizontal * c.movement.walkSpeed * dt / 1000;
      f.action = 'acting';
    } else if (f.stun > 0) f.action = 'hit';
    else {
      const inAir = f.jumpElapsed !== null;
      if (inAir || !f.input.down) f.x += f.input.horizontal * c.movement.walkSpeed * dt / 1000;
      f.action = inAir ? 'jump' : f.input.down ? 'crouch' : f.input.horizontal ? 'walk' : 'idle';
    }
    f.x = clamp(f.x, c.arena.leftBound, c.arena.rightBound);
  }
  private separate(previousOrder: Direction) {
    const c = this.config, p = this.fighters.player, q = this.fighters.cpu;
    if (c.rules.walkThrough || (c.rules.dodgeThrough && (p.skill === 'dodge' || q.skill === 'dodge')) ||
      (c.rules.jumpOver && Math.abs(p.height - q.height) >= c.movement.jumpPassHeight)) return;
    const gap = c.movement.collisionHalfWidth * 2;
    // Previous positions retain a completed jump-over while preventing ground tunnelling.
    const order = previousOrder;
    if ((q.x - p.x) * order >= gap) return;
    const middle = clamp((p.x + q.x) / 2, c.arena.leftBound + gap / 2, c.arena.rightBound - gap / 2);
    p.x = middle - order * gap / 2; q.x = middle + order * gap / 2;
  }
  step(player: Input = emptyInput(), cpu: Input = emptyInput(), dt = STEP): CombatEvent[] {
    const events: CombatEvent[] = [];
    if (this.phase === 'paused' || this.phase === 'result') return events;
    if (this.phase === 'ready') {
      if (!player.horizontal && !player.up && !player.down && !player.skills.length) return events;
      this.phase = 'playing'; events.push({ type: 'round-start' });
    }
    // The host feeds fixed steps. Never advance an arbitrary background delta.
    dt = Math.min(STEP, Math.max(0, dt));
    if (dt === 0) return events;
    const p = this.fighters.player, q = this.fighters.cpu;
    const previousOrder = sign(q.x - p.x);
    p.input = player; q.input = cpu;
    this.face();
    this.advance(p, dt, events); this.advance(q, dt, events);
    this.separate(previousOrder); this.face();
    type Result = { attacker: Fighter; defender: Fighter; type: 'hit' | 'blocked' | 'evaded'; damage: number; knockback: number; direction: Direction };
    const results: Result[] = [];
    for (const a of [p, q]) {
      if (!a.skill || a.skill === 'dodge') continue;
      const d = this.fighters[opposite(a.id)], s = this.config.skills[a.skill];
      const t = a.elapsed - s.startupMs;
      if (t < 0 || t >= s.activeMs) continue;
      const segment = Math.min(s.hits - 1, Math.floor(t / (s.activeMs / s.hits)));
      if (a.resolved.has(segment)) continue;
      const distance = (d.x - a.x) * a.direction;
      if (distance < 0 || distance > s.range || Math.abs(a.height - d.height) > this.config.movement.jumpPassHeight) continue;
      a.resolved.add(segment);
      const dodge = this.config.skills.dodge;
      const evading = d.skill === 'dodge' && d.elapsed >= dodge.startupMs && d.elapsed < dodge.startupMs + dodge.invulnerableMs;
      const guarded = !evading && this.canAct(d) && d.jumpElapsed === null && d.input.horizontal === -sign(a.x - d.x, d.facing);
      const type = evading ? 'evaded' : guarded ? 'blocked' : 'hit';
      results.push({ attacker: a, defender: d, type,
        damage: evading ? 0 : guarded ? Math.round(s.damage * this.config.rules.guardChipRatio) : s.damage,
        knockback: type !== 'hit' || (a.skill === 'nineRings' && segment !== s.hits - 1) ? 0 : s.knockback,
        direction: a.direction });
    }
    for (const r of results) {
      const d = r.defender;
      d.hp = Math.max(0, d.hp - r.damage);
      if (r.type === 'hit') {
        d.x = clamp(d.x + r.direction * r.knockback, this.config.arena.leftBound, this.config.arena.rightBound);
        d.stun = this.config.combat.hitStunMs; d.skill = null; d.elapsed = 0; d.action = 'hit';
      }
      events.push({ type: r.type, attacker: r.attacker.id, defender: d.id, damage: r.damage });
    }
    this.face(); this.elapsed += dt;
    if (p.hp === 0 || q.hp === 0 || this.secondsLeft <= 0) {
      this.winner = p.hp === q.hp ? 'draw' : p.hp > q.hp ? 'player' : 'cpu';
      this.phase = 'result';
      for (const f of [p, q]) { f.skill = null; f.input = emptyInput(); if (!f.hp) f.action = 'ko'; }
      events.push({ type: 'round-end', winner: this.winner });
    }
    return events;
  }
  snapshot() {
    return { phase: this.phase, elapsed: this.elapsed, winner: this.winner,
      fighters: Object.fromEntries(Object.entries(this.fighters).map(([id, f]) => [id, { ...f, resolved: [...f.resolved] }])) };
  }
}
