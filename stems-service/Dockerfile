FROM python:3.11-slim

# Demucs and yt-dlp both need ffmpeg.
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/*

ENV PYTHONUNBUFFERED=1

WORKDIR /srv/stems

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app.py _demucs_runner.py .

# The cache volume persists generated stems across container restarts.
VOLUME ["/data"]
ENV STEMS_CACHE_DIR=/data

EXPOSE 8000
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000"]
