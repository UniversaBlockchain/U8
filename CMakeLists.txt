cmake_minimum_required(VERSION 3.12)
project(u8)

add_definitions(-DGMP_DESC)

# v8 lib
# g++ -I/usr/local/Cellar/v8/7.1.302.28 -I/usr/local/Cellar/v8/7.1.302.28/include -Gs tests/hello-world.cc -o hello_world -L/usr/local/Cellar/v8/7.1.302.28 -lv8 -lv8_libplatform -lv8_libbase -Lout.gn/x64.release.sample/obj/ -pthread -std=c++0x -O2

set(CMAKE_CXX_STANDARD 17)

set(CMAKE_CXX_FLAGS_DEBUG -Wno-register)

if (${CMAKE_SYSTEM_NAME} MATCHES "Darwin")
    set(MACOSX true)
endif ()

if (MACOSX)
    set(platform "macos")
elseif (UNIX)
    set(platform "linux")
elseif (WIN32)
    set(platform "win_v8")
endif ()

add_executable(u8 main.cpp Scripter.cpp Scripter.h tools.h basic_builtins.cpp basic_builtins.h tools.cpp AsyncSleep.cpp
        AsyncSleep.h Logging.cpp Logging.h JsPromise.cpp JsPromise.h PublicKey.cpp PrivateKey.cpp base64.cpp cryptoCommon.h
        cryptoCommon.cpp AsyncIO.h AsyncIO.cpp AsyncIOTests.cpp AsyncIOTests.h HashId.cpp HashId.h cryptoTests.h cryptoTests.cpp)

message("platform: ${platform}")

# Macos brew configuration
if (${platform} STREQUAL macos)
    add_custom_command(OUTPUT ../download_libs.stamp WORKING_DIRECTORY .. COMMAND sh download_libs.sh ${platform} > download_libs.stamp)
    add_custom_target(u8libs ALL DEPENDS download_libs.stamp)
    add_dependencies(u8 u8libs)
    set(libtype .dylib)
    foreach (l libv8 libtomcrypt libuv)
        message( ext/${platform}/${l}/include)
        message( ext/${platform}/${l}/include)
        target_include_directories(u8 PUBLIC ext/${platform}/${l}/include)
        target_link_directories(u8 PUBLIC ext/${platform}/${l}/lib)
    endforeach (l)
    target_link_libraries(u8 PUBLIC v8 v8_libplatform v8_libbase tomcrypt gmp uv)
elseif (${platform} STREQUAL macos_v8_monolith)
    foreach (l v8 tomcrypt gmp)
        target_include_directories(u8 PUBLIC ext/macosx/${l}/include)
        target_link_directories(u8 PUBLIC ext/macosx/${l}/lib)
    endforeach (l)
    target_link_libraries(u8 PUBLIC v8_monolith tomcrypt)
elseif (${platform} STREQUAL linux)
    add_custom_command(OUTPUT ../download_libs.stamp WORKING_DIRECTORY .. COMMAND sh download_libs.sh ${platform} > download_libs.stamp)
    add_custom_target(u8libs ALL DEPENDS download_libs.stamp)
    add_dependencies(u8 u8libs)
    foreach (l libv8 libtomcrypt libuv)
        target_include_directories(u8 PUBLIC ext/${platform}/${l}/include)
        target_link_directories(u8 PUBLIC ext/${platform}/${l}/lib)
    endforeach (l)
    target_link_libraries(u8 PUBLIC v8 v8_libplatform v8_libbase tomcrypt gmp uv pthread)
else ()
    message(FATAL_ERROR "unknown platform ${platform}")
endif ()


