import type { HTMLAttributes, PointerEvent, ReactNode } from "react";

interface TiltHandlers {
  onPointerMove: (event: PointerEvent<HTMLElement>) => void;
  onPointerLeave: (event: PointerEvent<HTMLElement>) => void;
}

const MAX_TILT_DEG = 4;

function canTilt(event: PointerEvent<HTMLElement>) {
  if (event.pointerType === "touch") return false;
  if (typeof window === "undefined") return false;
  return !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function useBento3DTilt(): TiltHandlers {
  const onPointerMove = (event: PointerEvent<HTMLElement>) => {
    if (!canTilt(event)) return;
    const el = event.currentTarget;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    const nx = (event.clientX - rect.left) / rect.width;
    const ny = (event.clientY - rect.top) / rect.height;

    const rotateY = (nx - 0.5) * 2 * MAX_TILT_DEG;
    const rotateX = (0.5 - ny) * 2 * MAX_TILT_DEG;

    el.style.setProperty("--rx", `${rotateX.toFixed(2)}deg`);
    el.style.setProperty("--ry", `${rotateY.toFixed(2)}deg`);
    el.style.setProperty("--mx", `${(nx * 100).toFixed(1)}%`);
    el.style.setProperty("--my", `${(ny * 100).toFixed(1)}%`);
    el.style.setProperty("--spot-alpha", "1");
  };

  const onPointerLeave = (event: PointerEvent<HTMLElement>) => {
    const el = event.currentTarget;
    el.style.setProperty("--rx", "0deg");
    el.style.setProperty("--ry", "0deg");
    el.style.setProperty("--spot-alpha", "0");
  };

  return { onPointerMove, onPointerLeave };
}

interface Bento3DCardProps extends HTMLAttributes<HTMLDivElement> {
  interactive?: boolean;
  children: ReactNode;
}

export function Bento3DCard({
  interactive = false,
  className = "",
  children,
  onPointerMove,
  onPointerLeave,
  ...rest
}: Bento3DCardProps) {
  const tilt = useBento3DTilt();

  return (
    <div
      className={`bento-card ${interactive ? "bento-card-interactive" : ""} ${className}`}
      onPointerMove={(event) => {
        tilt.onPointerMove(event);
        onPointerMove?.(event);
      }}
      onPointerLeave={(event) => {
        tilt.onPointerLeave(event);
        onPointerLeave?.(event);
      }}
      {...rest}
    >
      {children}
    </div>
  );
}
