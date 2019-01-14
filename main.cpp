#include <iostream>

#include "Scripter.h"
#include "tools.h"

void usage();

int main(int argc, const char **argv) {
    if (argc == 1) {
        usage();
        return 1;
    }
    else {
        return Scripter::Application(argv[0], [=](auto se) {
            std::vector<std::string> args(argv + 1, argv + argc);
            if (args[0] == "-e")
                cout << se->evaluate(args[1]) << endl;
            else {
                se->runAsMain(loadAsStringOrThrow(args[0]), vector<string>(args.begin() + 1, args.end()), args[0]);
            }
            return 0;
        });
    }
}

void usage() {
    cout << R"End(
=== U8 Universa execution environment === (beta)

Usage:

    u8 [-e "`js code to avaulate`"] | <javascript_file_name>

if -e switch present, evaluates the second command line parameter as Javascript code and
prints out result ou stdout.

Otherwise executes sctipt fromthe given .js file specified as the first parameter.
All other parameters are passed to the main(argv) function if present in the script file or
if it is imported from it.

)End";
}

/* more specific form of Scripter application:
 *
int manual_main(int argc, char **argv) {
    auto platform = Scripter::initV8(argv[0]);
    try {
        shared_ptr<Scripter> se = Scripter::New();
        std::this_thread::sleep_for(4s);
    }
    catch (std::exception &e) {
        std::cerr << "uncaught error: " << e.what() << endl;
    }
    catch (...) {
        std::cerr << "uncaught unspecified error: " << endl;
    }
    Scripter::closeV8(platform);
    return 0;
}
*/