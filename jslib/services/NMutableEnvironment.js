const NImmutableEnvironment = require("NImmutableEnvironment").NImmutableEnvironment;

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

    save() {
        /*ledger.updateEnvironment(getId(),contract.getExtendedType(),contract.getId(), Boss.pack(kvStore),contract.getPackedTransaction());

        subscriptionsToDestroy.forEach(sub -> ledger.removeEnvironmentSubscription(sub.getId()));

        subscriptionsToSave.forEach(sub-> ledger.updateSubscriptionInStorage(sub.getId(), sub.expiresAt()));

        subscriptionsToAdd.forEach(sub -> {
                long subId = ledger.saveSubscriptionInStorage(sub.getHashId(), sub.isChainSubscription(), sub.expiresAt(), getId());
                sub.setId(subId);
            }
        );

        storagesToDestroy.forEach(storage -> ledger.removeEnvironmentStorage(storage.getId()));

        storagesToSave.forEach(storage-> ledger.updateStorageExpiresAt(storage.getId(), storage.expiresAt()));

        storagesToAdd.forEach(storage -> {
                long storageId = ledger.saveContractInStorage(storage.getContract().getId(), storage.getPackedContract(),
                storage.expiresAt(), storage.getContract().getOrigin(), getId());
                storage.setId(storageId);
            }
        );

        nameRecordsToDestroy.forEach(nameRecord -> ledger.removeNameRecord(nameRecord.getNameReduced()));

        ledger.clearExpiredStorageContractBinaries();

        List<String> addressList = new LinkedList<>();
        List<String> nameList = new LinkedList<>();
        List<HashId> originsList = new LinkedList<>();


        nameRecordsToSave.forEach(nameRecord -> {
            ledger.updateNameRecord(nameRecord.getId(),nameRecord.expiresAt());
            nameList.add(nameRecord.getNameReduced());
            nameRecord.getEntries().forEach( e -> {
                if(e.getOrigin() != null) {
                    originsList.add(e.getOrigin());
                }

                if(e.getLongAddress() != null) {
                    addressList.add(e.getLongAddress());
                }

                if(e.getShortAddress() != null) {
                    addressList.add(e.getShortAddress());
                }

            });
        });
        nameRecordsToAdd.forEach(nameRecord -> {
            ledger.addNameRecord(nameRecord);
            nameList.add(nameRecord.getNameReduced());
            nameRecord.getEntries().forEach( e -> {
                if(e.getOrigin() != null) {
                    originsList.add(e.getOrigin());
                }

                if(e.getLongAddress() != null) {
                    addressList.add(e.getLongAddress());
                }

                if(e.getShortAddress() != null) {
                    addressList.add(e.getShortAddress());
                }

            });
        });


        nameCache.unlockAddressList(addressList);
        nameCache.unlockNameList(nameList);
        nameCache.unlockOriginList(originsList);

        immutable.subscriptionsSet.removeAll(subscriptionsToDestroy);
        immutable.subscriptionsSet.addAll(subscriptionsToAdd);

        immutable.storagesSet.removeAll(storagesToDestroy);
        immutable.storagesSet.addAll(storagesToAdd);

        immutable.nameRecordsSet.removeAll(nameRecordsToDestroy);
        immutable.nameRecordsSet.addAll(nameRecordsToAdd);

        immutable.kvStore.clear();
        for (String key : kvStore.keySet()) {
            immutable.kvStore.set(key, kvStore.get(key));
        }

        if (followerService != null)
            followerService.save();*/
    }
}