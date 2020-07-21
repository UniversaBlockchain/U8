/*
 * Copyright (c) 2019-present Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

import {HashId} from 'crypto'

const ItemResult = require('itemresult').ItemResult;
const ItemState = require('itemstate').ItemState;
const BossStreams = require('boss_streams.js');
const t = require("tools");
const FollowerCallbackState = require("services/followerCallbackState").FollowerCallbackState;

const CODE_ITEM_NOTIFICATION = 0;
const CODE_PARCEL_NOTIFICATION = 2;
const CODE_RESYNC_NOTIFICATION = 3;
const CODE_CALLBACK_NOTIFICATION = 4;

/**
 * Notifications are binary-effective packable units to transfer between nodes with v2 UDP protocols.
 * Each notification should inherit from {@link Notification} and register self with uniqie integer code in static
 * constructor using {@link #registerClass(int, Class)}. It also must provide provate nonparametric constructor and
 * implement abstract methods {@link #writeTo(Boss.Writer)}, {@link #readFrom(Boss.Reader)}.
 * Notifications could be packed together in a compact form. Use {@link #pack(Collection)} and {@link #unpack(NodeInfo,
 * byte[])}.
 */
class Notification {

    static classes = new Map();

    constructor(from) {
        this.from = from;
        this.typeCode = null;
    }

    /**
     * Register class with a type code (same as its instance must return with typeCode to use with UDP
     * notifications.
     *
     * @param {number} code - Unique type code (per class).
     * @param {class} klass - Inherited Notification class.
     */
    static registerClass(code, klass) {
        Notification.classes.set(code, klass);
    }

    /**
    * Write self to boss writer.
    */
    writeTo() {
        throw new Error("not implemented");
    }

    /**
     * Read self from boss reader.
     */
    readFrom() {
        throw new Error("not implemented");
    }

    toString() {
        throw new Error("not implemented");
    }

    static pack(notifications) {
        let writer = new BossStreams.Writer();
        try {
            notifications.forEach(n => Notification.write(writer, n));
            return writer.get();
        } catch (err) {
            throw new Error("failed to pack notification: " + err.message);
        }
    }

    static write(writer, n) {
        writer.write(n.typeCode);
        n.writeTo(writer);
    }

    static unpack(from, packed) {
        let notifications = [];
        let r = new BossStreams.Reader(packed);
        try {
            while (true) {
                // boss reader throws EOFException
                let n = Notification.read(from, r);
                if (n == null)
                    break;

                notifications.push(n);
            }
        } catch (err) {
            throw new Error("Failed to decoded notification: " + err.message);
        }

        return notifications;
    }

    static read(from, r) {
        let code = r.read();
        let nclass = Notification.classes.get(code);
        if (nclass != null) {
            let n =  new nclass();
            n.readFrom(r);
            n.from = from;
            return n;
        }
        else {
            console.log("*** unknown notification class code: " + code);
            return null;
        }
    }

    stringId() {
        if (this.stringId_ == null)
            this.stringId_ = this.toString();

        return this.stringId_;
    }
}

/**
 * The status notification for consensus creation procedure, carries information about some node item status and update
 * request.
 */
class ItemNotification extends Notification {
    /**
     * If true, sending node asks receiving node to sent its status of this item back to sender. This overrides default
     * logic of sending only one broadcast about item status.
     */
    constructor(from, itemId, itemResult, requestResult) {
        super(from);
        this.itemId = itemId;
        this.itemResult = itemResult;
        this.requestResult = requestResult;
        this.typeCode = CODE_ITEM_NOTIFICATION;
    }

    writeTo(bw) {
        bw.write(this.itemId.digest);
        this.itemResult.writeTo(bw);
        bw.write(this.requestResult);
    }

    readFrom(br) {
        this.itemId = HashId.withDigest(br.read());
        this.itemResult = ItemResult.fromReader(br);
        this.requestResult = br.read();
    }

    equals(o) {
        if(this === o)
            return true;

        if(Object.getPrototypeOf(this) !== Object.getPrototypeOf(o))
            return false;

        if (this.requestResult !== o.requestResult)
            return false;

        if (!t.valuesEqual(this.from, o.from))
            return false;

        if (!t.valuesEqual(this.itemId, o.itemId))
            return false;

        return t.valuesEqual(this.itemResult, o.itemResult);
    }

    toString() {
        return "[ItemNotification from node: " + this.from.number +
            " for item: " + this.itemId.toString() +
            ", item result: " + this.itemResult.toString() +
            ", is answer requested: " + this.requestResult + "]";
    }
}

class ResyncNotification extends ItemNotification {

    constructor(from, itemId, requestResult, itemState = ItemState.UNDEFINED, hasEnvironment = false) {
        let expires = new Date();
        expires.setMinutes(expires.getMinutes() + 5);
        super(from, itemId, ItemResult.from(itemState, false, new Date(), expires), requestResult);

        this.itemState = itemState;
        this.hasEnvironment = hasEnvironment;
        this.typeCode = CODE_RESYNC_NOTIFICATION;
    }

    writeTo(bw) {
        super.writeTo(bw);
        if (!this.requestResult) {
            bw.write(this.itemState.ordinal);
            bw.write(this.hasEnvironment);
        }
    }

    readFrom(br) {
        super.readFrom(br);
        if (!this.requestResult) {
            this.itemState = ItemState.byOrdinal.get(br.read());
            this.hasEnvironment = br.read();
        }
    }

    toString() {
        return "[ResyncNotification from node: " + this.from.number
            + " for item: " + this.itemId.toString() +
            ", is answer requested: " + this.requestResult + "]";
    }
}

const ParcelNotificationType = {
    PAYMENT : {val: "PAYMENT", isU : true, ordinal: 0},
    PAYLOAD : {val: "PAYLOAD", isU : false, ordinal: 1}
};

ParcelNotificationType.byOrdinal = new Map();
ParcelNotificationType.byOrdinal.set(ParcelNotificationType.PAYMENT.ordinal, ParcelNotificationType.PAYMENT);
ParcelNotificationType.byOrdinal.set(ParcelNotificationType.PAYLOAD.ordinal, ParcelNotificationType.PAYLOAD);

class ParcelNotification extends ItemNotification {

    constructor(from, itemId, parcelId, itemResult, requestResult, type) {
        super(from, itemId, itemResult, requestResult);
        this.parcelId = parcelId;
        this.type = type;
        this.typeCode = CODE_PARCEL_NOTIFICATION;
    }

    writeTo(bw) {
        super.writeTo(bw);
        bw.write(this.type.ordinal);
        if (this.parcelId != null)
            bw.write(this.parcelId.digest);
    }

    readFrom(br) {
        super.readFrom(br);
        this.type = ParcelNotificationType.byOrdinal.get(br.read());
        this.parcelId = null;
        try {
            let parcelBytes = br.read();
            if (parcelBytes != null)
                this.parcelId = HashId.withDigest(parcelBytes);
        } catch (err) {
            this.parcelId = null;
        }
    }

    toString() {
        return "[ParcelNotification from node: " + this.from.number
            + " for parcel: " + this.parcelId.toString()
            + " and item: " + this.itemId.toString()
            + ", type is: " + this.type.val
            + ", is answer requested: " + this.requestResult + "]";
    }
}

/**
 * Callback notification type
 *
 * COMPLETED - to notify other Universa nodes about the completion of the callback.
 * NOT_RESPONDING - to notify other Universa nodes that follower callback server received a callback but did not respond.
 * GET_STATE - to query the state of callback.
 * RETURN_STATE - to return the state of callback.
 */
const CallbackNotificationType = {
    COMPLETED : {val: "COMPLETED", ordinal: 0},
    NOT_RESPONDING : {val: "NOT_RESPONDING", ordinal: 1},
    GET_STATE : {val: "GET_STATE", ordinal: 2},
    RETURN_STATE : {val: "RETURN_STATE", ordinal: 3}
};

CallbackNotificationType.byOrdinal = new Map();
CallbackNotificationType.byOrdinal.set(CallbackNotificationType.COMPLETED.ordinal, CallbackNotificationType.COMPLETED);
CallbackNotificationType.byOrdinal.set(CallbackNotificationType.NOT_RESPONDING.ordinal, CallbackNotificationType.NOT_RESPONDING);
CallbackNotificationType.byOrdinal.set(CallbackNotificationType.GET_STATE.ordinal, CallbackNotificationType.GET_STATE);
CallbackNotificationType.byOrdinal.set(CallbackNotificationType.RETURN_STATE.ordinal, CallbackNotificationType.RETURN_STATE);

/**
 * The success notification for follower callback, carries callback identifier and signature of updated item id
 * request.
 * For success notification: sending node notifies receiving node that follower callback is success.
 * And send signature of updated item id.
 *
 * Also may contain a notification that callback is not responding to the node request.
 * In this case send a notification without signature. If some nodes (rate defined in config) also sended callback
 * and received packed item (without answer) callback is deemed complete.
 */
class CallbackNotification extends Notification {
    /**
     * Create callback notification.
     * For type COMPLETED callback notification should be contain signature.
     * For type RETURN_STATE callback notification should be contain state.
     *
     * @param {network.NodeInfo} from - NodeInfo of node that sent the callback notification.
     * @param {HashId} id - Callback identifier.
     * @param {CallbackNotificationType} type - Type of callback notification.
     * @param {Uint8Array} signature - Receipt signed by follower callback server (required if type == COMPLETED).
     * @param {FollowerCallbackState} state - Callback state (required if type == RETURN_STATE).
     */
    constructor(from, id, type, signature, state = FollowerCallbackState.UNDEFINED) {
        super(from);
        this.id = id;
        this.signature = signature;
        this.type = type;
        this.state = state;
        this.typeCode = CODE_CALLBACK_NOTIFICATION;
    }

    writeTo(bw) {
        bw.write(this.id.digest);
        bw.write(this.signature);
        bw.write(this.type.ordinal);
        bw.write(this.state.ordinal);
    }

    readFrom(br) {
        this.id = HashId.withDigest(br.read());
        this.signature = br.read();
        this.type = CallbackNotificationType.byOrdinal.get(br.read());
        this.state = FollowerCallbackState.byOrdinal.get(br.read());
    }

    equals(o) {
        if (this === o)
            return true;

        if (Object.getPrototypeOf(this) !== Object.getPrototypeOf(o))
            return false;

        if (!t.valuesEqual(this.from, o.from))
            return false;

        if (!t.valuesEqual(this.id, o.id))
            return false;

        if (!t.valuesEqual(this.type, o.type))
            return false;

        if (!t.valuesEqual(this.state, o.state))
            return false;

        return t.valuesEqual(this.signature, o.signature);
    }

    toString() {
        return "[CallbackNotification from " + this.from.number + " with id: " + this.id.toString() + "]";
    }
}

Notification.registerClass(CODE_ITEM_NOTIFICATION, ItemNotification);
Notification.registerClass(CODE_RESYNC_NOTIFICATION, ResyncNotification);
Notification.registerClass(CODE_PARCEL_NOTIFICATION, ParcelNotification);
Notification.registerClass(CODE_CALLBACK_NOTIFICATION, CallbackNotification);

module.exports = {Notification, ItemNotification, ResyncNotification, ParcelNotification, ParcelNotificationType, CallbackNotification};