'use client';

import { useState } from 'react';
import Link from 'next/link';
import { timeAgo } from '@/lib/format';
import type { GeoEvent } from '@/lib/types';

/**
 * Video from official broadcaster channels.
 *
 * Thumbnails only until the reader clicks: nothing is embedded, and no request reaches
 * a third-party player, until they ask for it. Playing uses youtube-nocookie.
 */
export function VideoWall({ events }: { events: GeoEvent[] }) {
  const [playing, setPlaying] = useState<string | null>(null);
  if (!events.length) return null;

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {events.map((e) => (
        <div key={e.id} className="panel overflow-hidden">
          <div className="relative aspect-video bg-[color:var(--color-surface)]">
            {playing === e.videoId ? (
              <iframe
                className="absolute inset-0 h-full w-full"
                src={`https://www.youtube-nocookie.com/embed/${e.videoId}?autoplay=1&rel=0`}
                title={e.title}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; picture-in-picture"
                allowFullScreen
              />
            ) : (
              <button onClick={() => setPlaying(e.videoId)}
                className="group absolute inset-0 h-full w-full"
                aria-label={`Play: ${e.title}`}>
                {e.imageUrl && (
                  <img src={e.imageUrl} alt="" loading="lazy"
                    className="h-full w-full object-cover opacity-80 transition-opacity group-hover:opacity-100" />
                )}
                <span className="absolute inset-0 flex items-center justify-center">
                  <span className="flex h-11 w-11 items-center justify-center rounded-full bg-[color:var(--color-ink)]/75 ring-1 ring-[color:var(--color-accent)] transition-transform group-hover:scale-110">
                    <svg width="14" height="16" viewBox="0 0 14 16" aria-hidden>
                      <path d="M0 0 L14 8 L0 16 Z" fill="var(--color-accent)" />
                    </svg>
                  </span>
                </span>
              </button>
            )}
          </div>
          <div className="p-3">
            <Link href={`/events/${e.id}`}
              className="line-clamp-2 text-[12.5px] leading-snug text-text hover:text-[color:var(--color-accent)]">
              {e.title}
            </Link>
            <div className="mt-1.5 flex items-center gap-2 text-[10.5px] text-faint">
              <span>{e.domain}</span>
              <span className="ml-auto">{timeAgo(e.lastSeen)}</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
