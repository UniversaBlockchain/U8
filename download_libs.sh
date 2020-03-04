#!/usr/bin/env bash

platform=$1

if [ -z $platform ]
then
    echo "platform is empty, autodetecting"
    unameOut="$(uname -s)"
    case "${unameOut}" in
        Linux*)     platform=linux;;
        Darwin*)    platform=macos;;
        *)          platform="UNKNOWN:${unameOut}"
    esac
    echo "platform autodetected as $platform"
fi

download_path=ext/$platform

mkdir -p $download_path
cd $download_path

download_file() {
    wget https://cxxlibs.universablockchain.com/files/$platform/$1 -O $1
}

unpack_archive() {
    7zr -y x $1
}

download_archive() {
    archivename=$platform-$1

    download_file $archivename.sha1

    if [ ! -f $archivename ]; then
        download_file $archivename
        unpack_archive $archivename
    fi

    if ! shasum --status -c $archivename.sha1; then
        download_file $archivename
        unpack_archive $archivename
    fi
}

if [ "$platform" = "linux" ]; then
    download_archive libv8-v8.0.426.16.7z
    download_archive libtomcrypt.7z
    download_archive libuv.7z
    download_archive libpq.7z
    download_archive libssl.7z
    download_archive libzip-v1.6.1.7z
elif [ "$platform" = "macos" ]; then
    download_archive libv8-v7.4.288.28.7z
    download_archive libtomcrypt.7z
    download_archive libuv.7z
    download_archive libpq.7z
    download_archive libssl.7z
else
    echo "FATAL_ERROR: unknown platform '$platform'"
    exit 1
fi

echo "download_libs.sh done!"
