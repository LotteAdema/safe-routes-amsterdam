export interface VoiceAdapter {
  speak(text: string): Promise<void>;
  /** Resolves with the final transcript when the user stops speaking, or '' on timeout. */
  listen(opts?: { timeoutMs?: number }): Promise<string>;
  /** True if the adapter is supported in this environment. */
  isSupported(): boolean;
}

let cached: VoiceAdapter | null = null;

export async function getVoice(): Promise<VoiceAdapter> {
  if (cached) return cached;
  const provider = process.env.NEXT_PUBLIC_VOICE ?? 'web-speech';
  if (provider === 'resonate') {
    // Stub: filled in once Resonate SDK lands. For now fall through to web-speech.
    console.warn('Resonate adapter not yet implemented, falling back to web-speech');
  }
  const { WebSpeechAdapter } = await import('./web-speech');
  cached = new WebSpeechAdapter();
  return cached;
}
