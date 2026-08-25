#!/usr/bin/env python3
"""
karaoke-stem.py — produce a vocals-free (ke rao ke) backing track from a song.

Route B for the JP_Lyrics project. Given audio, it runs Demucs stem separation
and leaves you a clean "no_vocals" instrumental (and optionally the isolated
vocals). You can feed it a local file, a YouTube video, or a Uta-Net song page
— for the last two it downloads the actual song audio first, so the backing
track is built from the *real* song, not a found upload.

Usage
-----
    # Check the environment (demucs / numpy / ffmpeg present?):
    python scripts/karaoke-stem.py --check

    # From a local audio file (mp3/wav/m4a/flac …) -> song_no_vocals.wav:
    python scripts/karaoke-stem.py "./song.mp3"

    # From a YouTube video (the app resolves this id out of the Uta-Net page):
    python scripts/karaoke-stem.py --youtube "https://www.youtube.com/watch?v=ZRtdQ81jPUQ"

    # From a Uta-Net song page (resolves -> YouTube -> download -> separate):
    python scripts/karaoke-stem.py --uta-net "https://www.uta-net.com/song/12345/"

    # Options
    python scripts/karaoke-stem.py "./song.mp3" -o "./karaoke" --keep-vocals -m htdemucs_ft

Runs with whichever Python launched it (so `python -m demucs` matches the
interpreter you invoked). Install Demucs and yt-dlp first, or run through uv
without installing anything:

    uv run --with demucs --with numpy -- python scripts/karaoke-stem.py --uta-net "<song url>"
"""

from __future__ import annotations

import argparse
import importlib.util
import re
import shlex
import shutil
import subprocess
import sys
import urllib.request
from pathlib import Path

# Demucs (with --two-stems=vocals) writes the stems we want under the model dir.
NO_VOCALS_STEM = "no_vocals"
VOCALS_STEM = "vocals"

# The app uses the same reader proxy for lyric/video fetches; Uta-Net movie
# pages embed the official YouTube video, which we scrape to get its id.
JINA_PREFIX = "https://r.jina.ai/"
JINA_TIMEOUT_S = 25
YOUTUBE_EMBED_RE = re.compile(
    r"(?:youtube(?:-nocookie)?\.com/embed/|youtube\.com/watch\?[^\"'\s]*v=|youtu\.be/)"
    r"([A-Za-z0-9_-]{11})"
)


def _find_spec(name: str):
    return importlib.util.find_spec(name)


def http_get_html(url: str, timeout: int = JINA_TIMEOUT_S) -> str:
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0", "X-Return-Format": "html"})
    with urllib.request.urlopen(req, timeout=timeout) as resp:  # noqa: S310  (fixed proxy URL)
        return resp.read().decode("utf-8", "replace")


def check_environment() -> tuple[bool, list[str]]:
    """Return (ok, messages). ok=False when demucs, numpy, or ffmpeg is missing."""
    messages: list[str] = []
    ok = True

    if _find_spec("demucs") is None:
        messages.append(
            "Demucs is not installed in this Python.\n"
            "  Install it:            python -m pip install demucs\n"
            "  …or run through uv:    uv run --with demucs --with numpy -- python scripts/karaoke-stem.py <song>"
        )
        ok = False
    else:
        messages.append("Demucs: found")

    # uv's ephemeral `--with demucs` env can resolve demucs + torch but skip the
    # transitive numpy it imports at runtime; check it explicitly so --check
    # surfaces a one-line fix instead of a cryptic ModuleNotFoundError later.
    if _find_spec("numpy") is None:
        messages.append(
            "numpy is not importable (Demucs needs it). Add numpy to the uv command:\n"
            "  uv run --with demucs --with numpy -- python scripts/karaoke-stem.py <song>"
        )
        ok = False
    else:
        messages.append("numpy: found")

    if shutil.which("ffmpeg") is None:
        messages.append(
            "ffmpeg was not found on PATH. Demucs needs it to read/write audio; yt-dlp needs it too.\n"
            "  Install ffmpeg and add it to PATH, then re-run."
        )
        ok = False
    else:
        messages.append("ffmpeg: found")

    if shutil.which("yt-dlp") is None and shutil.which("uvx") is None:
        messages.append(
            "yt-dlp is not installed (needed for --youtube / --uta-net). Install it:\n"
            "  python -m pip install yt-dlp        # or: uvx --from yt-dlp yt-dlp …"
        )
        ok = False

    return ok, messages


def run_separation(
    audio: Path, output_dir: Path, model: str, keep_vocals: bool, device: str | None
) -> Path:
    """Run `python -m demucs.separate` and return the produced no_vocals file."""
    output_dir.mkdir(parents=True, exist_ok=True)

    # --two-stems=vocals makes Demucs write exactly the stems we want:
    # vocals.wav and no_vocals.wav (the sum of every non-vocal stem). Without
    # it the htdemucs "bag" writes four stems (drums/bass/other/vocals) and we'd
    # have to mix the non-vocal ones ourselves.
    cmd = [
        sys.executable,
        "-m",
        "demucs.separate",
        "--two-stems",
        "vocals",
        "-n",
        model,
        "-o",
        str(output_dir),
    ]
    if device:
        cmd += ["-d", device]
    cmd.append(str(audio))

    print(f"Running Demucs ({model}) on {audio} … this may take a while (GPU helps).")
    proc = subprocess.run(cmd, check=False)
    if proc.returncode != 0:
        raise RuntimeError("Demucs failed — see its output above.")

    # Demucs lays files out as:  {output_dir}/{model}/{audio_stem}/{stem}.wav
    model_dir = output_dir / model / audio.stem
    no_vocals = model_dir / f"{NO_VOCALS_STEM}.wav"
    vocals = model_dir / f"{VOCALS_STEM}.wav"

    if not no_vocals.exists():
        raise RuntimeError(
            f"Demucs finished but {no_vocals} was not found. "
            "The model may have failed to produce a no_vocals stem."
        )

    dest_no_vocals = audio.with_name(f"{audio.stem}_no_vocals{wav_suffix(no_vocals)}")
    shutil.move(str(no_vocals), str(dest_no_vocals))

    dest_vocals: Path | None = None
    if keep_vocals and vocals.exists():
        dest_vocals = audio.with_name(f"{audio.stem}_vocals{wav_suffix(vocals)}")
        shutil.move(str(vocals), str(dest_vocals))

    if model_dir.exists():
        shutil.rmtree(model_dir, ignore_errors=True)

    print(f"\nDone. Instrumental (no vocals):\n  {dest_no_vocals}")
    if dest_vocals:
        print(f"Isolated vocals:\n  {dest_vocals}")
    return dest_no_vocals


def wav_suffix(path: Path) -> str:
    """Demucs writes .wav; mirror whatever extension it actually used."""
    return path.suffix if path.suffix.lower() in (".wav", ".flac", ".mp3") else ".wav"


def resolve_uta_net_video_id(song_url: str) -> str:
    m = re.search(r"/song/(\d+)", song_url)
    if not m:
        raise ValueError("Expected a Uta-Net song URL like https://www.uta-net.com/song/12345/")
    song_id = m.group(1)
    html = http_get_html(f"{JINA_PREFIX}https://www.uta-net.com/movie/{song_id}/")
    m2 = YOUTUBE_EMBED_RE.search(html)
    if not m2:
        raise RuntimeError("No embeddable YouTube video was found on that Uta-Net movie page.")
    return m2.group(1)


def youtube_id_from_url(url: str) -> str:
    m = re.search(
        r"(?:youtube\.com/watch\?.*?v=|youtu\.be/|youtube\.com/embed/|youtube-nocookie\.com/embed/)"
        r"([A-Za-z0-9_-]{11})",
        url,
    )
    if not m:
        raise ValueError("Not a YouTube video URL (need a watch?v=…, youtu.be/…, or …/embed/… link).")
    return m.group(1)


def download_youtube_audio(video_url: str, out_dir: Path) -> Path:
    """Download best-audio of a YouTube video and extract it to m4a (needs ffmpeg)."""
    out_dir.mkdir(parents=True, exist_ok=True)
    ytdlp = shutil.which("yt-dlp") or "uvx --from yt-dlp yt-dlp"
    out_pattern = "song.%(ext)s"
    cmd = shlex.split(ytdlp) + [
        "--no-playlist",
        "-f",
        "bestaudio/best",
        "-x",
        "--audio-format",
        "m4a",
        "-o",
        str(out_dir / out_pattern),
        video_url,
    ]
    print(f"Downloading audio from {video_url} …")
    proc = subprocess.run(cmd, check=False)
    if proc.returncode != 0:
        raise RuntimeError("yt-dlp failed to download the audio (network / region / copyright).")

    produced = sorted(out_dir.glob("song.m4a"), key=lambda p: p.stat().st_mtime)
    # yt-dlp may write "song.m4a.part" then finalise; pick the finished one.
    if not produced:
        produced = [p for p in out_dir.glob("song.*") if p.suffix.lower() in (".m4a", ".mp3", ".wav")]
    if not produced:
        raise RuntimeError("yt-dlp finished but no audio file was produced.")
    return produced[-1]


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Remove vocals with Demucs → karaoke backing track."
    )
    parser.add_argument(
        "audio",
        nargs="?",
        type=Path,
        help="Input audio file (mp3/wav/m4a/flac …). Omit to use --youtube / --uta-net.",
    )
    parser.add_argument(
        "--youtube",
        help="A YouTube video URL to download and separate (e.g. the id the app resolves from a Uta-Net page).",
    )
    parser.add_argument(
        "--uta-net",
        help="A Uta-Net song page URL; resolves its embedded YouTube video, downloads it, then separates.",
    )
    parser.add_argument(
        "-o",
        "--output",
        type=Path,
        default=None,
        help="Where to write the result. Defaults to the folder of the input / current directory.",
    )
    parser.add_argument(
        "-m",
        "--model",
        default="htdemucs",
        help="Demucs model (htdemucs, htdemucs_ft, hts …). Default: htdemucs.",
    )
    parser.add_argument(
        "--keep-vocals",
        action="store_true",
        help="Also save the isolated vocals_stem (.wav).",
    )
    parser.add_argument(
        "-d",
        "--device",
        default=None,
        help="Force a device: cpu or cuda. Default: let Demucs auto-detect.",
    )
    parser.add_argument(
        "--check",
        action="store_true",
        help="Only verify demucs/ffmpeg/yt-dlp are available; do not separate.",
    )
    args = parser.parse_args()

    ok, messages = check_environment()
    for msg in messages:
        print(msg)

    if args.check:
        print("\nenvironment check:", "OK" if ok else "NOT READY")
        return 0 if ok else 1

    if not ok:
        print("\nCannot run. Fix the issues above first.", file=sys.stderr)
        return 1

    if args.audio:
        audio = args.audio.resolve()
        if not audio.exists():
            print(f"audio file not found: {audio}", file=sys.stderr)
            return 1
        output_dir = (args.output or audio.parent).resolve()
    elif args.uta_net or args.youtube:
        output_dir = (args.output or Path.cwd()).resolve()
        try:
            if args.uta_net:
                video_id = resolve_uta_net_video_id(args.uta_net)
                print(f"Resolved Uta-Net video: https://www.youtube.com/watch?v={video_id}")
            else:
                video_id = youtube_id_from_url(args.youtube)
            audio = download_youtube_audio(f"https://www.youtube.com/watch?v={video_id}", output_dir)
        except (ValueError, RuntimeError) as exc:
            print(f"error: {exc}", file=sys.stderr)
            return 1
    else:
        parser.error("provide an audio file, --youtube, or --uta-net (or use --check)")

    try:
        run_separation(audio, output_dir, args.model, args.keep_vocals, args.device)
    except RuntimeError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
