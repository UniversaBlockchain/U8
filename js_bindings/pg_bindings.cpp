//
// Created by Tairov Dmitriy on 18.03.19.
//

#include "pg_bindings.h"
#include "binding_tools.h"
#include "../db/PGPool.h"

static Persistent<FunctionTemplate> PGPoolTemplate;
static Persistent<FunctionTemplate> BusyConnectionTemplate;

// PGPool methods

void JsPGPoolConnect(const FunctionCallbackInfo<Value> &args) {
    Scripter::unwrapArgs(args, [&](ArgsContext &ac) {

        auto scripter = ac.scripter;
        if (args.Length() != 2)
            scripter->throwError("invalid number of arguments");

        auto pool = unwrap<db::PGPool>(args.This());

        pair<bool, string> result = pool->connect(ac.asInt(0), ac.asString(1));
        //ac.setReturnValue(result.second);
    });
}

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
            db::BusyConnection* connection = new db::BusyConnection();
            connection->moveFrom(std::move(conn));

            // here we are in another thread
            scripter->inPool([=](auto context) {
                Isolate *isolate = context->GetIsolate();
                auto fn = pcb->Get(isolate);
                Local<Value> res[1] {wrap(BusyConnectionTemplate, isolate, connection)};
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
    // Bind object with default constructor
    Local<FunctionTemplate> tpl = bindCppClass<db::PGPool>(isolate, "PGPool");

    // instance methods
    auto prototype = tpl->PrototypeTemplate();
    prototype->Set(isolate, "version", String::NewFromUtf8(isolate, "0.0.1"));
    prototype->Set(isolate, "_connect", FunctionTemplate::New(isolate, JsPGPoolConnect));
    prototype->Set(isolate, "_withConnection", FunctionTemplate::New(isolate, JsPGPoolWithConnection));
    prototype->Set(isolate, "_totalConnections", FunctionTemplate::New(isolate, JsPGPoolTotalConnections));
    prototype->Set(isolate, "_availableConnections", FunctionTemplate::New(isolate, JsPGPoolAvailableConnections));

    // register it into global namespace
    PGPoolTemplate.Reset(isolate, tpl);
    global->Set(isolate, "PGPool", tpl);
}

void JsInitBusyConnection(Isolate *isolate, const Local<ObjectTemplate> &global) {
    // Bind object with default constructor
    Local<FunctionTemplate> tpl = bindCppClass<db::BusyConnection>(isolate, "BusyConnection");

    // instance methods
    auto prototype = tpl->PrototypeTemplate();
    prototype->Set(isolate, "version", String::NewFromUtf8(isolate, "0.0.1"));
    prototype->Set(isolate, "_executeQuery", FunctionTemplate::New(isolate, JsBusyConnectionExecuteQuery));

    // register it into global namespace
    BusyConnectionTemplate.Reset(isolate, tpl);
    global->Set(isolate, "BusyConnection", tpl);
}