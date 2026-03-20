import React, { useState, useRef, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Mic, MicOff, Monitor, Upload, CheckCircle, Settings, Clock, Video, Phone, Link2, ExternalLink, Sparkles, FileText, Users, Calendar as CalendarIcon, History } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useTheme } from '../context/ThemeContext';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { useRecording } from '../context/RecordingContext';
import { generatePRD, generateUserStories, generateSprintPlan, transcribeWithGroqWhisper, summarizeMeeting } from '../lib/gemini';
import { useGoogleLogin } from '@react-oauth/google';

import Calendar from 'react-calendar';
import 'react-calendar/dist/Calendar.css';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
// @ts-ignore
import html2pdf from 'html2pdf.js';
import { recallService } from '../lib/recall';

declare global {
  interface Window {
    gapi: {
      load: (apiName: string, callback: () => void) => void;
      client: {
        init: (config: {
          apiKey: string;
          clientId: string;
          discoveryDocs: string[];
          scope: string;
        }) => Promise<void>;
      };
    };
    webkitAudioContext: typeof AudioContext;
  }
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
  is_calendar?: boolean;
  highlights?: Highlight[];
}

const GOOGLE_CLIENT_ID_AVAILABLE = !!import.meta.env.VITE_GOOGLE_CLIENT_ID;

interface GoogleTokenResponse {
  access_token: string;
}

interface CalendarSyncButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  onSyncSuccess: (tokenResponse: GoogleTokenResponse) => void;
  onSyncError: (error: unknown) => void;
  isSyncing: boolean;
}

function CalendarSyncButton({ onSyncSuccess, onSyncError, isSyncing, children, ...rest }: CalendarSyncButtonProps) {
  const login = useGoogleLogin({
    onSuccess: onSyncSuccess,
    scope: 'https://www.googleapis.com/auth/calendar.events.readonly',
    onError: onSyncError,
  });
  return (
    <button {...rest} onClick={() => !isSyncing && login()}>
      {children}
    </button>
  );
}

export function MeetingSummarizer() {
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();
  const [transcript, setTranscript] = useState('');
  const [transcribing, setTranscribing] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [summaryHistory, setSummaryHistory] = useState<MeetingSummary[]>([]);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [userEmail, setUserEmail] = useState('');
  const [_showSettings, _setShowSettings] = useState(false);
  const [userName, setUserName] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(false); // Still needed for internal logic if any, but sidebar itself is external
    const [meetingLink, setMeetingLink] = useState(() => localStorage.getItem('last_meeting_link') || '');
    const [meetingDetails, setMeetingDetails] = useState<{
        platform?: string;
        date?: string;
        time?: string;
        duration?: string;
        error?: string;
        link?: string;
        timezone?: string;
    }>(() => {
        const saved = localStorage.getItem('last_meeting_details');
        return saved ? JSON.parse(saved) : {};
    });

    useEffect(() => {
        localStorage.setItem('last_meeting_link', meetingLink);
    }, [meetingLink]);

    useEffect(() => {
        if (Object.keys(meetingDetails).length > 0) {
            localStorage.setItem('last_meeting_details', JSON.stringify(meetingDetails));
        } else {
            localStorage.removeItem('last_meeting_details');
        }
    }, [meetingDetails]);

  // PM Agent state
  const [pmLoading, setPmLoading] = useState(false);
  const [pmPRD, setPmPRD] = useState<string | null>(null);
  const [pmUserStories, setPmUserStories] = useState<string | null>(null);
  const [pmSprintPlan, setPmSprintPlan] = useState<string | null>(null);
  const [pmActiveTab, setPmActiveTab] = useState<'prd' | 'stories' | 'sprint'>('prd');
  const [pmStatus, setPmStatus] = useState<string>('');
  
  // Highlights, duration, etc. moved to useRecording
  const { 
    isRecording, isPaused, duration, audioURL, highlights, 
    startRecording, stopRecording, pauseRecording, resumeRecording, markMoment,
    clearRecording, recordingMode, apiStatus, audioSupported
  } = useRecording();

  const [activeBots, setActiveBots] = useState<Record<string, any>>({});
  const autoFetchTriggeredRef = useRef<Set<string>>(new Set());
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [botName, setBotName] = useState('3.0 Agent');
  const [mainView, setMainView] = useState<'meetings' | 'agent'>('meetings');
  const [welcomeBack, setWelcomeBack] = useState<{ show: boolean; meetingUrl?: string }>({ show: false });

  const resetAgentState = () => {
    setTranscript('');
    setSummary(null);
    setPmPRD(null);
    setPmUserStories(null);
    setPmSprintPlan(null);
    setPmStatus('');
    setError(null);
    clearRecording(); // From context
    setPmLoading(false);
    setMainView('meetings');
  };

  const handleLogoClick = () => {
    if (mainView === 'agent') {
      resetAgentState();
    } else {
      navigate('/summarizer');
      // If already on summarizer, maybe just refresh list or do nothing
    }
  };

  // markMoment replaced by context version

  // Poll bot status for active bots
  useEffect(() => {
    const activeBotIds = Object.keys(activeBots).filter(id => 
      ['pending_join', 'joining', 'in_call'].includes(activeBots[id]?.status)
    );

    if (activeBotIds.length === 0) return;

    const interval = setInterval(async () => {
      for (const id of activeBotIds) {
        try {
          const updatedBot = await recallService.getBotStatus(id);
          setActiveBots(prev => ({ ...prev, [id]: updatedBot }));

          // Auto-fetch transcript and generate outputs when bot finishes
          if ((updatedBot.status === 'done' || updatedBot.status === 'left') &&
              !autoFetchTriggeredRef.current.has(id)) {
            autoFetchTriggeredRef.current.add(id);
            handleFetchBotTranscript(id);
          }
        } catch (err) {
          console.error(`Failed to poll status for bot ${id}:`, err);
        }
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [activeBots]);

  // On mount: check Recall API for any recently completed bots not yet processed
  useEffect(() => {
    const checkOnMount = async () => {
      try {
        if (!userEmail) return; // Wait until we have the user ID

        const { results } = await recallService.listBots();
        const processedIds: string[] = JSON.parse(localStorage.getItem('processed_bot_ids') || '[]');

        // Filter bots by user_id and find completed ones
        const cutoff = Date.now() - 3 * 60 * 60 * 1000;
        const unprocessed = results.filter(b =>
          b.metadata?.user_id === userEmail &&
          (b.status === 'done' || b.status === 'left') &&
          !processedIds.includes(b.id) &&
          new Date(b.created_at).getTime() > cutoff
        );

        if (unprocessed.length > 0) {
          const latest = unprocessed[0];
          setActiveBots(prev => ({ ...prev, [latest.id]: latest }));
          setMainView('agent');
          setWelcomeBack({ show: true, meetingUrl: latest.meeting_url });
          setTimeout(() => setWelcomeBack({ show: false }), 8000);

          if (!autoFetchTriggeredRef.current.has(latest.id)) {
            autoFetchTriggeredRef.current.add(latest.id);
            // Mark as processed
            const updated = [...processedIds, latest.id];
            localStorage.setItem('processed_bot_ids', JSON.stringify(updated));
            handleFetchBotTranscript(latest.id);
          }
        }

        // Restore any still-active bots into state (survived page refresh)
        const activeBotResults = results.filter(b =>
          b.metadata?.user_id === userEmail &&
          ['pending_join', 'joining', 'in_call'].includes(b.status)
        );
        if (activeBotResults.length > 0) {
          const botMap: Record<string, typeof activeBotResults[0]> = {};
          activeBotResults.forEach(b => { botMap[b.id] = b; });
          setActiveBots(prev => ({ ...prev, ...botMap }));
          setMainView('agent');
        }
      } catch (err) {
        console.error('Recall API mount check failed:', err);
      }
    };
    checkOnMount();
  }, [userEmail]);

  // Welcome back: re-check bot statuses when user returns to the tab
  useEffect(() => {
    const handleVisibilityChange = async () => {
      if (document.visibilityState !== 'visible' || !userEmail) return;

      const botsToCheck = Object.keys(activeBots).filter(id =>
        activeBots[id]?.metadata?.user_id === userEmail &&
        ['pending_join', 'joining', 'in_call'].includes(activeBots[id]?.status)
      );
      if (botsToCheck.length === 0) return;

      // Re-poll immediately on tab focus
      for (const id of botsToCheck) {
        try {
          const updatedBot = await recallService.getBotStatus(id);
          setActiveBots(prev => ({ ...prev, [id]: updatedBot }));

          if ((updatedBot.status === 'done' || updatedBot.status === 'left') &&
              !autoFetchTriggeredRef.current.has(id)) {
            autoFetchTriggeredRef.current.add(id);
            setWelcomeBack({ show: true, meetingUrl: updatedBot.meeting_url });
            setMainView('agent');
            // Auto-dismiss welcome banner after 6s
            setTimeout(() => setWelcomeBack({ show: false }), 6000);
            handleFetchBotTranscript(id);
          }
        } catch (err) {
          console.error('Failed to re-check bot on return:', err);
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [activeBots, userEmail]);

  const handleJoinMeetingBot = async () => {
    try {
      const urlToJoin = meetingLink || meetingDetails.link;
      if (!urlToJoin) throw new Error('No meeting link found');
      if (!userEmail) throw new Error('User not authenticated');
      
      setTranscribing(true);
      setMainView('agent');
      const bot = await recallService.createBot(urlToJoin, botName, { user_id: userEmail });
      setActiveBots(prev => ({ ...prev, [bot.id]: bot }));
      setError(null);
    } catch (err) {
      console.error('Error joining meeting bot:', err);
      setError(err instanceof Error ? err.message : 'Failed to join meeting bot');
    } finally {
      setTranscribing(false);
    }
  };

  const handleFetchBotTranscript = async (botId: string) => {
    try {
      setTranscribing(true);
      setPmStatus('Fetching transcript from bot...');
      
      // Retry loop for transcript (up to 3 attempts with 5s delay)
      let recallTranscript = null;
      let attempts = 0;
      const maxAttempts = 3;

      while (attempts < maxAttempts) {
        try {
          recallTranscript = await recallService.getBotTranscript(botId);
          if (recallTranscript && recallTranscript.length > 0) break;
        } catch (err) {
          console.warn(`Transcript fetch attempt ${attempts + 1} failed:`, err);
        }
        attempts++;
        if (attempts < maxAttempts) {
          setPmStatus(`Transcript not ready, retrying... (Attempt ${attempts + 1}/${maxAttempts})`);
          await new Promise(resolve => setTimeout(resolve, 5000));
        }
      }

      if (!recallTranscript || recallTranscript.length === 0) {
        throw new Error('Transcript is still being processed by the bot. Please try fetching manually in a few minutes.');
      }

      setPmStatus('Summarizing meeting...');
      const formattedTranscript = recallService.formatTranscript(recallTranscript);
      const summaryText = await summarizeMeeting(formattedTranscript);
      
      const newSummary: MeetingSummary = {
        id: Date.now().toString(),
        date: new Date().toISOString(),
        duration: 0,
        summary: summaryText,
        transcript: formattedTranscript,
        type: 'recorded'
      };

      await saveMeetingToDatabase(newSummary);
      setSummary(summaryText);
      setTranscript(formattedTranscript);

      // Mark bot as processed so we don't re-fetch on next mount
      const processedIds: string[] = JSON.parse(localStorage.getItem('processed_bot_ids') || '[]');
      localStorage.setItem('processed_bot_ids', JSON.stringify([...processedIds, botId]));

      setActiveBots(prev => {
        const next = { ...prev };
        delete next[botId];
        return next;
      });

      setPmStatus('Generating PM insights...');
      generatePMOutputs(summaryText);
    } catch (err) {
      console.error('Error fetching bot transcript:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch transcript from bot');
      setPmStatus('');
    } finally {
      setTranscribing(false);
    }
  };

  const generatePMOutputs = async (summaryText: string) => {
    if (!summaryText || summaryText.trim() === '') return;
    setPmLoading(true);
    setPmPRD(null);
    setPmUserStories(null);
    setPmSprintPlan(null);

    // Start PM calls immediately, each with internal staggered delays

    try {
      // Get fresh user ID to be certain
      const { data: { user } } = await supabase.auth.getUser();
      const currentUserId = user?.id;

      // Generate PRD first
      setPmStatus('Drafting PRD...');
      let prd = await generatePRD(summaryText).catch((e) => { console.error('PRD error:', e); return 'Failed to generate PRD. Please try again from the PRD Generator page.'; });

      setPmPRD(prd);

      // Save PRD to dedicated table if we have a currentUserId
      if (currentUserId && prd && !prd.startsWith('Failed')) {
        try {
          await supabase.from('prds').insert([{
            user_id: currentUserId,
            id: Date.now().toString(), // Ensure unique ID
            title: `Report: ${new Date().toLocaleDateString()}`,
            content: prd
          }]);
        } catch (e) {
          console.error('Error auto-saving PRD:', e);
        }
      }

      // Small delay between calls
      await new Promise(resolve => setTimeout(resolve, 3000));

      setPmStatus('Creating User Stories...');
      let stories = await generateUserStories(summaryText).catch((e: any) => { console.error('Stories error:', e); return 'Failed to generate user stories. Please try again from the User Stories page.'; });
      setPmUserStories(stories);

      // Save Stories to dedicated table
      if (currentUserId && stories && !stories.startsWith('Failed')) {
        try {
          await supabase.from('user_stories').insert([{
            user_id: currentUserId,
            id: Date.now().toString(), // Ensure unique ID
            feature: `Meeting: ${new Date().toLocaleDateString()}`,
            content: stories
          }]);
        } catch (e) {
          console.error('Error auto-saving Stories:', e);
        }
      }

      // Small delay between calls
      await new Promise(resolve => setTimeout(resolve, 3000));

      setPmStatus('Designing Sprint Plan...');
      let sprint = await generateSprintPlan(summaryText).catch((e: any) => { console.error('Sprint error:', e); return 'Failed to generate sprint plan. Please try again from the Sprint Planner page.'; });
      setPmSprintPlan(sprint);

      // Save Sprint to dedicated table
      if (currentUserId && sprint && !sprint.startsWith('Failed')) {
        try {
          await supabase.from('sprint_plans').insert([{
            user_id: currentUserId,
            id: Date.now().toString(), // Ensure unique ID
            backlog: `Auto-generated from meeting summary`,
            duration: `2 weeks`,
            content: sprint
          }]);
        } catch (e) {
          console.error('Error auto-saving Sprint:', e);
        }
      }

      setPmStatus('Processing complete!');
      setTimeout(() => setPmStatus(''), 5000);

      // Auto-scroll to insights
      document.getElementById('pm-insights-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (err) {
      console.error('PM generation error:', err);
      setPmStatus('Error generating insights.');
    } finally {
      setPmLoading(false);
    }
  };

  const [activeSession, setActiveSession] = useState<MeetingSummary | null>(null);
  const [calendarMeetings, setCalendarMeetings] = useState<MeetingSummary[]>([]);
  const [fetchedCalendarEvents, setFetchedCalendarEvents] = useState<MeetingSummary[]>([]);
  const [showCalendarModal, setShowCalendarModal] = useState(false);
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

    // Clear legacy ghost data from localStorage (one-time cleanup)
    localStorage.removeItem('calendarEvents_v2');
    
    // Check if we have a cached calendar connection status
    const storedCalendarState = localStorage.getItem('isCalendarConnected');
    if (storedCalendarState === 'true') {
      setIsCalendarConnected(true);
    }

    const handleResize = () => {
      // Logic moved to AuthenticatedLayout
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

interface GoogleCalendarEvent {
  id: string;
  htmlLink?: string;
  hangoutLink?: string;
  location?: string;
  summary?: string;
  description?: string;
  start: {
    dateTime?: string;
    date?: string;
  };
  end: {
    dateTime?: string;
    date?: string;
  };
}

  const handleCalendarSyncSuccess = async (tokenResponse: GoogleTokenResponse) => {
    setIsSyncingCalendar(true);
    try {
      const response = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${new Date().toISOString()}&maxResults=20&orderBy=startTime&singleEvents=true`,
        { headers: { Authorization: `Bearer ${tokenResponse.access_token}` } }
      );
      if (!response.ok) throw new Error('Failed to fetch calendar events');
      const data = await response.json();
      const events: MeetingSummary[] = data.items.map((item: GoogleCalendarEvent) => {
        let platform = 'Meeting';
        const link = item.htmlLink || '';
        if (link.includes('meet.google.com') || item.hangoutLink) platform = 'Google Meet';
        else if (link.includes('zoom.us') || (item.location && item.location.includes('zoom.us'))) platform = 'Zoom';
        else if (link.includes('teams.microsoft.com') || (item.location && item.location.includes('teams.microsoft'))) platform = 'MS Teams';
        return {
          id: `cal-${item.id}`,
          date: item.start.dateTime || item.start.date || new Date().toISOString(),
          duration: item.end.dateTime && item.start.dateTime
            ? Math.floor((new Date(item.end.dateTime).getTime() - new Date(item.start.dateTime).getTime()) / 1000)
            : 3600,
          summary: item.summary || 'Untitled Event',
          transcript: item.description || '',
          type: 'calendar',
          link: item.hangoutLink || item.htmlLink || item.location,
          platform
        };
      });
      
      setFetchedCalendarEvents(events);
      setShowCalendarModal(true);
      setIsCalendarConnected(true);
      localStorage.setItem('isCalendarConnected', 'true');
    } catch (err) {
      console.error('Error connecting calendar:', err);
      setError('Failed to sync Google Calendar. Please try again.');
    } finally {
      setIsSyncingCalendar(false);
    }
  };

  const handleCalendarSyncError = (error: unknown) => {
    console.error('Login Failed:', error);
    setIsSyncingCalendar(false);
    setError('Google Calendar authentication failed.');
  };

  const formatDuration = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainingSeconds = seconds % 60;
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  // Recording methods now come from context
  const handleStartRecording = async (mode: 'microphone' | 'tab' = 'microphone') => {
    try {
      setMainView('agent');
      // Clear previous recording data to ensure processing effect triggers for the new one
      setSummary(null);
      setTranscript('');
      await startRecording(mode);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start recording');
    }
  };

  const handleStopRecording = () => {
    stopRecording();
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

      const prompt = `Please transcribe the following audio in English. If multiple languages are spoken, translate everything to English. Identity different speakers and label them (e.g., [Speaker A], [Speaker B]). 
      Then provide a highly professional, comprehensive, and structured summary in English.
      Use professional Markdown formatting including bolding for emphasis. Use clean bullet points (-).
      Format your response exactly as follows:
      ---TRANSCRIPTION---
      [Verbatim English transcription/translation with speaker labels here]
      ---SUMMARY---
      [Professional English summary here]`;

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
      } catch (err) {
        const geminiError = err as Error;
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

  // Effect to process recording when it completes in the context
  useEffect(() => {
    if (audioURL && !summary && !transcribing && !isRecording) {
      const processRecording = async () => {
        setTranscribing(true);
        setError(null);
        try {
          const response = await fetch(audioURL);
          const blob = await response.blob();
          
          if (blob.size < 1000) {
            throw new Error('Audio recording is too short or empty.');
          }

          const result = await transcribeAndSummarizeWithGemini(blob);
          
          if (result.transcription) {
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
            setSummaryHistory(prev => [newSummary, ...prev]);
            saveMeetingToDatabase(newSummary);
            setActiveSession(newSummary);
            
            if (result.summary) {
              generatePMOutputs(result.summary);
            }
          }
        } catch (err) {
          console.error('Error processing audio from context:', err);
          setError(err instanceof Error ? err.message : 'Failed to process recording');
        } finally {
          setTranscribing(false);
        }
      };
      processRecording();
    }
  }, [audioURL, isRecording]);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (file.size > 19 * 1024 * 1024) {
      setError("File exceeds Gemini's 20MB limit.");
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    try {
      setTranscribing(true);
      setError(null);
      const result = await transcribeAndSummarizeWithGemini(file);
      
      if (result.transcription) {
        setTranscript(result.transcription);
        setSummary(result.summary || '');
        const newSummary: MeetingSummary = {
          id: Date.now().toString(),
          date: new Date().toISOString(),
          duration: 0,
          summary: result.summary || '',
          transcript: result.transcription
        };
        setSummaryHistory(prev => [newSummary, ...prev]);
        saveMeetingToDatabase(newSummary);
        setActiveSession(newSummary);
        if (result.summary) {
          generatePMOutputs(result.summary);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to process file');
    } finally {
      setTranscribing(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
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
      // Handles: "Wednesday, March 6 ┬╖ 2:00 ΓÇô 3:00pm", "2024-03-06 14:00", etc.
      const datePatterns = [
        /([A-Za-z]+, [A-Za-z]+ \d{1,2}(?:, \d{4})?)/, // "Wednesday, March 6, 2024"
        /(\d{4}-\d{2}-\d{2})/, // "2024-03-06"
        /(\d{1,2}\/\d{1,2}\/\d{4})/ // "03/06/2024"
      ];

      const timePatterns = [
        /([0-9]{1,2}:[0-9]{2})\s*(?:am|pm)?\s*[ΓÇô-]\s*([0-9]{1,2}:[0-9]{2})\s*(am|pm)/i, // "2:00 - 3:00pm"
        /([0-9]{1,2}:[0-9]{2})\s*(am|pm)\s*[ΓÇô-]\s*([0-9]{1,2}:[0-9]{2})\s*(am|pm)/i, // "2:00pm - 3:00pm"
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
          is_calendar: isCalendar,
          type: isCalendar ? 'calendar' : 'recorded',
          link: meeting.link,
          platform: meeting.platform
        }
      ]);

      // Update local state for immediate feedback
      if (isCalendar) {
        setCalendarMeetings(prev => [meeting, ...prev]);
      } else {
        setSummaryHistory(prev => [meeting, ...prev]);
      }
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
        transcript: `Link: ${meetingDetails.link}\nDate: ${meetingDetails.date || 'Today'}\nTime: ${meetingDetails.time || 'TBD'}\nDuration: ${meetingDetails.duration || '60 min'}\nTimeZone: ${meetingDetails.timezone || ''}`,
        platform: meetingDetails.platform,
        link: meetingDetails.link, // Set link
        is_calendar: true, // Mark as calendar meeting
        type: 'calendar' // Set type
      };

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

  // Dashboard list should ONLY show scheduled meetings (calendar events) for the SELECTED date
  const meetingsToDisplay = selectedDate
    ? calendarMeetings.filter(m => new Date(m.date).toDateString() === selectedDate.toDateString())
    : []; // Show nothing if no date is selected

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
        ┬⌐ 2026 3.0Labs AI Meeting Intelligence. All rights reserved.
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
      // Get fresh user email to be certain
      let email = userEmail;
      if (!email) {
        const { data: { user } } = await supabase.auth.getUser();
        email = user?.email || '';
      }

      const { error } = await supabase
        .from('meetings')
        .update({ is_hidden: true })
        .eq('id', id);
      
      if (error) throw error;
      // Update local state
      setCalendarMeetings(prev => prev.filter(m => m.id !== id));
      setSummaryHistory(prev => prev.filter(m => m.id !== id));
      
      console.log(`Successfully deleted meeting ${id} for ${email}`);
    } catch (err) {
      console.error('Error removing meeting:', err);
      setError('Failed to delete meeting permanently. Please try again.');
    }
  };


  // Load meetings from Supabase when userDetails are ready
  useEffect(() => {
    const fetchAllMeetings = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data, error } = await supabase
          .from('meetings')
          .select('*')
          .eq('user_email', user.email)
          .eq('is_hidden', false)
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

      {/* Background branding elements removed per user request */}

      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-30 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar is now handled by AuthenticatedLayout */}
      {/* The button below was likely part of a previous sidebar implementation and is now orphaned. Removing it. */}
      {/* <button
        className="md:hidden fixed top-4 left-4 z-50 text-gray-400 hover:text-white p-2 hover:bg-white/5 rounded-lg transition-all"
        onClick={() => setSidebarOpen(true)}
        aria-label="Open Menu"
      >
        <Menu className="w-6 h-6" />
      </button> */}
      <div className="flex-1 flex flex-col h-screen overflow-hidden relative">
        {/* Ambient orbs - RED THEME */}
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-red-600/10 rounded-full blur-[120px] animate-pulse-slow"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-red-900/10 rounded-full blur-[120px] animate-pulse-slow [animation-delay:2s]"></div>
        <div className="hidden sm:block absolute top-1/3 right-1/4 w-40 md:w-60 h-40 md:h-60 bg-red-500/10 rounded-full blur-[60px] md:blur-[80px] animate-orb-pulse pointer-events-none"></div>
        <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-red-500 to-transparent animate-shimmer z-20"></div>

        <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-red-500 to-transparent animate-shimmer z-20"></div>

        <header className="flex flex-col lg:flex-row items-center justify-between px-3 sm:px-4 md:px-8 py-3 sm:py-4 bg-[#0B0C10]/80 backdrop-blur-xl border-b border-red-500/10 z-30 flex-shrink-0 gap-2 sm:gap-4">
          <div className="flex items-center justify-between w-full lg:w-auto gap-4">
            <div className="flex items-center gap-4">
              {/* Mobile Menu Toggle logic handled by AuthenticatedLayout */}
              <div className="flex items-center gap-3">
            <button 
              onClick={handleLogoClick}
              className="block transition-transform hover:scale-105 active:scale-95 focus:outline-none"
              title={mainView === 'agent' ? "Reset Agent Session" : "Go to Dashboard"}
            >
              <img src="/logo.png" alt="3.0Labs" className="h-8 w-auto object-contain" />
            </button>
            <span className="text-gray-400 font-medium text-lg">/</span>
            <h1 className="text-lg md:text-xl font-bold text-white tracking-tight">Summarizer</h1>
          </div>
            </div>
            
            <div className="flex lg:hidden items-center gap-2">
              <button
                onClick={() => _setShowSettings(true)}
                className="p-2 bg-white/5 hover:bg-red-500/10 text-gray-400 hover:text-red-400 rounded-xl border border-white/10 transition-all"
              >
                <Settings className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Quick actions in header */}
          <div className="flex flex-wrap items-center gap-2 sm:gap-3 z-40">
            <button
              onClick={() => setMainView('agent')}
              className={`px-4 py-2 font-bold rounded-xl transition-all flex items-center shadow-lg active:scale-95 text-xs md:text-sm border ${mainView === 'agent' ? 'bg-red-600 text-white border-red-500' : 'bg-white/5 text-white hover:bg-white/10 border-white/10'}`}
            >
              <span className="w-2 h-2 bg-red-400 rounded-full mr-2 animate-pulse" />
              3.0 Agent
            </button>
            {GOOGLE_CLIENT_ID_AVAILABLE && (
              <CalendarSyncButton
                onSyncSuccess={handleCalendarSyncSuccess}
                onSyncError={handleCalendarSyncError}
                isSyncing={isSyncingCalendar}
                disabled={isSyncingCalendar}
                className={`px-4 py-2 font-bold rounded-xl transition-all flex items-center shadow-lg active:scale-95 text-xs md:text-sm border ${isCalendarConnected ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' : 'bg-white/5 text-white border-white/10 hover:bg-white/10'}`}
              >
                <CalendarIcon className={`w-3.5 h-3.5 mr-2 ${isCalendarConnected ? 'text-blue-400' : 'text-gray-400'}`} />
                {isCalendarConnected ? 'Sync Calendar' : 'Connect Calendar'}
              </CalendarSyncButton>
            )}
            <input type="file" accept="audio/*,video/*" className="hidden" ref={fileInputRef} onChange={handleFileUpload} />
          </div>

            <div className="flex items-center gap-4">
              <div className="hidden sm:flex flex-col items-end">
                <span 
                  className="text-[10px] font-black text-red-500 uppercase tracking-widest cursor-pointer hover:text-red-400 transition-colors"
                  onClick={() => setSelectedDate(null)}
                >
                  Scheduled Meetings
                </span>
                <span className="text-white font-bold text-sm flex items-center gap-2">
                  <CalendarIcon className="w-3.5 h-3.5 text-gray-400" />
                  {calendarMeetings.length} Upcoming
                </span>
              </div>
              <nav className="flex items-center gap-3 text-gray-400 font-bold text-[10px] uppercase tracking-widest bg-white/5 px-3 py-1.5 rounded-full border border-white/5">
                <span
                  className={`hover:text-white cursor-pointer transition-colors ${mainView === 'meetings' && !selectedDate ? 'text-red-500' : ''}`}
                  onClick={() => { setMainView('meetings'); setSelectedDate(null); }}
                >
                  Meetings
                </span>
                <span className="opacity-30">/</span>
                <span
                  className={`hover:text-white cursor-pointer transition-colors ${mainView === 'meetings' && selectedDate ? 'text-red-500' : ''}`}
                  onClick={() => { setMainView('meetings'); setSelectedDate(new Date()); }}
                >
                  Calendar
                </span>
                <span className="opacity-30">/</span>
                <span
                  className={`hover:text-white cursor-pointer transition-colors flex items-center gap-1 ${mainView === 'agent' ? 'text-red-500' : ''}`}
                  onClick={() => setMainView('agent')}
                >
                  {Object.values(activeBots).some(b => ['pending_join','joining','in_call'].includes(b.status)) && (
                    <span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse inline-block" />
                  )}
                  3.0 Agent
                </span>
              </nav>
              <button
                onClick={() => _setShowSettings(true)}
                className="p-2 bg-white/5 hover:bg-red-500/10 text-gray-400 hover:text-red-400 rounded-xl border border-white/10 transition-all"
              >
                <Settings className="w-5 h-5" />
              </button>
            </div>
        </header>
        <div className="flex flex-1 flex-col xl:flex-row relative overflow-hidden h-full">
          <section className="flex-1 px-3 sm:px-4 md:px-8 lg:px-10 py-4 sm:py-6 md:py-8 overflow-y-auto z-10">
            {error && (
              <div className="mb-6 p-4 bg-red-500/10 border border-red-500/30 text-red-400 rounded-xl flex items-center justify-between">
                <span>{error}</span>
                <button onClick={() => setError(null)} className="text-red-400 hover:text-white">&times;</button>
              </div>
            )}

            {mainView === 'agent' && (<>
            {transcribing && (
              <div className="mb-8 p-8 bg-red-500/10 border border-red-500/30 rounded-2xl flex flex-col items-center justify-center space-y-4 animate-pulse">
                <div className="w-12 h-12 border-4 border-red-500 border-t-transparent rounded-full animate-spin"></div>
                <div className="text-red-400 font-semibold text-lg">Processing your meeting...</div>
                <div className="text-gray-400 text-sm">This can take a minute for longer recordings.</div>
              </div>
            )}
            {/* 3.0 Agent Section Header */}
            <div className="flex items-center gap-3 mb-6">
              <div className="w-9 h-9 rounded-full bg-red-600 flex items-center justify-center text-white font-bold text-sm shadow-lg shadow-red-900/30">3.0</div>
              <div>
                <h2 className="text-lg font-bold text-white tracking-tight">3.0 Agent</h2>
                <p className="text-xs text-gray-500">AI-powered meeting recorder & PM assistant</p>
              </div>
              <div className="ml-auto flex flex-wrap gap-1.5 sm:gap-2">
                <button
                  className={`px-2 sm:px-3 py-1.5 font-bold rounded-xl transition-all flex items-center shadow-lg active:scale-95 text-xs border ${isRecording && recordingMode === 'microphone' ? 'bg-red-500 text-white border-red-400 animate-pulse' : 'bg-white/5 text-white hover:bg-white/10 border-white/10'}`}
                  onClick={() => isRecording ? handleStopRecording() : handleStartRecording('microphone')}
                  disabled={!audioSupported || !apiStatus.gemini || (isRecording && recordingMode !== 'microphone')}
                >
                  <Mic className="w-3 h-3 sm:mr-1.5 text-red-400" />
                  <span className="hidden sm:inline">{isRecording && recordingMode === 'microphone' ? 'Stop' : 'Mic'}</span>
                </button>
                <button
                  className={`px-2 sm:px-3 py-1.5 font-bold rounded-xl transition-all flex items-center shadow-lg active:scale-95 text-xs border ${isRecording && recordingMode === 'tab' ? 'bg-red-600 text-white border-red-500 animate-pulse' : 'bg-white/5 text-white hover:bg-white/10 border-white/10'}`}
                  onClick={() => isRecording ? handleStopRecording() : handleStartRecording('tab')}
                  disabled={!audioSupported || !apiStatus.gemini || (isRecording && recordingMode !== 'tab')}
                >
                  <Monitor className="w-3 h-3 sm:mr-1.5 text-red-400" />
                  <span className="hidden sm:inline">{isRecording && recordingMode === 'tab' ? 'Stop' : 'Tab'}</span>
                </button>
                <button
                  className="px-2 sm:px-3 py-1.5 bg-white/5 text-white font-bold rounded-xl hover:bg-white/10 border border-white/10 transition-all flex items-center active:scale-95 text-xs"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isRecording || !apiStatus.gemini}
                >
                  <Upload className="w-3 h-3 sm:mr-1.5 text-red-400" />
                  <span className="hidden sm:inline">Upload</span>
                </button>
              </div>
            </div>
            {/* Welcome Back Banner */}
            {welcomeBack.show && (
              <div className="mb-6 p-5 bg-gradient-to-r from-emerald-500/10 to-red-500/10 border border-emerald-500/30 rounded-2xl flex items-start gap-4 animate-fade-in-up shadow-[0_0_25px_rgba(16,185,129,0.1)]">
                <div className="w-11 h-11 rounded-full bg-gradient-to-br from-emerald-500 to-red-600 flex items-center justify-center text-white font-bold text-sm shadow-lg shrink-0">
                  3.0
                </div>
                <div className="flex-1">
                  <p className="text-white font-bold text-base mb-0.5">Welcome back! 👋 Your meeting just ended.</p>
                  <p className="text-gray-400 text-sm leading-relaxed">
                    I captured everything. Generating your summary, PRD, user stories, and sprint plan right now — check below in a moment!
                  </p>
                  <div className="mt-3 flex items-center gap-2">
                    <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                    <span className="text-emerald-400 text-xs font-semibold">AI is processing your meeting...</span>
                  </div>
                </div>
                <button onClick={() => setWelcomeBack({ show: false })} className="text-gray-500 hover:text-white transition-colors text-lg shrink-0">&times;</button>
              </div>
            )}

            <div className="mb-6 p-6 bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl shadow-xl animate-fade-in-up hover-glow-red">
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
                <div className="mt-6 text-gray-300 p-3 sm:p-4 bg-black/20 rounded-xl border border-white/5 space-y-2">
                  <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-0">
                    <strong className="text-gray-400 w-24 flex-shrink-0 text-sm">Platform:</strong>
                    <span className="text-white">{meetingDetails.platform}</span>
                  </div>
                  {meetingDetails.link && <div className="flex flex-col sm:flex-row sm:items-start gap-1 sm:gap-0"><strong className="text-gray-400 w-24 flex-shrink-0 text-sm">Link:</strong> <a href={meetingDetails.link} target="_blank" rel="noopener noreferrer" className="text-red-400 hover:text-red-300 break-all text-sm">{meetingDetails.link}</a></div>}
                  {meetingDetails.date && <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-0"><strong className="text-gray-400 w-24 flex-shrink-0 text-sm">Date:</strong> <span className="text-white">{meetingDetails.date}</span></div>}
                  {meetingDetails.time && <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-0"><strong className="text-gray-400 w-24 flex-shrink-0 text-sm">Time:</strong> <span className="text-white">{meetingDetails.time}</span></div>}
                  {meetingDetails.duration && <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-0"><strong className="text-gray-400 w-24 flex-shrink-0 text-sm">Duration:</strong> <span className="text-white">{meetingDetails.duration}</span></div>}
                  {meetingDetails.timezone && <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-0"><strong className="text-gray-400 w-24 flex-shrink-0 text-sm">Time Zone:</strong> <span className="text-white">{meetingDetails.timezone}</span></div>}
                   <div className="mt-6 pt-6 border-t border-white/10">
                    <div className="flex items-start gap-4 mb-6 animate-fade-in">
                      <div className="w-10 h-10 rounded-full bg-red-600 flex items-center justify-center text-white font-bold shadow-lg shadow-red-900/20 shrink-0">
                        3.0
                      </div>
                      <div className="flex-1 bg-white/5 border border-white/10 rounded-2xl p-4 rounded-tl-none">
                        <p className="text-white font-medium mb-1">Hello, I am 3.0 labs bot.</p>
                        <p className="text-gray-400 text-sm">I've extracted the details for your {meetingDetails.platform} meeting. Should I join and record it for you?</p>
                      </div>
                    </div>

                    <div className="flex flex-col sm:flex-row flex-wrap gap-2 sm:gap-3 justify-end">
                      <button
                        onClick={() => markMoment('insight')}
                        disabled={!isRecording}
                        className="px-4 sm:px-6 py-2 sm:py-2.5 bg-white/5 text-gray-400 font-medium rounded-xl hover:bg-white/10 transition-all border border-white/5 text-sm"
                      >
                        No, skip for now
                      </button>
                      <button
                        onClick={handleAddExtractedMeeting}
                        className="px-4 sm:px-6 py-2 sm:py-2.5 bg-emerald-600/20 text-emerald-400 font-semibold rounded-xl hover:bg-emerald-600/30 border border-emerald-500/20 transition-all flex items-center justify-center gap-2 text-sm"
                      >
                        <CheckCircle className="w-4 h-4" />
                        Just add to list
                      </button>
                      <button
                        onClick={handleJoinMeetingBot}
                        disabled={!meetingDetails.link || transcribing || !!Object.values(activeBots).find(b => b.meeting_url === meetingDetails.link && ['pending_join','joining','in_call'].includes(b.status))}
                        className="px-6 sm:px-8 py-2 sm:py-2.5 bg-red-600 text-white font-bold rounded-xl hover:bg-red-500 shadow-[0_0_20px_rgba(239,68,68,0.4)] transition-all flex items-center justify-center gap-2 disabled:opacity-50 active:scale-95 text-sm"
                      >
                        {transcribing ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Video className="w-4 h-4" />}
                        {transcribing ? 'Sending...' : 'Yes, Join Meeting'}
                      </button>
                    </div>
                  </div>
                </div>
              )}
              {meetingDetails.error && (
                <div className="mt-4 p-3 bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl text-sm">{meetingDetails.error}</div>
              )}
            </div>

            {/* Active Bot Status Cards */}
            {Object.values(activeBots).map(bot => {
              const statusConfig: Record<string, { label: string; headline: string; sub: string; color: string; glow: string; pulse: boolean }> = {
                pending_join: {
                  label: 'CONNECTING',
                  headline: '3.0 Agent is suiting up...',
                  sub: 'Authenticating and preparing to enter your meeting. This takes a few seconds.',
                  color: 'border-yellow-500/30 bg-yellow-500/5',
                  glow: 'shadow-[0_0_20px_rgba(234,179,8,0.1)]',
                  pulse: true,
                },
                joining: {
                  label: 'JOINING',
                  headline: 'Knocking on the meeting door 🚪',
                  sub: 'Your AI agent is entering the meeting room. It will appear as a participant shortly.',
                  color: 'border-blue-500/30 bg-blue-500/5',
                  glow: 'shadow-[0_0_20px_rgba(59,130,246,0.1)]',
                  pulse: true,
                },
                in_call: {
                  label: '● LIVE',
                  headline: '3.0 Agent is listening & taking notes 🎙️',
                  sub: 'Every word is being captured. When the meeting ends, I\'ll generate your summary, PRD, and action items automatically.',
                  color: 'border-red-500/30 bg-red-500/5',
                  glow: 'shadow-[0_0_25px_rgba(239,68,68,0.15)]',
                  pulse: true,
                },
                done: {
                  label: 'DONE',
                  headline: 'Meeting wrapped! Generating insights... ✨',
                  sub: 'Fetching transcript and crafting your summary, PRD, and sprint plan. Hang tight!',
                  color: 'border-emerald-500/30 bg-emerald-500/5',
                  glow: 'shadow-[0_0_20px_rgba(16,185,129,0.1)]',
                  pulse: false,
                },
                left: {
                  label: 'LEFT',
                  headline: 'Bot has left the meeting.',
                  sub: 'Processing transcript and building your outputs now.',
                  color: 'border-emerald-500/30 bg-emerald-500/5',
                  glow: 'shadow-[0_0_20px_rgba(16,185,129,0.1)]',
                  pulse: false,
                },
                fatal: {
                  label: 'NOT RECORDED',
                  headline: 'Bot timed out before being admitted ⏱️',
                  sub: 'The bot waited in Google Meet\'s lobby but timed out (~60s) before being admitted. No audio was captured. Dismiss this and try again — this time admit the bot immediately after clicking Join.',
                  color: 'border-orange-500/30 bg-orange-500/5',
                  glow: 'shadow-[0_0_20px_rgba(249,115,22,0.1)]',
                  pulse: false,
                },
              };
              const cfg = statusConfig[bot.status] || statusConfig['fatal'];
              return (
                <div key={bot.id} className={`mb-4 p-5 backdrop-blur-xl border rounded-2xl relative overflow-hidden ${cfg.color} ${cfg.glow}`}>
                  {cfg.pulse && <div className="absolute inset-0 opacity-30 animate-pulse bg-gradient-to-r from-transparent via-white/5 to-transparent" />}
                  <div className="relative z-10 flex items-start gap-4">
                    <div className="w-10 h-10 rounded-full bg-red-600 flex items-center justify-center text-white font-bold shadow-lg shrink-0">
                      3.0
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span className={`text-[10px] font-bold tracking-wider px-2 py-0.5 rounded ${cfg.pulse ? 'animate-pulse' : ''} ${
                          bot.status === 'in_call' ? 'bg-red-500/20 text-red-400' :
                          bot.status === 'done' || bot.status === 'left' ? 'bg-emerald-500/20 text-emerald-400' :
                          bot.status === 'fatal' ? 'bg-orange-500/20 text-orange-400' :
                          'bg-white/10 text-gray-300'
                        }`}>{cfg.label}</span>
                        {(bot.status === 'fatal' || bot.status === 'done' || bot.status === 'left') && (
                          <button
                            onClick={() => setActiveBots(prev => { const n = { ...prev }; delete n[bot.id]; return n; })}
                            className="text-gray-500 hover:text-white text-xs transition-colors"
                          >
                            ✕ Dismiss
                          </button>
                        )}
                      </div>
                      <p className="text-white font-semibold text-base mb-0.5">{cfg.headline}</p>
                      <p className="text-gray-400 text-sm leading-relaxed">{cfg.sub}</p>
                    </div>
                  </div>
                </div>
              );
            })}

            {isRecording && (
              <div className="mb-6 sm:mb-8 p-4 sm:p-6 bg-white/5 backdrop-blur-xl border border-red-500/30 rounded-2xl shadow-[0_0_30px_rgba(239,68,68,0.1)] relative overflow-hidden animate-scale-in animate-border-glow">
                <div className="absolute inset-0 bg-red-500/5 animate-pulse"></div>
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-0 sm:space-x-3 relative z-10 w-full sm:justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-red-500/20 flex items-center justify-center flex-shrink-0">
                      <Clock className="w-4 h-4 sm:w-5 sm:h-5 text-red-400" />
                    </div>
                    <span className="font-medium text-white text-base sm:text-lg">
                      {formatDuration(duration)}
                    </span>
                    {isPaused && (
                      <span className="ml-2 sm:ml-3 text-yellow-500 font-medium text-xs sm:text-sm px-2 py-0.5 rounded-full bg-yellow-500/20 border border-yellow-500/30">Paused</span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2 sm:space-x-3 w-full sm:w-auto">
                    <button
                      onClick={markMoment}
                      className="px-3 sm:px-5 py-2 sm:py-2.5 bg-emerald-500/20 text-emerald-400 font-medium rounded-xl hover:bg-emerald-500/30 border border-emerald-500/30 transition-all flex items-center active:scale-95 group text-xs sm:text-sm"
                      title="Mark Key Moment"
                    >
                      <Sparkles className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-1.5 sm:mr-2 group-hover:rotate-12 transition-transform" />
                      <span className="hidden sm:inline">Mark Moment</span>
                      <span className="sm:hidden">Mark</span>
                      {highlights.length > 0 && (
                        <span className="ml-1.5 sm:ml-2 bg-emerald-500 text-white text-[10px] px-1.5 py-0.5 rounded-full">
                          {highlights.length}
                        </span>
                      )}
                    </button>
                    <button
                      onClick={isPaused ? resumeRecording : pauseRecording}
                      className="px-3 sm:px-5 py-2 sm:py-2.5 bg-white/10 text-white font-medium rounded-xl hover:bg-white/20 transition-colors border border-white/10 text-xs sm:text-sm"
                    >
                      {isPaused ? (
                        <>
                          <span className="inline-block mr-1 sm:mr-2">&#9654;</span> Resume
                        </>
                      ) : (
                        <>
                          <span className="inline-block mr-1 sm:mr-2">&#10073;&#10073;</span> Pause
                        </>
                      )}
                    </button>
                    <button
                      onClick={stopRecording}
                      className="px-3 sm:px-5 py-2 sm:py-2.5 bg-red-500/20 text-red-400 font-medium rounded-xl hover:bg-red-500/30 border border-red-500/30 transition-colors flex items-center text-xs sm:text-sm"
                    >
                      <MicOff className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-1.5 sm:mr-2" /> Stop
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
                <div className="font-semibold mb-4 text-red-400 text-lg flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  <div className="flex items-center">
                    Latest Summary
                  </div>
                  <button
                    onClick={downloadFullReport}
                    className="flex items-center gap-2 px-4 py-2 bg-red-600/20 hover:bg-red-600/30 text-red-500 border border-red-500/30 rounded-xl text-xs font-bold transition-all active:scale-95 shadow-lg shadow-red-900/20 w-full sm:w-auto justify-center"
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
                <div className="flex items-center gap-3 mb-4" id="pm-insights-section">
                  <Sparkles className="w-6 h-6 text-red-400" />
                  <h2 className="text-xl font-bold text-white tracking-tight">PM Agent Insights</h2>
                  {pmLoading && <div className="w-4 h-4 border-2 border-red-400 border-t-transparent rounded-full animate-spin" />}
                  {pmStatus && !pmLoading && <span className="text-xs text-emerald-400 font-medium animate-pulse">{pmStatus}</span>}
                </div>

                {/* Tabs */}
                <div className="flex gap-2 mb-4 overflow-x-auto pb-1 -mx-1 px-1">
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
                    <div className="text-red-400 font-semibold text-lg">{pmStatus || 'AI is generating PM insights...'}</div>
                    <div className="text-gray-400 text-sm">Structuring data from your meeting summary</div>
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
            </>)}

            {mainView === 'meetings' && (Object.keys(groupedMeetings).length === 0 ? (
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
                  GOOGLE_CLIENT_ID_AVAILABLE ? (
                    <CalendarSyncButton
                      onSyncSuccess={handleCalendarSyncSuccess}
                      onSyncError={handleCalendarSyncError}
                      isSyncing={isSyncingCalendar}
                      disabled={isSyncingCalendar}
                      className="inline-flex items-center px-8 py-3.5 bg-red-600 text-white font-bold rounded-2xl hover:bg-red-500 shadow-[0_0_20px_rgba(239,68,68,0.3)] transition-all active:scale-95 disabled:opacity-50"
                    >
                      {isSyncingCalendar ? (
                        <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin mr-3" />
                      ) : (
                        <img src="https://upload.wikimedia.org/wikipedia/commons/thumb/7/7e/Gmail_icon_%282020%29.svg/2560px-Gmail_icon_%282020%29.svg.png" alt="Google Calendar" className="w-5 h-5 mr-3" />
                      )}
                      {isSyncingCalendar ? 'Connecting...' : 'Connect Google Calendar'}
                    </CalendarSyncButton>
                  ) : (
                    <button disabled className="inline-flex items-center px-8 py-3.5 bg-gray-700 text-gray-400 font-bold rounded-2xl cursor-not-allowed">
                      Google Calendar Not Configured
                    </button>
                  )
                )}
              </div>
            ) : (
              Object.entries(groupedMeetings).map(([date, meetings]) => (
                <div key={date} className="mb-10">
                  <div className="text-sm font-semibold text-gray-400 mb-4 px-2 uppercase tracking-wider flex items-center justify-between">
                    <span>Scheduled Events: {date}</span>
                  </div>
                  {meetings.map((meeting, idx) => (
                    <div key={meeting.id} className="flex flex-col md:flex-row md:items-start bg-white/5 border border-white/10 rounded-2xl px-6 py-5 mb-4 hover:bg-white/10 transition-colors backdrop-blur-sm shadow-lg group hover-lift animate-fade-in-up relative overflow-hidden" style={{ animationDelay: `${0.05 * idx}s` }}>

                      {/* Left icon distinguishing type */}
                      <div className={`w-12 h-12 rounded-xl border flex items-center justify-center font-bold text-lg mb-4 md:mb-0 md:mr-5 flex-shrink-0 z-10 transition-all group-hover:scale-110 
                        ${(meeting.type === 'calendar' || meeting.is_calendar)
                          ? 'bg-blue-500/10 border-blue-500/30 text-blue-400'
                          : 'bg-red-500/10 border-red-500/30 text-red-400'}`}>
                        {(meeting.type === 'calendar' || meeting.is_calendar) ? <CalendarIcon size={20} /> : (userEmail ? userEmail[0].toUpperCase() : "M")}
                      </div>

                      <div className="flex-1 mt-2 md:mt-0 z-10 w-full">
                        <div className="flex items-center justify-between w-full mb-1">
                          <div className="font-semibold text-white text-lg truncate flex-1 pr-4">{meeting.summary || 'Summary Pending'}</div>
                          <div className="flex items-center gap-2">
                            {meeting.type === 'calendar' && (
                              <span className="text-[10px] font-bold tracking-wider px-2 py-0.5 rounded border bg-blue-500/10 text-blue-400 border-blue-500/20 flex-shrink-0 ml-2">SCHEDULED</span>
                            )}
                            {(() => {
                              // Fallback for older meetings without link/platform fields
                              let meetingLink = meeting.link;
                              let meetingPlatform = meeting.platform;
                              
                              if (!meetingLink && meeting.transcript?.includes('Link: ')) {
                                meetingLink = meeting.transcript.split('Link: ')[1]?.split('\n')[0]?.trim();
                              }
                              if (!meetingPlatform) {
                                if (meeting.summary?.includes('Meet')) meetingPlatform = 'Google Meet';
                                else if (meeting.summary?.includes('Zoom')) meetingPlatform = 'Zoom';
                                else if (meeting.summary?.includes('Teams')) meetingPlatform = 'Microsoft Teams';
                              }

                              const bot = Object.values(activeBots).find(b => b.meeting_url === meetingLink);
                              if (bot) {
                                return (
                                  <div className="flex items-center gap-2">
                                    <span className={`text-[10px] font-bold tracking-wider px-2 py-0.5 rounded border flex-shrink-0
                                      ${bot.status === 'done' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 
                                        bot.status === 'fatal' ? 'bg-red-500/10 text-red-400 border-red-500/20' : 
                                        'bg-purple-500/10 text-purple-400 border-purple-500/20 animate-pulse'}`}>
                                      BOT: {bot.status.toUpperCase().replace('_', ' ')}
                                    </span>
                                    {bot.status === 'done' && (
                                      <button 
                                        onClick={() => handleFetchBotTranscript(bot.id)}
                                        className="text-[10px] font-bold tracking-wider px-2 py-0.5 rounded border bg-emerald-600 text-white border-emerald-500 hover:bg-emerald-500 transition-colors"
                                      >
                                        FETCH TRANSCRIPT
                                      </button>
                                    )}
                                  </div>
                                );
                              } else if (meetingLink && (meetingPlatform?.includes('Meet') || meetingPlatform?.includes('Zoom') || meetingPlatform?.includes('Teams'))) {
                                return (
                                  <button
                                    onClick={handleJoinMeetingBot}
                                    className="text-[10px] font-bold tracking-wider px-2 py-0.5 rounded border bg-red-600 text-white border-red-500 hover:bg-red-500 transition-all flex items-center gap-1 shadow-lg active:scale-95"
                                    title="Send AI Bot to join and record"
                                  >
                                    <Video size={10} /> JOIN BOT
                                  </button>
                                );
                              }
                              return null;
                            })()}
                          </div>
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
                            {meeting.type === 'calendar' ? (
                              <div className="space-y-1">
                                {meeting.transcript.split('\n').filter(line => line.trim()).map((line, i) => (
                                  <div key={i} className="flex gap-2 text-blue-400/80">
                                    <span className="truncate">{line}</span>
                                  </div>
                                ))}
                              </div>
                            ) : (
                               <>{meeting.transcript.substring(0, 200)}{meeting.transcript.length > 200 ? '...' : ''}</>
                            )}
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
                        <button
                          className="bg-black/50 text-red-400 hover:text-white p-2 rounded-xl border border-red-500/30 hover:bg-red-500 hover:border-red-500 transition-all shadow-lg"
                              onClick={() => removeMeeting(meeting.id)}
                          title="Delete permanently"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ))
            ))}
          </section>

          <aside className={`
            fixed xl:relative inset-y-0 right-0 left-auto w-[85vw] sm:w-80 md:w-96 bg-[#0B0C10] xl:bg-[#0B0C10]/80 backdrop-blur-md
            border-l border-red-500/10 px-4 sm:px-6 md:px-8 py-6 sm:py-8 flex-col z-[70] xl:z-20
            transition-transform duration-300 ease-in-out overflow-y-auto custom-scrollbar
            hidden xl:flex
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
                  const hasMeeting = calendarMeetings.some(m => new Date(m.date).toDateString() === date.toDateString());
                  const isSelected = selectedDate && date.toDateString() === selectedDate.toDateString();
                  const isToday = date.toDateString() === new Date().toDateString();

                  let classes = "rounded-xl transition-all duration-200 ";

                  if (isSelected) {
                    classes += "bg-red-600 text-white font-bold shadow-[0_0_15px_rgba(239,68,68,0.5)] z-10 scale-105 ";
                  } else if (hasMeeting) {
                    classes += "bg-blue-600/20 text-blue-400 font-bold border border-blue-500/30 hover:bg-blue-600/30 ";
                  } else if (isToday) {
                    classes += "bg-white/10 font-bold text-white border border-white/20 ";
                  } else {
                    classes += "text-gray-400 hover:bg-white/5 hover:text-white ";
                  }

                  return classes;
                }}
              />
            </div>

          </aside>
        </div>
      </div>

      {/* Calendar Selection Modal */}
      {showCalendarModal && (
        <div className="fixed inset-0 z-[110] flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setShowCalendarModal(false)}></div>
          <div className="relative bg-[#0B0C10] border border-white/10 rounded-t-3xl sm:rounded-3xl shadow-2xl max-w-2xl w-full overflow-hidden animate-scale-in max-h-[90vh] sm:max-h-none">
            <div className="px-8 py-6 border-b border-white/5 flex items-center justify-between bg-white/[0.02]">
              <h2 className="text-xl font-bold text-white flex items-center gap-3">
                <CalendarIcon className="w-5 h-5 text-blue-400" /> Select Meetings to Add
              </h2>
              <button onClick={() => setShowCalendarModal(false)} className="text-gray-500 hover:text-white text-2xl font-light">&times;</button>
            </div>

            <div className="p-6 space-y-4 max-h-[60vh] overflow-y-auto custom-scrollbar">
              {fetchedCalendarEvents.length === 0 ? (
                <div className="text-center py-10 text-gray-400">No upcoming meetings found in your calendar.</div>
              ) : (
                fetchedCalendarEvents.map((event) => {
                  const isAlreadyAdded = calendarMeetings.some(m => m.id === event.id);
                  return (
                    <div key={event.id} className="p-4 bg-white/5 rounded-2xl border border-white/5 flex items-center justify-between hover:bg-white/10 transition-all group">
                      <div className="flex-1 pr-4">
                        <div className="font-semibold text-white group-hover:text-blue-400 transition-colors">{event.summary}</div>
                        <div className="text-xs text-gray-400 mt-1 flex items-center gap-2">
                          <Clock className="w-3 h-3" />
                          {new Date(event.date).toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                          <span className="opacity-30">|</span>
                          <span className="text-blue-400/70">{event.platform}</span>
                        </div>
                      </div>
                      <button
                        onClick={() => !isAlreadyAdded && saveMeetingToDatabase(event, true)}
                        disabled={isAlreadyAdded}
                        className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                          isAlreadyAdded 
                            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 cursor-default'
                            : 'bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-900/20 active:scale-95'
                        }`}
                      >
                        {isAlreadyAdded ? (
                          <span className="flex items-center gap-1.5"><CheckCircle className="w-3.5 h-3.5" /> Added</span>
                        ) : 'Add to Meetings'}
                      </button>
                    </div>
                  );
                })
              )}
            </div>

            <div className="p-6 bg-white/[0.02] border-t border-white/5">
              <button
                onClick={() => setShowCalendarModal(false)}
                className="w-full py-3.5 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-2xl transition-all shadow-xl shadow-blue-900/20 active:scale-[0.98]"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Settings Modal */}
      {_showSettings && (
        <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => _setShowSettings(false)}></div>
          <div className="relative bg-[#0B0C10] border border-white/10 rounded-t-3xl sm:rounded-3xl shadow-2xl max-w-lg w-full overflow-hidden animate-scale-in max-h-[90vh] sm:max-h-none">
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

              {/* Bot Section */}
              <section>
                <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-4">Meeting Bot Configuration</h3>
                <div className="p-4 bg-white/5 rounded-2xl border border-white/5 group hover:border-red-500/30 transition-all">
                  <label className="block text-[10px] font-bold text-gray-500 uppercase mb-2">Bot Display Name</label>
                  <input
                    type="text"
                    value={botName}
                    onChange={(e) => setBotName(e.target.value)}
                    placeholder="e.g. 3.0 Agent"
                    className="w-full bg-black/40 border border-white/5 rounded-xl px-3 py-2 text-sm text-white focus:border-red-500/50 outline-none transition-all placeholder:text-gray-700"
                  />
                  <p className="mt-2 text-[10px] text-gray-500 italic leading-relaxed">This name will appear in the participant list when the bot joins Zoom/Meet/Teams calls.</p>
                </div>
              </section>

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
                        value="ΓÇóΓÇóΓÇóΓÇóΓÇóΓÇóΓÇóΓÇóΓÇóΓÇóΓÇóΓÇóΓÇóΓÇóΓÇóΓÇóΓÇóΓÇóΓÇóΓÇóΓÇóΓÇóΓÇóΓÇó"
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
                        value="ΓÇóΓÇóΓÇóΓÇóΓÇóΓÇóΓÇóΓÇóΓÇóΓÇóΓÇóΓÇóΓÇóΓÇóΓÇóΓÇóΓÇóΓÇóΓÇóΓÇóΓÇóΓÇóΓÇóΓÇó"
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
