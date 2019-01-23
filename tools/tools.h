//
// Created by Sergey Chernov on 2019-01-05.
//

#ifndef U8_TOOLS_H
#define U8_TOOLS_H


#include <string>
#include <sys/stat.h>

inline bool file_exists(const std::string &name) {
    struct stat buffer;
    return (stat(name.c_str(), &buffer) == 0);
}

std::string replace_all(const std::string &src,
                               const std::string &what,
                               const std::string &to,
                               size_t from_pos = 0);


std::string loadAsString(const std::string &fileName);

std::string loadAsStringOrThrow(const std::string &fileName);

class io_error : public std::runtime_error {
public:
    using runtime_error::runtime_error;
};

template <typename T>
std::ostream& operator<< (std::ostream& out, const std::vector<T>& v) {
    if ( !v.empty() ) {
        out << '[';
        std::copy (v.begin(), v.end(), std::ostream_iterator<T>(out, ", "));
        out << "\b\b]";
    }
    return out;
}

#endif //U8_TOOLS_H
