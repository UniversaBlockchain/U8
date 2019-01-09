//
// Created by Sergey Chernov on 2019-01-04.
//

#ifndef U8_SCRIPTENVIRONMENT_H
#define U8_SCRIPTENVIRONMENT_H

#include <string>
#include <vector>
#include <v8.h>

#include "Logging.h"
#include "AsyncSleep.h"

using namespace std;

class Scripter : public std::enable_shared_from_this<Scripter>, public Logging {
public:

    static shared_ptr<Scripter> New(const char *scriptToExecute = nullptr, const char *argv0 = nullptr);

    std::string expandPath(const std::string &path);

    std::string loadFileAsString(const std::string &fileName);

    v8::Isolate *isolate() const { return pIsolate; }

//    v8::Local<v8::Context> getContext() { return context.Get(pIsolate); }

    void inContext(const std::function<void(const v8::Local<v8::Context> &)> &block) {
        v8::HandleScope handle_scope(pIsolate);
        auto cxt = context.Get(pIsolate);
        v8::Context::Scope context_scope(cxt);
        block(cxt);
    }

    void lockedContext(const std::function<void(const v8::Local<v8::Context> &)> &block) {
        v8::Locker locker(pIsolate);
        v8::HandleScope handle_scope(pIsolate);
        auto cxt = context.Get(pIsolate);
//        cxt->Enter();
        v8::Context::Scope context_scope(cxt);
        block(cxt);
//        cxt->Exit();
    }

    static void unwrap (
            const v8::FunctionCallbackInfo<v8::Value> &args,
            const std::function<void(shared_ptr<Scripter>, v8::Isolate *, const v8::Local<v8::Context> &)> &block
    );

    std::string resolveRequiredFile(const std::string &filName);

    virtual ~Scripter();

    void initTimer() {
        if (!_timersReady) {
            _timersReady = true;
        }
    }

    bool timersReady() const { return _timersReady; }

private:

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

    // do not construct it!
    explicit Scripter(const char *argv0);
};


#endif //U8_SCRIPTENVIRONMENT_H
