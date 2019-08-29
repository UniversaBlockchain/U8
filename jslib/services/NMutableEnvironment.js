/*
 * Copyright (c) 2019 Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

const Boss = require("boss");

const NImmutableEnvironment = require("services/NImmutableEnvironment").NImmutableEnvironment;
const NContractSubscription = require("services/NContractSubscription").NContractSubscription;
const NContractStorage = require("services/NContractStorage").NContractStorage;
const NNameRecord = require("services/NNameRecord").NNameRecord;

/**
 * Implements {@see MutableEnvironment} interface for smart contracts.
 */
class NMutableEnvironment extends NImmutableEnvironment {

    constructor(ime) {
        super(ime.contract, ime.ledger, ime.kvStore, ime.subscriptionsSet, ime.storagesSet, ime.nameRecordsSet, ime.followerService);

        this.nameCache = ime.nameCache;
        this.id = ime.id;
        this.immutable = ime;

        this.subscriptionsToAdd = new t.GenericSet();
        this.subscriptionsToDestroy = new t.GenericSet();
        this.subscriptionsToSave = new t.GenericSet();

        this.nameRecordsToAdd = new t.GenericSet();
        this.nameRecordsToDestroy = new t.GenericSet();
        this.nameRecordsToSave = new t.GenericSet();

        this.storagesToAdd = new t.GenericSet();
        this.storagesToDestroy = new t.GenericSet();
        this.storagesToSave = new t.GenericSet();
    }

    set(key, value) {
        let previous = this.kvStore[key];
        this.kvStore[key] = value;

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

    async save(connection = undefined) {
        await this.ledger.updateEnvironment(this.id, this.contract.getExtendedType(), this.contract.id,
            await Boss.dump(this.kvStore), await this.contract.getPackedTransaction(), connection);

        await Promise.all(Array.from(this.subscriptionsToDestroy).map(
            async(sub) => await this.ledger.removeEnvironmentSubscription(sub.id, connection)
        ));

        await Promise.all(Array.from(this.subscriptionsToSave).map(
            async(sub) => await this.ledger.updateSubscriptionInStorage(sub.id, sub.expiresAt, connection)
        ));

        await Promise.all(Array.from(this.subscriptionsToAdd).map(
            async(sub) => sub.id = await this.ledger.saveSubscriptionInStorage(
                sub.hashId, sub.isChainSubscription, sub.expiresAt, this.id, connection)
        ));

        await Promise.all(Array.from(this.storagesToDestroy).map(
            async(storage) => await this.ledger.removeEnvironmentStorage(storage.id, connection)
        ));

        await Promise.all(Array.from(this.storagesToSave).map(
            async(storage) => await this.ledger.updateStorageExpiresAt(storage.id, storage.expiresAt, connection)
        ));

        await Promise.all(Array.from(this.storagesToAdd).map(
            async(storage) => storage.id = await this.ledger.saveContractInStorage(
                storage.contract.id, storage.packedContract, storage.expiresAt, storage.contract.getOrigin(), this.id, connection)
        ));

        await Promise.all(Array.from(this.nameRecordsToDestroy).map(
            async(nameRecord) => await this.ledger.removeNameRecord(nameRecord.nameReduced, connection)
        ));

        await this.ledger.clearExpiredStorageContractBinaries(connection);

        let addressList = [];
        let nameList = [];
        let originsList = [];

        await Promise.all(Array.from(this.nameRecordsToSave).map(async(nameRecord) => {
            await this.ledger.updateNameRecord(nameRecord.id, nameRecord.expiresAt, connection);
            nameList.push(nameRecord.nameReduced);
            nameRecord.getEntries().forEach(e => {
                if (e.getOrigin() != null)
                    originsList.push(e.getOrigin());

                if (e.getLongAddress() != null)
                    addressList.push(e.getLongAddress());

                if (e.getShortAddress() != null)
                    addressList.push(e.getShortAddress());
            });
        }));

        await Promise.all(Array.from(this.nameRecordsToAdd).map(async(nameRecord) => {
            await this.ledger.addNameRecord(nameRecord, connection);
            nameList.push(nameRecord.nameReduced);
            nameRecord.getEntries().forEach(e => {
                if (e.getOrigin() != null)
                    originsList.push(e.getOrigin());

                if (e.getLongAddress() != null)
                    addressList.push(e.getLongAddress());

                if (e.getShortAddress() != null)
                    addressList.push(e.getShortAddress());
            });
        }));

        this.nameCache.unlockAddressList(addressList);
        this.nameCache.unlockNameList(nameList);
        this.nameCache.unlockOriginList(originsList);

        this.subscriptionsToDestroy.forEach(sub => this.immutable.subscriptionsSet.delete(sub));
        this.subscriptionsToAdd.forEach(sub => this.immutable.subscriptionsSet.add(sub));

        this.storagesToDestroy.forEach(stor => this.immutable.storagesSet.delete(stor));
        this.storagesToAdd.forEach(stor => this.immutable.storagesSet.add(stor));

        this.nameRecordsToDestroy.forEach(nr => this.immutable.nameRecordsSet.delete(nr));
        this.nameRecordsToAdd.forEach(nr => this.immutable.nameRecordsSet.add(nr));

        this.immutable.kvStore = this.kvStore;

        if (this.followerService != null)
            this.followerService.save(connection);
    }
}

module.exports = {NMutableEnvironment};