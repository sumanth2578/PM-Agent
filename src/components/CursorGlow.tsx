import { useEffect, useRef, useState } from 'react';

interface Splash {
    id: number;
    x: number;
    y: number;
}

export function CursorGlow() {
    const glowRef = useRef<HTMLDivElement>(null);
    const trailRef = useRef<HTMLDivElement>(null);
    const pos = useRef({ x: 0, y: 0 });
    const target = useRef({ x: 0, y: 0 });
    const [splashes, setSplashes] = useState<Splash[]>([]);

    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            target.current = { x: e.clientX, y: e.clientY };
        };

        const handleClick = (e: MouseEvent) => {
            const newSplash = {
                id: Date.now(),
                x: e.clientX,
                y: e.clientY
            };
            setSplashes(prev => [...prev.slice(-5), newSplash]); // Keep last 5 splashes
            
            // Auto remove splash after animation
            setTimeout(() => {
                setSplashes(prev => prev.filter(s => s.id !== newSplash.id));
            }, 600);
        };

        let raf: number;
        const animate = () => {
            pos.current.x += (target.current.x - pos.current.x) * 0.15;
            pos.current.y += (target.current.y - pos.current.y) * 0.15;

            if (glowRef.current) {
                glowRef.current.style.transform = `translate(${target.current.x - 20}px, ${target.current.y - 20}px)`;
            }
            if (trailRef.current) {
                trailRef.current.style.transform = `translate(${pos.current.x - 150}px, ${pos.current.y - 150}px)`;
            }
            raf = requestAnimationFrame(animate);
        };

        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mousedown', handleClick);
        raf = requestAnimationFrame(animate);

        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mousedown', handleClick);
            cancelAnimationFrame(raf);
        };
    }, []);

    return (
        <>
            {/* Click Splashes */}
            {splashes.map(splash => (
                <div
                    key={splash.id}
                    className="cursor-splash"
                    style={{
                        left: splash.x,
                        top: splash.y,
                        width: '80px',
                        height: '80px',
                        marginLeft: '-40px',
                        marginTop: '-40px'
                    }}
                />
            ))}
            
            {/* Main cursor dot - RED THEME */}
            <div
                ref={glowRef}
                className="fixed top-0 left-0 w-10 h-10 pointer-events-none z-[9999] mix-blend-screen"
                style={{ willChange: 'transform' }}
            >
                <div className="w-full h-full rounded-full bg-red-500/60 blur-[2px] animate-breathe shadow-[0_0_15px_rgba(239,68,68,0.5)]" />
            </div>
            
            {/* Large trailing glow - RED THEME */}
            <div
                ref={trailRef}
                className="fixed top-0 left-0 w-[300px] h-[300px] pointer-events-none z-[9998]"
                style={{ willChange: 'transform' }}
            >
                <div className="w-full h-full rounded-full bg-red-600/5 blur-[80px] transition-opacity duration-300" />
            </div>
        </>
    );
}
