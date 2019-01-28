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

file(GLOB LIBRARY_SRC
    AsyncIO/*.h AsyncIO/*.cpp
    crypto/*.h crypto/*.cpp
    js_bindings/*.h js_bindings/*.cpp
    serialization/*.h serialization/*.cpp
    tools/*.h tools/*.cpp
    types/*.h types/*.cpp
)
add_library(u8_lib STATIC ${LIBRARY_SRC})

file(GLOB TESTS_SRC
    test/*.h test/*.cpp
)

add_executable(u8_tests ${TESTS_SRC})
add_executable(u8 main.cpp)

target_link_libraries(u8 PRIVATE u8_lib)
target_link_libraries(u8_tests PRIVATE u8_lib)

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
        target_include_directories(u8_lib PUBLIC ext/${platform}/${l}/include)
        target_link_directories(u8_lib PUBLIC ext/${platform}/${l}/lib)
    endforeach (l)
    target_link_libraries(u8 PUBLIC v8 v8_libplatform v8_libbase tomcrypt gmp uv)
elseif (${platform} STREQUAL macos_v8_monolith)
    foreach (l v8 tomcrypt gmp)
        target_include_directories(u8_lib PUBLIC ext/macosx/${l}/include)
        target_link_directories(u8_lib PUBLIC ext/macosx/${l}/lib)
    endforeach (l)
    target_link_libraries(u8 PUBLIC v8_monolith tomcrypt)
elseif (${platform} STREQUAL linux)
    add_custom_command(OUTPUT ../download_libs.stamp WORKING_DIRECTORY .. COMMAND sh download_libs.sh ${platform} > download_libs.stamp)
    add_custom_target(u8libs ALL DEPENDS download_libs.stamp)
    add_dependencies(u8 u8libs)
    foreach (l libv8 libtomcrypt libuv)
        target_include_directories(u8_lib PUBLIC ext/${platform}/${l}/include)
        target_link_directories(u8_lib PUBLIC ext/${platform}/${l}/lib)
    endforeach (l)
    target_link_libraries(u8 PUBLIC v8 v8_libplatform v8_libbase tomcrypt gmp uv pthread)
    target_link_libraries(u8_tests PUBLIC pthread)
else ()
    message(FATAL_ERROR "unknown platform ${platform}")
endif ()


