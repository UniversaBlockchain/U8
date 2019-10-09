#!/bin/bash
./stop_ubots.sh
rm -rf build-ubot
cmake -S . -B build-ubot
cmake --build build-ubot --target u8 -- -j
