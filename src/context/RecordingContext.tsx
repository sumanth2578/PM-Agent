import React, { createContext, useContext, useState, useRef, useEffect, ReactNode } from 'react';

interface Highlight {
  timestamp: number;
  label: string;
}

interface RecordingContextType {
  isRecording: boolean;
  isPaused: boolean;
  recordingMode: 'microphone' | 'tab' | null;
  duration: number;
  startTime: Date | null;
  audioURL: string | null;
  highlights: Highlight[];
  error: string | null;
  apiStatus: { gemini: boolean; huggingface: boolean };
  audioSupported: boolean;
  startRecording: (mode?: 'microphone' | 'tab') => Promise<void>;
  stopRecording: () => void;
  pauseRecording: () => void;
  resumeRecording: () => void;
  markMoment: () => void;
  setError: (error: string | null) => void;
  clearRecording: () => void;
}

const RecordingContext = createContext<RecordingContextType | undefined>(undefined);

export const RecordingProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [recordingMode, setRecordingMode] = useState<'microphone' | 'tab' | null>(null);
  const [duration, setDuration] = useState(0);
  const [startTime, setStartTime] = useState<Date | null>(null);
  const [audioURL, setAudioURL] = useState<string | null>(null);
  const [highlights, setHighlights] = useState<Highlight[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [apiStatus, setApiStatus] = useState({ gemini: true, huggingface: true });
  const [audioSupported, setAudioSupported] = useState(true);

  useEffect(() => {
    const checkApiKeys = () => {
      setApiStatus({
        gemini: !!import.meta.env.VITE_GEMINI_API_KEY,
        huggingface: !!import.meta.env.VITE_HUGGINGFACE_API_KEY
      });
    };
    checkApiKeys();

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setAudioSupported(false);
    }
  }, []);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const durationIntervalRef = useRef<number | null>(null);
  const activeStreamsRef = useRef<MediaStream[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const maxRecordingDuration = 7200; // 2 hours

  useEffect(() => {
    if (startTime && !isPaused) {
      durationIntervalRef.current = window.setInterval(() => {
        const now = new Date();
        const diff = Math.floor((now.getTime() - startTime.getTime()) / 1000);
        setDuration(diff);
        if (diff >= maxRecordingDuration) {
          stopRecording();
        }
      }, 1000);
    } else if (durationIntervalRef.current) {
      clearInterval(durationIntervalRef.current);
    }
    return () => {
      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current);
      }
    };
  }, [startTime, isPaused]);

  const startRecording = async (mode: 'microphone' | 'tab' = 'microphone') => {
    try {
      setError(null);
      setHighlights([]);
      setDuration(0);
      setAudioURL(null);

      let stream: MediaStream;
      activeStreamsRef.current = [];

      if (mode === 'microphone') {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
          }
        });
        activeStreamsRef.current.push(stream);
      } else {
        const displayStream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: true
        });
        activeStreamsRef.current.push(displayStream);
        displayStream.getVideoTracks().forEach(track => track.stop());

        if (displayStream.getAudioTracks().length === 0) {
          displayStream.getTracks().forEach(t => t.stop());
          throw new Error('No audio track selected. Make sure to check "Share audio" when sharing a tab.');
        }

        let micStream: MediaStream | null = null;
        try {
          micStream = await navigator.mediaDevices.getUserMedia({
            audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
          });
          activeStreamsRef.current.push(micStream);
        } catch (micErr) {
          console.warn('Microphone access denied or unavailable during tab capture:', micErr);
        }

        const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        audioContextRef.current = audioContext;
        const dest = audioContext.createMediaStreamDestination();

        const tabSource = audioContext.createMediaStreamSource(new MediaStream([displayStream.getAudioTracks()[0]]));
        tabSource.connect(dest);

        if (micStream && micStream.getAudioTracks().length > 0) {
          const micSource = audioContext.createMediaStreamSource(new MediaStream([micStream.getAudioTracks()[0]]));
          micSource.connect(dest);
        }

        stream = dest.stream;

        displayStream.getAudioTracks()[0].onended = () => {
          if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
            stopRecording();
          }
        };
      }

      let options: MediaRecorderOptions = { audioBitsPerSecond: 12000 };
      const mimeTypes = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/mp4',
        'audio/ogg'
      ];
      for (const type of mimeTypes) {
        if (MediaRecorder.isTypeSupported(type)) {
          options.mimeType = type;
          break;
        }
      }

      const mediaRecorder = new MediaRecorder(stream, options);
      audioChunksRef.current = [];
      mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };
      mediaRecorder.onstop = () => {
        try {
          if (audioChunksRef.current.length === 0) return;
          const audioBlob = new Blob(audioChunksRef.current, { type: mediaRecorder.mimeType || 'audio/webm' });
          if (audioBlob.size < 1000) return;
          const url = URL.createObjectURL(audioBlob);
          setAudioURL(url);
        } catch (err) {
          console.error('Error processing recorded audio:', err);
        }
      };

      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start(1000);
      setIsRecording(true);
      setRecordingMode(mode);
      setStartTime(new Date());
    } catch (err) {
      console.error('Error starting recording:', err);
      setError(err instanceof Error ? err.message : 'Failed to start recording');
      throw err;
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop();
        setIsRecording(false);
        setRecordingMode(null);
        setIsPaused(false);
        setStartTime(null);
        
        // Stop all tracks to release hardware
        activeStreamsRef.current.forEach(stream => {
          stream.getTracks().forEach(track => track.stop());
        });
        activeStreamsRef.current = [];

        if (audioContextRef.current) {
          audioContextRef.current.close();
          audioContextRef.current = null;
        }
      } catch (err) {
        console.error('Error stopping recording:', err);
      }
    }
  };

  const pauseRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.pause();
      setIsPaused(true);
    }
  };

  const resumeRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'paused') {
      mediaRecorderRef.current.resume();
      setIsPaused(false);
    }
  };

  const markMoment = () => {
    if (!isRecording || isPaused) return;
    setHighlights(prev => [...prev, { timestamp: duration, label: 'Key Moment' }]);
  };

  const clearRecording = () => {
    setAudioURL(null);
    setDuration(0);
    setHighlights([]);
  };

  return (
    <RecordingContext.Provider value={{
      isRecording,
      isPaused,
      recordingMode,
      duration,
      startTime,
      audioURL,
      highlights,
      error,
      apiStatus,
      audioSupported,
      startRecording,
      stopRecording,
      pauseRecording,
      resumeRecording,
      markMoment,
      setError,
      clearRecording
    }}>
      {children}
    </RecordingContext.Provider>
  );
};

export const useRecording = () => {
  const context = useContext(RecordingContext);
  if (context === undefined) {
    throw new Error('useRecording must be used within a RecordingProvider');
  }
  return context;
};
