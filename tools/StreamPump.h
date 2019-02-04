//
// Created by Sergey Chernov on 2019-02-04.
//

#ifndef U8_STREAMPUMP_H
#define U8_STREAMPUMP_H

#include <thread>
#include <iostream>
#include "Queue.h"

using namespace std;

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
