#include <iostream>
#include <stdlib.h>
#include <string.h>
#include <thread>

#include <v8.h>
#include <libplatform/libplatform.h>

#include "Scripter.h"

#include "PrivateKey.h"
#include "base64.h"

using namespace std;

void testCrypto() {
    cout << "testCrypto()..." << endl;
    auto strE = std::string("65537");
    auto strP = std::string("166438984042065497734914068855004282550440498640409398677336546927308216381652973497991047247926391839370729407435808892969122519401712385345233169193805241631583305760736715545141142026706356434887369071360563025254193571054123994143642688583692644185979182810270581846072984179584787077062088254715187805453");
    auto strQ = std::string("132243238518154268249184631952046833494949171132278166597493094022019934205919755965484010862547916586956651043061215415694791928849764419123506916992508894879133969053226176271305106211090173517182720832250788947720397461739281147258617115635022042579209568022023702283912658756481633266987107149957718776027");
    auto body = base64_decode("cXdlcnR5MTIzNDU2");
    auto signfromJava = base64_decode("SWegggnmLTKKVqDWPdo3qVD7S1Y/VnQD1xCz70LHhg2PBksBfkGKdX4xeWUEqBl3/iq8Ketfb+3AbGYEKgBiCrhg4u3AQnKIe61F9Z3ZW7PexmK3h0cLKQ7ei2BjZXRhv839/9H7TKd5trnvZMMxAc8wmosZ96UVLBQ71F8L/74zTb+q+9ius2jb47EMqT3VOWNP/RkC5WpONj/5uBVNzNapQbCF8JrI4lBmQ9zuH+yGAp+Lm2blZYB0vkDxjRyEs38oxcHc6mW5OlTTviT0VN4AZiE7FKdRJBKR2+oigiLFyK/uvSc5UzO89JX14yWb7huMf8fvDHTB1vZOWHDyRw==");
    auto bodyForSign = std::vector<unsigned char>(body.begin(), body.end());
    auto sigForVerify = std::vector<unsigned char>(signfromJava.begin(), signfromJava.end());

    PrivateKey privateKey;
    privateKey.initForDebug_decimal(strE, strP, strQ);
    auto publicKey = privateKey.getPublicKey();

    std::vector<unsigned  char> encrypted;
    publicKey->encrypt(bodyForSign, encrypted);
    cout << "encrypted: " << base64_encode(&encrypted[0], encrypted.size()) << endl;
    std::vector<unsigned  char> decrypted;
    privateKey.decrypt(encrypted, decrypted);
    cout << "decrypted: " << base64_encode(&decrypted[0], decrypted.size()) << endl;

    auto verifyResult = publicKey->verify(sigForVerify, bodyForSign, PublicKey::SHA1);
    cout << "verifyResult: " << verifyResult << endl;
    cout << "testCrypto()... done!" << endl << endl;
}

int main(int argc, char **argv) {

    // Init crypto library
    ltc_mp = gmp_desc;
    if (register_prng(&sprng_desc) == -1)
        cout << "Error registering sprng" << endl;
    if (register_hash(&sha1_desc) == -1)
        cout << "Error registering sha1" << endl;

    testCrypto();

    cout << "we started in " << argv[0] << endl;

    v8::V8::InitializeICUDefaultLocation(argv[0]);
    v8::V8::InitializeExternalStartupData(argv[0]);
    std::unique_ptr<v8::Platform> platform = v8::platform::NewDefaultPlatform();
    v8::V8::InitializePlatform(platform.get());
    v8::V8::Initialize();
    try {
        // Create a new Isolate and make it the current one.
        {
            shared_ptr<Scripter> se = Scripter::New(0, argv[0]);
            {
                v8::Locker locker(se->isolate());

                // Enter the context for compiling and running the hello world script.

//            v8::HandleScope handle_scope(se.isolate());
//            auto context = se.getContext();

//            v8::Context::Scope context_scope(context);
                se->inContext([&](auto context) {
                    // Create a string containing the JavaScript source code.
                    auto src = se->loadFileAsString("init_full.js");
                    src = src + "\n//# sourceURL=" + "jslib/init_full.js\n";
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
                });
            } // locker scope
            // we put it here to unlock v8 context before sleep
            std::this_thread::sleep_for(4s);
        } // se scope
        cout << "se should be already recycled" << endl;
        v8::V8::Dispose();
        v8::V8::ShutdownPlatform();
//    delete create_params.array_buffer_allocator;

    }
    catch (std::exception &e) {
        std::cerr << "uncaught: " << e.what() << endl;
    }
    return 0;
}