cmake_minimum_required(VERSION 3.12)
project(u8)

add_definitions(-DGMP_DESC)
add_definitions(-DMG_HIDE_SERVER_INFO)
add_definitions(-DMG_ENABLE_IPV6)
add_definitions(-DMG_ENABLE_SSL)
add_definitions(-DMG_ENABLE_DNS_SERVER)
add_definitions(-DV8_COMPRESS_POINTERS)
if (NOT U8_BUILD_MONOLITH)
    add_definitions(-DU8_BUILD_DEVELOPMENT)
endif()

# v8 lib
# g++ -I/usr/local/Cellar/v8/7.1.302.28 -I/usr/local/Cellar/v8/7.1.302.28/include -Gs tests/hello-world.cc -o hello_world -L/usr/local/Cellar/v8/7.1.302.28 -lv8 -lv8_libplatform -lv8_libbase -Lout.gn/x64.release.sample/obj/ -pthread -std=c++0x -O2

set(CMAKE_CXX_STANDARD 17)

set(CMAKE_CXX_FLAGS "${CMAKE_CXX_FLAGS} -std=c++17 -Wno-register -Wno-macro-redefined")

#set(CMAKE_CXX_FLAGS_DEBUG "${CMAKE_CXX_FLAGS_DEBUG} -fsanitize=address -fno-omit-frame-pointer")
set(CMAKE_CXX_FLAGS_DEBUG "${CMAKE_CXX_FLAGS_DEBUG} -O0 -g")

set(CMAKE_CXX_FLAGS_RELEASE "${CMAKE_CXX_FLAGS_RELEASE} -O3 -g0")


if (${CMAKE_SYSTEM_NAME} MATCHES "Darwin")
    set(MACOSX true)
    add_compile_definitions(__PLATFORM_DARWIN)
endif ()

if (MACOSX)
    set(platform "macos")
elseif (UNIX)
    if (U8_BUILD_MONOLITH)
        set(platform "linux_monolith")
    else ()
        set(platform "linux")
    endif ()
elseif (WIN32)
    set(platform "win_v8")
endif ()

macro(find_npm)
    find_program(NPM_EXECUTABLE "npm")
endmacro()

find_npm()

if (NPM_EXECUTABLE)
    add_subdirectory(doc/docjs)
    set_target_properties(docjs PROPERTIES FOLDER "Tools")
endif()

file(GLOB LIBRARY_SRC
    AsyncIO/*.h AsyncIO/*.cpp
    AsyncIO/TLS/*.h AsyncIO/TLS/*.c
    db/*.h db/*.cpp
    crypto/*.h crypto/*.cpp
    js_bindings/*.h js_bindings/*.cpp
    modules/*.h modules/*.cpp
    network/*.h network/*.cpp
    network/mongoose/*.h network/mongoose/*.c network/mongoose/*.cpp
    serialization/*.h serialization/*.cpp
    tools/*.h tools/*.cpp
    types/*.h types/*.cpp
    types/complex/*.h types/complex/*.cpp
    universa_core/*.h universa_core/*.cpp
)
add_custom_target(cxxlibs ALL DEPENDS download_libs.stamp)
add_library(u8_lib STATIC ${LIBRARY_SRC})
add_dependencies(u8_lib cxxlibs)

file(GLOB TESTS_SRC
    test/*.h test/*.cpp
    u8core.u8m.h u8core.u8m.c
)

file(GLOB MAIN_SRC main.cpp u8core.u8m.h u8core.u8m.c)

add_executable(u8_tests ${TESTS_SRC})
add_executable(u8 ${MAIN_SRC})

target_link_libraries(u8 PRIVATE u8_lib)
target_link_libraries(u8_tests PRIVATE u8_lib)

message("platform: ${platform}")

# Macos brew configuration
if (${platform} STREQUAL macos)
    set(libtype .dylib)

    if(${BREW_FORMULAE})
        message(skip download_libs.sh)
    else ()
        add_custom_command(OUTPUT ../download_libs.stamp WORKING_DIRECTORY .. COMMAND sh download_libs.sh ${platform} > download_libs.stamp)
    endif()

    foreach (l libtomcrypt libuv libpq libssl libyaml)
        message( ext/${platform}/${l}/include)
        message( ext/${platform}/${l}/include)
        target_include_directories(u8_lib PUBLIC ext/${platform}/${l}/include)
        target_link_directories(u8_lib PUBLIC ext/${platform}/${l}/lib)
    endforeach (l)

    if(${BREW_FORMULAE})
#        execute_process(COMMAND brew --prefix libzip OUTPUT_VARIABLE BREW_PREFIX1 OUTPUT_STRIP_TRAILING_WHITESPACE)
        target_include_directories(u8_lib PUBLIC /usr/local/opt/libzip/include)
        target_link_directories(u8_lib PUBLIC /usr/local/opt/libzip/lib)

#        execute_process(COMMAND brew --prefix v8 OUTPUT_VARIABLE BREW_PREFIX2 OUTPUT_STRIP_TRAILING_WHITESPACE)
        target_include_directories(u8_lib PUBLIC /usr/local/opt/v8/libexec/include)
        target_link_directories(u8_lib PUBLIC /usr/local/opt/v8/libexec)
    else ()
        foreach (l libv8 libzip)
            message( ext/${platform}/${l}/include)
            message( ext/${platform}/${l}/include)
            target_include_directories(u8_lib PUBLIC ext/${platform}/${l}/include)
            target_link_directories(u8_lib PUBLIC ext/${platform}/${l}/lib)
        endforeach (l)
    endif()

    target_link_libraries(u8 PUBLIC v8 v8_libplatform v8_libbase tomcrypt gmp uv pq ssl crypto zip yaml-cpp)
    target_link_libraries(u8_tests PUBLIC v8 v8_libplatform v8_libbase tomcrypt gmp uv pq ssl crypto zip yaml-cpp)
elseif (${platform} STREQUAL macos_v8_monolith)
    foreach (l v8 tomcrypt gmp)
        target_include_directories(u8_lib PUBLIC ext/macosx/${l}/include)
        target_link_directories(u8_lib PUBLIC ext/macosx/${l}/lib)
    endforeach (l)
    target_link_libraries(u8 PUBLIC v8_monolith tomcrypt)
elseif (${platform} STREQUAL linux)
    add_custom_command(OUTPUT ../download_libs.stamp WORKING_DIRECTORY .. COMMAND sh download_libs.sh ${platform} > download_libs.stamp)
    foreach (l libv8 libtomcrypt libuv libpq libssl libzip libyaml)
        target_include_directories(u8_lib PUBLIC ext/${platform}/${l}/include)
        target_link_directories(u8_lib PUBLIC ext/${platform}/${l}/lib)
    endforeach (l)
    target_link_libraries(u8 PUBLIC v8 v8_libplatform v8_libbase tomcrypt gmp uv pq pthread ssl crypto zip yaml-cpp stdc++fs)
    target_link_libraries(u8_tests PUBLIC v8 v8_libplatform v8_libbase tomcrypt gmp uv pq pthread ssl crypto zip yaml-cpp stdc++fs)
elseif (${platform} STREQUAL linux_monolith)
    add_custom_command(OUTPUT ../download_libs.stamp WORKING_DIRECTORY .. COMMAND sh download_libs.sh linux > download_libs.stamp)
    foreach (l libv8 libtomcrypt libuv libpq libssl libzip libyaml)
        target_include_directories(u8_lib PUBLIC ext/linux/${l}/include)
        target_link_directories(u8_lib PUBLIC ext/linux/${l}/lib)
    endforeach (l)
    target_link_libraries(u8 PUBLIC v8_monolith tomcrypt gmp uv pq pthread zip.a ssl.a crypto.a z.a dl yaml-cpp.a stdc++fs -static-libgcc -static-libstdc++)
    target_link_libraries(u8_tests PUBLIC v8_monolith tomcrypt gmp uv pq pthread zip.a ssl.a crypto.a z.a dl yaml-cpp.a stdc++fs -static-libgcc -static-libstdc++)
else ()
    message(FATAL_ERROR "unknown platform ${platform}")
endif ()

install(TARGETS u8
        RUNTIME DESTINATION bin)