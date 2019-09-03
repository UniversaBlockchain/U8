/*
 * Copyright (c) 2019-present Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

#ifndef U8_CRYPTOTESTS_H
#define U8_CRYPTOTESTS_H

#include <atomic>

void testCryptoAll();

void testCrypto();
void testHashId();
void testHashIdComparison();
void testKeyAddress();

class CryptoTestResults {
public:
    CryptoTestResults();
    virtual ~CryptoTestResults();
    void incrementErrorsCounter();
    void incrementChecksCounter();
private:
    std::atomic<long> checksCounter = 0;
    std::atomic<long> errorsCounter = 0;
};

#endif //U8_CRYPTOTESTS_H
