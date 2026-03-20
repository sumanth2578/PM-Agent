import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { FileText, Users, Calendar, BarChart3, Sparkles, ArrowRight, Download, Loader2, RotateCw } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useTheme } from '../context/ThemeContext';
// @ts-ignore
import html2pdf from 'html2pdf.js';

interface PMStats {
    prdsCreated: number;
    storiesGenerated: number;
    sprintsPlanned: number;
}

export function PMDashboard() {
    const [stats, setStats] = useState<PMStats>({ prdsCreated: 0, storiesGenerated: 0, sprintsPlanned: 0 });
    const [isDownloading, setIsDownloading] = useState(false);
    const { theme } = useTheme();
    const [loading, setLoading] = useState(false);
    
    const fetchUserAndStats = async () => {
        setLoading(true);
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (user) {
                const prdRes = await supabase.from('prds').select('id', { count: 'exact' }).eq('user_id', user.id);
                const storyRes = await supabase.from('user_stories').select('id', { count: 'exact' }).eq('user_id', user.id);
                const sprintRes = await supabase.from('sprint_plans').select('id', { count: 'exact' }).eq('user_id', user.id);

                setStats({
                    prdsCreated: prdRes.count || 0,
                    storiesGenerated: storyRes.count || 0,
                    sprintsPlanned: sprintRes.count || 0,
                });
            }
        } catch (err) {
            console.error('Error fetching dashboard stats:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchUserAndStats();
    }, []);

    const [isSyncing, setIsSyncing] = useState(false);

    const handleSync = async () => {
        setIsSyncing(true);
        await fetchUserAndStats();
        setTimeout(() => setIsSyncing(false), 1000);
    };

    const handleDownloadReport = async () => {
        setIsDownloading(true);
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            const [prds, stories, sprints] = await Promise.all([
                supabase.from('prds').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
                supabase.from('user_stories').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
                supabase.from('sprint_plans').select('*').eq('user_id', user.id).order('created_at', { ascending: false })
            ]);

            const element = document.createElement('div');
            let innerHTML = `
                <div style="padding: 40px; font-family: sans-serif; color: #333; line-height: 1.6;">
                    <h1 style="color: #ef4444; border-bottom: 2px solid #ef4444; padding-bottom: 10px;">3.0 Labs PM Intelligence Report</h1>
                    <p style="color: #666; font-size: 12px;">Generated on: ${new Date().toLocaleString()}</p>
                    <br/>
            `;

            const mdToHtml = (md: string) => {
                return md
                    .replace(/^# (.*$)/gm, '<h1 style="color: #ef4444; font-size: 24px; margin-top: 20px;">$1</h1>')
                    .replace(/^## (.*$)/gm, '<h2 style="color: #333; font-size: 18px; margin-top: 15px; border-left: 20px solid #ef4444; padding-left: 10px;">$1</h2>')
                    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                    .replace(/\*(.*?)\*/g, '<em>$1</em>')
                    .replace(/^\- (.*$)/gm, '<li style="margin-left: 20px;">$1</li>')
                    .replace(/\n\n/g, '<br/><br/>')
                    .replace(/\n/g, '<br/>');
            };

            innerHTML += `<h2 style="color: #ef4444; margin-top: 30px; border-bottom: 1px solid #ddd;">equivôä Product Requirements Documents</h2>`;
            if (prds.data?.length) {
                prds.data.forEach((prd: any) => {
                    innerHTML += `
                        <div style="margin-bottom: 30px;">
                            <h3 style="color: #1a1c24;">${prd.title}</h3>
                            <p style="color: #999; font-size: 10px;">Created: ${new Date(prd.created_at).toLocaleDateString()}</p>
                            <div style="white-space: pre-wrap; margin-top: 10px; font-size: 13px;">${mdToHtml(prd.content)}</div>
                        </div>
                        <hr style="border: 0; border-top: 1px solid #eee;"/>
                    `;
                });
            } else { innerHTML += `<p>No PRDs found.</p>`; }

            innerHTML += `<h2 style="color: #ef4444; margin-top: 40px; border-bottom: 1px solid #ddd;">equivôæ User Stories</h2>`;
            if (stories.data?.length) {
                stories.data.forEach((story: any) => {
                    innerHTML += `
                        <div style="margin-bottom: 30px;">
                            <h3 style="color: #1a1c24;">${story.feature}</h3>
                            <p style="color: #999; font-size: 10px;">Created: ${new Date(story.created_at).toLocaleDateString()}</p>
                            <div style="white-space: pre-wrap; margin-top: 10px; font-size: 13px;">${mdToHtml(story.content)}</div>
                        </div>
                        <hr style="border: 0; border-top: 1px solid #eee;"/>
                    `;
                });
            } else { innerHTML += `<p>No user stories found.</p>`; }

            innerHTML += `<h2 style="color: #ef4444; margin-top: 40px; border-bottom: 1px solid #ddd;">equivôä Sprint Plans</h2>`;
            if (sprints.data?.length) {
                sprints.data.forEach((sprint: any) => {
                    innerHTML += `
                        <div style="margin-bottom: 30px;">
                            <h3 style="color: #1a1c24;">${sprint.backlog}</h3>
                            <p style="color: #999; font-size: 10px;">Duration: ${sprint.duration} | Created: ${new Date(sprint.created_at).toLocaleDateString()}</p>
                            <div style="white-space: pre-wrap; margin-top: 10px; font-size: 13px;">${mdToHtml(sprint.content)}</div>
                        </div>
                        <hr style="border: 0; border-top: 1px solid #eee;"/>
                    `;
                });
            } else { innerHTML += `<p>No sprint plans found.</p>`; }

            innerHTML += `</div>`;
            element.innerHTML = innerHTML;

            const opt = {
                margin: 10,
                filename: `PM_Intelligence_Report_${new Date().toISOString().split('T')[0]}.pdf`,
                image: { type: 'jpeg' as 'jpeg', quality: 0.98 },
                html2canvas: { scale: 2 },
                jsPDF: { unit: 'mm' as 'mm', format: 'a4' as 'a4', orientation: 'portrait' as 'portrait' }
            };

            await html2pdf().set(opt).from(element).save();
        } catch (error) {
            console.error('Error downloading report:', error);
        } finally {
            setIsDownloading(false);
        }
    };

    const pmTools = [
        {
            title: 'PRD Generator',
            description: 'Generate comprehensive Product Requirements Documents from a simple idea using AI.',
            icon: <FileText className="w-7 h-7" />,
            link: '/prd-generator',
            gradient: 'from-blue-500 to-cyan-500',
            glowColor: 'rgba(59,130,246,0.3)',
            stat: `${stats.prdsCreated} created`,
        },
        {
            title: 'User Stories',
            description: 'Create detailed user stories with acceptance criteria and story points automatically.',
            icon: <Users className="w-7 h-7" />,
            link: '/user-stories',
            gradient: 'from-purple-500 to-pink-500',
            glowColor: 'rgba(168,85,247,0.3)',
            stat: `${stats.storiesGenerated} generated`,
        },
        {
            title: 'Sprint Planner',
            description: 'Plan sprints with AI-suggested priorities, story points, and task assignments.',
            icon: <Calendar className="w-7 h-7" />,
            link: '/sprint-planner',
            gradient: 'from-emerald-500 to-teal-500',
            glowColor: 'rgba(16,185,129,0.3)',
            stat: `${stats.sprintsPlanned} planned`,
        },
        {
            title: 'Feature Prioritizer',
            description: 'Analyze and rank features using RICE scoring and MoSCoW frameworks.',
            icon: <BarChart3 className="w-7 h-7" />,
            link: '/prd-generator',
            gradient: 'from-orange-500 to-amber-500',
            glowColor: 'rgba(249,115,22,0.3)',
            stat: 'AI-powered',
        },
    ];

    return (
        <>
            <div className="flex-1 flex flex-col h-screen overflow-hidden relative">
                {/* Massive Background Branding Text - RED THEME */}
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none overflow-hidden z-0 select-none">
                    <div className="text-[20vw] font-black text-red-500/[0.03] whitespace-nowrap leading-none tracking-tighter transform -rotate-12 select-none animate-pulse-slow">
                        3.0LABS
                    </div>
                </div>

                {/* Ambient orbs - RED THEME */}
                <div className="absolute top-0 right-0 -mr-20 -mt-20 w-48 h-48 sm:w-72 sm:h-72 md:w-96 md:h-96 bg-red-600/20 rounded-full blur-[120px] animate-float pointer-events-none"></div>
                <div className="absolute bottom-0 left-0 -ml-20 -mb-20 w-40 h-40 sm:w-60 sm:h-60 md:w-80 md:h-80 bg-red-900/20 rounded-full blur-[100px] animate-float-slow pointer-events-none"></div>
                <div className="absolute top-1/3 right-1/4 w-32 h-32 sm:w-48 sm:h-48 md:w-60 md:h-60 bg-red-500/10 rounded-full blur-[80px] animate-orb-pulse pointer-events-none"></div>
                <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-red-500/50 to-transparent animate-shimmer z-20"></div>

                <header className={`flex flex-col sm:flex-row items-start sm:items-center justify-between px-3 sm:px-4 md:px-6 lg:px-10 py-4 sm:py-6 gap-3 sm:gap-0 backdrop-blur-xl border-b z-30 flex-shrink-0 ${theme === 'dark' ? 'bg-[#0B0C10]/80 border-red-500/10' : 'bg-white/80 border-slate-200'}`}>
                    <div>
                        <h1 className={`text-lg sm:text-xl md:text-2xl font-bold tracking-tight flex items-center gap-2 sm:gap-3 ${theme === 'dark' ? 'text-white' : 'text-slate-900'}`}>
                            <Sparkles className="w-5 h-5 sm:w-7 sm:h-7 text-red-500 animate-pulse" />
                            PM AI Agent
                        </h1>
                        <p className="text-gray-400 text-xs sm:text-sm mt-1 flex items-center gap-2">
                            <span className="hidden sm:inline">AI-powered tools to supercharge your product management workflow</span>
                            <span className="sm:hidden">AI-powered PM tools</span>
                            <button
                                onClick={handleSync}
                                disabled={isSyncing}
                                className={`p-1.5 sm:p-2 rounded-xl border transition-all ${isSyncing ? 'bg-red-500/20 border-red-500/50 text-red-500 cursor-not-allowed' : 'bg-white/5 border-white/10 text-gray-400 hover:text-red-400 hover:bg-red-500/10'}`}
                                title="Refresh Stats"
                            >
                                <RotateCw className={`w-4 h-4 sm:w-5 sm:h-5 ${isSyncing ? 'animate-spin' : ''}`} />
                            </button>
                        </p>
                    </div>
                    <button
                        onClick={handleDownloadReport}
                        disabled={isDownloading}
                        className="flex items-center gap-2 px-3 py-2 sm:px-4 sm:py-2.5 md:px-6 md:py-3 text-sm sm:text-base bg-red-600 hover:bg-red-500 text-white font-bold rounded-xl transition-all shadow-[0_0_20px_rgba(239,68,68,0.3)] hover:shadow-[0_0_30px_rgba(239,68,68,0.5)] active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {isDownloading ? (
                            <Loader2 className="w-4 h-4 sm:w-5 sm:h-5 animate-spin" />
                        ) : (
                            <Download className="w-4 h-4 sm:w-5 sm:h-5" />
                        )}
                        {isDownloading ? 'Generating...' : <><span className="hidden sm:inline">Download Full Report</span><span className="sm:hidden">Report</span></>}
                    </button>
                </header>

                <div className="flex-1 overflow-y-auto px-3 sm:px-4 md:px-6 lg:px-8 py-4 sm:py-6 md:py-8 z-10">
                    {/* Stats Row */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 sm:gap-4 mb-6 sm:mb-10">
                        {[
                            { label: 'PRDs Created', value: stats.prdsCreated, icon: <FileText className="w-5 h-5" />, color: 'text-blue-400' },
                            { label: 'Stories Generated', value: stats.storiesGenerated, icon: <Users className="w-5 h-5" />, color: 'text-purple-400' },
                            { label: 'Sprints Planned', value: stats.sprintsPlanned, icon: <Calendar className="w-5 h-5" />, color: 'text-emerald-400' },
                        ].map((stat, i) => (
                            <div key={i} className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-4 sm:p-5 flex items-center gap-3 sm:gap-4 hover:bg-white/[0.07] transition-colors animate-fade-in-up" style={{ animationDelay: `${i * 0.1}s` }}>
                                <div className={`w-12 h-12 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center ${stat.color}`}>
                                    {stat.icon}
                                </div>
                                <div>
                                    {loading ? (
                                        <div className="h-8 w-12 bg-white/10 animate-pulse rounded-lg mb-1"></div>
                                    ) : (
                                        <div className="text-2xl font-bold text-white">{stat.value}</div>
                                    )}
                                    <div className="text-sm text-gray-400">{stat.label}</div>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* PM Tools Grid */}
                    <h2 className="text-base sm:text-lg font-semibold text-white mb-4 sm:mb-6 tracking-tight">AI-Powered PM Tools</h2>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-2 gap-4 sm:gap-5 md:gap-6">
                        {pmTools.map((tool, i) => (
                            <Link
                                key={i}
                                to={tool.link}
                                className="group relative bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-4 sm:p-5 md:p-6 hover:bg-white/[0.07] transition-all duration-300 hover:border-white/20 animate-fade-in-up overflow-hidden"
                                style={{ animationDelay: `${(i + 3) * 0.1}s` }}
                            >
                                {/* Glow effect on hover */}
                                <div
                                    className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 rounded-2xl pointer-events-none"
                                    style={{ boxShadow: `inset 0 0 60px ${tool.glowColor}` }}
                                />

                                <div className="relative z-10">
                                    <div className="flex items-start justify-between mb-4">
                                        <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${tool.gradient} flex items-center justify-center text-white shadow-lg group-hover:scale-110 transition-transform duration-300`}>
                                            {tool.icon}
                                        </div>
                                        <span className="text-xs text-gray-500 bg-white/5 px-3 py-1 rounded-full border border-white/5">{tool.stat}</span>
                                    </div>

                                    <h3 className="text-xl font-bold text-white mb-2 group-hover:text-red-400 transition-colors">{tool.title}</h3>
                                    <p className="text-gray-400 text-sm leading-relaxed mb-4">{tool.description}</p>

                                    <div className="flex items-center text-red-500 text-sm font-medium group-hover:text-red-400 transition-colors">
                                        Get started <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
                                    </div>
                                </div>
                            </Link>
                        ))}
                    </div>

                    {/* Quick tip - RED */}
                    <div className="mt-6 sm:mt-10 p-4 sm:p-5 md:p-6 bg-red-500/5 border border-red-500/20 rounded-2xl flex items-start gap-3 sm:gap-4 animate-fade-in-up" style={{ animationDelay: '0.7s' }}>
                        <Sparkles className="w-6 h-6 text-red-500 flex-shrink-0 mt-0.5" />
                        <div>
                            <div className="font-semibold text-white mb-1">Pro Tip</div>
                            <p className="text-gray-400 text-sm leading-relaxed">
                                Start by generating a PRD for your product idea, then use User Stories to break it down into actionable tasks, and finally plan your sprint with the Sprint Planner. The AI connects insights across all tools!
                            </p>
                        </div>
                    </div>
                </div>
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
        </>
    );
}
