"""Word-level lyric alignment for JP_Lyrics (runs inside the WSL host).

NetEase no longer exposes word-level (klyric) timestamps to anonymous API
requests, so we generate them ourselves: faster-whisper transcribes the
downloaded full mix with word timestamps, and a DP edit-distance alignment
maps the REAL lyric lines onto those timestamps.

Output (cached as <song_id>_timings.json):
    {"lines": [{"index", "text", "start", "end", "char_times": [float...]}]}
`char_times[i]` is the playback second for the i-th character of `text`
(original line, punctuation kept); gaps are interpolated, so the client can
map any token (e.g. furigana sub-tokens) to times by character offset.
"""
from __future__ import annotations

import json
import re
import unicodedata

_KATAKANA = "".join(chr(c) for c in range(0x30A1, 0x30F7))
_HIRAGANA = "".join(chr(c) for c in range(0x3041, 0x3097))
_KATA2HIRA = str.maketrans(_KATAKANA, _HIRAGANA)
_PUNCT_RE = re.compile(
    r"[\s\u3000、。，．,\.!！?？…「」『』（）()【】\[\]・\-—–:：;；\"'\"'~〜]+"
)


def _norm_char(ch: str) -> str:
    return unicodedata.normalize("NFKC", ch).lower().translate(_KATA2HIRA)


def _norm_text(text: str) -> str:
    out: list[str] = []
    for ch in text:
        n = _norm_char(ch)
        if n and not _PUNCT_RE.fullmatch(ch):
            out.append(n)
    return "".join(out)


def _transcript_moras(segments) -> list[tuple[str, float, float]]:
    """Flatten whisper word timestamps into (normalized char, start, end)."""
    moras: list[tuple[str, float, float]] = []
    for seg in segments:
        words = list(seg.words or [])
        if not words:
            continue
        for word in words:
            chars = _norm_text((word.word or "").strip())
            if not chars:
                continue
            dur = max(word.end - word.start, 0.001)
            n = len(chars)
            for i, ch in enumerate(chars):
                moras.append(
                    (ch, word.start + dur * i / n, word.start + dur * (i + 1) / n)
                )
    return moras


def _interpolate(times: list[float | None]) -> list[float]:
    """Fill None gaps by linear interpolation between known neighbours."""
    out = [0.0] * len(times)
    known = [(i, t) for i, t in enumerate(times) if t is not None]
    if not known:
        return out
    for i in range(len(times)):
        if times[i] is not None:
            out[i] = times[i]
            continue
        prev = max((j for j, _ in known if j < i), default=None)
        nxt = min((j for j, _ in known if j > i), default=None)
        if prev is None:
            out[i] = known[0][1]
        elif nxt is None:
            out[i] = known[-1][1]
        else:
            pj, pt = known[[j for j, _ in known].index(prev)]
            nj, nt = known[[j for j, _ in known].index(nxt)]
            frac = (i - pj) / max(nj - pj, 1)
            out[i] = pt + (nt - pt) * frac
    return out


def align_lines(lines: list[str], segments) -> list[dict]:
    """Align real lyric lines onto whisper segments; returns per-line timings."""
    b = _transcript_moras(segments)
    a: list[tuple[str, int, int]] = []  # (normalized char, line index, char pos)
    for li, line in enumerate(lines):
        for pi, ch in enumerate(line):
            n = _norm_char(ch)
            if n and not _PUNCT_RE.fullmatch(ch):
                a.append((n, li, pi))
    if not a or not b:
        return []

    n, m = len(a), len(b)
    width = m + 1
    dirs = bytearray((n + 1) * width)  # 0=diag 1=up 2=left
    prev = [j * 2 for j in range(width)]
    for i in range(1, n + 1):
        cur = [0] * width
        cur[0] = prev[0] + 2
        for j in range(1, m + 1):
            cost = 0 if a[i - 1][0] == b[j - 1][0] else 1
            diag = prev[j - 1] + cost
            up = prev[j] + 2
            left = cur[j - 1] + 2
            if diag <= up and diag <= left:
                cur[j] = diag
                dirs[i * width + j] = 0
            elif up <= left:
                cur[j] = up
                dirs[i * width + j] = 1
            else:
                cur[j] = left
                dirs[i * width + j] = 2
        prev = cur

    # Backtrace and assign each lyric character the midpoint of its aligned mora.
    a_times: list[float | None] = [None] * n
    i, j = n, m
    while i > 0 and j > 0:
        d = dirs[i * width + j]
        if d == 0:
            s, e = b[j - 1][1], b[j - 1][2]
            a_times[i - 1] = (s + e) / 2
            i -= 1
            j -= 1
        elif d == 1:
            i -= 1
        else:
            j -= 1

    # Per original line: char_times aligned to the full text (punct kept).
    by_line: dict[int, list[float | None]] = {}
    for k, (_, li, pi) in enumerate(a):
        by_line.setdefault(li, [None] * len(lines[li]))[pi] = a_times[k]
    result: list[dict] = []
    for li, line in enumerate(lines):
        if li not in by_line:
            continue
        char_times = _interpolate(by_line[li])
        result.append(
            {
                "index": li,
                "text": line,
                "start": char_times[0],
                "end": char_times[-1],
                "char_times": [round(t, 3) for t in char_times],
            }
        )
    return result
