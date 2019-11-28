# This image is used for building U8 and other Clang-dependent applications.
# To build:
#   docker build --tag universa/debian-clang:latest --compress -f docker/debian-clang/Dockerfile .
#   docker push universa/debian-clang
FROM debian:buster-slim

RUN echo \
    && mkdir -p /usr/share/man/man1 \
    && apt-get update --quiet=2 --yes \
    && apt-get install --quiet=2 --yes --no-install-recommends --fix-missing apt-transport-https ca-certificates \
    && echo "deb https://deb.debian.org/debian buster-backports main" | tee /etc/apt/sources.list.d/buster-backports.list \
    && apt-get update --quiet=2 --yes \
    && apt-get install --quiet=2 --yes -t buster-backports llvm-8 clang-8 cmake gcc g++ \
    && apt-get clean --quiet=2 --yes && apt-get autoremove --quiet=2 --yes && rm -rf /var/lib/apt/lists/*

WORKDIR /
ENTRYPOINT ["/bin/bash"]
