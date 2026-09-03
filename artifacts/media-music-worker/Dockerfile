FROM nvidia/cuda:12.1.1-cudnn8-runtime-ubuntu22.04

ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    ACESTEP_ROOT=/opt/ACE-Step \
    ACESTEP_CHECKPOINT_DIR=/models/ace-step

RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates \
      ffmpeg \
      git \
      python3.10 \
      python3-pip \
      python3.10-dev \
      build-essential \
    && rm -rf /var/lib/apt/lists/*

RUN git clone https://github.com/ace-step/ACE-Step.git ${ACESTEP_ROOT} \
    && cd ${ACESTEP_ROOT} \
    && git checkout 1bee4c9f5b43e30995f8d4d33b3919197ce1bd68 \
    && python3.10 -m pip install --no-cache-dir -U pip setuptools wheel \
    && python3.10 -m pip install --no-cache-dir -r requirements.txt \
    && python3.10 -m pip install --no-cache-dir -e .

WORKDIR /app
COPY artifacts/media-music-worker/requirements.txt /app/requirements.txt
RUN python3.10 -m pip install --no-cache-dir -r /app/requirements.txt
COPY artifacts/media-music-worker/app /app/app
COPY artifacts/media-music-worker/entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh && mkdir -p ${ACESTEP_CHECKPOINT_DIR}

EXPOSE 8000
ENTRYPOINT ["/app/entrypoint.sh"]
