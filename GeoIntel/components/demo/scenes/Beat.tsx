// components/demo/scenes/Beat.tsx
import type { CSSProperties, ReactNode } from 'react';

/** The inline style that gives an element its place in a scene's timeline (see `.demo-beat` in globals.css). */
export function beatStyle(atMs: number): CSSProperties {
  return { '--beat': `${atMs}ms` } as CSSProperties;
}

const KIND = { rise: 'demo-beat', slide: 'demo-slide', email: 'demo-email' } as const;

/** One thing appearing at a moment in a scene. Its animation waits `at` ms, then plays once. */
export function Beat({ at, kind = 'rise', className = '', children }: {
  at: number; kind?: keyof typeof KIND; className?: string; children: ReactNode;
}) {
  return <div className={`${KIND[kind]} ${className}`.trim()} style={beatStyle(at)}>{children}</div>;
}

/** The stage every scene sits in: centred, capped in width, stacked. */
export function SceneFrame({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`mx-auto flex w-full max-w-4xl flex-col items-center justify-center gap-5 px-2 ${className}`.trim()}>
      {children}
    </div>
  );
}
