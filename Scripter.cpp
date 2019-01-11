//
// Created by Sergey Chernov on 2019-01-04.
//

#include <iostream>
#include <strstream>
#include <fstream>
#include "Scripter.h"
#include "tools.h"
#include "basic_builtins.h"

static const char *ARGV0 = nullptr;

shared_ptr<Scripter> Scripter::New(const char *script, const char *argv0) {
    if (argv0) ARGV0 = argv0;
    if (!ARGV0)
        throw runtime_error("argv0 is not set");
    shared_ptr<Scripter> scripter(new Scripter(ARGV0));
    scripter->initialize();
    return scripter;
}


Scripter::Scripter(const char *argv) : Logging("SCR") {
    std::string s = argv;
    auto root = s.substr(0, s.rfind('/'));
    auto path = root;
    bool root_found = false;
    // Looking for library in the current tree
    do {
        auto x = path + "/jslib";
        if (file_exists(x)) {
            require_roots.push_back(x);
            root_found = true;
            break;
        }
        auto index = path.rfind('/');
        cout << "index " << index << endl;
        if (index == std::string::npos) break;
        path = path.substr(0, index);
    } while (path != "/");

    // if not found, get from ENV
    if (!root_found) {
        // get U8 root from env
        auto u8root = std::getenv("U8_ROOT");
        if (u8root) {
            require_roots.emplace_back(u8root);
        } else {
            // last chance ;)
            require_roots.emplace_back("../jslib");
        }

    }
    // then look in the application executable file root
    require_roots.push_back(root);
    // and in the current directory
    require_roots.emplace_back(".");
}

void Scripter::initialize() {
    if (initialized)
        throw runtime_error("SR is already initialized");
    initialized = true;

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

    global->Set(
            v8::String::NewFromUtf8(pIsolate, "__bios_initTimers", v8::NewStringType::kNormal)
                    .ToLocalChecked(),
            v8::FunctionTemplate::New(pIsolate, JsInitTimers));

    context.Reset(pIsolate, v8::Context::New(pIsolate, nullptr, global));
    weakThis = shared_from_this();
    context.Get(pIsolate)->SetEmbedderData(1, v8::External::New(pIsolate, &weakThis));
    log("ready");
}

std::string Scripter::expandPath(const std::string &path) {
    return replace_all(path, "~", home);
}


static char path_separator = '/';

std::string Scripter::resolveRequiredFile(const std::string &fileName) {
    if (fileName[0] == '.' || fileName[0] == path_separator) {
        // no, direct path
        return fileName;
    } else {
        // yes, we should try...
        for (const string &r: require_roots) {
            string fn = r + path_separator + fileName;
            if (file_exists(fn)) {
                return fn;
            }
        }
    }
    return "";
}


std::string Scripter::loadFileAsString(const std::string &fileName) {
    auto fn = resolveRequiredFile(fileName);
    if (fn.empty())
        return "";
    else
        return loadAsString(fn);
}

Scripter::~Scripter() {
    log("destructing SR");
    pIsolate->Dispose();
    delete create_params.array_buffer_allocator;
}

void Scripter::unwrap(
        const v8::FunctionCallbackInfo<v8::Value> &args,
        const std::function<void(shared_ptr<Scripter>, v8::Isolate *, const v8::Local<v8::Context> &)> &block
) {
    v8::Isolate *isolate = args.GetIsolate();
    v8::HandleScope handle_scope(isolate);

    auto ext = isolate->GetEnteredContext()->GetEmbedderData(1);
    v8::Local<v8::External> wrap = v8::Local<v8::External>::Cast(ext);

    auto weak = static_cast<weak_ptr<Scripter> *>(wrap->Value());
    shared_ptr<Scripter> sr = weak->lock();
    if (sr) {
        auto cxt = isolate->GetEnteredContext();
        v8::Context::Scope context_scope(cxt);
        block(sr, isolate, cxt);
    } else {
        cerr << "called inContext for recycled SR: ignoring" << endl;
    }
}

