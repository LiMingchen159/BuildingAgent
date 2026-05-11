import { useEffect, useRef } from "react";

export interface ParticleFieldProps {
  interactive?: boolean | undefined;
  density?: number | undefined;
  connectionDistance?: number | undefined;
  opacity?: number | undefined;
  className?: string | undefined;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
}

export function ParticleField({
  interactive = true,
  density = 60,
  connectionDistance = 150,
  opacity = 0.15,
  className
}: ParticleFieldProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const mouseRef = useRef<{ x: number | null; y: number | null }>({ x: null, y: null });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }
    if (typeof window !== "undefined" && /jsdom/i.test(window.navigator.userAgent)) {
      return;
    }
    const activeCanvas = canvas;
    let ctx: CanvasRenderingContext2D | null = null;
    try {
      ctx = canvas.getContext("2d");
    } catch {
      return;
    }
    if (!ctx) {
      return;
    }

    const parent = canvas.parentElement ?? document.body;
    let particles: Particle[] = [];
    let animationFrame = 0;
    let width = 0;
    let height = 0;

    function initParticles() {
      particles = [];
      for (let i = 0; i < density; i += 1) {
        particles.push({
          x: Math.random() * width,
          y: Math.random() * height,
          vx: (Math.random() - 0.5) * 0.2,
          vy: (Math.random() - 0.5) * 0.2,
          size: Math.random() * 1.5 + 0.5
        });
      }
    }

    function resize() {
      const rect = parent.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
      const dpr = window.devicePixelRatio || 1;
      activeCanvas.width = width * dpr;
      activeCanvas.height = height * dpr;
      activeCanvas.style.width = `${width}px`;
      activeCanvas.style.height = `${height}px`;
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      initParticles();
    }

    function drawConnections() {
      for (let i = 0; i < particles.length; i += 1) {
        for (let j = i + 1; j < particles.length; j += 1) {
          const dx = particles[i]!.x - particles[j]!.x;
          const dy = particles[i]!.y - particles[j]!.y;
          const distance = Math.sqrt(dx * dx + dy * dy);
          if (distance < connectionDistance) {
            const alpha = (1 - distance / connectionDistance) * opacity;
            ctx!.beginPath();
            ctx!.moveTo(particles[i]!.x, particles[i]!.y);
            ctx!.lineTo(particles[j]!.x, particles[j]!.y);
            ctx!.strokeStyle = `rgba(0, 0, 0, ${alpha})`;
            ctx!.lineWidth = 0.5;
            ctx!.stroke();
          }
        }
      }
    }

    function animate() {
      ctx!.clearRect(0, 0, width, height);
      drawConnections();
      for (const particle of particles) {
        particle.x += particle.vx;
        particle.y += particle.vy;
        if (particle.x < 0 || particle.x > width) particle.vx *= -1;
        if (particle.y < 0 || particle.y > height) particle.vy *= -1;

        ctx!.beginPath();
        ctx!.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
        ctx!.fillStyle = `rgba(0, 0, 0, ${opacity})`;
        ctx!.fill();

        if (interactive && mouseRef.current.x !== null && mouseRef.current.y !== null) {
          const dx = particle.x - mouseRef.current.x;
          const dy = particle.y - mouseRef.current.y;
          const distance = Math.sqrt(dx * dx + dy * dy);
          const radius = connectionDistance * 1.5;
          if (distance < radius) {
            const alpha = (1 - distance / radius) * (opacity * 1.7);
            ctx!.beginPath();
            ctx!.moveTo(particle.x, particle.y);
            ctx!.lineTo(mouseRef.current.x, mouseRef.current.y);
            ctx!.strokeStyle = `rgba(0, 0, 0, ${alpha})`;
            ctx!.lineWidth = 0.5;
            ctx!.stroke();
          }
        }
      }
      animationFrame = window.requestAnimationFrame(animate);
    }

    function handleMouseMove(event: MouseEvent) {
      const rect = activeCanvas.getBoundingClientRect();
      mouseRef.current.x = event.clientX - rect.left;
      mouseRef.current.y = event.clientY - rect.top;
    }

    function handleMouseLeave() {
      mouseRef.current.x = null;
      mouseRef.current.y = null;
    }

    resize();
    animate();

    window.addEventListener("resize", resize);
    if (interactive) {
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseout", handleMouseLeave);
    }

    return () => {
      window.cancelAnimationFrame(animationFrame);
      window.removeEventListener("resize", resize);
      if (interactive) {
        window.removeEventListener("mousemove", handleMouseMove);
        window.removeEventListener("mouseout", handleMouseLeave);
      }
    };
  }, [interactive, density, connectionDistance, opacity]);

  const composed = ["particle-field", className].filter(Boolean).join(" ");
  return <canvas ref={canvasRef} className={composed} aria-hidden="true" />;
}
