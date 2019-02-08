//
// Created by Leonid Novikov on 2/8/19.
//

#ifndef U8_UDPADAPTERPRIVATE_H
#define U8_UDPADAPTERPRIVATE_H

#include <stdint.h>
#include <unordered_set>
#include <unordered_map>
#include <random>
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
        byte_vector makeByteArray();

        int getReceiverNodeId() {return receiverNodeId_;}
        int getPacketId() {return packetId_;}
        int getType() {return type_;}

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
        bool protectFromDuples(int packetId);
        void clearOldestBuffer();
    private:
        std::unordered_set<int> buffer0;
        std::unordered_set<int> buffer1;
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
        void updateNextRetransmitTime();
    private:
        std::minstd_rand minstdRand_;
    };

    /**
     * Implements packet retransmission algorithm.
     */
    class Retransmitter: private DupleProtection {
    public:
        std::unordered_map<int, RetransmitItem> retransmitMap;
        NodeInfo remoteNodeInfo;
        crypto::SymmetricKey sessionKey;
    };

    /**
     * For data exchanging, two remote parties should create two valid sessions. Each one initiates handshake from
     * it's local Session, and remote creates SessionReader for responding.
     * Session uses for handshaking and for transmit PacketTypes::DATA.
     * SessionReader uses for handshaking and for receive PacketTypes::DATA
     */
    class Session {
    };



    /**
     * SessionReader uses for handshaking and for receive PacketTypes::DATA
     * \see Session
     */
    class SessionReader {
    };


};

#endif //U8_UDPADAPTERPRIVATE_H
