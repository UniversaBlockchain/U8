//
// Created by Leonid Novikov on 2/5/19.
//

#ifndef U8_UDPADAPTER_H
#define U8_UDPADAPTER_H

#include <functional>
#include <mutex>
#include "../tools/tools.h"
#include "../crypto/PrivateKey.h"
#include "../crypto/SymmetricKey.h"
#include "../AsyncIO/AsyncIO.h"
#include "NodeInfo.h"
#include "NetConfig.h"
#include "../tools/TimerThread.h"
#include "UDPAdapterPrivate.h"
#include "../crypto/SymmetricKey.h"
#include "../AsyncIO/IOUDP.h"

namespace network {

    class UDPAdapter {

    public:
        typedef std::function<void(const byte_vector& packet)> TReceiveCallback;

    public:

        /**
         * Create an instance that listens for the incoming datagrams using the specified configurations. The adapter should
         * start serving incoming datagrams immediately upon creation.
         * @param ownPrivateKey for signing handshake requests
         * @param ownNodeNumber node number this UDPAdapter work with
         * @param netConfig where all nodes data is stored
         * @param receiveCallback for receive incoming packets
         */
        UDPAdapter(const crypto::PrivateKey& ownPrivateKey, int ownNodeNumber, const NetConfig& netConfig,
                   const TReceiveCallback& receiveCallback);
        virtual ~UDPAdapter();

        /**
         * Send payload to other node. Destination NodeInfo will be got from net config by node number.
         */
        void send(int destNodeNumber, const byte_vector& payload);

        /**
         * Switches logger on or off for this instance of UDPAdapter.
         */
        void enableLog(bool enabled) {isLogEnabled_ = enabled;}

        /**
         * Change current callback for incoming packets. Useful for debug.
         */
        void setReceiveCallback(const TReceiveCallback& callback);

    private:
        /**
         * Main listener for incoming udp packets.
         */
        void onReceive(const byte_vector& data);

        /**
         * We have received PacketTypes::HELLO packet. Should create localNonce and send it in reply.
         */
        void onReceiveHello(const Packet& packet);

        /**
         * We have received PacketTypes#WELCOME packet. Now we should request session key.
         */
        void onReceiveWelcome(const Packet& packet);

        /**
         * We have received KEY_REQ_PART1 packet. Waiting for part2 or continue if it has got already.
         */
        void onReceiveKeyReqPart1(const Packet& packet);

        /**
         * We have received KEY_REQ_PART2 packet. Waiting for part1 or continue if it has got already.
         */
        void onReceiveKeyReqPart2(const Packet& packet);

        /**
         * Here we checks that both parts of KEY_REQ are received.
         * Now we should create sessionKey and send it to handshake's initiator.
         * sessionReader is ready for receiving packets from remote session now,
         * so remove it from candidates list by call acceptSessionReaderCandidate(SessionReader)
         */
        void onReceiveKeyReq(SessionReader& sessionReader);

        /**
         * We have received SESSION_PART1 packet. Waiting for part2 or continue if it has got already.
         */
        void onReceiveSessionPart1(const Packet& packet);

        /**
         * We have received SESSION_PART2 packet. Waiting for part1 or continue if it has got already.
         */
        void onReceiveSessionPart2(const Packet& packet);

        /**
         * Here we checks that both parts of SESSION are received.
         * Handshake has completed now, so change session's state to STATE_EXCHANGING.
         * Also, reply with SESSION_ACK
         */
        void onReceiveSession(Session& session);

        /**
         * We have received SESSION_ACK packet. Need to stop retransmitting of any handshake packets.
         */
        void onReceiveSessionAck(const Packet& packet);

        /**
         * We have received DATA packet. Need to check crc32, decrypt payload with sessionKey,
         * call our main callback, and reply with ACK or NACK according to success or fail.
         */
        void onReceiveData(const Packet& packet);

        /**
         * We have received ACK packet. Need to stop retransmitting of ack-ed packet.
         */
        void onReceiveAck(const Packet& packet);

        /**
         * We have received NACK packet. Means that session is broken, e.g. remote node was
         * rebooted. Need to restart handshake procedure immediately.
         */
        void onReceiveNack(const Packet& packet);

        /**
         * All packets data Packet.payload of type PacketTypes::DATA
         * must be encrypted with sessionKey (SymmetricKey).
         * This method implements encryption procedure for it.
         */
        static byte_vector preparePayloadForSession(const crypto::SymmetricKey& sessionKey, const byte_vector& payload);

        /**
         * Creates Packet of type PacketTypes and sends it to network, initiates retransmission.
         * It is normal data sending procedure when Session with remote node is already established.
         */
        void sendPayload(Session& session, const byte_vector& payload);

        /**
         * Sends raw data in udp socket.
         */
        void sendPacket(const NodeInfo& dest, const byte_vector& data);

        /**
         * Id generator for udp datagrams.
         */
        int getNextPacketId();

        /**
         * Calls from timer
         */
        void restartHandshakeIfNeeded();

        /**
         * Checks time of active handshake procedures and restarts them if time is up HANDSHAKE_TIMEOUT_MILLIS
         */
        void restartHandshakeIfNeeded(Session& session, long now);

        /**
         * Calls from timer
         */
        void pulseRetransmit();

        /**
         * Calls from timer
         */
        void clearProtectionFromDupleBuffers();

        /**
         * If session for remote node is already created - returns it, otherwise creates new Session
         */
        Session& getOrCreateSession(const NodeInfo& destination);

        /**
         * If sessionReader for remote node is already created - returns it, otherwise creates new SessionReader
         */
        SessionReader& getOrCreateSessionReaderCandidate(int remoteId);

        /**
         * Returns SessionReader from working readers list.
         */
        SessionReader& getSessionReader(int remoteId);

        /**
         * When handshake completed, sessionReader moves from candidates list to working readers list.
         */
        void acceptSessionReaderCandidate(SessionReader& sessionReader);

        /**
         * This is first step of creation and installation of the session.
         */
        void sendHello(Session& session);

        /**
         * When someone send us PacketTypes::HELLO typed Packet, we should respond with PacketTypes::WELCOME.
         */
        void sendWelcome(SessionReader& sessionReader);

        /**
         * We have sent HELLO, and have got WELCOME - it means we can continue handshake and send
         * request for session's keys. KEY_REQ's payload is more than 512 bytes, so used two parts here.
         */
        void sendKeyReq(Session& session);

        /**
         * Someone who sent HELLO, send us new KEY_REQ - if all is ok we send session keys to.
         * SESSION's payload is more than 512 bytes, so used two parts here.
         * From now we ready to data exchange.
         */
        void sendSessionKey(SessionReader& sessionReader);

        /**
         * ACK packets are used only for respond to DATA packets. Retransmission of handshake's packet types stops on each
         * next handshake step. But last step need to be ACK-ed. For this used SESSION_ACK packet.
         */
        void sendSessionAck(Session& session);

        /**
         * Each adapter will try to send blocks until have got special Packet with type ACK,
         * that means receiver have got block. So when we got packet and all is ok - call this method.
         */
        void sendAck(SessionReader& sessionReader, int packetId);

        /**
         * Each adapter will try to send blocks until have got special Packet with type ACK,
         * that means receiver have got block. So when we got block, but something went wrong - call this method.
         */
        void sendNack(SessionReader& sessionReader, int packetId);

    public:
        /**
         * Maximum packet size in bytes. Adapter should try to send several blocks together as long as the overall encoded
         * packet size is no more than MAX_PACKET_SIZE with all extra data attached.
         */
        const static size_t MAX_PACKET_SIZE = 512;

        /**
         * Time between attempts to retransmit a DATA block, in milliseconds
         */
        const static size_t RETRANSMIT_TIME = 250;

        /**
         * Each next retransmit delayed little bit more than previous. This factor uses in calculation of delay.
         */
        const static size_t RETRANSMIT_TIME_GROW_FACTOR = 4;

        /**
         * Max number of attempts to retransmit a block.
         */
        const static size_t RETRANSMIT_MAX_ATTEMPTS = 20;

        /**
         * Maximum number of data blocks in the retransmit queue after which new
         * sending blocks are delayed in output queue.
         */
        const static size_t MAX_RETRANSMIT_QUEUE_SIZE = 5000;

        /**
         * Maximum number of data blocks in the sending queue after which oldest
         * items are discarded and overflow flag is set.
         */
        const static size_t MAX_QUEUE_SIZE = 5000000;//50000;

        /**
         * Time limit for handshaking procedure. If handshake is not complete for this time, it will be restarted.
         */
        const static size_t HANDSHAKE_TIMEOUT_MILLIS = 10000;

    private:
        bool isLogEnabled_ = false;
        std::string logLabel_;
        NetConfig netConfig_;
        asyncio::IOUDP socket_;
        crypto::PrivateKey ownPrivateKey_;
        NodeInfo ownNodeInfo_;
        TReceiveCallback receiveCallback_;
        int nextPacketId_;
        TimerThread timer_;
        std::unordered_map<int, Session> sessionsByRemoteId;
        std::unordered_map<int, SessionReader> sessionReaders;
        std::unordered_map<int, SessionReader> sessionReaderCandidates;
        std::recursive_mutex socketMutex;
        friend class Retransmitter;
    };

};

#endif //U8_UDPADAPTER_H
