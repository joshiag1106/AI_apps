// components/demo/scenes/index.tsx
import type { ReactNode } from 'react';
import type { AnyChapter, ChapterId } from '@/lib/demo/types';
import { AskScene } from './AskScene';
import { BoardScene } from './BoardScene';
import { CloseScene } from './CloseScene';
import { DyadScene } from './DyadScene';
import { EventScene } from './EventScene';
import { LadderScene } from './LadderScene';
import { LanguageScene } from './LanguageScene';
import { LensScene } from './LensScene';
import { NetworkScene } from './NetworkScene';
import { RiskScene } from './RiskScene';
import { TrailScene } from './TrailScene';
import { YoursScene } from './YoursScene';

/** The scene for a chapter. `c.id` narrows `c.data`, so each branch is checked against its own data type. */
export function renderScene(c: AnyChapter): ReactNode {
  switch (c.id) {
    case 'board': return <BoardScene data={c.data} />;
    case 'language': return <LanguageScene data={c.data} />;
    case 'lens': return <LensScene data={c.data} />;
    case 'event': return <EventScene data={c.data} />;
    case 'ladder': return <LadderScene data={c.data} />;
    case 'trail': return <TrailScene data={c.data} />;
    case 'risk': return <RiskScene data={c.data} />;
    case 'dyad': return <DyadScene data={c.data} />;
    case 'network': return <NetworkScene data={c.data} />;
    case 'ask': return <AskScene data={c.data} />;
    case 'yours': return <YoursScene data={c.data} />;
    case 'close': return <CloseScene data={c.data} />;
  }
}

/**
 * Only the closing chapter has anything to click. Every other scene renders links (map markers,
 * graph nodes, chart markers) that must not be reachable while an animation plays, so the shell
 * marks the stage `inert` for them.
 */
export function isInteractive(id: ChapterId): boolean {
  return id === 'close';
}
