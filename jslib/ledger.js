function Ledger() {

}



/**
 * Get the record by its id
 *
 * @param id to retreive
 * @return instance or null if not found
 */
Ledger.prototype.getRecord = function(id) {

}

/**
 * Create a record in {@link ItemState#LOCKED_FOR_CREATION} state locked by creatorRecordId. Does not check
 * anything, the business logic of it is in the {@link StateRecord}. Still, if a database logic prevents creation of
 * a lock record (e.g. hash is already in use), it must return null.
 *
 * @param creatorRecordId record that want to create new item
 * @param newItemHashId   new item hash
 * @return ready saved instance or null if it can not be created (e.g. already exists)
 */
Ledger.prototype.createOutputLockRecord = function(creatorRecordId, newItemHashId) {

}

/**
 * Get the record that owns the lock. This method should only return the record, not analyze it or somehow process. Still
 * it never returns expired records. Note that <b>caller must clear the lock</b> if this method returns null.
 *
 * @param rc locked record.
 * @return the record or null if none found
 */
Ledger.prototype.getLockOwnerOf = function(rc) {

};

/**
 * Create new record for a given id and set it to the PENDING state. Normally, it is used to create new root
 * documents. If the record exists, it returns it. If the record does not exists, it creates new one with {@link
    * ItemState#PENDING} state. The operation must be implemented as atomic.
 *
 * @param itemdId hashId to register, or null if it is already in use
 * @return found or created {@link StateRecord}
 */
Ledger.prototype.findOrCreate = function(itemdId) {

};

/**
 * Shortcut method: check that record exists and its state returns {@link ItemState#isApproved()}}. Check it to
 * ensure its meaning.
 *
 * @param id is {@link HashId} for checking item
 * @return true if it is.
 */
Ledger.prototype.isApproved = function(id) {

};

/**
 * Shortcut method: check that record exists and its state returns {@link ItemState#isConsensusFound()}}. Check it to
 * ensure its meaning.
 *
 * @param id is {@link HashId} for checking item
 * @return true if it is.
 */
Ledger.prototype.isConsensusFound = function(id) {

};

/**
 * Perform a callable in a transaction. If the callable throws any exception, the transaction should be rolled back
 * to its initial state. Blocks until the callable returns, and returns what the callable returns. If an exception
 * is thrown by the callable, the transaction is rolled back and the exception will be rethrown unless it was a
 * {@link Rollback} instance, which just rollbacks the transaction, in which case it always return null.
 *
 * @param block to execute
 * @return null if transaction is rolled back throwing a {@link Rollback} exception, otherwise what callable
 * returns.
 */
Ledger.prototype.transaction = function(block) {

};

/**
 * Destroy the record and free space in the ledger.
 *
 * @param record is {@link StateRecord} to destroy
 */
Ledger.prototype.destroy = function(record) {

};

/**
 * save a record into the ledger
 *
 * @param stateRecord is {@link StateRecord} to save
 */
Ledger.prototype.save = function(stateRecord) {

};

/**
 * Refresh record.
 *
 * @param stateRecord is {@link StateRecord} to reload
 * @throws StateRecord.NotFoundException as itself
 */
Ledger.prototype.reload = function( stateRecord) {

};

Ledger.prototype.close = function () {

};

Ledger.prototype.countRecords = function() {

};



Ledger.prototype.getLockOwnerOf = function(itemId) {

};

Ledger.prototype.getLedgerSize = function(createdAfter) {

};

Ledger.prototype.savePayment = function(amount, date) {
    
};

Ledger.prototype.getPayments = function(fromDate) {
    
};

Ledger.prototype.markTestRecord = function(hash){};

Ledger.prototype.isTestnet = function(itemId){};

Ledger.prototype.updateSubscriptionInStorage = function(id, expiresAt){};
Ledger.prototype.updateStorageExpiresAt = function( storageId, expiresAt){};
Ledger.prototype.saveFollowerEnvironment = function( environmentId,  expiresAt,  mutedAt,  spent,  startedCallbacks){};

Ledger.prototype.updateNameRecord = function( id,  expiresAt){};

Ledger.prototype.saveEnvironment = function( environment){};

Ledger.prototype.findBadReferencesOf = function(ids){};


Ledger.prototype.saveConfig = function( myInfo,  netConfig,  nodeKey){};
Ledger.prototype.loadConfig = function(){};
Ledger.prototype.addNode = function( nodeInfo){};
Ledger.prototype.removeNode = function( nodeInfo){};
Ledger.prototype.findUnfinished = function(){};

Ledger.prototype.getItem = function( record){};
Ledger.prototype.putItem = function( record,  item,  keepTill){};

Ledger.prototype.getKeepingItem = function( itemId){};
Ledger.prototype.putKeepingItem = function( record,  item){};
Ledger.prototype.getKeepingByOrigin = function( origin,  limit){};

Ledger.prototype.getEnvironment = function( environmentId){};
Ledger.prototype.getEnvironment = function( contractId){};
Ledger.prototype.getEnvironment = function( smartContract){};

Ledger.prototype.updateEnvironment = function( id,  ncontractType,  ncontractHashId,  kvStorage, transactionPack){};

Ledger.prototype.saveContractInStorage = function( contractId,  binData,  expiresAt,  origin,  environmentId){};

Ledger.prototype.saveSubscriptionInStorage = function( hashId,  subscriptionOnChain,  expiresAt,  environmentId){};

Ledger.prototype.getSubscriptionEnviromentIds = function( id){};

Ledger.prototype.getFollowerCallbackStateById = function( id){};
Ledger.prototype.getFollowerCallbacksToResyncByEnvId = function( environmentId){};
Ledger.prototype.getFollowerCallbacksToResync = function(){};
Ledger.prototype.addFollowerCallback = function( id,  environmentId,  expiresAt,  storedUntil){};
Ledger.prototype.updateFollowerCallbackState = function( id, state){};
Ledger.prototype.removeFollowerCallback = function( id){};

Ledger.prototype.clearExpiredStorages = function(){};
Ledger.prototype.clearExpiredSubscriptions = function(){};
Ledger.prototype.clearExpiredStorageContractBinaries = function(){};

Ledger.prototype.getSmartContractById = function( smartContractId){};
Ledger.prototype.getContractInStorage = function( contractId){};
Ledger.prototype.getContractInStorage = function( slotId,  contractId){};
Ledger.prototype.getContractsInStorageByOrigin = function( slotId,  originId){};

Ledger.prototype.removeEnvironmentSubscription = function( subscriptionId){};
Ledger.prototype.removeEnvironmentStorage = function( storageId){};
Ledger.prototype.removeEnvironment = function( ncontractHashId){};
Ledger.prototype.removeExpiredStoragesAndSubscriptionsCascade = function(){};

Ledger.prototype.addNameRecord = function(  nameRecordModel){};
Ledger.prototype.removeNameRecord = function(  nameReduced){};
Ledger.prototype.getNameRecord = function(  nameReduced){};
Ledger.prototype.getNameByAddress  = function( address){};
Ledger.prototype.getNameByOrigin  = function( origin){};
Ledger.prototype.isAllNameRecordsAvailable = function( reducedNames){};
Ledger.prototype.isAllOriginsAvailable = function( origins){};
Ledger.prototype.isAllAddressesAvailable = function(addresses){};
Ledger.prototype.clearExpiredNameRecords = function( holdDuration){};

Ledger.prototype.cleanup = function( isPermanetMode){};

module.exports = {Ledger};