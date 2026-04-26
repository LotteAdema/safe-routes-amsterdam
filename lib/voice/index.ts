export interface ListenHandle {
  /** Resolves when the microphone is actually capturing audio. */
  ready: Promise<void>;
  /** Resolves with the final transcript when listening ends, or '' on timeout/error. */
  result: Promise<string>;
  /** Requests a graceful early end (flush remaining audio and resolve `result`). */
  stop(): void;
}

export interface VoiceAdapter {
  speak(text: string): Promise<void>;
  listen(opts?: { timeoutMs?: number }): ListenHandle;
  /** True if the adapter is supported in this environment. */
  isSupported(): boolean;
}

let cached: VoiceAdapter | null = null;

export async function getVoice(): Promise<VoiceAdapter> {
  if (cached) return cached;
  const provider = process.env.NEXT_PUBLIC_VOICE ?? 'web-speech';
  if (provider === 'resonate') {
    const { ResonateAdapter } = await import('./resonate');
    cached = new ResonateAdapter();
    return cached;
  }
  const { WebSpeechAdapter } = await import('./web-speech');
  cached = new WebSpeechAdapter();
  return cached;
}
