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


#endif //U8_TOOLS_H
