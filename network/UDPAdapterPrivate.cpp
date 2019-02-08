//
// Created by Leonid Novikov on 2/8/19.
//

#include "UDPAdapterPrivate.h"
#include "UDPAdapter.h"
#include "../serialization/BossSerializer.h"
#include "../types/UArray.h"

namespace network {

    Packet::Packet(int packetId, int senderNodeId, int receiverNodeId, int type, const byte_vector& payload) {
        packetId_ = packetId;
        senderNodeId_ = senderNodeId;
        receiverNodeId_ = receiverNodeId;
        type_ = type;
        payload_ = payload;
    }

    Packet::Packet(const byte_vector& packedData) {
        UBytes uBytes(&packedData[0], packedData.size());
        BossSerializer::Reader reader(uBytes);
        UObject uObj = reader.readObject();
        auto uArr = UArray::asInstance(uObj);
        packetId_ = int(UInt::asInstance(uArr.at(0)).get());
        senderNodeId_ = int(UInt::asInstance(uArr.at(1)).get());
        receiverNodeId_ = int(UInt::asInstance(uArr.at(2)).get());
        type_ = int(UInt::asInstance(uArr.at(3)).get());
        payload_ = UBytes::asInstance(uArr.at(4)).get();

    }

    byte_vector Packet::makeByteArray() {
        UArray ua = {
                UInt(packetId_),
                UInt(senderNodeId_),
                UInt(receiverNodeId_),
                UInt(type_),
                UBytes(&payload_[0], payload_.size())
        };

        BossSerializer::Writer writer;
        writer.writeObject(ua);
        auto bb = writer.getBytes();
        return bb.get();
    }

    bool DupleProtection::protectFromDuples(int packetId) {
        if ((buffer0.find(packetId) != buffer0.end()) && (buffer1.find(packetId) != buffer1.end())) {
            buffer0.insert(packetId);
            return true;
        }
        return false;
    }

    void DupleProtection::clearOldestBuffer() {
        buffer1 = buffer0;
        buffer0.clear();
    }

    RetransmitItem::RetransmitItem(const Packet& newPacket, const byte_vector& newSourcePayload)
        :packet(newPacket)
        ,retransmitCounter(0)
        ,sourcePayload(newSourcePayload)
        ,receiverNodeId(packet.getReceiverNodeId())
        ,packetId(packet.getPacketId())
        ,type(packet.getType())
        ,minstdRand_(std::chrono::duration_cast<std::chrono::nanoseconds>(std::chrono::high_resolution_clock::now().time_since_epoch()).count()) {
        updateNextRetransmitTime();
        //TODO: move minstdRand_ to Session
    }

    void RetransmitItem::updateNextRetransmitTime() {
        long maxRetransmitDelay = UDPAdapter::RETRANSMIT_TIME_GROW_FACTOR*retransmitCounter + UDPAdapter::RETRANSMIT_MAX_ATTEMPTS;
        maxRetransmitDelay /= UDPAdapter::RETRANSMIT_MAX_ATTEMPTS;
        maxRetransmitDelay *= UDPAdapter::RETRANSMIT_TIME;
        maxRetransmitDelay += UDPAdapter::RETRANSMIT_TIME/2;
        nextRetransmitTimeMillis = getCurrentTimeMillis() + minstdRand_() % maxRetransmitDelay;
    }

};
