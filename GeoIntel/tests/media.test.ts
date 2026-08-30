import { describe, it, expect } from 'vitest';
import { parseFeed } from '@/lib/ingest/rss';

const wrap = (item: string) => `<?xml version="1.0"?>
<rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/">
<channel><title>T</title>${item}</channel></rss>`;

describe('image selection', () => {
  it('picks the largest size when a feed offers several', () => {
    // The Guardian's real shape: same photo at 140px and 460px, small one first.
    const [a] = parseFeed(wrap(`<item><title>Story</title><link>https://x/1</link>
      <media:content width="140" url="https://img/small.jpg"/>
      <media:content width="460" url="https://img/large.jpg"/>
    </item>`));
    expect(a.imageUrl).toBe('https://img/large.jpg');
  });

  it('reads media:thumbnail when that is all a feed sends', () => {
    const [a] = parseFeed(wrap(`<item><title>Story</title><link>https://x/2</link>
      <media:thumbnail width="240" height="135" url="https://img/thumb.jpg"/>
    </item>`));
    expect(a.imageUrl).toBe('https://img/thumb.jpg');
  });

  it('ignores video enclosures and non-http sources', () => {
    const [a] = parseFeed(wrap(`<item><title>Story</title><link>https://x/3</link>
      <media:content type="video/mp4" width="1920" url="https://vid/clip.mp4"/>
      <media:content width="300" url="https://img/pic.jpg"/>
    </item>`));
    expect(a.imageUrl).toBe('https://img/pic.jpg');

    const [b] = parseFeed(wrap(`<item><title>S</title><link>https://x/4</link>
      <enclosure url="data:image/png;base64,AAAA" type="image/png"/></item>`));
    expect(b.imageUrl).toBeNull();
  });

  it('falls back to an inline image in the description', () => {
    const [a] = parseFeed(wrap(`<item><title>Story</title><link>https://x/5</link>
      <description>&lt;img src="https://img/inline.jpg"/&gt; text</description></item>`));
    expect(a.imageUrl).toBe('https://img/inline.jpg');
  });

  it('returns null when a feed carries no image at all', () => {
    const [a] = parseFeed(wrap('<item><title>Story</title><link>https://x/6</link></item>'));
    expect(a.imageUrl).toBeNull();
  });
});

describe('Atom feed link resolution', () => {
  const atom = (entries: string) => `<?xml version="1.0"?>
<feed xmlns="http://www.w3.org/2005/Atom" xmlns:yt="http://www.youtube.com/xml/schemas/2015"
      xmlns:media="http://search.yahoo.com/mrss/">${entries}</feed>`;

  it('reads the href attribute rather than stringifying the element', () => {
    // The real failure: text() on an attribute-only <link/> returned "[object Object]",
    // so every entry in an Atom feed shared one URL and deduped down to a single item.
    const items = parseFeed(atom(`
      <entry><yt:videoId>abc123</yt:videoId><title>First</title>
        <link rel="alternate" href="https://www.youtube.com/watch?v=abc123"/>
        <published>2026-08-29T10:00:00+00:00</published></entry>
      <entry><yt:videoId>def456</yt:videoId><title>Second</title>
        <link rel="alternate" href="https://www.youtube.com/watch?v=def456"/>
        <published>2026-08-29T11:00:00+00:00</published></entry>`));

    expect(items).toHaveLength(2);
    expect(new Set(items.map((i) => i.url)).size).toBe(2);
    expect(items[0].url).toBe('https://www.youtube.com/watch?v=abc123');
    expect(items.every((i) => !i.url.includes('object Object'))).toBe(true);
  });

  it('extracts the video id and the media:group thumbnail', () => {
    const [v] = parseFeed(atom(`
      <entry><yt:videoId>xyz789</yt:videoId><title>Clip</title>
        <link rel="alternate" href="https://www.youtube.com/watch?v=xyz789"/>
        <media:group>
          <media:thumbnail url="https://i.ytimg.com/vi/xyz789/hq.jpg" width="480" height="360"/>
        </media:group></entry>`));
    expect(v.videoId).toBe('xyz789');
    expect(v.imageUrl).toBe('https://i.ytimg.com/vi/xyz789/hq.jpg');
  });

  it('prefers rel=alternate when several links are present', () => {
    const [v] = parseFeed(atom(`
      <entry><title>X</title>
        <link rel="self" href="https://feed/self"/>
        <link rel="alternate" href="https://publisher/story"/></entry>`));
    expect(v.url).toBe('https://publisher/story');
  });
});

describe('non-image media is never used as a picture', () => {
  it('rejects YouTube’s Flash player URL despite it being the widest candidate', () => {
    // Exactly the shape YouTube publishes: a 640px "media:content" that is a player,
    // and the real thumbnail at 480px. Width alone picks the wrong one.
    const [v] = parseFeed(`<?xml version="1.0"?>
      <feed xmlns="http://www.w3.org/2005/Atom" xmlns:media="http://search.yahoo.com/mrss/"
            xmlns:yt="http://www.youtube.com/xml/schemas/2015">
        <entry><yt:videoId>abc</yt:videoId><title>Clip</title>
          <link rel="alternate" href="https://youtube.com/watch?v=abc"/>
          <media:group>
            <media:content url="https://www.youtube.com/v/abc?version=3" type="application/x-shockwave-flash" width="640" height="390"/>
            <media:thumbnail url="https://i.ytimg.com/vi/abc/hqdefault.jpg" width="480" height="360"/>
          </media:group></entry></feed>`);
    expect(v.imageUrl).toBe('https://i.ytimg.com/vi/abc/hqdefault.jpg');
    expect(v.imageUrl).not.toContain('shockwave');
    expect(v.imageUrl).not.toContain('/v/');
  });

  it('still accepts a wide candidate that declares an image type', () => {
    const [v] = parseFeed(`<?xml version="1.0"?>
      <rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/"><channel><item>
        <title>S</title><link>https://x/1</link>
        <media:content url="https://img/small.jpg" type="image/jpeg" width="140"/>
        <media:content url="https://img/big.jpg" type="image/jpeg" width="1200"/>
      </item></channel></rss>`);
    expect(v.imageUrl).toBe('https://img/big.jpg');
  });
});
