//
// Created by Sergey Chernov on 2019-01-07.
//

#ifndef U8_LOGGING_H
#define U8_LOGGING_H

#include <iostream>
#include <sstream>
#include <any>

class Logging {
public:
    explicit Logging(const char *id_string) : id_str(id_string) {
    }

    virtual std::string name() {
        std::stringstream ss;
        ss << id_str << ":" << (void *) this;
        return ss.str();
    }

    template<typename ...Ts>
    void log(Ts... args) {
        put_log(DEBUG, args...);
    }

    template<typename ...Ts>
    void log_e(Ts... args) {
        put_log(ERROR, args...);
    }

    template<typename ...Ts>
    void put_log(int level, const Ts &... args) {
        if (level >= min_log_level) {
            std::ostream *os = level < ERROR ? out : err;
            *os << name() << ": ";
            put(os, sizeof...(args), args...);
        }
    }


    static int setLogLevel(int newLevel) {
        auto old = min_log_level;
        min_log_level = newLevel;
        return old;
    }

    static void withLog(void (*block)()) {
        auto old = setLogLevel(DEBUG);
        block();
        min_log_level = old;
    }

    enum {
        DEBUG = 1,
        INFO = 10,
        WARNING = 100,
        ERROR = 1000
    };

protected:
    const std::string id_str;

    static int min_log_level;
    static std::ostream *out;
    static std::ostream *err;

private:

    // Hack: I know no way to iterate over different-type varargs, so I do recursion...
    template<typename T, typename ...Ts>
    void put(std::ostream *out, int count, T first, Ts... rest) {
        *out << first;
        if (count-- > 1)
            *out << ' ';
        put(out, count, rest...);
    }

    void put(std::ostream *out, int count) {
        *out << std::endl << std::flush;
    }
    // End of hack.

    // Following is just a static contructor for logging
    struct constructor {
        constructor() {
            min_log_level = Logging::DEBUG;
            out = &std::cout;
            err = &std::cerr;

        }
    };

    static constructor constr;
    // end constructor hack
};


#endif //U8_LOGGING_H
