//
// Created by Sergey Chernov on 2019-01-04.
//

#ifndef U8_SCRIPTENVIRONMENT_H
#define U8_SCRIPTENVIRONMENT_H

#include <string>
#include <vector>
#include <v8.h>

class ScriptEnvironment {
public:

    /**
     * Create environment using base folder informagion from argv0
     * @param argv0
     */
    explicit ScriptEnvironment(const char* argv0);

    std::string expandPath(const std::string &path);

    std::string loadFileAsString(const std::string& fileName);

    v8::Isolate *isolate() const { return pIsolate; }

    v8::Local<v8::Context> getContext() { return context.Get(pIsolate); }

    void inContext( std::function<void(v8::Local<v8::Context>&)> block ) {
        v8::HandleScope handle_scope(pIsolate);
        auto cxt = context.Get(pIsolate);
        v8::Context::Scope context_scope(cxt);
        block(cxt);
    }

    std::string resolveRequiredFile(const std::string& filName);

    virtual ~ScriptEnvironment();

private:
    std::string root;
    std::string home;
    std::vector<std::string> require_roots;

    v8::Isolate *pIsolate;
    v8::Isolate::CreateParams create_params;

    v8::Persistent<v8::Context> context;
};


#endif //U8_SCRIPTENVIRONMENT_H
