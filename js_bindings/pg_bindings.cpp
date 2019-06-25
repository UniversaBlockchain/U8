//
// Created by Tairov Dmitriy on 18.03.19.
//

#include "pg_bindings.h"
#include "binding_tools.h"
#include "../db/PGPool.h"

static Persistent<FunctionTemplate> PGPoolTemplate;
static Persistent<FunctionTemplate> BusyConnectionTemplate;
static Persistent<FunctionTemplate> QueryResultTemplate;

// PGPool methods

void JsPGPoolConnect(const FunctionCallbackInfo<Value> &args) {
    Scripter::unwrapArgs(args, [&](ArgsContext &ac) {

        auto scripter = ac.scripter;
        if (args.Length() != 2)
            scripter->throwError("invalid number of arguments");

        auto pool = unwrap<db::PGPool>(args.This());

        pair<bool, string> result = pool->connect(ac.asInt(0), ac.asString(1));
        string s("");
        if (!result.first)
            s = result.second;
        ac.setReturnValue(ac.v8String(s));
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

        pool->withConnection([=](shared_ptr<db::BusyConnection> conn) {
            // here we are in another thread
            scripter->inPool([=](auto context) {
                Isolate *isolate = context->GetIsolate();
                auto fn = pcb->Get(isolate);
                Local<Value> res[1] {wrap(BusyConnectionTemplate, isolate, conn.get())};
                auto unused = fn->Call(context, fn, 1, res);
                pcb->Reset();
                delete pcb;
                //pool->releaseConnection(conn);
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

void JsPGPoolClose(const FunctionCallbackInfo<Value> &args) {
    Scripter::unwrapArgs(args, [&](ArgsContext &ac) {
        auto scripter = ac.scripter;
        if (args.Length() != 0)
            scripter->throwError("invalid number of arguments");

        auto pool = unwrap<db::PGPool>(args.This());
        pool->close();
    });
}

void JsPGPoolExec(const FunctionCallbackInfo<Value> &args) {
    Scripter::unwrapArgs(args, [&](ArgsContext &ac) {

        auto scripter = ac.scripter;
        if (args.Length() != 3)
            scripter->throwError("invalid number of arguments");

        auto onSuccess = ac.as<Function>(0);
        if (onSuccess->IsNull() || onSuccess->IsUndefined()) {
            scripter->throwError("null onSuccess in JsBusyConnectionExecuteQuery");
            return;
        }
        Persistent<Function> *onSuccessPcb = new Persistent<Function>(ac.isolate, onSuccess);
        auto onError = ac.as<Function>(1);
        if (onError->IsNull() || onError->IsUndefined()) {
            scripter->throwError("null onError in JsBusyConnectionExecuteQuery");
            return;
        }
        Persistent<Function> *onErrorPcb = new Persistent<Function>(ac.isolate, onError);
        auto queryString = ac.asString(2);

        auto pool = unwrap<db::PGPool>(args.This());

        pool->exec(queryString, [=](db::QueryResultsArr &qra){
            bool isSuccess = true;
            std::string errorText = "";
            for (auto &qr : qra) {
                if (qr.isError()) {
                    isSuccess = true;
                    errorText = qr.getErrorText();
                    break;
                }
            }
            if (isSuccess) {
                scripter->inPool([=](auto context) {
                    Isolate *isolate = context->GetIsolate();
                    auto fn = onSuccessPcb->Get(isolate);
                    auto unused = fn->Call(context, fn, 0, nullptr);
                    onSuccessPcb->Reset();
                    onErrorPcb->Reset();
                    delete onSuccessPcb;
                    delete onErrorPcb;
                });
            } else {
                scripter->inPool([=](auto context) {
                    Isolate *isolate = context->GetIsolate();
                    auto fn = onErrorPcb->Get(isolate);
                    Local<Value> result = scripter->v8String(errorText);
                    auto unused = fn->Call(context, fn, 1, &result);
                    onSuccessPcb->Reset();
                    onErrorPcb->Reset();
                    delete onSuccessPcb;
                    delete onErrorPcb;
                });
            }
        });
    });
}

// BusyConnection methods

void JsBusyConnectionExecuteQuery(const FunctionCallbackInfo<Value> &args) {
    Scripter::unwrapArgs(args, [&](ArgsContext &ac) {

        auto scripter = ac.scripter;
        if (args.Length() != 4)
            scripter->throwError("invalid number of arguments");

        auto onSuccess = ac.as<Function>(0);
        if (onSuccess->IsNull() || onSuccess->IsUndefined()) {
            scripter->throwError("null onSuccess in JsBusyConnectionExecuteQuery");
            return;
        }
        Persistent<Function> *onSuccessPcb = new Persistent<Function>(ac.isolate, onSuccess);
        auto onError = ac.as<Function>(1);
        if (onError->IsNull() || onError->IsUndefined()) {
            scripter->throwError("null onError in JsBusyConnectionExecuteQuery");
            return;
        }
        Persistent<Function> *onErrorPcb = new Persistent<Function>(ac.isolate, onError);
        auto queryString = ac.asString(2);

        vector<any> params;
        auto arr = v8::Handle<v8::Array>::Cast(args[3]);
        for (size_t i = 0, count = arr->Length(); i < count; ++i) {
            if (arr->Get(i)->IsTypedArray()) {
                auto contents = v8::Handle<v8::Uint8Array>::Cast(arr->Get(i))->Buffer()->GetContents();
                byte_vector bv(contents.ByteLength());
                memcpy(&bv[0], contents.Data(), contents.ByteLength());
                params.push_back(bv);
            } else {
                params.push_back(scripter->getString(arr->Get(i)));
            }
        }

        auto con = unwrap<db::BusyConnection>(args.This());

        con->executeQueryArrStr([=](db::QueryResult&& qr){
            db::QueryResult* pqr = new db::QueryResult();
            pqr->moveFrom(std::move(qr));
            scripter->inPool([=](auto context) {
                Isolate *isolate = context->GetIsolate();
                auto fn = onSuccessPcb->Get(isolate);
                Local<Value> res[1] {wrap(QueryResultTemplate, isolate, pqr)};
                auto unused = fn->Call(context, fn, 1, res);
                onSuccessPcb->Reset();
                onErrorPcb->Reset();
                delete onSuccessPcb;
                delete onErrorPcb;
                delete pqr;
            });
        }, [=](const string& err){
            scripter->inPool([=](auto context) {
                Isolate *isolate = context->GetIsolate();
                auto fn = onErrorPcb->Get(isolate);
                Local<Value> result = scripter->v8String(err);
                auto unused = fn->Call(context, fn, 1, &result);
                onSuccessPcb->Reset();
                onErrorPcb->Reset();
                delete onSuccessPcb;
                delete onErrorPcb;
            });
        }, queryString, params);


    });
}

void JsBusyConnectionExecuteUpdate(const FunctionCallbackInfo<Value> &args) {
    Scripter::unwrapArgs(args, [&](ArgsContext &ac) {

        auto scripter = ac.scripter;
        if (args.Length() != 4)
            scripter->throwError("invalid number of arguments");

        auto onSuccess = ac.as<Function>(0);
        if (onSuccess->IsNull() || onSuccess->IsUndefined()) {
            scripter->throwError("null onSuccess in JsBusyConnectionExecuteQuery");
            return;
        }
        Persistent<Function> *onSuccessPcb = new Persistent<Function>(ac.isolate, onSuccess);
        auto onError = ac.as<Function>(1);
        if (onError->IsNull() || onError->IsUndefined()) {
            scripter->throwError("null onError in JsBusyConnectionExecuteQuery");
            return;
        }
        Persistent<Function> *onErrorPcb = new Persistent<Function>(ac.isolate, onError);
        auto queryString = ac.asString(2);

        vector<any> params;
        auto arr = v8::Handle<v8::Array>::Cast(args[3]);
        for (size_t i = 0, count = arr->Length(); i < count; ++i) {
            if (arr->Get(i)->IsTypedArray()) {
                auto contents = v8::Handle<v8::Uint8Array>::Cast(arr->Get(i))->Buffer()->GetContents();
                byte_vector bv(contents.ByteLength());
                memcpy(&bv[0], contents.Data(), contents.ByteLength());
                params.push_back(bv);
            } else {
                params.push_back(scripter->getString(arr->Get(i)));
            }
        }

        auto con = unwrap<db::BusyConnection>(args.This());

        con->executeUpdateArrStr([=](int affectedRows){
            scripter->inPool([=](auto context) {
                Isolate *isolate = context->GetIsolate();
                auto fn = onSuccessPcb->Get(isolate);
                Local<v8::Value> prm = Number::New(ac.isolate, affectedRows);
                auto unused = fn->Call(context, fn, 1, &prm);
                onSuccessPcb->Reset();
                onErrorPcb->Reset();
                delete onSuccessPcb;
                delete onErrorPcb;
            });
        }, [=](const string& err){
            scripter->inPool([=](auto context) {
                Isolate *isolate = context->GetIsolate();
                auto fn = onErrorPcb->Get(isolate);
                Local<Value> result = scripter->v8String(err);
                auto unused = fn->Call(context, fn, 1, &result);
                onSuccessPcb->Reset();
                onErrorPcb->Reset();
                delete onSuccessPcb;
                delete onErrorPcb;
            });
        }, queryString, params);


    });
}

void JsBusyConnectionRelease(const FunctionCallbackInfo<Value> &args) {
    Scripter::unwrapArgs(args, [&](ArgsContext &ac) {

        auto scripter = ac.scripter;
        if (args.Length() != 0)
            scripter->throwError("invalid number of arguments");

        auto con = unwrap<db::BusyConnection>(args.This());
        con->release();
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
    prototype->Set(isolate, "_close", FunctionTemplate::New(isolate, JsPGPoolClose));
    prototype->Set(isolate, "_exec", FunctionTemplate::New(isolate, JsPGPoolExec));

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
    prototype->Set(isolate, "_executeUpdate", FunctionTemplate::New(isolate, JsBusyConnectionExecuteUpdate));
    prototype->Set(isolate, "_release", FunctionTemplate::New(isolate, JsBusyConnectionRelease));

    // register it into global namespace
    BusyConnectionTemplate.Reset(isolate, tpl);
    global->Set(isolate, "BusyConnection", tpl);
}

void JsQueryResultGetRowsCount(const FunctionCallbackInfo<Value> &args) {
    Scripter::unwrapArgs(args, [&](ArgsContext &ac) {

        auto scripter = ac.scripter;
        if (args.Length() != 0)
            scripter->throwError("invalid number of arguments");

        auto pqr = unwrap<db::QueryResult>(args.This());

        unsigned int result = pqr->getRowsCount();
        ac.setReturnValue(result);
    });
}

void JsQueryResultGetColsCount(const FunctionCallbackInfo<Value> &args) {
    Scripter::unwrapArgs(args, [&](ArgsContext &ac) {

        auto scripter = ac.scripter;
        if (args.Length() != 0)
            scripter->throwError("invalid number of arguments");

        auto pqr = unwrap<db::QueryResult>(args.This());

        unsigned int result = pqr->getColsCount();
        ac.setReturnValue(result);
    });
}

void JsQueryResultGetAffectedRows(const FunctionCallbackInfo<Value> &args) {
    Scripter::unwrapArgs(args, [&](ArgsContext &ac) {

        auto scripter = ac.scripter;
        if (args.Length() != 0)
            scripter->throwError("invalid number of arguments");

        auto pqr = unwrap<db::QueryResult>(args.This());

        unsigned int result = pqr->getAffectedRows();
        ac.setReturnValue(result);
    });
}

void JsQueryResultGetColNames(const FunctionCallbackInfo<Value> &args) {
    Scripter::unwrapArgs(args, [&](ArgsContext &ac) {
        auto scripter = ac.scripter;
        if (args.Length() != 0)
            scripter->throwError("invalid number of arguments");

        auto pqr = unwrap<db::QueryResult>(args.This());
        auto colNames = pqr->getColNames();

        Local<Value> res[colNames.size()];
        for (int i = 0; i < colNames.size(); ++i)
            res[i] = ac.v8String(colNames[i]);
        Local<Array> result = Array::New(args.GetIsolate(), res, colNames.size());
        ac.setReturnValue(result);
    });
}

void JsQueryResultGetColTypes(const FunctionCallbackInfo<Value> &args) {
    Scripter::unwrapArgs(args, [&](ArgsContext &ac) {
        auto scripter = ac.scripter;
        if (args.Length() != 0)
            scripter->throwError("invalid number of arguments");

        auto pqr = unwrap<db::QueryResult>(args.This());
        auto colTypes = pqr->getColTypes();

        Local<Value> res[colTypes.size()];
        for (int i = 0; i < colTypes.size(); ++i)
            res[i] = ac.v8String(colTypes[i]);
        Local<Array> result = Array::New(args.GetIsolate(), res, colTypes.size());
        ac.setReturnValue(result);
    });
}

static unordered_map<string, std::function<Local<Value>(ArgsContext &ac, const byte_vector&)>> Converter
{
    {"int4", [](ArgsContext &ac, const byte_vector& bv){
        return Number::New(ac.isolate, db::getIntValue(bv));
    }},
    {"int8", [](ArgsContext &ac, const byte_vector& bv){
        return BigInt::New(ac.isolate, db::getLongValue(bv));
    }},
    {"text", [](ArgsContext &ac, const byte_vector& bv){
        return ac.v8String(db::getStringValue(bv));
    }},
    {"bytea", [](ArgsContext &ac, const byte_vector& bv){
        return ac.toBinary(bv);
    }},
    {"float8", [](ArgsContext &ac, const byte_vector& bv){
        return Number::New(ac.isolate, db::getDoubleValue(bv));
    }},
    {"bool", [](ArgsContext &ac, const byte_vector& bv){
        return v8::Boolean::New(ac.isolate, db::getBoolValue(bv));
    }},
};

Local<Value> getJsValueFromPgResult(ArgsContext &ac, const byte_vector& data, const string& pgType) {
    try {
        if (data.size() == 0)
            return v8::Null(ac.isolate);
        else if (Converter.find(pgType) != Converter.end())
            return Converter[pgType](ac, data);
    } catch (const std::exception& e) {
        return ac.v8String(std::string("conversion error: ") + e.what());
    }
    return ac.v8String("pg type error: " + pgType + " is not bound");
}

void JsQueryResultGetRows(const FunctionCallbackInfo<Value> &args) {
    Scripter::unwrapArgs(args, [&](ArgsContext &ac) {
        auto scripter = ac.scripter;
        if (args.Length() != 1)
            scripter->throwError("invalid number of arguments");

        auto maxRows = ac.asInt(0);

        auto pqr = unwrap<db::QueryResult>(args.This());
        auto rows = pqr->getRows(maxRows);

        if (rows.size() == 0) {
            Local<Value> res[0];
            Local<Array> result = Array::New(args.GetIsolate(), res, rows.size());
            ac.setReturnValue(result);
        } else {
            auto colTypes = pqr->getColTypes();
            auto colsCount = rows[0].size();
            Local<Value> res[rows.size() * colsCount];
            for (int iRow = 0; iRow < rows.size(); ++iRow) {
                for (int iCol = 0; iCol < colsCount; ++iCol) {
                    res[iRow*colsCount+iCol] = getJsValueFromPgResult(ac, rows[iRow][iCol], colTypes[iCol]);
                }
            }
            Local<Array> result = Array::New(args.GetIsolate(), res, rows.size()*colsCount);
            ac.setReturnValue(result);

        }
    });
}

void JsInitQueryResult(Isolate *isolate, const Local<ObjectTemplate> &global) {
    // Bind object with default constructor
    Local<FunctionTemplate> tpl = bindCppClass<db::QueryResult>(isolate, "QueryResult");

    // instance methods
    auto prototype = tpl->PrototypeTemplate();
    prototype->Set(isolate, "version", String::NewFromUtf8(isolate, "0.0.1"));
    prototype->Set(isolate, "_getRowsCount", FunctionTemplate::New(isolate, JsQueryResultGetRowsCount));
    prototype->Set(isolate, "_getColsCount", FunctionTemplate::New(isolate, JsQueryResultGetColsCount));
    prototype->Set(isolate, "_getAffectedRows", FunctionTemplate::New(isolate, JsQueryResultGetAffectedRows));
    prototype->Set(isolate, "_getColNames", FunctionTemplate::New(isolate, JsQueryResultGetColNames));
    prototype->Set(isolate, "_getColTypes", FunctionTemplate::New(isolate, JsQueryResultGetColTypes));
    prototype->Set(isolate, "_getRows", FunctionTemplate::New(isolate, JsQueryResultGetRows));

    // register it into global namespace
    QueryResultTemplate.Reset(isolate, tpl);
    global->Set(isolate, "QueryResult", tpl);
}
