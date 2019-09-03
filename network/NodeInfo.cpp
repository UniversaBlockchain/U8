/*
 * Copyright (c) 2019-present Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

#include "NodeInfo.h"

namespace network {

    SocketAddress::SocketAddress(std::string newHost, unsigned int newPort)
        :host(newHost)
        ,port(newPort) {
    }

    NodeInfo::NodeInfo(const crypto::PublicKey& publicKey, int number, const std::string& nodeName, const std::string& host, const std::string& hostV6,
                       const std::string& publicHost, unsigned int datagramPort, unsigned int clientHttpPort, unsigned int publicHttpPort)
        :publicKey_(publicKey)
        ,number_(number)
        ,nodeName_(nodeName)
        ,publicHost_(publicHost)
        ,host_(host)
        ,hostV6_(hostV6)
        ,nodeAddress_(host, datagramPort)
        ,clientAddress_(publicHost, clientHttpPort)
        ,publicPort_(publicHttpPort) {
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

    int NodeInfo::getNumber() const {
        return number_;
    }

    const std::string& NodeInfo::getName() const {
        return nodeName_;
    }

    const std::string& NodeInfo::getPublicHost() const {
        return publicHost_;
    }

    const std::string& NodeInfo::getHost() const {
        return host_;
    }

    const std::string& NodeInfo::getHostV6() const {
        return hostV6_;
    }

    unsigned int NodeInfo::getPublicPort() const {
        return publicPort_;
    }
};