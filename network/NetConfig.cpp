//
// Created by Leonid Novikov on 2/6/19.
//

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

};
