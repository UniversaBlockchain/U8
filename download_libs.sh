#!/usr/bin/env bash

platform=$1

download_path=ext/$platform

mkdir -p $download_path
cd $download_path

download_file() {
    wget https://cxxlibs.universa.io/files/$platform/$1 -O $1
}

unpack_archive() {
    7zr -y x $1
}

download_archive() {
    download_file $1.sha1

    if [ ! -f $1 ]; then
        download_file $1
        unpack_archive $1
    fi

    if ! sha1sum --status -c $1.sha1; then
        download_file $1
        unpack_archive $1
    fi
}

if [ "$platform" = "linux" ]; then
    download_archive libv8.7z
else
    echo "FATAL_ERROR: unknown platform '$platform'"
    exit 1
fi

echo "download_libs.sh done!"
