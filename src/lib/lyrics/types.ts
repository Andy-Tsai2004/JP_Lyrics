export type RubyToken = {
  text: string;
  furigana?: string;
  /** Seconds into the track when this word starts (word-level synced lyrics). */
  start?: number;
  /** Seconds when the next word starts; present only when `start` is set. */
  end?: number;
};

export type LyricLine = {
  text: string;
  tokens: RubyToken[];
  /** Seconds into the track when this line is sung (synced lyrics only). */
  start?: number;
  /** Seconds when the next line starts; present only when `start` is set. */
  end?: number;
};

export type LyricsResult = {
  sourceUrl: string;
  title: string;
  lines: LyricLine[];
};
