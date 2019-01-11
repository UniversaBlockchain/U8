cmake_minimum_required(VERSION 3.12)
project(u8)

# v8 lib
# g++ -I/usr/local/Cellar/v8/7.1.302.28 -I/usr/local/Cellar/v8/7.1.302.28/include -Gs samples/hello-world.cc -o hello_world -L/usr/local/Cellar/v8/7.1.302.28 -lv8 -lv8_libplatform -lv8_libbase -Lout.gn/x64.release.sample/obj/ -pthread -std=c++0x -O2

set(CMAKE_CXX_STANDARD 17)
set(platform "macos_v8")

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
elseif (${platform} STREQUAL macos_v8)
    set(libtype .dylib)
    set(v8_root ~/dev/v8)
    target_include_directories(u8 PUBLIC ${v8_root}/include)
    target_link_directories(u8 PUBLIC ${v8_root}/out.gn/x64.release.sample)
    target_link_libraries(u8 PUBLIC v8 v8_libplatform v8_libbase)
else ()
    message(FATAL_ERROR "unknown platform ${platform}")
endif ()


