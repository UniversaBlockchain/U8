//
// Created by Leonid Novikov on 2/8/19.
//

#ifndef U8_UDPADAPTERPRIVATE_H
#define U8_UDPADAPTERPRIVATE_H

#include <stdint.h>
#include <unordered_set>
#include <unordered_map>
#include <random>
#include <atomic>
#include <queue>
#include <functional>
#include "../tools/tools.h"
#include "NodeInfo.h"
#include "../crypto/SymmetricKey.h"

namespace network {

    /**
     * Packet is atomary object for sending to socket. It has size that fit socket buffer size.
     * Think about packet as about low-level structure. Has header and payload sections.
     */
    enum PacketTypes {
        DATA           = 0,
        ACK            = 1,
        NACK           = 2,
        HELLO          = 3,
        WELCOME        = 4,
        KEY_REQ_PART1  = 5,
        KEY_REQ_PART2  = 6,
        SESSION_PART1  = 7,
        SESSION_PART2  = 8,
        SESSION_ACK    = 9,
    };

    /**
     * \see PacketTypes
     */
    class Packet {

    public:
        Packet(int packetId, int senderNodeId, int receiverNodeId, int type, const byte_vector& payload);
        Packet(const byte_vector& packedData);

        /**
         * Pack header and payload to bytes array.
         */
        byte_vector makeByteArray() const;

        int getSenderNodeId() const {return senderNodeId_;}
        int getReceiverNodeId() const {return receiverNodeId_;}
        int getPacketId() const {return packetId_;}
        int getType() const {return type_;}
        const byte_vector& getPayloadRef() const {return payload_;}

    private:
        int senderNodeId_;
        int receiverNodeId_;
        int packetId_;
        int type_;
        byte_vector payload_;

    };

    /**
     * Implements protection from duplication received packets.
     */
    class DupleProtection {
    public:
        DupleProtection() {}
        DupleProtection(const DupleProtection&) = default;
        DupleProtection(DupleProtection&&) = default;
        bool protectFromDuples(int packetId);
        void clearOldestBuffer();
    private:
        std::unordered_set<int> buffer0;
        std::unordered_set<int> buffer1;
    };

    /**
     * Item for accumulating in Session.outputQueue
     */
    class OutputQueueItem {
    public:
        NodeInfo destination;
        byte_vector payload;
        OutputQueueItem(const NodeInfo& newDestination, const byte_vector& newPayload);
        OutputQueueItem(const OutputQueueItem&) = default;
        OutputQueueItem(OutputQueueItem&&) = default;
    };

    /**
     * Item for accumulating in Retransmitter
     */
    class RetransmitItem {
    public:
        Packet packet;
        int retransmitCounter;
        byte_vector sourcePayload;
        int receiverNodeId;
        int packetId;
        int type;
        long nextRetransmitTimeMillis;
        RetransmitItem(const Packet& newPacket, const byte_vector& newSourcePayload);
        RetransmitItem(const RetransmitItem&) = default;
        RetransmitItem(RetransmitItem&&) = default;
        RetransmitItem& operator=(const RetransmitItem&) = default;
        RetransmitItem& operator=(RetransmitItem &&) = default;
        void updateNextRetransmitTime();
    private:
        std::minstd_rand minstdRand_;
    };

    enum class SessionState {STATE_HANDSHAKE, STATE_EXCHANGING};
    enum class HandshakeState {HANDSHAKE_STEP_INIT, HANDSHAKE_STEP_WAIT_FOR_WELCOME, HANDSHAKE_STEP_WAIT_FOR_SESSION};

    /**
     * Implements packet retransmission algorithm.
     */
    class Retransmitter: public DupleProtection {
    public:
        Retransmitter(const NodeInfo& newRemoteNodeInfo);
        Retransmitter(const Retransmitter&) = default;
        Retransmitter(Retransmitter&&) = default;
        std::unordered_map<int, RetransmitItem> retransmitMap;
        NodeInfo remoteNodeInfo;
        crypto::SymmetricKey sessionKey;
        void removeHandshakePacketsFromRetransmitMap();
        void addPacketToRetransmitMap(int packetId, const Packet& packet, const byte_vector& sourcePayload);
        void pulseRetransmit(std::function<void(const NodeInfo&, const Packet&)> funcSendPacket);

    protected:
        virtual SessionState getState();
    };

    /**
     * For data exchanging, two remote parties should create two valid sessions. Each one initiates handshake from
     * it's local Session, and remote creates SessionReader for responding.
     * Session uses for handshaking and for transmit PacketTypes::DATA.
     * SessionReader uses for handshaking and for receive PacketTypes::DATA
     */
    class Session: public Retransmitter {

    public:
        Session(const NodeInfo& newRemoteNodeInfo);
        Session(const Session& copyFrom) = default;
        Session(Session&& moveFrom) = default;
        /** Reconstruct key from got byte array. Calls when we receive session key from remote party. */
        void reconstructSessionKey(const byte_vector& key);
        SessionState getState() override;
        /** If we send some payload into session, but session state is STATE_HANDSHAKE - it accumulates in outputQueue. */
        void addPayloadToOutputQueue(const NodeInfo& destination, const byte_vector& payload);
        /** When handshake procedure completes, we should send all accumulated messages. */
        void sendAllFromOutputQueue();
        /** Changes session's state to STATE_HANDSHAKE */
        void startHandshake();

    public:
        friend class UDPAdapter;

    private:
        byte_vector localNonce;
        byte_vector remoteNonce;
        std::queue<OutputQueueItem> outputQueue;

        SessionState state;
        HandshakeState handshakeStep;
        long handshakeExpiresAt;
        byte_vector handshake_sessionPart1;
        byte_vector handshake_sessionPart2;
        long lastHandshakeRestartTime;
    };



    /**
     * SessionReader uses for handshaking and for receive PacketTypes::DATA
     * \see Session
     */
    class SessionReader: public Retransmitter {
    public:
        SessionReader(const NodeInfo& newRemoteNodeInfo);
        SessionReader(const SessionReader&) = default;
        SessionReader(SessionReader&&) = default;
        byte_vector localNonce;
        long nextLocalNonceGenerationTime;
        byte_vector remoteNonce;
        byte_vector handshake_keyReqPart1;
        byte_vector handshake_keyReqPart2;
    };

    template<typename ...Args>
    void writeLog(bool enabled, Args && ...args) {
        if (enabled)
            (std::cout << ... << args) << std::endl;
    }

    template<typename ...Args>
    void writeErr(bool enabled, Args && ...args) {
        if (enabled)
            (std::cerr << ... << args) << std::endl;
    }

};

#endif //U8_UDPADAPTERPRIVATE_H
