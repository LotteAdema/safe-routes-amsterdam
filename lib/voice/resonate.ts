import type { ListenHandle, VoiceAdapter } from './index';

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

  listen(opts: { timeoutMs?: number } = {}): ListenHandle {
    const timeoutMs = opts.timeoutMs ?? 8000;

    let resolveReady!: () => void;
    const ready = new Promise<void>((r) => { resolveReady = r; });

    let resolveResult!: (text: string) => void;
    const result = new Promise<string>((r) => { resolveResult = r; });

    let transcript = '';
    let resolved = false;
    let recorder: MediaRecorder | null = null;
    let stream: MediaStream | null = null;
    let ws: WebSocket | null = null;
    let timeoutTimer: ReturnType<typeof setTimeout> | null = null;
    let flushTimer: ReturnType<typeof setTimeout> | null = null;
    let flushSent = false;

    const finish = () => {
      if (resolved) return;
      resolved = true;
      // Resolve ready in case stop() was called before mic ever opened.
      resolveReady();
      if (timeoutTimer) clearTimeout(timeoutTimer);
      if (flushTimer) clearTimeout(flushTimer);
      try { recorder?.stop(); } catch {}
      stream?.getTracks().forEach((t) => t.stop());
      if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
        ws.close();
      }
      resolveResult(transcript.trim());
    };

    const requestFlush = () => {
      if (resolved || flushSent) return;
      flushSent = true;
      try { recorder?.stop(); } catch {}
      if (ws && ws.readyState === WebSocket.OPEN) {
        try { ws.send(JSON.stringify({ type: 'flush_request', id: 'done' })); } catch {}
        // Fall back to finishing if the server doesn't confirm in time.
        flushTimer = setTimeout(finish, 2000);
      } else {
        finish();
      }
    };

    (async () => {
      let token: string;
      try {
        token = await fetchToken();
      } catch {
        return finish();
      }
      if (resolved) return;

      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch {
        return finish();
      }
      if (resolved) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }

      const mimeType = pickMimeType();

      ws = new WebSocket('wss://api.reson8.dev/v1/speech-to-text/realtime', [
        'bearer',
        token,
      ]);

      ws.onopen = () => {
        if (resolved || !stream) return;
        const recOpts: MediaRecorderOptions = mimeType ? { mimeType } : {};
        recorder = new MediaRecorder(stream, recOpts);

        recorder.ondataavailable = (e) => {
          if (e.data.size > 0 && ws && ws.readyState === WebSocket.OPEN) {
            e.data.arrayBuffer().then((buf) => {
              if (ws && ws.readyState === WebSocket.OPEN) ws.send(buf);
            });
          }
        };

        recorder.start(100); // 100ms chunks for low latency
        // Mic is hot — UI may now show "Listening…".
        resolveReady();

        // Hard cap: after timeoutMs of audio, flush and wrap up.
        timeoutTimer = setTimeout(requestFlush, timeoutMs);
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
    })();

    return {
      ready,
      result,
      stop: requestFlush,
    };
  }
}
