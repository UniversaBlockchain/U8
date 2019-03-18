//
// Created by Tairov Dmitriy on 18.03.19.
//

#include "pg_bindings.h"
#include "binding_tools.h"
#include "../db/PGPool.h"

static Persistent<FunctionTemplate> PGPoolTemplate;
static Persistent<FunctionTemplate> BusyConnectionTemplate;

// PGPool(int poolSize, const std::string& connectString);
db::PGPool* JsPGPool(const FunctionCallbackInfo<Value> &args) {
    int poolSize = 0;
    std::string connectString = "";

    Scripter::unwrapArgs(args, [&](ArgsContext &ac) {

        auto scripter = ac.scripter;
        if (args.Length() != 2)
            scripter->throwError("invalid number of arguments");

        poolSize = ac.asInt(0);
        connectString = ac.asString(1);
    });

    if (poolSize && !connectString.empty())
        return new db::PGPool(poolSize, connectString);
    else
        return nullptr;
}

// PGPool methods

void JsPGPoolWithConnection(const FunctionCallbackInfo<Value> &args) {
    Scripter::unwrapArgs(args, [&](ArgsContext &ac) {

        auto scripter = ac.scripter;
        if (args.Length() != 1)
            scripter->throwError("invalid number of arguments");

        auto pool = unwrap<db::PGPool>(args.This());

        auto fn = ac.as<Function>(0);
        if (fn->IsNull() || fn->IsUndefined()) {
            scripter->throwError("null callback in PGPool::withConnection");
            return;
        }
        Persistent<Function> *pcb = new Persistent<Function>(ac.isolate, fn);

        pool->withConnection([=](db::BusyConnection&& conn) {
            db::BusyConnection connection = std::move(conn);

            // here we are in another thread
            scripter->inPool([=](auto context) {
                Isolate *isolate = context->GetIsolate();
                auto fn = pcb->Get(isolate);
                Local<Value> res[1] {wrap(BusyConnectionTemplate, isolate, (db::BusyConnection*) &connection)};
                fn->Call(fn, 1, res);
                delete pcb;
            });
        });
    });
}

void JsPGPoolTotalConnections(const FunctionCallbackInfo<Value> &args) {
    Scripter::unwrapArgs(args, [&](ArgsContext &ac) {

        auto scripter = ac.scripter;
        if (args.Length() != 0)
            scripter->throwError("invalid number of arguments");

        auto pool = unwrap<db::PGPool>(args.This());

        unsigned int result = pool->totalConnections();
        ac.setReturnValue(result);
    });
}

void JsPGPoolAvailableConnections(const FunctionCallbackInfo<Value> &args) {
    Scripter::unwrapArgs(args, [&](ArgsContext &ac) {

    auto scripter = ac.scripter;
    if (args.Length() != 0)
        scripter->throwError("invalid number of arguments");

        auto pool = unwrap<db::PGPool>(args.This());

        unsigned int result = pool->availableConnections();
        ac.setReturnValue(result);
    });
}

// BusyConnection methods

void JsBusyConnectionExecuteQuery(const FunctionCallbackInfo<Value> &args) {
    Scripter::unwrapArgs(args, [&](ArgsContext &ac) {

    });
}

// Classes bindings

void JsInitPGPool(Isolate *isolate, const Local<ObjectTemplate> &global) {
    // Bind object with constructor PGPool(int poolSize, const std::string& connectString);
    Local<FunctionTemplate> tpl = bindCppClass<db::PGPool>(isolate, "PGPool", JsPGPool);

    // instance methods
    auto prototype = tpl->PrototypeTemplate();
    prototype->Set(isolate, "version", String::NewFromUtf8(isolate, "0.0.1"));
    prototype->Set(isolate, "_withConnection", FunctionTemplate::New(isolate, JsPGPoolWithConnection));
    prototype->Set(isolate, "_totalConnections", FunctionTemplate::New(isolate, JsPGPoolTotalConnections));
    prototype->Set(isolate, "_availableConnections", FunctionTemplate::New(isolate, JsPGPoolAvailableConnections));

    // register it into global namespace
    PGPoolTemplate.Reset(isolate, tpl);
    global->Set(isolate, "PGPool", tpl);
}

void JsInitBusyConnection(Isolate *isolate, const Local<ObjectTemplate> &global) {
    // Bind object with constructor
    /*Local<FunctionTemplate> tpl = bindCppClass<db::BusyConnection>(isolate, "BusyConnection");

    // instance methods
    auto prototype = tpl->PrototypeTemplate();
    prototype->Set(isolate, "version", String::NewFromUtf8(isolate, "0.0.1"));
    prototype->Set(isolate, "_executeQuery", FunctionTemplate::New(isolate, JsBusyConnectionExecuteQuery));

    // register it into global namespace
    BusyConnectionTemplate.Reset(isolate, tpl);
    global->Set(isolate, "BusyConnection", tpl);*/
}