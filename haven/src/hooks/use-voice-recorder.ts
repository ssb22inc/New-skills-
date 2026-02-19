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

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

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

      mediaRecorder.start();
      setIsRecording(true);
      setError(null);
    } catch (err: any) {
      setError('Failed to start recording: ' + err.message);
    }
  }, []);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
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

      const { text } = await res.json();
      setTranscription(text);
      options?.onTranscription?.(text);
      return text;
    } catch (err: any) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [audioBlob, options]);

  const reset = useCallback(() => {
    setAudioBlob(null);
    setTranscription(null);
    setError(null);
  }, []);

  return {
    isRecording,
    audioBlob,
    transcription,
    loading,
    error,
    startRecording,
    stopRecording,
    transcribe,
    reset,
  };
}
