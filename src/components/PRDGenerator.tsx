import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileText, Sparkles, Copy, Download, Trash2, Clock, Upload, Edit3, Save, MessageSquare } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { generatePRD, generateUserStories } from '../lib/gemini';
import { useTheme } from '../context/ThemeContext';
import html2pdf from 'html2pdf.js';
import * as pdfjsLib from 'pdfjs-dist';

// Set up the worker for PDF.js - Use a more reliable CDN link that matches the package version
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

interface SavedPRD {
    id: string;
    title: string;
    content: string;
    created_at: string;
    isEditing?: boolean;
}

export function PRDGenerator() {
    const [productIdea, setProductIdea] = useState('');
    const [generatedPRD, setGeneratedPRD] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [savedPRDs, setSavedPRDs] = useState<SavedPRD[]>([]);
    const [copied, setCopied] = useState(false);
    const [selectedPRD, setSelectedPRD] = useState<SavedPRD | null>(null);
    const [isEditing, setIsEditing] = useState(false);
    const [editContent, setEditContent] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
    const [uploadedFileContent, setUploadedFileContent] = useState<string | null>(null);
    const [generatedStories, setGeneratedStories] = useState<string | null>(null);
    const [generatingStories, setGeneratingStories] = useState(false);
    const navigate = useNavigate();
    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        const fetchUserAndPRDs = async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (user) {
                const { data, error } = await supabase
                    .from('prds')
                    .select('*')
                    .eq('user_id', user.id)
                    .order('created_at', { ascending: false });

                if (data && !error) {
                    setSavedPRDs(data);
                }
            } else {
                navigate('/auth');
            }
        };
        fetchUserAndPRDs();
    }, [navigate]);

    const handleGenerate = async () => {
        if (!productIdea.trim() && !uploadedFileContent) return;
        setLoading(true);
        setError(null);
        setGeneratedPRD('');
        setGeneratedStories(null);
        setSelectedPRD(null);
        setIsEditing(false);
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) throw new Error('You must be logged in to generate PRDs');

            const fullContext = uploadedFileContent 
                ? `${productIdea || 'Analysis of uploaded document'}\n\n[Context from uploaded file "${uploadedFileName}"]: \n${uploadedFileContent}` 
                : productIdea;

            const result = await generatePRD(fullContext);
            setGeneratedPRD(result);

            const { data, error } = await supabase
                .from('prds')
                .insert([{
                    user_id: user.id,
                    title: productIdea.trim() || `Analysis: ${uploadedFileName || 'Uploaded File'}`,
                    content: result
                }])
                .select()
                .single();

            if (error) throw error;
            if (data) {
                setSavedPRDs([data, ...savedPRDs]);
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to generate PRD');
        } finally {
            setLoading(false);
        }
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setUploadedFileName(file.name);
        setLoading(true);
        setError(null);

        try {
            if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) {
                const reader = new FileReader();
                reader.onload = async (event) => {
                    const typedarray = new Uint8Array(event.target?.result as ArrayBuffer);
                    try {
                        const loadingTask = pdfjsLib.getDocument({
                            data: typedarray,
                            useWorkerFetch: true,
                            isEvalSupported: false,
                        });
                        
                        const pdf = await loadingTask.promise;
                        let fullText = '';
                        for (let i = 1; i <= pdf.numPages; i++) {
                            const page = await pdf.getPage(i);
                            const textContent = await page.getTextContent();
                            const pageText = textContent.items.map((item: any) => item.str).join(' ');
                            fullText += pageText + '\n';
                        }
                        
                        if (fullText.trim().length === 0) {
                            setError('This PDF seems to contain only images or has no extractable text.');
                        } else {
                            setUploadedFileContent(fullText);
                        }
                        setLoading(false);
                    } catch (err) {
                        setError(`Failed to parse PDF: ${err instanceof Error ? err.message : 'Unknown error'}`);
                        setLoading(false);
                    }
                };
                reader.readAsArrayBuffer(file);
            } else {
                const reader = new FileReader();
                reader.onload = (event) => {
                    const content = event.target?.result as string;
                    if (content) {
                        setUploadedFileContent(content);
                        setLoading(false);
                    }
                };
                reader.readAsText(file);
            }
        } catch (err) {
            setError('Error uploading file');
            setLoading(false);
        }
    };

    const handleSaveUpdate = async () => {
        if (!selectedPRD && !generatedPRD) return;
        setIsSaving(true);
        setError(null);
        try {
            const contentToSave = editContent;
            const id = selectedPRD?.id;
            if (id) {
                const { error } = await supabase.from('prds').update({ content: contentToSave }).eq('id', id);
                if (error) throw error;
                setSavedPRDs(prev => prev.map(p => p.id === id ? { ...p, content: contentToSave } : p));
                setSelectedPRD(prev => prev ? { ...prev, content: contentToSave } : null);
            }
            setIsEditing(false);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to save PRD');
        } finally {
            setIsSaving(false);
        }
    };

    const handleGenerateStories = async () => {
        const content = selectedPRD?.content || generatedPRD;
        if (!content) return;
        setGeneratingStories(true);
        setError(null);
        try {
            const stories = await generateUserStories(content);
            setGeneratedStories(stories);
            setTimeout(() => {
                document.getElementById('generated-stories-section')?.scrollIntoView({ behavior: 'smooth' });
            }, 100);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to generate user stories');
        } finally {
            setGeneratingStories(false);
        }
    };

    const handleCopy = async () => {
        const content = selectedPRD?.content || generatedPRD;
        await navigator.clipboard.writeText(content);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const handleDownload = () => {
        const content = selectedPRD?.content || generatedPRD;
        const idea = selectedPRD?.title || productIdea;
        const element = document.createElement('div');
        element.innerHTML = `<div style="padding: 40px; font-family: sans-serif; color: #333; line-height: 1.6;"><h1 style="color: #ef4444; border-bottom: 2px solid #ef4444; padding-bottom: 10px;">PRD: ${idea}</h1><p style="color: #666; font-size: 12px;">Generated by 3.0 Labs PM Agent on ${new Date().toLocaleDateString()}</p><div style="margin-top: 20px; white-space: pre-wrap;">${content}</div></div>`;
        const opt = { margin: 10, filename: `PRD-${idea.substring(0, 30).replace(/[^a-zA-Z0-9]/g, '_')}.pdf`, image: { type: 'jpeg' as 'jpeg', quality: 0.98 }, html2canvas: { scale: 2 }, jsPDF: { unit: 'mm' as 'mm', format: 'a4' as 'a4', orientation: 'portrait' as 'portrait' } };
        html2pdf().set(opt).from(element).save();
    };

    const handleDelete = async (id: string) => {
        try {
            const { error } = await supabase.from('prds').delete().eq('id', id);
            if (error) throw error;
            setSavedPRDs(savedPRDs.filter(p => p.id !== id));
            if (selectedPRD?.id === id) {
                setSelectedPRD(null);
                setGeneratedPRD('');
            }
        } catch (err) {
            setError('Failed to delete PRD');
        }
    };

    const displayContent = selectedPRD?.content || generatedPRD;

    return (
        <>
            <div className="flex-1 flex flex-col h-screen overflow-hidden relative transition-colors duration-300 px-0 sm:px-0">
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none overflow-hidden z-0 select-none">
                    <div className="text-[20vw] font-black text-red-500/[0.03] whitespace-nowrap leading-none tracking-tighter transform -rotate-12 select-none animate-pulse-slow">
                        3.0LABS
                    </div>
                </div>

                <div className="absolute top-0 right-0 -mr-20 -mt-20 w-96 h-96 bg-red-600/20 rounded-full blur-[120px] animate-float pointer-events-none"></div>
                <div className="absolute bottom-0 left-0 -ml-20 -mb-20 w-80 h-80 bg-red-900/20 rounded-full blur-[100px] animate-float-slow pointer-events-none"></div>
                <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-red-500/50 to-transparent animate-shimmer z-20"></div>

                <header className="flex flex-col sm:flex-row items-start sm:items-center justify-between px-4 md:px-10 py-4 sm:py-6 bg-[#0B0C10]/80 backdrop-blur-xl border-b border-red-500/10 z-30 flex-shrink-0 gap-2">
                    <div>
                        <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight flex items-center gap-3">
                            <FileText className="w-6 h-6 sm:w-7 sm:h-7 text-red-500 animate-pulse" />
                            PRD Generator
                        </h1>
                        <p className="text-gray-400 text-xs sm:text-sm mt-1">Generate comprehensive Product Requirements Documents with AI</p>
                    </div>
                </header>

                <div className="flex-1 flex flex-col xl:flex-row overflow-hidden">
                    <div className="flex-1 overflow-y-auto px-4 md:px-10 py-8 z-10 custom-scrollbar">
                        <div className="mb-8 p-4 sm:p-6 bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl shadow-xl animate-fade-in-up">
                            <label className="block font-semibold text-white text-lg mb-3 tracking-tight">Describe your product or feature idea</label>
                            <textarea
                                value={productIdea}
                                onChange={e => setProductIdea(e.target.value)}
                                placeholder="e.g. An AI-powered meeting summarizer that automatically generates action items and sends them to Slack..."
                                className="w-full h-32 px-4 py-3 bg-black/40 border border-white/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-500/50 focus:border-red-500 transition-all text-white placeholder-gray-600 resize-none"
                            />
                            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mt-4 gap-3">
                                <div className="flex flex-wrap items-center gap-2">
                                    <input type="file" ref={fileInputRef} onChange={handleFileUpload} className="hidden" accept=".txt,.md,.pdf" />
                                    <button onClick={() => fileInputRef.current?.click()} className="p-2.5 bg-white/5 border border-white/10 text-gray-400 hover:text-white hover:bg-white/10 rounded-xl transition-all flex items-center gap-2 text-sm">
                                        <Upload className="w-4 h-4" />
                                        <span>{uploadedFileName ? 'Change File' : 'Upload File'}</span>
                                    </button>
                                    {uploadedFileName && (
                                        <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-500/10 border border-emerald-500/20 rounded-lg animate-fade-in">
                                            <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                                            <span className="text-xs text-emerald-400 font-medium">{uploadedFileName} uploaded</span>
                                            <button onClick={() => { setUploadedFileName(null); setUploadedFileContent(null); }} className="text-gray-500 hover:text-red-400 ml-1">&times;</button>
                                        </div>
                                    )}
                                </div>
                                <button
                                    onClick={handleGenerate}
                                    disabled={loading || (!productIdea.trim() && !uploadedFileContent)}
                                    className="w-full sm:w-auto px-8 py-3 bg-gradient-to-r from-red-600 to-red-800 text-white font-semibold rounded-xl shadow-[0_0_20px_rgba(239,68,68,0.3)] hover:shadow-[0_0_30px_rgba(239,68,68,0.5)] hover:from-red-500 hover:to-red-700 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                                >
                                    {loading ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Sparkles className="w-5 h-5" />}
                                    {loading ? 'Generating...' : 'Generate PRD'}
                                </button>
                            </div>
                        </div>

                        {error && (
                            <div className="mb-6 p-4 bg-red-500/10 border border-red-500/30 text-red-400 rounded-xl flex items-center justify-between uppercase text-xs font-bold tracking-widest">
                                <span>{error}</span>
                                <button onClick={() => setError(null)} className="text-red-400 hover:text-white">&times;</button>
                            </div>
                        )}

                        {displayContent && !loading && (
                            <div className="mb-8 p-4 sm:p-6 bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl shadow-xl animate-fade-in-up">
                                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-4 gap-2">
                                    <div className="font-semibold text-red-500 text-lg flex items-center">
                                        <div className="w-2 h-2 bg-red-600 rounded-full mr-3 animate-pulse"></div>
                                        {selectedPRD ? `PRD: ${selectedPRD.title.substring(0, 50)}...` : 'Generated PRD'}
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                        {isEditing ? (
                                            <button onClick={handleSaveUpdate} disabled={isSaving} className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-lg hover:bg-emerald-500/30 transition-all text-xs font-medium">
                                                {isSaving ? <div className="w-3 h-3 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                                                Save
                                            </button>
                                        ) : (
                                            <button onClick={() => { setIsEditing(true); setEditContent(displayContent); }} className="p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors"><Edit3 className="w-4 h-4" /></button>
                                        )}
                                        <button onClick={handleGenerateStories} disabled={generatingStories} className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500/10 text-red-500 border border-red-500/20 rounded-lg hover:bg-red-500/20 transition-all text-xs font-medium"><MessageSquare className="w-3.5 h-3.5" /> Stories</button>
                                        <button onClick={handleCopy} className="p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors"><Copy className="w-4 h-4" /></button>
                                        <button onClick={handleDownload} className="p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors"><Download className="w-4 h-4" /></button>
                                    </div>
                                </div>
                                {copied && <div className="mb-3 text-sm text-emerald-400">Γ£ô Copied to clipboard!</div>}
                                {isEditing ? (
                                    <textarea value={editContent} onChange={e => setEditContent(e.target.value)} className="w-full h-[500px] p-4 bg-black/40 border border-white/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-500/50 text-gray-300 text-sm font-mono resize-none custom-scrollbar" />
                                ) : (
                                    <div className="text-gray-300 leading-relaxed whitespace-pre-wrap text-sm prose-sm max-w-none">{displayContent}</div>
                                )}
                            </div>
                        )}

                        {generatedStories && (
                            <div id="generated-stories-section" className="mb-8 p-4 sm:p-6 bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl shadow-xl animate-fade-in-up">
                                <div className="flex items-center justify-between mb-4">
                                    <div className="font-semibold text-emerald-500 text-lg flex items-center">
                                        <div className="w-2 h-2 bg-emerald-600 rounded-full mr-3 animate-pulse"></div>
                                        Breakdown: User Stories
                                    </div>
                                    <button onClick={() => setGeneratedStories(null)} className="text-gray-500 hover:text-red-400">&times;</button>
                                </div>
                                <div className="text-gray-300 leading-relaxed whitespace-pre-wrap text-sm prose-sm max-w-none">{generatedStories}</div>
                            </div>
                        )}
                    </div>

                    <aside className="hidden xl:flex w-full xl:w-80 bg-[#0B0C10]/80 backdrop-blur-md border-t xl:border-t-0 xl:border-l border-white/5 px-4 sm:px-6 py-8 flex-col z-20 overflow-y-auto custom-scrollbar">
                        <h3 className="text-lg font-bold text-white tracking-tight mb-6 flex items-center gap-2"><Clock className="w-5 h-5 text-gray-400" /> History</h3>
                        <div className="space-y-3">
                            {savedPRDs.map(prd => (
                                <div key={prd.id} className={`p-4 rounded-xl border cursor-pointer transition-all group ${selectedPRD?.id === prd.id ? 'bg-red-500/10 border-red-500/30' : 'bg-white/5 border-white/10 hover:bg-white/[0.07]'}`} onClick={() => { setSelectedPRD(prd); setGeneratedPRD(''); }}>
                                    <div className="font-medium text-white text-sm truncate mb-1">{prd.title}</div>
                                    <div className="text-xs text-gray-500 flex items-center justify-between">
                                        <span>{new Date(prd.created_at).toLocaleDateString()}</span>
                                        <button onClick={e => { e.stopPropagation(); handleDelete(prd.id); }} className="p-1 text-gray-500 hover:text-red-400 opacity-0 group-hover:opacity-100"><Trash2 className="w-3.5 h-3.5" /></button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </aside>
                </div>
            </div>
            <style>{`
                .custom-scrollbar::-webkit-scrollbar { width: 4px; }
                .custom-scrollbar::-webkit-scrollbar-track { background: rgba(255, 255, 255, 0.02); }
                .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.1); border-radius: 10px; }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(255, 255, 255, 0.2); }
            `}</style>
        </>
    );
}
