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
#include "../types/UArray.h"
#include "../serialization/BossSerializer.h"

namespace network {

    UDPAdapter::UDPAdapter(const crypto::PrivateKey& ownPrivateKey, int ownNodeNumber, const NetConfig& netConfig,
                           const TReceiveCallback& receiveCallback)
       :netConfig_(netConfig)
       ,ownNodeInfo_(netConfig.getInfo(ownNodeNumber))
       ,ownPrivateKey_(ownPrivateKey) {
        logLabel_ = std::string("UDP") + std::to_string(ownNodeNumber) + std::string(": ");

        unsigned int seed = std::chrono::duration_cast<std::chrono::nanoseconds>(std::chrono::high_resolution_clock::now().time_since_epoch()).count();
        std::minstd_rand minstdRand(static_cast<int>(seed));
        nextPacketId_ = minstdRand();

        receiveCallback_ = receiveCallback;
        socket_.open(ownNodeInfo_.getNodeAddress().host.c_str(), ownNodeInfo_.getNodeAddress().port);
        socket_.recv([&](ssize_t result, const asyncio::byte_vector& data, const char* IP, unsigned int port) {
            if (result > 0)
                onReceive(data);
        });

        long dupleProtectionPeriod = 2 * RETRANSMIT_TIME_GROW_FACTOR * RETRANSMIT_TIME * RETRANSMIT_MAX_ATTEMPTS;
        long protectionFromDuple_prevTime = getCurrentTimeMillis();
        timer_.scheduleAtFixedRate([this, protectionFromDuple_prevTime, dupleProtectionPeriod]()mutable{
            std::unique_lock lock(sendMutex);
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
        if (session.getState() == SessionState::STATE_HANDSHAKE) {
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
        std::unique_lock lock(sendMutex);
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
            default:
                writeErr(true, logLabel_, "received unknown packet type: ", packet.getType());
                break;
        }
        //receiveCallback_(data);
    }

    void UDPAdapter::onReceiveHello(const Packet& packet) {
        writeLog(isLogEnabled_, logLabel_, "received hello from ", packet.getSenderNodeId());
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
        writeLog(isLogEnabled_, logLabel_, "received welcome from ", packet.getSenderNodeId());
        const NodeInfo& nodeInfo = netConfig_.getInfo(packet.getSenderNodeId());
        Session& session = getOrCreateSession(nodeInfo);
        if (session.protectFromDuples(packet.getPacketId())) {
            if ((session.state == SessionState::STATE_HANDSHAKE) && (session.handshakeStep == HandshakeState::HANDSHAKE_STEP_WAIT_FOR_WELCOME)) {
                try {
                    const byte_vector &packetPayloadRef = packet.getPayloadRef();
                    UBytes uBytes(&packetPayloadRef[0], packetPayloadRef.size());
                    BossSerializer::Reader reader(uBytes);
                    UObject uObj = reader.readObject();
                    auto uArr = UArray::asInstance(uObj);
                    byte_vector remoteNonce = UBytes::asInstance(uArr.at(0)).get();
                    byte_vector packetSign = UBytes::asInstance(uArr.at(1)).get();
                    if (session.remoteNodeInfo.getPublicKey().verify(packetSign, remoteNonce,
                                                                     crypto::HashType::SHA512)) {
                        session.removeHandshakePacketsFromRetransmitMap();
                        session.remoteNonce = remoteNonce;
                        sendKeyReq(session);
                    }
                } catch (const std::exception& e) {
                    writeErr(true, logLabel_, "onReceiveWelcome exception: ", e.what());
                }
            }
        }
    }

    void UDPAdapter::onReceiveKeyReqPart1(const Packet& packet) {
        writeLog(isLogEnabled_, logLabel_, "received key_req_part1 from ", packet.getSenderNodeId());
        SessionReader& sessionReader = getOrCreateSessionReaderCandidate(packet.getSenderNodeId());
        if (sessionReader.protectFromDuples(packet.getPacketId())) {
            sessionReader.removeHandshakePacketsFromRetransmitMap();
            sessionReader.handshake_keyReqPart1 = packet.getPayloadRef();
            onReceiveKeyReq(sessionReader);
        }
    }

    void UDPAdapter::onReceiveKeyReqPart2(const Packet& packet) {
        writeLog(isLogEnabled_, logLabel_, "received key_req_part2 from ", packet.getSenderNodeId());
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
                writeLog(isLogEnabled_, logLabel_, "received both parts of key_req from ",
                         sessionReader.remoteNodeInfo.getNumber());
                byte_vector packed = ownPrivateKey_.decrypt(sessionReader.handshake_keyReqPart1);

                UBytes uBytes(&packed[0], packed.size());
                BossSerializer::Reader reader(uBytes);
                UObject uObj = reader.readObject();
                auto uArr = UArray::asInstance(uObj);
                byte_vector packet_senderNonce = UBytes::asInstance(uArr.at(0)).get();
                byte_vector packet_remoteNonce = UBytes::asInstance(uArr.at(1)).get();

                if (packet_remoteNonce == sessionReader.localNonce) {
                    if (sessionReader.remoteNodeInfo.getPublicKey().verify(sessionReader.handshake_keyReqPart2, sessionReader.handshake_keyReqPart1, crypto::HashType::SHA512)) {
                        writeLog(isLogEnabled_, logLabel_, "key_req successfully verified");
                        sessionReader.remoteNonce = packet_senderNonce;
                        sessionReader.sessionKey = crypto::SymmetricKey();
                        auto remoteNodeId = sessionReader.remoteNodeInfo.getNumber();
                        acceptSessionReaderCandidate(sessionReader);
                        sendSessionKey(getSessionReader(remoteNodeId));
                    } else {
                        writeErr(true, logLabel_, "onReceiveKeyReq: verify fails");
                    }
                } else {
                    writeLog(isLogEnabled_, logLabel_, "onReceiveKeyReq: remoteNonce mismatch (it's maybe datagram duplicate)");
                }

            } catch (const std::exception& e) {
                writeErr(true, logLabel_, "onReceiveKeyReq exception: ", e.what());
            }
        }
    }

    void UDPAdapter::onReceiveSessionPart1(const Packet& packet) {
        writeLog(isLogEnabled_, logLabel_, "received session_part1 from ", packet.getSenderNodeId());
        auto nodeInfo = netConfig_.getInfo(packet.getSenderNodeId());
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
        writeLog(isLogEnabled_, logLabel_, "received session_part2 from ", packet.getSenderNodeId());
        auto nodeInfo = netConfig_.getInfo(packet.getSenderNodeId());
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
            writeLog(isLogEnabled_, logLabel_, "received both parts of session from ",
                     session.remoteNodeInfo.getNumber());
            if (session.remoteNodeInfo.getPublicKey().verify(session.handshake_sessionPart2, session.handshake_sessionPart1, crypto::HashType::SHA512)) {
                try {
                    byte_vector decryptedData = ownPrivateKey_.decrypt(session.handshake_sessionPart1);

                    UBytes uBytes(&decryptedData[0], decryptedData.size());
                    BossSerializer::Reader reader(uBytes);
                    UObject uObj = reader.readObject();
                    auto uArr = UArray::asInstance(uObj);
                    byte_vector sessionKey = UBytes::asInstance(uArr.at(0)).get();
                    byte_vector nonce = UBytes::asInstance(uArr.at(1)).get();

                    if (nonce == session.localNonce) {
                        writeLog(isLogEnabled_, logLabel_, "session successfully verified");
                        sendSessionAck(session);
                        session.reconstructSessionKey(sessionKey);
                        session.state = SessionState::STATE_EXCHANGING;
                        //session.sendAllFromOutputQueue();
                        session.pulseRetransmit([this](const NodeInfo &dest, const Packet &packet) {
                            sendPacket(dest, packet.makeByteArray());
                        });
                    } else {
                        writeLog(isLogEnabled_, logLabel_, "onReceiveSession: localNonce mismatch");
                    }

                } catch (const std::exception& e) {
                    writeErr(true, logLabel_, "onReceiveSession exception: ", e.what());
                }
            } else {
                writeErr(true, logLabel_, "onReceiveSession: verify fails");
            }
        }
    }

    void UDPAdapter::onReceiveSessionAck(const Packet& packet) {
        writeLog(isLogEnabled_, logLabel_, "received session_ack from ", packet.getSenderNodeId());
        SessionReader& sessionReader = getSessionReader(packet.getSenderNodeId());
        sessionReader.removeHandshakePacketsFromRetransmitMap();
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
        sendPacket(session.remoteNodeInfo, packet.makeByteArray());
        session.addPacketToRetransmitMap(packet.getPacketId(), packet, payload);
    }

    void UDPAdapter::sendPacket(const NodeInfo& dest, const byte_vector& data) {
        //std::unique_lock lock(sendMutex);
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
        for (auto& it : sessionsByRemoteId)
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
        for (auto& s : sessionsByRemoteId)
            s.second.pulseRetransmit([this](const NodeInfo& dest, const Packet& packet){
                sendPacket(dest, packet.makeByteArray());
            });
        for (auto& s : sessionReaders)
            s.second.pulseRetransmit([this](const NodeInfo& dest, const Packet& packet){
                sendPacket(dest, packet.makeByteArray());
            });
        for (auto& s : sessionReaderCandidates)
            s.second.pulseRetransmit([this](const NodeInfo& dest, const Packet& packet){
                sendPacket(dest, packet.makeByteArray());
            });
        for (auto& s : sessionsByRemoteId)
            s.second.sendAllFromOutputQueue([this](const NodeInfo& dest, const byte_vector& data){
                send(dest.getNumber(), data);
            });
    }

    void UDPAdapter::clearProtectionFromDupleBuffers() {
        for (auto& s : sessionReaders)
            s.second.clearOldestBuffer();
        for (auto& s : sessionReaderCandidates)
            s.second.clearOldestBuffer();
        for (auto& s : sessionsByRemoteId)
            s.second.clearOldestBuffer();
    }

    Session& UDPAdapter::getOrCreateSession(const NodeInfo& destination) {
        auto iter = sessionsByRemoteId.find(destination.getNumber());
        if (iter == sessionsByRemoteId.end()) {
            Session session(destination);
            iter = sessionsByRemoteId.insert(std::make_pair(destination.getNumber(), session)).first;
        }
        return iter->second;
    }

    SessionReader& UDPAdapter::getOrCreateSessionReaderCandidate(int remoteId) {
        const NodeInfo& destination = netConfig_.getInfo(remoteId);
        auto iter = sessionReaderCandidates.find(destination.getNumber());
        if (iter == sessionReaderCandidates.end()) {
            SessionReader sessionReader(destination);
            iter = sessionReaderCandidates.insert(std::make_pair(destination.getNumber(), sessionReader)).first;
        }
        return iter->second;
    }

    SessionReader& UDPAdapter::getSessionReader(int remoteId) {
        auto iter = sessionReaders.find(remoteId);
        if (iter == sessionReaders.end())
            throw std::runtime_error("getSessionReader: SessionReader not found");
        return iter->second;
    }

    void UDPAdapter::acceptSessionReaderCandidate(SessionReader& sessionReader) {
        sessionReaders.insert(std::make_pair(sessionReader.remoteNodeInfo.getNumber(), sessionReader));
        sessionReaderCandidates.erase(sessionReader.remoteNodeInfo.getNumber());
    }

    void UDPAdapter::sendHello(Session& session) {
        writeLog(isLogEnabled_, logLabel_, "send hello to ", session.remoteNodeInfo.getNumber());
        byte_vector helloNonce(64);
        sprng_read(&helloNonce[0], 64, NULL);
        auto encryptedPayload = session.remoteNodeInfo.getPublicKey().encrypt(helloNonce);
        Packet helloPacket(getNextPacketId(), ownNodeInfo_.getNumber(), session.remoteNodeInfo.getNumber(), PacketTypes::HELLO, encryptedPayload);
        sendPacket(session.remoteNodeInfo, helloPacket.makeByteArray());
        session.addPacketToRetransmitMap(helloPacket.getPacketId(), helloPacket, helloNonce);
    }

    void UDPAdapter::sendWelcome(SessionReader& sessionReader) {
        writeLog(isLogEnabled_, logLabel_, "send welcome to ", sessionReader.remoteNodeInfo.getNumber());
        byte_vector sign = ownPrivateKey_.sign(sessionReader.localNonce, crypto::HashType::SHA512);

        UArray ua = {
                UBytes(&sessionReader.localNonce[0], sessionReader.localNonce.size()),
                UBytes(&sign[0], sign.size()),
        };
        BossSerializer::Writer writer;
        writer.writeObject(ua);
        auto bb = writer.getBytes();
        byte_vector payload = bb.get();

        Packet welcomePacket(getNextPacketId(), ownNodeInfo_.getNumber(), sessionReader.remoteNodeInfo.getNumber(), PacketTypes::WELCOME, payload);
        sendPacket(sessionReader.remoteNodeInfo, welcomePacket.makeByteArray());
        sessionReader.removeHandshakePacketsFromRetransmitMap();
        sessionReader.addPacketToRetransmitMap(welcomePacket.getPacketId(), welcomePacket, sessionReader.localNonce);
    }

    void UDPAdapter::sendKeyReq(Session& session) {
        writeLog(isLogEnabled_, logLabel_, "send key_req to ", session.remoteNodeInfo.getNumber());
        session.localNonce.resize(64);
        sprng_read(&session.localNonce[0], 64, NULL);

        UArray ua = {
                UBytes(&session.localNonce[0], session.localNonce.size()),
                UBytes(&session.remoteNonce[0], session.remoteNonce.size()),
        };
        BossSerializer::Writer writer;
        writer.writeObject(ua);
        auto bb = writer.getBytes();
        byte_vector packed = bb.get();
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
    }

    void UDPAdapter::sendSessionKey(SessionReader& sessionReader) {
        writeLog(isLogEnabled_, logLabel_, "send session_key to ", sessionReader.remoteNodeInfo.getNumber());

        byte_vector key = sessionReader.sessionKey.pack();
        UArray ua = {
                UBytes(&key[0], key.size()),
                UBytes(&sessionReader.remoteNonce[0], sessionReader.remoteNonce.size()),
        };
        BossSerializer::Writer writer;
        writer.writeObject(ua);
        auto bb = writer.getBytes();
        byte_vector packed = bb.get();
        byte_vector encrypted = sessionReader.remoteNodeInfo.getPublicKey().encrypt(packed);
        byte_vector sign = ownPrivateKey_.sign(encrypted, crypto::HashType::SHA512);

        Packet packet1(getNextPacketId(), ownNodeInfo_.getNumber(), sessionReader.remoteNodeInfo.getNumber(), PacketTypes::SESSION_PART1, encrypted);
        Packet packet2(getNextPacketId(), ownNodeInfo_.getNumber(), sessionReader.remoteNodeInfo.getNumber(), PacketTypes::SESSION_PART2, sign);
        sendPacket(sessionReader.remoteNodeInfo, packet1.makeByteArray());
        sendPacket(sessionReader.remoteNodeInfo, packet2.makeByteArray());
        sessionReader.addPacketToRetransmitMap(packet1.getPacketId(), packet1, encrypted);
        sessionReader.addPacketToRetransmitMap(packet2.getPacketId(), packet2, sign);
    }

    void UDPAdapter::sendSessionAck(Session& session) {
        writeLog(isLogEnabled_, logLabel_, "send session_ack to ", session.remoteNodeInfo.getNumber());
        byte_vector someRandomPayload(32);
        sprng_read(&someRandomPayload[0], 32, NULL);
        Packet packet(getNextPacketId(), ownNodeInfo_.getNumber(), session.remoteNodeInfo.getNumber(), PacketTypes::SESSION_ACK, session.sessionKey.etaEncrypt(someRandomPayload));
        sendPacket(session.remoteNodeInfo, packet.makeByteArray());
    }

};
