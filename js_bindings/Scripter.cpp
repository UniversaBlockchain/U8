/*
 * Copyright (c) 2019-present Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

#include <iostream>
#include <strstream>
#include <iomanip>
#include <fstream>
#include <unistd.h>
#include <sys/types.h>
#include <pwd.h>

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
static const char *ARGV1 = nullptr;
std::string BASE_PATH;                          // path to ZIP-module or directory where jslib found
int Scripter::workerMemLimitMegabytes = 200;    // actual default value is set in main.cpp
const char *U8MODULE_EXTENSION = ".u8m/";
const char *U8COREMODULE_NAME = "u8core";
const char *U8COREMODULE_FULLNAME = "u8core.u8m";
static char path_separator = '/';

std::unique_ptr<v8::Platform> Scripter::initV8(const char *argv0) {

    int _argc = 3;
    char *_argv[] = {(char *) argv0,
                     (char *) "--expose_gc",
                     //(char *) "--harmony-await-optimization",   // <--- unrecognized in v8 8.0, enabled by default
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

int Scripter::Application(const char *argv0, const char *argv1, function<int(shared_ptr<Scripter>)> &&block) {
    try {
        ARGV1 = argv1;
        auto platform = initV8(argv0);
        auto se = New(0, false);
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

shared_ptr<Scripter> Scripter::New(int accessLevel, bool forWorker) {
    if (!ARGV0)
        throw runtime_error("Platform in not initialized");
    // we can not use make_shared as our constructor is intentionally private:
    shared_ptr<Scripter> scripter(new Scripter);
    scripter->initialize(accessLevel, forWorker);
    return scripter;
}

Scripter::Scripter() : Logging("SCR") {
    std::string s = ARGV1;

#ifndef U8_BUILD_DEVELOPMENT
    if (!u8coreLoaded)
        loadModule(U8COREMODULE_FULLNAME);
#endif

    struct passwd *pw = getpwuid(getuid());
    home = pw->pw_dir;

    size_t zipPos = s.rfind(U8MODULE_EXTENSION);
    inZip = zipPos != std::string::npos;

    if (inZip) {
        s = s.substr(0, zipPos + 4);
        BASE_PATH = makeAbsolutePath(s + path_separator);

        if (!loadModule(s, true))
            throw runtime_error("Failed loading module");
    } else
        s = ARGV0;

    //make path absolute
    s = makeAbsolutePath(s);

    if (inZip) {
        if (!u8coreLoaded) {
            // load u8 core module from starting module path
            auto path = s.substr(0, s.rfind(path_separator)) + path_separator + U8COREMODULE_FULLNAME;

            if (file_exists(path)) {
                if (!loadModule(path))
                    throw runtime_error("Failed loading U8 core module");
            } else {
                // load u8 core module from U8 path
                path = makeAbsolutePath(ARGV0).substr(0, s.rfind(path_separator));

                do {
                    auto x = path + path_separator + U8COREMODULE_FULLNAME;
                    if (file_exists(x)) {
                        if (!loadModule(x))
                            throw runtime_error("Failed loading U8 core module");
                        else
                            break;
                    }
                    auto index = path.rfind(path_separator);
                    if (index == std::string::npos)
                        break;
                    path = path.substr(0, index);
                } while (path != "/");
            }

            if (!u8coreLoaded)
                throw runtime_error("U8 core module was not loaded");
        }
    } else {
        auto root = s.substr(0, s.rfind(path_separator));
        auto path = root;
        bool root_found = false;

        // Looking for library in the current tree
        do {
            auto x = path + "/jslib";
            if (file_exists(x, true)) {
                require_roots.push_back(x);
                BASE_PATH = makeAbsolutePath(path + path_separator);
                root_found = true;
                break;
            }
            auto index = path.rfind(path_separator);
            if (index == std::string::npos || (inZip && index < zipPos))
                break;
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
                auto s = String::NewFromUtf8(ac.isolate, "test constant string").ToLocalChecked();
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

void Scripter::initialize(int accessLevel, bool forWorker) {
    if (initialized)
        throw runtime_error("SR is already initialized");
    initialized = true;

    selfAccessLevel_ = accessLevel;

    create_params.array_buffer_allocator =
            v8::ArrayBuffer::Allocator::NewDefaultAllocator();
    if (forWorker)
        create_params.constraints.set_max_old_space_size(workerMemLimitMegabytes);
    pIsolate = v8::Isolate::New(create_params);
    v8::Isolate::Scope isolate_scope(pIsolate);

    pIsolate->SetData(0, this);

    // Create a stack-allocated handle scope.
    v8::HandleScope handle_scope(pIsolate);

    // Global object for U8
    v8::Local<v8::ObjectTemplate> global = v8::ObjectTemplate::New(pIsolate);

    if (accessLevel == 0) {
        // Bind the global 'print' function to the C++ Print callback.
        global->Set(v8String("__bios_print"), functionTemplate(JsPrint));
        global->Set(v8String("__debug_throw"), functionTemplate(JsThrowScripterException));
        global->Set(v8String("__bios_loadRequired"), functionTemplate(JsLoadRequired));
        global->Set(v8String("__bios_loadModule"), functionTemplate(JsLoadModule));
        global->Set(v8String("__bios_initTimers"), functionTemplate(JsInitTimers));
        global->Set(v8String("exit"), functionTemplate(JsExit));
        global->Set(v8String("utf8Decode"), functionTemplate(JsTypedArrayToString));
        global->Set(v8String("utf8Encode"), functionTemplate(JsStringToTypedArray));
        global->Set(v8String("$0"), v8String(ARGV0));

        global->Set(v8String("__hardware_concurrency"), v8Int(std::thread::hardware_concurrency()));

        global->Set(v8String("__init_workers"), functionTemplate(JsInitWorkers));
        global->Set(v8String("__send_from_worker"), functionTemplate(JsSendFromWorker));

        JsInitIOFile(*this, global);
        JsInitIODir(*this, global);
        JsInitIOTCP(*this, global);
        JsInitIOTLS(*this, global);
        JsInitIOUDP(*this, global);
        JsInitCrypto(*this, global);
        JsInitQueryResult(*this, global);
        JsInitBusyConnection(*this, global);
        JsInitPGPool(*this, global);
        JsInitNetwork(*this, global);
        JsInitResearchBindings(*this, global);
        JsInitBossBindings(*this, global);
        JsInitWorkerBindings(*this, global);
        JsInitZipBindings(*this, global);
    } else if (accessLevel == 1) {
        global->Set(v8String("__bios_loadRequired"), functionTemplate(JsLoadRequiredRestricted));
        global->Set(v8String("__bios_initTimers"), functionTemplate(JsInitTimers));
        global->Set(v8String("utf8Decode"), functionTemplate(JsTypedArrayToString));
        global->Set(v8String("utf8Encode"), functionTemplate(JsStringToTypedArray));
        global->Set(v8String("__init_workers"), functionTemplate(JsInitWorkers));
        global->Set(v8String("__send_from_worker"), functionTemplate(JsSendFromWorker));
        global->Set(v8String("__require_from_worker"), functionTemplate(JsRequireFromWorker));
        JsInitCrypto(*this, global);
        JsInitBossBindings(*this, global);
    } else {
        throw runtime_error("scripter's access level is unknown: " + std::to_string(accessLevel));
    }

    // Save context and wrap weak self:
    context.Reset(pIsolate, v8::Context::New(pIsolate, nullptr, global));
    weakThis = shared_from_this();
    context.Get(pIsolate)->SetEmbedderData(1, v8::External::New(pIsolate, &weakThis));

    log("context ready, initializing JS library");

    // now run initialization library script
    inContext([&](auto context) {
        std::string initScriptFileName = accessLevel==0 ? "init_full.js" : "init_restricted.js";
        auto src = loadCoreFileAsString(initScriptFileName);
        if (src.empty())
            throw runtime_error("failed to find U8 jslib");
        src = src + "\n//# sourceURL=" + "jslib/"+initScriptFileName+"\n";

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
        // fix imports and requires
        auto unused = global->Set(context, v8String("__source"), v8String(sourceScript));
        if (inZip)
            auto unused1 = global->Set(context, v8String("__startingModuleName"), v8String(startingModuleName));
        string script = evaluate(
                inZip ? "let r = __fix_require(__fix_imports(__source), __startingModuleName); __source = undefined; __startingModuleName = undefined; r" :
                "let r = __fix_imports(__source); __source = undefined; r",
                true);
        //printf("====== script = %s\n", script.data());
        // run fixed script
        evaluate(script, false, &origin);
        // run main if any
        Local<Function> callmain = Local<Function>::Cast(global->Get(context, v8String("__call_main")).ToLocalChecked());

        auto jsArgs = Array::New(pIsolate);
        for (int i = 0; i < args.size(); i++) {
            auto unused = jsArgs->Set(context, i, String::NewFromUtf8(pIsolate, args[i].c_str()).ToLocalChecked());
        }
        auto param = Local<Value>::Cast(jsArgs);
        TryCatch tryCatch(pIsolate);
        auto unused2 = context->Global()->Set(context,v8String("__args"), param);
        auto unused3 = callmain->Call(context, global, 1, &param);
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

void Scripter::runMainLoop(bool forWorker) {
    // main loop: we process all callbacks here in the same thread:
    {
        if (forWorker) {
            pIsolate->AddNearHeapLimitCallback([](void *data, size_t current_heap_limit, size_t initial_heap_limit) {
                Isolate *iso = (Isolate *) data;
                WorkerScripter *ws = (WorkerScripter *) iso->GetData(1);
                if (ws != nullptr) {
                    auto onLowMemoryMain = ws->onLowMemoryMain;
                    if (onLowMemoryMain != nullptr) {
                        onLowMemoryMain->lockedContext([onLowMemoryMain](auto cxt) {
                            onLowMemoryMain->invoke();
                        });
                        ws->pauseOnLowMemory->wait();
                    }
                }
//                iso->AutomaticallyRestoreInitialHeapLimit();
//                size_t res = Scripter::workerMemLimitMegabytes*2;
//                if (res > 1400)
//                    res = 1400;
//                res *= 1024 * 1024;
//                if (res < current_heap_limit)
//                    res = current_heap_limit;
//                return res;
                return current_heap_limit;
            }, pIsolate);
        }

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
                if (!forWorker)
                    cerr << "Uncaught exception: " << getString(tryCatch.Exception()) << endl;
//                else
//                    cout << "worker execution was terminated" << endl;
            }
        }
    }
}

std::string Scripter::getHome() {
    return home;
}

std::string Scripter::expandPath(const std::string &path) {
    return replace_all(path, "~", home);
}

std::string Scripter::resolveRequiredFile(const std::string &fileName, const std::string &moduleName) {
    auto module = modules.find(moduleName);
    if (module != modules.end()) {
        auto path = module->second->resolveRequiredFile(fileName);
        if (!path.empty())
            return path;
    }

    if (inZip)
        return "";

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


std::string Scripter::loadCoreFileAsString(const std::string &fileName) {
    auto fn = resolveRequiredFile(fileName, U8COREMODULE_NAME);
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

std::shared_ptr<Persistent<Object>> Scripter::getPrototype(const std::string& protoName) {
    return prototypesHolder[protoName];
}

void Scripter::setPrototype(const std::string& protoName, std::shared_ptr<Persistent<Object>> proto) {
    prototypesHolder[protoName] = proto;
}

bool Scripter::loadModule(const std::string& sourceName, bool isStarting) {
    std::shared_ptr<U8Module> module = std::shared_ptr<U8Module>(new U8Module(sourceName, getHome()));

    // loading module
    if (!module->load())
        return false;

    if (modules.find(module->getName()) != modules.end())   // if already checked
        return true;

    // check signature
    bool res = module->checkModuleSignature();
    if (res) {
        modules.insert(std::pair<std::string, std::shared_ptr<U8Module>>(module->getName(), module));

        if (module->getName() == U8COREMODULE_NAME)
            u8coreLoaded = true;

        if (isStarting)
            startingModuleName = module->getName();

        //printf("Module %s successfully loaded\n", module->getName().data());
    }

    return res;
}