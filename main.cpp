/*
 * Copyright (c) 2019-present Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

#include <iostream>

#include "crypto/cryptoCommon.h"
#include "crypto/PrivateKey.h"
#include "crypto/base64.h"
#include "js_bindings/Scripter.h"
#include "tools/tools.h"
#include "js_bindings/worker_bindings.h"

#include "AsyncIO/AsyncIO.h"
#include "AsyncIO/AsyncIOTests.h"
#include "crypto/cryptoTests.h"
#include "serialization/SerializationTest.h"
#include <execinfo.h>
#include <unistd.h>

using namespace std;

void usage();

void handler(int sig) {
    void *array[100];

    // get void*'s for all entries on the stack
    int size = backtrace(array, 100);

    // print out all the frames to stderr
    fprintf(stderr, "Error: signal %d:\n", sig);
    backtrace_symbols_fd(array, size, STDERR_FILENO);
    exit(1);
}

int main(int argc, const char **argv) {

    signal(SIGSEGV, handler);   // install our handler
    crypto::initCrypto();
    asyncio::initAndRunLoop(5ms);

    if (argc == 2 && strcmp(argv[1], "--selftest") == 0) {
        testCryptoAll();
        allAsyncIOTests();
        allSerializationTests();
        return 0;
    }

    if (argc == 1) {
        usage();
        return 1;
    } else {
        return Scripter::Application(argv[0], [=](shared_ptr<Scripter> se) {
            vector<string> args(argv + 1, argv + argc);
            InitWorkerPools(64, 64);
            // important note. At this point secipter instance is initialized but not locked (owning)
            // the current thread, so can be used in any thread, but only with lockging the context:
            // so we lock the context to execute evaluate:
//            return se->inContext(([&](auto context) {
                if (args[0] == "-e") {
                    se->inContext([&](auto context) { cout << se->evaluate(args[1]) << endl; });
                    return 0;
                } else {
                    return se->runAsMain(
                            loadAsStringOrThrow(args[0]), vector<string>(args.begin() + 1, args.end()), args[0]
                    );
                }
            });
//        });
    }
}

void usage() {
    cout << R"End(
=== U8 Universa execution environment === (beta)

Usage:

    u8 [-e "`js code to evaluate`"] | <javascript_file_name> | [--selftest]

if -e switch present, evaluates the second command line parameter as Javascript code and
prints out result ou stdout.

Otherwise executes script from the given .js file specified as the first parameter.
All other parameters are passed to the main(argv) function if present in the script file or
if it is imported from it.

--selftest run some internal tests.

)End";
}

/* more specific form of Scripter application:
 *
int manual_main(int argc, char **argv) {
    auto platform = Scripter::initV8(argv[0]);
    try {
        shared_ptr<Scripter> se = Scripter::New();
        // Do something with scripter object, e.g. evaluate scripts.
        this_thread::sleep_for(4s);
    }
    catch (exception &e) {
        cerr << "uncaught error: " << e.what() << endl;
    }
    catch (...) {
        cerr << "uncaught unspecified error: " << endl;
    }
    Scripter::closeV8(platform);
    return 0;
}
*/