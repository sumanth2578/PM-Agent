import { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Mic, MicOff, Clock, History, LogOut, Settings, Menu, Monitor, Upload, CheckCircle, Sun, Moon, Sparkles, FileText, Users, Calendar as CalendarIcon } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useTheme } from '../context/ThemeContext';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { generatePRD, generateUserStories, generateSprintPlan } from '../lib/gemini';

import Calendar from 'react-calendar';
import 'react-calendar/dist/Calendar.css';

declare global {
  interface Window { gapi: any }
}

interface MeetingSummary {
  id: string;
  date: string;
  duration: number;
  summary: string;
  transcript: string;
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

  const generatePMOutputs = async (summaryText: string) => {
    if (!summaryText || summaryText.trim() === '') return;
    setPmLoading(true);
    setPmPRD(null);
    setPmUserStories(null);
    setPmSprintPlan(null);

    // Wait before starting PM calls to avoid rate limiting after summary
    await new Promise(resolve => setTimeout(resolve, 5000));

    try {
      // Generate PRD first
      const prd = await generatePRD(summaryText).catch((e) => { console.error('PRD error:', e); return 'Failed to generate PRD. Please try again from the PRD Generator page.'; });
      setPmPRD(prd);

      // Small delay between calls
      await new Promise(resolve => setTimeout(resolve, 3000));

      // Generate User Stories
      const stories = await generateUserStories(summaryText).catch((e) => { console.error('Stories error:', e); return 'Failed to generate user stories. Please try again from the User Stories page.'; });
      setPmUserStories(stories);

      // Small delay between calls
      await new Promise(resolve => setTimeout(resolve, 3000));

      // Generate Sprint Plan
      const sprint = await generateSprintPlan(summaryText).catch((e) => { console.error('Sprint error:', e); return 'Failed to generate sprint plan. Please try again from the Sprint Planner page.'; });
      setPmSprintPlan(sprint);
    } catch (err) {
      console.error('PM generation error:', err);
    } finally {
      setPmLoading(false);
    }
  };

  useEffect(() => {
    const fetchUserDetails = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setUserEmail(user.email || '');
        setUserName(user.user_metadata?.full_name || user.user_metadata?.name || '');
      }
    };
    fetchUserDetails();
  }, []);

  const [calendarMeetings, setCalendarMeetings] = useState<MeetingSummary[]>([]);


  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const durationIntervalRef = useRef<number | null>(null);
  const maxRecordingDuration = 7200; // Increased to 2 hours (7200 seconds)

  useEffect(() => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setAudioSupported(false);
      setError('Audio recording is not supported in this browser. Try using Chrome or Firefox.');
    }
    const checkApiKeys = async () => {
      const geminiKey = import.meta.env.VITE_GEMINI_API_KEY;
      const huggingfaceKey = import.meta.env.VITE_HUGGINGFACE_API_KEY;
      setApiStatus({
        gemini: !!geminiKey,
        huggingface: !!huggingfaceKey
      });
      if (!geminiKey) {
        setError('Google Gemini API key is missing. Please check your .env file.');
      } else if (!huggingfaceKey) {
        setError('Hugging Face API key is missing. Please add it to the .env file.');
      }
    };
    checkApiKeys();
  }, []);

  useEffect(() => {
    const history = localStorage.getItem('meetingSummaryHistory');
    if (history) {
      setSummaryHistory(JSON.parse(history));
    }
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
      if (mode === 'microphone') {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
          }
        });
      } else {
        stream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: true
        });
        // We only want audio, so stop video tracks immediately
        stream.getVideoTracks().forEach(track => track.stop());

        // Ensure there's actually an audio track
        if (stream.getAudioTracks().length === 0) {
          throw new Error('No audio track selected. Make sure to check "Share audio" when sharing a tab.');
        }

        // When the user clicks "Stop sharing" on the browser's native UI
        stream.getAudioTracks()[0].onended = () => {
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
      const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

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

      const prompt = `Please transcribe the following audio and then provide a concise summary. 
      Format your response exactly as follows:
      ---TRANSCRIPTION---
      [Verbatim transcription here]
      ---SUMMARY---
      [Concise summary here]`;

      // Gemini is picky about MIME types - normalize to standard ones
      let mimeType = audioBlob.type.split(';')[0]; // Remove codecs etc.
      if (!mimeType || mimeType === 'audio/webm') mimeType = 'audio/webm';
      if (mimeType.includes('video')) mimeType = 'audio/webm'; // Treat video uploads as audio/webm for summarization if needed

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

    if (audioChunksRef.current.length > 0) {
      setTranscribing(true);
      setError(null);
      try {
        const audioBlob = new Blob(audioChunksRef.current, {
          type: mediaRecorderRef.current?.mimeType || 'audio/webm'
        });

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
          transcript: result.transcription
        };
        const updatedHistory = [newSummary, ...summaryHistory];
        setSummaryHistory(updatedHistory);
        localStorage.setItem('meetingSummaryHistory', JSON.stringify(updatedHistory));
        saveMeetingToDatabase(newSummary);

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
      const updatedHistory = [newSummary, ...summaryHistory];
      setSummaryHistory(updatedHistory);
      localStorage.setItem('meetingSummaryHistory', JSON.stringify(updatedHistory));

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
      // Extract meeting link
      const meetRegex = /(https:\/\/meet\.google\.com\/[a-zA-Z0-9\-]+)/;
      const zoomRegex = /(https:\/\/zoom\.us\/j\/[^\s]+)/;
      const teamsRegex = /(https:\/\/teams\.microsoft\.com\/l\/meetup-join\/[^\s]+)/;
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
      if (link) {
        details.link = link;
      }

      // Extract date and time from a line like "Tuesday, July 15 · 6:00 – 7:00pm"
      const dateTimeLine = input.split('\n').find(line =>
        /[A-Za-z]+,\s+[A-Za-z]+\s+\d{1,2}\s*·\s*[0-9]{1,2}:[0-9]{2}\s*[–-]\s*[0-9]{1,2}:[0-9]{2}(am|pm)?/i.test(line)
      );
      if (dateTimeLine) {
        const dateRegex = /([A-Za-z]+,\s+[A-Za-z]+\s+\d{1,2})/;
        const timeRegex = /([0-9]{1,2}:[0-9]{2})\s*[–-]\s*([0-9]{1,2}:[0-9]{2})(am|pm)?/i;
        const dateMatch = dateTimeLine.match(dateRegex);
        const timeMatch = dateTimeLine.match(timeRegex);
        if (dateMatch) {
          details.date = dateMatch[1];
        }
        if (timeMatch) {
          // Parse start and end time with am/pm
          let start = timeMatch[1];
          let end = timeMatch[2];
          let endPeriod = timeMatch[3] || '';
          // If end time has am/pm, use it; otherwise, try to infer from context (not robust)
          details.time = `${start} - ${end}${endPeriod}`;
          // Duration calculation (handle am/pm correctly)
          const parseTime = (t: string, period: string) => {
            let [h, m] = t.split(':').map(Number);
            if (period.toLowerCase() === 'pm' && h < 12) h += 12;
            if (period.toLowerCase() === 'am' && h === 12) h = 0;
            return h * 60 + m;
          };
          // Try to get am/pm for start time from context (not always possible)
          let startPeriod = '';
          // If endPeriod exists, and start < end, assume same period
          if (endPeriod) {
            startPeriod = endPeriod;
          }
          const startMinutes = parseTime(start, startPeriod);
          const endMinutes = parseTime(end, endPeriod);
          let durationMin = endMinutes - startMinutes;
          if (durationMin <= 0) durationMin += 12 * 60; // handle overnight or missing am/pm
          details.duration = `${durationMin} min`;
        }
      }

      // Extract time zone
      const tzLine = input.split('\n').find(line => /Time zone:/i.test(line));
      if (tzLine) {
        const tzMatch = tzLine.match(/Time zone:\s*([^\n]+)/i);
        if (tzMatch) {
          details.timezone = tzMatch[1].trim();
        }
      }

      if (!details.platform) {
        details.error = 'No supported meeting link found.';
      }
    } catch (e) {
      details.error = 'Failed to parse meeting details.';
    }
    return details;
  };

  // Add this function to save meeting to Supabase for the logged-in user
  const saveMeetingToDatabase = async (meeting: MeetingSummary) => {
    if (!userEmail) return;
    try {
      await supabase.from('meetings').insert([
        {
          id: meeting.id,
          user_email: userEmail,
          date: meeting.date,
          duration: meeting.duration,
          transcript: meeting.transcript
        }
      ]);
    } catch (err) {
      // error logging only
    }
  };

  // Refactored to only extract, not save
  const handleExtractDetails = () => {
    const details = extractMeetingDetails(meetingLink);
    setMeetingDetails(details);
  };

  // New function to explicitly add the extracted meeting
  const handleAddExtractedMeeting = () => {
    if (meetingDetails.platform && meetingDetails.date && meetingDetails.time && meetingDetails.link) {
      let meetingDate = new Date();
      try {
        const dateParts = meetingDetails.date.split(',');
        if (dateParts.length === 2) {
          const [_weekday, rest] = dateParts;
          const [month, day] = rest.trim().split(' ');
          const year = new Date().getFullYear();
          meetingDate = new Date(`${month} ${day}, ${year}`);
        }
      } catch { }

      const newMeeting: MeetingSummary = {
        id: Date.now().toString(),
        date: meetingDate.toISOString(),
        duration: meetingDetails.duration ? parseInt(meetingDetails.duration) : 0,
        summary: `${meetingDetails.platform} Meeting`,
        transcript: `Link: ${meetingDetails.link}\nDate: ${meetingDetails.date}\nTime: ${meetingDetails.time}\nDuration: ${meetingDetails.duration || ''}\nTimeZone: ${meetingDetails.timezone || ''}`
      };

      setCalendarMeetings(prev => [newMeeting, ...prev]);
      saveMeetingToDatabase(newMeeting);

      // Reset extraction state after adding
      setMeetingDetails({});
      setMeetingLink('');
      setError(null);
    }
  };

  const filteredCalendarMeetings = selectedDate
    ? calendarMeetings.filter(m =>
      new Date(m.date).toDateString() === selectedDate.toDateString()
    )
    : calendarMeetings;

  const groupedMeetings = filteredCalendarMeetings.reduce((acc: Record<string, MeetingSummary[]>, meeting) => {
    const dateStr = new Date(meeting.date).toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    if (!acc[dateStr]) acc[dateStr] = [];
    acc[dateStr].push(meeting);
    return acc;
  }, {});

  // Add this function to remove a meeting by id
  const removeMeeting = (id: string) => {
    setCalendarMeetings(prev => prev.filter(m => m.id !== id));
  };

  // Remove past meetings automatically
  useEffect(() => {
    setCalendarMeetings(prev =>
      prev.filter(m => {
        const meetingDate = new Date(m.date);
        return meetingDate >= new Date();
      })
    );
  }, [calendarMeetings.length]);

  // Persist calendarMeetings to localStorage
  useEffect(() => {
    localStorage.setItem('calendarMeetings', JSON.stringify(calendarMeetings));
  }, [calendarMeetings]);

  // Load calendarMeetings from localStorage on mount
  useEffect(() => {
    const storedMeetings = localStorage.getItem('calendarMeetings');
    if (storedMeetings) {
      setCalendarMeetings(JSON.parse(storedMeetings));
    }
  }, []);

  // Fetch meetings from Supabase for the logged-in user
  const fetchUserMeetingsFromDatabase = async (email: string) => {
    if (!email) return [];
    try {
      const { data, error } = await supabase
        .from('meetings')
        .select('*')
        .eq('user_email', email);
      if (error) {
        console.error('Failed to fetch meetings from database:', error);
        return [];
      }
      return data || [];
    } catch (err) {
      console.error('Failed to fetch meetings from database:', err);
      return [];
    }
  };

  // Load meetings from Supabase when userEmail changes (login)
  useEffect(() => {
    if (userEmail) {
      (async () => {
        const dbMeetings = await fetchUserMeetingsFromDatabase(userEmail);
        if (dbMeetings.length > 0) {
          setCalendarMeetings(dbMeetings);
        }
      })();
    }
  }, [userEmail]);

  return (
    <div className="flex h-screen w-full overflow-hidden bg-[#050505] text-white">
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
              <Link to="/" className="flex items-center text-gray-300 hover:text-white hover:bg-white/5 font-medium rounded-xl px-3 py-2.5 transition-colors">
                <span className="mr-3 text-lg opacity-80">🏠</span> Home
              </Link>
            </li>
            <li>
              <Link to="/history" className="flex items-center text-gray-300 hover:text-white hover:bg-white/5 font-medium rounded-xl px-3 py-2.5 transition-colors">
                <History className="w-5 h-5 mr-3 opacity-80" /> Meeting History
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

        <header className="flex flex-col lg:flex-row items-start lg:items-center justify-between px-6 md:px-10 py-6 bg-[#0B0C10]/80 backdrop-blur-xl border-b border-white/5 z-30 flex-shrink-0 gap-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 w-full">
            <div className="flex items-center gap-4 shrink-0">
              <button className="md:hidden text-white p-1" onClick={() => setSidebarOpen(true)}>
                <Menu className="w-6 h-6" />
              </button>
              <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
                <span className="w-2 h-8 bg-red-600 rounded-full animate-pulse shadow-[0_0_10px_rgba(220,38,38,0.5)]"></span>
                Meetings
              </h1>
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
                Upload File
              </button>
            </div>
          </div>

          <div className="flex items-center space-x-6 w-full lg:w-auto justify-between lg:justify-end">
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
              <div className="flex flex-col md:flex-row items-center gap-3">
                <input
                  type="text"
                  value={meetingLink}
                  onChange={e => setMeetingLink(e.target.value)}
                  placeholder="Paste your Google Meet, Zoom, or Teams link here"
                  className="flex-1 px-4 py-3 bg-black/40 border border-white/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-500/50 focus:border-red-500 transition-all text-white placeholder-gray-600 shadow-inner"
                />
                <button
                  onClick={handleExtractDetails}
                  className="px-6 py-3 bg-red-600 text-white font-medium rounded-xl hover:bg-red-500 shadow-[0_0_15px_rgba(239,68,68,0.3)] transition-all whitespace-nowrap"
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
            {summary && (
              <div className="mb-8 p-6 bg-red-500/5 backdrop-blur-xl border border-red-500/20 rounded-2xl shadow-[0_0_20px_rgba(239,68,68,0.1)] animate-slide-in-bottom hover-glow-red">
                <div className="font-semibold mb-4 text-red-400 text-lg flex items-center">
                  <div className="w-2 h-2 bg-red-500 rounded-full mr-3 animate-pulse"></div>
                  Latest Summary
                </div>
                <div className="text-white leading-relaxed">{summary}</div>
              </div>
            )}
            {transcript && (
              <div className="mb-8 p-6 bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl">
                <div className="font-semibold mb-4 text-white text-lg">Transcript</div>
                <div className="text-gray-300 leading-relaxed whitespace-pre-wrap">{transcript}</div>
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
                    <div className="text-gray-300 leading-relaxed whitespace-pre-wrap text-sm">{pmPRD}</div>
                  </div>
                )}

                {pmActiveTab === 'stories' && pmUserStories && (
                  <div className="p-6 bg-purple-500/5 backdrop-blur-xl border border-purple-500/20 rounded-2xl shadow-xl animate-fade-in-up">
                    <div className="flex items-center justify-between mb-4">
                      <div className="font-semibold text-purple-400 text-lg flex items-center"><div className="w-2 h-2 bg-purple-500 rounded-full mr-3" />User Stories</div>
                      <button onClick={() => navigator.clipboard.writeText(pmUserStories)} className="p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors text-xs">Copy</button>
                    </div>
                    <div className="text-gray-300 leading-relaxed whitespace-pre-wrap text-sm">{pmUserStories}</div>
                  </div>
                )}

                {pmActiveTab === 'sprint' && pmSprintPlan && (
                  <div className="p-6 bg-emerald-500/5 backdrop-blur-xl border border-emerald-500/20 rounded-2xl shadow-xl animate-fade-in-up">
                    <div className="flex items-center justify-between mb-4">
                      <div className="font-semibold text-emerald-400 text-lg flex items-center"><div className="w-2 h-2 bg-emerald-500 rounded-full mr-3" />Sprint Plan</div>
                      <button onClick={() => navigator.clipboard.writeText(pmSprintPlan)} className="p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors text-xs">Copy</button>
                    </div>
                    <div className="text-gray-300 leading-relaxed whitespace-pre-wrap text-sm">{pmSprintPlan}</div>
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
                  Your calendar is clear for the next 7 days.<br />
                  Schedule new events in your connected calendar to see them tracked here automatically.
                </div>
                <a
                  href="https://calendar.google.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center px-6 py-3 bg-red-500/10 border border-red-500/20 text-red-300 font-medium rounded-xl hover:bg-red-500/20 hover:text-red-200 transition-all shadow-lg"
                >
                  <img src="https://upload.wikimedia.org/wikipedia/commons/thumb/7/7e/Gmail_icon_%282020%29.svg/2560px-Gmail_icon_%282020%29.svg.png" alt="Google Calendar" className="w-5 h-5 mr-3" />
                  Open Google Calendar
                </a>
              </div>
            ) : (
              Object.entries(groupedMeetings).map(([date, meetings]) => (
                <div key={date} className="mb-10">
                  <div className="text-sm font-semibold text-gray-400 mb-4 px-2 uppercase tracking-wider">{date}</div>
                  {meetings.map(meeting => (
                    <div key={meeting.id} className="flex flex-col md:flex-row md:items-center bg-white/5 border border-white/10 rounded-2xl px-6 py-5 mb-4 hover:bg-white/10 transition-colors backdrop-blur-sm shadow-lg group hover-lift animate-fade-in-up" style={{ animationDelay: `${0.05 * meetings.indexOf(meeting)}s` }}>
                      <div className="w-12 h-12 rounded-full bg-red-500/20 border border-red-500/30 flex items-center justify-center text-red-400 font-bold text-lg mr-5 flex-shrink-0 group-hover:scale-110 transition-transform">
                        {userEmail ? userEmail[0].toUpperCase() : "N"}
                      </div>
                      <div className="flex-1 mt-4 md:mt-0">
                        <div className="font-semibold text-white text-lg mb-1 truncate">{meeting.summary || 'Summary Pending'}</div>
                        <div className="text-sm text-gray-400 mb-3 flex items-center">
                          <span className="bg-white/10 px-2 py-0.5 rounded mr-3 border border-white/5">
                            {meeting.date ? new Date(meeting.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "Recently"}
                          </span>
                          <span className="flex items-center"><Clock className="w-3.5 h-3.5 mr-1" /> {Math.round(meeting.duration / 60)} min</span>
                          <span className="mx-2">&middot;</span>
                          <span className="truncate">{userEmail}</span>
                        </div>
                        {meeting.transcript && (
                          <div className="text-gray-300 text-sm leading-relaxed p-4 bg-black/20 rounded-xl border border-white/5">
                            {meeting.transcript.substring(0, 300)}{meeting.transcript.length > 300 ? '...' : ''}

                            {meeting.transcript.includes('Link: ') && (
                              <div className="mt-4 pt-3 border-t border-white/5 flex items-center justify-between">
                                <a
                                  href={meeting.transcript.split('Link: ')[1].split('\n')[0]}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center px-4 py-2 bg-red-600/20 text-red-400 hover:bg-red-600/30 font-semibold rounded-lg border border-red-500/20 transition-all text-sm"
                                >
                                  Join Now
                                </a>
                                <span className="text-xs text-gray-500 font-medium italic">Verified link detected</span>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                      <div className="mt-4 md:mt-0 md:ml-6 flex items-center justify-between md:justify-end w-full md:w-auto">
                        <div className="w-32 h-20 bg-black/40 border border-white/5 rounded-xl flex items-center justify-center text-gray-500 opacity-60">
                          <span className="text-xs font-medium">No Video</span>
                        </div>
                        <div className="md:hidden">
                          <button className="p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-full transition-colors border border-transparent hover:border-white/10">
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z"></path></svg>
                          </button>
                        </div>
                      </div>
                      {/* Desktop context menu button */}
                      <div className="hidden md:flex ml-4 self-start">
                        <button className="p-2 text-gray-500 hover:text-white hover:bg-white/10 rounded-full transition-colors opacity-0 group-hover:opacity-100">
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z"></path></svg>
                        </button>
                      </div>
                      <button
                        className="flex items-center text-red-500 hover:text-red-400 p-2 rounded-full hover:bg-red-500/10 transition-colors"
                        onClick={() => removeMeeting(meeting.id)}
                        title="Remove meeting"
                      >
                        <span className="mr-1">🗑️</span><span className="md:hidden">Remove</span>
                      </button>
                    </div>
                  ))}
                </div>
              ))
            )}
          </section>

          <aside className="hidden xl:flex w-full xl:w-96 bg-[#0B0C10]/80 backdrop-blur-md border-t xl:border-t-0 xl:border-l border-white/5 px-4 md:px-8 py-8 flex-col z-20">
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
            <div className="mb-6 rounded-2xl overflow-hidden bg-white/5 border border-white/10 p-5 shadow-2xl backdrop-blur-xl">
              <Calendar
                onChange={date => setSelectedDate(date as Date)}
                value={selectedDate}
                className="react-calendar-fancy dark-theme"
                tileClassName={({ date }) => {
                  const hasMeeting = summaryHistory.some(m => {
                    const mDate = new Date(m.date);
                    return mDate.getDate() === date.getDate() &&
                      mDate.getMonth() === date.getMonth() &&
                      mDate.getFullYear() === date.getFullYear();
                  });

                  if (date.toDateString() === new Date().toDateString() && (!selectedDate || date.toDateString() !== selectedDate.toDateString())) {
                    return `bg-white/10 font-bold text-white rounded-xl border border-white/20 ${hasMeeting ? 'has-meeting' : ''}`;
                  }
                  if (selectedDate && date.toDateString() === selectedDate.toDateString()) {
                    return `bg-red-600 text-white font-bold rounded-xl shadow-[0_0_15px_rgba(239,68,68,0.5)] ${hasMeeting ? 'has-meeting' : ''}`;
                  }
                  return `text-gray-400 hover:bg-white/5 hover:text-white rounded-xl transition-colors ${hasMeeting ? 'has-meeting' : ''}`;
                }}
                tileContent={({ date }) => {
                  const hasMeeting = summaryHistory.some(m => {
                    const mDate = new Date(m.date);
                    return mDate.getDate() === date.getDate() &&
                      mDate.getMonth() === date.getMonth() &&
                      mDate.getFullYear() === date.getFullYear();
                  });
                  return hasMeeting ? <div className="mx-auto w-1 h-1 bg-red-400 rounded-full mt-1 animate-pulse"></div> : null;
                }}
              />
            </div>
            <style>{`
            .react-calendar-fancy {
              border: none;
              background: transparent;
              font-family: inherit;
              width: 100%;
              min-width: 220px;
            }
            .react-calendar__navigation {
              display: none;
            }
            .react-calendar__month-view__weekdays {
              text-transform: uppercase;
              font-weight: 600;
              font-size: 0.75rem;
              color: rgba(255, 255, 255, 0.4);
              padding-bottom: 0.5rem;
            }
            .react-calendar__month-view__weekdays__weekday abbr {
              text-decoration: none;
            }
            .react-calendar__tile {
              padding: 0.75em 0.5em;
              background: transparent;
              text-align: center;
              transition: all 0.2s;
            }
            .react-calendar__tile:disabled {
              background-color: transparent;
              opacity: 0.3;
            }
            .react-calendar__month-view__days__day--neighboringMonth {
              color: rgba(255, 255, 255, 0.2) !important;
            }
            @media (max-width: 768px) {
              .react-calendar-fancy {
                font-size: 0.9rem;
                min-width: 180px;
              }
            }
          `}</style>
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
