import { useEffect, useRef } from 'react';

export function CursorGlow() {
    const glowRef = useRef<HTMLDivElement>(null);
    const trailRef = useRef<HTMLDivElement>(null);
    const pos = useRef({ x: 0, y: 0 });
    const target = useRef({ x: 0, y: 0 });

    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            target.current = { x: e.clientX, y: e.clientY };
        };

        let raf: number;
        const animate = () => {
            // Smooth lerp follow
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
        raf = requestAnimationFrame(animate);

        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            cancelAnimationFrame(raf);
        };
    }, []);

    return (
        <>
            {/* Main cursor dot */}
            <div
                ref={glowRef}
                className="fixed top-0 left-0 w-10 h-10 pointer-events-none z-[9999] mix-blend-screen"
                style={{ willChange: 'transform' }}
            >
                <div className="w-full h-full rounded-full bg-indigo-400/60 blur-[2px] animate-breathe" />
            </div>
            {/* Large trailing glow */}
            <div
                ref={trailRef}
                className="fixed top-0 left-0 w-[300px] h-[300px] pointer-events-none z-[9998]"
                style={{ willChange: 'transform' }}
            >
                <div className="w-full h-full rounded-full bg-indigo-500/8 blur-[80px] transition-opacity duration-300" />
            </div>
        </>
    );
}
