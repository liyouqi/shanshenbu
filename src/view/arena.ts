import Phaser from 'phaser';
import { type CombatCore, type Fighter, type CombatEvent } from '../core/combat';
import { calls } from '../audio/feedback';
import type { Balance } from '../core/config';
import { captureVisual, interpolateVisual, type VisualSample } from './interpolation';
const INK = 0x292d2b;

export class CharacterView {
  private guardingUntil = 0;
  guard(until: number) { this.guardingUntil = until; }
  private body: Phaser.GameObjects.Graphics;
  private shadow: Phaser.GameObjects.Ellipse;
  private root: Phaser.GameObjects.Container;
  constructor(scene: Phaser.Scene, private color: number, private ground: number, private config: Balance) {
    this.shadow = scene.add.ellipse(0, ground + 3, 79, 13, INK, .12);
    this.body = scene.add.graphics();
    this.root = scene.add.container(0, ground, [this.body]);
  }
  render(f: Fighter, now: number, pose: ReturnType<typeof interpolateVisual>) {
    this.root.setPosition(pose.x, this.ground - pose.height).setScale(f.facing, 1).setRotation(0);
    this.shadow.setPosition(pose.x, this.ground + 4).setScale(1 - pose.height / 350).setAlpha(f.action === 'ko' ? .08 : .12);
    const g = this.body.clear();
    const walk = f.action === 'walk' ? Math.sin(now / 80) : 0;
    const idle = Math.sin(now / 250) * 2;
    let hip = -48, headX = 0, headY = -128 + idle;
    let hand = [24, -85], otherHand = [-23, -79], foot = [21 + walk * 15, 0], otherFoot = [-20 - walk * 15, 0];
    if (f.action === 'crouch') { hip = -28; headY += 40; hand = [35, -42]; otherHand = [-23, -42]; }
    if (f.jumpElapsed !== null) { foot = [31, -22]; otherFoot = [-24, -30]; hand = [30, -105]; }
    if (f.skill === 'dodge') { hip = -32; headX = 23; headY = -93; hand = [-37, -53]; otherHand = [-48, -71]; foot = [35, 0]; otherFoot = [-35, -5]; }
    if (f.skill === 'punch') {
      const s = this.config.skills.punch;
      const extend = pose.elapsed >= s.startupMs && pose.elapsed < s.startupMs + s.activeMs;
      hand = extend ? [72, headY + 34] : [15, headY + 35]; otherHand = [-10, headY + 55]; headX = extend ? 8 : -3;
    }
    if (f.skill === 'kick') {
      const s = this.config.skills.kick;
      const extend = pose.elapsed >= s.startupMs && pose.elapsed < s.startupMs + s.activeMs;
      foot = extend ? [96, -75] : [15, -27]; headX = -13; hand = [-30, -90]; otherHand = [18, -110];
    }
    if (f.skill === 'nineRings') {
      const s = this.config.skills.nineRings;
      const active = pose.elapsed >= s.startupMs && pose.elapsed < s.startupMs + s.activeMs;
      const part = Math.floor((pose.elapsed - s.startupMs) / (s.activeMs / s.hits));
      if (active) {
        hand = [part % 2 === 0 ? 79 : 15, -93]; otherHand = [part % 2 === 1 ? 76 : -20, -72];
        if (part === s.hits - 1) foot = [90, -62];
        headX = 7; headY -= 6;
      } else { hand = [-27, -106]; otherHand = [27, -106]; }
    }
    if (now < this.guardingUntil && !f.skill && !f.stun && f.jumpElapsed === null) { hand = [25, headY + 5]; otherHand = [30, headY + 25]; headX = -5; }
    if (f.action === 'hit') { headX = -17; headY -= 4; hand = [-29, -94]; otherHand = [-45, -70]; }
    if (f.action === 'ko') { this.root.setRotation(-f.facing * 1.35).setPosition(pose.x, this.ground - 13); headY = -113; hand = [28, -58]; }
    const shoulder = [headX * .4, headY + 43];
    const limb = (points: number[][], width: number, color: number) => {
      for (const [w, c] of [[width + 5, INK], [width, color]]) {
        g.lineStyle(w, c, 1).beginPath().moveTo(points[0][0], points[0][1]);
        for (const p of points.slice(1)) g.lineTo(p[0], p[1]);
        g.strokePath();
      }
    };
    limb([[-8, hip], [-18 - walk * 6, hip / 2], otherFoot], 15, 0xd9d7c9);
    limb([[5, hip], [foot[0] * .5, (hip + foot[1]) / 2 - 4], foot], 17, 0xf6f1e4);
    g.fillStyle(INK).fillRoundedRect(otherFoot[0] - 13, otherFoot[1] - 8, 29, 12, 5).fillRoundedRect(foot[0] - 10, foot[1] - 8, 31, 12, 5);
    limb([[shoulder[0] - 11, shoulder[1]], [-26, shoulder[1] + 20], otherHand], 12, this.color);
    g.fillStyle(this.color).lineStyle(3, INK).fillRoundedRect(shoulder[0] - 22, shoulder[1] - 9, 43, hip - shoulder[1] + 14, 11).strokeRoundedRect(shoulder[0] - 22, shoulder[1] - 9, 43, hip - shoulder[1] + 14, 11);
    g.lineStyle(7, INK).lineBetween(-21, hip + 1, 22, hip + 1);
    g.fillStyle(0xffebbb).fillCircle(0, hip + 1, 5);
    limb([[shoulder[0] + 12, shoulder[1]], [(hand[0] + 12) / 2, hand[1] + 12], hand], 13, this.color);
    for (const h of [otherHand, hand]) g.fillStyle(0xf4cda3).lineStyle(2.5, INK).fillCircle(h[0], h[1], 10).strokeCircle(h[0], h[1], 10);
    g.fillStyle(0xf4cda3).lineStyle(3, INK).fillCircle(headX, headY, 29).strokeCircle(headX, headY, 29);
    g.fillStyle(INK).fillEllipse(headX - 5, headY - 23, 47, 17).fillCircle(headX - 13, headY - 31, 9);
    g.lineStyle(8, this.color).lineBetween(headX - 27, headY - 16, headX + 25, headY - 16);
    g.lineStyle(4, this.color).lineBetween(headX - 26, headY - 16, headX - 43, headY - 9).lineBetween(headX - 27, headY - 15, headX - 39, headY - 25);
    g.lineStyle(3, INK);
    if (f.action === 'ko' || f.action === 'hit') {
      for (const x of [headX - 3, headX + 16]) g.lineBetween(x - 3, headY - 4, x + 3, headY + 2).lineBetween(x + 3, headY - 4, x - 3, headY + 2);
    } else {
      g.lineBetween(headX - 7, headY - 8, headX + 2, headY - 6).lineBetween(headX + 13, headY - 6, headX + 22, headY - 10);
      g.fillStyle(INK).fillCircle(headX, headY, 2.5).fillCircle(headX + 17, headY, 2.5);
    }
    g.lineBetween(headX + 5, headY + 14, headX + 17, headY + 12);
    g.fillStyle(0xe99e83, .65).fillEllipse(headX - 9, headY + 10, 10, 6);
  }
}

type Effect = { at: number; duration: number; x: number; y: number; label: Phaser.GameObjects.Text; type: string };
export class ArenaView {
  private player: CharacterView;
  private cpu: CharacterView;
  private effects: Effect[] = [];
  private ink: Phaser.GameObjects.Graphics;
  private previous!: Record<'player' | 'cpu', VisualSample>;
  private previousTime = 0;
  private lastRenderTime = -1;
  constructor(private scene: Phaser.Scene, private core: CombatCore) {
    const c = core.config.arena, w = c.width, h = c.height, ground = c.groundY;
    const g = scene.add.graphics();
    g.fillStyle(0xf1eddf).fillRect(0, 0, w, h);
    g.fillStyle(0xe8b366, .35).fillCircle(w * .76, h * .25, 64);
    g.fillStyle(0xd8ddd1).fillTriangle(-80, ground, w * .15, h * .32, w * .45, ground);
    g.fillStyle(0xe0e3d6).fillTriangle(w * .18, ground, w * .48, h * .30, w * .85, ground);
    g.fillStyle(0xd1d9cc).fillTriangle(w * .54, ground, w * .87, h * .37, w + 80, ground);
    g.lineStyle(1, 0x93a08d, .35);
    for (let i = 0; i < 12; i++) g.lineBetween(i * w / 11, ground - 75, i * w / 11, ground - 15);
    g.lineStyle(3, 0x7c8978, .35).lineBetween(0, ground - 76, w, ground - 76).lineBetween(0, ground - 52, w, ground - 52);
    g.fillStyle(0xe3dac6).fillRect(0, ground + 5, w, h - ground);
    g.lineStyle(3, INK, .45).lineBetween(0, ground + 5, w, ground + 5);
    g.lineStyle(1, 0xb7aa91, .3);
    for (let i = 0; i < 12; i++) g.lineBetween(w / 2, ground + 5, i * w / 11, h);
    g.lineBetween(0, ground + 44, w, ground + 44);
    // Bake the stationary scenery once instead of tessellating its paths every frame.
    g.generateTexture('arena-background', w, h);
    g.destroy();
    scene.add.image(w / 2, h / 2, 'arena-background');
    scene.add.text(w / 2, ground + 57, '闪  身  步', { fontFamily: 'sans-serif', fontSize: '17px', color: '#a79a83' }).setOrigin(.5).setAlpha(.55);
    this.player = new CharacterView(scene, 0xe56740, ground, core.config);
    this.cpu = new CharacterView(scene, 0x4d8e88, ground, core.config);
    this.ink = scene.add.graphics().setDepth(10);
    this.capture();
  }
  capture() {
    this.previous = { player: captureVisual(this.core.fighters.player), cpu: captureVisual(this.core.fighters.cpu) };
    this.previousTime = this.core.elapsed;
  }
  clear() { this.capture(); this.lastRenderTime = -1; this.player.guard(0); this.cpu.guard(0); for (const e of this.effects) e.label.destroy(); this.effects = []; this.ink.clear(); }
  events(events: CombatEvent[]) {
    for (const e of events) {
      if (e.type === 'blocked') this[e.defender].guard(this.core.elapsed + 160);
      let text = '', type: string = e.type, x = 0, y = 0;
      if (e.type === 'action-start') {
        const f = this.core.fighters[e.fighter]; text = calls[e.skill]; x = f.x; y = this.core.config.arena.groundY - f.height - 190;
      } else if (e.type === 'hit' || e.type === 'blocked' || e.type === 'evaded') {
        const f = this.core.fighters[e.defender];
        text = e.type === 'hit' ? `−${e.damage}` : e.type === 'blocked' ? `挡住 −${e.damage}` : '闪开！';
        x = f.x; y = this.core.config.arena.groundY - f.height - 110;
      }
      if (!text) continue;
      const label = this.scene.add.text(x, y, text, {
        fontFamily: 'sans-serif', fontSize: type === 'action-start' ? '24px' : '25px', fontStyle: 'bold',
        color: type === 'hit' ? '#b0442d' : type === 'blocked' ? '#317a77' : '#30382e', stroke: '#fff8e7', strokeThickness: 5,
      }).setOrigin(.5).setDepth(12);
      this.effects.push({ at: this.core.elapsed, duration: type === 'action-start' ? 650 : 480, x, y, label, type });
    }
  }
  render(fraction = 1) {
    const alpha = Math.max(0, Math.min(1, fraction));
    const now = this.previousTime + (this.core.elapsed - this.previousTime) * alpha;
    if (now === this.lastRenderTime) return;
    this.lastRenderTime = now;
    const poses = {
      player: interpolateVisual(this.previous.player, this.core.fighters.player, alpha),
      cpu: interpolateVisual(this.previous.cpu, this.core.fighters.cpu, alpha),
    };
    this.player.render(this.core.fighters.player, now, poses.player);
    this.cpu.render(this.core.fighters.cpu, now, poses.cpu);
    const g = this.ink.clear();
    for (const f of Object.values(this.core.fighters)) {
      const pose = poses[f.id];
      if (f.skill === 'dodge' && pose.elapsed >= this.core.config.skills.dodge.startupMs && pose.elapsed < this.core.config.skills.dodge.startupMs + this.core.config.skills.dodge.activeMs) {
        g.lineStyle(4, f.id === 'player' ? 0xe56740 : 0x4d8e88, .4);
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
