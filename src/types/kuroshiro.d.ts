declare module "kuroshiro" {
  export default class Kuroshiro {
    init(analyzer: unknown): Promise<void>;
    convert(
      str: string,
      options?: { to?: string; mode?: string },
    ): Promise<string>;
  }
}

declare module "kuroshiro-analyzer-kuromoji" {
  export default class KuromojiAnalyzer {
    constructor(options?: { dictPath?: string });
    init(): Promise<void>;
    parse(str: string): Promise<unknown>;
  }
}
