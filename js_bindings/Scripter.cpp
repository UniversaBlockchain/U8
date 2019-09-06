/*
 * Copyright (c) 2019 Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

#include <iostream>
#include <strstream>
#include <iomanip>
#include <fstream>

#include "Scripter.h"
#include "../tools/tools.h"
#include "basic_builtins.h"
#include "async_io_bindings.h"
#include "pg_bindings.h"
#include "web_bindings.h"
#include "research_bindings.h"
#include "boss_bindings.h"
#include "worker_bindings.h"

static const char *ARGV0 = nullptr;

std::unique_ptr<v8::Platform> Scripter::initV8(const char *argv0) {

    int _argc = 4;
    char *_argv[] = {(char *) argv0,
                     (char *) "--expose_gc",
                     (char *) "--harmony-await-optimization",
                     (char *) "--async-stack-traces"
    };

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

int Scripter::Application(const char *argv0, function<int(shared_ptr<Scripter>)> &&block) {
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

static void JsThrowScripterException(const FunctionCallbackInfo<Value> &args) {
    Scripter::unwrapArgs(args, [](ArgsContext &ac) {
        switch (ac.asInt(0)) {
            case 0:
                ac.scripter->throwError(ac.asString(1).c_str());
                break;
            case 1:
                ac.scripter->throwError(ac.asString(1));
                break;
            case 2:
                throw std::logic_error(ac.asString(1));
                break;
            case 3: {
                TryCatch tryCatch(ac.isolate);
                cout << "we will create a string... ";
                auto s = String::NewFromUtf8(ac.isolate, "test constant string");
                cout << ac.scripter->getString(s) << " ==\n";
                auto e = Exception::Error(s);
                cout << "exception object created";
//                ac.setReturnValue(e);
                break;
            }
            default:
                throw std::invalid_argument("unknown error type parameter");
        }
    });
}

void Scripter::initialize() {
    if (initialized)
        throw runtime_error("SR is already initialized");
    initialized = true;

    create_params.array_buffer_allocator =
            v8::ArrayBuffer::Allocator::NewDefaultAllocator();
    pIsolate = v8::Isolate::New(create_params);
    v8::Isolate::Scope isolate_scope(pIsolate);

    pIsolate->SetData(0, this);

    // Create a stack-allocated handle scope.
    v8::HandleScope handle_scope(pIsolate);

    // Global object for U8
    v8::Local<v8::ObjectTemplate> global = v8::ObjectTemplate::New(pIsolate);
    // Bind the global 'print' function to the C++ Print callback.
    global->Set(v8String("__bios_print"), functionTemplate(JsPrint));
    global->Set(v8String("__debug_throw"), functionTemplate(JsThrowScripterException));
    global->Set(v8String("__bios_loadRequired"), functionTemplate(JsLoadRequired));
    global->Set(v8String("__bios_initTimers"), functionTemplate(JsInitTimers));
    global->Set(v8String("exit"), functionTemplate(JsExit));
    global->Set(v8String("utf8Decode"), functionTemplate(JsTypedArrayToString));
    global->Set(v8String("utf8Encode"), functionTemplate(JsStringToTypedArray));
    global->Set(v8String("$0"), v8String(ARGV0));

    global->Set(v8String("__hardware_concurrency"), v8Int(std::thread::hardware_concurrency()));

    JsInitIOFile(pIsolate, global);
    JsInitIODir(pIsolate, global);
    JsInitIOTCP(pIsolate, global);
    JsInitIOTLS(pIsolate, global);
    JsInitIOUDP(pIsolate, global);
    JsInitCrypto(*this, pIsolate, global);
    JsInitQueryResult(pIsolate, global);
    JsInitBusyConnection(pIsolate, global);
    JsInitPGPool(pIsolate, global);
    JsInitNetwork(pIsolate, global);
    JsInitResearchBindings(pIsolate, global);
    JsInitBossBindings(*this, pIsolate, global);
    JsInitWorkerBindings(*this, pIsolate, global);

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

int Scripter::runAsMain(string sourceScript, const vector<string> &&args, string fileName) {
    v8::Isolate::Scope isolateScope(pIsolate);
    inContext([&](Local<Context> &context) {
        ScriptOrigin origin(v8String(fileName));
        auto global = context->Global();
        // fix imports
        global->Set(v8String("__source"), v8String(sourceScript));
        string script = evaluate(
                "let r = __fix_imports(__source); __source = undefined; r",
                true);
        // run fixed script
        evaluate(script, false, &origin);
        // run main if any
        Local<Function> callmain = Local<Function>::Cast(global->Get(v8String("__call_main")));

        auto jsArgs = Array::New(pIsolate);
        for (int i = 0; i < args.size(); i++) {
            jsArgs->Set(i, String::NewFromUtf8(pIsolate, args[i].c_str()));
        }
        auto param = Local<Value>::Cast(jsArgs);
        TryCatch tryCatch(pIsolate);
        context->Global()->Set(v8String("__args"), param);
        auto unused = callmain->Call(context, global, 1, &param);
        throwPendingException<ScriptError>(tryCatch, context);
    });

    runMainLoop();

    return exitCode;
//
//    if (waitExit) {
//        pIsolate->Exit();
//        Unlocker ul(pIsolate);
//        waitExitPromise.get_future().get();
//        pIsolate->Enter();
//        return exitCode;
//    }
//    return code;

}

void Scripter::runMainLoop() {
    // main loop: we process all callbacks here in the same thread:
    {
        // optimization: the shared context scope - it could be a problem, then move it insude the loop
        // actually we do not want to create separate context for every call
        v8::HandleScope handle_scope(pIsolate);
        auto cxt = context.Get(pIsolate);
        v8::Context::Scope context_scope(cxt);

        // loop itself
        while (isActive) {
            v8::HandleScope handle_scope(pIsolate); // per-call scope to clean locals:
            ContextCallback c = callbacks.get();
            TryCatch tryCatch(pIsolate);
            c(cxt);
            if (tryCatch.HasCaught()) {
                cerr << "Uncaught exception: " << getString(tryCatch.Exception()) << endl;
            }
        }
    }
}

void Scripter::startMainLoopThread() {
    mainLoopThread = std::make_shared<std::thread>([this](){
        runMainLoop();
    });
}

void Scripter::joinMainLoopThread() {
    mainLoopThread->join();
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

std::shared_ptr<Persistent<FunctionTemplate>> Scripter::getTemplate(const std::string& tplName) {
    return templatesHolder[tplName];
}

void Scripter::setTemplate(const std::string& tplName, std::shared_ptr<Persistent<FunctionTemplate>> tpl) {
    templatesHolder[tplName] = tpl;
}

void Scripter::resetAllHoldedTemplates() {
    for (auto tpl : templatesHolder)
        tpl.second->Reset();
}

std::shared_ptr<Persistent<Object>> Scripter::getPrototype(const std::string& protoName) {
    return prototypesHolder[protoName];
}

void Scripter::setPrototype(const std::string& protoName, std::shared_ptr<Persistent<Object>> proto) {
    prototypesHolder[protoName] = proto;
}
