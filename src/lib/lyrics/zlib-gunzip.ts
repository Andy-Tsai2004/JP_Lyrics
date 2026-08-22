import { gunzipSync } from "fflate";

/**
 * Browser-safe replacement for `zlibjs/bin/gunzip.min.js` (the module
 * kuromoji's browser dictionary loader imports). The original UMD assumes a
 * CommonJS `this` binding, which breaks inside a Vite ESM bundle; this shim
 * keeps the same `new Zlib.Gunzip(bytes).decompress()` interface but uses the
 * pure-JS `fflate` gunzip instead.
 */

export class Gunzip {
  private readonly input: Uint8Array;

  constructor(input: Uint8Array) {
    this.input = input;
  }

  decompress(): Uint8Array {
    const data = this.input;
    // The dev server (and some hosts) serves .gz files with
    // `Content-Encoding: gzip`, so the browser has already decompressed the
    // bytes by the time the XHR completes; GitHub Pages serves them raw.
    // Detect the gzip magic bytes and only gunzip when needed.
    if (data.length >= 2 && data[0] === 0x1f && data[1] === 0x8b) {
      return gunzipSync(data);
    }
    return data;
  }
}

export const Zlib = { Gunzip };
