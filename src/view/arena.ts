import Phaser from 'phaser';
import { type CombatCore, type Fighter, type CombatEvent, type Phase } from '../core/combat';
import { calls } from '../audio/feedback';
import type { Balance } from '../core/config';
import { actionFrame, animations, frameLayout, koDuration, selectAnimation, stateFrame, type AnimationName } from './action-frames';
import { captureVisual, interpolateVisual, type VisualSample } from './interpolation';
const INK = 0x292d2b;

// Frame timing is presentation-only. World position and facing always come
// from Combat Core; the sheets provide the pose, not another movement track.
export class CharacterView {
  private guardingUntil = 0;
  private hitAt = 0;
  private state: AnimationName | null = null;
  private renderedAnimation: AnimationName = 'idle';
  private stateSince = 0;
  private frame = 0;
  private body: Phaser.GameObjects.Image;
  private shadow: Phaser.GameObjects.Ellipse;
  private marker: Phaser.GameObjects.Text;
  guard(until: number) { this.guardingUntil = until; }
  hit(now: number) { this.hitAt = now; }
  reset() { this.guardingUntil = 0; this.hitAt = 0; this.state = null; this.stateSince = 0; }
  constructor(scene: Phaser.Scene, color: number, private ground: number, private config: Balance, label: string) {
    this.shadow = scene.add.ellipse(0, ground + 2, 52, 9, INK, .16);
    this.body = scene.add.image(0, ground, 'teacher-idle').setOrigin(.5, 1);
    this.marker = scene.add.text(0, 0, label, {
      fontFamily: 'sans-serif', fontSize: '13px', fontStyle: 'bold',
      color: '#ffffff', backgroundColor: `#${color.toString(16).padStart(6, '0')}`,
      padding: { x: 6, y: 2 },
    }).setOrigin(.5).setDepth(5);
  }
  snapshot() {
    return { animation: this.renderedAnimation, frame: this.frame, texture: this.body.texture.key,
      x: this.body.x, y: this.body.y, scaleX: this.body.scaleX, scaleY: this.body.scaleY,
      flipX: this.body.flipX, originX: this.body.originX, originY: this.body.originY };
  }
  render(f: Fighter, now: number, pose: ReturnType<typeof interpolateVisual>, phase: Phase) {
    const canGuard = !f.skill && f.stun <= 0 && f.jumpElapsed === null && f.hp > 0;
    const guarding = canGuard && (f.input.horizontal === -f.facing || now < this.guardingUntil);
    let name = phase === 'result' && f.action !== 'ko' ? 'idle' : selectAnimation(f, guarding);
    if (name !== this.state) { this.stateSince = now; this.state = name; }
    const elapsed = Math.max(0, now - this.stateSince);
    let frame = stateFrame(name, elapsed);
    if (f.skill && phase !== 'result') {
      const sampled = actionFrame(f.skill, pose.elapsed, this.config.skills[f.skill]);
      if (sampled === null) { name = 'idle'; frame = 0; }
      else frame = sampled;
    } else if (name === 'jump') {
      frame = Math.min(2, Math.floor((f.jumpElapsed ?? 0) / this.config.movement.jumpDurationMs * 3));
    } else if (name === 'hit') {
      frame = Math.min(animations.hit.frameCount - 1,
        Math.floor(Math.max(0, now - this.hitAt) / this.config.combat.hitStunMs * animations.hit.frameCount));
    }
    this.frame = frame;
    this.renderedAnimation = name;
    const layout = frameLayout(name, frame);
    const originX = layout.x / 400;
    const flipped = f.facing === -1;
    const height = name === 'ko' ? pose.height * Math.max(0, 1 - elapsed / koDuration) : pose.height;
    this.body.setTexture(name === 'nineRings' ? `teacher-nineRings-${frame}` : `teacher-${name}`, name === 'nineRings' ? undefined : frame)
      .setOrigin(flipped ? 1 - originX : originX, layout.y / 370)
      .setScale(layout.scale).setFlipX(flipped).setPosition(pose.x, this.ground - height);
    this.shadow.setPosition(pose.x, this.ground + 2).setScale(Math.max(.35, 1 - height / 350));
    this.marker.setPosition(pose.x, this.ground - height - 202).setVisible(name !== 'ko');
  }
}

type Effect = { at: number; duration: number; x: number; y: number; label: Phaser.GameObjects.Text; type: string };
export class ArenaView {
  private player: CharacterView;
  private cpu: CharacterView;
  private effects: Effect[] = [];
  private ink: Phaser.GameObjects.Graphics;
  private previous!: Record<'player' | 'cpu', VisualSample>;
  private lastRenderTime = -1;
  private visualTime = 0;
  private roundEndAt: number | null = null;
  constructor(private scene: Phaser.Scene, private core: CombatCore) {
    const c = core.config.arena, w = c.width, h = c.height, ground = c.groundY;
    const stage = scene.add.image(w / 2, h / 2, 'studio-blue');
    stage.setScale(Math.min(w / stage.width, h / stage.height));
    this.player = new CharacterView(scene, 0xd45443, ground, core.config, '1P');
    this.cpu = new CharacterView(scene, 0x2864be, ground, core.config, 'CPU');
    this.ink = scene.add.graphics().setDepth(10);
    this.capture();
  }
  capture() {
    this.previous = { player: captureVisual(this.core.fighters.player), cpu: captureVisual(this.core.fighters.cpu) };
  }
  get resultReady() {
    return this.core.phase === 'result' && (this.roundEndAt === null ||
      !Object.values(this.core.fighters).some(f => f.action === 'ko') || this.visualTime - this.roundEndAt >= koDuration);
  }
  snapshot() { return { time: this.visualTime, resultReady: this.resultReady, player: this.player.snapshot(), cpu: this.cpu.snapshot() }; }
  clear() {
    this.capture(); this.lastRenderTime = -1; this.visualTime = 0; this.roundEndAt = null;
    this.player.reset(); this.cpu.reset();
    for (const e of this.effects) e.label.destroy();
    this.effects = []; this.ink.clear();
  }
  events(events: CombatEvent[]) {
    for (const e of events) {
      if (e.type === 'blocked') this[e.defender].guard(this.visualTime + 160);
      if (e.type === 'hit') this[e.defender].hit(this.visualTime);
      if (e.type === 'round-end') this.roundEndAt = this.visualTime;
      let text = '', type: string = e.type, x = 0, y = 0;
      if (e.type === 'action-start') {
        const f = this.core.fighters[e.fighter]; text = calls[e.skill]; x = f.x; y = this.core.config.arena.groundY - f.height - 232;
      } else if (e.type === 'hit' || e.type === 'blocked' || e.type === 'evaded') {
        const f = this.core.fighters[e.defender];
        text = e.type === 'hit' ? `−${e.damage}` : e.type === 'blocked' ? `挡住 −${e.damage}` : '闪开！';
        x = f.x; y = this.core.config.arena.groundY - f.height - 110;
      }
      if (!text) continue;
      const label = this.scene.add.text(x, y, text, {
        fontFamily: 'sans-serif', fontSize: type === 'action-start' ? '24px' : '25px', fontStyle: 'bold',
        color: type === 'hit' ? '#b0442d' : type === 'blocked' ? '#2864be' : '#18375d', stroke: '#ffffff', strokeThickness: 5,
      }).setOrigin(.5).setDepth(12);
      this.effects.push({ at: this.visualTime, duration: type === 'action-start' ? 650 : 480, x, y, label, type });
    }
  }
  render(fraction = 1, delta = 0) {
    if (this.core.phase !== 'paused') this.visualTime += Math.min(50, Math.max(0, delta));
    const alpha = Math.max(0, Math.min(1, fraction));
    const now = this.visualTime;
    if (now === this.lastRenderTime) return;
    this.lastRenderTime = now;
    const poses = {
      player: interpolateVisual(this.previous.player, this.core.fighters.player, alpha),
      cpu: interpolateVisual(this.previous.cpu, this.core.fighters.cpu, alpha),
    };
    this.player.render(this.core.fighters.player, now, poses.player, this.core.phase);
    this.cpu.render(this.core.fighters.cpu, now, poses.cpu, this.core.phase);
    const g = this.ink.clear();
    for (const f of Object.values(this.core.fighters)) {
      const pose = poses[f.id];
      if (f.skill === 'dodge' && pose.elapsed >= this.core.config.skills.dodge.startupMs && pose.elapsed < this.core.config.skills.dodge.startupMs + this.core.config.skills.dodge.activeMs) {
        g.lineStyle(4, f.id === 'player' ? 0xffd34d : 0xaad8ff, .4);
        for (let i = 0; i < 4; i++) g.lineBetween(pose.x - f.direction * (35 + i * 7), this.core.config.arena.groundY - 35 - i * 22, pose.x - f.direction * (90 + i * 10), this.core.config.arena.groundY - 35 - i * 22);
      }
    }
    this.effects = this.effects.filter(e => {
      const t = Math.max(0, now - e.at) / e.duration;
      if (t >= 1) { e.label.destroy(); return false; }
      e.label.setY(e.y - t * 30).setAlpha(1 - t * .8);
      if (e.type === 'hit' && t < .5) {
        g.lineStyle(3, 0xd95b35, 1 - t * 2);
        for (let i = 0; i < 8; i++) {
          const a = i * Math.PI / 4;
          g.lineBetween(e.x + Math.cos(a) * 18, e.y + Math.sin(a) * 18, e.x + Math.cos(a) * (30 + t * 40), e.y + Math.sin(a) * (30 + t * 40));
        }
      }
      return true;
    });
  }
}
