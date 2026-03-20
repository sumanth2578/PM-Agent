import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import mermaid from 'mermaid';
import {
    Sparkles,
    Users,
    Clock,
    History as HistoryIcon,
    Plus,
    MessageSquare,
    Send,
    Bot,
    Zap
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useTheme } from '../context/ThemeContext';

interface Message {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    timestamp: string;
}

interface ChatSession {
    id: string;
    title: string;
    last_message: string;
    updated_at: string;
}

interface MermaidChartProps {
    chart: string;
}

const MermaidChart = ({ chart }: MermaidChartProps) => {
    const ref = useRef<HTMLDivElement>(null);
    const { theme } = useTheme();
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (ref.current && chart) {
            try {
                mermaid.initialize({
                    startOnLoad: true,
                    theme: theme === 'dark' ? 'dark' : 'default',
                    securityLevel: 'loose',
                });
                mermaid.render(`mermaid-${Math.random().toString(36).substr(2, 9)}`, chart).then((result) => {
                    if (ref.current) {
                        ref.current.innerHTML = result.svg;
                    }
                });
            } catch (err) {
                console.error('Mermaid rendering failed:', err);
                setError('Failed to render chart');
            }
        }
    }, [chart, theme]);

    if (error) return <div className="text-red-500 text-sm p-4 bg-red-500/10 rounded-lg">{error}</div>;
    return <div ref={ref} className="bg-white/5 p-4 rounded-xl overflow-x-auto" />;
};

export default function KnowledgeChat() {
    const navigate = useNavigate();
    const { theme } = useTheme();
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [sessions, setSessions] = useState<ChatSession[]>([]);
    const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
    const [chatHistoryOpen, setChatHistoryOpen] = useState(true);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        fetchSessions();
    }, []);

    useEffect(() => {
        if (currentSessionId) {
            fetchMessages(currentSessionId);
        } else {
            setMessages([]);
        }
    }, [currentSessionId]);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const fetchSessions = async () => {
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            const { data, error } = await supabase
                .from('chat_sessions')
                .select('*')
                .eq('user_id', user.id)
                .order('updated_at', { ascending: false });

            if (error) throw error;
            setSessions(data || []);
        } catch (err) {
            console.error('Error fetching sessions:', err);
        }
    };

    const fetchMessages = async (sessionId: string) => {
        try {
            const { data, error } = await supabase
                .from('chat_messages')
                .select('*')
                .eq('session_id', sessionId)
                .order('created_at', { ascending: true });

            if (error) throw error;
            setMessages(data.map(m => ({
                id: m.id,
                role: m.role,
                content: m.content,
                timestamp: m.created_at
            })));
        } catch (err) {
            console.error('Error fetching messages:', err);
        }
    };

    const createNewChat = async () => {
        setCurrentSessionId(null);
        setMessages([]);
        setInput('');
    };

    const handleSend = async () => {
        if (!input.trim() || isLoading) return;

        try {
            setIsLoading(true);
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) {
                navigate('/auth');
                return;
            }

            let sessionId = currentSessionId;
            if (!sessionId) {
                const { data, error } = await supabase
                    .from('chat_sessions')
                    .insert([{
                        user_id: user.id,
                        title: input.substring(0, 30) + (input.length > 30 ? '...' : ''),
                        last_message: input
                    }])
                    .select()
                    .single();

                if (error) throw error;
                sessionId = data.id;
                setCurrentSessionId(sessionId);
                fetchSessions();
            }

            // Save user message
            const { error: msgError } = await supabase
                .from('chat_messages')
                .insert([{
                    session_id: sessionId,
                    role: 'user',
                    content: input
                }]);

            if (msgError) throw msgError;

            const userMsg: Message = {
                id: Math.random().toString(),
                role: 'user',
                content: input,
                timestamp: new Date().toISOString()
            };
            setMessages(prev => [...prev, userMsg]);
            setInput('');

            // AI Response logic (mock or real API call)
            // For now, let's use a simple response or a real call to your backend/AI service
            const aiResponse = await mockAIResponse(input);
            
            // Save AI response
            const { error: aiMsgError } = await supabase
                .from('chat_messages')
                .insert([{
                    session_id: sessionId,
                    role: 'assistant',
                    content: aiResponse
                }]);

            if (aiMsgError) throw aiMsgError;

            const aiMsg: Message = {
                id: Math.random().toString(),
                role: 'assistant',
                content: aiResponse,
                timestamp: new Date().toISOString()
            };
            setMessages(prev => [...prev, aiMsg]);

            // Update session last message
            await supabase
                .from('chat_sessions')
                .update({ last_message: aiResponse, updated_at: new Date().toISOString() })
                .eq('id', sessionId);

            fetchSessions();
        } catch (err) {
            console.error('Error in handleSend:', err);
        } finally {
            setIsLoading(false);
        }
    };

    const mockAIResponse = async (query: string): Promise<string> => {
        // Simulate thinking
        await new Promise(r => setTimeout(r, 1500));
        
        if (query.toLowerCase().includes('flow') || query.toLowerCase().includes('chart') || query.toLowerCase().includes('diagram')) {
            return "Certainly! Here's a flowchart representing the core meeting lifecycle in 3.0Labs:\n\n```mermaid\ngraph TD\nA[Start Meeting] --> B[Join 3.0 Agent]\nB --> C[Real-time Recording]\nC --> D[Generate Transcript]\nD --> E[AI Analysis]\nE --> F[PRD/User Stories/Sprint Plan]\nF --> G[Project Management Integration]\n```\n\nIs there anything specific you'd like me to adjust in this diagram?";
        }
        
        return `Based on our meeting data, here are the key insights for: "${query}"\n\n1. **Dynamic Prioritization**: The team emphasized the need for real-time adjustments.\n2. **User-Centric Design**: Feedback indicates a strong preference for the minimalist sidebar.\n3. **Scalability**: The backend architecture is ready for high-concurrency recording sessions.\n\nWould you like me to generate a detailed PRD based on these points?`;
    };

    return (
        <>
            <div className={`flex flex-1 h-screen overflow-hidden relative transition-colors duration-300 ${theme === 'dark' ? 'bg-[#050505] text-white' : 'bg-slate-50 text-slate-900'}`}>
                {/* Chat History Sidebar (Desktop Right) */}
                <aside className={`
                    fixed inset-y-0 right-0 z-20 w-72 bg-[#0B0C10]/95 backdrop-blur-md border-l border-red-500/10 transition-transform duration-300 hidden lg:flex flex-col
                    ${chatHistoryOpen ? 'translate-x-0' : 'translate-x-full'}
                `}>
                    <div className="p-6 flex items-center justify-between border-b border-white/5">
                        <h3 className="font-bold text-white flex items-center gap-2">
                            <MessageSquare className="w-4 h-4 text-red-500" />
                            Chat History
                        </h3>
                        <button
                            onClick={createNewChat}
                            className="p-1.5 bg-white/5 hover:bg-red-500/20 rounded-lg text-gray-400 hover:text-red-500 transition-all"
                            title="New Chat"
                        >
                            <Plus className="w-4 h-4" />
                        </button>
                    </div>

                    <div className="flex-1 overflow-y-auto p-4 space-y-2 custom-scrollbar">
                        {sessions.map((s) => (
                            <button
                                key={s.id}
                                onClick={() => setCurrentSessionId(s.id)}
                                className={`w-full p-3 rounded-xl border transition-all text-left group
                                    ${currentSessionId === s.id
                                        ? 'bg-red-500/10 border-red-500/30 text-white'
                                        : 'bg-white/5 border-transparent text-gray-400 hover:bg-white/10 hover:border-white/10'
                                    }`}
                            >
                                <div className="text-sm font-bold truncate mb-1">{s.title || 'Untitled Session'}</div>
                                <div className="text-xs opacity-50 truncate flex items-center gap-1">
                                    <Clock className="w-3 h-3" />
                                    {new Date(s.updated_at).toLocaleDateString()}
                                </div>
                            </button>
                        ))}
                    </div>
                </aside>

                {/* Main Chat Area */}
                <main className={`flex-1 flex flex-col ${chatHistoryOpen ? 'lg:mr-72' : ''} relative overflow-hidden bg-[#050505]`}>
                    <header className="px-4 h-16 border-b border-white/5 flex items-center justify-between bg-[#0B0C10]/50 backdrop-blur-xl z-20">
                        <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg bg-red-600 flex items-center justify-center shadow-lg shadow-red-600/20">
                                <Sparkles className="w-5 h-5 text-white" />
                            </div>
                            <div>
                                <h1 className="text-sm font-bold tracking-wider text-white">3.0 AGENT</h1>
                                <div className="flex items-center gap-1.5">
                                    <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></span>
                                    <span className="text-[10px] text-emerald-500 font-bold tracking-widest uppercase">Knowledge Engine Active</span>
                                </div>
                            </div>
                        </div>

                        <button
                            onClick={() => setChatHistoryOpen(!chatHistoryOpen)}
                            className="p-2 hover:bg-white/5 rounded-lg text-gray-400 transition-all"
                        >
                            <HistoryIcon className="w-5 h-5" />
                        </button>
                    </header>

                    {/* Messages */}
                    <div className="flex-1 overflow-y-auto px-4 py-8 space-y-6 custom-scrollbar scroll-smooth">
                        {messages.length === 0 && (
                            <div className="h-full flex flex-col items-center justify-center text-center p-8">
                                <div className="w-20 h-20 rounded-3xl bg-red-600/10 border border-red-500/20 flex items-center justify-center mb-6 relative group">
                                    <div className="absolute inset-0 bg-red-600 rounded-3xl blur-2xl opacity-10 group-hover:opacity-20 transition-opacity"></div>
                                    <Bot className="w-10 h-10 text-red-500" />
                                </div>
                                <h2 className="text-2xl font-bold mb-2 bg-gradient-to-r from-white to-gray-500 bg-clip-text text-transparent">Hello, I'm the 3.0 Agent</h2>
                                <p className="text-gray-400 max-w-md mx-auto leading-relaxed">How can I help you today? I can visualize meeting flows, extract insights, or help you brainstorm new product features.</p>
                            </div>
                        )}

                        {messages.map((msg) => (
                            <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-fade-in-up`}>
                                <div className={`flex gap-3 sm:gap-4 max-w-[90%] sm:max-w-[80%] md:max-w-[70%] ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                                    <div className={`w-8 h-8 rounded-lg shrink-0 flex items-center justify-center shadow-lg ${
                                        msg.role === 'user' ? 'bg-white/10 text-white' : 'bg-red-600 text-white'
                                    }`}>
                                        {msg.role === 'user' ? <Users className="w-5 h-5" /> : <Bot className="w-5 h-5" />}
                                    </div>
                                    <div className={`p-4 rounded-2xl leading-relaxed text-sm md:text-base prose prose-invert max-w-none ${
                                        msg.role === 'user' ? 'bg-red-600 text-white rounded-tr-none' : 'bg-white/5 border border-white/10 rounded-tl-none'
                                    }`}>
                                        <ReactMarkdown 
                                            remarkPlugins={[remarkGfm]}
                                            components={{
                                                code({ node, inline, className, children, ...props }: any) {
                                                    const match = /language-(\w+)/.exec(className || '');
                                                    if (!inline && match && match[1] === 'mermaid') {
                                                        return <MermaidChart chart={String(children).replace(/\n$/, '')} />;
                                                    }
                                                    return (
                                                        <code className={`${className} bg-white/10 px-1.5 py-0.5 rounded text-red-400 font-mono text-sm`} {...props}>
                                                            {children}
                                                        </code>
                                                    );
                                                },
                                                img: ({ ...props }) => <div className="my-6 rounded-2xl overflow-hidden border border-white/10 shadow-2xl animate-fade-in group relative"><img {...props} className="w-full h-auto object-cover transform transition-transform duration-700 group-hover:scale-105" loading="lazy" onError={(e) => { (e.target as HTMLImageElement).src = 'https://images.unsplash.com/photo-1550751827-4bd374c3f58b?auto=format&fit=crop&q=80&w=1024'; }} /></div>
                                            }}
                                        >
                                            {msg.content}
                                        </ReactMarkdown>
                                    </div>
                                </div>
                            </div>
                        ))}
                        {isLoading && (
                            <div className="flex justify-start animate-fade-in">
                                <div className="flex gap-3 sm:gap-4 max-w-[90%] sm:max-w-[80%] md:max-w-[70%]">
                                    <div className="w-8 h-8 rounded-lg bg-red-500/20 border border-red-500/30 flex items-center justify-center animate-pulse"><Bot className="w-5 h-5 text-red-500" /></div>
                                    <div className="bg-white/5 border border-white/10 p-4 rounded-2xl flex items-center gap-2"><div className="w-1.5 h-1.5 bg-red-500 rounded-full animate-bounce [animation-delay:-0.3s]"></div><div className="w-1.5 h-1.5 bg-red-500 rounded-full animate-bounce [animation-delay:-0.15s]"></div><div className="w-1.5 h-1.5 bg-red-500 rounded-full animate-bounce"></div><span className="text-xs text-gray-500 font-bold uppercase ml-2 tracking-widest">Constructing Response...</span></div>
                                </div>
                            </div>
                        )}
                        <div ref={messagesEndRef} />
                    </div>

                    <div className="p-3 sm:p-4 md:p-6 bg-gradient-to-t from-[#050505] to-transparent z-20">
                        <div className="max-w-4xl mx-auto relative group">
                            <div className="absolute -inset-0.5 bg-gradient-to-r from-red-600 to-red-900 rounded-2xl blur opacity-25 group-focus-within:opacity-50 transition duration-500"></div>
                            <div className="relative flex items-center bg-[#111111] border border-white/10 rounded-2xl p-2 transition-all group-focus-within:border-red-500/50">
                                <input 
                                    type="text" 
                                    value={input} 
                                    onChange={(e) => setInput(e.target.value)} 
                                    onKeyPress={(e) => e.key === 'Enter' && handleSend()} 
                                    autoComplete="off" 
                                    placeholder="Ask for a flowchart, design, or meeting insight..." 
                                    className="flex-1 bg-transparent px-4 py-3 outline-none text-white placeholder-gray-500" 
                                />
                                <button 
                                    onClick={handleSend} 
                                    disabled={isLoading || !input.trim()} 
                                    className={`p-3 rounded-xl flex items-center justify-center transition-all ${!input.trim() || isLoading ? 'text-gray-600 bg-white/5 cursor-not-allowed' : 'text-white bg-red-600 hover:bg-red-500 shadow-lg shadow-red-600/20'}`}
                                >
                                    {isLoading ? <Zap className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
                                </button>
                            </div>
                        </div>
                    </div>
                </main>
            </div>
            <style>{`
                .custom-scrollbar::-webkit-scrollbar { width: 5px; }
                .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
                .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(239, 68, 68, 0.1); border-radius: 10px; }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(239, 68, 68, 0.3); }
                .prose code { color: inherit; }
                .scrollbar-hide::-webkit-scrollbar { display: none; }
            `}</style>
        </>
    );
}
