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
        this.expiresAt.setSeconds(this.expiresAt.getSeconds() - decreaseSeconds);
    }

    changeMutedAt(deltaSeconds) {
        this.expiresAt.setSeconds(this.expiresAt.getSeconds() + deltaSeconds);
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

    async serialize(serializer) {
        return {
            expiresAt : await serializer.serialize(this.expiresAt),
            mutedAt : await serializer.serialize(this.mutedAt),
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

    async save(connection = undefined) {
        await this.ledger.saveFollowerEnvironment(this.environmentId, this.expiresAt, this.mutedAt, this.spent, this.startedCallbacks, connection);

        if (this.callbackService != null) {
            // start scheduled callback processor
            await this.callbackService.startCallbackProcessor(this.updatingItem, this.state, this.contract, this.me);
            this.callbackService = null;
        }
    }
}

module.exports = {NFollowerService};