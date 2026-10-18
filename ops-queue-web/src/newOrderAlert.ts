/**
 * "New order" alert for the queue: a short chime (generated with Web Audio, so
 * there is no sound file to ship) and an optional desktop notification.
 *
 * Browsers only let a page make sound after the user has interacted with it.
 * A tablet that reopens with a saved sign-in has had no tap yet, so the first
 * tap anywhere unlocks sound (`installAudioUnlock`).
 */

let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  if (ctx) return ctx;
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  try {
    ctx = new Ctor();
  } catch {
    ctx = null;
  }
  return ctx;
}

/** True while the browser is still blocking sound (no tap on the page yet). */
export function soundBlocked(): boolean {
  const c = audio();
  return !c || c.state !== 'running';
}

/** Resumes sound on the first tap or key press. Returns a cleanup function. */
export function installAudioUnlock(onUnlocked?: () => void): () => void {
  const unlock = () => {
    const c = audio();
    if (!c) return;
    void c.resume().then(() => {
      if (c.state === 'running') {
        remove();
        onUnlocked?.();
      }
    });
  };
  const remove = () => {
    window.removeEventListener('pointerdown', unlock);
    window.removeEventListener('keydown', unlock);
  };
  window.addEventListener('pointerdown', unlock);
  window.addEventListener('keydown', unlock);
  return remove;
}

/** How many times one alert rings, so a busy counter notices it. */
export const CHIME_REPEATS = 4;
/** Seconds from the start of one chime to the next. */
const CHIME_GAP_S = 1.1;

/**
 * Two rising tones, loud enough to hear over a busy counter, played `times`
 * times in a row (about a second apart).
 */
export function playChime(times = CHIME_REPEATS): void {
  const c = audio();
  if (!c || c.state !== 'running') return;
  const notes = [880, 1318.5]; // A5, E6
  for (let r = 0; r < Math.max(1, times); r++) {
    notes.forEach((freq, i) => {
      const start = c.currentTime + r * CHIME_GAP_S + i * 0.22;
      const osc = c.createOscillator();
      const gain = c.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.5, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.45);
      osc.connect(gain).connect(c.destination);
      osc.start(start);
      osc.stop(start + 0.5);
    });
  }
}

export function desktopNotificationsSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

/** Asks the browser for permission; true once granted. */
export async function requestDesktopNotifications(): Promise<boolean> {
  if (!desktopNotificationsSupported()) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  return (await Notification.requestPermission()) === 'granted';
}

/** Shows a system notification (useful when the queue tab is in the background). */
export function showDesktopNotification(title: string, body: string): void {
  if (!desktopNotificationsSupported() || Notification.permission !== 'granted') return;
  try {
    const n = new Notification(title, { body, tag: 'moja-new-order', requireInteraction: false });
    n.onclick = () => {
      window.focus();
      n.close();
    };
  } catch {
    /* some browsers only allow notifications from a service worker */
  }
}
