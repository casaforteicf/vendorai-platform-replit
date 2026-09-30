FROM ubuntu:24.04

ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates curl jq git unzip tar gzip xz-utils openssl \
    libicu74 libkrb5-3 zlib1g libssl3 \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /actions-runner

RUN set -eux; \
    tag="$(curl -fsSL https://api.github.com/repos/actions/runner/releases/latest | jq -r .tag_name)"; \
    version="${tag#v}"; \
    arch="x64"; \
    curl -fsSL -o actions-runner.tar.gz \
      "https://github.com/actions/runner/releases/download/${tag}/actions-runner-linux-${arch}-${version}.tar.gz"; \
    tar xzf actions-runner.tar.gz; \
    rm actions-runner.tar.gz; \
    ./bin/installdependencies.sh

COPY infra/github-runner/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENV RUNNER_ALLOW_RUNASROOT=1
ENTRYPOINT ["/entrypoint.sh"]
