/**
 * Recognises YouTube and Vimeo URLs and derives a privacy-friendly embed URL.
 *
 * Only these two hosts are embedded. Anything else is rendered as a plain link
 * rather than an iframe, so a pasted URL can never turn into an arbitrary
 * cross-origin frame on a logged-in page.
 */
export interface VideoEmbed {
  provider: "youtube" | "vimeo";
  id: string;
  embedUrl: string;
  watchUrl: string;
}

function parseYouTube(url: URL): string | null {
  const host = url.hostname.replace(/^www\./, "");

  if (host === "youtu.be") {
    return url.pathname.slice(1).split("/")[0] || null;
  }

  if (host === "youtube.com" || host === "m.youtube.com" || host === "music.youtube.com") {
    if (url.pathname === "/watch") return url.searchParams.get("v");
    const embedMatch = url.pathname.match(/^\/(?:embed|v|shorts|live)\/([^/?#]+)/);
    if (embedMatch) return embedMatch[1];
  }

  return null;
}

function parseVimeo(url: URL): string | null {
  const host = url.hostname.replace(/^www\./, "");
  if (host !== "vimeo.com" && host !== "player.vimeo.com") return null;

  // https://vimeo.com/123456789, /channels/x/123456789, player.vimeo.com/video/123456789
  const segments = url.pathname.split("/").filter(Boolean);
  for (let i = segments.length - 1; i >= 0; i--) {
    if (/^\d+$/.test(segments[i])) return segments[i];
  }
  return null;
}

export function parseVideoUrl(raw: string | null | undefined): VideoEmbed | null {
  if (!raw) return null;

  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") return null;

  const youtubeId = parseYouTube(url);
  if (youtubeId && /^[\w-]{6,20}$/.test(youtubeId)) {
    return {
      provider: "youtube",
      id: youtubeId,
      // nocookie host avoids setting tracking cookies for logged-in viewers.
      embedUrl: `https://www.youtube-nocookie.com/embed/${youtubeId}`,
      watchUrl: `https://www.youtube.com/watch?v=${youtubeId}`,
    };
  }

  const vimeoId = parseVimeo(url);
  if (vimeoId) {
    return {
      provider: "vimeo",
      id: vimeoId,
      embedUrl: `https://player.vimeo.com/video/${vimeoId}`,
      watchUrl: `https://vimeo.com/${vimeoId}`,
    };
  }

  return null;
}

/** True for any http(s) URL — used to accept non-embeddable portfolio links. */
export function isHttpUrl(raw: string | null | undefined): boolean {
  if (!raw) return false;
  try {
    const url = new URL(raw.trim());
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}
