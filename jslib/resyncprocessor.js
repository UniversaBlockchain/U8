import {ScheduleExecutor, ExecutorWithFixedPeriod, ExecutorWithDynamicPeriod} from "executorservice";
import {VerboseLevel, ResyncingItemProcessingState} from "node";

const ItemResult = require('itemresult').ItemResult;
const Config = require("config").Config;

class ResyncProcessor {

    constructor(itemId, node, onComplete) {
        this.itemId = itemId;
        this.node = node;
        this.resyncingItem = null;
        this.resyncExpiresAt = null;
        this.resyncer = null;
        this.envSources = new Set();
        this.resyncingSubTreeItems = new Set();
        this.resyncingSubTreeItemsResults = new Map();
        this.obtainedAnswersFromNodes = new Set();
        this.resyncExpirationTimer = null;

        this.finishEvent = new Promise(resolve => this.finishFire = resolve);
        if (onComplete != null)
            this.finishEvent.then(onComplete);
    }

    getResult() {
        let expires = new Date();
        expires.setMinutes(expires.getMinutes() + 5);
        let result = ItemResult.from(ItemState.PENDING, false, new Date(), expires);
        result.extraDataBinder = {};
        result.errors = [];
        return result;
    }

    startResync() {
        this.node.report("ResyncProcessor.startResync(itemId=" + this.itemId + ")", VerboseLevel.BASE); //TODO: node.report

        this.resyncExpiresAt = Math.floor(Date.now() / 1000) + Config.maxResyncTime;
        this.resyncExpirationTimer = new ScheduleExecutor(() => this.resyncEnded(), Config.maxResyncTime * 1000, this.node.executorService).run();

        this.resyncingItem = new ResyncingItem(this.itemId, this.node.ledger.getRecord(this.itemId));
        this.resyncingItem.finishEvent.then(() => this.onFinishResync());

        this.obtainedAnswersFromNodes.clear();
        this.voteItself();

        this.resyncer = new ExecutorWithDynamicPeriod(() => this.pulseResync(), Config.resyncTime, this.node.executorService).run();
    }

    voteItself() {
        if (this.resyncingItem.getItemState().isConsensusFound)
            this.resyncingItem.resyncVote(this.node.myInfo, this.resyncingItem.getItemState());
        else
            this.resyncingItem.resyncVote(this.node.myInfo, ItemState.UNDEFINED);
    }

    restartResync() {
        this.obtainedAnswersFromNodes.clear();
        this.resyncer.restart();
    }

    startResyncSubTree() {
        this.resyncingSubTreeItems.forEach(k => this.node.resync(k, ri => this.onResyncSubTreeItemFinish(ri)));
    }

    pulseResync() {
        this.node.report("ResyncProcessor.pulseResync(itemId=" + this.itemId + "),time=" +
            Math.floor(Date.now() / 1000) - this.resyncExpiresAt + Config.maxResyncTime + "ms", VerboseLevel.BASE);

        if (this.resyncExpiresAt < Date.now()) {
            this.node.report("ResyncProcessor.pulseResync(itemId=" + this.itemId + ") expired, cancel", VerboseLevel.BASE);
            this.resyncer.cancel();
        } else {
            try {
                let notification = new ResyncNotification(this.node.myInfo, this.itemId, true); //TODO: ResyncNotification
                this.node.network.eachNode(node => {  //TODO: node.network
                    if (!this.obtainedAnswersFromNodes.has(node))
                        this.node.network.deliver(node, notification);
                });
            } catch (err) {
                this.node.report("error: unable to send ResyncNotification, exception: " + err.message, VerboseLevel.BASE);
            }
        }
    }

    obtainAnswer(answer) {
        if (!this.obtainedAnswersFromNodes.has(answer.from)) {
            this.obtainedAnswersFromNodes.add(answer.from);
            this.node.report("ResyncProcessor.obtainAnswer(itemId=" + this.itemId + "), state: " + answer.itemState, VerboseLevel.BASE);

            this.resyncingItem.resyncVote(answer.from, answer.itemState);

            if (answer.hasEnvironment)
                this.envSources.add(answer.from);

            if (this.resyncingItem.isResyncPollingFinished() && this.resyncingItem.isCommitFinished()) {
                this.node.report("ResyncProcessor.obtainAnswer... resync done", VerboseLevel.BASE);
                this.resyncer.cancel();
            }
        }
    }

    onFinishResync() {
        this.node.report("ResyncProcessor.onFinishResync(itemId=" + this.itemId + ")", VerboseLevel.BASE);

        //DELETE ENVIRONMENTS FOR REVOKED ITEMS
        if (this.resyncingItem.resyncingState === ResyncingItemProcessingState.COMMIT_SUCCESSFUL)
            if (this.resyncingItem.getItemState() === ItemState.REVOKED)
                this.node.removeEnvironment(this.itemId);   //TODO: node.removeEnvironment

        //SAVE ENVIRONMENTS FOR APPROVED ITEMS
        if (this.saveResyncedEnvironments())
            this.resyncEnded();
        else
            this.resyncer.cancel();
    }

    onResyncSubTreeItemFinish(ri) {
        this.resyncingSubTreeItemsResults.set(ri.hashId, ri.getItemState());
        if (this.resyncingSubTreeItemsResults.size >= this.resyncingSubTreeItems.size)
            this.resyncEnded();
    }

    resyncEnded() {
        if (this.resyncingItem.resyncingState === ResyncingItemProcessingState.PENDING_TO_COMMIT
            || this.resyncingItem.resyncingState === ResyncingItemProcessingState.IS_COMMITTING) {

            new ScheduleExecutor(() => this.resyncEnded(), 1000, this.node.executorService).run();
            return;

        } else if (this.resyncingItem.resyncingState() === ResyncingItemProcessingState.WAIT_FOR_VOTES) //TODO: node.itemSanitation...
            new ScheduleExecutor(() => this.node.itemSanitationTimeout(this.resyncingItem.record), 0, this.node.executorService).run();
        else if (this.resyncingItem.resyncingState() === ResyncingItemProcessingState.COMMIT_FAILED)
            new ScheduleExecutor(() => this.node.itemSanitationFailed(this.resyncingItem.record), 0, this.node.executorService).run();
        else
            new ScheduleExecutor(() => this.node.itemSanitationDone(this.resyncingItem.record), 0, this.node.executorService).run();

        this.finishFire(this.resyncingItem);
        this.stopResync();
    }

    stopResync() {
        this.resyncer.cancel();
        this.resyncExpirationTimer.cancel();
        this.node.resyncProcessors.delete(this.itemId); //TODO: node.resyncProcessors
    }

    async saveResyncedEnvironments() {
        if (this.envSources.size > 0) {
            let itemsToReResync = new Set();
            let array = Array.from(this.envSources);
            let from = array[array.length * Math.random()];

            let environment = this.node.network.getEnvironment(this.itemId, from, Config.maxGetItemTime);
            if (environment != null) {
                let conflicts = await this.node.ledger.saveEnvironment(environment);
                if (conflicts.size > 0)
                    conflicts.forEach(conflict => itemsToReResync.add(conflict));
            }

            if (itemsToReResync.size > 0) {
                this.resyncingSubTreeItems.clear();
                itemsToReResync.forEach(item => this.resyncingSubTreeItems.add(item)); //TODO: OPTIMIZE GETTING STATE RECORD

                this.startResyncSubTree();
                return false;
            }
        }
        return true;
    }
}

class ResyncingItem {

    constructor(hid, record, node) {
        this.hashId = hid;
        this.record = record;
        this.node = node;
        this.resyncingState = ResyncingItemProcessingState.WAIT_FOR_VOTES;

        this.finishEvent = new Promise(resolve => this.finishFire = resolve);

        this.resyncNodes = new Map();
        this.resyncNodes.set(ItemState.APPROVED, new Set());
        this.resyncNodes.set(ItemState.REVOKED, new Set());
        this.resyncNodes.set(ItemState.DECLINED, new Set());
        this.resyncNodes.set(ItemState.UNDEFINED, new Set());
    }

    resyncVote(node, state) {
        if (state === ItemState.LOCKED)
            state = ItemState.APPROVED;

        let approvedConsenus = false;
        let revokedConsenus = false;
        let declinedConsenus = false;
        let undefinedConsenus = false;

        for (let is of this.resyncNodes.keys())
            if (is !== state)
                this.resyncNodes.get(is).delete(node);

        if (!this.resyncNodes.has(state))
            this.resyncNodes.set(state, new Set());

        this.resyncNodes.get(state).add(node);

        if (this.isResyncPollingFinished())
            return;

        if (this.resyncNodes.get(ItemState.REVOKED).size() >= this.node.config.positiveConsensus) {
            revokedConsenus = true;
            this.resyncingState = ResyncingItemProcessingState.PENDING_TO_COMMIT;
        } else if (this.resyncNodes.get(ItemState.DECLINED).size >= this.node.config.positiveConsensus) {
            declinedConsenus = true;
            this.resyncingState = ResyncingItemProcessingState.PENDING_TO_COMMIT;
        } else if (this.resyncNodes.get(ItemState.APPROVED).size >= this.node.config.positiveConsensus) {
            approvedConsenus = true;
            this.resyncingState = ResyncingItemProcessingState.PENDING_TO_COMMIT;
        } else if (this.resyncNodes.get(ItemState.UNDEFINED).size >= this.node.config.resyncBreakConsensus) {
            undefinedConsenus = true;
            this.resyncingState = ResyncingItemProcessingState.PENDING_TO_COMMIT;
        }
        if (!this.isResyncPollingFinished())
            return;

        if (revokedConsenus)
            new ScheduleExecutor(() => this.resyncAndCommit(ItemState.REVOKED), 0, this.node.executorService).run();
        else if (declinedConsenus)
            new ScheduleExecutor(() => this.resyncAndCommit(ItemState.DECLINED), 0, this.node.executorService).run();
        else if (approvedConsenus)
            new ScheduleExecutor(() => this.resyncAndCommit(ItemState.APPROVED), 0, this.node.executorService).run();
        else if (undefinedConsenus)
            new ScheduleExecutor(() => this.resyncAndCommit(ItemState.UNDEFINED), 0, this.node.executorService).run();
        else
            throw new Error("error: resync consensus reported without consensus");
    }

    //there should be no consensus checks here as it was already done in resyncVote
    resyncAndCommit(committingState) {
        this.resyncingState = ResyncingItemProcessingState.IS_COMMITTING;

        new ScheduleExecutor(() => {
            if (committingState.isConsensusFound) {
                // make local set of nodes to prevent changing set of nodes while committing
                let rNodes = new Set(this.resyncNodes.get(committingState));

                let createdAtClusters = new Map();
                let expiresAtClusters = new Map();

                /*for (NodeInfo ni : rNodes) {
                    if (ni != null) {
                        try {
                            ItemResult r = network.getItemState(ni, hashId);
                            if (r != null) {
                                List<Long> list = createdAtClusters.keySet().stream()
                                    .filter(ts -> Math.abs(ts - r.createdAt.toEpochSecond()) < config.getMaxElectionsTime().getSeconds()).collect(Collectors.toList());

                                if(list.isEmpty()) {
                                    Set<ItemResult> itemSet = new HashSet<>();
                                    itemSet.add(r);
                                    createdAtClusters.put(r.createdAt.toEpochSecond(),itemSet);
                                } else {
                                    Set<ItemResult> itemSet = createdAtClusters.remove(list.get(0));
                                    for(int i = 1; i < list.size();++i) {
                                        itemSet.addAll(createdAtClusters.remove(list.get(1)));
                                    }
                                    itemSet.add(r);
                                    Average avg = new Average();
                                    itemSet.forEach(item -> avg.update(item.createdAt.toEpochSecond()));
                                    createdAtClusters.put((long) avg.average(),itemSet);
                                }

                                list = expiresAtClusters.keySet().stream()
                                    .filter(ts -> Math.abs(ts - r.expiresAt.toEpochSecond()) < config.getMaxElectionsTime().getSeconds()).collect(Collectors.toList());

                                if(list.isEmpty()) {
                                    Set<ItemResult> itemSet = new HashSet<>();
                                    itemSet.add(r);
                                    expiresAtClusters.put(r.expiresAt.toEpochSecond(),itemSet);
                                } else {
                                    Set<ItemResult> itemSet = expiresAtClusters.remove(list.get(0));
                                    for(int i = 1; i < list.size();++i) {
                                        itemSet.addAll(expiresAtClusters.remove(list.get(1)));
                                    }
                                    itemSet.add(r);
                                    Average avg = new Average();
                                    itemSet.forEach(item -> avg.update(item.expiresAt.toEpochSecond()));
                                    expiresAtClusters.put((long) avg.average(),itemSet);
                                }

                            }
                        } catch (e) {
                        } catch (e) {
                            Console.log(e.stack);
                        }
                    }
                }

                long createdTs = createdAtClusters.keySet().stream().max(Comparator.comparingInt(i -> createdAtClusters.get(i).size())).get();
                long expiresTs = expiresAtClusters.keySet().stream().max(Comparator.comparingInt(i -> expiresAtClusters.get(i).size())).get();

                ZonedDateTime createdAt = ZonedDateTime.ofInstant(
                    Instant.ofEpochSecond(createdTs), ZoneId.systemDefault());
                ZonedDateTime expiresAt = ZonedDateTime.ofInstant(
                    Instant.ofEpochSecond(expiresTs), ZoneId.systemDefault());

                try {
                    itemLock.synchronize(hashId, lock -> {
                        StateRecord newRecord = ledger.findOrCreate(hashId);
                        newRecord.setState(committingState)
                            .setCreatedAt(createdAt)
                            .setExpiresAt(expiresAt)
                            .save();
                        this.record = newRecord;
                        synchronized (cache) {
                            cache.update(newRecord.id, new ItemResult(newRecord));
                        }
                        return null;
                    });
                } catch (Exception e) {
                    e.printStackTrace();
                }*/
                this.resyncingState = ResyncingItemProcessingState.COMMIT_SUCCESSFUL;

            } else
                this.resyncingState = ResyncingItemProcessingState.COMMIT_FAILED;

            this.finishFire(this);

        }, 0, this.node.executorService).run();
    }

    closeByTimeout() {
        this.resyncingState = ResyncingItemProcessingState.COMMIT_FAILED;
        this.finishFire(this);
    }

    /**
     * true if number of needed answers is got (for consensus or for break resyncing)
     * @return {boolean}
     */
    isResyncPollingFinished() {
        return this.resyncingState !== ResyncingItemProcessingState.WAIT_FOR_VOTES;
    }

    /**
     * true if item resynced and commit finished (with successful or fail).
     * @return {boolean}
     */
    isCommitFinished() {
        return this.resyncingState === ResyncingItemProcessingState.COMMIT_SUCCESSFUL || this.resyncingState === ResyncingItemProcessingState.COMMIT_FAILED;
    }

    getItemState() {
        if (this.record != null)
            return this.record.state;

        return ItemState.UNDEFINED;
    }
}

module.exports = {ResyncProcessor, ResyncingItem};