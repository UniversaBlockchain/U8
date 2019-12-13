# To build:
#   docker build --tag universa/u8:latest --compress -f docker/u8/Dockerfile .
#   docker push universa/u8

#
# Multi-stage build
#

FROM universa/debian-clang AS build_clang

COPY / /code/
WORKDIR /code

# wget and p7zip are used by the dependencies downloader.
# perl is needed for shasum.
RUN echo \
    && apt-get update --quiet=2 --yes \
    && apt-get install --quiet=2 --yes --no-install-recommends wget p7zip perl \
    && export CC=/usr/bin/clang-8 \
    && export CXX=/usr/bin/clang++-8 \
    && cmake -DCMAKE_BUILD_TYPE=Release -G "CodeBlocks - Unix Makefiles" -B./cmake-build-release . \
    && cmake --build ./cmake-build-release --target clean -- -j \
    && cmake --build ./cmake-build-release --target all -- -j \
    && apt-get remove --quiet=2 --yes --purge wget p7zip perl \
    && apt-get clean --quiet=2 --yes && apt-get autoremove --quiet=2 --yes && rm -rf /var/lib/apt/lists/*


## Copy only the needed (just built) files
FROM debian:buster-slim

COPY --from=build_clang /code/cmake-build-release /code/cmake-build-release
COPY --from=build_clang /code/ext/linux/libpq /code/ext/linux/libpq
COPY --from=build_clang /code/ext/linux/libssl /code/ext/linux/libssl
COPY --from=build_clang /code/ext/linux/libtomcrypt /code/ext/linux/libtomcrypt
COPY --from=build_clang /code/ext/linux/libuv /code/ext/linux/libuv
COPY --from=build_clang /code/ext/linux/libv8 /code/ext/linux/libv8
COPY /jslib /code/jslib
COPY /u8scripts /code/u8scripts

RUN echo \
    && mkdir -p /u8 \
    && ln -s /code/cmake-build-release/u8 /u8/u8 \
    && ln -s /code/jslib /u8/jslib \
    && apt-get update --quiet=2 --yes \
    && apt-get install --quiet=2 --yes --no-install-recommends libcurl4 \
    && apt-get clean --quiet=2 --yes && apt-get autoremove --quiet=2 --yes && rm -rf /var/lib/apt/lists/*

WORKDIR /code/cmake-build-release
ENTRYPOINT ["./u8"]
