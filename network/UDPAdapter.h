//
// Created by Leonid Novikov on 2/5/19.
//

#ifndef U8_UDPADAPTER_H
#define U8_UDPADAPTER_H

#include <functional>
#include "../tools/tools.h"
#include "../crypto/PrivateKey.h"
#include "../crypto/SymmetricKey.h"
#include "../AsyncIO/AsyncIO.h"
#include "NodeInfo.h"
#include "NetConfig.h"
#include "../tools/TimerThread.h"

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

    private:
        void onReceive(const byte_vector& data);
        void sendData(const NodeInfo& dest, const byte_vector& data);
        int getNextPacketId();
        void restartHandshakeIfNeeded();
        void pulseRetransmit();
        void clearProtectionFromDupleBuffers();

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

    private:
        NetConfig netConfig_;
        asyncio::IOHandle socket_;
        TReceiveCallback receiveCallback_;
        int nextPacketId_;
        TimerThread timer_;

    };

};

#endif //U8_UDPADAPTER_H
