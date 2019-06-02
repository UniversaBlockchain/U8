import * as trs from "timers";
import {ScheduleExecutor, ExecutorWithFixedPeriod, ExecutorWithDynamicPeriod} from "executorservice";

const ItemResult = require('itemresult').ItemResult;
const VerboseLevel = require("node").VerboseLevel;
const Config = require("config").Config;
const ResyncingItemProcessingState = require("node").ResyncingItemProcessingState;
const Ledger = require("ledger").Ledger;


class ResyncProcessor {

    constructor(itemId, node, onComplete) {
        this.itemId = itemId;
        this.node = node;
        this.resyncingItem = null;
        this.resyncExpiresAt = null;
        this.resyncer = null;
        this.envSources = new Map(); //assume it is ConcurrentHashSet
        this.resyncingSubTreeItems = new Map(); //assume it is ConcurrentHashSet
        this.resyncingSubTreeItemsResults = new Map();
        this.obtainedAnswersFromNodes = new Map(); //assume it is ConcurrentHashSet
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
        this.resyncingItem.finishEvent.then((ri) => this.onFinishResync(ri));

        this.obtainedAnswersFromNodes.clear();
        this.voteItself();

        this.resyncer = new ExecutorWithDynamicPeriod(() => this.pulseResync(), Config.resyncTime, this.node.executorService).run();
    }

    voteItself() {
        if (this.resyncingItem.getItemState().isConsensusFound())
            this.resyncingItem.resyncVote(this.node.myInfo, this.resyncingItem.getItemState());
        else
            this.resyncingItem.resyncVote(this.node.myInfo, ItemState.UNDEFINED);
    }

    restartResync() {
        this.obtainedAnswersFromNodes.clear();
        this.resyncer.restart();
    }

    startResyncSubTree() {
        this.resyncingSubTreeItems.forEach((k, v) => resync(k, ri=>this.onResyncSubTreeItemFinish(ri)));
    }

    pulseResync() {
        this.node.report("ResyncProcessor.pulseResync(itemId=" + this.itemId + "),time=" + Math.floor(this.resyncExpiresAt / 1000) - Config.maxResyncTime,
            Date.now() + "ms", VerboseLevel.BASE);

        if (this.resyncExpiresAt < Date.now()) {
            this.node.report("ResyncProcessor.pulseResync(itemId=" + this.itemId + ") expired, cancel", VerboseLevel.BASE);
            this.resyncer.cancel(true);
        } else {
            try {
                let notification = new ResyncNotification(myInfo, this.itemId, true);
                network.eachNode(node => {  //TODO
                    if (!this.obtainedAnswersFromNodes.contains(node))
                        network.deliver(node, notification);
                });
            } catch (e) {
                this.node.report("error: unable to send ResyncNotification, exception: " + e, VerboseLevel.BASE);

            }
        }
    }

    obtainAnswer(answer) {
        if (this.obtainedAnswersFromNodes.putIfAbsent(answer.getFrom(), 0) == null) {
            this.node.report("ResyncProcessor.obtainAnswer(itemId=" + this.itemId + "), state: " + answer.getItemState(), VerboseLevel.BASE);
            this.resyncingItem.resyncVote(answer.getFrom(), answer.getItemState());
            if (answer.getHasEnvironment())
                this.envSources.set(answer.getFrom(), 0);
            if (this.resyncingItem.isResyncPollingFinished() && this.resyncingItem.isCommitFinished()) {
                this.node.report("ResyncProcessor.obtainAnswer... resync done" + e, VerboseLevel.BASE);
                this.resyncer.cancel(true);
            }
        }
    }

    onFinishResync(ri) {
        this.node.report("ResyncProcessor.onFinishResync(itemId=" + this.itemId + ")", VerboseLevel.BASE);
        //DELETE ENVIRONMENTS FOR REVOKED ITEMS
        if (this.resyncingItem.resyncingState === ResyncingItemProcessingState.COMMIT_SUCCESSFUL) {
            if (this.resyncingItem.getItemState() === ItemState.REVOKED) {
                removeEnvironment(this.itemId); //TODO
            }
        }
        //SAVE ENVIRONMENTS FOR APPROVED ITEMS
        if (this.saveResyncedEnvironents()) {
            this.resyncEnded();
        } else {
            this.resyncer.cancel(true);
        }
    }

    onResyncSubTreeItemFinish(ri) {
        this.resyncingSubTreeItemsResults.set(ri.hashId, ri.getItemState());
        if (this.resyncingSubTreeItemsResults.size >= this.resyncingSubTreeItems.size) {
            this.resyncEnded();
        }
    }

    resyncEnded() {
        if (this.resyncingItem.resyncingState() === ResyncingItemProcessingState.PENDING_TO_COMMIT
            || this.resyncingItem.resyncingState() === ResyncingItemProcessingState.IS_COMMITTING) {

            trs.timeout(1, this.resyncEnded); //TODO
            return;

        } else if (this.resyncingItem.resyncingState() === ResyncingItemProcessingState.WAIT_FOR_VOTES) {
            trs.timeout(this.resyncingItem.record, this.itemSanitationTimeout()); //TODO
            //executorService.schedule(() -> itemSanitationTimeout(resyncingItem.record), 0, TimeUnit.SECONDS);
        } else if (this.resyncingItem.resyncingState() === ResyncingItemProcessingState.COMMIT_FAILED) {
            //executorService.schedule(() -> itemSanitationFailed(resyncingItem.record), 0, TimeUnit.SECONDS);
            trs.timeout(this.resyncingItem.record, this.itemSanitationFailed()); //TODO
        } else {
            //executorService.schedule(() -> itemSanitationDone(resyncingItem.record), 0, TimeUnit.SECONDS);
            trs.timeout(this.resyncingItem.record, this.itemSanitationDone()); //TODO
        }
        this.finishEvent.fire(this.resyncingItem);
        this.stopResync();
    }

    stopResync() {
        this.resyncer.cancel();
        this.resyncExpirationTimer.cancel();
        resyncProcessors.remove(this.itemId);//TODO
    }

    async saveResyncedEnvironents() {
        if(!this.envSources.isEmpty()) {
            let itemsToReResync = new Set();
            let id = this.itemId;
            let random = new Random(Instant.now().toEpochMilli() * myInfo.getNumber());
            let array = this.envSources.keySet().toArray();
            let from =  array.length * random.nextFloat();
            try {
                let environment = network.getEnvironment(id, from, Config.maxGetItemTime); //TODO
                if (environment != null) {
                    let conflicts = await Ledger.saveEnvironment(environment);
                    if (conflicts.size > 0) { //TODO
                        //TODO: remove in release
                        let resyncConflicts = true;
                        if (resyncConflicts) {
                            itemsToReResync.addAll(conflicts);
                        } else {
                            conflicts.forEach(conflict => removeEnvironment(conflict));
                            if (await Ledger.saveEnvironment(environment).size != 0) {
                                throw new Error("error");
                            }
                        }
                    }
                }
            } catch (e) {
                return true;
            }

            if (itemsToReResync.size > 0) {
                this.resyncingSubTreeItems.clear();
                itemsToReResync.forEach(item => {
                    //TODO: OPTIMIZE GETTING STATE RECORD
                    this.resyncingSubTreeItems.set(item, 0);
                });
                this.startResyncSubTree();
                return false;
            }
        }
        return true;
    }

}

class ResyncingItem {

    constructor(hid, record) {
        this.hashId = hid;
        this.record = record;

        this.resyncingState = ResyncingItemProcessingState.WAIT_FOR_VOTES;

        this.finishEvent = new Promise(resolve => this.finishFire = resolve);

        this.recordWas = Ledger.getRecord(hid);
        this.stateWas = undefined;
        if (this.recordWas != null) {
            this.stateWas = this.recordWas.getState();
        } else {
            this.stateWas = ItemState.UNDEFINED;
        }

        this.resyncNodes = new Map();
        this.resyncNodes.set(ItemState.APPROVED, new Set());
        this.resyncNodes.set(ItemState.REVOKED, new Set());
        this.resyncNodes.set(ItemState.DECLINED, new Set());
        this.resyncNodes.set(ItemState.UNDEFINED, new Set());
    }

    resyncVote(node, state) {
        //TODO: move to resyncNodes.get(ItemState.APPROVED).size() >= config.getPositiveConsensus()
        if (state === ItemState.LOCKED)
            state = ItemState.APPROVED;

        //ItemState finalState = state;
        //report(getLabel(), () -> concatReportMessage("resyncVote at " + myInfo.getNumber() + " from " +node.getNumber() + " item " + hashId + " state " + finalState),
        //        DatagramAdapter.VerboseLevel.DETAILED);

        let approvedConsenus = false;
        let revokedConsenus = false;
        let declinedConsenus = false;
        let undefinedConsenus = false;

        // TODO synchronized
        for (let is of this.resyncNodes.keySet()) {
            this.resyncNodes.get(is).remove(node);
        }

        if (!this.resyncNodes.has(state)) {
            this.resyncNodes.set(state, new Set());
        }
        this.resyncNodes.get(state).add(node);

        if (this.isResyncPollingFinished()) {
            return;
        }

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

        //TODO synchronized
        if (revokedConsenus) {
            executorService.submit(() => resyncAndCommit(ItemState.REVOKED),
                Node.this.toString() + " > item " + hashId + " :: resyncVote -> resyncAndCommit");
        } else if (declinedConsenus) {
            executorService.submit(() => resyncAndCommit(ItemState.DECLINED),
                Node.this.toString() + " > item " + hashId + " :: resyncVote -> resyncAndCommit");
        } else if (approvedConsenus) {
            executorService.submit(() => resyncAndCommit(ItemState.APPROVED),
                Node.this.toString() + " > item " + hashId + " :: resyncVote -> resyncAndCommit");
        } else if (undefinedConsenus) {
            executorService.submit(() => resyncAndCommit(ItemState.UNDEFINED),
                Node.this.toString() + " > item " + hashId + " :: resyncVote -> resyncAndCommit");
        } else
            throw new Error("error: resync consensus reported without consensus");
    }

    //there should be no consensus checks here as it was already done in resyncVote
    resyncAndCommit(committingState) {
        this.resyncingState = ResyncingItemProcessingState.IS_COMMITTING;

       /* executorService.submit(()->{
            if(committingState.isConsensusFound()) {
                Set<NodeInfo> rNodes = new HashSet<>();
                Set<NodeInfo> nowNodes = resyncNodes.get(committingState);

                Map<Long,Set<ItemResult>> createdAtClusters = new HashMap<>();
                Map<Long,Set<ItemResult>> expiresAtClusters = new HashMap<>();

                // make local set of nodes to prevent changing set of nodes while commiting
                synchronized (resyncNodes) {
                    for (NodeInfo ni : nowNodes) {
                        rNodes.add(ni);
                    }
                }
                for (NodeInfo ni : rNodes) {
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
                }
                resyncingState = ResyncingItemProcessingState.COMMIT_SUCCESSFUL;
            } else {
                resyncingState = ResyncingItemProcessingState.COMMIT_FAILED;
            }
            finishEvent.fire(this);
        }, Node.this.toString() + " > item " + hashId + " :: resyncAndCommit -> body");*/
    }

    closeByTimeout() {
        this.resyncingState = ResyncingItemProcessingState.COMMIT_FAILED;
        this.finishEvent.fire(this); //TODO
    }

    /**
     * true if number of needed answers is got (for consensus or for break resyncing)
     * @return
     */
    isResyncPollingFinished() {
        return this.resyncingState !== ResyncingItemProcessingState.WAIT_FOR_VOTES;
    }

    /**
     * true if item resynced and commit finished (with successful or fail).
     * @return
     */
     isCommitFinished() {
        return this.resyncingState === ResyncingItemProcessingState.COMMIT_SUCCESSFUL || this.resyncingState === ResyncingItemProcessingState.COMMIT_FAILED;
    }

    getItemState() {
        if(this.record != null)
            return this.record.state;

        return ItemState.UNDEFINED;
    }
}
