/*
 * Copyright (c) 2019-present Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

#include "UDPAdapterPrivate.h"
#include "UDPAdapter.h"
#include "../serialization/BossSerializer.h"
#include "../types/UArray.h"

namespace network {

    Packet::Packet(int packetId, int senderNodeId, int receiverNodeId, int type, const byte_vector& payload) {
        packetId_ = packetId;
        senderNodeId_ = senderNodeId;
        receiverNodeId_ = receiverNodeId;
        type_ = type;
        payload_ = payload;
    }

    Packet::Packet(const byte_vector& packedData) {
        UArray uArr = bossLoadArray(packedData);
        packetId_ = int(UInt::asInstance(uArr.at(0)).get());
        senderNodeId_ = int(UInt::asInstance(uArr.at(1)).get());
        receiverNodeId_ = int(UInt::asInstance(uArr.at(2)).get());
        type_ = int(UInt::asInstance(uArr.at(3)).get());
        payload_ = UBytes::asInstance(uArr.at(4)).get();
    }

    byte_vector Packet::makeByteArray() const {
        UArray ua = {
                UInt(packetId_),
                UInt(senderNodeId_),
                UInt(receiverNodeId_),
                UInt(type_),
                UBytesFromByteVector(payload_)
        };
        return bossDumpArray(ua);
    }

    bool DupleProtection::protectFromDuples(int packetId) {
        if ((buffer0.find(packetId) == buffer0.end()) && (buffer1.find(packetId) == buffer1.end())) {
            buffer0.insert(packetId);
            return true;
        }
        return false;
    }

    void DupleProtection::clearOldestBuffer() {
        buffer1 = buffer0;
        buffer0.clear();
    }

    OutputQueueItem::OutputQueueItem(const NodeInfo& newDestination, const byte_vector& newPayload)
        :destination(newDestination)
        ,payload(newPayload) {
    }

    RetransmitItem::RetransmitItem(const Packet& newPacket, const byte_vector& newSourcePayload, int randomValue)
        :packet(newPacket)
        ,retransmitCounter(0)
        ,sourcePayload(newSourcePayload)
        ,receiverNodeId(packet.getReceiverNodeId())
        ,packetId(packet.getPacketId())
        ,type(packet.getType()) {
        updateNextRetransmitTime(randomValue);
    }

    void RetransmitItem::updateNextRetransmitTime(int randomValue) {
        long maxRetransmitDelay = UDPAdapter::RETRANSMIT_TIME_GROW_FACTOR*retransmitCounter + UDPAdapter::RETRANSMIT_MAX_ATTEMPTS;
        maxRetransmitDelay /= UDPAdapter::RETRANSMIT_MAX_ATTEMPTS;
        maxRetransmitDelay *= UDPAdapter::RETRANSMIT_TIME;
        maxRetransmitDelay += UDPAdapter::RETRANSMIT_TIME/2;
        maxRetransmitDelay = randomValue % maxRetransmitDelay;
        maxRetransmitDelay = std::max((long)UDPAdapter::RETRANSMIT_TIME, maxRetransmitDelay);
        nextRetransmitTimeMillis = getCurrentTimeMillis() + maxRetransmitDelay;
    }

    Retransmitter::Retransmitter(const NodeInfo& newRemoteNodeInfo)
        :remoteNodeInfo(newRemoteNodeInfo)
        ,minstdRand_(std::chrono::duration_cast<std::chrono::nanoseconds>(std::chrono::high_resolution_clock::now().time_since_epoch()).count()) {
    }

    void Retransmitter::removeHandshakePacketsFromRetransmitMap() {
        std::vector<decltype(retransmitMap)::key_type> vec;
        for (auto& p : retransmitMap)
            if (p.second.type != PacketTypes::DATA)
                vec.push_back(p.first);
        for (auto& key : vec)
            retransmitMap.erase(key);
        retransmitMapSize = retransmitMap.size();
    }

    void Retransmitter::addPacketToRetransmitMap(int packetId, const Packet& packet, const byte_vector& sourcePayload) {
        retransmitMap.insert(make_pair(packetId, RetransmitItem(packet, sourcePayload, minstdRand_())));
        retransmitMapSize = retransmitMap.size();
    }

    void Retransmitter::removePacketFromRetransmitMap(int packetId) {
        retransmitMap.erase(packetId);
        retransmitMapSize = retransmitMap.size();
    }

    void Retransmitter::pulseRetransmit(std::function<void(const NodeInfo&, const Packet&)> funcSendPacket) {
        std::vector<decltype(retransmitMap)::key_type> vecToErase;
        if (getState() == SessionState::STATE_EXCHANGING) {
            for (auto& item : retransmitMap) {
                if (item.second.nextRetransmitTimeMillis < getCurrentTimeMillis()) {
                    item.second.updateNextRetransmitTime(minstdRand_());
                    if (item.second.type == PacketTypes::DATA) {
                        if (item.second.packet.isEmpty()) {
                            byte_vector dataToSend = UDPAdapter::preparePayloadForSession(sessionKey, item.second.sourcePayload);
                            item.second.packet.updatePayload(std::move(dataToSend));
                        }
                        funcSendPacket(remoteNodeInfo, item.second.packet);
                    }
                    if (item.second.retransmitCounter++ >= UDPAdapter::RETRANSMIT_MAX_ATTEMPTS)
                        vecToErase.push_back(item.first);
                }
            }
        } else {
            for (auto& item : retransmitMap) {
                if (item.second.nextRetransmitTimeMillis < getCurrentTimeMillis()) {
                    item.second.updateNextRetransmitTime(minstdRand_());
                    if (item.second.type != PacketTypes::DATA) {
                        if (!item.second.packet.isEmpty())
                            funcSendPacket(remoteNodeInfo, item.second.packet);
                        if (item.second.retransmitCounter++ >= UDPAdapter::RETRANSMIT_MAX_ATTEMPTS)
                            vecToErase.push_back(item.first);
                    }
                }
            }
        }
        for (auto& key : vecToErase)
            retransmitMap.erase(key);
        retransmitMapSize = retransmitMap.size();
    }

    SessionState Retransmitter::getState() {
        return SessionState::STATE_HANDSHAKE;
    }

    Session::Session(const NodeInfo& newRemoteNodeInfo): Retransmitter(newRemoteNodeInfo) {
        localNonce.resize(64);
        sprng_read(&localNonce[0], 64, NULL);
        state = SessionState::STATE_HANDSHAKE;
        handshakeStep = HandshakeState::HANDSHAKE_STEP_INIT;
        handshakeExpiresAt = getCurrentTimeMillis() - UDPAdapter::HANDSHAKE_TIMEOUT_MILLIS;
        lastHandshakeRestartTime = getCurrentTimeMillis();
    }

    void Session::reconstructSessionKey(const byte_vector& key) {
        sessionKey = crypto::SymmetricKey(key);
    }

    SessionState Session::getState() {
        return state;
    }

    void Session::addPayloadToOutputQueue(const NodeInfo& destination, const byte_vector& payload) {
        if (outputQueue.size() >= UDPAdapter::MAX_QUEUE_SIZE)
            outputQueue.pop();
        outputQueue.push(OutputQueueItem(destination, payload));
    }

    void Session::sendAllFromOutputQueue(std::function<void(const NodeInfo&, const byte_vector&)> funcSend) {
        if (state != SessionState::STATE_HANDSHAKE) {
            int maxOutputs = UDPAdapter::MAX_RETRANSMIT_QUEUE_SIZE - retransmitMap.size();
            int i = 0;
            while (!outputQueue.empty()) {
                const auto& q = outputQueue.front();
                funcSend(q.destination, q.payload);
                outputQueue.pop();
                if (i++ > maxOutputs)
                    break;
            }
        }
    }

    void Session::startHandshake() {
        auto now = getCurrentTimeMillis();
        if (lastHandshakeRestartTime + UDPAdapter::HANDSHAKE_TIMEOUT_MILLIS <= now) {
            for (auto& it : retransmitMap) {
                it.second.retransmitCounter = 0;
                it.second.packet.nullify();
                it.second.nextRetransmitTimeMillis = now;
            }
            removeHandshakePacketsFromRetransmitMap();
            handshakeStep = HandshakeState::HANDSHAKE_STEP_INIT;
            handshakeExpiresAt = now - UDPAdapter::HANDSHAKE_TIMEOUT_MILLIS;
            state = SessionState::STATE_HANDSHAKE;
            lastHandshakeRestartTime = now;
        } else {
            //checkpoint for debug output, do nothing
        }
    }

    SessionReader::SessionReader(const NodeInfo& newRemoteNodeInfo): Retransmitter(newRemoteNodeInfo) {
        nextLocalNonceGenerationTime = getCurrentTimeMillis() - UDPAdapter::HANDSHAKE_TIMEOUT_MILLIS;
    }

};
