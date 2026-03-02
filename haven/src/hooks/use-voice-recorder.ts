'use client';

import { useState, useRef, useCallback } from 'react';

interface UseVoiceRecorderOptions {
  onTranscription?: (text: string) => void;
}

export function useVoiceRecorder(options?: UseVoiceRecorderOptions) {
  const [isRecording, setIsRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [transcription, setTranscription] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [duration, setDuration] = useState(0);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const startTimeRef = useRef<number>(0);

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        setAudioBlob(blob);
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start(100);
      setIsRecording(true);
      setError(null);
      startTimeRef.current = Date.now();

      timerRef.current = setInterval(() => {
        setDuration(Math.floor((Date.now() - startTimeRef.current) / 1000));
      }, 1000);
    } catch (err: unknown) {
      setError('Failed to start recording: ' + (err instanceof Error ? err.message : String(err)));
    }
  }, []);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (timerRef.current) clearInterval(timerRef.current);
    }
  }, [isRecording]);

  const transcribe = useCallback(async () => {
    if (!audioBlob) return;

    setLoading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('audio', audioBlob, 'recording.webm');

      const res = await fetch('/api/ai/voice-to-listing', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) throw new Error('Transcription failed');

      const data = await res.json();
      const text = data.transcription || data.text;
      setTranscription(text);
      options?.onTranscription?.(text);
      return text;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Transcription failed';
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [audioBlob, options]);

  const reset = useCallback(() => {
    setAudioBlob(null);
    setTranscription(null);
    setError(null);
    setDuration(0);
  }, []);

  return {
    isRecording,
    audioBlob,
    transcription,
    loading,
    error,
    duration,
    startRecording,
    stopRecording,
    transcribe,
    reset,
  };
}
