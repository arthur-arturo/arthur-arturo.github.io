import { useEffect, useRef } from "react";

const TILE_SIZE = 128;
const TILE_COUNT = 4;
const FRAME_INTERVAL = 95;

function createNoiseTile() {
  const tile = document.createElement("canvas");
  tile.width = TILE_SIZE;
  tile.height = TILE_SIZE;
  const tileContext = tile.getContext("2d", { alpha: false });
  if (!tileContext) return null;

  const frame = tileContext.createImageData(TILE_SIZE, TILE_SIZE);
  for (let index = 0; index < frame.data.length; index += 4) {
    const value = Math.random() < 0.5 ? 0 : 255;
    frame.data[index] = value;
    frame.data[index + 1] = value;
    frame.data[index + 2] = value;
    frame.data[index + 3] = 255;
  }
  tileContext.putImageData(frame, 0, 0);
  return tile;
}

export function NoiseOverlay() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d", { alpha: false });
    if (!canvas || !context) return;

    const tiles: HTMLCanvasElement[] = [];
    for (let i = 0; i < TILE_COUNT; i += 1) {
      const tile = createNoiseTile();
      if (tile) tiles.push(tile);
    }
    if (tiles.length === 0) return;

    const patterns = tiles.map((tile) => context.createPattern(tile, "repeat"));
    let frameIndex = 0;
    let frameTimer = 0;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

    const drawFrame = () => {
      if (document.hidden) return;
      const pattern = patterns[frameIndex % patterns.length];
      frameIndex = (frameIndex + 1) % patterns.length;
      if (!pattern) return;
      context.fillStyle = pattern;
      context.fillRect(0, 0, canvas.width, canvas.height);
    };

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      drawFrame();
    };

    const startAnimation = () => {
      window.clearInterval(frameTimer);
      drawFrame();
      if (!reducedMotion.matches && !document.hidden) {
        frameTimer = window.setInterval(drawFrame, FRAME_INTERVAL);
      }
    };

    const handleVisibility = () => {
      if (document.hidden) {
        window.clearInterval(frameTimer);
        return;
      }
      startAnimation();
    };

    resize();
    if (!reducedMotion.matches) {
      frameTimer = window.setInterval(drawFrame, FRAME_INTERVAL);
    }
    window.addEventListener("resize", resize, { passive: true });
    document.addEventListener("visibilitychange", handleVisibility);
    reducedMotion.addEventListener("change", startAnimation);

    return () => {
      window.clearInterval(frameTimer);
      window.removeEventListener("resize", resize);
      document.removeEventListener("visibilitychange", handleVisibility);
      reducedMotion.removeEventListener("change", startAnimation);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-[1000] h-screen w-screen opacity-[0.035]"
    />
  );
}
