cmake_minimum_required(VERSION 3.12)
project(u8)

# v8 lib
# g++ -I/usr/local/Cellar/v8/7.1.302.28 -I/usr/local/Cellar/v8/7.1.302.28/include -Gs samples/hello-world.cc -o hello_world -L/usr/local/Cellar/v8/7.1.302.28 -lv8 -lv8_libplatform -lv8_libbase -Lout.gn/x64.release.sample/obj/ -pthread -std=c++0x -O2

set(CMAKE_CXX_STANDARD 17)

if (${CMAKE_SYSTEM_NAME} MATCHES "Darwin")
    set(MACOSX true)
endif ()

if (MACOSX)
    set(platform "macos_v8_monolith")
elseif (UNIX)
    set(platform "linux_v8")
elseif (WIN32)
    set(platform "win_v8")
endif ()

add_executable(u8 main.cpp Scripter.cpp Scripter.h tools.h basic_builtins.cpp basic_builtins.h tools.cpp AsyncSleep.cpp
        AsyncSleep.h Logging.cpp Logging.h JsPromise.cpp JsPromise.h)

# Macos brew configuration
if (${platform} STREQUAL macos_brew)
    set(libtype .dylib)
    set(v8_root /usr/local)
    set(v8_lib_root /usr/local/lib)
    target_include_directories(u8 PUBLIC ${v8_root}/include)
    target_link_directories(u8 PUBLIC ${v8_root}/lib)
    target_link_libraries(u8 PUBLIC v8 v8_libplatform v8_libbase)
elseif (${platform} STREQUAL macos_v8_monolith)
    target_include_directories(u8 PUBLIC ext/include)
    target_link_directories(u8 PUBLIC ext/lib/macosx)
    target_link_libraries(u8 PUBLIC v8_monolith)
elseif (${platform} STREQUAL linux_v8)
    add_custom_command(OUTPUT ../download_libs.stamp WORKING_DIRECTORY .. COMMAND sh download_libs.sh linux > download_libs.stamp)
    add_custom_target(u8libs ALL DEPENDS download_libs.stamp)
    add_dependencies(u8 u8libs)
    set(v8_root download_libs/libv8/linux)
    target_include_directories(u8 PUBLIC ${v8_root}/include)
    target_link_directories(u8 PUBLIC ${v8_root}/bin)
    target_link_libraries(u8 PUBLIC v8 v8_libplatform v8_libbase pthread)
else ()
    message(FATAL_ERROR "unknown platform ${platform}")
endif ()


