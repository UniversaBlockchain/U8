const NameCache = require("namecache").NameCache;
const e = require("errors");
const ErrorRecord = e.ErrorRecord;

const ImmutableEnvironment = require("services/immutableEnvironment").ImmutableEnvironment;
const NFollowerService = require("services/NFollowerService").NFollowerService;

/**
 * Implements {@see ImmutableEnvironment} interface for smart contract.
 */
class NImmutableEnvironment extends ImmutableEnvironment {
    /**
     * Restore NImmutableEnvironment
     *
     * @param {NSmartContract} contract smart contract this environment belongs to
     * @param {Ledger} ledger - database ledger.
     * @param {Object} kvStorage - key-value data stored in the ledger.
     * @param {[ContractSubscription]} subscriptions - array of contract subscription.
     * @param {[ContractStorage]} storages - array of contract storages.
     * @param {[NameRecord]} nameRecords - array of UNS mame records.
     * @param {FollowerService} followerService - follower contract service.
     */
    constructor(contract, ledger, kvStorage = undefined, subscriptions = undefined, storages = undefined,
                nameRecords = undefined, followerService = undefined) {
        super();
        this.id = 0;
        this.contract = contract;
        this.ledger = ledger;
        this.createdAt = new Date();
        this.createdAt.setMilliseconds(0);
        this.kvStore = {};

        if (kvStorage === undefined || subscriptions === undefined || storages === undefined ||
            nameRecords === undefined || followerService === undefined) {
            this.subscriptionsSet = new Set();
            this.storagesSet = new Set();
            this.nameRecordsSet = new Set();
            return;
        }

        if (kvStorage != null)
            this.kvStore = kvStorage;

        this.subscriptionsSet = new Set(subscriptions);
        this.storagesSet = new Set(storages);
        this.nameRecordsSet = new Set(nameRecords);
        this.followerService = followerService;
        this.nameCache = null;
    }

    get(keyName, defaultValue) {
        if (this.kvStore.hasOwnProperty(keyName))
            return this.kvStore[keyName];

        return defaultValue;
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

    isOriginsAvailable(origins) {
        if (origins.length === 0)
            return [];

        let unavailableOriginsCache = this.nameCache.lockOriginList(origins);
        if (unavailableOriginsCache.length > 0)
            return unavailableOriginsCache;

        let unavailableOriginsLedger = this.ledger.isAllOriginsAvailable(origins);
        if (unavailableOriginsLedger.length > 0) {
            this.nameCache.unlockOriginList(origins);
            return unavailableOriginsLedger;
        }

        return [];
    }

    isAddressesAvailable(addresses) {
        if (addresses.length === 0)
            return [];

        let unavailableAddressesCache = this.nameCache.lockAddressList(addresses);
        if (unavailableAddressesCache.length > 0)
            return unavailableAddressesCache;

        let unavailableAddressesLedger = this.ledger.isAllAddressesAvailable(addresses);
        if (unavailableAddressesLedger.length > 0) {
            this.nameCache.unlockAddressList(addresses);
            return unavailableAddressesLedger;
        }

        return [];
    }

    getMutable() {
        // dynamic import
        if (this.NMutableEnvironment == null)
            this.NMutableEnvironment = require("services/NMutableEnvironment").NMutableEnvironment;

        return new this.NMutableEnvironment(this);
    }

    serialize(serializer) {
        return {
            contract : this.contract.getPackedTransaction(),
            createdAt : serializer.serialize(this.createdAt),
            subscriptions : serializer.serialize(Array.from(this.subscriptionsSet)),
            storages : serializer.serialize(Array.from(this.storagesSet)),
            nameRecords : serializer.serialize(Array.from(this.nameRecordsSet)),
            kvStore : serializer.serialize(this.kvStore)
        };
    }

    deserialize(data, deserializer) {
        this.createdAt = deserializer.deserialize(data.createdAt);
        this.subscriptionsSet = new Set(deserializer.deserialize(data.subscriptions));
        this.storagesSet = new Set(deserializer.deserialize(data.storages));
        this.nameRecordsSet = new Set(deserializer.deserialize(data.nameRecords));
        this.contract = Contract.fromPackedTransaction(data.contract);
        this.kvStore = deserializer.deserialize(data.kvStore);
    }
}

module.exports = {NImmutableEnvironment};