import { Link, useLocation, useNavigate } from 'react-router-dom';
import { 
  Home, History, Brain, Sparkles, FileText, Users, 
  Calendar as CalendarIcon, Sun, Moon, LogOut, Video 
} from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import { useRecording } from '../context/RecordingContext';
import { supabase } from '../lib/supabase';

interface SidebarProps {
  userName: string;
  userEmail: string;
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
}

export function Sidebar({ 
  userName, 
  userEmail, 
  sidebarOpen, 
  setSidebarOpen 
}: SidebarProps) {
  const { theme, toggleTheme } = useTheme();
  const { isRecording, duration, formatDuration, stopRecording } = useRecording() as any;
  const location = useLocation();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    if (isRecording && stopRecording) {
      await stopRecording();
    }
    await supabase.auth.signOut();
    navigate('/auth');
  };

  const menuItems = [
    { path: '/summarizer', icon: <Home className="w-5 h-5 mr-3 opacity-80" />, label: 'Home' },
    { path: '/history', icon: <History className="w-5 h-5 mr-3 opacity-80" />, label: 'Meeting History' },
    { path: '/ai-chat', icon: <Brain className="w-5 h-5 mr-3 opacity-80" />, label: '3.0 Agent' },
  ];

  const pmItems = [
    { path: '/pm-dashboard', icon: <Sparkles className="w-5 h-5 mr-3 opacity-80" />, label: 'PM Dashboard' },
    { path: '/prd-generator', icon: <FileText className="w-5 h-5 mr-3 opacity-80" />, label: 'PRD Generator' },
    { path: '/user-stories', icon: <Users className="w-5 h-5 mr-3 opacity-80" />, label: 'User Stories' },
    { path: '/sprint-planner', icon: <CalendarIcon className="w-5 h-5 mr-3 opacity-80" />, label: 'Sprint Planner' },
  ];

  const timeString = typeof formatDuration === 'function' 
    ? formatDuration(duration) 
    : new Date(duration * 1000).toISOString().substr(11, 8);

  const handleLogoClick = () => {
    if (location.pathname === '/ai-chat') {
      window.location.reload(); // Simple refresh for "remove all" in chat
    } else {
      navigate('/summarizer');
    }
  };

  return (
    <aside className={`
      fixed inset-y-0 left-0 z-40 w-[85vw] sm:w-64 border-r transform transition-transform duration-300 ease-in-out flex flex-col pt-6 pb-4
      ${theme === 'dark' ? 'bg-[#0B0C10] border-red-500/10' : 'bg-white border-slate-200'}
      ${sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
    `}>
      <div className="flex items-center justify-between px-6 mb-8 relative">
        <button 
          onClick={handleLogoClick}
          className="block transition-transform hover:scale-105 active:scale-95"
        >
          <img src="/logo.png" alt="3.0Labs" className="h-10 w-auto object-contain" />
        </button>
        <button className="md:hidden text-gray-400 hover:text-white" onClick={() => setSidebarOpen(false)}>&times;</button>
      </div>

      {isRecording && (
        <div className="px-6 mb-4">
          <Link 
            to="/summarizer" 
            className="flex items-center justify-between px-4 py-2 bg-red-500/10 border border-red-500/20 rounded-xl text-red-500 animate-pulse-slow"
          >
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider">
              <span className="w-2 h-2 bg-red-500 rounded-full animate-ping"></span>
              Recording
            </div>
            <span className="font-mono text-sm">{timeString}</span>
          </Link>
        </div>
      )}

      <div className="mb-6 px-6">
        <button
          onClick={() => { navigate('/summarizer'); setSidebarOpen(false); }}
          className={`w-full flex items-center justify-center space-x-2 py-3 px-4 rounded-xl font-medium transition-all duration-300 ${location.pathname === '/summarizer'
            ? 'bg-red-500/10 text-red-500 border border-red-500/20 shadow-[0_0_15px_rgba(239,68,68,0.2)]'
            : 'bg-gradient-to-r from-red-600 to-red-800 text-white hover:from-red-500 hover:to-red-700 shadow-[0_0_20px_rgba(239,68,68,0.3)] hover:shadow-[0_0_30px_rgba(239,68,68,0.5)] border border-white/10'
            }`}
        >
          <Video className="w-5 h-5" />
          <span>3.0 Agent</span>
        </button>
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
          {menuItems.map(item => (
            <li key={item.path}>
              <Link 
                to={item.path} 
                className={`${location.pathname === item.path ? 'bg-white/10 text-white' : 'text-gray-300'} hover:text-white hover:bg-white/5 font-medium rounded-xl px-3 py-2.5 transition-colors flex items-center`}
                onClick={() => setSidebarOpen(false)}
              >
                {item.icon} {item.label}
              </Link>
            </li>
          ))}
          
          <li className="pt-4 px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">PM Agent</li>
          {pmItems.map(item => (
            <li key={item.path}>
              <Link 
                to={item.path} 
                className={`${location.pathname === item.path ? 'bg-white/10 text-white' : 'text-gray-300'} hover:text-white hover:bg-white/5 font-medium rounded-xl px-3 py-2.5 transition-colors flex items-center`}
                onClick={() => setSidebarOpen(false)}
              >
                {item.icon} {item.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <div className="px-6 space-y-2">
        <button onClick={toggleTheme} className="flex items-center w-full text-gray-400 hover:text-red-400 hover:bg-red-500/10 px-3 py-2.5 rounded-xl transition-all group">
          {theme === 'dark' ? <Sun className="w-5 h-5 mr-3 group-hover:rotate-180 transition-transform duration-500" /> : <Moon className="w-5 h-5 mr-3 group-hover:-rotate-12 transition-transform duration-500" />}
          {theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
        </button>
        <button onClick={handleSignOut} className="flex items-center w-full text-gray-400 hover:text-red-400 hover:bg-red-500/10 px-3 py-2.5 rounded-xl transition-colors">
          <LogOut className="w-5 h-5 mr-3" /> Sign Out
        </button>
      </div>
    </aside>
  );
}
