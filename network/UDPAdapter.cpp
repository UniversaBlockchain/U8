//
// Created by Leonid Novikov on 2/5/19.
//

#include "UDPAdapter.h"
#include <vector>
#include <cstring>
#include <random>
#include "../AsyncIO/AsyncIO.h"
#include "../crypto/base64.h"
#include "../tools/ConditionVar.h"

namespace network {

    UDPAdapter::UDPAdapter(const crypto::PrivateKey& ownPrivateKey, int ownNodeNumber, const NetConfig& netConfig,
                           const TReceiveCallback& receiveCallback)
       :netConfig_(netConfig) {

        unsigned int seed = std::chrono::duration_cast<std::chrono::nanoseconds>(std::chrono::high_resolution_clock::now().time_since_epoch()).count();
        std::minstd_rand minstdRand(static_cast<int>(seed));
        nextPacketId_ = minstdRand();

        receiveCallback_ = receiveCallback;
        auto ownNodeInfo = netConfig.getInfo(ownNodeNumber);
        socket_.openUDP(ownNodeInfo.getNodeAddress().host.c_str(), ownNodeInfo.getNodeAddress().port);
        socket_.recv([&](ssize_t result, const asyncio::byte_vector& data, const char* IP, unsigned int port) {
            if (result > 0)
                onReceive(data);
        });

        long dupleProtectionPeriod = 2 * RETRANSMIT_TIME_GROW_FACTOR * RETRANSMIT_TIME * RETRANSMIT_MAX_ATTEMPTS;
        long protectionFromDuple_prevTime = getCurrentTimeMillis();
        timer_.scheduleAtFixedRate([this, protectionFromDuple_prevTime, dupleProtectionPeriod]()mutable{
            restartHandshakeIfNeeded();
            pulseRetransmit();
            if (getCurrentTimeMillis() - protectionFromDuple_prevTime >= dupleProtectionPeriod) {
                clearProtectionFromDupleBuffers();
                protectionFromDuple_prevTime = getCurrentTimeMillis();
            }
        }, RETRANSMIT_TIME, RETRANSMIT_TIME);

    }

    UDPAdapter::~UDPAdapter() {
        socket_.stopRecv();
        ConditionVar cv;
        socket_.close([&](ssize_t result){
            cv.notifyAll();
        });
        cv.wait(9000ms);
    }

    void UDPAdapter::send(int destNodeNumber, const byte_vector& payload) {
        auto dest = netConfig_.getInfo(destNodeNumber);
        sendData(dest, payload);
    }

    void UDPAdapter::onReceive(const byte_vector& data) {
        receiveCallback_(data);
    }

    void UDPAdapter::sendData(const NodeInfo& dest, const byte_vector& data) {
        if (data.size() > MAX_PACKET_SIZE)
            throw std::invalid_argument(std::string("datagram size too long, MAX_PACKET_SIZE is ") + std::to_string(MAX_PACKET_SIZE));
        socket_.send(data, dest.getNodeAddress().host.c_str(), dest.getNodeAddress().port, [&](ssize_t result){});
    }

    int UDPAdapter::getNextPacketId() {
        int res = nextPacketId_;
        if (nextPacketId_ >= INT32_MAX)
            nextPacketId_ = 1;
        else
            ++nextPacketId_;
        return res;
    }

    void UDPAdapter::restartHandshakeIfNeeded() {
    }

    void UDPAdapter::pulseRetransmit() {
        //printf("pulseRetransmit\n");
    }

    void UDPAdapter::clearProtectionFromDupleBuffers() {
        //printf("clearProtectionFromDupleBuffers\n");
    }

};
