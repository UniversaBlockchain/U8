const bs = require("biserializable");

/**
 * Implements {@link FollowerService} interface for follower contract.
 */
class NFollowerService extends FollowerService, bs.BiSerializable {

    constructor(ledger, expiresAt, mutedAt, environmentId, spent, startedCallbacks) {
        super();
        this.ledger = ledger;
        this.environmentId = environmentId;
        this.expiresAt = expiresAt;
        this.mutedAt = mutedAt;
        this.spent = spent;
        this.startedCallbacks = startedCallbacks;
    }

    expiresAt() {
        return this.expiresAt;
    }

    mutedAt() {
        return this.mutedAt;
    }

    setExpiresAndMutedAt(expiresAt, mutedAt) {
        this.expiresAt = expiresAt;
        this.mutedAt = mutedAt;
    }

    decreaseExpiresAt(decreaseSeconds) {
        this.expiresAt.setTime(((this.expiresAt.getTime() / 1000) - decreaseSeconds) * 1000);
    }

    changeMutedAt(deltaSeconds) {
        this.expiresAt.setTime(((this.expiresAt.getTime() / 1000) + deltaSeconds) * 1000);

    }

    increaseCallbacksSpent(addSpent) {
        this.spent += addSpent;
    }

    getCallbacksSpent() {
        return this.spent;
    }

    increaseStartedCallbacks() {
        this.startedCallbacks++;
    }

    decreaseStartedCallbacks() {
        this.startedCallbacks--;
    }

    getStartedCallbacks() {
        return startedCallbacks;
    }

    deserialize(data, deserializer) {
        this. expiresAt = data.expiresAt;
        this.mutedAt = data.mutedAt;
        this.spent = data.spent;
        this.startedCallbacks = data.startedCallbacks;
    }

    serialize(serializer) {
        return {
            expiresAt : serializer.serialize(this.expiresAt),
            mutedAt : serializer.serialize(this.mutedAt),
            spent : this.spent,
            startedCallbacks : this.startedCallbacks
        };
    }

    scheduleCallbackProcessor(updatingItem, state, contract, me, callbackService) {
        this.callbackService = callbackService;
        this.updatingItem = updatingItem;
        this.state = state;
        this.contract = contract;
        this.me = me;
    }

    save() {
        this.ledger.saveFollowerEnvironment(environmentId, expiresAt, mutedAt, spent, startedCallbacks);

        if (this.callbackService != null) {
            // start scheduled callback processor
            this.callbackService.startCallbackProcessor(updatingItem, state, contract, me);
            this.callbackService = null;
        }
    }
}
