import initial from '../../config/balance.json';

export type Balance = typeof initial;
export type Skill = keyof Balance['skills'];
export const skillNames: Skill[] = ['punch', 'dodge', 'kick', 'nineRings'];

export function validateBalance(value: unknown): asserts value is Balance {
  const fail = (path: string) => { throw new Error(`balance.json 配置无效：${path}`); };
  const check = (v: unknown, reference: unknown, path: string): void => {
    if (typeof reference === 'number') {
      if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) fail(`${path} 必须为非负有限数值`);
    } else if (typeof reference === 'boolean') {
      if (typeof v !== 'boolean') fail(`${path} 必须为布尔值`);
    } else {
      if (!v || typeof v !== 'object') fail(`${path} 缺少对象`);
      for (const [key, ref] of Object.entries(reference as object)) check((v as Record<string, unknown>)[key], ref, `${path}.${key}`);
    }
  };
  check(value, initial, 'root');
  const c = value as Balance;
  if (c.match.maxHp <= 0 || !Number.isInteger(c.match.maxHp) || c.match.durationSeconds <= 0) fail('match 血量须为正整数，局长须大于0');
  if (c.arena.width <= 0 || c.arena.height <= 0 || c.arena.leftBound >= c.arena.rightBound || c.arena.rightBound > c.arena.width || c.arena.groundY > c.arena.height) fail('arena 边界不合理');
  if (c.movement.jumpDurationMs <= 0 || c.movement.collisionHalfWidth <= 0 || c.movement.collisionHalfWidth * 2 >= c.arena.rightBound - c.arena.leftBound || c.movement.jumpPassHeight > c.movement.jumpHeight) fail('movement 跳跃或碰撞范围不合理');
  if (c.rules.guardChipRatio > 1 || c.ai.defendChance > 1 || c.ai.decisionIntervalMs <= 0) fail('rules/ai 比例应在0–1内，决策间隔须大于0');
  for (const key of skillNames) {
    const s = c.skills[key];
    if (!Number.isInteger(s.damage) || !Number.isInteger(s.hits) || s.startupMs + s.activeMs + s.recoveryMs <= 0) fail(`skills.${key} 伤害/段数须为整数，动作须有时长`);
    if (key !== 'dodge' && (s.hits < 1 || s.activeMs / s.hits < 1000 / 60)) fail(`skills.${key} 每段有效期至少一个逻辑步`);
  }
  if (c.skills.dodge.activeMs <= 0 || c.skills.dodge.invulnerableMs > c.skills.dodge.activeMs || c.skills.dodge.hits !== 0) fail('skills.dodge 躲避窗口须在有效期内且无攻击段');
}
validateBalance(initial);
export const balance: Balance = initial;
