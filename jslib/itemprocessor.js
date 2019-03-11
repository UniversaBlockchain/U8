const ItemProcessingState = {
    NOT_EXIST : {val: "NOT_EXIST", isProcessedToConsensus : false, isDone : false},
    INIT : {val: "INIT", isProcessedToConsensus : false, isDone : false},
    DOWNLOADING : {val: "DOWNLOADING", isProcessedToConsensus : false, isDone : false},
    DOWNLOADED : {val: "DOWNLOADED", isProcessedToConsensus : false, isDone : false},
    CHECKING : {val: "CHECKING", isProcessedToConsensus : false, isDone : false},
    RESYNCING : {val: "RESYNCING", isProcessedToConsensus : false, isDone : false},
    GOT_RESYNCED_STATE : {val: "GOT_RESYNCED_STATE", isProcessedToConsensus : false, isDone : false},
    POLLING : {val: "POLLING", isProcessedToConsensus : false, isDone : false},
    GOT_CONSENSUS : {val: "GOT_CONSENSUS", isProcessedToConsensus : true, isDone : false},
    DONE : {val: "DONE", isProcessedToConsensus : true, isDone : true},
    SENDING_CONSENSUS : {val: "SENDING_CONSENSUS", isProcessedToConsensus : true, isDone : true},
    FINISHED : {val: "FINISHED", isProcessedToConsensus : true, isDone : true},
    EMERGENCY_BREAK : {val: "EMERGENCY_BREAK", isProcessedToConsensus : false, isDone : false}
}

function ItemProcessor(itemId, parcelId, item, isCheckingForce,cache,ledger,config) {

    this.itemId = itemId;
    this.parcelId = parcelId;
    this.item = item;
    this.isCheckingForce = isCheckingForce;
    this.processingState = ItemProcessingState.INIT;
    this.cache = cache;
    this.ledger = ledger;
    this.config = config;
    if(this.item == null) {
        this.item = cache.get(itemId);
    }

    let recordWas = ledger.getRecord(itemId);
    if(recordWas != null) {
        this.stateWas = recordWas.state;
    } else {
        this.stateWas = ItemState.UNDEFINED;
    }

    this.record = ledger.findOrCreate(itemId);

    this.pollingExpiresAt = new Date();
    this.pollingExpiresAt.setTime(this.pollingExpiresAt.getTime() + config.maxElectionsTime);

    this.consensusReceivedExpiresAt = new Date();
    this.consensusReceivedExpiresAt.setTime(this.consensusReceivedExpiresAt.getTime() + config.maxConsensusReceivedCheckTime);

    this.alreadyChecked = false;

    if(this.item != null) {
        this.itemDownloaded();
    }

}

ItemProcessor.prototype.itemDownloaded = function () {
    
};