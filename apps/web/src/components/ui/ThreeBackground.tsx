import { useEffect, useRef } from 'react';
import * as THREE from 'three';

function makeGradTexture(r: number, g: number, b: number, peakOp: number): THREE.CanvasTexture {
  const size = 256;
  const c = document.createElement('canvas');
  c.width = size; c.height = size;
  const ctx = c.getContext('2d')!;
  const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0,   `rgba(${r},${g},${b},${peakOp})`);
  grad.addColorStop(0.45,`rgba(${r},${g},${b},${(peakOp * 0.35).toFixed(3)})`);
  grad.addColorStop(1,   `rgba(${r},${g},${b},0)`);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(c);
}

const BLOBS = [
  { r: 200, g: 255, b: 0,   op: 0.20, ox: -0.32, oy:  0.28, sc: 1.30 },
  { r: 255, g: 77,  b: 0,   op: 0.15, ox:  0.40, oy: -0.22, sc: 1.10 },
  { r: 0,   g: 212, b: 255, op: 0.11, ox:  0.04, oy:  0.08, sc: 1.50 },
  { r: 200, g: 255, b: 0,   op: 0.09, ox: -0.14, oy: -0.33, sc: 0.95 },
  { r: 255, g: 77,  b: 0,   op: 0.07, ox:  0.28, oy:  0.36, sc: 0.80 },
];

export function ThreeBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const w = window.innerWidth;
    const h = window.innerHeight;

    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1));
    renderer.setSize(w, h);

    const scene = new THREE.Scene();
    const cam = new THREE.OrthographicCamera(-w / 2, w / 2, h / 2, -h / 2, 0.1, 10);
    cam.position.z = 1;

    const sprites = BLOBS.map(cfg => {
      const tex = makeGradTexture(cfg.r, cfg.g, cfg.b, cfg.op);
      const mat = new THREE.SpriteMaterial({
        map: tex,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const s = new THREE.Sprite(mat);
      const sz = h * cfg.sc;
      s.scale.set(sz, sz, 1);
      s.position.set(cfg.ox * w, cfg.oy * h, 0);
      scene.add(s);
      return s;
    });

    const origins = BLOBS.map(c => ({ x: c.ox * w, y: c.oy * h }));
    let t = 0;
    let animId: number;

    const tick = () => {
      animId = requestAnimationFrame(tick);
      t += 0.0025;
      sprites.forEach((s, i) => {
        const amp = 55 + i * 18;
        s.position.x = origins[i].x + Math.sin(t * 0.52 + i * 1.18) * amp;
        s.position.y = origins[i].y + Math.cos(t * 0.38 + i * 0.77) * amp * 0.72;
      });
      renderer.render(scene, cam);
    };
    tick();

    const onResize = () => {
      const nw = window.innerWidth, nh = window.innerHeight;
      renderer.setSize(nw, nh);
      cam.left = -nw / 2; cam.right = nw / 2;
      cam.top = nh / 2; cam.bottom = -nh / 2;
      cam.updateProjectionMatrix();
    };
    window.addEventListener('resize', onResize);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', onResize);
      sprites.forEach(s => (s.material as THREE.SpriteMaterial).map?.dispose());
      renderer.dispose();
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{ position: 'fixed', inset: 0, zIndex: -1, pointerEvents: 'none' }}
    />
  );
}
