const bs = require("biserializable");
const NameCache = require("./namecache").NameCache;
const e = require("errors");
const ErrorRecord = e.ErrorRecord;

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

    subscriptions() {
        return this.subscriptionsSet;
    }

    storages() {
        return this.storagesSet;
    }

    nameRecords() {
        return this.nameRecordsSet;
    }

    getFollowerService(init) {
        if (init === true && this.followerService == null)
            this.followerService = new NFollowerService(this.ledger, this.id);

        return this.followerService;
    }

    tryAllocate(reducedNamesToAllocate, originsToAllocate, addressesToAllocate) {
        let namesErrors = this.isNamesAvailable(reducedNamesToAllocate);
        let originsErrors = this.isOriginsAvailable(originsToAllocate);
        let addressesErrors = this.isAddressesAvailable(addressesToAllocate);
        let checkResult = namesErrors.length === 0 && originsErrors.length === 0 && addressesErrors.length === 0;

        if (!checkResult) {
            if (namesErrors.length === 0)
                this.nameCache.unlockNameList(reducedNamesToAllocate);
            if (originsErrors.length === 0)
                this.nameCache.unlockOriginList(originsToAllocate);
            if (addressesErrors.length === 0)
                this.nameCache.unlockAddressList(addressesToAllocate);
        }

        let res = [];
        namesErrors.forEach(s => res.push(new ErrorRecord(Errors.FAILED_CHECK, "names", "name '" + s + "' is not available")));
        originsErrors.forEach(s => res.push(new ErrorRecord(Errors.FAILED_CHECK, "origins", "origin '" + s + "' is not available")));
        addressesErrors.forEach(s => res.push(new ErrorRecord(Errors.FAILED_CHECK, "addresses", "address '" + s + "' is not available")));

        return res;
    }

    isNamesAvailable(reducedNames) {
        if (reducedNames.length === 0)
            return [];

        let unavailableNamesCache = this.nameCache.lockNameList(reducedNames);
        if (unavailableNamesCache.length > 0)
            return unavailableNamesCache;

        let unavailableNamesLedger = this.ledger.isAllNameRecordsAvailable(reducedNames);
        if (unavailableNamesLedger.length > 0) {
            this.nameCache.unlockNameList(reducedNames);
            return unavailableNamesLedger;
        }

        return [];
    }


}