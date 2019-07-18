import {ScheduleExecutor, ExecutorWithDynamicPeriod} from "executorservice";
import {VerboseLevel, ResyncingItemProcessingState} from "node_consts";
import {ResyncNotification} from "notification";

const ItemResult = require('itemresult').ItemResult;
const ItemState = require('itemstate').ItemState;
const Config = require("config").Config;

class ResyncProcessor {

    constructor(itemId, node, onComplete = undefined) {
        this.itemId = itemId;
        this.node = node;
        this.resyncingItem = null;
        this.resyncExpiresAt = null;
        this.resyncer = null;
        this.envSources = new t.GenericSet();
        this.resyncingSubTreeItems = new t.GenericSet();
        this.resyncingSubTreeItemsResults = new t.GenericSet();
        this.obtainedAnswersFromNodes = new Set();
        this.resyncExpirationTimer = null;

        this.finishEvent = new Promise(resolve => this.finishFire = resolve);
        if (onComplete != null)
            this.finishEvent.then(onComplete);
    }

    static getResult() {
        let expires = new Date();
        expires.setMinutes(expires.getMinutes() + 5);
        let result = ItemResult.from(ItemState.PENDING, false, new Date(), expires);
        result.extra = {};
        result.errors = [];
        return result;
    }

    async startResync() {
        if (this.node.ledger == null)
            return;

        this.node.report("ResyncProcessor.startResync(itemId=" + this.itemId + ")", VerboseLevel.BASE);

        this.resyncExpiresAt = Math.floor(Date.now() / 1000) + Config.maxResyncTime;
        this.resyncExpirationTimer = new ScheduleExecutor(() => this.resyncEnded(), Config.maxResyncTime * 1000, this.node.executorService);
        this.resyncExpirationTimer.run();

        this.resyncingItem = new ResyncingItem(this.itemId, await this.node.ledger.getRecord(this.itemId), this.node);
        this.resyncingItem.finishEvent.then(() => this.onFinishResync());

        this.obtainedAnswersFromNodes.clear();
        this.voteItself();

        this.resyncer = new ExecutorWithDynamicPeriod(() => this.pulseResync(), Config.resyncTime, this.node.executorService);
        this.resyncer.run();

        return this;
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

    async startResyncSubTree() {
        await Promise.all(Array.from(this.resyncingSubTreeItems).map(
            async (k) => await this.node.resync(k, ri => this.onResyncSubTreeItemFinish(ri))));
    }

    pulseResync() {
        this.node.report("ResyncProcessor.pulseResync(itemId=" + this.itemId + "),time=" +
            (Date.now() + (Config.maxResyncTime - this.resyncExpiresAt) * 1000) + "ms", VerboseLevel.BASE);

        if (this.resyncExpiresAt < Math.floor(Date.now() / 1000)) {
            this.node.report("ResyncProcessor.pulseResync(itemId=" + this.itemId + ") expired, cancel", VerboseLevel.BASE);
            this.resyncer.cancel();
        } else {
            try {
                let notification = new ResyncNotification(this.node.myInfo, this.itemId, true);
                this.node.network.eachNode(node => {
                    if (!this.obtainedAnswersFromNodes.has(node.number))
                        this.node.network.deliver(node, notification);
                });
            } catch (err) {
                this.node.report("error: unable to send ResyncNotification, exception: " + err.message, VerboseLevel.BASE);
            }
        }
    }

    obtainAnswer(answer) {
        if (!this.obtainedAnswersFromNodes.has(answer.from.number)) {
            this.obtainedAnswersFromNodes.add(answer.from.number);
            this.node.report("ResyncProcessor.obtainAnswer(itemId=" + this.itemId + "), state: " + answer.itemState.val, VerboseLevel.BASE);

            this.resyncingItem.resyncVote(answer.from, answer.itemState);

            if (answer.hasEnvironment)
                this.envSources.add(answer.from);

            if (this.resyncingItem.isResyncPollingFinished() && this.resyncingItem.isCommitFinished()) {
                this.node.report("ResyncProcessor.obtainAnswer... resync done", VerboseLevel.BASE);
                this.resyncer.cancel();
            }
        }
    }

    async onFinishResync() {
        this.node.report("ResyncProcessor.onFinishResync(itemId=" + this.itemId + ")", VerboseLevel.BASE);

        //DELETE ENVIRONMENTS FOR REVOKED ITEMS
        if (this.resyncingItem.resyncingState === ResyncingItemProcessingState.COMMIT_SUCCESSFUL)
            if (this.resyncingItem.getItemState() === ItemState.REVOKED)
                await this.node.removeEnvironment(this.itemId);

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

        } else if (this.resyncingItem.resyncingState === ResyncingItemProcessingState.WAIT_FOR_VOTES)
            new ScheduleExecutor(() => this.node.itemSanitationTimeout(this.resyncingItem.record), 0, this.node.executorService).run();
        else if (this.resyncingItem.resyncingState === ResyncingItemProcessingState.COMMIT_FAILED)
            new ScheduleExecutor(() => this.node.itemSanitationFailed(this.resyncingItem.record), 0, this.node.executorService).run();
        else
            new ScheduleExecutor(() => this.node.itemSanitationDone(this.resyncingItem.record), 0, this.node.executorService).run();

        this.finishFire(this.resyncingItem);
        this.stopResync();
    }

    stopResync() {
        this.resyncer.cancel();
        this.resyncExpirationTimer.cancel();
        this.node.resyncProcessors.delete(this.itemId);
    }

    async saveResyncedEnvironments() {
        if (this.envSources.size > 0) {
            let itemsToReResync = new t.GenericSet();
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

                await this.startResyncSubTree();
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
        this.resyncNodes.set(ItemState.APPROVED.val, new t.GenericSet());
        this.resyncNodes.set(ItemState.REVOKED.val, new t.GenericSet());
        this.resyncNodes.set(ItemState.DECLINED.val, new t.GenericSet());
        this.resyncNodes.set(ItemState.UNDEFINED.val, new t.GenericSet());
    }

    resyncVote(node, state) {
        if (state === ItemState.LOCKED)
            state = ItemState.APPROVED;

        let approvedConsenus = false;
        let revokedConsenus = false;
        let declinedConsenus = false;
        let undefinedConsenus = false;

        for (let is of this.resyncNodes.keys())
            if (is !== state.val)
                this.resyncNodes.get(is).delete(node);

        if (!this.resyncNodes.has(state.val))
            this.resyncNodes.set(state.val, new t.GenericSet());

        this.resyncNodes.get(state.val).add(node);

        if (this.isResyncPollingFinished())
            return;

        if (this.resyncNodes.get(ItemState.REVOKED.val).size >= this.node.config.positiveConsensus) {
            revokedConsenus = true;
            this.resyncingState = ResyncingItemProcessingState.PENDING_TO_COMMIT;
        } else if (this.resyncNodes.get(ItemState.DECLINED.val).size >= this.node.config.positiveConsensus) {
            declinedConsenus = true;
            this.resyncingState = ResyncingItemProcessingState.PENDING_TO_COMMIT;
        } else if (this.resyncNodes.get(ItemState.APPROVED.val).size >= this.node.config.positiveConsensus) {
            approvedConsenus = true;
            this.resyncingState = ResyncingItemProcessingState.PENDING_TO_COMMIT;
        } else if (this.resyncNodes.get(ItemState.UNDEFINED.val).size >= this.node.config.resyncBreakConsensus) {
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

        new ScheduleExecutor(async () => {
            if (committingState.isConsensusFound) {
                // make local set of nodes to prevent changing set of nodes while committing
                let rNodes = new t.GenericSet(this.resyncNodes.get(committingState.val));

                let createdAtClusters = new Map();
                let expiresAtClusters = new Map();

                for (let ni of rNodes) {
                    if (ni != null) {
                        try {
                            let r = await this.node.network.getItemState(ni, this.hashId);
                            if (r != null) {
                                let tsCreated = Math.floor(r.createdAt.getTime() / 1000);
                                let list = Array.from(createdAtClusters.keys()).filter(ts =>
                                    Math.abs(ts - tsCreated) < Config.maxElectionsTime);

                                if (list.length === 0)
                                    createdAtClusters.set(tsCreated, 1);
                                else {
                                    let items = 1;
                                    let summ = tsCreated;
                                    list.forEach(ts => {
                                        let tsItems = createdAtClusters.get(ts);
                                        items += tsItems;
                                        summ += ts * tsItems;
                                        createdAtClusters.delete(ts);
                                    });

                                    createdAtClusters.set(summ / items, items);
                                }

                                let tsExpires = Math.floor(r.expiresAt.getTime() / 1000);
                                list = Array.from(expiresAtClusters.keys()).filter(ts =>
                                    Math.abs(ts - tsExpires) < Config.maxElectionsTime);

                                if (list.length === 0)
                                    expiresAtClusters.set(tsExpires, 1);
                                else {
                                    let items = 1;
                                    let summ = tsExpires;
                                    list.forEach(ts => {
                                        let tsItems = expiresAtClusters.get(ts);
                                        items += tsItems;
                                        summ += ts * tsItems;
                                        expiresAtClusters.delete(ts);
                                    });

                                    expiresAtClusters.set(summ / items, items);
                                }
                            }
                        } catch (err) {
                            console.log(err.message);
                            console.log(err.stack);
                        }
                    }
                }

                let max = 0;
                let createdTs = 0;
                for (let [ts, items] of createdAtClusters)
                    if (items > max) {
                        max = items;
                        createdTs = ts;
                    }

                max = 0;
                let expiresTs = 0;
                for (let [ts, items] of expiresAtClusters)
                    if (items > max) {
                        max = items;
                        expiresTs = ts;
                    }

                let createdAt = new Date(Math.floor(createdTs) * 1000);
                let expiresAt = new Date(Math.floor(expiresTs) * 1000);

                try {
                    await this.node.lock.synchronize(this.hashId, async () => {
                        this.node.report("ResyncItem.resyncAndCommit(itemId=" + this.hashId + "), set state: " +
                            committingState, VerboseLevel.BASE);

                        this.record = await this.node.ledger.findOrCreate(this.hashId);

                        this.record.createdAt = createdAt;
                        this.record.expiresAt = expiresAt;
                        if (committingState === ItemState.APPROVED)
                            await this.record.approve(null, expiresAt, true);
                        else if (committingState === ItemState.DECLINED)
                            await this.record.decline(null, true);
                        else if (committingState === ItemState.REVOKED)
                            await this.record.revoke(null, true);

                        this.node.cache.update(this.record.id, ItemResult.fromStateRecord(this.record));
                    });

                } catch (err) {
                    console.log(err.message);
                    console.log(err.stack);
                }

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
        return this.resyncingState === ResyncingItemProcessingState.COMMIT_SUCCESSFUL ||
               this.resyncingState === ResyncingItemProcessingState.COMMIT_FAILED;
    }

    getItemState() {
        if (this.record != null)
            return this.record.state;

        return ItemState.UNDEFINED;
    }
}

module.exports = {ResyncProcessor, ResyncingItem};