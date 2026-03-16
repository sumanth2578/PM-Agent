import { useEffect, useRef } from 'react';

interface Particle {
    x: number;
    y: number;
    vx: number;
    vy: number;
    life: number;
    maxLife: number;
    size: number;
    color: string;
}

export function SplashCursor() {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const particles = useRef<Particle[]>([]);
    const mouse = useRef({ x: 0, y: 0 });
    const target = useRef({ x: 0, y: 0 });

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const resize = () => {
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
        };

        const createParticle = (x: number, y: number) => {
            const count = 12;
            for (let i = 0; i < count; i++) {
                const angle = (Math.PI * 2 * i) / count;
                const speed = Math.random() * 4 + 2;
                particles.current.push({
                    x,
                    y,
                    vx: Math.cos(angle) * speed,
                    vy: Math.sin(angle) * speed,
                    life: 1,
                    maxLife: Math.random() * 0.5 + 0.5,
                    size: Math.random() * 3 + 2,
                    color: `rgba(239, 68, 68, ${Math.random() * 0.5 + 0.5})`
                });
            }
        };

        const handleMouseMove = (e: MouseEvent) => {
            target.current = { x: e.clientX, y: e.clientY };
        };

        const handleMouseDown = (e: MouseEvent) => {
            createParticle(e.clientX, e.clientY);
        };

        const animate = () => {
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            // Smooth mouse follow
            mouse.current.x += (target.current.x - mouse.current.x) * 0.2;
            mouse.current.y += (target.current.y - mouse.current.y) * 0.2;

            // Draw Glow Follower
            ctx.beginPath();
            const gradient = ctx.createRadialGradient(
                mouse.current.x, mouse.current.y, 0,
                mouse.current.x, mouse.current.y, 150
            );
            gradient.addColorStop(0, 'rgba(239, 68, 68, 0.08)');
            gradient.addColorStop(1, 'rgba(239, 68, 68, 0)');
            ctx.fillStyle = gradient;
            ctx.arc(mouse.current.x, mouse.current.y, 150, 0, Math.PI * 2);
            ctx.fill();

            // Handle Particles
            for (let i = particles.current.length - 1; i >= 0; i--) {
                const p = particles.current[i];
                p.x += p.vx;
                p.y += p.vy;
                p.life -= 0.02;
                p.vx *= 0.95;
                p.vy *= 0.95;

                if (p.life <= 0) {
                    particles.current.splice(i, 1);
                    continue;
                }

                ctx.beginPath();
                ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
                ctx.fillStyle = p.color.replace(')', `, ${p.life})`);
                ctx.fill();
            }

            // Draw Main Dot
            ctx.beginPath();
            ctx.arc(target.current.x, target.current.y, 4, 0, Math.PI * 2);
            ctx.fillStyle = '#ef4444';
            ctx.shadowBlur = 10;
            ctx.shadowColor = '#ef4444';
            ctx.fill();
            ctx.shadowBlur = 0;

            requestAnimationFrame(animate);
        };

        window.addEventListener('resize', resize);
        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mousedown', handleMouseDown);
        resize();
        animate();

        return () => {
            window.removeEventListener('resize', resize);
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mousedown', handleMouseDown);
        };
    }, []);

    return (
        <canvas
            ref={canvasRef}
            className="fixed inset-0 pointer-events-none z-[9999]"
            style={{ mixBlendMode: 'screen' }}
        />
    );
}
