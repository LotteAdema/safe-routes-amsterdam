'use client';

import { useEffect, useRef, useState } from 'react';
import { getVoice } from '@/lib/voice';
import { PushToTalkButton } from '@/components/ui/push-to-talk-button';

type State = 'idle' | 'recording' | 'waiting_location' | 'submitting' | 'done' | 'error';

export function ReportScreen({
  onDone,
  onReported,
  initialPosition,
  autoStart,
}: {
  onDone: () => void;
  onReported?: (id: string) => void;
  initialPosition?: { lat: number; lng: number } | null;
  autoStart?: boolean;
}) {
  const [state, setState] = useState<State>('idle');
  const [transcript, setTranscript] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const posRef = useRef<{ lat: number; lng: number } | null>(initialPosition ?? null);
  const listenRef = useRef<Promise<string> | null>(null);
  const pendingTranscriptRef = useRef('');
  const waitingRef = useRef(false);

  const submitReport = async (text: string, pos: { lat: number; lng: number }) => {
    waitingRef.current = false;
    setState('submitting');
    const r = await fetch('/api/reports', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transcript: text, lat: pos.lat, lng: pos.lng }),
    });
    if (!r.ok) {
      setState('error');
      setErrorMsg("Couldn't send — try again");
      const v = await getVoice();
      await v.speak('Could not submit. Try again.');
      return;
    }
    try {
      const data = await r.json();
      if (data?.id && typeof data.id === 'string') onReported?.(data.id);
    } catch {}
    setState('done');
    const v = await getVoice();
    await v.speak('Reported. Stay safe.');
    setTimeout(onDone, 1200);
  };

  // Keep posRef in sync. If we're waiting for location, submit as soon as it arrives.
  useEffect(() => {
    if (initialPosition) {
      posRef.current = initialPosition;
      if (waitingRef.current) {
        submitReport(pendingTranscriptRef.current, initialPosition);
      }
    }
  // submitReport is stable enough for this pattern; dep array intentionally omitted.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialPosition]);

  const startRecording = async () => {
    setErrorMsg(null);
    setTranscript('');
    setState('recording');
    const v = await getVoice();
    listenRef.current = v.listen({ timeoutMs: 12_000 });
    const text = await listenRef.current;
    setTranscript(text);
  };

  useEffect(() => {
    let cancelled = false;
    if (autoStart) {
      startRecording();
    } else {
      (async () => {
        const v = await getVoice();
        if (!cancelled) await v.speak("Tell me what's happening.");
      })();
    }
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onStart = startRecording;

  const onRelease = async () => {
    if (state !== 'recording') return;
    const text = (await listenRef.current) ?? '';
    if (!text.trim()) {
      setState('error');
      setErrorMsg("Didn't catch that — try again");
      const v = await getVoice();
      await v.speak("Didn't catch that — try again.");
      return;
    }
    setTranscript(text);

    if (posRef.current) {
      await submitReport(text, posRef.current);
    } else {
      // No location yet — hold the transcript and wait.
      pendingTranscriptRef.current = text;
      waitingRef.current = true;
      setState('waiting_location');
      // Fire a fast network-based lookup in parallel; watchPosition in page.tsx
      // will also trigger submitReport via the initialPosition effect above.
      navigator.geolocation?.getCurrentPosition(
        (g) => {
          const pos = { lat: g.coords.latitude, lng: g.coords.longitude };
          posRef.current = pos;
          if (waitingRef.current) submitReport(text, pos);
        },
        () => {},
        { enableHighAccuracy: false, timeout: 8_000 },
      );
    }
  };

  const onCancel = async () => {
    waitingRef.current = false;
    setState('idle');
    setTranscript('');
    const v = await getVoice();
    v.speak('Cancelled.');
  };

  const heading = {
    idle: "Tell me what's happening",
    recording: 'Listening…',
    waiting_location: 'Got it — finding your location…',
    submitting: 'Sending…',
    done: 'Reported',
    error: errorMsg ?? 'Try again',
  }[state];

  const isActive = state === 'recording';
  const isLocked = state === 'submitting' || state === 'done' || state === 'waiting_location';

  return (
    <div className="absolute inset-0 bg-[var(--paper)] flex flex-col">
      <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
        <div className={`mb-8 w-24 h-24 rounded-full flex items-center justify-center
          ${state === 'recording' || state === 'waiting_location'
            ? 'bg-[var(--accent)] animate-pulse'
            : 'bg-[var(--primary-3)]'}`}>
          <svg
            width="40"
            height="40"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={isActive || state === 'waiting_location' ? 'text-white' : 'text-[var(--primary)]'}
            aria-hidden="true"
          >
            <rect x="9" y="2" width="6" height="13" rx="3" />
            <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
            <path d="M12 19v3" />
          </svg>
        </div>
        <h1 className="display text-2xl text-[var(--ink)] mb-3">{heading}</h1>
        {transcript && (
          <p className="text-[var(--ink-3)] text-base max-w-md">&ldquo;{transcript}&rdquo;</p>
        )}
      </div>

      <div className="p-4 pb-8 space-y-3">
        <PushToTalkButton
          onStart={onStart} onRelease={onRelease} onCancel={onCancel}
          isActive={isActive}
          disabled={isLocked}
        >
          <div className="flex items-center gap-3">
            <span className="text-xl">●</span>
            <div className="display">
              {state === 'recording' ? 'Tap to send' :
               state === 'waiting_location' ? 'Finding location…' :
               'Tap to speak — anonymous'}
            </div>
          </div>
        </PushToTalkButton>
        <button
          onClick={onDone}
          className="w-full rounded-2xl px-5 py-3 text-[var(--ink-3)] bg-transparent">
          Cancel
        </button>
      </div>
    </div>
  );
}
