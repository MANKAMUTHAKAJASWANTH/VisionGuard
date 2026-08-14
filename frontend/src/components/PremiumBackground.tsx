import { useEffect, useRef, useCallback } from 'react';

interface PremiumBackgroundProps {
  isLightTheme: boolean;
  activeTab: string;
}

export function PremiumBackground({ isLightTheme }: PremiumBackgroundProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<number>(0);
  const mouseRef = useRef({ x: 0.5, y: 0.5 });
  const targetMouseRef = useRef({ x: 0.5, y: 0.5 });

  // ── Draw loop ───────────────────────────────────────────────────────────────
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const W = canvas.width;
    const H = canvas.height;

    // Smoothly ease the mouse coordinates to make the 3D lighting transition smooth
    mouseRef.current.x += (targetMouseRef.current.x - mouseRef.current.x) * 0.08;
    mouseRef.current.y += (targetMouseRef.current.y - mouseRef.current.y) * 0.08;

    const mx = mouseRef.current.x * W;
    const my = mouseRef.current.y * H;

    ctx.clearRect(0, 0, W, H);

    if (isLightTheme) {
      // 1. Light Mode base gradient (fluent matte finish off-white / light blue / cyan tint)
      const baseGrad = ctx.createRadialGradient(
        W * 0.5 + (mx - W * 0.5) * 0.1,
        H * 0.4 + (my - H * 0.4) * 0.1,
        0,
        W * 0.5,
        H * 0.5,
        Math.max(W, H) * 0.8
      );
      baseGrad.addColorStop(0, '#ffffff');
      baseGrad.addColorStop(0.35, '#fafbfc');
      baseGrad.addColorStop(0.7, '#f1f5f9');
      baseGrad.addColorStop(1, '#e2e8f0');

      ctx.fillStyle = baseGrad;
      ctx.fillRect(0, 0, W, H);

      // 2. Soft 3D lighting overlay (delicate ambient light spotlight tint)
      const lightGrad = ctx.createRadialGradient(
        mx,
        my,
        0,
        mx,
        my,
        Math.max(W, H) * 0.6
      );
      lightGrad.addColorStop(0, 'rgba(0, 243, 255, 0.09)'); // soft cyan ambient light
      lightGrad.addColorStop(0.5, 'rgba(0, 102, 255, 0.04)'); // soft blue ambient light
      lightGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
      ctx.fillStyle = lightGrad;
      ctx.fillRect(0, 0, W, H);

      // 3. Matte Vignette (subtle shading at the borders for depth)
      const vignette = ctx.createRadialGradient(
        W * 0.5,
        H * 0.5,
        Math.min(W, H) * 0.45,
        W * 0.5,
        H * 0.5,
        Math.max(W, H) * 0.75
      );
      vignette.addColorStop(0, 'rgba(255, 255, 255, 0)');
      vignette.addColorStop(1, 'rgba(15, 23, 42, 0.06)');
      ctx.fillStyle = vignette;
      ctx.fillRect(0, 0, W, H);

    } else {
      // 1. Dark Mode base gradient (deep midnight navy / deep black / indigo)
      const baseGrad = ctx.createRadialGradient(
        W * 0.5 + (mx - W * 0.5) * 0.15,
        H * 0.4 + (my - H * 0.4) * 0.15,
        0,
        W * 0.5,
        H * 0.5,
        Math.max(W, H) * 0.95
      );
      baseGrad.addColorStop(0, '#0a0b22'); // dark navy highlight
      baseGrad.addColorStop(0.4, '#040514'); // midnight blue
      baseGrad.addColorStop(0.85, '#02020a'); // deep black
      baseGrad.addColorStop(1, '#000003');

      ctx.fillStyle = baseGrad;
      ctx.fillRect(0, 0, W, H);

      // 2. Soft 3D lighting overlay (gentle blue/indigo ambient glow)
      const lightGrad = ctx.createRadialGradient(
        mx,
        my,
        0,
        mx,
        my,
        Math.max(W, H) * 0.7
      );
      lightGrad.addColorStop(0, 'rgba(99, 102, 241, 0.15)'); // soft indigo ambient glow
      lightGrad.addColorStop(0.4, 'rgba(0, 102, 255, 0.08)'); // soft blue ambient glow
      lightGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = lightGrad;
      ctx.fillRect(0, 0, W, H);

      // 3. Matte Vignette (adds realistic depth shading)
      const vignette = ctx.createRadialGradient(
        W * 0.5,
        H * 0.5,
        Math.min(W, H) * 0.5,
        W * 0.5,
        H * 0.5,
        Math.max(W, H) * 0.9
      );
      vignette.addColorStop(0, 'rgba(0, 0, 0, 0)');
      vignette.addColorStop(0.7, 'rgba(0, 0, 0, 0.25)');
      vignette.addColorStop(1, 'rgba(0, 0, 0, 0.72)');
      ctx.fillStyle = vignette;
      ctx.fillRect(0, 0, W, H);
    }

    frameRef.current = requestAnimationFrame(draw);
  }, [isLightTheme]);

  // ── Setup & cleanup ─────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resize = () => {
      canvas.width  = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    const onMouseMove = (e: MouseEvent) => {
      targetMouseRef.current = {
        x: e.clientX / window.innerWidth,
        y: e.clientY / window.innerHeight,
      };
    };
    window.addEventListener('mousemove', onMouseMove);

    const onScroll = () => {
      const scrollPct = window.scrollY / (document.documentElement.scrollHeight - window.innerHeight || 1);
      targetMouseRef.current.y = 0.5 + (scrollPct - 0.5) * 0.3;
    };
    window.addEventListener('scroll', onScroll);

    draw();

    return () => {
      window.removeEventListener('resize', resize);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(frameRef.current);
    };
  }, [draw]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        zIndex: -1,
        pointerEvents: 'none',
        display: 'block',
      }}
    />
  );
}
