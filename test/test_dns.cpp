/*
 * Copyright (c) 2019-present Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

#include "../network/DnsServer.h"
#include "../tools/tools.h"
#include "catch2.h"
#include <iostream>

using namespace std;
using namespace network;

TEST_CASE("dns_hello", "[!hide]") {
    //iptables -t nat -A PREROUTING -i enp0s3 -p udp --dport 53 -j REDIRECT --to-port 5353
    DnsServer dnsServer;

    dnsServer.setQuestionsCallback([](shared_ptr<DnsServerQuestion> question){
        //cout << "dns question: name = " << question->name << endl;
        if (question->rtype == DnsRRType::DNS_A)
            question->setAnswerIpV4("127.0.0.1");
        else if (question->rtype == DnsRRType::DNS_AAAA)
            question->setAnswerIpV6("2a02:6b8::2:242");
        question->sendAnswerFromMgThread();
    });

    dnsServer.start("0.0.0.0", 5353);

    DnsResolver dnsResolver;
    dnsResolver.setNameServer("127.0.0.1", 5353);
    dnsResolver.start();

    atomic<int> reqCounter = 0;
    atomic<int> ansCounter = 0;
    atomic<long> t0 = getCurrentTimeMillis();
    int N = 2000;
    //N = 2000000;
    for (int i = 0; i < N; ++i) {
        ++reqCounter;
        dnsResolver.resolve("ya.ru", DnsRRType::DNS_A, [&ansCounter,&t0](const std::string &addr) {
            //cout << "resolved: " << addr << endl;
            ++ansCounter;
            long now = getCurrentTimeMillis();
            long dt = now - t0;
            if (dt >= 1000) {
                t0 = now;
                cout << "ansCounter = " << ansCounter << endl;
            }
        });
        if (reqCounter > ansCounter + 1000)
            this_thread::sleep_for(10ms);
    }
    while (ansCounter < N) {
        this_thread::sleep_for(10ms);
    }
    cout << "total ansCounter = " << ansCounter << endl;

    //this_thread::sleep_for(9000s);

    dnsServer.stop();
    dnsServer.join();

    dnsResolver.stop();
    dnsResolver.join();
}
