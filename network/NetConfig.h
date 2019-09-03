/*
 * Copyright (c) 2019-present Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

#ifndef U8_NETCONFIG_H
#define U8_NETCONFIG_H

#include <unordered_map>
#include "NodeInfo.h"

namespace network {

    class NetConfig {
    public:
        void addNode(const NodeInfo& n);
        const NodeInfo& getInfo(int nodeId) const;
        bool find(int nodeId) const;
        std::vector<NodeInfo*> toList();
        unsigned int getSize() const;

    private:
        std::unordered_map<int, NodeInfo> byNumber;
    };

};

#endif //U8_NETCONFIG_H
