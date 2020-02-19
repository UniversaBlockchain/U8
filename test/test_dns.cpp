/*
 * Copyright (c) 2019-present Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

#include "../network/DnsServer.h"
#include "catch2.h"

using namespace std;
using namespace network;

TEST_CASE("dns_hello", "[!hide]") {
    //iptables -t nat -A PREROUTING -i enp0s3 -p udp --dport 53 -j REDIRECT --to-port 5353
    DnsServer dnsServer;
    dnsServer.start("0.0.0.0", 5353);

    this_thread::sleep_for(9000s);

    dnsServer.stop();
    dnsServer.join();
}
