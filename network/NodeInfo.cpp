//
// Created by Leonid Novikov on 2/6/19.
//

#include "NodeInfo.h"

namespace network {

    SocketAddress::SocketAddress(std::string newHost, unsigned int newPort)
        :host(newHost)
        ,port(newPort) {
    }

    NodeInfo::NodeInfo(const crypto::PublicKey& publicKey, int number, const std::string& nodeName, const std::string& host,
                       const std::string& publicHost, unsigned int datagramPort, unsigned int clientHttpPort, unsigned int serverHttpPort)
        :publicKey_(publicKey)
        ,number_(number)
        ,nodeName_(nodeName)
        ,publicHost_(publicHost)
        ,nodeAddress_(host, datagramPort)
        ,clientAddress_(publicHost, clientHttpPort)
        ,serverAddress_(host, serverHttpPort) {
        if (number < 0)
            throw std::invalid_argument("node number should be >= 0");
        if (datagramPort <= 0)
            throw std::invalid_argument("datagramPort should be > 0");
        if (clientHttpPort <= 0)
            throw std::invalid_argument("clientHttpPort should be > 0");
    }

    const crypto::PublicKey& NodeInfo::getPublicKey() const {
        return publicKey_;
    }

    const SocketAddress& NodeInfo::getNodeAddress() const {
        return nodeAddress_;

    }

    const SocketAddress& NodeInfo::getClientAddress() const {
        return clientAddress_;
    }

    const SocketAddress& NodeInfo::getServerAddress() const {
        return serverAddress_;
    }

    int NodeInfo::getNumber() const {
        return number_;
    }

    const std::string& NodeInfo::getName() const {
        return nodeName_;
    }

};