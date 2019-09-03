/*
 * Copyright (c) 2019-present Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

/**
 * Subscription to events notification of the contract or contract chain.
 * The subscribers ({@link NContract} instances) subscribe to a contract or a chain of contracts to receive
 * event notifications and for some amount of time. All subscriptions share same copy of the {@link NContract}.
 * When the last susbscription to this revision is destroyed or expired, the copy is dropped.
 * Note that subscriptions are private to {@link NContract} instances and visible only to it. When the NContract is
 * revoked, all its subscriptions must be destroyed.
 *
 * @interface ContractSubscription
 */
class ContractSubscription {

    /**
     * @return {Date} the expiration time of subscription.
     */
    getExpiresAt() {
        throw new Error("not implemented");
    }

    /**
     * @return {HashId} the {@link HashId} of subscribed contract or contracts chain.
     */
    getHashId() {
        throw new Error("not implemented");
    }

    /**
     * @return {HashId} the id of subscribed contract.
     */
    getContractId() {
        throw new Error("not implemented");
    }

    /**
     * @return {HashId} the origin of contracts chain of subscription.
     */
    getOrigin() {
        throw new Error("not implemented");
    }

    /**
     * @return {boolean} true if subscription for contracts chain.
     */
    getIsChainSubscription() {
        throw new Error("not implemented");
    }
}

/**
 * The subscription event base interface.
 */
class Event {
    /**
     * @return {MutableEnvironment}
     */
    getEnvironment() {
        throw new Error("not implemented");
    }
}

/**
 * The subscription event base interface for storage subscription.
 * Real events are either {@link ApprovedEvent} or {@link RevokedEvent} implementations.
 */
class SubscriptionEvent {
    /**
     * @return {ContractSubscription}
     */
    getSubscription() {
        throw new Error("not implemented");
    }
}

class ApprovedEvent extends SubscriptionEvent {
    /**
     * @return {Contract} new revision just approved as the Contract.
     */
    getNewRevision() {
        throw new Error("not implemented");
    }

    /**
     * @return {number[]} Packed transaction of the new revision just approved.
     */
    getPackedTransaction() {
        throw new Error("not implemented");
    }
}

class RevokedEvent extends SubscriptionEvent {}

/**
 * The subscription event base interface for starting follower callback.
 * Real events are either {@link ApprovedWithCallbackEvent} or {@link RevokedWithCallbackEvent} implementations.
 */
class CallbackEvent extends Event {
    /**
     * @return {CallbackService} service for callback sending.
     */
    getCallbackService() {
        throw new Error("not implemented");
    }
}

class ApprovedWithCallbackEvent extends CallbackEvent {
    /**
     * @return {Contract} new revision just approved as the Contract.
     */
    getNewRevision() {
        throw new Error("not implemented");
    }
}

class RevokedWithCallbackEvent extends CallbackEvent {
    /**
     * @return {Contract} revoking item as the Contract.
     */
    getRevokingItem() {
        throw new Error("not implemented");
    }
}

class CompletedEvent extends Event {}

class FailedEvent extends Event {}

class SpentEvent extends Event {}

module.exports = {ContractSubscription, Event, SubscriptionEvent, ApprovedEvent, RevokedEvent, CallbackEvent,
    ApprovedWithCallbackEvent, RevokedWithCallbackEvent, CompletedEvent, FailedEvent, SpentEvent};