//
// Created by Sergey Chernov on 2019-01-04.
//

#include <iostream>
#include <strstream>
#include <iomanip>
#include <fstream>

#include "Scripter.h"
#include "../tools/tools.h"
#include "basic_builtins.h"
#include "async_io_bindings.h"

static const char *ARGV0 = nullptr;

std::unique_ptr<v8::Platform> Scripter::initV8(const char *argv0) {

    int _argc = 2;
    char* _argv[] = { (char*)argv0, (char*) "--expose_gc"};

    v8::V8::InitializeICUDefaultLocation(argv0);
    v8::V8::InitializeExternalStartupData(argv0);
    ARGV0 = argv0;
    std::unique_ptr<v8::Platform> platform = v8::platform::NewDefaultPlatform();
    v8::V8::InitializePlatform(platform.get());
    V8::SetFlagsFromCommandLine(&_argc,
                                _argv,
                                false);
    v8::V8::Initialize();
    return platform;
}

void Scripter::closeV8(std::unique_ptr<v8::Platform> &platform) {
    v8::V8::Dispose();
    v8::V8::ShutdownPlatform();
    platform.release();
}

int Scripter::Application(const char *argv0, function<int(shared_ptr<Scripter>)> block) {
    try {
        auto platform = initV8(argv0);
        auto se = New();
        return block(se);
    }
    catch (const ScriptError &e) {
        // Script errors are well traced
        return 1000;
    }
    catch (const std::exception &e) {
        cerr << "uncaught error: " << e.what() << endl;
        return 1000;
    }
    catch (...) {
        cerr << "uncaught unspecified error: " << endl;
        return 2000;
    }

}

shared_ptr<Scripter> Scripter::New() {
    if (!ARGV0)
        throw runtime_error("Platform in not initialized");
    // we can not use make_shared as our constructor is intentionally private:
    shared_ptr<Scripter> scripter(new Scripter);
    scripter->initialize();
    return scripter;
}

Scripter::Scripter() : Logging("SCR") {
    std::string s = ARGV0;
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
            require_roots.emplace_back("./jslib");
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

    // Global object for U8
    v8::Local<v8::ObjectTemplate> global = v8::ObjectTemplate::New(pIsolate);
    // Bind the global 'print' function to the C++ Print callback.
    global->Set(v8String("__bios_print"), functionTemplate(JsPrint));
    global->Set(v8String("__bios_loadRequired"), functionTemplate(JsLoadRequired));
    global->Set(v8String("__bios_initTimers"), functionTemplate(JsInitTimers));
    global->Set(v8String("waitExit"), functionTemplate(JsWaitExit));
    global->Set(v8String("exit"), functionTemplate(JsExit));
    global->Set(v8String("utf8Decode"), functionTemplate(JsTypedArrayToString));
    global->Set(v8String("$0"), v8String(ARGV0));

    JsInitIoHandle(pIsolate, global);

    // Save context and wrap weak self:
    context.Reset(pIsolate, v8::Context::New(pIsolate, nullptr, global));
    weakThis = shared_from_this();
    context.Get(pIsolate)->SetEmbedderData(1, v8::External::New(pIsolate, &weakThis));

    log("context ready, initializing JS library");

    // now run initialization library script
    inContext([&](auto context) {
        auto src = loadFileAsString("init_full.js");
        if (src.empty())
            throw runtime_error("failed to find U8 jslib");
        src = src + "\n//# sourceURL=" + "jslib/init_full.js\n";

        // Compile the source code.
        TryCatch trycatch(pIsolate);
        auto scriptResult = v8::Script::Compile(context, v8String(src));
        if (scriptResult.IsEmpty()) {
            checkException(trycatch, context);
            throw runtime_error("failed to compile U8CoreJS library");
        } else {
            v8::Local<v8::Script> script = scriptResult.ToLocalChecked();
            auto maybeResult = script->Run(context);
            if (maybeResult.IsEmpty()) {
                checkException(trycatch, context);
                throw runtime_error("Failed to initialize U8CoreJS Library");
            }
        }
    });
}


bool Scripter::checkException(TryCatch &trycatch, Local<Context> context) {
    if (trycatch.HasCaught()) {
        Local<Value> exception = trycatch.Exception();
        String::Utf8Value exception_str(pIsolate, exception);
        Local<Message> message = trycatch.Message();
        if (message.IsEmpty()) {
            cerr << *exception_str << endl;

        } else {
            int start = message->GetStartColumn(context).FromJust();
            int end = message->GetEndColumn(context).FromJust();
            cerr << endl << getString(message->GetScriptOrigin().ResourceName()) << ":"
                 << message->GetLineNumber(context).FromJust() << " " << *exception_str << endl
                 << getString(message->GetSourceLine(context)) << endl
                 << setw(start + 1) << '^' << setw(end - start) << setfill('^') << '^' << endl << endl;
        }

        auto stackTrace = trycatch.StackTrace(context);
        if (!stackTrace.IsEmpty()) {
            string str = getString(stackTrace);
            // one-line stack is just copy of the exception error
            // so we don't repeat it:
            if (str.find('\n') != string::npos)
                cerr << str << endl;
        }
        return true;
    }
    return false;
}

template<class T>
void Scripter::throwPendingException(TryCatch &trycatch, Local<Context> context) {
    if (checkException(trycatch, context)) {
        throw T(getString(trycatch.Exception()));
    }
}

string Scripter::evaluate(const string &src, bool needsReturn, ScriptOrigin *origin) {
    string res;
    inContext([&](auto context) {
        v8::Local<v8::String> source =
                v8::String::NewFromUtf8(pIsolate, src.c_str(),
                                        v8::NewStringType::kNormal)
                        .ToLocalChecked();

        // Compile the source code.
        TryCatch trycatch(pIsolate);
        auto scriptResult = v8::Script::Compile(context, source, origin);
        if (scriptResult.IsEmpty())
            throwPendingException<SyntaxError>(trycatch, context);
        else {
            v8::Local<v8::Script> script = scriptResult.ToLocalChecked();
            auto maybeResult = script->Run(context);
            if (maybeResult.IsEmpty())
                throwPendingException<ScriptError>(trycatch, context);
            else {
                if (needsReturn) {
                    res = getString(maybeResult);
                }
            }
        }
    });
    return res;
}

int Scripter::runAsMain(const string &sourceScript, const vector<string> &&args, ScriptOrigin *origin) {
    int code = inContext([&](Local<Context> &context) {
        auto global = context->Global();
        // fix imports
        global->Set(v8String("__source"), v8String(sourceScript));
        string script = evaluate(
                "let r = __fix_imports(__source); __source = undefined; r",
                true);
        // run fixed script
        evaluate(script, false, origin);
        // run main if any
        Local<Function> main = Local<Function>::Cast(global->Get(v8String("main")));

        if (!main->IsUndefined()) {
            auto jsArgs = Array::New(pIsolate);
            for (int i = 0; i < args.size(); i++) {
                jsArgs->Set(i, String::NewFromUtf8(pIsolate, args[i].c_str()));
            }
            auto param = Local<Value>::Cast(jsArgs);
            TryCatch tryCatch(pIsolate);
            context->Global()->Set(v8String("__args"),param);
            auto result = evaluate("__call_main(__args)", true);
//            auto result = main->Call(context, global, 1, &param);
            throwPendingException<ScriptError>(tryCatch, context);
//            return result.ToLocalChecked()->Int32Value(context).FromJust();
            return stoi(result);
        }
        // if we reach this point, there are no main function in the script
        return 0;
    });
    if (waitExit) {
        pIsolate->Exit();
        Unlocker ul(pIsolate);
        waitExitVar.wait(4000ms);
        pIsolate->Enter();
        return exitCode;
    }
    return code;

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

