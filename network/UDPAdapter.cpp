//
// Created by Leonid Novikov on 2/5/19.
//

#include "UDPAdapter.h"
#include <vector>
#include <cstring>
#include <random>
#include "UDPAdapterPrivate.h"
#include "../AsyncIO/AsyncIO.h"
#include "../crypto/base64.h"
#include "../tools/ConditionVar.h"
#include "../crypto/SymmetricKey.h"

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

        Session& session = getOrCreateSession(dest);
        if (session.getState() == Session::SessionState::STATE_HANDSHAKE) {
            session.addPayloadToOutputQueue(dest, payload);
        } else {
            if (session.retransmitMap.size() > MAX_RETRANSMIT_QUEUE_SIZE)
                session.addPayloadToOutputQueue(dest, payload);
            else
                sendPayload(session, payload);
        }

        //sendPacket(dest, payload);
        //sendPayload(session, payload);
    }

    void UDPAdapter::onReceive(const byte_vector& data) {
        receiveCallback_(data);
    }

    byte_vector UDPAdapter::preparePayloadForSession(const crypto::SymmetricKey& sessionKey, const byte_vector& payload) {
        byte_vector payloadWithRandomChunk(payload.size() + 2);
        memcpy(&payloadWithRandomChunk[0], &payload[0], payload.size());
        sprng_read(&payloadWithRandomChunk[payload.size()], 2, NULL);
        auto encryptedPayload = sessionKey.etaEncrypt(payloadWithRandomChunk);
        encryptedPayload.resize(encryptedPayload.size() + 4);
        crc32_state ctx;
        crc32_init(&ctx);
        crc32_update(&ctx, &encryptedPayload[0], encryptedPayload.size()-4);
        crc32_finish(&ctx, &encryptedPayload[encryptedPayload.size()-4], 4);
        return encryptedPayload;

    }

    void UDPAdapter::sendPayload(Session& session, const byte_vector& payload) {
        auto dataToSend = preparePayloadForSession(session.sessionKey, payload);
        sendPacket(session.remoteNodeInfo, dataToSend);
        session.addPayloadToOutputQueue(session.remoteNodeInfo, payload);
    }

    void UDPAdapter::sendPacket(const NodeInfo& dest, const byte_vector& data) {
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
        long now = getCurrentTimeMillis();
        for (auto it : sessionsByRemoteId)
            restartHandshakeIfNeeded(it.second, now);
    }

    void UDPAdapter::restartHandshakeIfNeeded(Session& session, long now) {
        if (session.getState() == Session::SessionState::STATE_HANDSHAKE) {
            if (session.handshakeExpiresAt < now) {
                session.handshakeStep = Session::HandshakeState::HANDSHAKE_STEP_WAIT_FOR_WELCOME;
                session.handshakeExpiresAt = now + HANDSHAKE_TIMEOUT_MILLIS;
                sendHello(session);
            }
        }
    }

    void UDPAdapter::pulseRetransmit() {
        //printf("pulseRetransmit\n");
    }

    void UDPAdapter::clearProtectionFromDupleBuffers() {
        //printf("clearProtectionFromDupleBuffers\n");
    }

    Session& UDPAdapter::getOrCreateSession(const NodeInfo& destination) {
        std::unordered_map<int, Session>::iterator iter = sessionsByRemoteId.find(destination.getNumber());
        if (iter == sessionsByRemoteId.end()) {
            Session session(destination);
            session.sessionKey = sessionKey_;
            iter = sessionsByRemoteId.insert(std::make_pair(destination.getNumber(), session)).first;
        }
        return iter->second;
    }

    void UDPAdapter::sendHello(Session& session) {
        byte_vector helloNonce(64);
        sprng_read(&helloNonce[0], 64, NULL);
        auto encryptedPayload = session.remoteNodeInfo.getPublicKey().encrypt(helloNonce);
        sendPacket(session.remoteNodeInfo, encryptedPayload);
        session.addPayloadToOutputQueue(session.remoteNodeInfo, helloNonce);
    }

};
