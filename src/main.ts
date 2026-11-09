import Phaser from 'phaser';
import { CombatCore, STEP, emptyInput } from './core/combat';
import { balance, skillNames } from './core/config';
import { Controls } from './input/controls';
import { AIController } from './ai/controller';
import { ArenaView } from './view/arena';
import { animations, animationNames } from './view/action-frames';
import { AudioFeedback } from './audio/feedback';
import './style.css';

const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `
  <header class="masthead"><a class="brand" href="./" aria-label="闪身步首页"><span class="brand-mark">闪</span><span>闪身步<small>来过两招</small></span></a><span class="edition">教学舞台 · 单人练练</span><div class="sound-tools"><label title="音量"><span>音量</span><input id="volume" aria-label="音量" type="range" min="0" max="1" step="0.05" value="0.55" /></label><button id="mute" class="tool" aria-label="静音" aria-pressed="false">声音 开</button></div></header>
  <main class="game-shell" aria-label="闪身步格斗游戏">
    <div class="hud">
      <div class="fighter-hud player"><span class="portrait" aria-hidden="true"></span><div class="fighter-name"><span><i></i>1P · 你</span><span id="player-hp">100 / 100</span></div><div class="health-track"><div id="player-health" class="health-fill"></div></div></div>
      <div class="clock"><span id="timer">60</span><small>一局定胜负</small></div>
      <div class="fighter-hud cpu"><span class="portrait" aria-hidden="true"></span><div class="fighter-name"><span id="cpu-hp">100 / 100</span><span>CPU · 阿步<i></i></span></div><div class="health-track"><div id="cpu-health" class="health-fill"></div></div></div>
    </div>
    <div class="playfield">
      <div id="arena" aria-label="对战擂台"></div>
      <div id="ready" class="ready"><span class="eyebrow">教学舞台已就位</span><strong>来，过两招。</strong><span>移动或出招，即刻开打</span></div>
      <div id="status" class="status" role="status" aria-live="polite">正在准备擂台…</div>
      <button id="mobile-mute" class="mobile-sound tool" aria-label="静音">声音 开</button>
      <button id="pause" class="pause tool" aria-label="暂停游戏">Ⅱ</button>
      <div id="pause-overlay" class="overlay" hidden><div class="result-card"><span class="eyebrow">歇口气</span><strong>暂停一下</strong><button id="resume" class="primary">继续切磋 <span>↗</span></button><label class="pause-volume">音量 <input id="pause-volume" aria-label="暂停菜单音量" type="range" min="0" max="1" step="0.05" value="0.55" /></label></div></div>
      <div id="result" class="overlay" hidden><div class="result-card"><span class="eyebrow">本局切磋结束</span><strong id="result-title"></strong><p id="result-copy"></p><button id="restart" class="primary">再来一局 <span>↗</span></button><small>或按 Enter / 空格</small></div></div>
    </div>
    <div class="controls">
      <div class="move-control"><div id="joystick" class="joystick" aria-label="虚拟摇杆：左右移动，上跳，下蹲"><span class="north">↑</span><span class="west">←</span><span class="east">→</span><span class="south">↓</span><div id="thumb"></div></div><span class="control-caption">走 · 跳 · 蹲</span></div>
      <div class="control-help"><strong>身法到位，快乐翻倍。</strong><span><kbd>A</kbd><kbd>D</kbd> 移动 <kbd>W</kbd> 跳 <kbd>S</kbd> 蹲</span><small>按住远离对手的方向可格挡</small></div>
      <div class="skills">
        <button class="skill punch" data-skill="punch" aria-label="普通攻击 J"><span class="skill-face">拳</span><span class="skill-name">普攻 <kbd>J</kbd></span><span class="cooldown"></span></button>
        <button class="skill dodge" data-skill="dodge" aria-label="闪身步 K"><span class="skill-face">闪</span><span class="skill-name">闪身步 <kbd>K</kbd></span><span class="cooldown"></span></button>
        <button class="skill kick" data-skill="kick" aria-label="浪子踢球 L"><span class="skill-face">踢</span><span class="skill-name">浪子踢球 <kbd>L</kbd></span><span class="cooldown"></span></button>
        <button class="skill special" data-skill="nineRings" aria-label="九连环 U"><span class="skill-face">必</span><span class="skill-name">九连环 <kbd>U</kbd></span><span class="cooldown"></span></button>
      </div>
    </div>
  </main>
  <footer><span>不讲武德？不如跳支舞。</span><span>方向键也能移动 · Esc 暂停</span></footer>
  <div id="rotate" class="rotate"><div class="rotate-phone">↻</div><strong>横过来，好施展。</strong><p>请将手机转为横屏<br>左手走位，右手出招。</p></div>
`;
const el = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const core = new CombatCore();
const ai = new AIController();
let controls: Controls;
let audio: AudioFeedback;
let view: ArenaView;
let accumulator = 0;
let manualPause = false;
let blurred = false;
let sceneReady = false;
let lastPhase = '';
let failure = false;
const portrait = matchMedia('(max-width: 800px) and (orientation: portrait)');
const buttons = Object.fromEntries(skillNames.map(key => [key, app.querySelector<HTMLButtonElement>(`[data-skill="${key}"]`)!]));
const hud = {
  health: { player: el('player-health'), cpu: el('cpu-health') },
  hp: { player: el('player-hp'), cpu: el('cpu-hp') },
  timer: el('timer'), ready: el('ready'), result: el('result'),
  cooldown: Object.fromEntries(skillNames.map(key => [key, buttons[key].querySelector<HTMLElement>('.cooldown')!])),
};
const shown = { playerHp: -1, cpuHp: -1, seconds: -1, cooldown: new Map<string, string>() };

function syncPause() {
  const blocked = manualPause || blurred || document.hidden || portrait.matches;
  if (blocked) { core.pause(); controls?.clear(); audio?.pause(); }
  else core.resume();
  accumulator = 0;
  view?.capture();
  el('pause-overlay').hidden = core.phase !== 'paused' || portrait.matches;
  el('rotate').classList.toggle('visible', portrait.matches);
}
function restart() {
  if (!sceneReady || core.phase !== 'result') return;
  core.reset(); ai.reset(); controls.clear(); audio.reset(); view.clear(); accumulator = 0;
  manualPause = false; lastPhase = ''; syncPause(); view.render(); renderHUD();
}
function renderHUD() {
  hud.result.hidden = core.phase !== 'result' || !view?.resultReady;
  for (const id of ['player', 'cpu'] as const) {
    const hp = core.fighters[id].hp;
    const cacheKey = id === 'player' ? 'playerHp' : 'cpuHp';
    if (shown[cacheKey] !== hp) {
      shown[cacheKey] = hp;
      hud.health[id].style.transform = `scaleX(${hp / core.config.match.maxHp})`;
      hud.hp[id].textContent = `${hp} / ${core.config.match.maxHp}`;
    }
  }
  const seconds = Math.ceil(core.secondsLeft);
  if (shown.seconds !== seconds) {
    shown.seconds = seconds;
    hud.timer.textContent = String(seconds).padStart(2, '0');
    hud.timer.classList.toggle('urgent', seconds <= 10);
  }
  for (const key of skillNames) {
    const remaining = Math.max(0, core.fighters.player.cooldown[key] - core.elapsed);
    const text = remaining > 0 ? `${(remaining / 1000).toFixed(1)}s` : '';
    if (shown.cooldown.get(key) !== text) {
      shown.cooldown.set(key, text);
      buttons[key].classList.toggle('cooling', remaining > 0);
      hud.cooldown[key].textContent = text;
    }
  }
  if (lastPhase !== core.phase) {
    lastPhase = core.phase;
    hud.ready.hidden = core.phase !== 'ready';
    if (core.phase === 'result') {
      controls.clear();
      const win = core.winner;
      el('result-title').textContent = win === 'draw' ? '不分伯仲！' : win === 'player' ? '好身法，你赢了！' : '阿步略胜一筹。';
      el('result-copy').textContent = win === 'draw' ? '高手过招，点到为止。再切磋一局？' : win === 'player' ? '这一套，多少带点功夫。' : '试试闪到背后，再来一脚。';
      el('status').textContent = win === 'draw' ? '本局平局' : win === 'player' ? '本局获胜' : '本局落败';
    } else if (core.phase === 'playing') el('status').textContent = '切磋中';
    else if (core.phase === 'ready') el('status').textContent = '移动或出招，即刻开打';
  }
}

class FightScene extends Phaser.Scene {
  constructor() { super('fight'); }
  preload() {
    const art = 'assets/visual/teacher-v1';
    this.load.image('studio-blue', `${art}/stage/studio_blue_stage_1920x1080.png`);
    for (const action of animationNames) {
      const spec = animations[action];
      if (action === 'nineRings') {
        // Avoid a 4400px texture on phones with a 4096px texture limit.
        for (let frame = 0; frame < spec.frameCount; frame++) this.load.image(`teacher-nineRings-${frame}`, `assets/visual/coverage-v0.3/nineRings/${String(frame).padStart(2, '0')}.png`);
      } else {
        const path = action === 'dodge' ? `${art}/actions/dodge/dodge_spritesheet.png` : `assets/visual/coverage-v0.3/${action}.png`;
        this.load.spritesheet(`teacher-${action}`, path, { frameWidth: spec.frameWidth, frameHeight: spec.frameHeight });
      }
    }
    for (const key of ['swing', 'swoosh', 'hit', 'block', 'bell', 'land']) this.load.audio(key, `assets/${key}.wav`);
  }
  create() {
    view = new ArenaView(this, core); audio = new AudioFeedback(this);
    controls = new Controls(app, () => audio.unlock(), restart, () => { manualPause = !manualPause; syncPause(); });
    const mute = el<HTMLButtonElement>('mute');
    const syncAudio = () => { for (const button of [mute, el('mobile-mute')]) { button.textContent = audio.muted ? '声音 关' : '声音 开'; button.setAttribute('aria-pressed', String(audio.muted)); button.setAttribute('aria-label', audio.muted ? '开启声音' : '静音'); } };
    mute.onclick = () => { audio.unlock(); audio.settings(!audio.muted); syncAudio(); };
    el('mobile-mute').onclick = mute.onclick;
    const volume = el<HTMLInputElement>('volume'); volume.value = String(audio.volume);
    const pauseVolume = el<HTMLInputElement>('pause-volume'); pauseVolume.value = String(audio.volume);
    for (const slider of [volume, pauseVolume]) slider.oninput = () => { audio.unlock(); audio.settings(audio.muted, Number(slider.value)); volume.value = pauseVolume.value = slider.value; };
    el('restart').onclick = restart;
    el('pause').onclick = () => { if (core.phase === 'result') return; manualPause = !manualPause; syncPause(); };
    el('resume').onclick = () => { manualPause = false; blurred = false; syncPause(); };
    sceneReady = true; syncAudio(); syncPause(); view.render(); renderHUD();
    // Read-only diagnostic snapshots for local browser checks; omitted from production.
    if (import.meta.env.DEV) (window as unknown as { __shanshenbu: unknown }).__shanshenbu = { snapshot: () => core.snapshot(), visuals: () => view.snapshot() };
  }
  update(_time: number, delta: number) {
    if (!sceneReady || failure) return;
    const visualDelta = blurred || document.hidden || portrait.matches ? 0 : delta;
    if (core.phase === 'paused' || core.phase === 'result') { accumulator = 0; view.render(1, visualDelta); renderHUD(); return; }
    accumulator += Math.min(delta, STEP * 5);
    let steps = 0;
    while (accumulator >= STEP && steps < 5) {
      view.capture();
      const input = controls.sample();
      const events = core.step(input, core.phase === 'playing' ? ai.update(core) : emptyInput());
      view.events(events); audio.play(events);
      accumulator -= STEP; steps++;
      if (events.some(e => e.type === 'round-end')) { accumulator = 0; break; }
    }
    view.render(core.phase === 'playing' ? accumulator / STEP : 1, visualDelta); renderHUD();
  }
}
window.addEventListener('blur', () => { blurred = true; syncPause(); });
window.addEventListener('focus', () => { blurred = false; syncPause(); });
document.addEventListener('visibilitychange', syncPause);
portrait.addEventListener('change', syncPause);
window.addEventListener('pagehide', () => { controls?.clear(); audio?.pause(); });
window.addEventListener('pageshow', () => { blurred = false; syncPause(); });
syncPause();
try {
  new Phaser.Game({
    type: Phaser.AUTO, parent: 'arena', width: balance.arena.width, height: balance.arena.height,
    backgroundColor: '#5289b4', scene: FightScene, banner: false,
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    render: { antialias: true, roundPixels: false },
    audio: { disableWebAudio: false },
    // The accumulator and render interpolation own timing; don't smooth it twice.
    fps: { smoothStep: false },
  });
} catch (error) {
  failure = true;
  el('ready').innerHTML = '<strong>擂台暂时没能加载</strong><span>请刷新页面，或换用系统浏览器重试。</span>';
  el('status').textContent = '加载失败';
  console.error(error);
}
