//
// Created by Leonid Novikov on 2/6/19.
//

#ifndef U8_NETCONFIG_H
#define U8_NETCONFIG_H

#include <unordered_map>
#include "NodeInfo.h"

namespace network {

    class NetConfig {
    public:
        void addNode(const NodeInfo& n);
        const NodeInfo& getInfo(int nodeId) const;

    private:
        std::unordered_map<int, NodeInfo> byNumber;
    };

};

#endif //U8_NETCONFIG_H
