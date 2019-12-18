/*
 * Copyright (c) 2019-present Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

#include "UDPAdapter.h"
#include <vector>
#include <cstring>
#include <random>
#include "UDPAdapterPrivate.h"
#include "../AsyncIO/AsyncIO.h"
#include "../crypto/base64.h"
#include "../crypto/SymmetricKey.h"
#include "../types/UArray.h"
#include "../serialization/BossSerializer.h"

namespace network {

    UDPAdapter::UDPAdapter(const crypto::PrivateKey& ownPrivateKey, int ownNodeNumber, const NetConfig& netConfig,
                           const TReceiveCallback& receiveCallback, bool throwErrors)
       :minstdRand_(std::chrono::duration_cast<std::chrono::nanoseconds>(std::chrono::high_resolution_clock::now().time_since_epoch()).count())
       ,senderPool_(1)
       ,receiverPool_(1)
       ,netConfig_(netConfig)
       ,ownNodeInfo_(netConfig.getInfo(ownNodeNumber))
       ,ownPrivateKey_(ownPrivateKey)
       ,throwErrors_(throwErrors) {
        logLabel_ = std::string("UDP") + std::to_string(ownNodeNumber) + std::string(": ");

        nextPacketId_ = minstdRand_();

        receiveCallback_ = receiveCallback;
        socket_.open("::", ownNodeInfo_.getNodeAddress().port, UDP_BUFFER_SIZE);
        socket_.recv([=](ssize_t result, const asyncio::byte_vector& data, const char* IP, unsigned int port) {
            if (result > 0)
                receiverPool_.execute([&,data](){
                    onReceive(data);
                });
        });

        long dupleProtectionPeriod = 2 * RETRANSMIT_TIME_GROW_FACTOR * RETRANSMIT_TIME * RETRANSMIT_MAX_ATTEMPTS;
        long protectionFromDuple_prevTime = getCurrentTimeMillis();
        timer_.scheduleAtFixedRate([this, protectionFromDuple_prevTime, dupleProtectionPeriod]()mutable{
            std::unique_lock lock(socketMutex_);
            restartHandshakeIfNeeded();
            pulseRetransmit();
            if (getCurrentTimeMillis() - protectionFromDuple_prevTime >= dupleProtectionPeriod) {
                clearProtectionFromDupleBuffers();
                protectionFromDuple_prevTime = getCurrentTimeMillis();
            }
        }, RETRANSMIT_TIME, RETRANSMIT_TIME);
    }

    UDPAdapter::~UDPAdapter() {
        {
            std::unique_lock lock(socketMutex_);
            isClosed_ = true;
            timer_.stop();
            socket_.stopRecv();
        }
        std::promise<void> prs;
        socket_.close([&](ssize_t result){
            prs.set_value();
        });
        if (prs.get_future().wait_for(9000ms) != std::future_status::ready)
            writeErr("~UDPAdapter(): timeout");
    }

    void UDPAdapter::send(int destNodeNumber, const byte_vector& payload) {
        senderPool_.execute([&, destNodeNumber, payload](){
            Session& session = getOrCreateSession(destNodeNumber);
            SessionState state;
            {
                std::unique_lock lock(socketMutex_);
                if (isClosed_)
                    return;
                state = session.getState();
            }
            if (state == SessionState::STATE_HANDSHAKE) {
                std::unique_lock lock(socketMutex_);
                session.addPayloadToOutputQueue(session.remoteNodeInfo, payload);
            } else {
                bool sendNow = false;
                {
                    std::unique_lock lock(socketMutex_);
                    if (session.retransmitMapSize > MAX_RETRANSMIT_QUEUE_SIZE) {
                        session.addPayloadToOutputQueue(session.remoteNodeInfo, payload);
                    } else {
                        sendNow = true;
                        ++session.retransmitMapSize;
                    }
                }
                if (sendNow)
                    sendPayload(session, payload);
            }
        });
    }

    void UDPAdapter::onReceive(const byte_vector& data) {
        std::unique_lock lock(socketMutex_);
        if (isClosed_)
            return;
        try {
            Packet packet(data);
            switch (packet.getType()) {
                case PacketTypes::HELLO:
                    onReceiveHello(packet);
                    break;
                case PacketTypes::WELCOME:
                    onReceiveWelcome(packet);
                    break;
                case PacketTypes::KEY_REQ_PART1:
                    onReceiveKeyReqPart1(packet);
                    break;
                case PacketTypes::KEY_REQ_PART2:
                    onReceiveKeyReqPart2(packet);
                    break;
                case PacketTypes::SESSION_PART1:
                    onReceiveSessionPart1(packet);
                    break;
                case PacketTypes::SESSION_PART2:
                    onReceiveSessionPart2(packet);
                    break;
                case PacketTypes::SESSION_ACK:
                    onReceiveSessionAck(packet);
                    break;
                case PacketTypes::DATA:
                    onReceiveData(packet);
                    break;
                case PacketTypes::ACK:
                    onReceiveAck(packet);
                    break;
                case PacketTypes::NACK:
                    onReceiveNack(packet);
                    break;
                default:
                    writeErr("received unknown packet type: ", packet.getType());
                    break;
            }
        } catch (const std::exception& e) {
            writeErr("onReceive exception: ", e.what());
        }
    }

    void UDPAdapter::onReceiveHello(const Packet& packet) {
        writeLog("received hello from ", packet.getSenderNodeId());
        const NodeInfo& nodeInfo = netConfig_.getInfo(packet.getSenderNodeId());
        SessionReader& sessionReader = getOrCreateSessionReaderCandidate(packet.getSenderNodeId());
        if (sessionReader.protectFromDuples(packet.getPacketId())) {
            if (sessionReader.nextLocalNonceGenerationTime < getCurrentTimeMillis()) {
                sessionReader.localNonce.resize(64);
                sprng_read(&sessionReader.localNonce[0], 64, NULL);
                sessionReader.nextLocalNonceGenerationTime = getCurrentTimeMillis() + HANDSHAKE_TIMEOUT_MILLIS;
            }
            sessionReader.handshake_keyReqPart1.resize(0);
            sessionReader.handshake_keyReqPart2.resize(0);
            sendWelcome(sessionReader);
        }
    }

    void UDPAdapter::onReceiveWelcome(const Packet& packet) {
        writeLog("received welcome from ", packet.getSenderNodeId());
        const NodeInfo& nodeInfo = netConfig_.getInfo(packet.getSenderNodeId());
        Session& session = getOrCreateSession(nodeInfo);
        if (session.protectFromDuples(packet.getPacketId())) {
            if ((session.state == SessionState::STATE_HANDSHAKE) && (session.handshakeStep == HandshakeState::HANDSHAKE_STEP_WAIT_FOR_WELCOME)) {
                try {
                    UArray uArr = bossLoadArray(packet.getPayloadRef());
                    byte_vector remoteNonce = UBytes::asInstance(uArr.at(0)).get();
                    byte_vector packetSign = UBytes::asInstance(uArr.at(1)).get();
                    if (session.remoteNodeInfo.getPublicKey().verify(packetSign, remoteNonce,
                                                                     crypto::HashType::SHA512)) {
                        session.removeHandshakePacketsFromRetransmitMap();
                        session.remoteNonce = remoteNonce;
                        sendKeyReq(session);
                    }
                } catch (const std::exception& e) {
                    writeErr("onReceiveWelcome exception: ", e.what());
                }
            }
        }
    }

    void UDPAdapter::onReceiveKeyReqPart1(const Packet& packet) {
        writeLog("received key_req_part1 from ", packet.getSenderNodeId());
        SessionReader& sessionReader = getOrCreateSessionReaderCandidate(packet.getSenderNodeId());
        if (sessionReader.protectFromDuples(packet.getPacketId())) {
            sessionReader.removeHandshakePacketsFromRetransmitMap();
            sessionReader.handshake_keyReqPart1 = packet.getPayloadRef();
            onReceiveKeyReq(sessionReader);
        }
    }

    void UDPAdapter::onReceiveKeyReqPart2(const Packet& packet) {
        writeLog("received key_req_part2 from ", packet.getSenderNodeId());
        SessionReader& sessionReader = getOrCreateSessionReaderCandidate(packet.getSenderNodeId());
        if (sessionReader.protectFromDuples(packet.getPacketId())) {
            sessionReader.removeHandshakePacketsFromRetransmitMap();
            sessionReader.handshake_keyReqPart2 = packet.getPayloadRef();
            onReceiveKeyReq(sessionReader);
        }
    }

    void UDPAdapter::onReceiveKeyReq(SessionReader& sessionReader) {
        if (!sessionReader.handshake_keyReqPart1.empty() && !sessionReader.handshake_keyReqPart2.empty()) {
            try {
                writeLog("received both parts of key_req from ", sessionReader.remoteNodeInfo.getNumber());

                UArray uArr = bossLoadArray(ownPrivateKey_.decrypt(sessionReader.handshake_keyReqPart1));
                byte_vector packet_senderNonce = UBytes::asInstance(uArr.at(0)).get();
                byte_vector packet_remoteNonce = UBytes::asInstance(uArr.at(1)).get();

                if (packet_remoteNonce == sessionReader.localNonce) {
                    if (sessionReader.remoteNodeInfo.getPublicKey().verify(sessionReader.handshake_keyReqPart2, sessionReader.handshake_keyReqPart1, crypto::HashType::SHA512)) {
                        writeLog("key_req successfully verified");
                        sessionReader.remoteNonce = packet_senderNonce;
                        sessionReader.sessionKey = crypto::SymmetricKey();
                        auto remoteNodeId = sessionReader.remoteNodeInfo.getNumber();
                        acceptSessionReaderCandidate(sessionReader);
                        sendSessionKey(getSessionReader(remoteNodeId));
                    } else {
                        writeErr("onReceiveKeyReq: verify fails");
                    }
                } else {
                    writeLog("onReceiveKeyReq: remoteNonce mismatch (it's maybe datagram duplicate)");
                }

            } catch (const std::exception& e) {
                writeErr("onReceiveKeyReq exception: ", e.what());
            }
        }
    }

    void UDPAdapter::onReceiveSessionPart1(const Packet& packet) {
        writeLog("received session_part1 from ", packet.getSenderNodeId());
        const auto& nodeInfo = netConfig_.getInfo(packet.getSenderNodeId());
        Session& session = getOrCreateSession(nodeInfo);
        if (session.protectFromDuples(packet.getPacketId())) {
            session.removeHandshakePacketsFromRetransmitMap();
            if ((session.state == SessionState::STATE_HANDSHAKE) && (session.handshakeStep == HandshakeState::HANDSHAKE_STEP_WAIT_FOR_SESSION)) {
                session.handshake_sessionPart1 = packet.getPayloadRef();
                onReceiveSession(session);
            }
        }
    }

    void UDPAdapter::onReceiveSessionPart2(const Packet& packet) {
        writeLog("received session_part2 from ", packet.getSenderNodeId());
        const auto& nodeInfo = netConfig_.getInfo(packet.getSenderNodeId());
        Session& session = getOrCreateSession(nodeInfo);
        if (session.protectFromDuples(packet.getPacketId())) {
            session.removeHandshakePacketsFromRetransmitMap();
            if ((session.state == SessionState::STATE_HANDSHAKE) && (session.handshakeStep == HandshakeState::HANDSHAKE_STEP_WAIT_FOR_SESSION)) {
                session.handshake_sessionPart2 = packet.getPayloadRef();
                onReceiveSession(session);
            }
        }
    }

    void UDPAdapter::onReceiveSession(Session& session) {
        if (!session.handshake_sessionPart1.empty() && !session.handshake_sessionPart2.empty()) {
            writeLog("received both parts of session from ", session.remoteNodeInfo.getNumber());
            if (session.remoteNodeInfo.getPublicKey().verify(session.handshake_sessionPart2, session.handshake_sessionPart1, crypto::HashType::SHA512)) {
                try {
                    UArray uArr = bossLoadArray(ownPrivateKey_.decrypt(session.handshake_sessionPart1));
                    byte_vector sessionKey = UBytes::asInstance(uArr.at(0)).get();
                    byte_vector nonce = UBytes::asInstance(uArr.at(1)).get();

                    if (nonce == session.localNonce) {
                        writeLog("session successfully verified");
                        sendSessionAck(session);
                        session.reconstructSessionKey(sessionKey);
                        session.state = SessionState::STATE_EXCHANGING;
                        //session.sendAllFromOutputQueue();
                        session.pulseRetransmit([this](const NodeInfo &dest, const Packet &packet) {
                            sendPacket(dest, packet.makeByteArray());
                        });
                    } else {
                        writeLog("onReceiveSession: localNonce mismatch");
                    }

                } catch (const std::exception& e) {
                    writeErr("onReceiveSession exception: ", e.what());
                }
            } else {
                writeErr("onReceiveSession: verify fails");
            }
        }
    }

    void UDPAdapter::onReceiveSessionAck(const Packet& packet) {
        writeLog("received session_ack from ", packet.getSenderNodeId());
        try {
            SessionReader &sessionReader = getSessionReader(packet.getSenderNodeId());
            sessionReader.removeHandshakePacketsFromRetransmitMap();
        } catch (const std::exception& e) {
            writeErr("onReceiveSessionAck exception: ", e.what());
        }

    }

    void UDPAdapter::onReceiveData(const Packet& packet) {
        writeLog("received data from ", packet.getSenderNodeId());

        byte_vector packet_crc32(4);
        const byte_vector& payload = packet.getPayloadRef();
        if (payload.size() <= 4) {
            writeErr("onReceiveData error: received too small packet, crc32 missing");
            return;
        }
        memcpy(&packet_crc32[0], &payload[payload.size()-4], 4);
        byte_vector encryptedPayload(payload);
        encryptedPayload.resize(payload.size()-4);

        byte_vector calculated_crc32(4);
        crc32_state ctx;
        crc32_init(&ctx);
        crc32_update(&ctx, &payload[0], payload.size()-4);
        crc32_finish(&ctx, &calculated_crc32[0], 4);

        if (sessionReaders_.find(packet.getSenderNodeId()) == sessionReaders_.end()) {
            sendNack(packet.getSenderNodeId(), packet.getPacketId());
        } else {
            SessionReader &sessionReader = getSessionReader(packet.getSenderNodeId());

            if (packet_crc32 == calculated_crc32) {
                try {
                    byte_vector decrypted = sessionReader.sessionKey.etaDecrypt(encryptedPayload);
                    if (decrypted.size() > 2) {
                        decrypted.resize(decrypted.size() - 2);
                        sendAck(sessionReader, packet.getPacketId());
                        if (sessionReader.protectFromDuples(packet.getPacketId()))
                            receiveCallback_(decrypted, sessionReader.remoteNodeInfo);
                    } else {
                        writeErr("onReceiveData error: decrypted payload too short");
                        sendNack(packet.getSenderNodeId(), packet.getPacketId());
                    }
                } catch (const std::exception &e) {
                    writeErr("onReceiveData exception: ", e.what());
                    sendNack(packet.getSenderNodeId(), packet.getPacketId());
                }
            } else {
                writeErr("onReceiveData error: crc32 mismatch");
            }
        }
    }

    void UDPAdapter::onReceiveAck(const Packet& packet) {
        writeLog("received ack from ", packet.getSenderNodeId());
        const auto& nodeInfo = netConfig_.getInfo(packet.getSenderNodeId());
        Session& session = getOrCreateSession(nodeInfo);
        if (session.state == SessionState::STATE_EXCHANGING) {
            try {
                byte_vector decrypted = session.sessionKey.etaDecrypt(packet.getPayloadRef());
                UBytes ub(std::move(decrypted));
                BossSerializer::Reader reader(ub);
                UObject uo = reader.readObject();
                int ackPacketId = UInt::asInstance(uo).get();
                session.removePacketFromRetransmitMap(ackPacketId);

            } catch (const std::exception& e) {
                writeErr("onReceiveAck exception: ", e.what());
            }
        }
    }

    void UDPAdapter::onReceiveNack(const Packet& packet) {
        writeLog("received nack from ", packet.getSenderNodeId());
        const auto& nodeInfo = netConfig_.getInfo(packet.getSenderNodeId());
        Session& session = getOrCreateSession(nodeInfo);
        if (session.state == SessionState::STATE_EXCHANGING) {
            try {
                UArray dataList = bossLoadArray(packet.getPayloadRef());
                byte_vector data = UBytes::asInstance(dataList.at(0)).get();
                byte_vector sign = UBytes::asInstance(dataList.at(1)).get();
                if (session.remoteNodeInfo.getPublicKey().verify(sign, data, crypto::HashType::SHA512)) {
                    UArray nackPacketIdList = bossLoadArray(data);
                    int nackPacketId = (int)UInt::asInstance(nackPacketIdList.at(0)).get();
                    if (session.retransmitMap.find(nackPacketId) != session.retransmitMap.end()) {
                        session.startHandshake();
                        restartHandshakeIfNeeded(session, getCurrentTimeMillis());
                    }
                }
            } catch (const std::exception& e) {
                //incorrect nack received. skip it silently
            }
        }
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
        Packet packet(getNextPacketId(), ownNodeInfo_.getNumber(), session.remoteNodeInfo.getNumber(), PacketTypes::DATA, dataToSend);
        byte_vector packetBytes = packet.makeByteArray();
        {
            std::unique_lock lock(socketMutex_);
            sendPacket(session.remoteNodeInfo, packetBytes);
            session.addPacketToRetransmitMap(packet.getPacketId(), packet, payload);
        }
    }

    void UDPAdapter::sendPacket(const NodeInfo& dest, const byte_vector& data) {
        if (data.size() > MAX_PACKET_SIZE)
            writeErr(std::string("datagram size too long, MAX_PACKET_SIZE is ") + std::to_string(MAX_PACKET_SIZE));
        if (testMode_ && (minstdRand_() % 1000 < 500)) {
            writeLog("test mode, skip socket_.send");
        } else {
            string host = dest.getHostV6();
            if (host == "null")
                host = dest.getHost();
            socket_.send(data, host.c_str(), dest.getNodeAddress().port, [&](ssize_t result) {});
        }
    }

    int UDPAdapter::getNextPacketId() {
        std::unique_lock lock(socketMutex_);
        int res = nextPacketId_;
        if (nextPacketId_ >= INT32_MAX)
            nextPacketId_ = 1;
        else
            ++nextPacketId_;
        return res;
    }

    void UDPAdapter::restartHandshakeIfNeeded() {
        long now = getCurrentTimeMillis();
        for (auto& it : sessionsByRemoteId_)
            restartHandshakeIfNeeded(it.second, now);
    }

    void UDPAdapter::restartHandshakeIfNeeded(Session& session, long now) {
        if (session.getState() == SessionState::STATE_HANDSHAKE) {
            if (session.handshakeExpiresAt < now) {
                session.handshakeStep = HandshakeState::HANDSHAKE_STEP_WAIT_FOR_WELCOME;
                session.handshakeExpiresAt = now + HANDSHAKE_TIMEOUT_MILLIS;
                sendHello(session);
            }
        }
    }

    void UDPAdapter::pulseRetransmit() {
        for (auto& s : sessionsByRemoteId_)
            s.second.pulseRetransmit([this](const NodeInfo& dest, const Packet& packet){
                sendPacket(dest, packet.makeByteArray());
            });
        for (auto& s : sessionReaders_)
            s.second.pulseRetransmit([this](const NodeInfo& dest, const Packet& packet){
                sendPacket(dest, packet.makeByteArray());
            });
        for (auto& s : sessionReaderCandidates_)
            s.second.pulseRetransmit([this](const NodeInfo& dest, const Packet& packet){
                sendPacket(dest, packet.makeByteArray());
            });
        for (auto& s : sessionsByRemoteId_)
            s.second.sendAllFromOutputQueue([this](const NodeInfo& dest, const byte_vector& data){
                send(dest.getNumber(), data);
            });
    }

    void UDPAdapter::clearProtectionFromDupleBuffers() {
        for (auto& s : sessionReaders_)
            s.second.clearOldestBuffer();
        for (auto& s : sessionReaderCandidates_)
            s.second.clearOldestBuffer();
        for (auto& s : sessionsByRemoteId_)
            s.second.clearOldestBuffer();
    }

    Session& UDPAdapter::getOrCreateSession(int nodeId) {
        std::unique_lock lock(socketMutex_);
        const auto& dest = netConfig_.getInfo(nodeId);
        return getOrCreateSession(dest);
    }

    Session& UDPAdapter::getOrCreateSession(const NodeInfo& destination) {
        auto iter = sessionsByRemoteId_.find(destination.getNumber());
        if (iter == sessionsByRemoteId_.end()) {
            Session session(destination);
            iter = sessionsByRemoteId_.insert(std::make_pair(destination.getNumber(), session)).first;
        }
        return iter->second;
    }

    SessionReader& UDPAdapter::getOrCreateSessionReaderCandidate(int remoteId) {
        const NodeInfo& destination = netConfig_.getInfo(remoteId);
        auto iter = sessionReaderCandidates_.find(destination.getNumber());
        if (iter == sessionReaderCandidates_.end()) {
            SessionReader sessionReader(destination);
            iter = sessionReaderCandidates_.insert(std::make_pair(destination.getNumber(), sessionReader)).first;
        }
        return iter->second;
    }

    SessionReader& UDPAdapter::getSessionReader(int remoteId) {
        auto iter = sessionReaders_.find(remoteId);
        if (iter == sessionReaders_.end())
            throw std::runtime_error("getSessionReader: SessionReader not found");
        return iter->second;
    }

    void UDPAdapter::acceptSessionReaderCandidate(SessionReader& sessionReader) {
        sessionReaders_.erase(sessionReader.remoteNodeInfo.getNumber());
        sessionReaders_.insert(std::make_pair(sessionReader.remoteNodeInfo.getNumber(), sessionReader));
        sessionReaderCandidates_.erase(sessionReader.remoteNodeInfo.getNumber());
    }

    void UDPAdapter::sendHello(Session& session) {
        writeLog("send hello to ", session.remoteNodeInfo.getNumber());
        byte_vector helloNonce(64);
        sprng_read(&helloNonce[0], 64, NULL);
        auto encryptedPayload = session.remoteNodeInfo.getPublicKey().encrypt(helloNonce);
        Packet helloPacket(getNextPacketId(), ownNodeInfo_.getNumber(), session.remoteNodeInfo.getNumber(), PacketTypes::HELLO, encryptedPayload);
        sendPacket(session.remoteNodeInfo, helloPacket.makeByteArray());
        session.addPacketToRetransmitMap(helloPacket.getPacketId(), helloPacket, helloNonce);
        session.retransmitMapSize = session.retransmitMap.size();
    }

    void UDPAdapter::sendWelcome(SessionReader& sessionReader) {
        writeLog("send welcome to ", sessionReader.remoteNodeInfo.getNumber());
        byte_vector sign = ownPrivateKey_.sign(sessionReader.localNonce, crypto::HashType::SHA512);

        byte_vector payload = bossDumpArray(UArray({
            UBytesFromByteVector(sessionReader.localNonce),
            UBytesFromByteVector(sign),
        }));

        Packet welcomePacket(getNextPacketId(), ownNodeInfo_.getNumber(), sessionReader.remoteNodeInfo.getNumber(), PacketTypes::WELCOME, payload);
        sendPacket(sessionReader.remoteNodeInfo, welcomePacket.makeByteArray());
        sessionReader.removeHandshakePacketsFromRetransmitMap();
        sessionReader.addPacketToRetransmitMap(welcomePacket.getPacketId(), welcomePacket, sessionReader.localNonce);
        sessionReader.retransmitMapSize = sessionReader.retransmitMap.size();
    }

    void UDPAdapter::sendKeyReq(Session& session) {
        writeLog("send key_req to ", session.remoteNodeInfo.getNumber());
        session.localNonce.resize(64);
        sprng_read(&session.localNonce[0], 64, NULL);

        byte_vector packed = bossDumpArray(UArray({
            UBytesFromByteVector(session.localNonce),
            UBytesFromByteVector(session.remoteNonce),
        }));

        byte_vector encrypted = session.remoteNodeInfo.getPublicKey().encrypt(packed);
        byte_vector sign = ownPrivateKey_.sign(encrypted, crypto::HashType::SHA512);

        session.handshakeStep = HandshakeState::HANDSHAKE_STEP_WAIT_FOR_SESSION;
        session.handshake_sessionPart1.resize(0);
        session.handshake_sessionPart2.resize(0);
        Packet packet1(getNextPacketId(), ownNodeInfo_.getNumber(), session.remoteNodeInfo.getNumber(), PacketTypes::KEY_REQ_PART1, encrypted);
        Packet packet2(getNextPacketId(), ownNodeInfo_.getNumber(), session.remoteNodeInfo.getNumber(), PacketTypes::KEY_REQ_PART2, sign);
        sendPacket(session.remoteNodeInfo, packet1.makeByteArray());
        sendPacket(session.remoteNodeInfo, packet2.makeByteArray());
        session.addPacketToRetransmitMap(packet1.getPacketId(), packet1, encrypted);
        session.addPacketToRetransmitMap(packet2.getPacketId(), packet2, sign);
        session.retransmitMapSize = session.retransmitMap.size();
    }

    void UDPAdapter::sendSessionKey(SessionReader& sessionReader) {
        writeLog("send session_key to ", sessionReader.remoteNodeInfo.getNumber());

        byte_vector key = sessionReader.sessionKey.pack();
        byte_vector packed = bossDumpArray(UArray({
            UBytesFromByteVector(key),
            UBytesFromByteVector(sessionReader.remoteNonce),
        }));

        byte_vector encrypted = sessionReader.remoteNodeInfo.getPublicKey().encrypt(packed);
        byte_vector sign = ownPrivateKey_.sign(encrypted, crypto::HashType::SHA512);

        Packet packet1(getNextPacketId(), ownNodeInfo_.getNumber(), sessionReader.remoteNodeInfo.getNumber(), PacketTypes::SESSION_PART1, encrypted);
        Packet packet2(getNextPacketId(), ownNodeInfo_.getNumber(), sessionReader.remoteNodeInfo.getNumber(), PacketTypes::SESSION_PART2, sign);
        sendPacket(sessionReader.remoteNodeInfo, packet1.makeByteArray());
        sendPacket(sessionReader.remoteNodeInfo, packet2.makeByteArray());
        sessionReader.addPacketToRetransmitMap(packet1.getPacketId(), packet1, encrypted);
        sessionReader.addPacketToRetransmitMap(packet2.getPacketId(), packet2, sign);
        sessionReader.retransmitMapSize = sessionReader.retransmitMap.size();
    }

    void UDPAdapter::sendSessionAck(Session& session) {
        writeLog("send session_ack to ", session.remoteNodeInfo.getNumber());
        byte_vector someRandomPayload(32);
        sprng_read(&someRandomPayload[0], 32, NULL);
        Packet packet(getNextPacketId(), ownNodeInfo_.getNumber(), session.remoteNodeInfo.getNumber(), PacketTypes::SESSION_ACK, session.sessionKey.etaEncrypt(someRandomPayload));
        sendPacket(session.remoteNodeInfo, packet.makeByteArray());
    }

    void UDPAdapter::sendAck(SessionReader& sessionReader, int packetId) {
        writeLog("send ack to ", sessionReader.remoteNodeInfo.getNumber());
        BossSerializer::Writer writer;
        writer.writeObject(UInt(packetId));
        UBytes ub = writer.getBytes();
        byte_vector bv = ub.get();
        Packet packet(0, ownNodeInfo_.getNumber(), sessionReader.remoteNodeInfo.getNumber(), PacketTypes::ACK, sessionReader.sessionKey.etaEncrypt(bv));
        sendPacket(sessionReader.remoteNodeInfo, packet.makeByteArray());
    }

    void UDPAdapter::sendNack(int nodeId, int packetId) {
        if (netConfig_.find(nodeId)) {
            const NodeInfo &dest = netConfig_.getInfo(nodeId);
            writeLog("send nack to ", nodeId);
            byte_vector randomSeed(64);
            sprng_read(&randomSeed[0], 64, NULL);
            byte_vector data = bossDumpArray(UArray({UInt(packetId), UBytesFromByteVector(randomSeed)}));
            byte_vector sign = ownPrivateKey_.sign(data, crypto::HashType::SHA512);
            byte_vector payload = bossDumpArray(UArray({UBytesFromByteVector(data), UBytesFromByteVector(sign)}));
            Packet packet(0, ownNodeInfo_.getNumber(), nodeId, PacketTypes::NACK, payload);
            sendPacket(dest, packet.makeByteArray());
        }
    }

    void UDPAdapter::setReceiveCallback(const TReceiveCallback& callback) {
        std::unique_lock lock(socketMutex_);
        receiveCallback_ = callback;
    }

    void UDPAdapter::printInternalState() {
        using std::cout;
        std::unique_lock lock(socketMutex_);
        cout << endl << "printInternalState " << logLabel_ << endl;
        cout << "  nextPacketId_: " << nextPacketId_ << endl;
        for (auto& s : sessionsByRemoteId_) {
            cout << "  session with node=" << s.first << endl;
            cout << "    outputQueue.size():" << s.second.outputQueue.size() << endl;
            cout << "    retransmitMap.size():" << s.second.retransmitMap.size() << endl;
            cout << "    retransmitMapSize:" << s.second.retransmitMapSize << endl;
            cout << "    protectionFromDuple0.size()():" << s.second.buffer0.size() << endl;
            cout << "    protectionFromDuple1.size()():" << s.second.buffer1.size() << endl;
        }
        for (auto& s : sessionReaders_) {
            cout << "  sessionReader with node=" << s.first << endl;
            cout << "    retransmitMap.size():" << s.second.retransmitMap.size() << endl;
            cout << "    retransmitMapSize:" << s.second.retransmitMapSize << endl;
            cout << "    protectionFromDuple0.size()():" << s.second.buffer0.size() << endl;
            cout << "    protectionFromDuple1.size()():" << s.second.buffer1.size() << endl;
        }
        for (auto& s : sessionReaderCandidates_) {
            cout << "  sessionReader with node=" << s.first << endl;
            cout << "    retransmitMap.size():" << s.second.retransmitMap.size() << endl;
            cout << "    retransmitMapSize:" << s.second.retransmitMapSize << endl;
            cout << "    protectionFromDuple0.size()():" << s.second.buffer0.size() << endl;
            cout << "    protectionFromDuple1.size()():" << s.second.buffer1.size() << endl;
        }
    }

};
