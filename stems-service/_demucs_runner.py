"""Run demucs.separate, but write audio through soundfile instead of torchcodec.

torchcodec is version-locked to a specific FFmpeg DLL set, which breaks on hosts
whose ffmpeg differs from the wheel (e.g. Windows with a newer ffmpeg, or any
container that didn't happen to match). soundfile bundles libsndfile and is
version-independent, so routing the save through it makes generation
deterministic everywhere.

The stem service runs this file as:
    <python> _demucs_runner.py --two-stems vocals -n htdemucs -o <out> <audio>
so the monkeypatch applies only to the Demucs subprocess, never to the server.
"""

import numpy as np
import soundfile as sf
import torchaudio


def _soundfile_save(*args, **kwargs):
    # torchaudio.save(filepath, tensor, sample_rate) — and the same positionally.
    path = args[0]
    wav = args[1]
    sr = args[2] if len(args) > 2 else kwargs.get("sample_rate", 48000)
    arr = wav.numpy() if hasattr(wav, "numpy") else wav
    # torchaudio gives (channels, frames); soundfile wants (frames, channels).
    if arr.ndim == 2 and arr.shape[0] <= 2:
        arr = arr.T
    sf.write(str(path), arr, int(sr), subtype="PCM_16")


torchaudio.save = _soundfile_save

from demucs.separate import main  # noqa: E402  (after the monkeypatch)

main()
