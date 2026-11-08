import { emptyInput, type Input, type Direction, type CombatCore } from '../core/combat';
import type { Skill } from '../core/config';

export class AIController {
  private nextDecision = 0;
  private observedAttack = 0;
  private reactAt = Infinity;
  private defendUntil = 0;
  private horizontal: -1 | 0 | 1 = 0;
  constructor(private random: () => number = Math.random) {}
  reset() { this.nextDecision = 0; this.observedAttack = 0; this.reactAt = Infinity; this.defendUntil = 0; this.horizontal = 0; }
  update(core: CombatCore): Input {
    const input = emptyInput();
    if (core.phase !== 'playing') return input;
    const { player: p, cpu: q } = core.fighters, now = core.elapsed, c = core.config;
    const toward: Direction = p.x >= q.x ? 1 : -1;
    if (p.skill && p.skill !== 'dodge' && p.attackId !== this.observedAttack) {
      this.observedAttack = p.attackId;
      if (this.reactAt === Infinity) this.reactAt = now + c.ai.reactionDelayMs;
    }
    if (now >= this.reactAt) {
      this.reactAt = Infinity;
      if (this.random() < c.ai.defendChance) {
        this.defendUntil = now + c.ai.decisionIntervalMs * 2;
        if (this.random() < .35) input.skills.push('dodge');
      }
    }
    if (now < this.defendUntil) { input.horizontal = -toward as Direction; return input; }
    if (now >= this.nextDecision) {
      this.nextDecision = now + c.ai.decisionIntervalMs;
      const distance = Math.abs(p.x - q.x);
      this.horizontal = distance > c.skills.punch.range - 6 ? toward : this.random() < .18 ? -toward as Direction : 0;
      if (core.canAct(q)) {
        const available: Skill[] = (['punch', 'kick', 'nineRings'] as Skill[]).filter(key =>
          now >= q.cooldown[key] && distance <= c.skills[key].range + 8);
        if (available.length && this.random() < .85) input.skills.push(available[Math.floor(this.random() * available.length)]);
      }
    }
    input.horizontal = this.horizontal;
    return input;
  }
}
