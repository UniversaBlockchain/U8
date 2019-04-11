//
// Created by Leonid Novikov on 2/6/19.
//

#ifndef U8_NODEINFO_H
#define U8_NODEINFO_H

#include <string>
#include "../crypto/PublicKey.h"

namespace network {

    class SocketAddress {
    public:
        std::string host;
        unsigned int port;
        SocketAddress(std::string newHost, unsigned int newPort);

        SocketAddress() {}
        SocketAddress(const SocketAddress&) = default;
        SocketAddress(SocketAddress&&) = default;
        SocketAddress& operator= (const SocketAddress&) = default;
        SocketAddress& operator= (SocketAddress&&) = default;
    };

    /**
     * The complete data about Universa node. This class should provide enough information to connect to a remote node and
     * create local services and should be used everywhere instead of host-port parameters.
     * <p>
     * The preferred method of identifying the node is its integer id, {getNumber()}.
     */
    class NodeInfo {

    public:

        NodeInfo(const crypto::PublicKey& publicKey, int number, const std::string& nodeName, const std::string& host,
                 const std::string& publicHost, unsigned int datagramPort, unsigned int clientHttpPort, unsigned int serverHttpPort);

        NodeInfo(const NodeInfo&) = default;
        NodeInfo(NodeInfo&&) = default;
        NodeInfo& operator= (const NodeInfo &) = default;
        NodeInfo& operator= (NodeInfo &&) = default;

        const crypto::PublicKey& getPublicKey() const;
        const SocketAddress& getNodeAddress() const;
        const SocketAddress& getClientAddress() const;
        const SocketAddress& getServerAddress() const;

        /** Integer node is the preferred way to identify nodes */
        int getNumber() const;

        /** String node name is a secondary identificator */
        const std::string& getName() const;

        const std::string& getPublicHost() const;

    private:
        crypto::PublicKey publicKey_;
        SocketAddress nodeAddress_;
        SocketAddress clientAddress_;
        SocketAddress serverAddress_;
        int number_;
        std::string nodeName_;
        std::string publicHost_;

    };

};

#endif //U8_NODEINFO_H
