cmake_minimum_required(VERSION 3.12)
project(u8)

# v8 lib
# g++ -I/usr/local/Cellar/v8/7.1.302.28 -I/usr/local/Cellar/v8/7.1.302.28/include -Gs samples/hello-world.cc -o hello_world -L/usr/local/Cellar/v8/7.1.302.28 -lv8 -lv8_libplatform -lv8_libbase -Lout.gn/x64.release.sample/obj/ -pthread -std=c++0x -O2

set(CMAKE_CXX_STANDARD 17)
set(v8_root "/usr/local/Cellar/v8/7.1.302.28")
message("--!! ${v8_root} == ")


add_executable(u8 main.cpp ScriptEnvironment.cpp ScriptEnvironment.h tools.h basic_builtins.cpp basic_builtins.h tools.cpp)

foreach (l v8 v8_libplatform v8_libbase)
    add_library(${l} SHARED IMPORTED)
    set_target_properties(${l} PROPERTIES IMPORTED_LOCATION ${v8_root}/lib/lib${l}.dylib)
    target_link_libraries(u8 PUBLIC ${l})
endforeach (l)

target_include_directories(u8 PUBLIC v8root ${v8_root}/include)

file(GLOB files "jslib/*.js")
foreach (file ${files})
    get_filename_component(fn ${file} NAME)
    configure_file(jslib/${fn} jslib/${fn} COPYONLY)
endforeach (file)