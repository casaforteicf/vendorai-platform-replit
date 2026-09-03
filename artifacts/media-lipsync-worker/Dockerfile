FROM nvidia/cuda:11.8.0-cudnn8-runtime-ubuntu22.04

ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONUNBUFFERED=1 \
    MUSETALK_ROOT=/opt/MuseTalk \
    FFMPEG_PATH=/usr/bin

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3.10 python3-pip python3.10-dev git ffmpeg build-essential wget ca-certificates \
    && rm -rf /var/lib/apt/lists/*

RUN ln -sf /usr/bin/python3.10 /usr/local/bin/python \
    && python -m pip install --upgrade pip setuptools wheel

WORKDIR /opt
RUN git clone --depth 1 https://github.com/TMElyralab/MuseTalk.git /opt/MuseTalk

WORKDIR /opt/MuseTalk
RUN python -m pip install torch==2.0.1 torchvision==0.15.2 torchaudio==2.0.2 --index-url https://download.pytorch.org/whl/cu118 \
    && python -m pip install -r requirements.txt \
    && python -m pip install --no-cache-dir -U openmim \
    && mim install mmengine \
    && mim install "mmcv==2.0.1" \
    && mim install "mmdet==3.1.0" \
    && mim install "mmpose==1.1.0"

# Os pesos oficiais do MuseTalk 1.5 e componentes auxiliares devem ser
# disponibilizados em /opt/MuseTalk/models na imagem/runtime GPU.

COPY artifacts/media-lipsync-worker/requirements.txt /tmp/vendorai-lipsync-requirements.txt
RUN python -m pip install -r /tmp/vendorai-lipsync-requirements.txt

COPY artifacts/media-lipsync-worker/app /srv/vendorai-lipsync/app
WORKDIR /srv/vendorai-lipsync

EXPOSE 8000
CMD ["python", "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
