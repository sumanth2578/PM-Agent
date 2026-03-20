import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sparkles, Cpu, Shield, Zap } from 'lucide-react';

export default function IntroPage({ onComplete }: { onComplete?: () => void }) {
    const navigate = useNavigate();
    const [bootStage, setBootStage] = useState(0);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [showContent, setShowContent] = useState(false);

    const bootLines = [
        "Initializing 3.0 Intelligence Core...",
        "Establishing Neural Link...",
        "Decrypting Meeting Data streams...",
        "Synchronizing with Google Calendar API...",
        "Accessing Knowledge Base alpha-7...",
        "3.0Labs OS 1.0.4 Loaded successfully.",
        "System Ready."
    ];

    useEffect(() => {
        // Boot sequence timing
        let timer: any;
        if (bootStage < bootLines.length) {
            timer = setTimeout(() => {
                setBootStage(prev => prev + 1);
            }, 300 + Math.random() * 400);
        } else {
            setTimeout(() => setShowContent(true), 500);
        }
        return () => clearTimeout(timer);
    }, [bootStage]);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        let animationFrameId: number;
        let particles: any[] = [];
        const particleCount = 60;

        const resize = () => {
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
        };

        const Particle = class {
            x: number; y: number; vx: number; vy: number; size: number;
            constructor() {
                this.x = Math.random() * (canvas?.width || window.innerWidth);
                this.y = Math.random() * (canvas?.height || window.innerHeight);
                this.vx = (Math.random() - 0.5) * 0.5;
                this.vy = (Math.random() - 0.5) * 0.5;
                this.size = Math.random() * 2;
            }
            update() {
                this.x += this.vx;
                this.y += this.vy;
                if (this.x < 0 || (canvas && this.x > canvas.width)) this.vx *= -1;
                if (this.y < 0 || (canvas && this.y > canvas.height)) this.vy *= -1;
            }
            draw() {
                if (!ctx) return;
                ctx.beginPath();
                ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
                ctx.fillStyle = 'rgba(239, 68, 68, 0.4)';
                ctx.fill();
            }
        };

        const init = () => {
            resize();
            particles = [];
            for (let i = 0; i < particleCount; i++) particles.push(new Particle());
        };

        const animate = () => {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            
            // Draw connections
            particles.forEach((p1, i) => {
                p1.update();
                p1.draw();
                for (let j = i + 1; j < particles.length; j++) {
                    const p2 = particles[j];
                    const dx = p1.x - p2.x;
                    const dy = p1.y - p2.y;
                    const dist = Math.sqrt(dx * dx + dy * dy);
                    if (dist < 150) {
                        ctx.beginPath();
                        ctx.strokeStyle = `rgba(239, 68, 68, ${0.1 * (1 - dist / 150)})`;
                        ctx.lineWidth = 0.5;
                        ctx.moveTo(p1.x, p1.y);
                        ctx.lineTo(p2.x, p2.y);
                        ctx.stroke();
                    }
                }
            });
            animationFrameId = requestAnimationFrame(animate);
        };

        init();
        animate();
        window.addEventListener('resize', init);
        return () => {
            cancelAnimationFrame(animationFrameId);
            window.removeEventListener('resize', init);
        };
    }, []);

    const handleEnter = async () => {
        // Request microphone permission preemptively
        try {
            if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
                await navigator.mediaDevices.getUserMedia({ audio: true });
            }
        } catch (err) {
            console.warn("Preemptive microphone permission request failed or denied:", err);
        }

        const body = document.querySelector('body');
        if (body) {
            body.style.transition = 'all 1.2s cubic-bezier(0.16, 1, 0.3, 1)';
            body.style.filter = 'blur(100px) brightness(0)';
            body.style.transform = 'scale(1.1)';
        }
        setShowContent(false);
        setTimeout(() => {
            if (onComplete) {
                onComplete();
            } else {
                navigate('/auth');
            }
            // Reset body styles after navigation begins
            setTimeout(() => {
                if (body) {
                    body.style.filter = '';
                    body.style.transform = '';
                }
            }, 100);
        }, 1000);
    };

    return (
        <div className="fixed inset-0 bg-[#020202] text-white flex flex-col items-center justify-center overflow-hidden z-[1000]">
            <canvas ref={canvasRef} className="absolute inset-0 z-0 pointer-events-none opacity-60" />
            
            {/* Massive Ambient Background Glows */}
            <div className="absolute top-0 left-0 w-[800px] h-[800px] bg-red-600/10 rounded-full blur-[160px] animate-float opacity-30 pointer-events-none" />
            <div className="absolute bottom-0 right-0 w-[800px] h-[800px] bg-red-900/10 rounded-full blur-[160px] animate-float-slow opacity-30 pointer-events-none" />
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[1000px] h-[600px] bg-red-500/5 rounded-full blur-[200px] pointer-events-none" />

            <div className="relative z-10 w-full max-w-5xl px-8 flex flex-col items-center">
                {!showContent ? (
                    <div className="font-mono text-xs md:text-sm text-red-500/60 h-80 overflow-hidden flex flex-col justify-end gap-1.5 p-6 bg-red-500/[0.02] border border-red-500/10 rounded-3xl backdrop-blur-3xl transition-all duration-1000">
                        {bootLines.slice(0, bootStage).map((line, i) => (
                            <div key={i} className="animate-fade-in-left flex items-center gap-3">
                                <span className="opacity-30 tabular-nums">[{new Date().toLocaleTimeString('en-US', { hour12: false, fractionalSecondDigits: 2 } as any)}]</span>
                                <span className="w-2 h-2 bg-red-500/20 rounded-full" />
                                <span className={i === bootLines.length - 1 ? "text-red-400 font-bold tracking-widest" : "tracking-tight"}>
                                    {line}
                                </span>
                            </div>
                        ))}
                        <div className="mt-4 flex gap-1">
                            {Array.from({ length: bootLines.length }).map((_, i) => (
                                <div key={i} className={`h-1 flex-1 rounded-full transition-all duration-500 ${i < bootStage ? 'bg-red-500' : 'bg-red-500/10'}`} />
                            ))}
                        </div>
                    </div>
                ) : (
                    <div className="flex flex-col items-center w-full animate-full-reveal">
                        {/* High-Class Reveal Section */}
                        <div className="relative mb-4 group scale-90 md:scale-100 transition-transform duration-1000">
                            <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-0.5 bg-gradient-to-r from-transparent via-red-500/50 to-transparent blur-lg animate-width-grow" />
                            <div className="absolute inset-0 bg-red-600 blur-[80px] opacity-20 group-hover:opacity-50 transition-all duration-1000 animate-pulse" />
                            <div className="relative font-black text-5xl md:text-7xl tracking-tight leading-none">
                                <span className="bg-clip-text text-transparent bg-gradient-to-b from-white via-white/80 to-white/20 drop-shadow-[0_0_20px_rgba(255,255,255,0.1)]">3.0</span>
                                <span className="bg-clip-text text-transparent bg-gradient-to-b from-red-400 via-red-600 to-red-900 animate-gradient-y drop-shadow-[0_0_20px_rgba(239,68,68,0.2)] ml-2">Labs</span>
                            </div>
                        </div>

                        <div className="h-px w-16 bg-gradient-to-r from-transparent via-red-500/40 to-transparent mb-6 animate-width-grow" />

                        <h1 className="text-3xl md:text-5xl font-black tracking-tighter text-center mb-4 leading-tight perspective-1000">
                            <span className="inline-block animate-reveal-rotate opacity-0 fill-mode-forwards text-white/90">INTELLIGENCE</span>
                            <br />
                            <span className="inline-block animate-reveal-rotate-delayed opacity-0 fill-mode-forwards bg-clip-text text-transparent bg-gradient-to-r from-red-500 via-white to-red-800 tracking-wider">REDEFINED</span>
                        </h1>

                        <p className="text-gray-400 text-sm md:text-base text-center max-w-lg mb-8 leading-relaxed opacity-0 animate-fade-in-up" style={{ animationDelay: '1s' }}>
                            Precision architecture meeting next-generation neural logic. <span className="text-red-500/80">Command the future</span> of productivity with 3.0Labs PM suite.
                        </p>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-10 w-full max-w-2xl opacity-0 animate-fade-in-up" style={{ animationDelay: '1.4s' }}>
                            {[
                                { icon: <Sparkles className="w-5 h-5" />, label: "NEURAL SUMMARIES", desc: "Instant intelligence" },
                                { icon: <Cpu className="w-5 h-5" />, label: "CORE PM FLOW", desc: "Automated logic" },
                                { icon: <Shield className="w-5 h-5" />, label: "SECURE LAYER", desc: "Data protection" }
                            ].map((item, i) => (
                                <div key={i} className="relative group p-3 bg-white/[0.02] border border-white/5 rounded-2xl hover:bg-white/[0.05] hover:border-red-500/30 transition-all duration-500 backdrop-blur-xl overflow-hidden">
                                    <div className="absolute top-0 right-0 w-16 h-16 bg-red-600/5 rounded-full blur-xl group-hover:bg-red-600/10 transition-colors" />
                                    <div className="text-red-500 mb-2 transform group-hover:scale-110 transition-all duration-500">{item.icon}</div>
                                    <h3 className="text-[10px] font-black tracking-[0.2em] text-white/90 mb-0.5">{item.label}</h3>
                                    <p className="text-[9px] text-gray-500 font-medium tracking-tight whitespace-nowrap">{item.desc}</p>
                                </div>
                            ))}
                        </div>

                        <button 
                            onClick={handleEnter}
                            className="group relative px-12 py-4 bg-white text-black font-black tracking-[0.2em] uppercase rounded-full overflow-hidden transition-all duration-700 hover:scale-105 active:scale-95 shadow-[0_0_30px_rgba(255,255,255,0.1)] hover:shadow-[0_0_50px_rgba(239,68,68,0.4)]"
                        >
                            <div className="absolute inset-0 bg-gradient-to-r from-red-600 to-red-900 translate-x-[-100%] group-hover:translate-x-0 transition-transform duration-700 ease-in-out" />
                            <span className="relative z-10 flex items-center gap-3 text-sm group-hover:text-white transition-colors duration-500">
                                Launch Experience <Zap className="w-5 h-5 fill-current" />
                            </span>
                        </button>
                        
                        <div className="mt-10 flex items-center gap-6 text-[9px] font-black tracking-[0.4em] uppercase opacity-0 animate-fade-in-up" style={{ animationDelay: '2s' }}>
                            <span className="text-red-500 animate-pulse">SYSTEM STABLE</span>
                            <div className="w-1 h-1 bg-white/20 rounded-full" />
                            <span className="text-white/30">v1.1.0_CORE</span>
                        </div>
                    </div>
                )}
            </div>

            {/* Background Perspective Grid */}
            <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff03_1px,transparent_1px),linear-gradient(to_bottom,#ffffff03_1px,transparent_1px)] bg-[size:60px_60px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_50%,#000_70%,transparent_100%)] pointer-events-none opacity-50" />
            
            {/* Edge Vignetts */}
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,#020202_90%)] pointer-events-none" />
        </div>
    );
}
