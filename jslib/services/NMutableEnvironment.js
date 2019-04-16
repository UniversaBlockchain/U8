const NImmutableEnvironment = require("NImmutableEnvironment").NImmutableEnvironment;
const Boss = require("boss");

/**
 * Implements {@see MutableEnvironment} interface for smart contracts.
 */
class NMutableEnvironment extends NImmutableEnvironment, MutableEnvironment {

    constructor(ime) {
        super(ime.contract, ime.kvStore, ime.subscriptionsSet, ime.storagesSet, ime.nameRecordsSet, ime.followerService, ime.ledger);

        this.nameCache = ime.nameCache;
        this.id = ime.id;
        this.immutable = ime;

        this.subscriptionsToAdd = new Set();
        this.subscriptionsToDestroy = new Set();
        this.subscriptionsToSave = new Set();

        this.nameRecordsToAdd = new Set();
        this.nameRecordsToDestroy = new Set();
        this.nameRecordsToSave = new Set();

        this.storagesToAdd = new Set();
        this.storagesToDestroy = new Set();
        this.storagesToSave = new Set();
    }

    set(key, value) {
        let previous = this.kvStore.get(key);
        this.kvStore.set(key, value);

        return previous;
    }

    createChainSubscription(origin, expiresAt) {
        let sub = new NContractSubscription(origin, true, expiresAt);
        this.subscriptionsToAdd.add(sub);
        return sub;
    }

    createContractSubscription(id, expiresAt) {
        let sub = new NContractSubscription(id, false, expiresAt);
        this.subscriptionsToAdd.add(sub);
        return sub;
    }

    createContractStorage(packedTransaction, expiresAt) {
        let storage = new NContractStorage(packedTransaction, expiresAt);
        this.storagesToAdd.add(storage);
        return storage;
    }

    createNameRecord(unsName, expiresAt) {
        let nr = new NNameRecord(unsName, expiresAt);
        nr.environmentId = this.id;
        this.nameRecordsToAdd.add(nr);
        return nr;
    }

    setSubscriptionExpiresAt(subscription, expiresAt) {
        subscription.expiresAt = expiresAt;

        //existing subscription
        if (subscription.id !== 0)
            this.subscriptionsToSave.add(subscription);
    }

    setStorageExpiresAt(contractStorage, expiresAt) {
        contractStorage.expiresAt = expiresAt;

        //existing storage
        if(contractStorage.id !== 0)
            this.storagesToSave.add(contractStorage);
    }

    destroySubscription(subscription) {
        this.subscriptionsToDestroy.add(subscription);
    }

    destroyStorage(contractStorage) {
        this.storagesToDestroy.add(contractStorage);
    }

    setNameRecordExpiresAt(nameRecord, expiresAt) {
        nameRecord.expiresAt = expiresAt;

        //existing name record
        if (nameRecord.id !== 0) {
            this.nameRecordsToSave.add(nameRecord);
        }
    }

    destroyNameRecord(nameRecord) {
        this.nameRecordsToDestroy.add(nameRecord);
    }

    async save() {
        await this.ledger.updateEnvironment(this.id, this.contract.getExtendedType(), this.contract.id,
            Boss.dump(this.kvStore), this.contract.getPackedTransaction());

        this.subscriptionsToDestroy.forEach(async(sub) => await this.ledger.removeEnvironmentSubscription(sub.id));

        this.subscriptionsToSave.forEach(async(sub) => await this.ledger.updateSubscriptionInStorage(sub.id, sub.expiresAt));

        this.subscriptionsToAdd.forEach(async(sub) =>
            sub.id = await this.ledger.saveSubscriptionInStorage(sub.hashId, sub.isChainSubscription, sub.expiresAt, this.id)
        );

        this.storagesToDestroy.forEach(async(storage) => await this.ledger.removeEnvironmentStorage(storage.id));

        this.storagesToSave.forEach(async(storage) => await this.ledger.updateStorageExpiresAt(storage.id, storage.expiresAt));

        this.storagesToAdd.forEach(async(storage) =>
                storage.id = await this.ledger.saveContractInStorage(storage.contract.id, storage.packedContract,
                    storage.expiresAt, storage.contract.getOrigin(), this.id)
        );

        this.nameRecordsToDestroy.forEach(async(nameRecord) => await this.ledger.removeNameRecord(nameRecord.nameReduced));

        await this.ledger.clearExpiredStorageContractBinaries();

        let addressList = [];
        let nameList = [];
        let originsList = [];

        this.nameRecordsToSave.forEach(async(nameRecord) => {
            await this.ledger.updateNameRecord(nameRecord.id, nameRecord.expiresAt);
            nameList.push(nameRecord.nameReduced);
            nameRecord.getEntries().forEach( e => {
                if (e.getOrigin() != null)
                    originsList.push(e.getOrigin());

                if (e.getLongAddress() != null)
                    addressList.push(e.getLongAddress());

                if (e.getShortAddress() != null)
                    addressList.push(e.getShortAddress());
            });
        });

        this.nameRecordsToAdd.forEach(async(nameRecord) => {
            await this.ledger.addNameRecord(nameRecord);
            nameList.push(nameRecord.nameReduced);
            nameRecord.getEntries().forEach( e => {
                if (e.getOrigin() != null)
                    originsList.push(e.getOrigin());

                if (e.getLongAddress() != null)
                    addressList.push(e.getLongAddress());

                if (e.getShortAddress() != null)
                    addressList.push(e.getShortAddress());
            });
        });

        this.nameCache.unlockAddressList(addressList);
        this.nameCache.unlockNameList(nameList);
        this.nameCache.unlockOriginList(originsList);

        this.subscriptionsToDestroy.forEach(sub => this.immutable.subscriptionsSet.delete(sub));
        this.subscriptionsToAdd.forEach(sub => this.immutable.subscriptionsSet.add(sub));

        this.storagesToDestroy.forEach(stor => this.immutable.storagesSet.delete(stor));
        this.storagesToAdd.forEach(stor => this.immutable.storagesSet.add(stor));

        this.nameRecordsToDestroy.forEach(nr => this.immutable.nameRecordsSet.delete(nr));
        this.nameRecordsToAdd.forEach(nr => this.immutable.nameRecordsSet.add(nr));

        this.immutable.kvStore.clear();
        for (let [k, v] of this.kvStore)
            this.immutable.kvStore.set(k, v);

        if (this.followerService != null)
            this.followerService.save();
    }
}