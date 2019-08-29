/*
 * Copyright (c) 2019 Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

#ifndef U8_STREAMPUMP_H
#define U8_STREAMPUMP_H

#include <thread>
#include <iostream>
#include "Queue.h"

using namespace std;

/**
 * The utility to do packground print in some output stream keeping the order. Each pump use its own
 * thread to pass (non blocking) strings to the output stream that can (and will) block.
 */
class StreamPump {
public:
    StreamPump(ostream& s);
    ~StreamPump();

    StreamPump& operator <<(string&& str);

    StreamPump& operator <<(const string& str);

    StreamPump& operator <<(const char* msg) {
        *this << string(msg);
        return *this;
    }

private:
    thread worker;
    Queue<string> queue;
    ostream& outs;
};


#endif //U8_STREAMPUMP_H
