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

    const handleEnter = () => {
        const body = document.querySelector('body');
        if (body) body.style.transition = 'filter 1s ease-in-out';
        setShowContent(false);
        setTimeout(() => {
            if (onComplete) {
                onComplete();
            } else {
                navigate('/auth');
            }
        }, 800);
    };

    return (
        <div className="fixed inset-0 bg-[#050505] text-white flex flex-col items-center justify-center overflow-hidden z-[1000]">
            <canvas ref={canvasRef} className="absolute inset-0 z-0 pointer-events-none opacity-40" />
            
            {/* Ambient Background Glows */}
            <div className="absolute top-1/4 left-1/4 w-[500px] h-[500px] bg-red-600/5 rounded-full blur-[120px] animate-float pointer-events-none" />
            <div className="absolute bottom-1/4 right-1/4 w-[500px] h-[500px] bg-red-900/5 rounded-full blur-[120px] animate-float-slow pointer-events-none" />

            <div className="relative z-10 w-full max-w-4xl px-8 flex flex-col items-center">
                {!showContent ? (
                    <div className="font-mono text-sm text-red-500/70 h-64 overflow-hidden flex flex-col justify-end gap-1">
                        {bootLines.slice(0, bootStage).map((line, i) => (
                            <div key={i} className="animate-fade-in-left flex items-center gap-2">
                                <span className="opacity-50">[{new Date().toLocaleTimeString('en-US', { hour12: false })}]</span>
                                <span className={i === bootLines.length - 1 ? "text-red-400 font-bold" : ""}>
                                    {line}
                                </span>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="flex flex-col items-center animate-reveal w-full">
                        {/* High-Class Reveal Section */}
                        <div className="relative mb-12 group scale-75 md:scale-100">
                            <div className="absolute inset-0 bg-red-600 blur-[60px] opacity-20 group-hover:opacity-40 transition-opacity duration-1000 animate-pulse" />
                            <div className="relative font-black text-7xl md:text-9xl tracking-tighter animate-reveal">
                                <span className="bg-clip-text text-transparent bg-gradient-to-r from-white via-red-200 to-white/70">3.0</span>
                                <span className="bg-clip-text text-transparent bg-gradient-to-r from-red-500 via-red-800 to-red-500 animate-gradient">Labs</span>
                            </div>
                            <div className="absolute -inset-8 border border-red-500/10 rounded-3xl animate-border-glow pointer-events-none" />
                        </div>

                        <h1 className="text-4xl md:text-6xl font-black tracking-tighter text-center mb-6">
                            <span className="bg-clip-text text-transparent bg-gradient-to-r from-white via-red-200 to-white/70">INTELLIGENCE</span>
                            <br />
                            <span className="bg-clip-text text-transparent bg-gradient-to-r from-red-500 via-red-800 to-red-500 animate-gradient">REDEFINED</span>
                        </h1>

                        <p className="text-gray-400 text-lg md:text-xl text-center max-w-2xl mb-12 leading-relaxed opacity-0 animate-fade-in stagger-3" style={{ animationDelay: '0.8s' }}>
                            Experience the future of meeting intelligence. Automate, extract, and plan with the next generation of PM AI agents.
                        </p>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-16 w-full max-w-3xl opacity-0 animate-fade-in-up stagger-5" style={{ animationDelay: '1.2s' }}>
                            {[
                                { icon: <Sparkles />, label: "AI Summarization" },
                                { icon: <Cpu />, label: "PM Automation" },
                                { icon: <Shield />, label: "Secure Analysis" }
                            ].map((item, i) => (
                                <div key={i} className="flex items-center justify-center gap-3 py-4 px-6 bg-white/5 border border-white/10 rounded-2xl hover:bg-white/10 transition-all group">
                                    <div className="text-red-500 group-hover:scale-110 transition-transform">{item.icon}</div>
                                    <span className="text-sm font-semibold text-gray-300">{item.label}</span>
                                </div>
                            ))}
                        </div>

                        <button 
                            onClick={handleEnter}
                            className="group relative px-12 py-5 bg-gradient-to-r from-red-600 to-red-800 rounded-2xl overflow-hidden shadow-[0_0_40px_rgba(239,68,68,0.3)] hover:shadow-[0_0_60px_rgba(239,68,68,0.5)] transition-all duration-500 active:scale-95"
                        >
                            <div className="absolute inset-0 bg-white/10 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000 ease-in-out" />
                            <span className="relative z-10 flex items-center gap-3 text-xl font-black tracking-widest uppercase">
                                Launch Experience <Zap className="w-6 h-6 animate-pulse" />
                            </span>
                        </button>
                        
                        <div className="mt-12 flex items-center gap-6 text-red-500/40 text-xs font-mono uppercase tracking-[0.2em] opacity-0 animate-fade-in" style={{ animationDelay: '1.8s' }}>
                            <span>v1.0.4-STABLE</span>
                            <span>&middot;</span>
                            <span>ENCRYPTED SECURE LINK</span>
                        </div>
                    </div>
                )}
            </div>

            {/* Background Grid Accent */}
            <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff05_1px,transparent_1px),linear-gradient(to_bottom,#ffffff05_1px,transparent_1px)] bg-[size:40px_40px] pointer-events-none" />
        </div>
    );
}
