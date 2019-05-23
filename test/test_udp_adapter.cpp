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

class AdaptersList: Noncopyable, Nonmovable {
public:
    vector<PrivateKey> privKeys;
    NetConfig nc;
    vector<shared_ptr<UDPAdapter>> adapters;
    AdaptersList(int count) {
        for (int i = 0; i < count; ++i) {
            PrivateKey pk(2048);
            privKeys.push_back(pk);
            NodeInfo nodeInfo(PublicKey(pk), i, string("node-")+to_string(i), "127.0.0.1", "0:0:0:0:0:0:0:1", "127.0.0.1", 14000+i, 16000+i, 18000+i);
            nc.addNode(nodeInfo);
        }
        for (int i = 0; i < count; ++i) {
            auto udpAdapter = make_shared<UDPAdapter>(privKeys[i], i, nc, [&](const byte_vector& packet, const NodeInfo& fromNode){}, true);
            adapters.push_back(udpAdapter);
        }
    }
    ~AdaptersList() {
        for (size_t i = 0; i < adapters.size(); ++i)
            adapters[i]->setReceiveCallback([](const byte_vector& packet, const NodeInfo& fromNode){});
    }
};

TEST_CASE("HelloUdp") {
    string body0("packet from node-0");
    string body1("some data from node-1");
    string body2("data from node-2");

    PrivateKey node0key(2048);
    PrivateKey node1key(2048);
    PrivateKey node2key(2048);
    network::NodeInfo nodeInfo0(PublicKey(node0key), 0, "node-0", "127.0.0.1", "0:0:0:0:0:0:0:1", "127.0.0.1", 14000, 16000, 18000);
    network::NodeInfo nodeInfo1(PublicKey(node1key), 1, "node-1", "127.0.0.1", "0:0:0:0:0:0:0:1", "127.0.0.1", 14001, 16001, 18001);
    network::NodeInfo nodeInfo2(PublicKey(node2key), 2, "node-2", "127.0.0.1", "0:0:0:0:0:0:0:1", "127.0.0.1", 14002, 16002, 18002);
    network::NetConfig netConfig;
    netConfig.addNode(nodeInfo0);
    netConfig.addNode(nodeInfo1);
    netConfig.addNode(nodeInfo2);

    atomic<long> counter0(0);

    network::UDPAdapter udpAdapter0(node0key, 0, netConfig, [&counter0](const byte_vector& packet, const NodeInfo& fromNode){
        //cout << "node-0 receive data, size=" << packet.size() << ": " << string(packet.begin(), packet.end()) << endl;
        ++counter0;
    }, true);
    network::UDPAdapter udpAdapter1(node1key, 1, netConfig, [&](const byte_vector& packet, const NodeInfo& fromNode){
        REQUIRE(packet.size() == 18);
        REQUIRE(string(packet.begin(), packet.end()) == body0);
    }, true);
    network::UDPAdapter udpAdapter2(node2key, 2, netConfig, [&](const byte_vector& packet, const NodeInfo& fromNode){
        REQUIRE(packet.size() == 21);
        REQUIRE(string(packet.begin(), packet.end()) == body1);
    }, true);
    //udpAdapter0.enableLog(true);
    //udpAdapter1.enableLog(true);
    //udpAdapter2.enableLog(true);

    const long sendTo0count = 4000;

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
}

TEST_CASE("SendAndReceive") {
    AdaptersList env(3);
    string body0("test data set 1");
    string receivedString("");
    promise<void> prs;
    env.adapters[1]->setReceiveCallback([&](const byte_vector& packet, const NodeInfo& fromNode){
        receivedString = string(packet.begin(), packet.end());
        prs.set_value();
    });
    env.adapters[0]->send(1, byte_vector(body0.begin(), body0.end()));
    if (prs.get_future().wait_for(15s) != future_status::ready)
        REQUIRE(false); //timeout
    REQUIRE(body0 == receivedString);
}

TEST_CASE("SendTripleAndReceive") {
    AdaptersList env(3);
    string body0("test data set 1");
    string body1("test data set 2222");
    string body2("test data set 333333333333333");
    set<string> receivedStrings;
    promise<void> prs;
    env.adapters[1]->setReceiveCallback([&](const byte_vector& packet, const NodeInfo& fromNode){
        receivedStrings.insert(string(packet.begin(), packet.end()));
        if (receivedStrings.size() >= 3)
            prs.set_value();
    });
    env.adapters[0]->send(1, byte_vector(body0.begin(), body0.end()));
    env.adapters[0]->send(1, byte_vector(body1.begin(), body1.end()));
    env.adapters[0]->send(1, byte_vector(body2.begin(), body2.end()));
    if (prs.get_future().wait_for(15s) != future_status::ready)
        REQUIRE(false); //timeout
    REQUIRE(receivedStrings.find(body0) != receivedStrings.end());
    REQUIRE(receivedStrings.find(body1) != receivedStrings.end());
    REQUIRE(receivedStrings.find(body2) != receivedStrings.end());
}

void SendEachOtherAndReceive(const int attempts, const int numSends) {
    std::minstd_rand  minstdRand(std::chrono::duration_cast<std::chrono::nanoseconds>(std::chrono::high_resolution_clock::now().time_since_epoch()).count());
    AdaptersList env(5);
    vector<string> payloadsList({"test data set 1", "test data set 2", "test data set 3"});

    atomic<long> receiveCounter(0);
    promise<void> prs;

    for (int i = 0; i < 5; ++i) {
        env.adapters[i]->setReceiveCallback([&](const byte_vector &packet, const NodeInfo& fromNode) {
            ++receiveCounter;
            if (receiveCounter >= attempts * numSends)
                prs.set_value();
        });
    }

    std::thread senderThread([&]() {
        for (int i = 0; i < attempts; ++i) {
            if (i % 100 == 0)
                cout << "send part: " << i << "..." << i+99 << endl;
            for (int j = 0; j < numSends; ++j) {
                int rnd1 = minstdRand() % 3;
                int rnd2 = 0;
                int rnd3 = 0;
                while (rnd2 == rnd3) {
                    rnd2 = minstdRand() % 5;
                    rnd3 = minstdRand() % 5;
                }
                string &payload = payloadsList[rnd1];
                const auto &sender = env.adapters[rnd2];
                sender->send(rnd3, byte_vector(payload.begin(), payload.end()));
            }
            this_thread::sleep_for(std::chrono::milliseconds(minstdRand() % 10));
        }
    });

    if (prs.get_future().wait_for(40s) != future_status::ready) {
        cout << "receiveCounter: " << receiveCounter << endl;
        REQUIRE(false); //timeout
    }
    REQUIRE(receiveCounter == attempts*numSends);
    senderThread.join();
}

TEST_CASE("SendEachOtherAndReceive") {
    const int attempts = 500;
    const int numSends = 50;
    SendEachOtherAndReceive(attempts, numSends);
}

TEST_CASE("SendEachOtherReceiveCloseSessionAndTryAgain") {
    for (int i = 0; i < 6; i++) {
        const int attempts = 100;
        const int numSends = 10;
        SendEachOtherAndReceive(attempts, numSends);
    }
}

TEST_CASE("CreateNodeToMany") {
    const int numNodes = 50;
    const int attempts = 5;
    const int numSends = 5;

    atomic<long> receiveCounter(0);
    atomic<long> answerCounter(0);

    AdaptersList env(numNodes+1);

    string messageBody("message");
    string answerBody("answer");
    promise<void> prs;

    env.adapters[0]->setReceiveCallback([&](const byte_vector& packet, const NodeInfo& fromNode) {
        ++answerCounter;
        REQUIRE(answerBody == string(packet.begin(), packet.end()));
        if (answerCounter >= attempts * numSends * numNodes)
            prs.set_value();
    });
    for (int i = 1; i <= numNodes; ++i) {
        const int iAdapter = i;
        env.adapters[iAdapter]->setReceiveCallback([&](const byte_vector& packet, const NodeInfo& fromNode) {
            ++receiveCounter;
            REQUIRE(messageBody == string(packet.begin(), packet.end()));
            env.adapters[iAdapter]->send(0, byte_vector(answerBody.begin(), answerBody.end()));
        });
    }

    for (int i = 0; i < attempts; ++i) {
        cout << "send part: " << i << endl;
        for (int j = 0; j < numSends; ++j) {
            for (int k = 1; k <= numNodes; ++k)
                env.adapters[0]->send(k, byte_vector(messageBody.begin(), messageBody.end()));
        }
        this_thread::sleep_for(200ms);
    }

    if (prs.get_future().wait_for(40s) != future_status::ready) {
        cout << "receiveCounter: " << receiveCounter << ", answerCounter: " << answerCounter << endl;
        REQUIRE(false); //timeout
    }
    cout << "receiveCounter: " << receiveCounter << ", answerCounter: " << answerCounter << endl;
}

TEST_CASE("CreateManyNodesToOne") {
    const int numNodes = 20;
    const int attempts = 5;
    const int numSends = 15;

    atomic<long> receiveCounter(0);
    atomic<long> answerCounter(0);

    AdaptersList env(numNodes+1);

    string messageBody("message");
    string answerBody("answer");
    promise<void> prs;

    env.adapters[0]->setReceiveCallback([&](const byte_vector& packet, const NodeInfo& fromNode) {
        ++receiveCounter;
        REQUIRE(messageBody == string(packet.begin(), packet.end()));
        env.adapters[0]->send(fromNode.getNumber(), byte_vector(answerBody.begin(), answerBody.end()));
    });
    for (int i = 1; i <= numNodes; ++i) {
        env.adapters[i]->setReceiveCallback([=,&answerCounter,&prs](const byte_vector& packet, const NodeInfo& fromNode) {
            ++answerCounter;
            REQUIRE(answerBody == string(packet.begin(), packet.end()));
            if (answerCounter >= attempts * numSends * numNodes)
                prs.set_value();
        });
    }

    for (int i = 0; i < attempts; ++i) {
        cout << "send part: " << i << endl;
        for (int j = 0; j < numSends; ++j) {
            for (int k = 1; k <= numNodes; ++k)
                env.adapters[k]->send(0, byte_vector(messageBody.begin(), messageBody.end()));
        }
        this_thread::sleep_for(400ms);
    }

    if (prs.get_future().wait_for(40s) != future_status::ready) {
        cout << "receiveCounter: " << receiveCounter << ", answerCounter: " << answerCounter << endl;
        REQUIRE(false); //timeout
    }
    cout << "receiveCounter: " << receiveCounter << ", answerCounter: " << answerCounter << endl;
}

TEST_CASE("SendTripleMultiTimesAndReceive") {
    std::minstd_rand  minstdRand(std::chrono::duration_cast<std::chrono::nanoseconds>(std::chrono::high_resolution_clock::now().time_since_epoch()).count());
    AdaptersList env(3);
    vector<string> payloadsList({"test data set 1", "test data set 2222", "test data set 333333333333333"});
    int attempts = 100;
    int numSends = 5;
    for (int i = 0; i < attempts; ++i) {
        if (i % 100 == 0)
            cout << "send part: " << i << "..." << i+99 << endl;

        promise<void> prs;
        atomic<long> receiveCounter1(0);
        env.adapters[1]->setReceiveCallback([&](const byte_vector& packet, const NodeInfo& fromNode){
            ++receiveCounter1;
            if (receiveCounter1 >= numSends)
                prs.set_value();
        });

        for (int j = 0; j < numSends; ++j) {
            string &payload = payloadsList[minstdRand() % 3];
            env.adapters[0]->send(1, byte_vector(payload.begin(), payload.end()));
        }

        if (prs.get_future().wait_for(40s) != future_status::ready)
            REQUIRE(false); //timeout
        REQUIRE(int(receiveCounter1) == numSends);
    }
}

TEST_CASE("Reconnect") {
    // create pair of connected adapters
    // ensure data are circulating between them in both directions
    // delete one adapter (ensure the socket is closed)
    // reopent it
    // ensure connection is restored and data are transmitted
    NetConfig nc;
    PrivateKey pk0(2048);
    PrivateKey pk1(2048);
    NodeInfo nodeInfo0(PublicKey(pk0), 0, "node-0", "127.0.0.1", "0:0:0:0:0:0:0:1", "127.0.0.1", 14000, 16000, 18000);
    nc.addNode(nodeInfo0);
    NodeInfo nodeInfo1(PublicKey(pk1), 1, "node-1", "127.0.0.1", "0:0:0:0:0:0:0:1", "127.0.0.1", 14001, 16001, 18001);
    nc.addNode(nodeInfo1);
    string received0("");
    string received1("");
    promise<void> prs0;
    promise<void> prs1;
    auto d0 = make_shared<UDPAdapter>(pk0, 0, nc, [&](const byte_vector& packet, const NodeInfo& fromNode){
        received0 = string(packet.begin(), packet.end());
        prs0.set_value();
    }, true);
    auto d1 = make_shared<UDPAdapter>(pk1, 1, nc, [&](const byte_vector& packet, const NodeInfo& fromNode){
        received1 = string(packet.begin(), packet.end());
        prs1.set_value();
    }, true);

    string payloadA("test data set 1");
    string payloadB("test data set 2");

    d0->send(1, byte_vector(payloadA.begin(), payloadA.end()));
    d1->send(0, byte_vector(payloadB.begin(), payloadB.end()));

    if (prs0.get_future().wait_for(25s) != future_status::ready)
        REQUIRE(false); //timeout
    REQUIRE(payloadB == received0);
    if (prs1.get_future().wait_for(25s) != future_status::ready)
        REQUIRE(false); //timeout
    REQUIRE(payloadA == received1);

    cout << "close socket and reopen with new adapter" << endl;
    d1 = nullptr;

    // create new adapter with nodeInfo1 credentials
    string received2("");
    promise<void> prs2;
    auto d2 = make_shared<UDPAdapter>(pk1, 1, nc, [&](const byte_vector& packet, const NodeInfo& fromNode){
        received2 = string(packet.begin(), packet.end());
        prs2.set_value();
    }, true);

//    d0->enableLog(true);
//    d2->enableLog(true);

    //reconnect becomes available  HANDSHAKE_TIMEOUT_MILLIS after previous connect, so we should sleep here
    long sleepTime = UDPAdapter::HANDSHAKE_TIMEOUT_MILLIS;
    this_thread::sleep_for(std::chrono::milliseconds(sleepTime));
    long reconnectStartTime = getCurrentTimeMillis();
    d0->send(1, byte_vector(payloadA.begin(), payloadA.end()));

    if (prs2.get_future().wait_for(25s) != future_status::ready)
        REQUIRE(false); //timeout
    long reconnectTime = getCurrentTimeMillis() - reconnectStartTime;
    REQUIRE(payloadA == received2);
    cout << "reconnect time: " << reconnectTime << " ms" << endl;
    REQUIRE(reconnectTime < 200);
}

TEST_CASE("LostPackets") {
    AdaptersList env(2);

    env.adapters[0]->setTestMode(true);
    env.adapters[1]->setTestMode(true);

    string payloadA("test data set 1");
    string payloadB("test data set 2");

    const long countToSend = 10;

    atomic<long> receiveCounter0(0);
    atomic<long> receiveCounter1(0);

    promise<void> prs0;
    promise<void> prs1;

    env.adapters[0]->setReceiveCallback([&](const byte_vector& packet, const NodeInfo& fromNode){
        REQUIRE(string(packet.begin(), packet.end()) == payloadB);
        ++receiveCounter0;
        if (receiveCounter0 >= countToSend)
            prs0.set_value();
    });
    env.adapters[1]->setReceiveCallback([&](const byte_vector& packet, const NodeInfo& fromNode){
        REQUIRE(string(packet.begin(), packet.end()) == payloadA);
        ++receiveCounter1;
        if (receiveCounter1 >= countToSend)
            prs1.set_value();
    });

    for (int i = 0; i < countToSend; ++i) {
        env.adapters[0]->send(1, byte_vector(payloadA.begin(), payloadA.end()));
        env.adapters[1]->send(0, byte_vector(payloadB.begin(), payloadB.end()));
    }

    if (prs0.get_future().wait_for(40s) != future_status::ready)
        REQUIRE(false); //timeout
    REQUIRE(long(receiveCounter0) == countToSend);
    if (prs1.get_future().wait_for(40s) != future_status::ready)
        REQUIRE(false); //timeout
    REQUIRE(long(receiveCounter1) == countToSend);

}

TEST_CASE("SendBadNetConfig") {
    NetConfig nc;
    PrivateKey pk0(2048);
    PrivateKey pk1(2048);
    PrivateKey pk2(2048);
    PrivateKey pk3(2048);
    PrivateKey pk3bad(2048);
    NodeInfo nodeInfo0(PublicKey(pk0), 0, "node-0", "127.0.0.1", "0:0:0:0:0:0:0:1", "127.0.0.1", 14000, 16000, 18000);
    nc.addNode(nodeInfo0);
    NodeInfo nodeInfo1(PublicKey(pk1), 1, "node-1", "127.0.0.1", "0:0:0:0:0:0:0:1", "127.0.0.1", 14001, 16001, 18001);
    nc.addNode(nodeInfo1);
    NodeInfo nodeInfo2(PublicKey(pk2), 2, "node-2", "127.0.0.1", "0:0:0:0:0:0:0:1", "127.0.0.1", 14002, 16002, 18002);
    nc.addNode(nodeInfo2);
    NodeInfo nodeInfo3(PublicKey(pk3), 3, "node-3", "127.0.0.1", "0:0:0:0:0:0:0:1", "127.0.0.1", 14003, 16003, 18003);
    nc.addNode(nodeInfo3);

    const long countToSend = 3;

    atomic<long> receiveCounter1(0);
    promise<void> prs1;
    atomic<long> receiveCounter3(0);
    promise<void> prs3;

    UDPAdapter d0 = UDPAdapter(pk0, 0, nc, [&](const byte_vector& packet, const NodeInfo& fromNode){}, true);
    UDPAdapter d1 = UDPAdapter(pk1, 1, nc, [&](const byte_vector& packet, const NodeInfo& fromNode){
        ++receiveCounter1;
        if (receiveCounter1 >= 3)
            prs1.set_value();
    }, true);
    //UDPAdapter d2 is missing;
    UDPAdapter d3 = UDPAdapter(pk3bad, 3, nc, [&](const byte_vector& packet, const NodeInfo& fromNode){
        ++receiveCounter3;
        if (receiveCounter3 >= 3)
            prs3.set_value();
    }, true);

    string payloadA("test data set 1");

    //send to missing node, its should not affect other sessions
    for (long i = 0; i < countToSend; ++i)
        d0.send(2, byte_vector(payloadA.begin(), payloadA.end()));

    //send to node with wrong private key, should not deliver
    for (long i = 0; i < countToSend; ++i)
        d0.send(3, byte_vector(payloadA.begin(), payloadA.end()));

    //send to normal node, should works fine
    for (long i = 0; i < countToSend; ++i)
        d0.send(1, byte_vector(payloadA.begin(), payloadA.end()));

    if (prs1.get_future().wait_for(15s) != future_status::ready)
        REQUIRE(false); //timeout
    REQUIRE(long(receiveCounter1) == countToSend);
    if (prs3.get_future().wait_for(5s) == future_status::ready)
        REQUIRE(false); //packets has delivered, but it should not
    REQUIRE(long(receiveCounter3) == 0);
}

TEST_CASE("TwoAdapters") {
    AdaptersList env(2);

    atomic<long> sendCounter0(0);
    atomic<long> sendCounter1(0);
    atomic<long> receiveCounter0(0);
    atomic<long> receiveCounter1(0);

    atomic<bool> stopFlag0(false);
    atomic<bool> stopFlag1(false);

    const int sendSpeed = 10;

    string payloadA("test data set 1");
    string payloadB("test data set 2");

    env.adapters[0]->setReceiveCallback([&](const byte_vector& packet, const NodeInfo& fromNode){
        REQUIRE (payloadB == string(packet.begin(), packet.end()));
        ++receiveCounter0;
    });
    env.adapters[1]->setReceiveCallback([&](const byte_vector& packet, const NodeInfo& fromNode){
        REQUIRE (payloadA == string(packet.begin(), packet.end()));
        ++receiveCounter1;
    });

    thread senderThread0;
    thread senderThread1;

    //initiate handshake
    env.adapters[0]->send(1, byte_vector(payloadA.begin(), payloadA.end()));
    env.adapters[1]->send(0, byte_vector(payloadB.begin(), payloadB.end()));
    ++sendCounter0;
    ++sendCounter1;
    this_thread::sleep_for(800ms);

    senderThread0 = thread([&](){
        while(true) {
            for (int i = 0; i < sendSpeed; ++i) {
                env.adapters[0]->send(1, byte_vector(payloadA.begin(), payloadA.end()));
                ++sendCounter0;
            }
            this_thread::sleep_for(1ms);
            if (stopFlag0)
                break;
        }
    });
    senderThread1 = thread([&](){
        while(true) {
            for (int i = 0; i < sendSpeed; ++i) {
                env.adapters[1]->send(0, byte_vector(payloadB.begin(), payloadB.end()));
                ++sendCounter1;
            }
            this_thread::sleep_for(1ms);
            if (stopFlag1)
                break;
        }
    });

    this_thread::sleep_for(1000ms);

    stopFlag0 = true;
    stopFlag1 = true;
//    env.adapters[0]->printInternalState();
//    env.adapters[1]->printInternalState();

    this_thread::sleep_for(chrono::milliseconds(UDPAdapter::RETRANSMIT_MAX_ATTEMPTS*UDPAdapter::RETRANSMIT_TIME + 1000));

//    env.adapters[0]->printInternalState();
//    env.adapters[1]->printInternalState();

    cout << "sendCounter0=" << sendCounter0 << "   ==   receiveCounter1=" << receiveCounter1 << endl;
    cout << "sendCounter1=" << sendCounter1 << "   ==   receiveCounter0=" << receiveCounter0 << endl;
    REQUIRE(long(sendCounter0) == long(receiveCounter1));
    REQUIRE(long(sendCounter1) == long(receiveCounter0));
    senderThread0.join();
    senderThread1.join();
}

TEST_CASE("ConcurrencySend") {
    AdaptersList env(2);

    atomic<long> sendCounter0(0);
    atomic<long> sendCounter1(0);
    atomic<long> receiveCounter0(0);
    atomic<long> receiveCounter1(0);

    atomic<bool> stopFlag0(false);
    atomic<bool> stopFlag1(false);

    const int sendSpeed = 3;

    string payloadA("test data set 1");
    string payloadB("test data set 2");

    env.adapters[0]->setReceiveCallback([&](const byte_vector& packet, const NodeInfo& fromNode){
        REQUIRE (payloadB == string(packet.begin(), packet.end()));
        ++receiveCounter0;
    });
    env.adapters[1]->setReceiveCallback([&](const byte_vector& packet, const NodeInfo& fromNode){
        REQUIRE (payloadA == string(packet.begin(), packet.end()));
        ++receiveCounter1;
    });

    //initiate handshake
    env.adapters[0]->send(1, byte_vector(payloadA.begin(), payloadA.end()));
    env.adapters[1]->send(0, byte_vector(payloadB.begin(), payloadB.end()));
    ++sendCounter0;
    ++sendCounter1;
    this_thread::sleep_for(800ms);

    vector<thread> senderThreads;
    for (int it = 0; it < 4; ++it) {
        senderThreads.push_back(thread([&](){
            while(true) {
                for (int i = 0; i < sendSpeed; ++i) {
                    env.adapters[0]->send(1, byte_vector(payloadA.begin(), payloadA.end()));
                    ++sendCounter0;
                }
                this_thread::sleep_for(2ms);
                if (stopFlag0)
                    break;
            }
        }));
        senderThreads.push_back(thread([&](){
            while(true) {
                for (int i = 0; i < sendSpeed; ++i) {
                    env.adapters[1]->send(0, byte_vector(payloadB.begin(), payloadB.end()));
                    ++sendCounter1;
                }
                this_thread::sleep_for(2ms);
                if (stopFlag1)
                    break;
            }
        }));
    }

    this_thread::sleep_for(1000ms);

    stopFlag0 = true;
    stopFlag1 = true;
//    env.adapters[0]->printInternalState();
//    env.adapters[1]->printInternalState();

    this_thread::sleep_for(chrono::milliseconds(UDPAdapter::RETRANSMIT_MAX_ATTEMPTS*UDPAdapter::RETRANSMIT_TIME + 1000));

//    env.adapters[0]->printInternalState();
//    env.adapters[1]->printInternalState();

    cout << "sendCounter0=" << sendCounter0 << "   ==   receiveCounter1=" << receiveCounter1 << endl;
    cout << "sendCounter1=" << sendCounter1 << "   ==   receiveCounter0=" << receiveCounter0 << endl;
    REQUIRE(long(sendCounter0) == long(receiveCounter1));
    REQUIRE(long(sendCounter1) == long(receiveCounter0));
    for (auto& t : senderThreads)
        t.join();
}
