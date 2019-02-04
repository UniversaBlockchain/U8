//
// Created by Leonid Novikov on 2/4/19.
//

#ifndef U8_CTRTRANSFORMERAES_H
#define U8_CTRTRANSFORMERAES_H

#include <vector>
#include "../tools/tools.h"

class CTRTransformerAES {

public:

    CTRTransformerAES(const byte_vector& key);
    CTRTransformerAES(const byte_vector& key, const byte_vector& iv);

    unsigned char transformByte(unsigned char source);
    byte_vector getIV();

private:
    unsigned char nextByte();
    void prepareBlock();

private:
    byte_vector key;
    int counter;
    int index = 0;
    const int blockSize;
    byte_vector source;
    byte_vector nonce;
    byte_vector counterBytes;
};

void applyXor(byte_vector& source, int offset, const byte_vector& mask);

#endif //U8_CTRTRANSFORMERAES_H
