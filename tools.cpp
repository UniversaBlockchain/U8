//
// Created by Sergey Chernov on 2019-01-05.
//

#include <fstream>
#include "tools.h"

std::string replace_all(const std::string &src, const std::string &what, const std::string &to, size_t from_pos) {
    auto pos = src.find(src, from_pos);
    if (pos != std::string::npos)
        return replace_all(src.substr(0, pos) + what + src.substr(pos + what.length()), what, to, pos);
    else
        return src;
}


std::string loadAsString(const std::string &fileName) {
    std::ifstream ifs(fileName);
    return std::string( (std::istreambuf_iterator<char>(ifs) ),
                        (std::istreambuf_iterator<char>()    ) );
}

