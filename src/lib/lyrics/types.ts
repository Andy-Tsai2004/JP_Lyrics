export type RubyToken = {
  text: string;
  furigana?: string;
};

export type LyricLine = {
  text: string;
  tokens: RubyToken[];
};

export type LyricsResult = {
  sourceUrl: string;
  title: string;
  lines: LyricLine[];
};
