/*
 * Copyright (c) 2019-present Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

#include "StreamPump.h"

using namespace std;

StreamPump::StreamPump(ostream &s) : outs(s) {
    worker = thread([this]() {
        try {
            while (1) {
                outs << queue.get();
                outs.flush();
            }
        }
        catch (const QueueClosedException &e) {
        }
    });
}

StreamPump::~StreamPump() {
    queue.close();
}

StreamPump &StreamPump::operator<<(string &&str) {
    try {
        queue.put(str);
    }
    catch (const QueueClosedException &e) {
    }
    return *this;
}

StreamPump &StreamPump::operator<<(const string &str) {
    try {
        queue.put(str);
    }
    catch (const QueueClosedException &e) {
    }
    return *this;
}
