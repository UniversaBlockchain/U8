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

sha1result=1
check_sha1sum() {
    if [ "$platform" = "macos" ]; then
        shasum --status -c $1
    else
        sha1sum --status -c $1
    fi
    sha1result=$?
}

download_archive() {
    download_file $1.sha1

    if [ ! -f $1 ]; then
        download_file $1
        unpack_archive $1
    fi

    check_sha1sum $1.sha1
    if [ $sha1result -ne 0 ]; then
        download_file $1
        unpack_archive $1
    fi
}

if [ "$platform" = "linux" ]; then
    download_archive libv8.7z
    download_archive libtomcrypt.7z
elif [ "$platform" = "macos" ]; then
    download_archive libv8.7z
    download_archive libtomcrypt.7z
else
    echo "FATAL_ERROR: unknown platform '$platform'"
    exit 1
fi

echo "download_libs.sh done!"
