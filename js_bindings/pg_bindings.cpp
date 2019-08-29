/*
 * Copyright (c) 2019 Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

#include "pg_bindings.h"
#include "binding_tools.h"
#include "../db/PGPool.h"

static Persistent<FunctionTemplate> PGPoolTemplate;
static Persistent<FunctionTemplate> BusyConnectionTemplate;
static Persistent<FunctionTemplate> QueryResultTemplate;

// PGPool methods

void JsPGPoolConnect(const FunctionCallbackInfo<Value> &args) {
    Scripter::unwrapArgs(args, [](ArgsContext &ac) {
        if (ac.args.Length() == 2) {
            auto pool = unwrap<db::PGPool>(ac.args.This());
            pair<bool, string> result = pool->connect(ac.asInt(0), ac.asString(1));
            string s("");
            if (!result.first)
                s = result.second;
            ac.setReturnValue(ac.v8String(s));
            return;
        }
        ac.throwError("invalid number of arguments");
    });
}

void JsPGPoolWithConnection(const FunctionCallbackInfo<Value> &args) {
    Scripter::unwrapArgs(args, [](ArgsContext &ac) {
        if (ac.args.Length() == 1) {
            auto pool = unwrap<db::PGPool>(ac.args.This());
            auto onReady = ac.asFunction(0);
            pool->withConnection([=](shared_ptr<db::BusyConnection> conn) {
                onReady->lockedContext([=](Local<Context> &cxt){
                    onReady->invoke(wrap(BusyConnectionTemplate, onReady->isolate(), conn.get()));
                });
            });
            return;
        }
        ac.throwError("invalid number of arguments");
    });
}

void JsPGPoolTotalConnections(const FunctionCallbackInfo<Value> &args) {
    Scripter::unwrapArgs(args, [](ArgsContext &ac) {
        if (ac.args.Length() == 0) {
            auto pool = unwrap<db::PGPool>(ac.args.This());
            unsigned int result = pool->totalConnections();
            ac.setReturnValue(result);
            return;
        }
        ac.throwError("invalid number of arguments");
    });
}

void JsPGPoolAvailableConnections(const FunctionCallbackInfo<Value> &args) {
    Scripter::unwrapArgs(args, [](ArgsContext &ac) {
        if (ac.args.Length() == 0) {
            auto pool = unwrap<db::PGPool>(ac.args.This());
            unsigned int result = pool->availableConnections();
            ac.setReturnValue(result);
            return;
        }
        ac.throwError("invalid number of arguments");
    });
}

void JsPGPoolClose(const FunctionCallbackInfo<Value> &args) {
    Scripter::unwrapArgs(args, [](ArgsContext &ac) {
        if (ac.args.Length() == 0) {
            auto pool = unwrap<db::PGPool>(ac.args.This());
            pool->close();
            return;
        }
        ac.throwError("invalid number of arguments");
    });
}

// BusyConnection methods

void JsBusyConnectionExecuteQuery(const FunctionCallbackInfo<Value> &args) {
    Scripter::unwrapArgs(args, [](ArgsContext &ac) {
        if (ac.args.Length() == 4) {
            auto onSuccess = ac.asFunction(0);
            auto onError = ac.asFunction(1);
            auto queryString = ac.asString(2);

            vector<any> params;
            auto arr = v8::Handle<v8::Array>::Cast(ac.args[3]);
            for (size_t i = 0, count = arr->Length(); i < count; ++i) {
                if (arr->Get(i)->IsTypedArray()) {
                    auto contents = v8::Handle<v8::Uint8Array>::Cast(arr->Get(i))->Buffer()->GetContents();
                    byte_vector bv(contents.ByteLength());
                    memcpy(&bv[0], contents.Data(), contents.ByteLength());
                    params.push_back(bv);
                } else {
                    params.push_back(ac.scripter->getString(arr->Get(i)));
                }
            }

            auto con = unwrap<db::BusyConnection>(ac.args.This());

            con->executeQueryArrStr([=](db::QueryResult &&qr) {
                db::QueryResult *pqr = new db::QueryResult();
                pqr->moveFrom(std::move(qr));
                onSuccess->lockedContext([=](Local<Context> &cxt) {
                    onSuccess->invoke(wrap(QueryResultTemplate, cxt->GetIsolate(), pqr));
                });
            }, [=](const string &err) {
                onError->lockedContext([=](Local<Context> &cxt){
                    onError->invoke(onError->scripter()->v8String(err));
                });
            }, queryString, params);
            return;
        }
        ac.throwError("invalid number of arguments");
    });
}

void JsBusyConnectionExecuteUpdate(const FunctionCallbackInfo<Value> &args) {
    Scripter::unwrapArgs(args, [](ArgsContext &ac) {
        if (ac.args.Length() == 4) {
            auto onSuccess = ac.asFunction(0);
            auto onError = ac.asFunction(1);
            auto queryString = ac.asString(2);

            vector<any> params;
            auto arr = v8::Handle<v8::Array>::Cast(ac.args[3]);
            for (size_t i = 0, count = arr->Length(); i < count; ++i) {
                if (arr->Get(i)->IsTypedArray()) {
                    auto contents = v8::Handle<v8::Uint8Array>::Cast(arr->Get(i))->Buffer()->GetContents();
                    byte_vector bv(contents.ByteLength());
                    memcpy(&bv[0], contents.Data(), contents.ByteLength());
                    params.push_back(bv);
                } else {
                    params.push_back(ac.scripter->getString(arr->Get(i)));
                }
            }

            auto con = unwrap<db::BusyConnection>(ac.args.This());

            con->executeUpdateArrStr([=](int affectedRows) {
                onSuccess->lockedContext([=](Local<Context> &cxt){
                    onSuccess->invoke(Number::New(cxt->GetIsolate(), affectedRows));
                });
            }, [=](const string &err) {
                onError->lockedContext([=](Local<Context> &cxt){
                    onError->invoke(onError->scripter()->v8String(err));
                });
            }, queryString, params);

            return;
        }
        ac.throwError("invalid number of arguments");
    });
}

void JsBusyConnectionExec(const FunctionCallbackInfo<Value> &args) {
    Scripter::unwrapArgs(args, [](ArgsContext &ac) {
        if (ac.args.Length() == 3) {
            auto onSuccess = ac.asFunction(0);
            auto onError = ac.asFunction(1);
            auto queryString = ac.asString(2);

            auto con = unwrap<db::BusyConnection>(ac.args.This());

            con->exec(queryString, [=](db::QueryResultsArr &qra) {
                bool isSuccess = true;
                std::string errorText = "";
                for (auto &qr : qra) {
                    if (qr.isError()) {
                        isSuccess = false;
                        errorText = qr.getErrorText();
                        break;
                    }
                }
                if (isSuccess) {
                    onSuccess->lockedContext([=](Local<Context> &cxt) {
                        onSuccess->invoke();
                    });
                } else {
                    onError->lockedContext([=](Local<Context> &cxt) {
                        onError->invoke(onError->scripter()->v8String(errorText));
                    });
                }
            });
            return;
        }
        ac.throwError("invalid number of arguments");
    });
}

void JsBusyConnectionRelease(const FunctionCallbackInfo<Value> &args) {
    Scripter::unwrapArgs(args, [](ArgsContext &ac) {
        if (ac.args.Length() == 0) {
            auto con = unwrap<db::BusyConnection>(ac.args.This());
            con->release();
            return;
        }
        ac.throwError("invalid number of arguments");
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
    prototype->Set(isolate, "_exec", FunctionTemplate::New(isolate, JsBusyConnectionExec));
    prototype->Set(isolate, "_release", FunctionTemplate::New(isolate, JsBusyConnectionRelease));

    // register it into global namespace
    BusyConnectionTemplate.Reset(isolate, tpl);
    global->Set(isolate, "BusyConnection", tpl);
}

void JsQueryResultGetRowsCount(const FunctionCallbackInfo<Value> &args) {
    Scripter::unwrapArgs(args, [](ArgsContext &ac) {
        if (ac.args.Length() == 0) {
            auto pqr = unwrap<db::QueryResult>(ac.args.This());
            int result = pqr->getRowsCount();
            ac.setReturnValue(result);
            return;
        }
        ac.throwError("invalid number of arguments");
    });
}

void JsQueryResultGetColsCount(const FunctionCallbackInfo<Value> &args) {
    Scripter::unwrapArgs(args, [](ArgsContext &ac) {
        if (ac.args.Length() == 0) {
            auto pqr = unwrap<db::QueryResult>(ac.args.This());
            int result = pqr->getColsCount();
            ac.setReturnValue(result);
            return;
        }
        ac.throwError("invalid number of arguments");
    });
}

void JsQueryResultGetAffectedRows(const FunctionCallbackInfo<Value> &args) {
    Scripter::unwrapArgs(args, [](ArgsContext &ac) {
        if (ac.args.Length() == 0) {
            auto pqr = unwrap<db::QueryResult>(ac.args.This());
            int result = pqr->getAffectedRows();
            ac.setReturnValue(result);
            return;
        }
        ac.throwError("invalid number of arguments");
    });
}

void JsQueryResultGetColNames(const FunctionCallbackInfo<Value> &args) {
    Scripter::unwrapArgs(args, [](ArgsContext &ac) {
        if (ac.args.Length() == 0) {
            auto pqr = unwrap<db::QueryResult>(ac.args.This());
            auto colNames = pqr->getColNames();

            Local<Value> res[colNames.size()];
            for (int i = 0; i < colNames.size(); ++i)
                res[i] = ac.v8String(colNames[i]);
            Local<Array> result = Array::New(ac.args.GetIsolate(), res, colNames.size());
            ac.setReturnValue(result);
            return;
        }
        ac.throwError("invalid number of arguments");
    });
}

void JsQueryResultGetColTypes(const FunctionCallbackInfo<Value> &args) {
    Scripter::unwrapArgs(args, [](ArgsContext &ac) {
        if (ac.args.Length() == 0) {
            auto pqr = unwrap<db::QueryResult>(ac.args.This());
            auto colTypes = pqr->getColTypes();

            Local<Value> res[colTypes.size()];
            for (int i = 0; i < colTypes.size(); ++i)
                res[i] = ac.v8String(colTypes[i]);
            Local<Array> result = Array::New(ac.args.GetIsolate(), res, colTypes.size());
            ac.setReturnValue(result);
            return;
        }
        ac.throwError("invalid number of arguments");
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
    {"name", [](ArgsContext &ac, const byte_vector& bv){
        return ac.v8String(db::getStringValue(bv));
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
    Scripter::unwrapArgs(args, [](ArgsContext &ac) {
        if (ac.args.Length() == 1) {
            auto maxRows = ac.asInt(0);
            auto pqr = unwrap<db::QueryResult>(ac.args.This());
            auto rows = pqr->getRows(maxRows);

            if (rows.size() == 0) {
                Local<Value> res[0];
                Local<Array> result = Array::New(ac.args.GetIsolate(), res, rows.size());
                ac.setReturnValue(result);
            } else {
                auto colTypes = pqr->getColTypes();
                auto colsCount = rows[0].size();
                Local<Value> res[rows.size() * colsCount];
                for (int iRow = 0; iRow < rows.size(); ++iRow) {
                    for (int iCol = 0; iCol < colsCount; ++iCol) {
                        res[iRow * colsCount + iCol] = getJsValueFromPgResult(ac, rows[iRow][iCol], colTypes[iCol]);
                    }
                }
                Local<Array> result = Array::New(ac.args.GetIsolate(), res, rows.size() * colsCount);
                ac.setReturnValue(result);
            }
            return;
        }
        ac.throwError("invalid number of arguments");
    });
}

void JsQueryResultRelease(const FunctionCallbackInfo<Value> &args) {
    Scripter::unwrapArgs(args, [](ArgsContext &ac) {
        if (ac.args.Length() == 0) {
            auto pqr = unwrap<db::QueryResult>(ac.args.This());
            delete pqr;
            return;
        }
        ac.throwError("invalid number of arguments");
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
    prototype->Set(isolate, "_release", FunctionTemplate::New(isolate, JsQueryResultRelease));

    // register it into global namespace
    QueryResultTemplate.Reset(isolate, tpl);
    global->Set(isolate, "QueryResult", tpl);
}
