import { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Mic, MicOff, Monitor, Upload, CheckCircle, Sun, Moon, LogOut, Settings, Menu, History, Clock, Home, Brain, Sparkles, FileText, Users, Calendar as CalendarIcon, Video, Phone, Link2, ExternalLink } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useTheme } from '../context/ThemeContext';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { generatePRD, generateUserStories, generateSprintPlan, transcribeWithGroqWhisper, summarizeMeeting } from '../lib/gemini';
import { useGoogleLogin } from '@react-oauth/google';

import Calendar from 'react-calendar';
import 'react-calendar/dist/Calendar.css';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
// @ts-ignore
import html2pdf from 'html2pdf.js';

declare global {
  interface Window { gapi: any }
}

interface Highlight {
  timestamp: number;
  label: string;
}

interface MeetingSummary {
  id: string;
  date: string;
  duration: number;
  summary: string;
  transcript: string;
  type?: 'recorded' | 'calendar'; // Distinguish between recorded and synced meetings
  link?: string;
  platform?: string;
  highlights?: Highlight[];
}

type SpeechService = 'gemini';

export function MeetingSummarizer() {
  const { theme, toggleTheme } = useTheme();
  const [isRecording, setIsRecording] = useState(false);
  const [recordingMode, setRecordingMode] = useState<'microphone' | 'tab' | null>(null);
  const [isPaused, setIsPaused] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [transcribing, setTranscribing] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [startTime, setStartTime] = useState<Date | null>(null);
  const [duration, setDuration] = useState(0);
  const [summaryHistory, setSummaryHistory] = useState<MeetingSummary[]>([]);
  const [_isEmailDialogOpen, _setIsEmailDialogOpen] = useState(false);
  const [audioURL, setAudioURL] = useState<string | null>(null);
  const [audioSupported, setAudioSupported] = useState(true);
  const [apiStatus, setApiStatus] = useState<{ gemini: boolean; huggingface: boolean }>({
    gemini: true,
    huggingface: true
  });
  const [_speechService] = useState<SpeechService>('gemini');
  const [_showSettings, _setShowSettings] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [userEmail, setUserEmail] = useState('');
  const [userName, setUserName] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [meetingLink, setMeetingLink] = useState('');
  const [meetingDetails, setMeetingDetails] = useState<{
    platform?: string;
    date?: string;
    time?: string;
    duration?: string;
    error?: string;
    link?: string;
    timezone?: string;
  }>({});

  // PM Agent state
  const [pmLoading, setPmLoading] = useState(false);
  const [pmPRD, setPmPRD] = useState<string | null>(null);
  const [pmUserStories, setPmUserStories] = useState<string | null>(null);
  const [pmSprintPlan, setPmSprintPlan] = useState<string | null>(null);
  const [pmActiveTab, setPmActiveTab] = useState<'prd' | 'stories' | 'sprint'>('prd');
  const [highlights, setHighlights] = useState<Highlight[]>([]);

  const markMoment = () => {
    if (!isRecording || isPaused) return;
    const newHighlight = {
      timestamp: duration,
      label: 'Key Moment'
    };
    setHighlights(prev => [...prev, newHighlight]);

    // Optional: Visual feedback could be added here
  };

  const generatePMOutputs = async (summaryText: string) => {
    if (!summaryText || summaryText.trim() === '') return;
    setPmLoading(true);
    setPmPRD(null);
    setPmUserStories(null);
    setPmSprintPlan(null);

    // Wait before starting PM calls to avoid rate limiting after summary
    await new Promise(resolve => setTimeout(resolve, 5000));

    try {
      // Get fresh user ID to be certain
      const { data: { user } } = await supabase.auth.getUser();
      const currentUserId = user?.id;

      // Generate PRD first
      let prd = await generatePRD(summaryText).catch((e) => { console.error('PRD error:', e); return 'Failed to generate PRD. Please try again from the PRD Generator page.'; });

      // Cleanup literal stars that user dislikes
      prd = prd.replace(/\*\*/g, '').replace(/^\* /gm, '• ');
      setPmPRD(prd);

      // Save PRD to dedicated table if we have a currentUserId
      if (currentUserId && prd && !prd.startsWith('Failed')) {
        try {
          await supabase.from('prds').insert([{
            user_id: currentUserId,
            title: `Report: ${new Date().toLocaleDateString()}`,
            content: prd
          }]);
        } catch (e) {
          console.error('Error auto-saving PRD:', e);
        }
      }

      // Small delay between calls
      await new Promise(resolve => setTimeout(resolve, 3000));

      // Generate User Stories
      let stories = await generateUserStories(summaryText).catch((e: any) => { console.error('Stories error:', e); return 'Failed to generate user stories. Please try again from the User Stories page.'; });

      // Cleanup
      stories = stories.replace(/\*\*/g, '').replace(/^\* /gm, '• ');
      setPmUserStories(stories);

      // Save Stories to dedicated table
      if (currentUserId && stories && !stories.startsWith('Failed')) {
        try {
          await supabase.from('user_stories').insert([{
            user_id: currentUserId,
            feature: `Meeting: ${new Date().toLocaleDateString()}`,
            content: stories
          }]);
        } catch (e) {
          console.error('Error auto-saving Stories:', e);
        }
      }

      // Small delay between calls
      await new Promise(resolve => setTimeout(resolve, 3000));

      // Generate Sprint Plan
      let sprint = await generateSprintPlan(summaryText).catch((e: any) => { console.error('Sprint error:', e); return 'Failed to generate sprint plan. Please try again from the Sprint Planner page.'; });

      // Cleanup
      sprint = sprint.replace(/\*\*/g, '').replace(/^\* /gm, '• ');
      setPmSprintPlan(sprint);

      // Save Sprint to dedicated table
      if (currentUserId && sprint && !sprint.startsWith('Failed')) {
        try {
          await supabase.from('sprint_plans').insert([{
            user_id: currentUserId,
            backlog: `Auto-generated from meeting summary`,
            duration: `2 weeks`,
            content: sprint
          }]);
        } catch (e) {
          console.error('Error auto-saving Sprint:', e);
        }
      }
    } catch (err) {
      console.error('PM generation error:', err);
    } finally {
      setPmLoading(false);
    }
  };

  const [activeSession, setActiveSession] = useState<MeetingSummary | null>(null);
  const [calendarMeetings, setCalendarMeetings] = useState<MeetingSummary[]>([]);
  const [isCalendarConnected, setIsCalendarConnected] = useState(false);
  const [isSyncingCalendar, setIsSyncingCalendar] = useState(false);

  useEffect(() => {
    const fetchUserDetails = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setUserEmail(user.email || '');
        setUserName(user.user_metadata?.full_name || user.user_metadata?.name || '');
      }
    };
    fetchUserDetails();

    // Check if we have a cached calendar connection
    const storedCalendarState = localStorage.getItem('isCalendarConnected');
    if (storedCalendarState === 'true') {
      setIsCalendarConnected(true);
      const storedEvents = localStorage.getItem('calendarEvents_v2');
      if (storedEvents) {
        try {
          setCalendarMeetings(JSON.parse(storedEvents));
        } catch (e) {
          console.error("Failed to parse stored events", e);
        }
      }
    }

    // Auto-close sidebar on window resize if switching to desktop
    const handleResize = () => {
      if (window.innerWidth >= 768) {
        setSidebarOpen(false);
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const connectGoogleCalendar = useGoogleLogin({
    onSuccess: async (tokenResponse) => {
      setIsSyncingCalendar(true);
      try {
        const response = await fetch(
          `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${new Date().toISOString()}&maxResults=20&orderBy=startTime&singleEvents=true`,
          {
            headers: { Authorization: `Bearer ${tokenResponse.access_token}` },
          }
        );

        if (!response.ok) throw new Error('Failed to fetch calendar events');

        const data = await response.json();

        const events: MeetingSummary[] = data.items.map((item: any) => {
          // Detect platform based on link
          let platform = 'Meeting';
          const link = item.htmlLink || '';
          if (link.includes('meet.google.com') || item.hangoutLink) platform = 'Google Meet';
          else if (link.includes('zoom.us') || (item.location && item.location.includes('zoom.us'))) platform = 'Zoom';
          else if (link.includes('teams.microsoft.com') || (item.location && item.location.includes('teams.microsoft'))) platform = 'MS Teams';

          return {
            id: `cal-${item.id}`,
            date: item.start.dateTime || item.start.date,
            duration: item.end.dateTime && item.start.dateTime
              ? Math.floor((new Date(item.end.dateTime).getTime() - new Date(item.start.dateTime).getTime()) / 1000)
              : 3600, // Default 1 hour if all-day
            summary: item.summary || 'Untitled Event',
            transcript: item.description || '',
            type: 'calendar',
            link: item.hangoutLink || item.htmlLink || item.location,
            platform
          };
        });

        setCalendarMeetings(events);
        setIsCalendarConnected(true);
        localStorage.setItem('isCalendarConnected', 'true');
        localStorage.setItem('calendarEvents_v2', JSON.stringify(events));
      } catch (err) {
        console.error('Error connecting calendar:', err);
        setError('Failed to sync Google Calendar. Please try again.');
      } finally {
        setIsSyncingCalendar(false);
      }
    },
    scope: 'https://www.googleapis.com/auth/calendar.events.readonly',
    onError: error => {
      console.error('Login Failed:', error);
      setIsSyncingCalendar(false);
      setError('Google Calendar authentication failed.');
    }
  });

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const durationIntervalRef = useRef<number | null>(null);
  const activeStreamsRef = useRef<MediaStream[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const maxRecordingDuration = 7200; // Increased to 2 hours (7200 seconds)

  useEffect(() => {
    // Feature Check ONLY - do NOT call getUserMedia here to avoid premature prompt
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setAudioSupported(false);
      // We don't set error yet, only when user tries to record
    }
    const checkApiKeys = async () => {
      const geminiKey = import.meta.env.VITE_GEMINI_API_KEY;
      const huggingfaceKey = import.meta.env.VITE_HUGGINGFACE_API_KEY;
      setApiStatus({
        gemini: !!geminiKey,
        huggingface: !!huggingfaceKey
      });
    };
    checkApiKeys();
  }, []);

  useEffect(() => {
    return () => {
      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current);
      }
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
        stopRecording();
      }
    };
  }, []);

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

  const formatDuration = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainingSeconds = seconds % 60;
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  const fileInputRef = useRef<HTMLInputElement>(null);

  const startRecording = async (mode: 'microphone' | 'tab' = 'microphone') => {
    try {
      setError(null);
      setHighlights([]); // Reset highlights for new recording
      setDuration(0);
      setAudioURL(null);
      if (!apiStatus.huggingface) {
        throw new Error('Hugging Face API key is missing. Please check your .env file.');
      }
      if (!apiStatus.gemini) {
        throw new Error('Google Gemini API key is missing. Please check your .env file.');
      }
      if (mode === 'microphone' && (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia)) {
        throw new Error('Audio recording is not supported in this browser. Try using Chrome or Firefox.');
      }
      if (mode === 'tab' && (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia)) {
        throw new Error('Tab capturing is not supported in this browser.');
      }

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

        // We only want audio, so stop video tracks immediately
        displayStream.getVideoTracks().forEach(track => track.stop());

        // Ensure there's actually an audio track
        if (displayStream.getAudioTracks().length === 0) {
          displayStream.getTracks().forEach(t => t.stop());
          throw new Error('No audio track selected. Make sure to check "Share audio" when sharing a tab.');
        }

        // Try to capture microphone as well to mix
        let micStream: MediaStream | null = null;
        try {
          micStream = await navigator.mediaDevices.getUserMedia({
            audio: {
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true
            }
          });
          activeStreamsRef.current.push(micStream);
        } catch (micErr) {
          console.warn('Microphone access denied or unavailable during tab capture:', micErr);
        }

        const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        audioContextRef.current = audioContext;
        const dest = audioContext.createMediaStreamDestination();

        // Add tab audio to mixer
        const tabSource = audioContext.createMediaStreamSource(new MediaStream([displayStream.getAudioTracks()[0]]));
        tabSource.connect(dest);

        // Add mic audio to mixer if available
        if (micStream && micStream.getAudioTracks().length > 0) {
          const micSource = audioContext.createMediaStreamSource(new MediaStream([micStream.getAudioTracks()[0]]));
          micSource.connect(dest);
        }

        stream = dest.stream;

        // When the user clicks "Stop sharing" on the browser's native UI
        displayStream.getAudioTracks()[0].onended = () => {
          if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
            stopRecording();
          }
        };
      }
      // Compress audio bitrate so a 2-hour meeting perfectly fits within Gemini's 20MB limit (~14MB)
      let options: any = { audioBitsPerSecond: 16000 };
      if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
        options = { ...options, mimeType: 'audio/webm;codecs=opus' };
      } else if (MediaRecorder.isTypeSupported('audio/webm')) {
        options = { ...options, mimeType: 'audio/webm' };
      } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
        options = { ...options, mimeType: 'audio/mp4' };
      } else if (MediaRecorder.isTypeSupported('audio/ogg')) {
        options = { ...options, mimeType: 'audio/ogg' };
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
          if (audioChunksRef.current.length === 0) {
            throw new Error('No audio data was recorded. Please try again.');
          }
          const audioBlob = new Blob(audioChunksRef.current, { type: mediaRecorder.mimeType || 'audio/webm' });
          if (audioBlob.size < 1000) {
            throw new Error('Audio recording is too short or empty. Please try again.');
          }
          const url = URL.createObjectURL(audioBlob);
          setAudioURL(url);
        } catch (err) {
          console.error('Error processing recorded audio:', err);
          setError(err instanceof Error ? err.message : 'Failed to process recorded audio');
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
    }
  };

  const pauseRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      try {
        mediaRecorderRef.current.pause();
        setIsPaused(true);
      } catch (err) {
        console.error('Error pausing recording:', err);
        setError(err instanceof Error ? err.message : 'Failed to pause recording');
      }
    }
  };

  const resumeRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'paused') {
      try {
        mediaRecorderRef.current.resume();
        setIsPaused(false);
      } catch (err) {
        console.error('Error resuming recording:', err);
        setError(err instanceof Error ? err.message : 'Failed to resume recording');
      }
    }
  };

  const transcribeAndSummarizeWithGemini = async (audioBlob: Blob) => {
    try {
      const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
      if (!apiKey) throw new Error('Gemini API key is missing');

      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

      // Convert Blob to base64
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve) => {
        reader.onloadend = () => {
          const base64data = (reader.result as string).replace(/^data:.*?;base64,/, '');
          resolve(base64data);
        };
      });
      reader.readAsDataURL(audioBlob);
      const base64Data = await base64Promise;

      const prompt = `Please transcribe the following audio. Identity different speakers and label them (e.g., [Speaker A], [Speaker B]). 
      Then provide a concise summary.
      Format your response exactly as follows:
      ---TRANSCRIPTION---
      [Verbatim transcription with speaker labels here]
      ---SUMMARY---
      [Concise summary here]`;

      // Gemini is picky about MIME types - normalize to standard ones
      let mimeType = audioBlob.type.split(';')[0]; // Remove codecs etc.
      if (!mimeType || mimeType === 'audio/webm') mimeType = 'audio/webm';
      if (mimeType.includes('video')) mimeType = 'audio/webm'; // Treat video uploads as audio/webm for summarization if needed

      try {
        const result = await model.generateContent([
          {
            inlineData: {
              mimeType: mimeType,
              data: base64Data
            }
          },
          { text: prompt },
        ]);

        const responseText = result.response.text();

        const transcriptionMatch = responseText.match(/---TRANSCRIPTION---([\s\S]*?)---SUMMARY---/);
        const summaryMatch = responseText.match(/---SUMMARY---([\s\S]*)/);

        const transcription = transcriptionMatch ? transcriptionMatch[1].trim() : responseText;
        const summary = summaryMatch ? summaryMatch[1].trim() : "Summary could not be generated.";

        return { transcription, summary };
      } catch (geminiError: any) {
        console.warn('Gemini transcription/summarization failed, switching to Groq fallback...', geminiError?.message);

        // Fallback Step 1: Transcribe with Groq Whisper
        const transcription = await transcribeWithGroqWhisper(audioBlob);

        // Fallback Step 2: Summarize with Groq/Llama (via summarizeMeeting which has its own fallbacks)
        const summary = await summarizeMeeting(transcription);

        return { transcription, summary };
      }
    } catch (err) {
      console.error('Gemini Direct Error:', err);
      throw err;
    }
  };

  const stopRecording = async () => {
    if (!mediaRecorderRef.current || mediaRecorderRef.current.state === 'inactive') {
      return;
    }

    // Wrap the stop logic in a promise to ensure we only proceed after onstop fires
    const stopPromise = new Promise<void>((resolve) => {
      if (!mediaRecorderRef.current) return resolve();

      const originalOnStop = mediaRecorderRef.current.onstop;
      mediaRecorderRef.current.onstop = (e) => {
        if (originalOnStop) originalOnStop.call(mediaRecorderRef.current!, e);
        resolve();
      };

      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());

      // Stop all active original streams (tab, mic)
      activeStreamsRef.current.forEach(stream => {
        stream.getTracks().forEach(track => track.stop());
      });
      activeStreamsRef.current = [];

      // Close AudioContext
      if (audioContextRef.current) {
        audioContextRef.current.close().catch(console.error);
        audioContextRef.current = null;
      }
    });

    try {
      await stopPromise;
      setIsRecording(false);
      setRecordingMode(null);
      setIsPaused(false);
    } catch (err) {
      console.error('Error stopping recording:', err);
      setError(err instanceof Error ? err.message : 'Failed to stop recording');
      setIsRecording(false);
      setRecordingMode(null);
      setIsPaused(false);
      return;
    }

    setAudioURL(null); // Clear previous audio URL

    if (audioChunksRef.current.length > 0) {
      setTranscribing(true);
      setError(null);
      try {
        const audioBlob = new Blob(audioChunksRef.current, {
          type: mediaRecorderRef.current?.mimeType || 'audio/webm'
        });

        // Now safe to clear
        audioChunksRef.current = [];

        if (audioBlob.size < 1000) {
          throw new Error('Audio recording is too short or empty. Please try again.');
        }

        const result = await transcribeAndSummarizeWithGemini(audioBlob);

        if (!result.transcription) {
          throw new Error('Transcription was empty. The audio might have been too quiet or unrecognized.');
        }

        setTranscript(result.transcription);
        setSummary(result.summary || '');

        const newSummary: MeetingSummary = {
          id: Date.now().toString(),
          date: new Date().toISOString(),
          duration,
          summary: result.summary || '',
          transcript: result.transcription,
          highlights: [...highlights]
        };
        setSummaryHistory(updatedHistory => [newSummary, ...updatedHistory]);
        saveMeetingToDatabase(newSummary);
        setActiveSession(newSummary); // Keep current session visible on dashboard
        setHighlights([]); // Clear after saving

        // Auto-generate PM outputs from summary
        if (result.summary) {
          generatePMOutputs(result.summary);
        }
      } catch (err) {
        console.error('Transcription error:', err);
        setError(err instanceof Error ? err.message : 'Failed to process audio');
      } finally {
        setTranscribing(false);
      }
    } else {
      setError('No audio data was recorded. Please try again.');
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Gemini Inline API payload limit is 20MB. 
    // A heavily compressed 2-hour audio file is ~14MB.
    if (file.size > 20 * 1024 * 1024) {
      setError("File exceeds 20MB limit. For 2-hour meetings, please record directly in the app or heavily compress your audio file before uploading.");
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    try {
      if (!apiStatus.huggingface) {
        throw new Error('Hugging Face API key is missing. Please check your .env file.');
      }
      if (!apiStatus.gemini) {
        throw new Error('Google Gemini API key is missing. Please check your .env file.');
      }

      setTranscribing(true);
      setError(null);

      const result = await transcribeAndSummarizeWithGemini(file);

      if (!result.transcription) {
        throw new Error('Transcription was empty. Incompatible audio/video format or silent file.');
      }
      setTranscript(result.transcription);
      setSummary(result.summary || '');

      const newSummary: MeetingSummary = {
        id: Date.now().toString(),
        date: new Date().toISOString(),
        duration: 0,
        summary: result.summary || '',
        transcript: result.transcription
      };
      setSummaryHistory(updatedHistory => [newSummary, ...updatedHistory]);
      saveMeetingToDatabase(newSummary);
      setActiveSession(newSummary); // Keep visible

      // Auto-generate PM outputs from summary
      if (result.summary) {
        generatePMOutputs(result.summary);
      }

      // Clear file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to process uploaded file');
    } finally {
      setTranscribing(false);
    }
  };

  const handleSignOut = async () => {
    if (isRecording) {
      stopRecording();
    }
    await supabase.auth.signOut();
  };



  const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;
  const GOOGLE_API_KEY = import.meta.env.VITE_GOOGLE_API_KEY;
  const GOOGLE_DISCOVERY_DOCS = ["https://www.googleapis.com/discovery/v1/apis/calendar/v3/rest"];
  const GOOGLE_SCOPES = "https://www.googleapis.com/auth/calendar.readonly";

  useEffect(() => {
    const script = document.createElement('script');
    script.src = "https://apis.google.com/js/api.js";
    script.async = true;
    script.defer = true;
    script.crossOrigin = "anonymous";
    script.onload = () => {
      window.gapi.load('client:auth2', () => {
        window.gapi.client.init({
          apiKey: GOOGLE_API_KEY,
          clientId: GOOGLE_CLIENT_ID,
          discoveryDocs: GOOGLE_DISCOVERY_DOCS,
          scope: GOOGLE_SCOPES,
        });
      });
    };
    document.body.appendChild(script);
  }, []);





  const extractMeetingDetails = (input: string) => {
    let details: typeof meetingDetails = {};
    try {
      // Improved Link extraction
      const meetRegex = /(https:\/\/meet\.google\.com\/[a-z0-9-]+)/i;
      const zoomRegex = /(https:\/\/(?:[a-z0-9-]+\.)?zoom\.us\/(?:j|my)\/[a-z0-9?=-]+)/i;
      const teamsRegex = /(https:\/\/teams\.microsoft\.com\/l\/meetup-join\/[a-zA-Z0-9%._-]+)/i;

      let link = '';
      if (meetRegex.test(input)) {
        link = input.match(meetRegex)?.[1] || '';
        details.platform = 'Google Meet';
      } else if (zoomRegex.test(input)) {
        link = input.match(zoomRegex)?.[1] || '';
        details.platform = 'Zoom';
      } else if (teamsRegex.test(input)) {
        link = input.match(teamsRegex)?.[1] || '';
        details.platform = 'Microsoft Teams';
      }

      if (link) details.link = link;

      // Extract date and time - looking for common invite patterns
      // Handles: "Wednesday, March 6 · 2:00 – 3:00pm", "2024-03-06 14:00", etc.
      const datePatterns = [
        /([A-Za-z]+, [A-Za-z]+ \d{1,2}(?:, \d{4})?)/, // "Wednesday, March 6, 2024"
        /(\d{4}-\d{2}-\d{2})/, // "2024-03-06"
        /(\d{1,2}\/\d{1,2}\/\d{4})/ // "03/06/2024"
      ];

      const timePatterns = [
        /([0-9]{1,2}:[0-9]{2})\s*(?:am|pm)?\s*[–-]\s*([0-9]{1,2}:[0-9]{2})\s*(am|pm)/i, // "2:00 - 3:00pm"
        /([0-9]{1,2}:[0-9]{2})\s*(am|pm)\s*[–-]\s*([0-9]{1,2}:[0-9]{2})\s*(am|pm)/i, // "2:00pm - 3:00pm"
        /([0-9]{1,2}:[0-9]{2})/ // Fallback for single time
      ];

      for (const pattern of datePatterns) {
        const match = input.match(pattern);
        if (match) {
          details.date = match[1];
          break;
        }
      }

      for (const pattern of timePatterns) {
        const match = input.match(pattern);
        if (match) {
          details.time = match[0];
          // Simple duration guess
          if (match[1] && match[2]) {
            details.duration = "60 min"; // Default to 60 if we can't calculate perfectly
          }
          break;
        }
      }

      // Time zone
      const tzMatch = input.match(/(?:Time zone|GMT|UTC):\s*([^\n]+)/i);
      if (tzMatch) details.timezone = tzMatch[1].trim();

      if (!details.platform || !details.link) {
        details.error = 'Could not find a valid meeting link.';
      }
    } catch (e) {
      details.error = 'Failed to parse meeting details.';
    }
    return details;
  };

  // Add this function to save meeting to Supabase for the logged-in user
  const saveMeetingToDatabase = async (meeting: MeetingSummary, isCalendar = false) => {
    let email = userEmail;
    if (!email) {
      const { data: { user } } = await supabase.auth.getUser();
      email = user?.email || '';
    }

    if (!email) return;

    try {
      await supabase.from('meetings').insert([
        {
          id: meeting.id,
          user_email: email,
          date: meeting.date,
          duration: meeting.duration,
          transcript: meeting.transcript,
          summary: meeting.summary || '',
          is_calendar: isCalendar
        }
      ]);

      // Update local history for sync
      setSummaryHistory(prev => [meeting, ...prev]);
    } catch (err) {
      console.error('Error saving to DB:', err);
    }
  };

  // Refactored to only extract, not save
  const handleExtractDetails = () => {
    const details = extractMeetingDetails(meetingLink);
    setMeetingDetails(details);
  };

  // New function to explicitly add the extracted meeting
  const handleAddExtractedMeeting = () => {
    // Only require link and platform if we can fallback for date/time
    if (meetingDetails.platform && meetingDetails.link) {
      let meetingDate = new Date();
      if (meetingDetails.date) {
        try {
          meetingDate = new Date(meetingDetails.date);
          // If invalid date, fallback to today
          if (isNaN(meetingDate.getTime())) meetingDate = new Date();
        } catch { }
      }

      const newMeeting: MeetingSummary = {
        id: Date.now().toString(),
        date: meetingDate.toISOString(),
        duration: meetingDetails.duration ? parseInt(meetingDetails.duration) : 60,
        summary: `${meetingDetails.platform} Meeting`,
        transcript: `Link: ${meetingDetails.link}\nDate: ${meetingDetails.date || 'Today'}\nTime: ${meetingDetails.time || 'TBD'}\nDuration: ${meetingDetails.duration || '60 min'}\nTimeZone: ${meetingDetails.timezone || ''}`
      };

      setCalendarMeetings(prev => [newMeeting, ...prev]);
      saveMeetingToDatabase(newMeeting, true);

      setMeetingDetails({});
      setMeetingLink('');
      setError(null);
    } else {
      setMeetingDetails(prev => ({ ...prev, error: 'Link and platform are required.' }));
    }
  };

  const allMeetings = [...summaryHistory, ...calendarMeetings];
  allMeetings.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  // Dashboard list should ONLY show scheduled meetings (calendar events)
  const meetingsToDisplay = selectedDate
    ? calendarMeetings.filter(m => new Date(m.date).toDateString() === selectedDate.toDateString())
    : calendarMeetings;

  const groupedMeetings = meetingsToDisplay.reduce((acc, meeting) => {
    const date = new Date(meeting.date).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
    if (!acc[date]) acc[date] = [];
    acc[date].push(meeting);
    return acc;
  }, {} as Record<string, MeetingSummary[]>);

  const downloadFullReport = () => {
    const element = document.createElement('div');
    element.className = 'p-10 bg-white text-black font-sans';
    element.style.width = '800px';

    const dateStr = new Date().toLocaleDateString(undefined, {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    });

    // Basic Markdown to HTML conversion for PDF
    const mdToHtml = (md: string) => {
      return md
        .replace(/^# (.*$)/gm, '<h1 style="color: #ef4444; font-size: 24px; margin-top: 20px; border-bottom: 1px solid #eee; padding-bottom: 5px;">$1</h1>')
        .replace(/^## (.*$)/gm, '<h2 style="color: #333; font-size: 18px; margin-top: 15px; border-left: 4px solid #ef4444; padding-left: 10px;">$1</h2>')
        .replace(/^### (.*$)/gm, '<h3 style="color: #666; font-size: 16px; margin-top: 10px;">$1</h3>')
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.*?)\*/g, '<em>$1</em>')
        .replace(/^\- (.*$)/gm, '<li style="margin-left: 20px;">$1</li>')
        .replace(/\n\n/g, '<br/><br/>')
        .replace(/\n/g, '<br/>');
    };

    element.innerHTML = `
      <div style="border-bottom: 2px solid #ef4444; padding-bottom: 20px; margin-bottom: 30px;">
        <h1 style="color: #ef4444; font-size: 28px; margin: 0;">3.0Labs Intelligence Report</h1>
        <p style="color: #666; margin: 5px 0 0 0;">Generated on ${dateStr}</p>
      </div>

      <div style="margin-bottom: 30px;">
        <h2 style="color: #333; border-left: 4px solid #ef4444; padding-left: 15px; margin-bottom: 15px;">Meeting Summary</h2>
        <div style="line-height: 1.6; color: #444; font-size: 14px;">${mdToHtml(summary || '')}</div>
      </div>

      ${pmPRD ? `
      <div style="margin-bottom: 30px; page-break-before: always;">
        <h2 style="color: #333; border-left: 4px solid #ef4444; padding-left: 15px; margin-bottom: 15px;">Product Requirements Document (PRD)</h2>
        <div style="line-height: 1.6; color: #444; font-size: 14px;">${mdToHtml(pmPRD)}</div>
      </div>` : ''}

      ${pmUserStories ? `
      <div style="margin-bottom: 30px; page-break-before: always;">
        <h2 style="color: #333; border-left: 4px solid #ef4444; padding-left: 15px; margin-bottom: 15px;">User Stories</h2>
        <div style="line-height: 1.6; color: #444; font-size: 14px;">${mdToHtml(pmUserStories)}</div>
      </div>` : ''}

      ${pmSprintPlan ? `
      <div style="margin-bottom: 30px; page-break-before: always;">
        <h2 style="color: #333; border-left: 4px solid #ef4444; padding-left: 15px; margin-bottom: 15px;">Sprint Plan</h2>
        <div style="line-height: 1.6; color: #444; font-size: 14px;">${mdToHtml(pmSprintPlan)}</div>
      </div>` : ''}

      <div style="margin-top: 50px; padding-top: 20px; border-top: 1px solid #eee; font-size: 12px; color: #999; text-align: center;">
        © 2026 3.0Labs AI Meeting Intelligence. All rights reserved.
      </div>
    `;

    const opt = {
      margin: 10,
      filename: `3.0Labs_Report_${Date.now()}.pdf`,
      image: { type: 'jpeg' as const, quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true },
      jsPDF: { unit: 'mm' as const, format: 'a4' as const, orientation: 'portrait' as const }
    };

    html2pdf().from(element).set(opt).save();
  };

  // Add this function to remove a meeting by id
  const removeMeeting = async (id: string) => {
    try {
      await supabase.from('meetings').delete().eq('id', id);
      setCalendarMeetings(prev => prev.filter(m => m.id !== id));
      setSummaryHistory(prev => prev.filter(m => m.id !== id));
    } catch (err) {
      console.error('Error removing meeting:', err);
    }
  };

  // Remove very old meetings automatically (older than 2 days)
  useEffect(() => {
    setCalendarMeetings(prev =>
      prev.filter(m => {
        const meetingDate = new Date(m.date);
        const twoDaysAgo = new Date();
        twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
        return meetingDate >= twoDaysAgo;
      })
    );
  }, [calendarMeetings.length]);

  // Load meetings from Supabase when userDetails are ready
  useEffect(() => {
    const fetchAllMeetings = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data, error } = await supabase
          .from('meetings')
          .select('*')
          .eq('user_email', user.email)
          .order('date', { ascending: false });

        if (!error && data) {
          setCalendarMeetings(data.filter(m => m.is_calendar));
          setSummaryHistory(data.filter(m => !m.is_calendar));
        }
      }
    };
    fetchAllMeetings();
  }, [userEmail]);


  return (
    <div className={`flex h-screen w-full overflow-hidden transition-colors duration-300 ${theme === 'dark' ? 'bg-[#050505] text-white' : 'bg-slate-50 text-slate-900'}`}>
      {/* Mobile Sidebar Overlay */}
      {/* Massive Background Branding Text - RED THEME */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none overflow-hidden z-0 select-none">
        <div className="text-[20vw] font-black text-red-500/[0.03] whitespace-nowrap leading-none tracking-tighter transform -rotate-12 select-none animate-pulse-slow">
          3.0LABS
        </div>
      </div>

      {/* Roaming Spy Robot Background */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        <div className="absolute w-24 h-16 animate-robot-roam opacity-20">
          <div className="w-16 h-10 bg-[#1a1c24] border-b-2 border-red-500/50 rounded-b-2xl shadow-[0_5px_15px_rgba(239,68,68,0.2)] flex items-center justify-center relative">
            <div className="flex gap-2">
              <div className="w-1.5 h-1.5 bg-red-500 rounded-full animate-robot-blink"></div>
              <div className="w-1.5 h-1.5 bg-red-500 rounded-full animate-robot-blink"></div>
            </div>
            <div className="absolute bottom-0 left-0 right-0 h-[1px] bg-red-500/30 animate-scanner-red"></div>
          </div>
        </div>
      </div>

      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-30 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`
        fixed inset-y-0 left-0 z-40 w-64 bg-[#0B0C10] border-r border-white/10 transform transition-transform duration-300 ease-in-out flex flex-col pt-6 pb-4
        ${sidebarOpen ? 'translate-x-0 outline-none' : '-translate-x-full md:translate-x-0'}
      `}>
        <div className="flex items-center justify-between px-6 mb-8 relative">
          <div className="font-extrabold text-2xl bg-clip-text text-transparent bg-gradient-to-r from-red-500 via-red-300 to-red-500 tracking-tighter animate-gradient">3.0Labs</div>
          <button className="md:hidden text-gray-400 hover:text-white" onClick={() => setSidebarOpen(false)}>&times;</button>

          {/* Tiny Sidebar Robot */}
          <div className="absolute -top-4 -right-2 w-8 h-8 opacity-40 group-hover:opacity-100 transition-opacity">
            <div className="w-6 h-4 bg-[#1a1c24] border-b border-red-500/50 rounded-b-lg flex items-center justify-center relative">
              <div className="flex gap-1">
                <div className="w-0.5 h-0.5 bg-red-500 rounded-full"></div>
                <div className="w-0.5 h-0.5 bg-red-500 rounded-full"></div>
              </div>
            </div>
          </div>
        </div>
        <div className="mb-6 px-6">
          <button
            onClick={() => isRecording ? stopRecording() : startRecording('microphone')}
            className={`w-full flex items-center justify-center space-x-2 py-3 px-4 rounded-xl font-medium transition-all duration-300 ${isRecording && recordingMode === 'microphone'
              ? 'bg-red-500/10 text-red-500 border border-red-500/20 shadow-[0_0_15px_rgba(239,68,68,0.2)]'
              : 'bg-gradient-to-r from-red-600 to-red-800 text-white hover:from-red-500 hover:to-red-700 shadow-[0_0_20px_rgba(239,68,68,0.3)] hover:shadow-[0_0_30px_rgba(239,68,68,0.5)] border border-white/10'
              }`}
            disabled={!audioSupported || !apiStatus.gemini || !apiStatus.huggingface || (isRecording && recordingMode !== 'microphone')}
          >
            <Mic className="w-5 h-5" />
            <span>{isRecording && recordingMode === 'microphone' ? 'Stop Recording' : 'New Meeting'}</span>
          </button>
        </div>

        <div className="px-6 mb-6">
          <div className="flex flex-col mb-4">
            <div className="font-semibold text-white">{userName || "Your Name"}</div>
            <div className="text-xs text-gray-400">{userEmail || "your@email.com"}</div>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto custom-scrollbar py-2">
          <ul className="space-y-1 px-3">
            <li className="px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">Meetings</li>
            <li>
              <Link to="/summarizer" className={`${location.pathname === '/summarizer' ? 'bg-white/10 text-white' : 'text-gray-300'} hover:text-white hover:bg-white/5 font-medium rounded-xl px-3 py-2.5 transition-colors flex items-center`}>
                <Home className="w-5 h-5 mr-3 opacity-80" /> Dashboard
              </Link>
            </li>
            <li>
              <Link to="/history" className={`${location.pathname === '/history' ? 'bg-white/10 text-white' : 'text-gray-300'} hover:text-white hover:bg-white/5 font-medium rounded-xl px-3 py-2.5 transition-colors flex items-center`}>
                <History className="w-5 h-5 mr-3 opacity-80" /> Meeting History
              </Link>
            </li>
            <li>
              <Link to="/ai-chat" className={`${location.pathname === '/ai-chat' ? 'bg-red-600/10 text-red-500' : 'text-gray-300'} hover:text-white hover:bg-white/5 font-medium rounded-xl px-3 py-2.5 transition-colors flex items-center`}>
                <Brain className="w-5 h-5 mr-3 opacity-80" /> 3.0 Agent
              </Link>
            </li>
            <li className="pt-4 px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">PM Agent</li>
            <li>
              <Link to="/pm-dashboard" className="flex items-center text-gray-300 hover:text-white hover:bg-white/5 font-medium rounded-xl px-3 py-2.5 transition-colors">
                <Sparkles className="w-5 h-5 mr-3 text-red-500 animate-pulse" /> PM Dashboard
              </Link>
            </li>
            <li>
              <Link to="/prd-generator" className="flex items-center text-gray-300 hover:text-white hover:bg-white/5 font-medium rounded-xl px-3 py-2.5 transition-colors">
                <FileText className="w-5 h-5 mr-3 opacity-80" /> PRD Generator
              </Link>
            </li>
            <li>
              <Link to="/user-stories" className="flex items-center text-gray-300 hover:text-white hover:bg-white/5 font-medium rounded-xl px-3 py-2.5 transition-colors">
                <Users className="w-5 h-5 mr-3 opacity-80" /> User Stories
              </Link>
            </li>
            <li>
              <Link to="/sprint-planner" className="flex items-center text-gray-300 hover:text-white hover:bg-white/5 font-medium rounded-xl px-3 py-2.5 transition-colors">
                <CalendarIcon className="w-5 h-5 mr-3 opacity-80" /> Sprint Planner
              </Link>
            </li>
          </ul>
        </nav>
        <div className="px-6 space-y-2">
          {/* Theme Toggle */}
          <button
            onClick={toggleTheme}
            className="flex items-center w-full text-gray-400 hover:text-red-400 hover:bg-red-500/10 px-3 py-2.5 rounded-xl transition-all group"
          >
            {theme === 'dark' ? (
              <Sun className="w-5 h-5 mr-3 group-hover:rotate-180 transition-transform duration-500" />
            ) : (
              <Moon className="w-5 h-5 mr-3 group-hover:-rotate-12 transition-transform duration-500" />
            )}
            {theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
          </button>
          <button
            onClick={handleSignOut}
            className="flex items-center w-full text-gray-400 hover:text-red-400 hover:bg-red-500/10 px-3 py-2.5 rounded-xl transition-colors"
          >
            <LogOut className="w-5 h-5 mr-3" /> Sign Out
          </button>
        </div>
      </aside >
      <button
        className="md:hidden fixed top-4 right-4 z-50 bg-[#0B0C10] border border-white/10 rounded-full p-2 shadow-lg"
        onClick={() => setSidebarOpen(!sidebarOpen)}
        aria-label="Open menu"
      >
        <Menu className="w-6 h-6 text-white" />
      </button>
      <div className="flex-1 flex flex-col md:ml-64 h-screen overflow-hidden relative">
        {/* Ambient orbs - RED THEME */}
        <div className="absolute top-0 right-0 -mr-20 -mt-20 w-96 h-96 bg-red-600/20 rounded-full blur-[120px] animate-float pointer-events-none"></div>
        <div className="absolute bottom-0 left-0 -ml-20 -mb-20 w-80 h-80 bg-red-900/20 rounded-full blur-[100px] animate-float-slow pointer-events-none"></div>
        <div className="absolute top-1/3 right-1/4 w-60 h-60 bg-red-500/10 rounded-full blur-[80px] animate-orb-pulse pointer-events-none"></div>
        <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-red-500 to-transparent animate-shimmer z-20"></div>

        {/* Mobile Sidebar Overlay */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60] md:hidden animate-fade-in"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        <header className="flex flex-col lg:flex-row items-start lg:items-center justify-between px-6 md:px-10 py-6 bg-[#0B0C10]/80 backdrop-blur-xl border-b border-white/5 z-30 flex-shrink-0 gap-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 w-full">
            <div className="flex items-center justify-between w-full lg:w-auto gap-4 shrink-0">
              <div className="flex items-center gap-4">
                <button
                  className="md:hidden text-gray-400 hover:text-white p-2 hover:bg-white/5 rounded-lg active:scale-95 transition-all"
                  onClick={() => setSidebarOpen(true)}
                  aria-label="Open Menu"
                >
                  <Menu className="w-6 h-6" />
                </button>
                <h1 className="text-xl md:text-2xl font-bold text-white tracking-tight flex items-center gap-2">
                  <span className="w-2 h-8 bg-red-600 rounded-full animate-pulse shadow-[0_0_10px_rgba(220,38,38,0.5)] hidden sm:block"></span>
                  Meetings
                </h1>
              </div>
              <div className="flex lg:hidden">
                <button
                  onClick={() => _setShowSettings(true)}
                  className="p-2 bg-white/5 hover:bg-red-500/10 text-gray-400 hover:text-red-400 rounded-xl border border-white/10 transition-all"
                >
                  <Settings className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Recording Controls - RESTORED */}
            <div className="flex flex-wrap gap-2 sm:gap-3 z-40">
              <button
                className={`px-4 py-2.5 font-bold rounded-xl transition-all flex items-center shadow-lg group active:scale-95 ${isRecording && recordingMode === 'microphone'
                  ? 'bg-red-500 text-white animate-pulse border border-red-400'
                  : 'bg-white/5 text-white hover:bg-white/10 border border-white/10 hover:border-red-500/50'
                  }`}
                onClick={() => isRecording ? stopRecording() : startRecording('microphone')}
                disabled={!audioSupported || !apiStatus.gemini || !apiStatus.huggingface || (isRecording && recordingMode !== 'microphone')}
              >
                <Mic className={`w-4 h-4 mr-2 transition-transform group-hover:scale-110 ${isRecording ? 'text-white' : 'text-red-500'}`} />
                {isRecording && recordingMode === 'microphone' ? "Stop Recording" : "Record Mic"}
              </button>

              <button
                className={`px-4 py-2.5 font-bold rounded-xl transition-all flex items-center shadow-lg group active:scale-95 ${isRecording && recordingMode === 'tab'
                  ? 'bg-red-600 text-white animate-pulse border border-red-500'
                  : 'bg-white/5 text-white hover:bg-white/10 border border-white/10 hover:border-red-500/50'
                  }`}
                onClick={() => isRecording ? stopRecording() : startRecording('tab')}
                disabled={!audioSupported || !apiStatus.gemini || !apiStatus.huggingface || (isRecording && recordingMode !== 'tab')}
              >
                <Monitor className={`w-4 h-4 mr-2 transition-transform group-hover:scale-110 ${isRecording ? 'text-white' : 'text-red-500'}`} />
                {isRecording && recordingMode === 'tab' ? "Stop Capture" : "Capture Tab"}
              </button>

              <input
                type="file"
                accept="audio/*,video/*"
                className="hidden"
                ref={fileInputRef}
                onChange={handleFileUpload}
              />
              <button
                className="px-4 py-2.5 bg-white/5 text-white font-bold rounded-xl hover:bg-white/10 border border-white/10 hover:border-red-500/50 transition-all flex items-center shadow-lg active:scale-95 group"
                onClick={() => fileInputRef.current?.click()}
                disabled={isRecording || !apiStatus.gemini || !apiStatus.huggingface}
              >
                <Upload className="w-4 h-4 mr-2 text-red-500 transition-transform group-hover:-translate-y-1" />
                Upload
              </button>

              <button
                onClick={() => !isSyncingCalendar && connectGoogleCalendar()}
                disabled={isSyncingCalendar}
                className={`px-4 py-2.5 font-bold rounded-xl transition-all flex items-center shadow-lg active:scale-95 group border ${isCalendarConnected
                  ? 'bg-blue-500/10 text-blue-400 border-blue-500/20 hover:bg-blue-500/20'
                  : 'bg-white/5 text-white border-white/10 hover:bg-white/10 hover:border-red-500/50'
                  }`}
                title={isCalendarConnected ? "Refresh Google Calendar" : "Sync Google Calendar"}
              >
                {isSyncingCalendar ? (
                  <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin mr-2" />
                ) : (
                  <CalendarIcon className={`w-4 h-4 mr-2 transition-transform group-hover:rotate-12 ${isCalendarConnected ? 'text-blue-400' : 'text-red-500'}`} />
                )}
                <span className="hidden sm:inline">{isSyncingCalendar ? 'Syncing...' : (isCalendarConnected ? 'Refresh' : 'Sync Cal')}</span>
                <span className="sm:hidden">{isSyncingCalendar ? '...' : (isCalendarConnected ? 'Ref' : 'Cal')}</span>
              </button>

            </div>
          </div>

          <div className="hidden lg:flex items-center space-x-6 w-full lg:w-auto justify-end">
            <nav className="flex space-x-6 text-gray-400 font-bold text-xs uppercase tracking-widest bg-white/5 px-4 py-2 rounded-full border border-white/5">
              <span className="text-red-500 cursor-default">Meetings</span>
              <span className="hover:text-white cursor-pointer transition-colors" onClick={() => {/* navigate to calendar */ }}>Calendar</span>
            </nav>
            <button
              onClick={() => _setShowSettings(true)}
              className="p-2.5 bg-white/5 hover:bg-red-500/10 text-gray-400 hover:text-red-400 rounded-xl border border-white/10 transition-all hover:rotate-90"
            >
              <Settings className="w-5 h-5" />
            </button>
          </div>
        </header>
        <div className="flex flex-1 flex-col xl:flex-row relative overflow-hidden h-full">
          <section className="flex-1 px-4 md:px-10 py-8 overflow-y-auto z-10">
            {error && (
              <div className="mb-6 p-4 bg-red-500/10 border border-red-500/30 text-red-400 rounded-xl flex items-center justify-between">
                <span>{error}</span>
                <button onClick={() => setError(null)} className="text-red-400 hover:text-white">&times;</button>
              </div>
            )}

            {transcribing && (
              <div className="mb-8 p-8 bg-red-500/10 border border-red-500/30 rounded-2xl flex flex-col items-center justify-center space-y-4 animate-pulse">
                <div className="w-12 h-12 border-4 border-red-500 border-t-transparent rounded-full animate-spin"></div>
                <div className="text-red-400 font-semibold text-lg">Processing your meeting...</div>
                <div className="text-gray-400 text-sm">This can take a minute for longer recordings.</div>
              </div>
            )}
            <div className="mb-8 p-6 bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl shadow-xl animate-fade-in-up hover-glow-red">
              <div className="font-semibold mb-4 text-white text-lg tracking-tight">Extract Meeting Details from Link</div>
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                <input
                  type="text"
                  value={meetingLink}
                  onChange={e => setMeetingLink(e.target.value)}
                  placeholder="Paste your Google Meet, Zoom, or Teams link here"
                  className="flex-1 px-4 py-3 bg-black/40 border border-white/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-500/50 focus:border-red-500 transition-all text-white placeholder-gray-600 shadow-inner w-full"
                />
                <button
                  onClick={handleExtractDetails}
                  className="px-6 py-3 bg-red-600 text-white font-medium rounded-xl hover:bg-red-500 shadow-[0_0_15px_rgba(239,68,68,0.3)] transition-all whitespace-nowrap active:scale-95"
                >
                  Extract Details
                </button>
              </div>
              {meetingDetails.platform && (
                <div className="mt-6 text-gray-300 p-4 bg-black/20 rounded-xl border border-white/5 space-y-2">
                  <div className="flex items-center">
                    <strong className="text-gray-400 w-24">Platform:</strong>
                    <span className="text-white">{meetingDetails.platform}</span>
                  </div>
                  {meetingDetails.link && <div className="flex items-start"><strong className="text-gray-400 w-24 flex-shrink-0">Link:</strong> <a href={meetingDetails.link} target="_blank" rel="noopener noreferrer" className="text-red-400 hover:text-red-300 break-all">{meetingDetails.link}</a></div>}
                  {meetingDetails.date && <div className="flex items-center"><strong className="text-gray-400 w-24">Date:</strong> <span className="text-white">{meetingDetails.date}</span></div>}
                  {meetingDetails.time && <div className="flex items-center"><strong className="text-gray-400 w-24">Time:</strong> <span className="text-white">{meetingDetails.time}</span></div>}
                  {meetingDetails.duration && <div className="flex items-center"><strong className="text-gray-400 w-24">Duration:</strong> <span className="text-white">{meetingDetails.duration}</span></div>}
                  {meetingDetails.timezone && <div className="flex items-center"><strong className="text-gray-400 w-24">Time Zone:</strong> <span className="text-white">{meetingDetails.timezone}</span></div>}

                  <div className="mt-6 pt-4 border-t border-white/5 flex gap-3">
                    <button
                      onClick={handleAddExtractedMeeting}
                      className="px-6 py-2.5 bg-emerald-600 text-white font-semibold rounded-xl hover:bg-emerald-500 shadow-lg transition-all flex items-center gap-2"
                    >
                      <CheckCircle className="w-4 h-4" />
                      Add to Meetings
                    </button>
                    <button
                      onClick={() => setMeetingDetails({})}
                      className="px-6 py-2.5 bg-white/5 text-gray-400 font-medium rounded-xl hover:bg-white/10 transition-all"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
              {meetingDetails.error && (
                <div className="mt-4 p-3 bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl text-sm">{meetingDetails.error}</div>
              )}
            </div>
            {isRecording && (
              <div className="mb-8 p-6 bg-white/5 backdrop-blur-xl border border-red-500/30 rounded-2xl flex items-center space-x-6 shadow-[0_0_30px_rgba(239,68,68,0.1)] relative overflow-hidden animate-scale-in animate-border-glow">
                <div className="absolute inset-0 bg-red-500/5 animate-pulse"></div>
                <div className="flex items-center space-x-3 relative z-10 w-full justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 rounded-full bg-red-500/20 flex items-center justify-center">
                      <Clock className="w-5 h-5 text-red-400" />
                    </div>
                    <span className="font-medium text-white text-lg">
                      {formatDuration(duration)}
                    </span>
                    {!isPaused && (
                      <span className="inline-block ml-3 w-2.5 h-2.5 bg-red-500 rounded-full animate-record-pulse"></span>
                    )}
                    {isPaused && (
                      <span className="ml-3 text-yellow-500 font-medium text-sm px-2 py-0.5 rounded-full bg-yellow-500/20 border border-yellow-500/30">Paused</span>
                    )}
                  </div>
                  <div className="flex space-x-3">
                    <button
                      onClick={markMoment}
                      className="px-5 py-2.5 bg-emerald-500/20 text-emerald-400 font-medium rounded-xl hover:bg-emerald-500/30 border border-emerald-500/30 transition-all flex items-center active:scale-95 group"
                      title="Mark Key Moment"
                    >
                      <Sparkles className="w-4 h-4 mr-2 group-hover:rotate-12 transition-transform" />
                      <span className="hidden sm:inline">Mark Moment</span>
                      <span className="sm:hidden">Mark</span>
                      {highlights.length > 0 && (
                        <span className="ml-2 bg-emerald-500 text-white text-[10px] px-1.5 py-0.5 rounded-full">
                          {highlights.length}
                        </span>
                      )}
                    </button>
                    <button
                      onClick={isPaused ? resumeRecording : pauseRecording}
                      className="px-5 py-2.5 bg-white/10 text-white font-medium rounded-xl hover:bg-white/20 transition-colors border border-white/10"
                    >
                      {isPaused ? (
                        <>
                          <span className="inline-block mr-2">&#9654;</span> Resume
                        </>
                      ) : (
                        <>
                          <span className="inline-block mr-2">&#10073;&#10073;</span> Pause
                        </>
                      )}
                    </button>
                    <button
                      onClick={stopRecording}
                      className="px-5 py-2.5 bg-red-500/20 text-red-400 font-medium rounded-xl hover:bg-red-500/30 border border-red-500/30 transition-colors flex items-center"
                    >
                      <MicOff className="w-4 h-4 mr-2" /> Stop
                    </button>
                  </div>
                </div>
              </div>
            )}
            {audioURL && (
              <div className="mb-8 p-6 bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl">
                <div className="font-semibold mb-4 text-white text-lg">Recorded Audio Preview</div>
                <audio controls src={audioURL} className="w-full opacity-90 custom-audio" />
              </div>
            )}
            {/* Latest Recorded Session Result (Not yet in history tab until move) */}
            {activeSession && (
              <div className="mb-8 p-6 bg-red-500/10 border border-red-500/30 rounded-2xl animate-scale-in">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>
                    <span className="font-bold text-red-400">Recorded Session Ready</span>
                  </div>
                  <button
                    onClick={() => setActiveSession(null)}
                    className="text-gray-500 hover:text-white"
                  >
                    &times;
                  </button>
                </div>
                <div className="text-white text-sm line-clamp-3 mb-4 opacity-80">{activeSession.summary}</div>
                <Link
                  to="/history"
                  className="inline-flex items-center text-xs font-bold text-red-400 hover:text-red-300 gap-1 bg-red-500/10 px-3 py-1.5 rounded-lg border border-red-500/20"
                >
                  View Full History <ExternalLink className="w-3 h-3" />
                </Link>
              </div>
            )}

            {summary && (
              <div className="mb-8 p-6 bg-red-500/5 backdrop-blur-xl border border-red-500/20 rounded-2xl shadow-[0_0_20px_rgba(239,68,68,0.1)] animate-slide-in-bottom hover-glow-red">
                <div className="font-semibold mb-4 text-red-400 text-lg flex items-center justify-between">
                  <div className="flex items-center">
                    <div className="w-2 h-2 bg-red-500 rounded-full mr-3 animate-pulse"></div>
                    Latest Summary
                  </div>
                  <button
                    onClick={downloadFullReport}
                    className="flex items-center gap-2 px-4 py-2 bg-red-600/20 hover:bg-red-600/30 text-red-500 border border-red-500/30 rounded-xl text-xs font-bold transition-all active:scale-95 shadow-lg shadow-red-900/20"
                  >
                    <Upload className="w-3.5 h-3.5 rotate-180" />
                    Download Full Report
                  </button>
                </div>
                <div className="text-white leading-relaxed premium-summary max-w-none">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {summary}
                  </ReactMarkdown>
                </div>

                {highlights.length > 0 && (
                  <div className="mt-8 pt-6 border-t border-white/10 animate-fade-in-up">
                    <div className="text-xs font-black text-emerald-400 uppercase tracking-[0.2em] mb-4 flex items-center gap-3">
                      <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-ping"></div>
                      Intelligence: Marked Moments ({highlights.length})
                    </div>
                    <div className="flex flex-wrap gap-2.5">
                      {highlights.map((h, i) => (
                        <div key={i} className="group flex items-center gap-2 px-3.5 py-2 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-xs text-emerald-300 hover:bg-emerald-500/20 hover:border-emerald-500/30 transition-all cursor-default shadow-sm hover:shadow-emerald-900/40">
                          <span className="font-mono font-bold opacity-60 bg-emerald-900/30 px-1.5 py-0.5 rounded-lg">{formatDuration(h.timestamp)}</span>
                          <span className="font-semibold tracking-wide">{h.label}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
            {transcript && (
              <div className="mb-8 p-6 bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl">
                <div className="font-semibold mb-4 text-white text-lg flex items-center justify-between">
                  <span>Transcript</span>
                  <span className="text-[10px] bg-white/5 px-2 py-1 rounded border border-white/10 text-gray-500 uppercase">AI Diarization Active</span>
                </div>
                <div className="text-gray-300 leading-relaxed whitespace-pre-wrap font-sans text-sm md:text-base">
                  {transcript.split('\n').map((line, i) => {
                    const speakerMatch = line.match(/^\[(Speaker [A-Z])\]:/);
                    if (speakerMatch) {
                      const speaker = speakerMatch[1];
                      const content = line.replace(speakerMatch[0], '').trim();
                      const colorClass = speaker.endsWith('A') ? 'text-red-400 bg-red-400/10 border-red-400/20' :
                        speaker.endsWith('B') ? 'text-blue-400 bg-blue-400/10 border-blue-400/20' :
                          speaker.endsWith('C') ? 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20' :
                            'text-purple-400 bg-purple-400/10 border-purple-400/20';

                      return (
                        <div key={i} className="mb-4 last:mb-0 group">
                          <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold mr-2 border ${colorClass}`}>
                            {speaker}
                          </span>
                          <span>{content}</span>
                        </div>
                      );
                    }
                    return <p key={i} className="mb-3 last:mb-0">{line}</p>;
                  })}
                </div>
              </div>
            )}

            {/* PM Agent Outputs */}
            {(pmLoading || pmPRD || pmUserStories || pmSprintPlan) && (
              <div className="mb-8 animate-fade-in-up">
                <div className="flex items-center gap-3 mb-4">
                  <Sparkles className="w-6 h-6 text-red-400" />
                  <h2 className="text-xl font-bold text-white tracking-tight">PM Agent Insights</h2>
                  {pmLoading && <div className="w-4 h-4 border-2 border-red-400 border-t-transparent rounded-full animate-spin" />}
                </div>

                {/* Tabs */}
                <div className="flex gap-2 mb-4">
                  {[
                    { key: 'prd' as const, label: 'PRD', icon: <FileText className="w-4 h-4" />, activeClass: 'bg-red-500/20 text-red-400 border border-red-500/30 shadow-[0_0_15px_rgba(239,68,68,0.15)]' },
                    { key: 'stories' as const, label: 'User Stories', icon: <Users className="w-4 h-4" />, activeClass: 'bg-purple-500/20 text-purple-400 border border-purple-500/30 shadow-[0_0_15px_rgba(168,85,247,0.15)]' },
                    { key: 'sprint' as const, label: 'Sprint Plan', icon: <CalendarIcon className="w-4 h-4" />, activeClass: 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 shadow-[0_0_15px_rgba(16,185,129,0.15)]' },
                  ].map(tab => (
                    <button
                      key={tab.key}
                      onClick={() => setPmActiveTab(tab.key)}
                      className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${pmActiveTab === tab.key
                        ? tab.activeClass
                        : 'bg-white/5 text-gray-400 border border-white/10 hover:bg-white/10 hover:text-white'
                        }`}
                    >
                      {tab.icon}
                      {tab.label}
                    </button>
                  ))}
                </div>

                {/* Tab Content */}
                {pmLoading && !pmPRD && !pmUserStories && !pmSprintPlan && (
                  <div className="p-8 bg-red-500/5 border border-red-500/20 rounded-2xl flex flex-col items-center space-y-4 animate-pulse">
                    <div className="w-12 h-12 border-4 border-red-500 border-t-transparent rounded-full animate-spin" />
                    <div className="text-red-400 font-semibold text-lg">AI is generating PM insights...</div>
                    <div className="text-gray-400 text-sm">Creating PRD, User Stories, and Sprint Plan from your meeting summary</div>
                  </div>
                )}

                {pmActiveTab === 'prd' && pmPRD && (
                  <div className="p-6 bg-red-500/5 backdrop-blur-xl border border-red-500/20 rounded-2xl shadow-xl animate-fade-in-up">
                    <div className="flex items-center justify-between mb-4">
                      <div className="font-semibold text-red-400 text-lg flex items-center"><div className="w-2 h-2 bg-red-500 rounded-full mr-3" />Product Requirements Document</div>
                      <button onClick={() => navigator.clipboard.writeText(pmPRD)} className="p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors text-xs">Copy</button>
                    </div>
                    <div className="text-white leading-relaxed premium-summary max-w-none prose prose-invert">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {pmPRD}
                      </ReactMarkdown>
                    </div>
                  </div>
                )}

                {pmActiveTab === 'stories' && pmUserStories && (
                  <div className="p-6 bg-purple-500/5 backdrop-blur-xl border border-purple-500/20 rounded-2xl shadow-xl animate-fade-in-up">
                    <div className="flex items-center justify-between mb-4">
                      <div className="font-semibold text-purple-400 text-lg flex items-center"><div className="w-2 h-2 bg-purple-500 rounded-full mr-3" />User Stories</div>
                      <button onClick={() => navigator.clipboard.writeText(pmUserStories)} className="p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors text-xs">Copy</button>
                    </div>
                    <div className="text-white leading-relaxed premium-summary max-w-none prose prose-invert">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {pmUserStories}
                      </ReactMarkdown>
                    </div>
                  </div>
                )}

                {pmActiveTab === 'sprint' && pmSprintPlan && (
                  <div className="p-6 bg-emerald-500/5 backdrop-blur-xl border border-emerald-500/20 rounded-2xl shadow-xl animate-fade-in-up">
                    <div className="flex items-center justify-between mb-4">
                      <div className="font-semibold text-emerald-400 text-lg flex items-center"><div className="w-2 h-2 bg-emerald-500 rounded-full mr-3" />Sprint Plan</div>
                      <button onClick={() => navigator.clipboard.writeText(pmSprintPlan)} className="p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors text-xs">Copy</button>
                    </div>
                    <div className="text-white leading-relaxed premium-summary max-w-none prose prose-invert">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {pmSprintPlan}
                      </ReactMarkdown>
                    </div>
                  </div>
                )}

                {/* Loading indicator for individual tabs */}
                {pmLoading && (
                  (pmActiveTab === 'prd' && !pmPRD) ||
                  (pmActiveTab === 'stories' && !pmUserStories) ||
                  (pmActiveTab === 'sprint' && !pmSprintPlan)
                ) && (pmPRD || pmUserStories || pmSprintPlan) && (
                    <div className="p-6 bg-white/5 border border-white/10 rounded-2xl flex items-center gap-4">
                      <div className="w-6 h-6 border-2 border-red-400 border-t-transparent rounded-full animate-spin" />
                      <span className="text-gray-400 text-sm">Still generating this section...</span>
                    </div>
                  )}
              </div>
            )}
            {Object.keys(groupedMeetings).length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full py-20">
                <div className="w-24 h-24 mb-6 rounded-3xl bg-red-500/10 flex items-center justify-center border border-red-500/20 relative shadow-[0_0_30px_rgba(239,68,68,0.15)]">
                  <div className="absolute inset-0 bg-red-500/20 rounded-3xl blur-xl pb-4"></div>
                  <History className="w-10 h-10 text-red-400 relative z-10" />
                </div>
                <div className="text-2xl font-bold mb-3 text-white tracking-tight">No Events Scheduled</div>
                <div className="mb-8 text-gray-400 text-center max-w-sm leading-relaxed">
                  {selectedDate ? (
                    `No scheduled events found for ${selectedDate.toLocaleDateString()}.`
                  ) : isCalendarConnected ? (
                    "Your calendar is clear for the next 7 days. Use the Sync button above to refresh your feed at any time."
                  ) : (
                    "Your calendar is clear. Connect your Google Calendar to automatically view your upcoming meetings."
                  )}
                </div>
                {!isCalendarConnected && !selectedDate && (
                  <button
                    onClick={() => !isSyncingCalendar && connectGoogleCalendar()}
                    disabled={isSyncingCalendar}
                    className="inline-flex items-center px-8 py-3.5 bg-red-600 text-white font-bold rounded-2xl hover:bg-red-500 shadow-[0_0_20px_rgba(239,68,68,0.3)] transition-all active:scale-95 disabled:opacity-50"
                  >
                    {isSyncingCalendar ? (
                      <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin mr-3" />
                    ) : (
                      <img src="https://upload.wikimedia.org/wikipedia/commons/thumb/7/7e/Gmail_icon_%282020%29.svg/2560px-Gmail_icon_%282020%29.svg.png" alt="Google Calendar" className="w-5 h-5 mr-3" />
                    )}
                    {isSyncingCalendar ? 'Connecting...' : 'Connect Google Calendar'}
                  </button>
                )}
              </div>
            ) : (
              Object.entries(groupedMeetings).map(([date, meetings]) => (
                <div key={date} className="mb-10">
                  <div className="text-sm font-semibold text-gray-400 mb-4 px-2 uppercase tracking-wider flex items-center justify-between">
                    <span>Scheduled Events: {date}</span>
                    {date === new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' }) && (
                      <span className="text-[10px] bg-blue-500/20 text-blue-400 border border-blue-500/30 px-2 py-0.5 rounded-full font-bold">UPCOMING</span>
                    )}
                  </div>
                  {meetings.map((meeting, idx) => (
                    <div key={meeting.id} className="flex flex-col md:flex-row md:items-start bg-white/5 border border-white/10 rounded-2xl px-6 py-5 mb-4 hover:bg-white/10 transition-colors backdrop-blur-sm shadow-lg group hover-lift animate-fade-in-up relative overflow-hidden" style={{ animationDelay: `${0.05 * idx}s` }}>

                      {/* Left icon distinguishing type */}
                      <div className={`w-12 h-12 rounded-xl border flex items-center justify-center font-bold text-lg mb-4 md:mb-0 md:mr-5 flex-shrink-0 z-10 transition-all group-hover:scale-110 
                        ${meeting.type === 'calendar'
                          ? 'bg-blue-500/10 border-blue-500/30 text-blue-400'
                          : 'bg-red-500/10 border-red-500/30 text-red-400'}`}>
                        {meeting.type === 'calendar' ? <CalendarIcon size={20} /> : (userEmail ? userEmail[0].toUpperCase() : "M")}
                      </div>

                      <div className="flex-1 mt-2 md:mt-0 z-10 w-full">
                        <div className="flex items-center justify-between w-full mb-1">
                          <div className="font-semibold text-white text-lg truncate flex-1 pr-4">{meeting.summary || 'Summary Pending'}</div>
                          {meeting.type === 'calendar' && (
                            <span className="text-[10px] font-bold tracking-wider px-2 py-0.5 rounded border bg-blue-500/10 text-blue-400 border-blue-500/20 flex-shrink-0 ml-2">SCHEDULED</span>
                          )}
                        </div>

                        <div className="text-sm text-gray-400 mb-3 flex flex-wrap items-center gap-y-2">
                          <span className="bg-white/10 px-2 py-0.5 rounded inline-flex items-center border border-white/5 whitespace-nowrap mr-3">
                            <Clock className="w-3.5 h-3.5 mr-1" />
                            {meeting.date ? new Date(meeting.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "Recently"}
                          </span>
                          <span className="whitespace-nowrap flex items-center mr-3 opacity-80"><Clock className="w-3.5 h-3.5 mr-1" /> {Math.round(meeting.duration / 60)} min</span>
                          {meeting.platform && (
                            <>
                              <span className="mx-1 opacity-50 hidden sm:inline">&middot;</span>
                              <span className="whitespace-nowrap flex items-center text-gray-300 ml-1">
                                {meeting.platform.includes('Meet') ? <Video size={14} className="mr-1 text-emerald-400" /> : <Phone size={14} className="mr-1 text-blue-400" />}
                                {meeting.platform}
                              </span>
                            </>
                          )}
                        </div>

                        {meeting.transcript && (
                          <div className={`text-gray-300 text-sm leading-relaxed p-4 rounded-xl border mt-3
                            ${meeting.type === 'calendar' ? 'bg-blue-500/5 border-blue-500/10' : 'bg-black/20 border-white/5'}`}>
                            {meeting.transcript.substring(0, 300)}{meeting.transcript.length > 300 ? '...' : ''}
                          </div>
                        )}

                        {meeting.highlights && meeting.highlights.length > 0 && (
                          <div className="mt-4 flex flex-wrap gap-2">
                            {meeting.highlights.slice(0, 5).map((h, i) => (
                              <div key={i} className="px-2 py-1 bg-emerald-500/5 border border-emerald-500/10 rounded-lg text-[10px] text-emerald-400/70 flex items-center gap-1.5 font-medium">
                                <Sparkles size={10} className="text-emerald-500/40" />
                                {h.label} ({formatDuration(h.timestamp)})
                              </div>
                            ))}
                            {meeting.highlights.length > 5 && (
                              <div className="text-[10px] text-gray-600 flex items-center px-1 font-bold">+ {meeting.highlights.length - 5} More</div>
                            )}
                          </div>
                        )}

                        {/* Links and Action area */}
                        {meeting.link && (
                          <div className="mt-4 flex flex-wrap gap-2">
                            <a
                              href={meeting.link}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center px-4 py-2 bg-blue-600/20 text-blue-400 hover:bg-blue-600/30 hover:text-blue-300 font-semibold rounded-lg border border-blue-500/30 transition-all text-sm group/btn"
                            >
                              <Link2 className="w-4 h-4 mr-2 group-hover/btn:-rotate-45 transition-transform" />
                              Join Meeting
                            </a>
                            {meeting.type !== 'calendar' && meeting.transcript.includes('Link:') && (
                              <a
                                href={meeting.transcript.split('Link: ')[1]?.split('\n')[0] || meeting.link}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center px-4 py-2 bg-white/5 text-gray-300 hover:bg-white/10 hover:text-white font-semibold rounded-lg border border-white/10 transition-all text-sm"
                              >
                                View Source
                              </a>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Context Menu / Delete Button */}
                      <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity z-20">
                        {meeting.type !== 'calendar' && (
                          <button
                            className="bg-black/50 text-red-400 hover:text-white p-2 rounded-xl border border-red-500/30 hover:bg-red-500 hover:border-red-500 transition-all shadow-lg"
                            onClick={() => removeMeeting(meeting.id)}
                            title="Delete permanently"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ))
            )}
          </section>

          <aside className={`
            fixed md:relative inset-y-0 left-0 w-64 md:w-96 bg-[#0B0C10] md:bg-[#0B0C10]/80 backdrop-blur-md 
            border-r md:border-r-0 md:border-l border-white/5 px-4 md:px-8 py-8 flex-col z-[70] md:z-20
            transition-transform duration-300 ease-in-out overflow-y-auto custom-scrollbar
            ${sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
            xl:flex
          `}>
            <div className="flex flex-col mb-8">
              <h3 className="text-xl font-bold text-white tracking-tight mb-6">Calendar</h3>
              <div className="flex items-center justify-between bg-black/40 p-1 rounded-xl border border-white/5">
                <button
                  onClick={() => setSelectedDate(
                    selectedDate ? new Date(selectedDate.setMonth(selectedDate.getMonth() - 1)) : new Date()
                  )}
                  className="p-2 rounded-lg hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
                  title="Previous Month"
                >
                  &lt;
                </button>
                <span className="px-4 py-1.5 text-sm font-semibold text-white tracking-wide">
                  {selectedDate
                    ? selectedDate.toLocaleString('default', { month: 'long', year: 'numeric' })
                    : new Date().toLocaleString('default', { month: 'long', year: 'numeric' })}
                </span>
                <button
                  onClick={() => setSelectedDate(
                    selectedDate ? new Date(selectedDate.setMonth(selectedDate.getMonth() + 1)) : new Date()
                  )}
                  className="p-2 rounded-lg hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
                  title="Next Month"
                >
                  &gt;
                </button>
              </div>
              <div className="mt-3 flex justify-center">
                <button
                  onClick={() => setSelectedDate(new Date())}
                  className="px-4 py-1.5 bg-white/5 text-red-400 hover:text-red-300 hover:bg-white/10 rounded-lg text-sm font-medium transition-colors border border-red-500/20"
                >
                  Go to Today
                </button>
              </div>
            </div>
            <div className={`mb-6 rounded-2xl overflow-hidden border p-5 shadow-2xl backdrop-blur-xl transition-all duration-300 ${theme === 'dark' ? 'bg-white/5 border-white/10' : 'bg-white border-slate-200 shadow-slate-200/50'}`}>
              <Calendar
                onChange={date => setSelectedDate(date as Date)}
                value={selectedDate}
                className="react-calendar-fancy dark-theme"
                tileClassName={({ date }) => {
                  const hasMeeting = allMeetings.some(m => {
                    const mDate = new Date(m.date);
                    return mDate.getDate() === date.getDate() &&
                      mDate.getMonth() === date.getMonth() &&
                      mDate.getFullYear() === date.getFullYear();
                  });

                  // Check if any meeting on this date is a scheduled calendar event
                  const hasScheduled = allMeetings.some(m => {
                    const mDate = new Date(m.date);
                    return m.type === 'calendar' &&
                      mDate.getDate() === date.getDate() &&
                      mDate.getMonth() === date.getMonth() &&
                      mDate.getFullYear() === date.getFullYear();
                  });

                  if (date.toDateString() === new Date().toDateString() && (!selectedDate || date.toDateString() !== selectedDate.toDateString())) {
                    return `bg-white/10 font-bold text-white rounded-xl border border-white/20 ${hasMeeting ? 'has-meeting' : ''} ${hasScheduled ? 'has-scheduled' : ''}`;
                  }
                  if (selectedDate && date.toDateString() === selectedDate.toDateString()) {
                    return `bg-red-600 text-white font-bold rounded-xl shadow-[0_0_15px_rgba(239,68,68,0.5)] ${hasMeeting ? 'has-meeting' : ''} ${hasScheduled ? 'has-scheduled' : ''}`;
                  }
                  return `text-gray-400 hover:bg-white/5 hover:text-white rounded-xl transition-colors ${hasMeeting ? 'has-meeting' : ''} ${hasScheduled ? 'has-scheduled' : ''}`;
                }}
                tileContent={({ date }) => {
                  const dayMeetings = allMeetings.filter(m => {
                    const mDate = new Date(m.date);
                    return mDate.getDate() === date.getDate() &&
                      mDate.getMonth() === date.getMonth() &&
                      mDate.getFullYear() === date.getFullYear();
                  });

                  if (dayMeetings.length === 0) return null;

                  const hasRecorded = dayMeetings.some(m => m.type !== 'calendar');
                  const hasScheduled = dayMeetings.some(m => m.type === 'calendar');

                  return (
                    <div className="flex justify-center gap-1 mt-1 shrink-0 h-1.5">
                      {hasRecorded && <div className="w-1.5 h-1.5 bg-red-400 rounded-full animate-pulse"></div>}
                      {hasScheduled && <div className="w-1.5 h-1.5 bg-blue-400 rounded-full shadow-[0_0_5px_rgba(96,165,250,0.5)]"></div>}
                    </div>
                  );
                }}
              />
            </div>

          </aside>
        </div>
      </div>

      {/* Settings Modal */}
      {_showSettings && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => _setShowSettings(false)}></div>
          <div className="relative bg-[#0B0C10] border border-white/10 rounded-3xl shadow-2xl max-w-lg w-full overflow-hidden animate-scale-in">
            <div className="px-8 py-6 border-b border-white/5 flex items-center justify-between bg-white/[0.02]">
              <h2 className="text-xl font-bold text-white flex items-center gap-3">
                <Settings className="w-5 h-5 text-red-400" /> Settings
              </h2>
              <button onClick={() => _setShowSettings(false)} className="text-gray-500 hover:text-white text-2xl font-light">&times;</button>
            </div>

            <div className="p-8 space-y-8 max-h-[70vh] overflow-y-auto custom-scrollbar">
              {/* Account Section */}
              <section>
                <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-4">Account Profile</h3>
                <div className="flex items-center gap-4 p-4 bg-white/5 rounded-2xl border border-white/5">
                  <div className="w-12 h-12 rounded-full bg-gradient-to-br from-red-500 to-red-700 flex items-center justify-center text-xl font-bold text-white shadow-lg">
                    {userName?.charAt(0) || 'U'}
                  </div>
                  <div>
                    <div className="font-semibold text-white">{userName}</div>
                    <div className="text-sm text-gray-400">{userEmail}</div>
                  </div>
                </div>
              </section>

              {/* API Section */}
              <section>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest">AI Engine & Fallbacks</h3>
                  <span className="text-[10px] bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded-full border border-emerald-500/20 font-bold">ACTIVE</span>
                </div>
                <div className="space-y-4">
                  <div className="p-4 bg-black/20 rounded-2xl border border-white/5 group hover:border-red-500/30 transition-all">
                    <label className="block text-[10px] font-bold text-gray-500 uppercase mb-2">Primary: Google Gemini</label>
                    <div className="flex gap-2">
                      <input
                        type="password"
                        value="••••••••••••••••••••••••"
                        readOnly
                        className="flex-1 bg-black/40 border border-white/5 rounded-xl px-3 py-2 text-xs text-gray-500 outline-none"
                      />
                      <button className="text-xs text-red-400 hover:text-red-300 font-bold px-2 transition-colors">CONFIGURED</button>
                    </div>
                  </div>
                  <div className="p-4 bg-black/20 rounded-2xl border border-white/5 group hover:border-purple-500/30 transition-all">
                    <label className="block text-[10px] font-bold text-gray-500 uppercase mb-2">Fallback: Groq Llama-3</label>
                    <div className="flex gap-2">
                      <input
                        type="password"
                        value="••••••••••••••••••••••••"
                        readOnly
                        className="flex-1 bg-black/40 border border-white/5 rounded-xl px-3 py-2 text-xs text-gray-500 outline-none"
                      />
                      <button className="text-xs text-purple-400 hover:text-purple-300 font-bold px-2 transition-colors">ENABLED</button>
                    </div>
                  </div>
                </div>
                <p className="mt-3 text-[10px] text-gray-500 leading-relaxed italic">The app automatically switches to Groq if Google Gemini hits rate limits, ensuring maximum availability.</p>
              </section>

              {/* UI Preferences */}
              <section>
                <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-4">Appearance</h3>
                <div className="flex items-center justify-between p-4 bg-white/5 rounded-2xl border border-white/5 group">
                  <div>
                    <div className="text-sm font-medium text-gray-300">Dark Mode</div>
                    <div className="text-[10px] text-gray-500">Enable high-contrast dark theme</div>
                  </div>
                  <button
                    onClick={toggleTheme}
                    className="p-1 px-3 bg-red-500/10 text-red-400 text-[10px] font-bold rounded-lg border border-red-500/20 hover:bg-red-500/20 transition-all"
                  >
                    {theme === 'dark' ? 'ENABLED' : 'DISABLED'}
                  </button>
                </div>
              </section>
            </div>

            <div className="p-6 bg-white/[0.02] border-t border-white/5">
              <button
                onClick={() => _setShowSettings(false)}
                className="w-full py-3.5 bg-gradient-to-r from-red-600 to-red-800 text-white font-bold rounded-2xl hover:from-red-500 hover:to-red-700 transition-all shadow-xl shadow-red-500/20 active:scale-[0.98]"
              >
                Close Settings
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
