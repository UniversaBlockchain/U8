//
// Created by Leonid Novikov on 2/21/19.
//

#include <iostream>
#include <atomic>
#include <set>
#include "catch2.h"
#include "../crypto/PrivateKey.h"
#include "../network/NodeInfo.h"
#include "../network/NetConfig.h"
#include "../network/UDPAdapter.h"

using namespace std;
using namespace crypto;
using namespace network;

class MainInit {
public:
    MainInit() {
        initCrypto();
        asyncio::initAndRunLoop();
    }
} mainInit_g;

class AdaptersList {
public:
    vector<PrivateKey> privKeys;
    NetConfig nc;
    vector<shared_ptr<UDPAdapter>> adapters;
    AdaptersList(int count) {
        for (int i = 0; i < count; ++i) {
            PrivateKey pk(2048);
            privKeys.push_back(pk);
            NodeInfo nodeInfo(PublicKey(pk), i, string("node-")+to_string(i), "127.0.0.1", "127.0.0.1", 14000+i, 16000+i, 18000+i);
            nc.addNode(nodeInfo);
        }
        for (int i = 0; i < count; ++i) {
            auto udpAdapter = make_shared<UDPAdapter>(privKeys[i], i, nc, [&](const byte_vector& packet){});
            adapters.push_back(udpAdapter);
        }
    }
};

TEST_CASE("HelloUdp") {
    cout << "udpAdapterHelloWorld()..." << endl;

    string body0("packet from node-0");
    string body1("some data from node-1");
    string body2("data from node-2");

    PrivateKey node0key(2048);
    PrivateKey node1key(2048);
    PrivateKey node2key(2048);
    network::NodeInfo nodeInfo0(PublicKey(node0key), 0, "node-0", "127.0.0.1", "127.0.0.1", 14000, 16000, 18000);
    network::NodeInfo nodeInfo1(PublicKey(node1key), 1, "node-1", "127.0.0.1", "127.0.0.1", 14001, 16001, 18001);
    network::NodeInfo nodeInfo2(PublicKey(node2key), 2, "node-2", "127.0.0.1", "127.0.0.1", 14002, 16002, 18002);
    network::NetConfig netConfig;
    netConfig.addNode(nodeInfo0);
    netConfig.addNode(nodeInfo1);
    netConfig.addNode(nodeInfo2);

    atomic<long> counter0(0);

    network::UDPAdapter udpAdapter0(node0key, 0, netConfig, [&counter0](const byte_vector& packet){
        //cout << "node-0 receive data, size=" << packet.size() << ": " << string(packet.begin(), packet.end()) << endl;
        ++counter0;
    });
    network::UDPAdapter udpAdapter1(node1key, 1, netConfig, [&](const byte_vector& packet){
        REQUIRE(packet.size() == 18);
        REQUIRE(string(packet.begin(), packet.end()) == body0);
    });
    network::UDPAdapter udpAdapter2(node2key, 2, netConfig, [&](const byte_vector& packet){
        REQUIRE(packet.size() == 21);
        REQUIRE(string(packet.begin(), packet.end()) == body1);
    });
    //udpAdapter0.enableLog(true);
    //udpAdapter1.enableLog(true);
    //udpAdapter2.enableLog(true);

    long sendTo0count = 4;

    udpAdapter0.send(1, byte_vector(body0.begin(), body0.end()));
    udpAdapter1.send(2, byte_vector(body1.begin(), body1.end()));
    for (int i = 0; i < sendTo0count; ++i) {
        std::string s = body2 + ": i=" + std::to_string(i);
        udpAdapter2.send(0, byte_vector(s.begin(), s.end()));
    }

    while (counter0 < sendTo0count) {
        std::this_thread::sleep_for(500ms);
        cout << "counter0: " << counter0 << endl;
    }

    cout << "udpAdapterHelloWorld()... done!" << endl << endl;
}

TEST_CASE("SendAndReceive") {
    AdaptersList env(3);
    string body0("test data set 1");
    string receivedString("");
    ConditionVar cv;
    env.adapters[1]->setReceiveCallback([&](const byte_vector& packet){
        receivedString = string(packet.begin(), packet.end());
        cv.notifyAll();
    });
    env.adapters[0]->send(1, byte_vector(body0.begin(), body0.end()));
    if (!cv.wait(1s))
        REQUIRE(false); //timeout
    REQUIRE(body0 == receivedString);
}

TEST_CASE("SendTripleAndReceive") {
    AdaptersList env(3);
    string body0("test data set 1");
    string body1("test data set 2222");
    string body2("test data set 333333333333333");
    set<string> receivedStrings;
    ConditionVar cv;
    env.adapters[1]->setReceiveCallback([&](const byte_vector& packet){
        receivedStrings.insert(string(packet.begin(), packet.end()));
        if (receivedStrings.size() >= 3)
            cv.notifyAll();
    });
    env.adapters[0]->send(1, byte_vector(body0.begin(), body0.end()));
    env.adapters[0]->send(1, byte_vector(body1.begin(), body1.end()));
    env.adapters[0]->send(1, byte_vector(body2.begin(), body2.end()));
    if (!cv.wait(5s))
        REQUIRE(false); //timeout
    REQUIRE(receivedStrings.find(body0) != receivedStrings.end());
    REQUIRE(receivedStrings.find(body1) != receivedStrings.end());
    REQUIRE(receivedStrings.find(body2) != receivedStrings.end());
}

TEST_CASE("SendEachOtherAndReceive") {
    std::minstd_rand  minstdRand(std::chrono::duration_cast<std::chrono::nanoseconds>(std::chrono::high_resolution_clock::now().time_since_epoch()).count());
    AdaptersList env(5);
    vector<string> payloadsList({"test data set 1", "test data set 2", "test data set 3"});

    //TODO: change debug parameters
    int attempts = 5;//500;
    int numSends = 1;//100;

    atomic<long> receiveCounter(0);
    ConditionVar cv;

    for (int i = 0; i < 5; ++i) {
        env.adapters[i]->setReceiveCallback([&](const byte_vector &packet) {
            ++receiveCounter;
            if (receiveCounter >= attempts * numSends)
                cv.notifyAll();
        });
    }

    for (int i = 0; i < attempts; ++i) {
        for (int j = 0; j < numSends; ++j) {
            int rnd1 = minstdRand() % 3;
            int rnd2 = 0;
            int rnd3 = 0;
            while (rnd2 == rnd3) {
                rnd2 = minstdRand() % 5;
                rnd3 = minstdRand() % 5;
            }
            string &payload = payloadsList[rnd1];
            const auto& sender = env.adapters[rnd2];
            sender->send(rnd3, byte_vector(payload.begin(), payload.end()));
        }
        this_thread::sleep_for(std::chrono::milliseconds(minstdRand() % 20));
    }

    if (!cv.wait(20s))
        REQUIRE(false); //timeout
    REQUIRE(receiveCounter == attempts*numSends);
}
