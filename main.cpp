#include <iostream>
#include <stdlib.h>
#include <string.h>
#include <thread>

#include <v8.h>
#include <libplatform/libplatform.h>

#include "Scripter.h"

using namespace std;


int main(int argc, char **argv) {

    v8::V8::InitializeICUDefaultLocation(argv[0]);
    v8::V8::InitializeExternalStartupData(argv[0]);
    std::unique_ptr<v8::Platform> platform = v8::platform::NewDefaultPlatform();
    v8::V8::InitializePlatform(platform.get());
    v8::V8::Initialize();

    // Create a new Isolate and make it the current one.
    {
        shared_ptr<Scripter> se = Scripter::New(0, argv[0]);
        // Enter the context for compiling and running the hello world script.

//            v8::HandleScope handle_scope(se.isolate());
//            auto context = se.getContext();

//            v8::Context::Scope context_scope(context);
        se->inContext([&](auto context) {
            // Create a string containing the JavaScript source code.
            auto src = se->loadFileAsString("init_full.js");
            src = src + "\n//# sourceURL="+"jslib/init_full.js\n";
            v8::Local<v8::String> source =
                    v8::String::NewFromUtf8(se->isolate(), src.c_str(),
                                            v8::NewStringType::kNormal)
                            .ToLocalChecked();

            // Compile the source code.
            auto scriptResult =
                    v8::Script::Compile(context, source);
            if (scriptResult.IsEmpty()) {
                cout << "Compilation failed:" << endl << src;
            } else {
                v8::Local<v8::Script> script = scriptResult.ToLocalChecked();

                // Run the script to get the result.
                auto maybeResult = script->Run(context);
                if (maybeResult.IsEmpty()) {
                    cout << "Error running script... strange";
                } else {
                    v8::Local<v8::Value> result = maybeResult.ToLocalChecked();

                    // Convert the result to an UTF8 string and print it.
                    v8::String::Utf8Value utf8(se->isolate(), result);
                    printf("%s\n", *utf8);
                }
            }
            std::this_thread::sleep_for(1s);
        });
        // Dispose the isolate and tear down V8.
    }
    cout << "se should be already recycled"<< endl;

    v8::V8::Dispose();
    v8::V8::ShutdownPlatform();
//    delete create_params.array_buffer_allocator;

    return 0;
}