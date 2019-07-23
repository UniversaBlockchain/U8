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
#include <future>

#include "../tools/Logging.h"
#include "../tools/tools.h"
#include "../tools/AsyncSleep.h"
#include "../tools/ConditionVar.h"
#include "binding_tools.h"

using namespace std;
using namespace v8;

class ArgsContext;

class Scripter : public std::enable_shared_from_this<Scripter>, public Logging {
public:
    typedef function<void(Local<Context> &)> ContextCallback;


    // ------------------- helpers -------------------------------
    Local<String> v8String(string x, NewStringType t = NewStringType::kNormal) {
        return String::NewFromUtf8(pIsolate, x.c_str(), t).ToLocalChecked();
    }

    Local<Integer> v8Int(int value) { return Integer::New(pIsolate, value); }

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
    static int Application(const char *argv0, function<int(shared_ptr<Scripter>)> &&block);

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

    int runAsMain(string sourceScript, const vector<string> &&args, string fileName);

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
    inline void lockedContext(ContextCallback &&block) {
        callbacks.put(block);
    }

    /**
     *
     * Deprecated. Executes async block in the VM thread. Use lockedContext that does exactly same but has less
     * confusing name.
     *
     * @param block to execute
     *
     * @deprecated this methpd
     */
    template<typename F>
    void inPool(F &&block) {
        lockedContext(block);
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
    bool getExitCode() { return exitCode; }

    /**
     * causes scripter main loop to exit with a code. All queued callbacks that are already in queue will be
     * executed.
     *
     * @param code exit code to report.
     */
    void exit(int code) {
        // in such a way we pass control to the main loop so it will wake and check exit condition:
        lockedContext([=](auto unused) {
            isActive = false;
            exitCode = code;
        });
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

    volatile bool isActive = true;
    int exitCode = 0;
    Queue<ContextCallback> callbacks;

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


class BufferHandler;

class FunctionHandler;

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

    shared_ptr<BufferHandler> asBuffer(unsigned index);

    shared_ptr<FunctionHandler> asFunction(unsigned index);

    int32_t asInt(int index) {
        return args[index]->Int32Value(context).FromJust();
    }

    long asLong(int index) {
        return args[index]->IntegerValue(context).FromJust();
    }

    string asString(int index) {
        return scripter->getString(args[index]);
    }

    Local<Uint8Array> toBinary(const void *result, size_t size) {
        auto ab = ArrayBuffer::New(isolate, size);
        memcpy(ab->GetContents().Data(), result, size);
        return Uint8Array::New(ab, 0, size);
    }

    Local<Uint8Array> toBinary(const byte_vector &result) {
        return toBinary(result.data(), result.size());
    }


    Local<Uint8Array> toBinary(byte_vector &&result) {
        return toBinary(result.data(), result.size());
    }

    Local<String> toString(byte_vector &&result) {
        return String::NewFromUtf8(isolate, (const char *) result.data());
    }

    void throwError(const char *text) {
        scripter->throwError(text);
    }

    void throwError(string &&text) {
        scripter->throwError(move(text));
    }

    template<typename T>
    void setReturnValue(T &&value) {
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

class ScripterHolder {
public:
    ScripterHolder(ArgsContext &ac) : _scripter(ac.scripter) {}

    Scripter *scripter() const { return _scripter.get(); }

    Isolate *isolate() const { return _scripter->isolate(); }

    template<typename F>
    inline auto lockedContext(F block) const { _scripter->lockedContext(block); }

protected:
    shared_ptr<Scripter> _scripter;
};

/**
 * Utility class to pass data from Javascript TypedArray to the sync process. It fixes
 * the array from garbage collection until it is no more used.
 * We recommend getting it from ArgsContext#asBuffer(int). We strongly recommend to use in with shared_ptr to
 * acoid useless copying and properly get the lifespan of the controlled resources.
 */
class BufferHandler : public ScripterHolder {
private:
    shared_ptr<Persistent<ArrayBuffer>> _pbuffer;
    void *_data;
    size_t _size;
public:
    BufferHandler(ArgsContext &ac, unsigned index) : ScripterHolder(ac) {
        auto l = ac.as<Uint8Array>(index);
        if( !l->IsTypedArray() )
            throw std::invalid_argument("not a typed array");
        auto buffer = l->Buffer();
        _pbuffer = make_shared<Persistent<ArrayBuffer>>(ac.isolate, buffer);
        auto contents = buffer->GetContents();
        _data = contents.Data();
        _size = contents.ByteLength();
    }

    ~BufferHandler() {
        // the stupd trick: we need to avoid referencing field of destructing object
        // strangely, we can't force copying field in the list, so:
        auto x = _pbuffer;
        // now persistent handle will survive destruction and will be freed later:
        _scripter->lockedContext([x](auto unused) { x->Reset(); });
    }

    /**
     * @return address of the buffer's first byte
     */
    inline auto data() const { return _data; }

    /**
     * @return size of the #data() buffer, in bytes.
     */
    inline auto size() const { return _size; }
};

/**
 * Utility class to conveniently hold the Javascript function handle across async operation. Do not forget
 * to enter Scripter#lockedContext() first before invoking/calling it! Use
 * ArgsContext#asFunction(int) to get an instance conveniently. We recommend using only in shared_ptr to avoid useless
 * copying.
 */
class FunctionHandler : public ScripterHolder {
private:
    shared_ptr<Persistent<Function>> _pfunction;

public:

    MaybeLocal<Value> call(Local<Context> &cxt, int argsCount, Local<Value> *args) const {
        auto fn = _pfunction->Get(cxt->GetIsolate());
        if (fn->IsFunction()) {
            return fn->Call(cxt, fn, argsCount, args);
        } else {
            cerr << "callback is not a function\n";
            _scripter->throwError("callback is not a function");
            // and return empty MaybeLocal
            return MaybeLocal<Value>();
        }
    }

    MaybeLocal<Value> call(Local<Context> &cxt, int argsCount, const Local<Value> *args) const {
        return call(cxt, argsCount, const_cast<Local<Value> *>(args));
    }

    /**
     * Performs call with a single argument.
     *
     * @param singleArg to pass to callback
     */
    void invoke(Local<Value> &&singleArg) const {
        Local<Value> x[] = {singleArg};
        invoke(1, x);
    }

    /**
     * Performs call with array of argumments.
     *
     * @param argsCount number of arguments
     * @param args to pass to the callback
     */
    void invoke(int argsCount, Local<Value> *args) const {
        _scripter->inContext([=](Local<Context> cxt) {
            call(cxt, argsCount, args);
        });
    }

    void invoke() const {
        invoke(0, nullptr);
    }

    MaybeLocal<Value> call(Local<Context> &cxt, Local<Value> &&singleArg) const {
        return call(cxt, 1, &singleArg);
    }

    FunctionHandler(ArgsContext &ac, unsigned index)
            : ScripterHolder(ac) {
        _pfunction = make_shared<Persistent<Function>>(ac.isolate, ac.as<Function>(index));
    }

    ~FunctionHandler() {
        // we need _pfunction content to live after destruction - until in context:
        auto x = _pfunction;
        // now we jsuc copy it
        _scripter->lockedContext([x](auto unused) { x->Reset(); });
    }
};

inline shared_ptr<BufferHandler> ArgsContext::asBuffer(unsigned index) {
    return make_shared<BufferHandler>(*this, index);
}

inline shared_ptr<FunctionHandler> ArgsContext::asFunction(unsigned index) {
    return make_shared<FunctionHandler>(*this, index);
}

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
        ArgsContext ac(scripter, args);
        try {
            block(ac);
        }
        catch (const exception &e) {
            ac.throwError("unhandled C++ exception: "s + e.what());
        }
    } else {
        cerr << "called inContext for recycled SR: ignoring" << endl;
    }

}


#endif //U8_SCRIPTENVIRONMENT_H
