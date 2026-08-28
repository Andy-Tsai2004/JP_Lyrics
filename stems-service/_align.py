"""Word-level lyric alignment for JP_Lyrics (runs inside the WSL host).

NetEase no longer exposes word-level (klyric) timestamps to anonymous API
requests, so we generate them ourselves: faster-whisper transcribes the
downloaded full mix with word timestamps, and DP edit-distance alignment maps
the REAL lyric lines onto those timestamps.

When NetEase line-level starts are available they are used as ANCHORS to
correct lines where the global DP drifted (whisper mis-transcribes a phrase
and the alignment lands seconds away); well-aligned lines are left untouched.

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


def _line_chars(line: str) -> list[tuple[str, int]]:
    """(normalized char, original position) pairs, skipping punctuation."""
    return [
        (n, pos)
        for pos, ch in enumerate(line)
        if (n := _norm_char(ch)) and not _PUNCT_RE.fullmatch(ch)
    ]


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


def _dp_times(a: list[str], b: list[tuple[str, float, float]]) -> list[float | None]:
    """Edit-distance alignment; returns a time for each char of `a` (None = gap)."""
    n, m = len(a), len(b)
    if n == 0 or m == 0:
        return [None] * n
    width = m + 1
    dirs = bytearray((n + 1) * width)  # 0=diag 1=up 2=left
    prev = [j * 2 for j in range(width)]
    for i in range(1, n + 1):
        cur = [0] * width
        cur[0] = prev[0] + 2
        for j in range(1, m + 1):
            cost = 0 if a[i - 1] == b[j - 1][0] else 1
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
    times: list[float | None] = [None] * n
    i, j = n, m
    while i > 0 and j > 0:
        d = dirs[i * width + j]
        if d == 0:
            s, e = b[j - 1][1], b[j - 1][2]
            times[i - 1] = (s + e) / 2
            i -= 1
            j -= 1
        elif d == 1:
            i -= 1
        else:
            j -= 1
    return times


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


def _monotonic(times: list[float]) -> list[float]:
    """Clamp to a non-decreasing sequence (whisper times can repeat)."""
    out = list(times)
    for i in range(1, len(out)):
        if out[i] < out[i - 1]:
            out[i] = out[i - 1]
    return out


def _per_line_times(line: str, a_times: list[float | None]) -> list[float]:
    """Expand per-char aligned times to the full original line (punct kept)."""
    full: list[float | None] = [None] * len(line)
    for (_, pos), t in zip(_line_chars(line), a_times):
        full[pos] = t
    return _monotonic(_interpolate(full))


def _line_align(
    line: str,
    moras: list[tuple[str, float, float]],
) -> tuple[list[float], int, int]:
    """DP-align one line against a mora slice; returns (times, matched, total)."""
    chars = _line_chars(line)
    a = [c for c, _ in chars]
    times = _dp_times(a, moras)
    matched = sum(1 for t in times if t is not None)
    return _per_line_times(line, times), matched, max(len(a), 1)


def align_lines(
    lines: list[str],
    segments,
    starts: list[float] | None = None,
) -> list[dict]:
    """Align real lyric lines onto whisper segments; returns per-line timings.

    `starts` optionally provides per-line anchor seconds (e.g. NetEase LRC).
    Lines whose global DP start is far from the anchor are shifted back to it
    (a systematic offset shifts all lines; otherwise only the outliers).
    """
    b = _transcript_moras(segments)
    has_anchors = (
        starts is not None
        and len(starts) == len(lines)
        and all(s is not None for s in starts)
    )

    # One DP over the WHOLE lyric text keeps repeated lines in their correct
    # relative order (per-line DPs would all match the earliest repetition).
    a_chars: list[str] = []
    mapping: list[tuple[int, int]] = []  # (line index, char index within line)
    for li, line in enumerate(lines):
        for pos, (c, _) in enumerate(_line_chars(line)):
            a_chars.append(c)
            mapping.append((li, pos))
    times = _dp_times(a_chars, b)
    per_line_raw: dict[int, list[float | None]] = {li: [] for li in range(len(lines))}
    for (li, _), t in zip(mapping, times):
        per_line_raw[li].append(t)
    global_times: dict[int, list[float]] = {
        li: _per_line_times(lines[li], per_line_raw[li]) for li in range(len(lines))
    }

    deltas: list[float] = []
    if has_anchors:
        for li in range(len(lines)):
            deltas.append(starts[li] - global_times[li][0])
        sorted_abs = sorted(abs(d) for d in deltas)
        median_abs = sorted_abs[len(sorted_abs) // 2]
        snap_all = median_abs > 2.5

    result: list[dict] = []
    for li, line in enumerate(lines):
        char_times = global_times[li]
        if has_anchors:
            delta = starts[li] - char_times[0]
            if snap_all or abs(delta) > 2.5:
                char_times = [t + delta for t in char_times]
        result.append(
            {
                "index": li,
                "text": line,
                "start": char_times[0] if char_times else 0.0,
                "end": char_times[-1] if char_times else 0.0,
                "char_times": [round(t, 3) for t in char_times],
            }
        )
    return result
