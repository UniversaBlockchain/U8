/*
 * Copyright (c) 2019 Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

#include "NetConfig.h"

namespace network {

    void NetConfig::addNode(const NodeInfo& n) {
        if (byNumber.find(n.getNumber()) != byNumber.end())
            throw std::invalid_argument(std::string("node id=")+std::to_string(n.getNumber())+" is already present in config");
        byNumber.insert(std::make_pair(n.getNumber(), n));
    }

    const NodeInfo& NetConfig::getInfo(int nodeId) const {
        if (byNumber.find(nodeId) == byNumber.end())
            throw std::invalid_argument(std::string("node id=")+std::to_string(nodeId)+" is not found in config");
        return byNumber.at(nodeId);
    }

    bool NetConfig::find(int nodeId) const {
        return byNumber.find(nodeId) != byNumber.end();
    }

    std::vector<NodeInfo*> NetConfig::toList() {
        std::vector<NodeInfo*> res;
        for (auto& it: byNumber)
            res.push_back(&it.second);
        return res;
    }

    unsigned int NetConfig::getSize() const {
        return (unsigned int) byNumber.size();
    }
};
