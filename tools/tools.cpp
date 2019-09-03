/*
 * Copyright (c) 2019-present Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

#include <fstream>
#include <iostream>
#include "tools.h"

using namespace std;

string replace_all(const string &src, const string &what, const string &to, size_t from_pos) {
    auto pos = src.find(src, from_pos);
    if (pos != string::npos)
        return replace_all(src.substr(0, pos) + what + src.substr(pos + what.length()), what, to, pos);
    else
        return src;
}


string loadAsString(const string &fileName) {
    ifstream ifs(fileName);
    return string((istreambuf_iterator<char>(ifs)),
                       (istreambuf_iterator<char>()));
}

string loadAsStringOrThrow(const string &fileName) {
    ifstream ifs(fileName, ios::in);
    if (!ifs)
        throw io_error("file not found: " + fileName);
    return string( (istreambuf_iterator<char>(ifs) ),
                        (istreambuf_iterator<char>()    ) );
}

