'use client';

import { Mic, Square, Loader2, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useVoiceRecorder } from '@/hooks/use-voice-recorder';
import { cn } from '@/lib/utils/cn';

interface VoiceRecorderProps {
  onTranscription: (text: string) => void;
}

export function VoiceRecorder({ onTranscription }: VoiceRecorderProps) {
  const {
    isRecording,
    audioBlob,
    transcription,
    loading,
    error,
    startRecording,
    stopRecording,
    transcribe,
    reset,
  } = useVoiceRecorder({ onTranscription });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-center gap-4">
        {!audioBlob ? (
          <Button
            onClick={isRecording ? stopRecording : startRecording}
            size="lg"
            variant={isRecording ? 'destructive' : 'default'}
            className={cn('rounded-full h-16 w-16', isRecording && 'animate-pulse')}
          >
            {isRecording ? <Square className="h-6 w-6" /> : <Mic className="h-6 w-6" />}
          </Button>
        ) : (
          <div className="flex gap-2">
            <Button onClick={reset} variant="outline" size="lg">
              <RotateCcw className="h-5 w-5 mr-2" />
              Re-record
            </Button>
            <Button onClick={transcribe} size="lg" disabled={loading}>
              {loading ? (
                <Loader2 className="h-5 w-5 mr-2 animate-spin" />
              ) : (
                '✨'
              )}
              {loading ? 'Transcribing...' : 'Transcribe'}
            </Button>
          </div>
        )}
      </div>

      {isRecording && (
        <p className="text-center text-sm text-gray-500">
          Recording... Describe your property in detail
        </p>
      )}

      {audioBlob && !transcription && (
        <div className="flex justify-center">
          <audio src={URL.createObjectURL(audioBlob)} controls className="max-w-full" />
        </div>
      )}

      {transcription && (
        <div className="p-4 bg-gray-50 rounded-lg">
          <p className="text-sm text-gray-600">{transcription}</p>
        </div>
      )}

      {error && <p className="text-center text-sm text-red-600">{error}</p>}
    </div>
  );
}
