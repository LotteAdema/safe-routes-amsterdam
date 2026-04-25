import type { VoiceAdapter } from './index';

// Token cached client-side; expires_in is 600s so we refresh 60s early.
let _cached: { token: string; expiresAt: number } | null = null;

async function fetchToken(): Promise<string> {
  const now = Date.now();
  if (_cached && _cached.expiresAt > now + 60_000) return _cached.token;
  const resp = await fetch('/api/voice/token', { method: 'POST' });
  if (!resp.ok) throw new Error(`Token fetch failed: ${resp.status}`);
  const { access_token, expires_in } = (await resp.json()) as {
    access_token: string;
    expires_in: number;
  };
  _cached = { token: access_token, expiresAt: now + expires_in * 1000 };
  return access_token;
}

function pickMimeType(): string {
  const preferred = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'];
  for (const mime of preferred) {
    if (MediaRecorder.isTypeSupported(mime)) return mime;
  }
  return '';
}

export class ResonateAdapter implements VoiceAdapter {
  isSupported(): boolean {
    return (
      typeof window !== 'undefined' &&
      typeof WebSocket !== 'undefined' &&
      !!navigator.mediaDevices?.getUserMedia
    );
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

  async listen(opts: { timeoutMs?: number } = {}): Promise<string> {
    const timeoutMs = opts.timeoutMs ?? 8000;
    const token = await fetchToken();
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mimeType = pickMimeType();

    return new Promise((resolve) => {
      const ws = new WebSocket('wss://api.reson8.dev/v1/speech-to-text/realtime', [
        'bearer',
        token,
      ]);

      let transcript = '';
      let recorder: MediaRecorder | null = null;
      let resolved = false;
      let flushTimer: ReturnType<typeof setTimeout> | null = null;

      const finish = () => {
        if (resolved) return;
        resolved = true;
        if (flushTimer) clearTimeout(flushTimer);
        try { recorder?.stop(); } catch {}
        stream.getTracks().forEach((t) => t.stop());
        if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
          ws.close();
        }
        resolve(transcript.trim());
      };

      ws.onopen = () => {
        const opts: MediaRecorderOptions = mimeType ? { mimeType } : {};
        recorder = new MediaRecorder(stream, opts);

        recorder.ondataavailable = (e) => {
          if (e.data.size > 0 && ws.readyState === WebSocket.OPEN) {
            e.data.arrayBuffer().then((buf) => {
              if (ws.readyState === WebSocket.OPEN) ws.send(buf);
            });
          }
        };

        recorder.start(100); // 100ms chunks for low latency

        // After timeoutMs, flush remaining audio and wait up to 2s for confirmation.
        setTimeout(() => {
          if (ws.readyState === WebSocket.OPEN) {
            try { recorder?.stop(); } catch {}
            ws.send(JSON.stringify({ type: 'flush_request', id: 'done' }));
          }
          flushTimer = setTimeout(finish, 2000);
        }, timeoutMs);
      };

      ws.onmessage = (e) => {
        if (typeof e.data !== 'string') return;
        let msg: { type: string; text?: string; id?: string };
        try { msg = JSON.parse(e.data as string); } catch { return; }

        if (msg.type === 'transcript' && msg.text) {
          transcript += (transcript ? ' ' : '') + msg.text;
        }
        if (msg.type === 'flush_confirmation' && msg.id === 'done') {
          finish();
        }
      };

      ws.onerror = () => finish();
      ws.onclose = () => { if (!resolved) finish(); };
    });
  }
}
