//
// Created by Sergey Chernov on 2019-02-04.
//

#include "StreamPump.h"

using namespace std;

StreamPump::StreamPump(ostream &s) : outs(s) {
    cout << "startpump";
    worker = thread([this]() {
        try {
            while (1) outs << queue.get();
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
