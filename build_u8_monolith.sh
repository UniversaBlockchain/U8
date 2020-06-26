export CC=/usr/bin/clang-8
export CXX=/usr/bin/clang++-8

#cmake -DCMAKE_BUILD_TYPE=Release -G "CodeBlocks - Unix Makefiles" -B./cmake-build-monolith-release .
#cmake --build ./cmake-build-monolith-release/ --target clean -- -j
#cmake --build ./cmake-build-monolith-release --target all -- -j

#zip -r ./cmake-build-monolith-release/u8core.u8m ./jslib ./u8scripts ./manifest.yaml
#scp flintemerald@sergeych.net:u8.ukeys/ModuleKey.private.unikey /tmp/
#./cmake-build-monolith-release/u8 --signmodule ./cmake-build-monolith-release/u8core.u8m /tmp/ModuleKey.private.unikey
#shred -zvu /tmp/ModuleKey.private.unikey
#xxd -i ./cmake-build-monolith-release/u8core.u8m ./u8core.u8m.c

cmake -DCMAKE_BUILD_TYPE=Release -G "CodeBlocks - Unix Makefiles" -B./cmake-build-monolith-release . -DU8_BUILD_MONOLITH=True
cmake --build ./cmake-build-monolith-release/ --target clean -- -j
cmake --build ./cmake-build-monolith-release --target all -- -j

upx -9 ./cmake-build-monolith-release/u8
upx -9 ./cmake-build-monolith-release/u8_tests
