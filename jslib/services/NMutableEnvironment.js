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

    createChainSubscription(origin, expiresAt) {                                      //@NonNull
        let sub = new NContractSubscription(origin, true, expiresAt);
        this.subscriptionsToAdd.add(sub);
        return sub;
    }

    createContractSubscription(id, expiresAt) {                                         //@NonNull
        let sub = new NContractSubscription(id, false, expiresAt);
        this.subscriptionsToAdd.add(sub);
        return sub;
    }

    createContractStorage(packedTransaction, expiresAt) {                               //@NonNull
        let storage = new NContractStorage(packedTransaction, expiresAt);
        this.storagesToAdd.add(storage);
        return storage;
    }

    createNameRecord(unsName, expiresAt) {                                              //@NonNull
        let nr = new NNameRecord(unsName,expiresAt);
        nr.environmentId = this.id;
        this.nameRecordsToAdd.add(nr);
        return nr;
    }

    setSubscriptionExpiresAt(subscription, expiresAt) {
        let sub = subscription;
        sub.expiresAt = expiresAt;

        //existing subscription
        if (sub.id !== 0)
            this.subscriptionsToSave.add(sub);
    }

    setStorageExpiresAt(contractStorage, expiresAt) {
        let storage = contractStorage;
        storage.expiresAt = expiresAt;

        //existing storage
        if(storage.id != 0)
            this.storagesToSave.add(storage);
    }

    destroySubscription(subscription) {
        this.subscriptionsToDestroy.add(subscription);
    }

    destroyStorage(contractStorage) {
        this.storagesToDestroy.add(contractStorage);
    }

    setNameRecordExpiresAt(nameRecord, expiresAt) {
        let nnr = nameRecord;
        nnr.expiresAt = expiresAt;
        if (nnr.id !== 0) {
            this.nameRecordsToSave.add(nnr);
        }
    }

    destroyNameRecord(nameRecord) {
        this.nameRecordsToDestroy.add(nameRecord);
    }
}