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

        void enableLog(bool enabled) {isLogEnabled = enabled;}

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
         * All packets data Packet.payload of type PacketTypes::DATA
         * must be encrypted with sessionKey (SymmetricKey).
         * This method implements encryption procedure for it.
         */
        byte_vector preparePayloadForSession(const crypto::SymmetricKey& sessionKey, const byte_vector& payload);

        /**
         * Creates Packet of type PacketTypes and sends it to network, initiates retransmission.
         * It is normal data sending procedure when Session with remote node is already established.
         */
        void sendPayload(Session& session, const byte_vector& payload);

        void sendPacket(const NodeInfo& dest, const byte_vector& data); //<------------------- dbg

        int getNextPacketId();

        /**
         * Calls from timer
         */
        void restartHandshakeIfNeeded();

        /**
         * Checks time of active handshake procedures and restarts them if time is up HANDSHAKE_TIMEOUT_MILLIS
         */
        void restartHandshakeIfNeeded(Session& session, long now);

        void pulseRetransmit();

        void clearProtectionFromDupleBuffers();

        /**
         * If session for remote node is already created - returns it, otherwise creates new Session
         */
        Session& getOrCreateSession(const NodeInfo& destination);

        /**
         * This is first step of creation and installation of the session.
         */
        void sendHello(Session& session);

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
        const static size_t MAX_QUEUE_SIZE = 50000;

        /**
         * Time limit for handshaking procedure. If handshake is not complete for this time, it will be restarted.
         */
        const static size_t HANDSHAKE_TIMEOUT_MILLIS = 10000;

    private:
        bool isLogEnabled = false;
        crypto::SymmetricKey sessionKey_;
        NetConfig netConfig_;
        asyncio::IOHandle socket_;
        NodeInfo ownNodeInfo_;
        TReceiveCallback receiveCallback_;
        int nextPacketId_;
        TimerThread timer_;
        std::unordered_map<int, Session> sessionsByRemoteId;
        std::recursive_mutex sendMutex;
    };

};

#endif //U8_UDPADAPTER_H
