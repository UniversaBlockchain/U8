/*
 * Copyright (c) 2019 Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

#ifndef U8_ASYNCIOTESTS_H
#define U8_ASYNCIOTESTS_H

void allAsyncIOTests();
void testAsyncFile();
void testAsyncUDP();
void testAsyncTCP();
void testUnifyFileAndTCPread();
void testClientWriteWithouthRead();
void testAsyncTLS();
void stressTestTCP();

#endif //U8_ASYNCIOTESTS_H
