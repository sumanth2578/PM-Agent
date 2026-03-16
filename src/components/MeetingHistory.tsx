import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Mic, Clock, Trash2, Mail, Edit, Save, History, LogOut, Menu, Home, ChevronRight, ExternalLink, Sun, Moon, Sparkles, FileText, Users, Calendar as CalendarIcon, Brain, RotateCw } from 'lucide-react';
import { EmailDialog } from './EmailDialog';
import { supabase } from '../lib/supabase';
import { useTheme } from '../context/ThemeContext';
import Calendar from 'react-calendar';
import 'react-calendar/dist/Calendar.css';

interface MeetingSummary {
  id: string;
  date: string;
  duration: number;
  summary: string;
  transcript: string;
  isEditing?: boolean;
}

export function MeetingHistory() {
  const [summaryHistory, setSummaryHistory] = useState<MeetingSummary[]>([]);
  const [selectedSummary, setSelectedSummary] = useState<MeetingSummary | null>(null);
  const [isEmailDialogOpen, setIsEmailDialogOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [userEmail, setUserEmail] = useState('');
  const [userName, setUserName] = useState('');
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();

  useEffect(() => {
    const fetchUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setUserEmail(user.email || '');
        setUserName(user.user_metadata?.full_name || user.user_metadata?.name || '');
        fetchHistory(user.email || '');
      } else {
        navigate('/auth');
      }
    };
    fetchUser();
  }, [navigate]);

  const [isSyncing, setIsSyncing] = useState(false);

  const fetchHistory = async (email: string) => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('meetings')
        .select('*')
        .eq('user_email', email)
        .order('date', { ascending: false });

      if (error) throw error;
      setSummaryHistory(data || []);
    } catch (err) {
      console.error('Error fetching history:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSync = async () => {
    setIsSyncing(true);
    await fetchHistory(userEmail);
    setTimeout(() => setIsSyncing(false), 1000);
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate('/auth');
  };

  const formatDuration = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainingSeconds = seconds % 60;
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this meeting?')) return;

    try {
      // Delete from Supabase
      await supabase.from('meetings').delete().eq('id', id);

      setSummaryHistory(summaryHistory.filter(summary => summary.id !== id));
    } catch (err) {
      console.error('Error deleting:', err);
    }
  };

  const handleEmail = (summary: MeetingSummary) => {
    setSelectedSummary(summary);
    setIsEmailDialogOpen(true);
  };

  const handleEdit = (id: string) => {
    setSummaryHistory(prev => prev.map(summary =>
      summary.id === id ? { ...summary, isEditing: true } : summary
    ));
  };

  const handleSave = async (id: string, newSummary: string, newTranscript: string) => {
    try {
      // Update Supabase
      await supabase.from('meetings').update({
        summary: newSummary,
        transcript: newTranscript
      }).eq('id', id);

      setSummaryHistory(prev => prev.map(summary =>
        summary.id === id
          ? { ...summary, summary: newSummary, transcript: newTranscript, isEditing: false }
          : summary
      ));
    } catch (err) {
      console.error('Error saving:', err);
    }
  };

  const filteredHistory = selectedDate
    ? summaryHistory.filter(m => new Date(m.date).toDateString() === selectedDate.toDateString())
    : summaryHistory;

  return (
    <div className={`flex h-screen w-full overflow-hidden transition-colors duration-300 ${theme === 'dark' ? 'bg-[#050505] text-white' : 'bg-slate-50 text-slate-900'}`}>
      {/* Mobile Sidebar Overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-30 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Shared Sidebar Design */}
      <aside className={`
        fixed inset-y-0 left-0 z-40 w-64 border-r transform transition-transform duration-300 ease-in-out flex flex-col pt-6 pb-4
        ${theme === 'dark' ? 'bg-[#0B0C10] border-white/10' : 'bg-white border-slate-200'}
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
      `}>
        <div className="flex items-center justify-between px-6 mb-8 relative">
          <img src="/logo.png" alt="3.0Labs" className="h-10 w-auto object-contain" />
          <button className="md:hidden text-gray-400 hover:text-white" onClick={() => setSidebarOpen(false)}>
            &times;
          </button>

          {/* Tiny Sidebar Robot */}
          <div className="absolute -top-4 -right-2 w-8 h-8 opacity-40">
            <div className="w-6 h-4 bg-[#1a1c24] border-b border-red-500/50 rounded-b-lg flex items-center justify-center relative">
              <div className="flex gap-1">
                <div className="w-0.5 h-0.5 bg-red-500 rounded-full"></div>
                <div className="w-0.5 h-0.5 bg-red-500 rounded-full"></div>
              </div>
            </div>
          </div>
        </div>

        <div className="mb-6 px-6">
          <Link
            to="/summarizer"
            className="w-full flex items-center justify-center space-x-2 py-3 px-4 rounded-xl font-medium bg-gradient-to-r from-red-600 to-red-800 text-white hover:from-red-500 hover:to-red-700 shadow-[0_0_20px_rgba(239,68,68,0.4)] border border-white/10 transition-all animate-glow"
          >
            <Mic className="w-5 h-5" />
            <span>New Meeting</span>
          </Link>
        </div>

        <div className="px-6 mb-6">
          <div className="flex flex-col mb-4">
            <div className="font-semibold text-white truncate">{userName || "User"}</div>
            <div className="text-xs text-gray-400 truncate">{userEmail}</div>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto custom-scrollbar py-2">
          <ul className="space-y-1 px-3">
            <li className="px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">Meetings</li>
            <li>
              <Link to="/summarizer" className="flex items-center text-gray-300 hover:text-white hover:bg-white/5 font-medium rounded-xl px-3 py-2.5 transition-colors">
                <Home className="w-5 h-5 mr-3 opacity-80" /> Dashboard
              </Link>
            </li>
            <li>
              <Link to="/history" className="flex items-center bg-white/10 text-white font-medium rounded-xl px-3 py-2.5 transition-colors shadow-sm ring-1 ring-white/10">
                <History className="w-5 h-5 mr-3 text-red-500" /> Meeting History
              </Link>
            </li>
            <li>
              <Link to="/ai-chat" className="flex items-center text-gray-300 hover:text-white hover:bg-white/5 font-medium rounded-xl px-3 py-2.5 transition-colors">
                <Brain className="w-5 h-5 mr-3 opacity-80" /> 3.0 Agent
              </Link>
            </li>
            <li className="pt-4 px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">PM Agent</li>
            <li>
              <Link to="/pm-dashboard" className="flex items-center text-gray-300 hover:text-white hover:bg-white/5 font-medium rounded-xl px-3 py-2.5 transition-colors">
                <Sparkles className="w-5 h-5 mr-3 opacity-80" /> PM Dashboard
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
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col md:ml-64 h-screen overflow-hidden relative">
        <header className="flex items-center justify-between px-6 md:px-10 py-6 bg-[#0B0C10]/80 backdrop-blur-xl border-b border-white/5 z-30 flex-shrink-0 animate-fade-in-down">
          <div className="flex items-center gap-4">
            <button className="md:hidden text-gray-400 hover:text-white p-2 hover:bg-white/5 rounded-lg active:scale-95 transition-all" onClick={() => setSidebarOpen(true)}>
              <Menu className="w-6 h-6" />
            </button>
            <h1 className="text-xl md:text-2xl font-bold text-white tracking-tight flex items-center gap-3">
              History
              <button
                onClick={handleSync}
                disabled={isSyncing}
                className={`p-2 rounded-xl border transition-all ${isSyncing ? 'bg-red-500/20 border-red-500/50 text-red-500' : 'bg-white/5 border-white/10 text-gray-400 hover:text-red-400 hover:bg-red-500/10'}`}
                title="Refresh History"
              >
                <RotateCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
              </button>
            </h1>
          </div>
          <div className="flex items-center gap-4">
            <div className="hidden sm:flex items-center gap-2 text-sm text-gray-400 font-medium">
              <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></span>
              <span>{summaryHistory.length} Sessions</span>
            </div>
            <button
              onClick={() => navigate('/summarizer')}
              className="p-2 bg-white/5 hover:bg-red-500/10 text-gray-400 hover:text-red-400 rounded-xl border border-white/10 transition-all sm:hidden"
            >
              <Home className="w-5 h-5" />
            </button>
          </div>
        </header>

        <main className="flex-1 flex overflow-hidden relative">
          <div className="flex-1 overflow-y-auto px-4 md:px-10 py-8 relative custom-scrollbar">
            {/* Massive Background Branding Text - RED THEME */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none overflow-hidden z-0 select-none">
              <div className="text-[20vw] font-black text-red-500/[0.03] whitespace-nowrap leading-none tracking-tighter transform -rotate-12 select-none animate-pulse-slow">
                3.0LABS
              </div>
            </div>

            {/* Roaming Spy Robot */}
            <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
              <div className="absolute w-24 h-16 animate-robot-roam opacity-20" style={{ animationDelay: '12s' }}>
                <div className="w-16 h-10 bg-[#1a1c24] border-b-2 border-red-500/50 rounded-b-2xl shadow-[0_5px_15px_rgba(239,68,68,0.2)] flex items-center justify-center relative">
                  <div className="flex gap-2">
                    <div className="w-1.5 h-1.5 bg-red-500 rounded-full animate-robot-blink"></div>
                    <div className="w-1.5 h-1.5 bg-red-500 rounded-full animate-robot-blink"></div>
                  </div>
                </div>
              </div>
            </div>

            {/* Background Glow */}
            <div className="absolute top-0 right-0 -mr-40 -mt-40 w-96 h-96 bg-red-600/10 rounded-full blur-[100px] pointer-events-none animate-orb-pulse"></div>
            <div className="absolute bottom-0 left-0 -ml-20 -mb-20 w-64 h-64 bg-red-900/10 rounded-full blur-[80px] pointer-events-none animate-float-slow"></div>

            <div className="max-w-5xl mx-auto z-10 relative">
              {loading ? (
                <div className="flex flex-col items-center justify-center py-20 animate-pulse">
                  <div className="w-12 h-12 border-4 border-red-500 border-t-transparent rounded-full animate-spin mb-4"></div>
                  <p className="text-red-400">Loading your history...</p>
                </div>
              ) : filteredHistory.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-32 text-center bg-white/5 rounded-3xl border border-white/5 animate-scale-in">
                  <div className="w-20 h-20 bg-white/5 rounded-2xl flex items-center justify-center mb-6 animate-breathe">
                    <History className="w-10 h-10 text-gray-600" />
                  </div>
                  <h2 className="text-xl font-semibold mb-2 animate-fade-in-up stagger-1">No meetings found</h2>
                  <p className="text-gray-500 max-w-xs animate-fade-in-up stagger-2">Start a new recording or upload a file to see your highlights here.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-6 pb-20">
                  {filteredHistory.map((meeting, index) => (
                    <div
                      key={meeting.id}
                      className="group bg-[#0B0C10]/60 backdrop-blur-md border border-white/10 rounded-2xl p-6 transition-all hover:bg-[#0B0C10]/80 hover:border-white/20 hover:shadow-2xl hover-lift animate-fade-in-up"
                      style={{ animationDelay: `${0.08 * index}s` }}
                    >
                      <div className="flex flex-col sm:flex-row justify-between items-start gap-4 mb-6">
                        <div className="flex items-center gap-4">
                          <div className="w-12 h-12 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-500">
                            <Clock className="w-6 h-6" />
                          </div>
                          <div>
                            <p className="text-sm text-gray-500 font-medium">
                              {new Date(meeting.date).toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                            </p>
                            <p className="text-xs text-red-400 font-semibold tracking-wide flex items-center gap-1.5 uppercase mt-0.5">
                              <span className="w-1.5 h-1.5 rounded-full bg-red-600"></span>
                              {formatDuration(meeting.duration)} &middot; {new Date(meeting.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleEmail(meeting)}
                            className="p-2.5 bg-white/5 text-gray-400 hover:text-indigo-400 hover:bg-indigo-500/10 rounded-xl transition-all border border-transparent hover:border-indigo-500/20"
                            title="Share via email"
                          >
                            <Mail className="w-5 h-5" />
                          </button>

                          {!meeting.isEditing ? (
                            <button
                              onClick={() => handleEdit(meeting.id)}
                              className="p-2.5 bg-white/5 text-gray-400 hover:text-white hover:bg-white/10 rounded-xl transition-all border border-transparent hover:border-white/10"
                              title="Edit details"
                            >
                              <Edit className="w-5 h-5" />
                            </button>
                          ) : (
                            <button
                              onClick={() => {
                                const newSummary = (document.getElementById(`summary-${meeting.id}`) as HTMLTextAreaElement).value;
                                const newTranscript = (document.getElementById(`transcript-${meeting.id}`) as HTMLTextAreaElement).value;
                                handleSave(meeting.id, newSummary, newTranscript);
                              }}
                              className="p-2.5 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 rounded-xl transition-all border border-emerald-500/20 shadow-[0_0_15px_rgba(16,185,129,0.1)]"
                              title="Save changes"
                            >
                              <Save className="w-5 h-5" />
                            </button>
                          )}

                          <button
                            onClick={() => handleDelete(meeting.id)}
                            className="p-2.5 bg-red-500/10 text-red-500 hover:bg-red-500/20 rounded-xl transition-all border border-red-500/20"
                            title="Delete session"
                          >
                            <Trash2 className="w-5 h-5" />
                          </button>
                        </div>
                      </div>

                      <div className="space-y-6">
                        <div className="p-5 bg-white/5 rounded-2xl border border-white/5 group-hover:border-white/10 transition-colors">
                          <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-3 flex items-center gap-2">
                            <ChevronRight className="w-3 h-3 text-red-500" /> Summary
                          </h3>
                          {meeting.isEditing ? (
                            <textarea
                              id={`summary-${meeting.id}`}
                              className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-white focus:ring-2 focus:ring-red-500/50 outline-none transition-all"
                              defaultValue={meeting.summary}
                              rows={3}
                            />
                          ) : (
                            <div className="text-white leading-relaxed text-sm font-medium">
                              {meeting.summary ? meeting.summary.split('\n').map((line, i) => (
                                <p key={i} className="mb-2">{line}</p>
                              )) : <span className="text-gray-500 italic">No summary generated</span>}
                            </div>
                          )}
                        </div>

                        <div className="p-5 bg-black/20 rounded-2xl border border-white/5">
                          <div className="flex items-center justify-between mb-3">
                            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest flex items-center gap-2">
                              <ChevronRight className="w-3 h-3 text-red-500" /> Full Transcript
                            </h3>
                            {meeting.transcript && meeting.transcript.includes('https://') && (
                              <a
                                href={meeting.transcript.match(/https?:\/\/[^\s]+/)?.[0]}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-[10px] text-red-400 hover:text-red-300 flex items-center gap-1 font-bold bg-red-500/10 px-2 py-0.5 rounded border border-red-500/20"
                              >
                                JOIN LINK <ExternalLink className="w-2.5 h-2.5" />
                              </a>
                            )}
                          </div>
                          {meeting.isEditing ? (
                            <textarea
                              id={`transcript-${meeting.id}`}
                              className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-gray-400 text-sm focus:ring-2 focus:ring-red-500/50 outline-none transition-all font-mono"
                              defaultValue={meeting.transcript}
                              rows={8}
                            />
                          ) : (
                            <div className="text-gray-400 text-sm leading-relaxed max-h-48 overflow-y-auto pr-2 custom-scrollbar whitespace-pre-wrap font-mono">
                              {meeting.transcript || <span className="italic">No transcript available</span>}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <aside className={`
            fixed xl:relative inset-y-0 right-0 w-80 md:w-96 bg-[#0B0C10] xl:bg-[#0B0C10]/80 backdrop-blur-md 
            border-l border-white/5 px-4 md:px-8 py-8 flex-col z-[70] md:z-20
            transition-transform duration-300 ease-in-out overflow-y-auto custom-scrollbar
            ${selectedDate ? 'translate-x-0' : 'translate-x-full xl:translate-x-0'}
            xl:flex
          `}>
            <div className="flex flex-col mb-8">
              <h3 className="text-xl font-bold text-white tracking-tight mb-6 flex items-center justify-between">
                <span>Calendar Filter</span>
                <button
                  onClick={() => setSelectedDate(null)}
                  className="xl:hidden p-2 text-gray-400 hover:text-white"
                >
                  &times;
                </button>
              </h3>
              <div className="flex flex-col gap-2 mb-6">
                {selectedDate && (
                  <button onClick={() => setSelectedDate(null)} className="text-xs text-red-400 hover:text-red-300 bg-red-500/10 hover:bg-red-500/20 px-3 py-1.5 rounded-lg transition-colors font-semibold self-start">
                    Clear Filter
                  </button>
                )}
              </div>
              <div className="flex items-center justify-between bg-black/40 p-1 rounded-xl border border-white/5 mb-6">
                <button
                  onClick={() => setSelectedDate(
                    selectedDate ? new Date(selectedDate.setMonth(selectedDate.getMonth() - 1)) : new Date(new Date().setMonth(new Date().getMonth() - 1))
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
              <div className="mt-3 flex justify-center mb-6">
                <button
                  onClick={() => setSelectedDate(new Date())}
                  className="px-4 py-1.5 bg-white/5 text-red-400 hover:text-red-300 hover:bg-white/10 rounded-lg text-sm font-medium transition-colors border border-red-500/20"
                >
                  Go to Today
                </button>
              </div>
              <div className={`mb-6 rounded-2xl overflow-hidden border p-5 shadow-2xl backdrop-blur-xl transition-all duration-300 ${theme === 'dark' ? 'bg-white/5 border-white/10' : 'bg-white border-slate-200 shadow-slate-200/50'}`}>
                <Calendar
                  onChange={date => setSelectedDate(date as Date)}
                  value={selectedDate}
                  className={`react-calendar-fancy ${theme === 'dark' ? 'dark-theme' : 'light-theme'}`}
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
                    const hasRecorded = summaryHistory.some(m => {
                      const mDate = new Date(m.date);
                      return mDate.getDate() === date.getDate() &&
                        mDate.getMonth() === date.getMonth() &&
                        mDate.getFullYear() === date.getFullYear();
                    });
                    if (!hasRecorded) return null;
                    return (
                      <div className="flex justify-center gap-1 mt-1 shrink-0 h-1.5">
                        <div className="w-1.5 h-1.5 bg-red-400 rounded-full shadow-[0_0_5px_rgba(239,68,68,0.5)] animate-pulse"></div>
                      </div>
                    );
                  }}
                />
              </div>
            </div>
          </aside>
        </main>
      </div>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: rgba(255, 255, 255, 0.02);
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.1);
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(255, 255, 255, 0.2);
        }
      `}</style>

      {
        selectedSummary && (
          <EmailDialog
            isOpen={isEmailDialogOpen}
            onClose={() => {
              setIsEmailDialogOpen(false);
              setSelectedSummary(null);
            }}
            summary={selectedSummary.summary}
            date={selectedSummary.date}
            duration={selectedSummary.duration}
          />
        )
      }
    </div >
  );
}
