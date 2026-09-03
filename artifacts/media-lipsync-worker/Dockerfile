FROM nvidia/cuda:11.8.0-cudnn8-runtime-ubuntu22.04

ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    MUSETALK_DIR=/opt/MuseTalk

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3.10 python3-pip python3-dev git ffmpeg curl build-essential \
    libgl1 libglib2.0-0 libsm6 libxext6 libxrender1 \
    && rm -rf /var/lib/apt/lists/*

RUN python3 -m pip install --upgrade pip setuptools wheel

WORKDIR /opt
RUN git clone https://github.com/TMElyralab/MuseTalk.git MuseTalk \
    && cd MuseTalk \
    && git checkout 0a89dec45a0192b824e3cf4daf96c239440c5ed8

RUN python3 -m pip install \
      torch==2.0.1 torchvision==0.15.2 torchaudio==2.0.2 \
      --index-url https://download.pytorch.org/whl/cu118
RUN python3 -m pip install -r /opt/MuseTalk/requirements.txt
RUN python3 -m pip install --no-cache-dir -U openmim \
    && mim install mmengine \
    && mim install "mmcv==2.0.1" \
    && mim install "mmdet==3.1.0" \
    && mim install "mmpose==1.1.0"

WORKDIR /srv/vendorai-lipsync
COPY artifacts/media-lipsync-worker/requirements.txt ./requirements.txt
RUN python3 -m pip install -r requirements.txt
COPY artifacts/media-lipsync-worker/app ./app
COPY artifacts/media-lipsync-worker/entrypoint.sh ./entrypoint.sh
RUN chmod +x ./entrypoint.sh

EXPOSE 8000
ENTRYPOINT ["./entrypoint.sh"]
