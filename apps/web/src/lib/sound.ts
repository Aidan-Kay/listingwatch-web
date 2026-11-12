import type { Settings } from "@listingwatch/shared/schemas";

/** At most one sound this often, so a burst of arrivals doesn't restart it mid-play. */
const MIN_GAP_MS = 600;
let lastPlayedAt = 0;
let audioContext: AudioContext | null = null;
let customAudio: { name: string; element: HTMLAudioElement } | null = null;

/** Play the notification sound: the uploaded one if there is one, else a short built-in chime. */
export function playNotificationSound(sound: Settings["sound"]): void {
  if (!sound.enabled || Date.now() - lastPlayedAt < MIN_GAP_MS) return;
  lastPlayedAt = Date.now();
  if (sound.customName) playCustom(sound.customName, sound.volume);
  else playChime(sound.volume);
}

function playCustom(name: string, volume: number): void {
  if (customAudio?.name !== name) {
    customAudio = { name, element: new Audio(`/api/settings/sound?v=${encodeURIComponent(name)}`) };
  }
  const { element } = customAudio;
  element.volume = volume;
  element.currentTime = 0;
  // Browsers refuse audio until the user has interacted with the page; that's fine.
  void element.play().catch(() => {});
}

/** Two soft rising tones, synthesised so there's no audio file to ship. */
function playChime(volume: number): void {
  audioContext ??= new AudioContext();
  const context = audioContext;
  if (context.state === "suspended") void context.resume().catch(() => {});
  const start = context.currentTime;
  [
    { frequency: 880, at: 0 },
    { frequency: 1320, at: 0.12 },
  ].forEach(({ frequency, at }) => {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0, start + at);
    gain.gain.linearRampToValueAtTime(0.25 * volume, start + at + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + at + 0.45);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(start + at);
    oscillator.stop(start + at + 0.5);
  });
}
