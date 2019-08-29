/*
 * Copyright (c) 2019 Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

#ifndef U8_SAFE58_H
#define U8_SAFE58_H

#include <vector>
#include <string>

namespace crypto {

    class Safe58 {

    public:
        static std::string encode(const std::vector<unsigned char> &input);

        static std::vector<unsigned char> decode(const std::string &input, bool strict = false);

    private:
        static const char *ALPHABET;
        static const int BASE_58;
        static const int BASE_256 = 256;
        static const std::vector<int> INDEXES;

        static void doDecode(const std::string &input, std::vector<unsigned char> &output);

        static unsigned char divmod58(std::vector<unsigned char> &number, int startAt);

        static unsigned char divmod256(std::vector<unsigned char> &number58, int startAt);

        static void
        copyOfRange(const unsigned char *source, size_t from, size_t to, std::vector<unsigned char> &output);

    };

};

#endif //U8_SAFE58_H
