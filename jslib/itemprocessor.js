import {ScheduleExecutor} from "executorservice";

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
};

class ItemProcessor {

    constructor(itemId, parcelId, item, isCheckingForce, node) {
        this.itemId = itemId;
        this.parcelId = parcelId;
        this.item = item;
        this.isCheckingForce = isCheckingForce;
        this.processingState = ItemProcessingState.INIT;
        this.node = node;
        if (this.item == null)
            this.item = this.node.cache.get(itemId);

        this.pollingExpiresAt = new Date();
        this.pollingExpiresAt.setTime(this.pollingExpiresAt.getTime() + Config.maxElectionsTime);

        this.consensusReceivedExpiresAt = new Date();
        this.consensusReceivedExpiresAt.setTime(this.consensusReceivedExpiresAt.getTime() + Config.maxConsensusReceivedCheckTime);

        this.alreadyChecked = false;
    }

    async run() {
        let recordWas = await this.node.ledger.getRecord(this.itemId);
        if (recordWas != null)
            this.stateWas = recordWas.state;
        else
            this.stateWas = ItemState.UNDEFINED;

        this.record = await this.node.ledger.findOrCreate(this.itemId);

        if (this.item != null)
            new ScheduleExecutor(() => this.itemDownloaded(), 0, this.node.executorService).run();

        return this;
    }

    itemDownloaded() {

    }
}

module.exports = {ItemProcessor, ItemProcessingState};