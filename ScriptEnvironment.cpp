//
// Created by Sergey Chernov on 2019-01-04.
//

#include <iostream>
#include <strstream>
#include <fstream>
#include "ScriptEnvironment.h"
#include "tools.h"
#include "basic_builtins.h"

using namespace std;

ScriptEnvironment::ScriptEnvironment(const char *argv) {
    std::string s = argv;
    root = s.substr(0, s.rfind('/'));
    const char *h = std::getenv("HOME");
    home = h ? h : ".";
    require_roots.push_back(root + "/jslib");
    require_roots.push_back(root);
    require_roots.push_back(".");

    create_params.array_buffer_allocator =
            v8::ArrayBuffer::Allocator::NewDefaultAllocator();
    pIsolate = v8::Isolate::New(create_params);


    v8::Isolate::Scope isolate_scope(pIsolate);

    // Create a stack-allocated handle scope.
    v8::HandleScope handle_scope(pIsolate);


    v8::Local<v8::ObjectTemplate> global = v8::ObjectTemplate::New(pIsolate);
    // Bind the global 'print' function to the C++ Print callback.
    global->Set(
            v8::String::NewFromUtf8(pIsolate, "__bios_print", v8::NewStringType::kNormal)
                    .ToLocalChecked(),
            v8::FunctionTemplate::New(pIsolate, JsPrint));

    global->Set(
            v8::String::NewFromUtf8(pIsolate, "__bios_loadRequired", v8::NewStringType::kNormal)
                    .ToLocalChecked(),
            v8::FunctionTemplate::New(pIsolate, JsLoadRequired));


    // Create a new context.
//    v8::Local<v8::Context> context = v8::Context::New(pIsolate, NULL, global);
    cout << "111";
    context.Reset(pIsolate, v8::Context::New(pIsolate, NULL, global));
    cout << " 1112";
    context.Get(pIsolate)->SetEmbedderData(1, v8::External::New(pIsolate, this));
    cout << " 1113";

}

std::string ScriptEnvironment::expandPath(const std::string &path) {
    return replace_all(path, "~", home);
}


static char path_separator = '/';

std::string ScriptEnvironment::resolveRequiredFile(const std::string& fileName) {
    if (fileName[0] == '.' || fileName[0] == path_separator) {
        // no, direct path
        return fileName;
    } else {
        // yes, we should try...
        for (string r: require_roots) {
            string fn = r + path_separator + fileName;
            if (file_exists(fn)) {
                return fn;
            }
        }
    }
    return "";
}


std::string ScriptEnvironment::loadFileAsString(const std::string &fileName) {
    auto fn = resolveRequiredFile(fileName);
    if( fn.empty() )
        return "";
    else
        return loadAsString(fn);
}

ScriptEnvironment::~ScriptEnvironment() {
    pIsolate->Dispose();
    delete create_params.array_buffer_allocator;
}


