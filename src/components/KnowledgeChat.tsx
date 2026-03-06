import { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import mermaid from 'mermaid';
import {
    AlertCircle,
    Send,
    Bot,
    Mic,
    History,
    Sparkles,
    FileText,
    Users,
    Calendar as CalendarIcon,
    Home,
    Moon,
    Sun,
    LogOut,
    Zap,
    Plus,
    MessageSquare,
    Menu,
    Brain,
    Trash2 as Trash
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useTheme } from '../context/ThemeContext';
import { queryKnowledge } from '../lib/gemini';

// Mermaid Renderer Component
const MermaidChart = ({ chart }: { chart: string }) => {
    const ref = useRef<HTMLDivElement>(null);
    const { theme } = useTheme();
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (ref.current && chart) {
            setError(null);
            try {
                // Clear any existing global mermaid error containers
                const existingErrors = document.querySelectorAll('.mermaid-error-overlay, #mermaid-error-modal');
                existingErrors.forEach(el => el.remove());

                mermaid.initialize({
                    startOnLoad: false,
                    theme: theme === 'dark' ? 'dark' : 'neutral',
                    securityLevel: 'loose',
                    fontFamily: 'inherit',
                    themeVariables: {
                        primaryColor: '#ef4444',
                        primaryTextColor: theme === 'dark' ? '#fff' : '#1e293b',
                        primaryBorderColor: '#ef4444',
                        lineColor: '#ef4444',
                        secondaryColor: theme === 'dark' ? '#1a1c24' : '#f8fafc',
                        tertiaryColor: theme === 'dark' ? '#0b0c10' : '#ffffff',
                        edgeLabelBackground: theme === 'dark' ? '#111' : '#fff',
                        nodeBkg: theme === 'dark' ? '#1a1c24' : '#fff',
                        nodeBorder: '#ef4444',
                        clusterBkg: theme === 'dark' ? '#0b0c10' : '#f8fafc',
                        titleColor: '#ef4444'
                    }
                });

                const id = `mermaid-${Math.random().toString(36).substr(2, 9)}`;
                // Sanitize chart: remove stray semicolons at start/end and extra whitespace
                const sanitizedChart = chart.trim()
                    .replace(/^;+|;+$/g, '')
                    .replace(/\r/g, '');

                mermaid.render(id, sanitizedChart)
                    .then(({ svg }) => {
                        if (ref.current) {
                            ref.current.innerHTML = svg;
                        }
                    })
                    .catch((err) => {
                        console.error('Mermaid render error:', err);
                        setError('Invalid chart syntax. Please try a different query.');
                        // Cleanup the specific error element if mermaid created one
                        setTimeout(() => {
                            const errEl = document.getElementById(id);
                            if (errEl) errEl.remove();
                        }, 100);
                    });
            } catch (err) {
                console.error('Mermaid init error:', err);
                setError('Failed to initialize chart.');
            }
        }

        return () => {
            if (ref.current) ref.current.innerHTML = '';
            const globalErrors = document.querySelectorAll('.mermaid-error-overlay, #mermaid-error-modal');
            globalErrors.forEach(el => el.remove());
        };
    }, [chart, theme]);

    if (error) {
        return (
            <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-xs text-red-400 italic flex items-center gap-2">
                <AlertCircle className="w-4 h-4" />
                {error}
            </div>
        );
    }

    return <div ref={ref} className="mermaid-container overflow-x-auto bg-white/5 rounded-xl p-4 my-4 flex justify-center" />;
};

interface Message {
    role: 'user' | 'assistant';
    content: string;
}

interface Session {
    id: string;
    title: string;
    created_at: string;
}

export default function KnowledgeChat() {
    const [sessions, setSessions] = useState<Session[]>([]);
    const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [meetingHistory, setMeetingHistory] = useState<any[]>([]);
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [chatHistoryOpen, setChatHistoryOpen] = useState(true);
    const [userName, setUserName] = useState('');
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const navigate = useNavigate();
    const { theme, toggleTheme } = useTheme();

    const fetchMessages = async (sessionId: string) => {
        const { data, error } = await supabase
            .from('chat_messages')
            .select('*')
            .eq('session_id', sessionId)
            .order('created_at', { ascending: true });

        if (!error && data) {
            setMessages(data.map(m => ({ role: m.role, content: m.content })));
        }
    };

    const createNewChat = async (userId?: string) => {
        let uid = userId;
        if (!uid) {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;
            uid = user.id;
        }

        const { data, error } = await supabase
            .from('chat_sessions')
            .insert([{ user_id: uid, title: 'New Chat' }])
            .select()
            .single();

        if (data && !error) {
            setSessions(prev => [data, ...prev]);
            setCurrentSessionId(data.id);
            setMessages([]);
        }
    };

    const deleteSession = async (e: React.MouseEvent, sessionId: string) => {
        e.stopPropagation();
        const { error } = await supabase.from('chat_sessions').delete().eq('id', sessionId);
        if (!error) {
            const newSessions = sessions.filter(s => s.id !== sessionId);
            setSessions(newSessions);
            if (currentSessionId === sessionId) {
                setCurrentSessionId(newSessions.length > 0 ? newSessions[0].id : null);
            }
        }
    };

    useEffect(() => {
        const init = async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (user) {
                setUserName(user.user_metadata?.full_name || user.user_metadata?.name || 'User');

                // Fetch meetings for context
                const { data: meetings } = await supabase
                    .from('meetings')
                    .select('*')
                    .eq('user_email', user.email)
                    .order('date', { ascending: false });

                if (meetings) setMeetingHistory(meetings);

                // Fetch chat sessions
                const { data: chatSessions } = await supabase
                    .from('chat_sessions')
                    .select('*')
                    .eq('user_id', user.id)
                    .order('updated_at', { ascending: false });

                if (chatSessions && chatSessions.length > 0) {
                    setSessions(chatSessions);
                    setCurrentSessionId(chatSessions[0].id);
                } else {
                    // Create first session if none exists
                    createNewChat(user.id);
                }
            } else {
                navigate('/auth');
            }
        };
        init();
    }, [navigate]);

    useEffect(() => {
        if (currentSessionId) {
            fetchMessages(currentSessionId);
        }
    }, [currentSessionId]);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const handleSend = async () => {
        if (!input.trim() || isLoading || !currentSessionId) return;

        const userQuery = input.trim();
        setInput('');
        const newUserMsg: Message = { role: 'user', content: userQuery };
        setMessages(prev => [...prev, newUserMsg]);
        setIsLoading(true);

        try {
            // Save user message
            await supabase.from('chat_messages').insert([{
                session_id: currentSessionId,
                role: 'user',
                content: userQuery
            }]);

            const botResponseContent = await queryKnowledge(userQuery, meetingHistory);
            const botMsg: Message = { role: 'assistant', content: botResponseContent };
            setMessages(prev => [...prev, botMsg]);

            // Save bot message
            await supabase.from('chat_messages').insert([{
                session_id: currentSessionId,
                role: 'assistant',
                content: botResponseContent
            }]);

            // If it's the first message, update session title
            if (messages.length === 0) {
                const title = userQuery.substring(0, 30) + (userQuery.length > 30 ? '...' : '');
                await supabase.from('chat_sessions').update({ title }).eq('id', currentSessionId);
                setSessions(prev => prev.map(s => s.id === currentSessionId ? { ...s, title } : s));
            }
        } catch (error: any) {
            console.error('Chat error:', error);
            setMessages(prev => [...prev, { role: 'assistant', content: 'Sorry, I encountered an error. Please try again.' }]);
        } finally {
            setIsLoading(false);
        }
    };

    const handleSignOut = async () => {
        await supabase.auth.signOut();
        navigate('/auth');
    };

    return (
        <div className={`flex h-screen w-full overflow-hidden transition-colors duration-300 ${theme === 'dark' ? 'bg-[#050505] text-white' : 'bg-slate-50 text-slate-900'}`}>
            {/* Sidebar Overlay */}
            {sidebarOpen && (
                <div
                    className="fixed inset-0 bg-black/60 backdrop-blur-sm z-30 md:hidden"
                    onClick={() => setSidebarOpen(false)}
                />
            )}

            {/* Sidebar */}
            <aside className={`
        fixed inset-y-0 left-0 z-40 w-64 border-r transform transition-transform duration-300 ease-in-out flex flex-col pt-6 pb-4
        ${theme === 'dark' ? 'bg-[#0B0C10] border-white/10' : 'bg-white border-slate-200'}
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
      `}>
                <div className="flex items-center justify-between px-6 mb-8 relative">
                    <div className="font-extrabold text-2xl bg-clip-text text-transparent bg-gradient-to-r from-red-500 via-red-300 to-red-500 tracking-tighter animate-gradient">
                        3.0Labs
                    </div>
                    <button className="md:hidden text-gray-400 hover:text-white" onClick={() => setSidebarOpen(false)}>
                        &times;
                    </button>
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

                <nav className="flex-1 overflow-y-auto px-3 py-2 space-y-1">
                    <p className="px-3 py-2 text-xs font-semibold text-gray-500 uppercase">General</p>
                    <Link to="/summarizer" className="flex items-center text-gray-300 hover:text-white hover:bg-white/5 rounded-xl px-3 py-2.5 transition-all">
                        <Home className="w-5 h-5 mr-3 opacity-70" /> Dashboard
                    </Link>
                    <Link to="/history" className="flex items-center text-gray-300 hover:text-white hover:bg-white/5 rounded-xl px-3 py-2.5 transition-all">
                        <History className="w-5 h-5 mr-3 opacity-70" /> Meeting History
                    </Link>
                    <Link to="/ai-chat" className="flex items-center bg-red-600/10 text-red-500 font-bold rounded-xl px-3 py-2.5 shadow-[inset_0_0_10px_rgba(239,68,68,0.1)] border border-red-500/20">
                        <Brain className="w-5 h-5 mr-3" /> 3.0 Agent
                    </Link>

                    <p className="px-3 py-2 text-xs font-semibold text-gray-500 uppercase mt-4">PM Agent</p>
                    <Link to="/pm-dashboard" className="flex items-center text-gray-300 hover:text-white hover:bg-white/5 rounded-xl px-3 py-2.5 transition-all">
                        <Sparkles className="w-5 h-5 mr-3 opacity-70" /> PM Dashboard
                    </Link>
                    <Link to="/prd-generator" className="flex items-center text-gray-300 hover:text-white hover:bg-white/5 rounded-xl px-3 py-2.5 transition-all">
                        <FileText className="w-5 h-5 mr-3 opacity-70" /> PRD Generator
                    </Link>
                    <Link to="/user-stories" className="flex items-center text-gray-300 hover:text-white hover:bg-white/5 rounded-xl px-3 py-2.5 transition-all">
                        <Users className="w-5 h-5 mr-3 opacity-70" /> User Stories
                    </Link>
                    <Link to="/sprint-planner" className="flex items-center text-gray-300 hover:text-white hover:bg-white/5 rounded-xl px-3 py-2.5 transition-all">
                        <CalendarIcon className="w-5 h-5 mr-3 opacity-70" /> Sprint Planner
                    </Link>
                </nav>

                <div className="px-6 space-y-2 mt-auto">
                    <button onClick={toggleTheme} className="flex items-center w-full text-gray-400 hover:text-red-400 hover:bg-red-500/10 px-3 py-2 rounded-xl transition-all">
                        {theme === 'dark' ? <Sun className="w-5 h-5 mr-3" /> : <Moon className="w-5 h-5 mr-3" />}
                        {theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
                    </button>
                    <button onClick={handleSignOut} className="flex items-center w-full text-gray-400 hover:text-red-400 hover:bg-red-500/10 px-3 py-2 rounded-xl transition-all">
                        <LogOut className="w-5 h-5 mr-3" /> Sign Out
                    </button>
                </div>
            </aside>

            {/* Chat History Sidebar (Desktop Right) */}
            <aside className={`
                fixed inset-y-0 right-0 z-20 w-72 bg-[#0B0C10]/95 backdrop-blur-md border-l border-white/5 transition-transform duration-300 hidden lg:flex flex-col
                ${chatHistoryOpen ? 'translate-x-0' : 'translate-x-full'}
            `}>
                <div className="p-6 flex items-center justify-between border-b border-white/5">
                    <h3 className="font-bold text-white flex items-center gap-2">
                        <MessageSquare className="w-4 h-4 text-red-500" />
                        Chat History
                    </h3>
                    <button
                        onClick={() => createNewChat()}
                        className="p-1.5 bg-white/5 hover:bg-red-500/20 rounded-lg text-gray-400 hover:text-red-500 transition-all"
                        title="New Chat"
                    >
                        <Plus className="w-5 h-5" />
                    </button>
                </div>
                <div className="flex-1 overflow-y-auto p-4 space-y-2 custom-scrollbar">
                    {sessions.map(s => (
                        <div
                            key={s.id}
                            onClick={() => setCurrentSessionId(s.id)}
                            className={`
                                group relative p-3 rounded-xl border cursor-pointer transition-all
                                ${currentSessionId === s.id
                                    ? 'bg-red-500/10 border-red-500/30 text-white'
                                    : 'bg-white/5 border-white/5 text-gray-400 hover:bg-white/10 hover:border-white/10'}
                            `}
                        >
                            <div className="pr-6 truncate text-sm font-medium">{s.title}</div>
                            <div className="text-[10px] opacity-50 mt-1">{new Date(s.created_at).toLocaleDateString()}</div>
                            <button
                                onClick={(e) => deleteSession(e, s.id)}
                                className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 opacity-0 group-hover:opacity-100 hover:text-red-500 transition-all"
                            >
                                <Trash className="w-3.5 h-3.5" />
                            </button>
                        </div>
                    ))}
                    {sessions.length === 0 && (
                        <div className="text-center py-10 text-gray-600 italic text-sm">No chats yet</div>
                    )}
                </div>
            </aside>

            {/* Main Content */}
            <main className={`flex-1 flex flex-col md:ml-64 ${chatHistoryOpen ? 'lg:mr-72' : ''} relative overflow-hidden bg-[#050505]`}>
                {/* Background Wow Effects */}
                <div className="absolute inset-0 pointer-events-none opacity-30 select-none overflow-hidden">
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-[30vw] font-black text-red-500/[0.04] animate-pulse-slow">
                        3.0 AGENT
                    </div>
                </div>

                {/* Header */}
                <header className="flex items-center justify-between px-6 py-4 bg-[#0B0C10]/80 backdrop-blur-xl border-b border-white/5 z-30">
                    <div className="flex items-center gap-4">
                        <button className="md:hidden" onClick={() => setSidebarOpen(true)}>
                            <Menu className="w-6 h-6" />
                        </button>
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center">
                                <Brain className="w-6 h-6 text-red-500" />
                            </div>
                            <div>
                                <h1 className="text-xl font-bold tracking-tight">3.0 Agent</h1>
                                <p className="text-[10px] text-red-500/80 uppercase font-black tracking-widest flex items-center gap-1">
                                    <span className="w-1 h-1 bg-red-500 rounded-full animate-ping"></span>
                                    {meetingHistory.length} MEETING CONTEXTS LOADED
                                </p>
                            </div>
                        </div>
                    </div>
                    <button
                        onClick={() => setChatHistoryOpen(!chatHistoryOpen)}
                        className="hidden lg:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-xs font-bold text-gray-400 transition-all border border-white/10"
                    >
                        <MessageSquare className="w-4 h-4" />
                        {chatHistoryOpen ? 'HIDE HISTORY' : 'SHOW HISTORY'}
                    </button>
                </header>

                {/* Chat Area */}
                <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar z-10">
                    {messages.map((msg, i) => (
                        <div
                            key={i}
                            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-fade-in-up`}
                            style={{ animationDelay: `${i * 0.1}s` }}
                        >
                            <div className={`
                flex gap-4 max-w-[95%] md:max-w-[80%] ${msg.role === 'user' ? 'flex-row-reverse' : ''}
              `}>
                                <div className={`
                  w-8 h-8 rounded-lg flex-shrink-0 flex items-center justify-center
                  ${msg.role === 'user' ? 'bg-zinc-800' : 'bg-red-500/20 border border-red-500/30'}
                `}>
                                    {msg.role === 'user' ? userName[0]?.toUpperCase() : <Bot className="w-5 h-5 text-red-500" />}
                                </div>
                                <div className={`
                  p-5 rounded-2xl leading-relaxed text-sm md:text-base prose ${theme === 'dark' ? 'prose-invert' : ''} max-w-none
                  ${msg.role === 'user'
                                        ? 'bg-red-600 text-white shadow-lg border-none'
                                        : theme === 'dark' ? 'bg-white/5 border border-white/10 text-gray-200' : 'bg-white border border-black/5 shadow-sm text-slate-700'}
                `}>
                                    {(() => {
                                        const processedContent = msg.content
                                            // Fix AI wrapping images in backticks: `![...](...)` -> ![...](...)
                                            .replace(/`(!\[.*?\]\(.*?\))`|'(!\[.*?\]\(.*?\))'|"(!\[.*?\]\(.*?\))"/g, '$1$2$3')
                                            // Fix spacing issues: ! [...] (url) -> ![...](url)
                                            .replace(/!\s*\[/g, '![')
                                            .replace(/\]\s*\(/g, '](');

                                        return (
                                            <ReactMarkdown
                                                remarkPlugins={[remarkGfm]}
                                                components={{
                                                    code({ className, children, ...props }: any) {
                                                        const match = /language-(\w+)/.exec(className || '');
                                                        const content = String(children).replace(/\n$/, '');

                                                        if (match && match[1] === 'mermaid') {
                                                            return <MermaidChart chart={content} />;
                                                        }

                                                        if (match) {
                                                            return (
                                                                <code className={className} {...props}>
                                                                    {children}
                                                                </code>
                                                            );
                                                        }

                                                        return (
                                                            <code className="bg-white/10 px-1.5 py-0.5 rounded text-red-400 font-mono text-sm" {...props}>
                                                                {children}
                                                            </code>
                                                        );
                                                    },
                                                    pre: ({ children, ...props }: any) => (
                                                        <pre className="bg-black/40 p-4 rounded-xl border border-white/5 overflow-x-auto my-3 scrollbar-hide" {...props}>
                                                            {children}
                                                        </pre>
                                                    ),

                                                    p: ({ children }) => <p className="mb-4 last:mb-0 leading-relaxed">{children}</p>,
                                                    ul: ({ children }) => <ul className="list-disc pl-5 mb-4 space-y-2">{children}</ul>,
                                                    ol: ({ children }) => <ol className="list-decimal pl-5 mb-4 space-y-2">{children}</ol>,
                                                    li: ({ children }) => <li className="text-gray-300">{children}</li>,
                                                    h1: ({ children }) => <h1 className="text-xl font-bold mb-4 text-white border-b border-white/10 pb-2">{children}</h1>,
                                                    h2: ({ children }) => <h2 className="text-lg font-bold mb-3 text-red-400">{children}</h2>,
                                                    h3: ({ children }) => <h3 className="text-md font-bold mb-2 text-white/90">{children}</h3>,
                                                    blockquote: ({ children }) => (
                                                        <blockquote className="border-l-4 border-red-500 bg-red-500/5 px-4 py-2 my-4 rounded-r-lg italic text-gray-400">
                                                            {children}
                                                        </blockquote>
                                                    ),
                                                    img: ({ ...props }) => {
                                                        const cleanSrc = props.src?.replace(/\s/g, '+');
                                                        return (
                                                            <div className="my-6 rounded-2xl overflow-hidden border border-white/10 shadow-2xl animate-fade-in group relative">
                                                                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 flex items-end p-4">
                                                                    <p className="text-xs text-white/70 font-medium italic">3.0 Labs Intelligence Generated Mockup</p>
                                                                </div>
                                                                <img
                                                                    {...props}
                                                                    src={cleanSrc}
                                                                    className="w-full h-auto object-cover transform transition-transform duration-700 group-hover:scale-105"
                                                                    loading="lazy"
                                                                    onError={(e) => {
                                                                        const target = e.target as HTMLImageElement;
                                                                        target.src = 'https://images.unsplash.com/photo-1550751827-4bd374c3f58b?auto=format&fit=crop&q=80&w=1024'; // Tech fallback
                                                                    }}
                                                                />
                                                            </div>
                                                        );
                                                    }
                                                }}
                                            >
                                                {processedContent}
                                            </ReactMarkdown>
                                        );
                                    })()}
                                </div>
                            </div>
                        </div>
                    ))}
                    {isLoading && (
                        <div className="flex justify-start animate-fade-in">
                            <div className="flex gap-4 max-w-[70%]">
                                <div className="w-8 h-8 rounded-lg bg-red-500/20 border border-red-500/30 flex items-center justify-center animate-pulse">
                                    <Bot className="w-5 h-5 text-red-500" />
                                </div>
                                <div className="bg-white/5 border border-white/10 p-4 rounded-2xl flex items-center gap-2">
                                    <div className="w-1.5 h-1.5 bg-red-500 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
                                    <div className="w-1.5 h-1.5 bg-red-500 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
                                    <div className="w-1.5 h-1.5 bg-red-500 rounded-full animate-bounce"></div>
                                    <span className="text-xs text-gray-500 font-bold uppercase ml-2 tracking-widest">Constructing Response...</span>
                                </div>
                            </div>
                        </div>
                    )}
                    <div ref={messagesEndRef} />
                </div>

                {/* Input Area */}
                <div className="p-6 bg-gradient-to-t from-[#050505] to-transparent z-20">
                    <div className="max-w-4xl mx-auto relative group">
                        <div className="absolute -inset-0.5 bg-gradient-to-r from-red-600 to-red-900 rounded-2xl blur opacity-25 group-focus-within:opacity-50 transition duration-500"></div>
                        <div className="relative flex items-center bg-[#111111] border border-white/10 rounded-2xl p-2 transition-all group-focus-within:border-red-500/50">
                            <input
                                type="text"
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                onKeyPress={(e) => e.key === 'Enter' && handleSend()}
                                autoComplete="off"
                                name="chat_input"
                                placeholder="Ask for a flowchart, design, or meeting insight..."
                                className="flex-1 bg-transparent px-4 py-3 outline-none text-white placeholder-gray-500"
                            />
                            <button
                                onClick={handleSend}
                                disabled={isLoading || !input.trim()}
                                className={`
                  p-3 rounded-xl flex items-center justify-center transition-all
                  ${!input.trim() || isLoading
                                        ? 'text-gray-600 bg-white/5 cursor-not-allowed'
                                        : 'text-white bg-red-600 hover:bg-red-500 shadow-lg shadow-red-600/20'}
                `}
                            >
                                {isLoading ? <Zap className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
                            </button>
                        </div>
                    </div>
                    <p className="text-[10px] text-center text-gray-600 mt-4 uppercase tracking-[0.2em] font-bold">
                        Powered by 3.0 Labs Global Intelligence & Mermaid.js
                    </p>
                </div>

                {/* Floating Patrolling Robot during Loading */}
                {isLoading && (
                    <div className="absolute top-1/4 right-1/4 pointer-events-none z-0">
                        <div className="w-20 h-14 bg-[#1a1c24] border-b-2 border-red-500/50 rounded-b-2xl animate-robot-roam flex flex-col items-center justify-center">
                            <div className="flex gap-2">
                                <div className="w-2 h-2 bg-red-500 rounded-full animate-ping"></div>
                                <div className="w-2 h-2 bg-red-500 rounded-full animate-ping [animation-delay:-0.5s]"></div>
                            </div>
                            <div className="mt-2 w-8 h-0.5 bg-red-500/20 rounded-full overflow-hidden">
                                <div className="w-full h-full bg-red-500 animate-[shimmer_2s_infinite]"></div>
                            </div>
                        </div>
                    </div>
                )}
            </main>

            <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 5px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(239, 68, 68, 0.1);
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(239, 68, 68, 0.3);
        }
        .prose code {
            color: inherit;
        }
        .scrollbar-hide::-webkit-scrollbar {
            display: none;
        }
      `}</style>
        </div>
    );
}
