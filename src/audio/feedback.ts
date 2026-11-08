import Phaser from 'phaser';
import type { CombatEvent } from '../core/combat';

export const calls = { punch: '嘿！', dodge: '闪身步！', kick: '浪子踢球！', nineRings: '九连环！' };
export class AudioFeedback {
  muted = false;
  volume = .55;
  private unlocked = false;
  private lastVoice = -Infinity;
  constructor(private scene: Phaser.Scene) {
    try {
      const stored = JSON.parse(localStorage.getItem('shanshenbu-audio') || '{}');
      this.muted = stored.muted === true;
      if (typeof stored.volume === 'number') this.volume = Math.max(0, Math.min(1, stored.volume));
    } catch { /* Storage is optional. */ }
    this.apply();
  }
  private apply() { this.scene.sound.mute = this.muted; this.scene.sound.volume = this.volume; }
  settings(muted: boolean, volume = this.volume) {
    this.muted = muted; this.volume = volume; this.apply();
    if (muted) this.cancelVoice();
    try { localStorage.setItem('shanshenbu-audio', JSON.stringify({ muted, volume })); } catch { /* Private mode. */ }
  }
  unlock() {
    try { if (this.scene.sound.locked) this.scene.sound.unlock(); this.unlocked = true; } catch { /* Silent gameplay remains available. */ }
  }
  private cancelVoice() { try { window.speechSynthesis?.cancel(); } catch { /* Optional API. */ } }
  pause() { try { this.scene.sound.pauseAll(); } catch { /* Optional audio. */ } this.cancelVoice(); }
  reset() { this.cancelVoice(); this.lastVoice = -Infinity; try { this.scene.sound.stopAll(); } catch { /* Optional audio. */ } }
  play(events: CombatEvent[]) {
    if (this.muted || this.volume === 0 || !this.unlocked) return;
    for (const event of events) {
      let key: string | null = null;
      if (event.type === 'action-start') {
        key = event.skill === 'dodge' ? 'swoosh' : 'swing';
        // Prototype voices use the device's Chinese TTS, never a third-party recording.
        if (event.skill !== 'punch' && performance.now() - this.lastVoice > 1100) {
          try {
            if ('speechSynthesis' in window && !speechSynthesis.speaking) {
              const voice = new SpeechSynthesisUtterance(calls[event.skill]);
              voice.lang = 'zh-CN'; voice.rate = 1.35; voice.pitch = event.fighter === 'player' ? 1.2 : .8;
              voice.volume = this.volume;
              const chinese = speechSynthesis.getVoices().find(v => v.lang.startsWith('zh'));
              if (chinese) { voice.voice = chinese; speechSynthesis.speak(voice); this.lastVoice = performance.now(); }
            }
          } catch { /* Keep the on-screen callout when speech is unavailable. */ }
        }
      } else if (event.type === 'hit') key = 'hit';
      else if (event.type === 'blocked') key = 'block';
      else if (event.type === 'evaded') key = 'swoosh';
      else if (event.type === 'round-end') key = 'bell';
      else if (event.type === 'land') key = 'land';
      try { if (key && this.scene.cache.audio.exists(key)) this.scene.sound.play(key); } catch { /* Audio failure never blocks combat. */ }
    }
  }
}
