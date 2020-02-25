/*
 * Copyright (c) 2019-present Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

#include "../network/DnsServer.h"
#include "../tools/tools.h"
#include "../tools/ThreadPool.h"
#include "../tools/Semaphore.h"
#include "catch2.h"
#include <iostream>

using namespace std;
using namespace network;

TEST_CASE("dns_hello", "[!hide]") {
    //iptables -t nat -A PREROUTING -i enp0s3 -p udp --dport 53 -j REDIRECT --to-port 5353
    DnsServer dnsServer;

    ThreadPool pool(8);
    dnsServer.setQuestionsCallback([&pool](shared_ptr<DnsServerQuestion> question){
        pool.execute([question](){
            //cout << "dns question: name = " << question->name << endl;
            this_thread::sleep_for(20ms);
            if (question->rtype == DnsRRType::DNS_A) {
                question->addAnswerIpV4(question->rtype, "127.0.0.1");
            } else if (question->rtype == DnsRRType::DNS_AAAA) {
                question->addAnswerIpV6(question->rtype, "2a02:6b8::2:242");
            }
            question->sendAnswer(300);
        });
    });

    dnsServer.start("0.0.0.0", 5353);

    DnsResolver dnsResolver;
    dnsResolver.setNameServer("127.0.0.1", 5353);
    dnsResolver.start();

    atomic<int> reqCounter = 0;
    atomic<int> ansCounter = 0;
    atomic<long> t0 = getCurrentTimeMillis();
    int N = 200;
    //N = 200000;
    for (int i = 0; i < N; ++i) {
        ++reqCounter;
        dnsResolver.resolve("ya.ru", DnsRRType::DNS_A, [&ansCounter,&t0](const std::vector<DnsResolverAnswer>& ansArr) {
//            for (const DnsResolverAnswer& ans : ansArr)
//                cout << "resolved: " << ans.parseIpV4asString() << endl;
            ++ansCounter;
            long now = getCurrentTimeMillis();
            long dt = now - t0;
            if (dt >= 1000) {
                t0 = now;
                cout << "ansCounter = " << ansCounter << endl;
            }
        });
        //this_thread::sleep_for(500ms);
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

TEST_CASE("dns_get_cname", "[!hide]") {
    DnsResolver dnsResolver;
    dnsResolver.setNameServer("8.8.4.4", 53);
    dnsResolver.start();

    Semaphore sem;
    dnsResolver.resolve("www.arubacloud.com", DnsRRType::DNS_CNAME, [&sem](const std::vector<DnsResolverAnswer>& ansArr){
        cout << "ansArr count = " << ansArr.size() << endl;
        for (auto& ans : ansArr) {
            if (ans.getType() == DnsRRType::DNS_A)
                cout << "  ans rtype=" << ans.getType() << ", value: " << ans.parseIpV4asString() << endl;
            else if (ans.getType() == DnsRRType::DNS_AAAA)
                cout << "  ans rtype=" << ans.getType() << ", value: " << ans.parseIpV6asString() << endl;
            else if (ans.getType() == DnsRRType::DNS_TXT)
                cout << "  ans rtype=" << ans.getType() << ", value: " << ans.parseTXT() << endl;
            else if (ans.getType() == DnsRRType::DNS_CNAME)
                cout << "  ans rtype=" << ans.getType() << ", value: " << ans.parseCNAME() << endl;
            else if (ans.getType() == DnsRRType::DNS_NS)
                cout << "  ans rtype=" << ans.getType() << ", value: " << ans.parseCNAME() << endl;
            else
                cout << "  ans rtype=" << ans.getType() << ", value: " << ans.parseTXT() << endl;
        }

        sem.notify();
    });
    sem.wait();

    dnsResolver.stop();
    dnsResolver.join();
}

TEST_CASE("dns_uplink_proxy", "[!hide]") {
    DnsResolver dnsUplink;
    dnsUplink.setNameServer("8.8.4.4", 53);
    dnsUplink.start();

    DnsServer dnsServer;

    dnsServer.setQuestionsCallback([&dnsUplink](shared_ptr<DnsServerQuestion> question){
        //cout << "dns question: name = " << question->name << endl;
        if (question->name == "www.ya.ru") {
            question->addAnswerIpV4(DnsRRType::DNS_A, "87.250.250.242");
            question->sendAnswer(300);
        } else {
            dnsUplink.resolve(question->name, question->rtype, [question](const std::vector<DnsResolverAnswer>& ansArr){
                question->setWholeBinaryResponse(ansArr[0].getWholeMsgBinary());
                question->sendAnswer(300);
            });
        }
    });

    dnsServer.start("0.0.0.0", 5353);

    this_thread::sleep_for(9000s);

    dnsServer.stop();
    dnsServer.join();

    dnsUplink.stop();
    dnsUplink.join();
}
