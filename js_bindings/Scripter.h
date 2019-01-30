//
// Created by Sergey Chernov on 2019-01-04.
//

#ifndef U8_SCRIPTENVIRONMENT_H
#define U8_SCRIPTENVIRONMENT_H

#include <string>
#include <vector>
#include <v8.h>
#include <libplatform/libplatform.h>
#include <cstring>

#include "../tools/Logging.h"
#include "../tools/tools.h"
#include "../tools/AsyncSleep.h"
#include "../tools/ConditionVar.h"

using namespace std;
using namespace v8;

class ArgsContext;


class Scripter : public std::enable_shared_from_this<Scripter>, public Logging {
public:

    // ------------------- helpers -------------------------------
    Local<String> v8String(string x, NewStringType t = NewStringType::kNormal) {
        return String::NewFromUtf8(pIsolate, x.c_str(), t).ToLocalChecked();
    }

    Local<String> v8String(const char *cstr, NewStringType t = NewStringType::kNormal) {
        return String::NewFromUtf8(pIsolate, cstr, t).ToLocalChecked();
    }

    Local<FunctionTemplate> functionTemplate(FunctionCallback callback) {
        return FunctionTemplate::New(pIsolate, callback);
    }

    /**
     * Create V8 environment, construct scripter, executes block with it, close V8 environment and return
     * whatever block return unless it throw an exception.
     * @param argv0 argv[0] of the executing program, needed to properly initialize V8.
     * @param block to execute with Scripter environment
     * @return block returned value or 1000 if std::exception was thrown, or 2000 if any other exception was thrown
     *         by the block.
     */
    static int Application(const char *argv0, function<int(shared_ptr<Scripter>)> block);

    /**
     * Sets up V8 environment for the process. Must be called once before any V8 and/or Scripter operation.
     * @param argv0 argv[0] when calling main. Is used to search for V8 and like resources
     * @return unique platofrm pointer that should be retained during all V8/Scripter operations
     */
    static std::unique_ptr<v8::Platform> initV8(const char *argv0);

    /**
     * Closes V8 platform releasing all its resources. Should be aclled after all V8/Scripter operations is done.
     * We do not recommend to recreate V8 environment once closed.
     *
     * @param platform unque pointer returned by the initV8().
     */
    static void closeV8(std::unique_ptr<v8::Platform> &platform);

    /**
     * Create and set up new Scripter instance. Note that if any scripts are run in background (timers, file IO, etc)
     * the returned shared pointer should be retained as long as necessary. When the scripter instance is disposed,
     * all background scripts will be immediately cancelled, so the lifetime of this object should somehow be
     * synchronized with any critical JS background tasks.
     *
     * @return shared pointer to scripter environment.
     */
    static shared_ptr<Scripter> New();


    /**
     * Evaulate string from a string and return thre result (usuallym when evaluating an expression).
     * @param code javascript expression/program to evaulate
     * @param needsReturn true to extract return value
     * @return the string returned by a script or empty string if not +needsReturn+
     */
    string evaluate(const string &code, bool needsReturn = true, ScriptOrigin *origin = nullptr);

    int runAsMain(const string &sourceScript, const vector<string> &&args, ScriptOrigin *origin = nullptr);

    int runAsMain(const string &script, const vector<string> &&args, string fileName) {
        ScriptOrigin origin(v8String(fileName));
        return runAsMain(script, move(args), &origin);
    }

    template<typename T>
    string getString(MaybeLocal<T> value) {
        return getString(value.ToLocalChecked());
    }

    template<typename T>
    string getString(Local<T> value) {
        String::Utf8Value result(pIsolate, value);
        return *result;
    }

    /**
     * Get current isolate
     * @return
     */
    v8::Isolate *isolate() const { return pIsolate; }

    /**
     * Execute block in the context that is entered (owned) by the current thread
     *
     * @param block to execute
     */
    template<typename Function>
    auto inContext(Function &&block) {
        v8::HandleScope handle_scope(pIsolate);
        auto cxt = context.Get(pIsolate);
        v8::Context::Scope context_scope(cxt);
        return block(cxt);
    }

    /**
     * Execute block in the foreign thread (that is not owning the context). Use it when calling
     * from async handlers, other threads and like.
     *
     * @param block to execute
     */
    template<typename F>
    auto lockedContext(F block) {
        v8::Locker locker(pIsolate);
        Isolate::Scope iscope(pIsolate);
        v8::HandleScope handle_scope(pIsolate);
        Local<Context> cxt = context.Get(pIsolate);
        v8::Context::Scope context_scope(cxt);
        return block(cxt);
    }

    /**
     * Unwrap Scripter from function callback and execute block in the proper context. Note that this method
     * is intended to be called from the thread owning the context. This is almost always true as you should not
     * store v8::FunctionCallbackInfo<v8::Value> outside of the handler function.
     *
     * @param args function callback arguments
     * @param block to execute in unwrapped Scripter environment
     */
    static void unwrap(
            const v8::FunctionCallbackInfo<v8::Value> &args,
            const std::function<void(shared_ptr<Scripter>, v8::Isolate *, const v8::Local<v8::Context> &)> &block
    );

    template<typename F>
    static void unwrapArgs(
            const v8::FunctionCallbackInfo<v8::Value> &args,
            F &&block
    );

    /**
     * Expands filename path and tries to find the specified file in the currently available context for modules (e.g.
     * for require/import).
     *
     * @param filName to look for.
     * @return found full path with filename or empty string if not found.
     */
    std::string resolveRequiredFile(const std::string &filName);

    /**
     * Checks that timers are initialized.
     * @return
     */
    bool timersReady() const { return _timersReady; }

    /**
     * Desctruct all resouces, including V8 isolate, contexts and everything else.
     */
    virtual ~Scripter();

    template<class T>
    void throwPendingException(TryCatch &tc, Local<Context>);

    bool checkException(TryCatch &tc, Local<Context>);

    /**
     * Turn "wait exit" more on (may not be effective except with runAsMain)
     */
    void setWaitExit() { waitExit = true; }

    bool getWaitExit() { return waitExit; }

    bool getExitCode() { return exitCode; }

    /**
     * depending on waitExit mode. If setWaitExit() was called (js: waitExit()),
     * stops waitExit waiting (in runAsMain) and stores exit code that is available with
     * getExitCode(). Note that it may not be effective until the runMain() is in progress.
     *
     * If the setWaitExit was not yet called, it immediately exits the calling application with the specifoed
     * exit code.
     *
     * @param code exit code to report.
     */
    void exit(int code) {
        if (waitExit) {
            exitCode = code;
            waitExitVar.notify();
        } else {
            ::exit(code);
        }
    }

    /**
     * throw Javacript exception as a simple string
     */
    void throwException(const string &reason) {
        pIsolate->ThrowException(v8String(reason));
    }

    /**
     * throw Javacript exception as a some object
     */
    template<class S>
    void throwError(const S &&text) {
        pIsolate->ThrowException(Exception::Error(v8String(text)));
    }

    void throwError(const char *text) {
        throwError(string(text));
    }

private:

    std::string expandPath(const std::string &path);

    std::string loadFileAsString(const std::string &fileName);


    // is set by initialize(), not by the constructor. We need this copy to wrap into v8 context data field.
    weak_ptr<Scripter> weakThis;

    // prevent double initialize() call - it is dangerous
    bool initialized = false;

    ConditionVar waitExitVar;
    int exitCode = 0;
    bool waitExit = false;

    // we should not put this code in the constructor as it uses shared_from_this()
    void initialize();

    // Sleep timer is in exclusive use of this function:
    friend void JsTimer(const v8::FunctionCallbackInfo<v8::Value> &args);

    // used to implement JS timers.
    AsyncSleep asyncSleep;

    // prevent attack on system timer double initialization
    bool _timersReady = false;

    std::string root;
    std::string home;
    std::vector<std::string> require_roots;

    v8::Isolate *pIsolate;
    v8::Isolate::CreateParams create_params;

    v8::Persistent<v8::Context> context;

    // do not construct it manually
    explicit Scripter();
};

class ScriptError : public runtime_error {
public:
    using runtime_error::runtime_error;
};

class SyntaxError : public ScriptError {
public:
    using ScriptError::ScriptError;
};

class ArgsContext {
public:
    shared_ptr<Scripter> scripter;
    Isolate *isolate;
    Local<Context> context;
    const FunctionCallbackInfo<Value> &args;


    ArgsContext(const shared_ptr<Scripter> &scripter_, const FunctionCallbackInfo<Value> &args_)
            : args(args_), scripter(scripter_), isolate(args_.GetIsolate()),
              context(isolate->GetEnteredContext()), pcontext(nullptr) {
    }

    template<typename T>
    Local<T> as(int index) {
        return args[index].As<T>();
    }

    int32_t asInt(int index) {
        return args[index]->Int32Value(context).FromJust();
    }

    string asString(int index) {
        return scripter->getString(args[index]);
    }

    Local<Uint8Array> toBinary(const void* result,size_t size) {
        auto ab = ArrayBuffer::New(isolate, size);
        memcpy(ab->GetContents().Data(), result, size);
        return Uint8Array::New(ab, 0, size);
    }

    Local<Uint8Array> toBinary(const byte_vector& result) {
        return toBinary(result.data(), result.size());
    }


    Local<Uint8Array> toBinary(byte_vector&& result) {
        return toBinary(result.data(), result.size());
    }

    Local<String> toString(byte_vector&& result) {
        return String::NewFromUtf8(isolate, (const char*)result.data());
    }

    void throwError(const char* text) {
        scripter->throwError(text);
    }

    template <typename T>
    void setReturnValue(T&& value) {
        args.GetReturnValue().Set(value);
    }

    Local<String> v8String(string x, NewStringType t = NewStringType::kNormal) {
        return scripter->v8String(x, t);
    }

    Local<String> v8String(const char *cstr, NewStringType t = NewStringType::kNormal) {
        return scripter->v8String(cstr, t);
    }

//    template<class F>
//    void lockedContext(F &&f) {
//
//    }

private:
    Persistent<Context> *pcontext;

};

template<typename F>
void Scripter::unwrapArgs(
        const v8::FunctionCallbackInfo<v8::Value> &args,
        F &&block
) {
    Isolate *isolate = args.GetIsolate();
    HandleScope handle_scope(isolate);

    auto context = isolate->GetEnteredContext();
    Local<External> wrap = Local<External>::Cast(context->GetEmbedderData(1));
    auto weak = static_cast<weak_ptr<Scripter> *>(wrap->Value());
    shared_ptr<Scripter> scripter = weak->lock();
    if (scripter) {
        Context::Scope context_scope(context);
        block(ArgsContext(scripter, args));
    } else {
        cerr << "called inContext for recycled SR: ignoring" << endl;
    }

}


#endif //U8_SCRIPTENVIRONMENT_H