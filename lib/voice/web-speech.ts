import type { ListenHandle, VoiceAdapter } from './index';

// `SpeechRecognition` and related types are not in TypeScript's default DOM lib.
// We declare them as opaque types so this file type-checks in any environment;
// at runtime, the browser provides the real implementations.
type SpeechRecognitionCtor = new () => SpeechRecognitionInstance;

interface SpeechRecognitionInstance {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: SpeechRecognitionResultEvent) => void) | null;
  onerror: ((e: unknown) => void) | null;
  onend: ((e: unknown) => void) | null;
  onstart: ((e: unknown) => void) | null;
  onaudiostart: ((e: unknown) => void) | null;
  start(): void;
  stop(): void;
}

interface SpeechRecognitionResultEvent {
  results: ArrayLike<{
    isFinal: boolean;
    [index: number]: { transcript: string };
  }>;
}

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  }
}

export class WebSpeechAdapter implements VoiceAdapter {
  isSupported(): boolean {
    if (typeof window === 'undefined') return false;
    return !!(window.SpeechRecognition || window.webkitSpeechRecognition) &&
           !!window.speechSynthesis;
  }

  speak(text: string): Promise<void> {
    return new Promise((resolve) => {
      if (typeof window === 'undefined' || !window.speechSynthesis) return resolve();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'en-US';
      u.rate = 1.0;
      u.onend = () => resolve();
      u.onerror = () => resolve();
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(u);
    });
  }

  listen(opts: { timeoutMs?: number } = {}): ListenHandle {
    const Ctor = typeof window !== 'undefined'
      ? window.SpeechRecognition || window.webkitSpeechRecognition
      : undefined;

    if (!Ctor) {
      return {
        ready: Promise.resolve(),
        result: Promise.resolve(''),
        stop: () => {},
      };
    }

    const rec = new Ctor();
    rec.lang = 'en-US';
    rec.continuous = false;
    rec.interimResults = false;

    let resolveReady!: () => void;
    const ready = new Promise<void>((r) => { resolveReady = r; });

    let resolveResult!: (text: string) => void;
    const result = new Promise<string>((r) => { resolveResult = r; });

    let resolved = false;
    const finish = (text: string) => {
      if (resolved) return;
      resolved = true;
      resolveReady();
      try { rec.stop(); } catch {}
      resolveResult(text);
    };

    rec.onaudiostart = () => resolveReady();
    rec.onstart = () => resolveReady();
    rec.onresult = (e: SpeechRecognitionResultEvent) => {
      const last = e.results[e.results.length - 1];
      if (last.isFinal) finish(last[0].transcript ?? '');
    };
    rec.onerror = () => finish('');
    rec.onend = () => finish('');

    setTimeout(() => finish(''), opts.timeoutMs ?? 8000);
    rec.start();

    return {
      ready,
      result,
      stop: () => {
        // Graceful end: tell the recognizer to finalize. onresult / onend
        // will fire with whatever it has and resolve the result promise.
        try { rec.stop(); } catch {}
      },
    };
  }
}
