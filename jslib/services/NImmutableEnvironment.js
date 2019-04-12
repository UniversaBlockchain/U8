const bs = require("biserializable");

/**
 * Implements {@see ImmutableEnvironment} interface for smart contract.
 */
class NImmutableEnvironment extends ImmutableEnvironment, bs.BiSerializable {
    /**
     * Restore NImmutableEnvironment
     *
     * @param {NSmartContract} contract smart contract this environment belongs to
     * @param {Ledger} ledger - database ledger.
     * @param {Object} kvBinder - map stored in the ledger.
     * @param {[ContractSubscription]} subscriptions - array of contract subscription.
     * @param {[ContractStorage]} storages - array of contract storages.
     * @param {[NameRecord]} nameRecords - array of UNS mame records.
     * @param {FollowerService} followerService - follower contract service.
     */
    constructor(contract, ledger, kvBinder, subscriptions, storages, nameRecords, followerService) {
        super();
        this.contract = contract;
        this.ledger = ledger;
        this.createdAt = Math.floor(Date.now() / 1000);
        this.kvStore = new Map();

        if (kvBinder === undefined || subscriptions === undefined || storages === undefined ||
            nameRecords === undefined || followerService === undefined) {
            this.subscriptionsSet = new Set();
            this.storagesSet = new Set();
            this.nameRecordsSet = new Set();
            return;
        }

        if (kvBinder != null)
            for (let [k, v] of kvBinder)
                this.kvStore.set(k, v);

        this.subscriptionsSet = new Set(subscriptions);
        this.storagesSet = new Set(storages);
        this.nameRecordsSet = new Set(nameRecords);
        this.followerService = followerService;
    }


}