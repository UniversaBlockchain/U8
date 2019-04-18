const FollowerService = require("services/followerService").FollowerService;
const ItemState = require("itemstate").ItemState;

/**
 * Implements {@link FollowerService} interface for follower contract.
 */
class NFollowerService extends FollowerService {

    constructor(ledger, environmentId, expiresAt = undefined, mutedAt = undefined, spent = undefined, startedCallbacks = undefined) {
        super();
        this.id = 0;
        this.ledger = ledger;
        this.environmentId = environmentId;

        if (expiresAt !== undefined)
            this.expiresAt = expiresAt;
        else
            this.expiresAt = new Date((Math.floor(Date.now() / 1000) + 30 * 24 * 3600) * 1000);

        if (mutedAt !== undefined)
            this.mutedAt = mutedAt;
        else
            this.mutedAt = new Date((Math.floor(Date.now() / 1000) + 30 * 24 * 3600) * 1000);

        if (spent !== undefined)
            this.spent = spent;
        else
            this.spent = 0;

        if (startedCallbacks !== undefined)
            this.startedCallbacks = startedCallbacks;
        else
            this.startedCallbacks = 0;

        this.updatingItem = null;
        this.state = ItemState.UNDEFINED;
        this.contract = null;
        this.me = null;
        this.callbackService = null;
    }

    getExpiresAt() {
        return this.expiresAt;
    }

    getMutedAt() {
        return this.mutedAt;
    }

    setExpiresAndMutedAt(expiresAt, mutedAt) {
        this.expiresAt = expiresAt;
        this.mutedAt = mutedAt;
    }

    decreaseExpiresAt(decreaseSeconds) {
        this.expiresAt.setTime(this.expiresAt.getTime() - decreaseSeconds * 1000);
    }

    changeMutedAt(deltaSeconds) {
        this.expiresAt.setTime(this.expiresAt.getTime() + deltaSeconds * 1000);

    }

    increaseCallbacksSpent(addSpent) {
        this.spent += addSpent;
    }

    increaseStartedCallbacks() {
        this.startedCallbacks++;
    }

    decreaseStartedCallbacks() {
        this.startedCallbacks--;
    }

    getCallbacksSpent() {
        return this.spent;
    }

    getStartedCallbacks() {
        return this.startedCallbacks;
    }

    deserialize(data, deserializer) {
        this.expiresAt = deserializer.deserialize(data.expiresAt);
        this.mutedAt = deserializer.deserialize(data.mutedAt);
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

    async save() {
        await this.ledger.saveFollowerEnvironment(this.environmentId, this.expiresAt, this.mutedAt, this.spent, this.startedCallbacks);

        if (this.callbackService != null) {
            // start scheduled callback processor
            this.callbackService.startCallbackProcessor(this.updatingItem, this.state, this.contract, this.me);
            this.callbackService = null;
        }
    }
}

module.exports = {NFollowerService};