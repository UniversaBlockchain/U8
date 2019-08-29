/*
 * Copyright (c) 2019 Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

#include "Safe58.h"
#include <string.h>
#include <algorithm>
#include <stdexcept>
#include "base64.h"

namespace crypto {

    const char *Safe58::ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
    const int Safe58::BASE_58 = (int) strlen(ALPHABET);
    const std::vector<int> Safe58::INDEXES = [] {
        std::vector<int> res;
        res.resize(128);
        for (int i = 0; i < res.size(); ++i)
            res[i] = -1;
        for (int i = 0; i < (int) strlen(ALPHABET); ++i)
            res[ALPHABET[i]] = i;
        return res;
    }();

    std::string Safe58::encode(const std::vector<unsigned char> &inputData) {
        if (inputData.empty()) {
            // paying with the same coin
            return std::string("");
        }

        // Make a copy of the input since we are going to modify it.
        auto input = inputData;

        // Count leading zeroes
        int zeroCount = 0;
        while ((zeroCount < input.size()) && (input[zeroCount] == 0))
            ++zeroCount;

        // The actual encoding
        size_t tempLength = input.size() * 2;
        unsigned char temp[tempLength];
        size_t j = tempLength;

        int startAt = zeroCount;
        while (startAt < input.size()) {
            auto mod = divmod58(input, startAt);
            if (input[startAt] == 0)
                ++startAt;
            temp[--j] = (unsigned char) ALPHABET[mod];
        }

        // Strip extra '1' if any
        while ((j < tempLength) && (temp[j] == ALPHABET[0]))
            ++j;

        // Add as many leading '1' as there were leading zeros.
        while (--zeroCount >= 0)
            temp[--j] = (unsigned char) ALPHABET[0];

        std::vector<unsigned char> output;
        copyOfRange(temp, j, tempLength, output);
        return std::string(output.begin(), output.end());
    }

    std::vector<unsigned char> Safe58::decode(const std::string &input, bool strict) {
        std::vector<unsigned char> output;
        if (!strict) {
            auto inputCopy = input;
            std::replace(inputCopy.begin(), inputCopy.end(), 'I', '1');
            std::replace(inputCopy.begin(), inputCopy.end(), '!', '1');
            std::replace(inputCopy.begin(), inputCopy.end(), '|', '1');
            std::replace(inputCopy.begin(), inputCopy.end(), 'l', '1');
            std::replace(inputCopy.begin(), inputCopy.end(), 'O', 'o');
            std::replace(inputCopy.begin(), inputCopy.end(), '0', 'o');
            doDecode(inputCopy, output);
        } else {
            doDecode(input, output);
        }
        return output;
    }

    void Safe58::doDecode(const std::string &input, std::vector<unsigned char> &output) {
        if (input.empty()) {
            // paying with the same coin
            output.resize(0);
            return;
        }

        std::vector<unsigned char> input58(input.begin(), input.end());

        // Transform the String to a base58 byte sequence
        for (int i = 0; i < input.size(); ++i) {
            char c = input[i];
            int digit58 = -1;
            if (c >= 0)
                digit58 = INDEXES[c];
            if (digit58 < 0)
                throw std::invalid_argument(std::string("Not a Base58 input: ") + input);
            input58[i] = static_cast<unsigned char>(digit58);
        }

        // Count leading zeroes
        int zeroCount = 0;
        while ((zeroCount < input58.size()) && (input58[zeroCount] == 0))
            ++zeroCount;

        // The encoding
        size_t tempLength = input.size();
        unsigned char temp[tempLength];
        size_t j = tempLength;

        int startAt = zeroCount;
        while (startAt < input58.size()) {
            auto mod = divmod256(input58, startAt);
            if (input58[startAt] == 0)
                ++startAt;
            temp[--j] = mod;
        }

        // Do no add extra leading zeros, move j to first non null byte.
        while ((j < tempLength) && (temp[j] == 0))
            ++j;

        copyOfRange(temp, j - zeroCount, tempLength, output);
    }

    unsigned char Safe58::divmod58(std::vector<unsigned char> &number, int startAt) {
        int remainder = 0;
        for (int i = startAt; i < number.size(); ++i) {
            int digit256 = number[i] & 0xFF;
            int temp = remainder * BASE_256 + digit256;
            number[i] = (unsigned char) (temp / BASE_58);
            remainder = temp % BASE_58;
        }
        return (unsigned char) remainder;
    }

    unsigned char Safe58::divmod256(std::vector<unsigned char> &number58, int startAt) {
        int remainder = 0;
        for (int i = startAt; i < number58.size(); ++i) {
            int digit58 = number58[i] & 0xFF;
            int temp = remainder * BASE_58 + digit58;
            number58[i] = (unsigned char) (temp / BASE_256);
            remainder = temp % BASE_256;
        }
        return (unsigned char) remainder;
    }

    void Safe58::copyOfRange(const unsigned char *source, size_t from, size_t to, std::vector<unsigned char> &output) {
        output.resize(to - from);
        memcpy(&output[0], &source[from], to - from);
    }

};