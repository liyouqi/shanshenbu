import { type Input } from '../core/combat';
import type { Skill } from '../core/config';

const directions: Record<string, string> = { KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right', KeyW: 'up', ArrowUp: 'up', KeyS: 'down', ArrowDown: 'down' };
const keys: Record<string, Skill> = { KeyJ: 'punch', KeyK: 'dodge', KeyL: 'kick', KeyU: 'nineRings' };
export class Controls {
  private held = new Set<string>();
  private edges: Skill[] = [];
  private jump = false;
  private joy = { horizontal: 0 as -1 | 0 | 1, down: false, up: false };
  private joyPointer: number | null = null;
  private skillPointers = new Map<number, HTMLButtonElement>();
  private abort = new AbortController();
  constructor(private root: HTMLElement, private gesture: () => void, private restart: () => void, private pause: () => void) {
    const options = { signal: this.abort.signal };
    window.addEventListener('keydown', e => {
      if (e.target instanceof HTMLInputElement || (e.target instanceof HTMLButtonElement && ['Enter', 'Space'].includes(e.code))) return;
      if (directions[e.code] || keys[e.code] || ['Space', 'Enter', 'Escape'].includes(e.code)) e.preventDefault();
      if (e.repeat || this.held.has(e.code)) return;
      if (e.code === 'Enter' || e.code === 'Space') { this.gesture(); this.restart(); return; }
      if (e.code === 'Escape') { this.pause(); return; }
      if (!directions[e.code] && !keys[e.code]) return;
      this.held.add(e.code); this.gesture();
      if (directions[e.code] === 'up') this.jump = true;
      if (keys[e.code]) this.edges.push(keys[e.code]);
    }, options);
    window.addEventListener('keyup', e => { this.held.delete(e.code); }, options);
    const joystick = root.querySelector<HTMLElement>('#joystick')!;
    const thumb = root.querySelector<HTMLElement>('#thumb')!;
    const update = (e: PointerEvent) => {
      const rect = joystick.getBoundingClientRect();
      const dx = e.clientX - (rect.left + rect.width / 2), dy = e.clientY - (rect.top + rect.height / 2);
      const radius = rect.width * .37, distance = Math.hypot(dx, dy), ratio = Math.min(1, radius / Math.max(1, distance));
      thumb.style.transform = `translate(${dx * ratio}px, ${dy * ratio}px)`;
      const nextUp = dy < -rect.height * .18;
      if (nextUp && !this.joy.up) this.jump = true;
      this.joy = { horizontal: Math.abs(dx) > rect.width * .18 ? dx > 0 ? 1 : -1 : 0, down: dy > rect.height * .18, up: nextUp };
    };
    joystick.addEventListener('pointerdown', e => {
      if (this.joyPointer !== null) return;
      e.preventDefault(); this.gesture(); this.joyPointer = e.pointerId;
      joystick.setPointerCapture(e.pointerId); update(e); joystick.classList.add('pressed');
    }, options);
    joystick.addEventListener('pointermove', e => {
      if (e.pointerId !== this.joyPointer) return;
      const r = joystick.getBoundingClientRect();
      if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) { releaseJoy(); return; }
      update(e);
    }, options);
    const releaseJoy = () => {
      this.joyPointer = null; this.joy = { horizontal: 0, down: false, up: false };
      thumb.style.transform = ''; joystick.classList.remove('pressed');
    };
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture'] as const) joystick.addEventListener(type, e => { if (e.pointerId === this.joyPointer) releaseJoy(); }, options);
    for (const button of root.querySelectorAll<HTMLButtonElement>('[data-skill]')) {
      button.addEventListener('pointerdown', e => {
        e.preventDefault(); this.gesture();
        if ([...this.skillPointers.values()].includes(button)) return;
        this.skillPointers.set(e.pointerId, button); button.setPointerCapture(e.pointerId);
        this.edges.push(button.dataset.skill as Skill); button.classList.add('pressed');
      }, options);
      const release = (e: PointerEvent) => {
        this.skillPointers.delete(e.pointerId);
        if (![...this.skillPointers.values()].includes(button)) button.classList.remove('pressed');
      };
      button.addEventListener('pointermove', e => {
        const r = button.getBoundingClientRect();
        if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) release(e);
      }, options);
      for (const type of ['pointerup', 'pointercancel', 'lostpointercapture'] as const) button.addEventListener(type, release, options);
      button.addEventListener('click', e => { if (e.detail === 0) { this.gesture(); this.edges.push(button.dataset.skill as Skill); } }, options);
    }
    window.addEventListener('blur', () => this.clear(), options);
  }
  sample(): Input {
    const down = (direction: string) => [...this.held].some(key => directions[key] === direction);
    const keyboardHorizontal = Number(down('right')) - Number(down('left'));
    const input = { horizontal: (keyboardHorizontal || this.joy.horizontal) as -1 | 0 | 1, up: this.jump, down: down('down') || this.joy.down, skills: this.edges };
    this.jump = false; this.edges = [];
    return input;
  }
  clear() {
    this.held.clear(); this.edges = []; this.jump = false;
    this.joy = { horizontal: 0, down: false, up: false }; this.joyPointer = null; this.skillPointers.clear();
    for (const node of this.root.querySelectorAll('.pressed')) node.classList.remove('pressed');
    const thumb = this.root.querySelector<HTMLElement>('#thumb'); if (thumb) thumb.style.transform = '';
  }
  destroy() { this.clear(); this.abort.abort(); }
}
