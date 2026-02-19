'use client';

import { useState, useRef, useEffect } from 'react';
import { Mic, Square, Loader2, AlertCircle, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useVoiceRecorder } from '@/hooks/use-voice-recorder';

interface VoiceRecorderProps {
  onTranscriptionComplete: (transcription: string) => void;
  onError?: (error: string) => void;
  maxDuration?: number; // in seconds
}

export function VoiceRecorder({
  onTranscriptionComplete,
  onError,
  maxDuration = 300, // 5 minutes default
}: VoiceRecorderProps) {
  const {
    isRecording,
    isPaused,
    duration,
    audioBlob,
    audioUrl,
    startRecording,
    stopRecording,
    pauseRecording,
    resumeRecording,
    clearRecording,
    error: recorderError,
  } = useVoiceRecorder();

  const [isTranscribing, setIsTranscribing] = useState(false);
  const [transcription, setTranscription] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Auto-stop when max duration is reached
  useEffect(() => {
    if (isRecording && duration >= maxDuration) {
      stopRecording();
    }
  }, [duration, maxDuration, isRecording, stopRecording]);

  // Handle recorder errors
  useEffect(() => {
    if (recorderError) {
      setError(recorderError);
      onError?.(recorderError);
    }
  }, [recorderError, onError]);

  const handleStart = async () => {
    setError(null);
    setTranscription(null);
    try {
      await startRecording();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to start recording';
      setError(message);
      onError?.(message);
    }
  };

  const handleStop = () => {
    stopRecording();
  };

  const handleTranscribe = async () => {
    if (!audioBlob) return;

    setIsTranscribing(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('audio', audioBlob, 'recording.webm');

      const response = await fetch('/api/ai/transcribe', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error('Transcription failed');
      }

      const data = await response.json();
      setTranscription(data.transcription);
      onTranscriptionComplete(data.transcription);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to transcribe audio';
      setError(message);
      onError?.(message);
    } finally {
      setIsTranscribing(false);
    }
  };

  const handleReset = () => {
    clearRecording();
    setTranscription(null);
    setError(null);
  };

  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <Card className="p-6">
      <div className="space-y-4">
        {/* Header */}
        <div className="text-center">
          <h3 className="text-lg font-semibold mb-1">Voice Description</h3>
          <p className="text-sm text-muted-foreground">
            Describe your property using your voice. We'll transcribe it for you.
          </p>
        </div>

        {/* Recording Interface */}
        <div className="flex flex-col items-center gap-4 py-6">
          {/* Recording Button */}
          {!isRecording && !audioBlob && (
            <Button
              size="lg"
              onClick={handleStart}
              className="h-20 w-20 rounded-full"
              disabled={isTranscribing}
            >
              <Mic className="h-8 w-8" />
            </Button>
          )}

          {/* Recording in Progress */}
          {isRecording && (
            <div className="flex flex-col items-center gap-4">
              <div className="relative">
                <Button
                  size="lg"
                  onClick={handleStop}
                  variant="destructive"
                  className="h-20 w-20 rounded-full animate-pulse"
                >
                  <Square className="h-8 w-8" />
                </Button>
                {/* Pulsing Ring Effect */}
                <div className="absolute inset-0 rounded-full border-4 border-destructive animate-ping opacity-50" />
              </div>

              <div className="text-center">
                <div className="text-3xl font-mono font-bold">
                  {formatDuration(duration)}
                </div>
                <div className="text-sm text-muted-foreground">
                  Recording... (max {formatDuration(maxDuration)})
                </div>
              </div>
            </div>
          )}

          {/* Recording Complete */}
          {!isRecording && audioBlob && !transcription && (
            <div className="flex flex-col items-center gap-4 w-full">
              <div className="flex items-center gap-2 text-green-600">
                <Check className="h-6 w-6" />
                <span className="font-semibold">
                  Recording complete ({formatDuration(duration)})
                </span>
              </div>

              {/* Audio Player */}
              {audioUrl && (
                <audio
                  src={audioUrl}
                  controls
                  className="w-full max-w-md"
                  preload="metadata"
                />
              )}

              {/* Action Buttons */}
              <div className="flex gap-3">
                <Button onClick={handleReset} variant="outline">
                  Record Again
                </Button>
                <Button onClick={handleTranscribe} disabled={isTranscribing}>
                  {isTranscribing ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Transcribing...
                    </>
                  ) : (
                    'Transcribe'
                  )}
                </Button>
              </div>
            </div>
          )}

          {/* Transcription Result */}
          {transcription && (
            <div className="w-full space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-green-600">
                  <Check className="h-5 w-5" />
                  <span className="font-semibold">Transcription complete</span>
                </div>
                <Button onClick={handleReset} variant="outline" size="sm">
                  Start Over
                </Button>
              </div>

              <div className="p-4 bg-muted rounded-lg">
                <p className="text-sm leading-relaxed whitespace-pre-wrap">
                  {transcription}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Error Message */}
        {error && (
          <div className="flex items-center gap-2 p-3 bg-destructive/10 text-destructive rounded-lg text-sm">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Tips */}
        {!isRecording && !audioBlob && !error && (
          <div className="text-xs text-muted-foreground text-center space-y-1">
            <p>💡 Speak clearly and describe the property's best features</p>
            <p>📍 Include location highlights and nearby amenities</p>
            <p>🏠 Mention unique characteristics that make it special</p>
          </div>
        )}
      </div>
    </Card>
  );
}
