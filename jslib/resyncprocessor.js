import * as trs from "timers";

const ItemResult = require('itemresult').ItemResult;
const VerboseLevel = require("node").VerboseLevel;
const Config = require("config").Config;

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
        this.resyncExpirationTimer = trs.timeout(Config.maxResyncTime * 1000, this.resyncEnded);

        this.resyncingItem = new ResyncingItem(this.itemId, this.node.ledger.getRecord(this.itemId));
        this.resyncingItem.finishEvent.then((ri) => this.onFinishResync(ri));

        this.obtainedAnswersFromNodes.clear();
        this.voteItself();

        this.resyncer = new RunnableWithDynamicPeriod(this.pulseResync, Config.resyncTime);
        this.resyncer.run();
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

    /*startResyncSubTree() {
        resyncingSubTreeItems.forEach((k, v) -> resync(k, ri->onResyncSubTreeItemFinish(ri)));
    }

    pulseResync() {
        report(getLabel(), ()->"ResyncProcessor.pulseResync(itemId="+itemId+
            "), time="+Duration.between(resyncExpiresAt.minus(config.getMaxResyncTime()),
                Instant.now()).toMillis()+"ms", DatagramAdapter.VerboseLevel.BASE);
        if (resyncExpiresAt.isBefore(Instant.now())) {
            report(getLabel(), ()->"ResyncProcessor.pulseResync(itemId="+itemId+") expired, cancel", DatagramAdapter.VerboseLevel.BASE);
            resyncer.cancel(true);
        } else {
            try {
                ResyncNotification notification = new ResyncNotification(myInfo, itemId, true);
                network.eachNode(node -> {
                    if (!obtainedAnswersFromNodes.contains(node))
                        network.deliver(node, notification);
                });
            } catch (IOException e) {
                report(getLabel(), ()->"error: unable to send ResyncNotification, exception: " + e, DatagramAdapter.VerboseLevel.BASE);
            }
        }
    }

    obtainAnswer(answer) {
    if (obtainedAnswersFromNodes.putIfAbsent(answer.getFrom(), 0) == null) {
        report(getLabel(), () -> "ResyncProcessor.obtainAnswer(itemId=" + itemId + "), state: " + answer.getItemState(), DatagramAdapter.VerboseLevel.BASE);
        resyncingItem.resyncVote(answer.getFrom(), answer.getItemState());
        if (answer.getHasEnvironment())
            envSources.put(answer.getFrom(), 0);
        if (resyncingItem.isResyncPollingFinished() && resyncingItem.isCommitFinished()) {
            report(getLabel(), () -> "ResyncProcessor.obtainAnswer... resync done", DatagramAdapter.VerboseLevel.BASE);
            resyncer.cancel(true);
        }
    }
    }

    onFinishResync( ri) {
        report(getLabel(), ()->"ResyncProcessor.onFinishResync(itemId=" + itemId + ")", DatagramAdapter.VerboseLevel.BASE);

        //DELETE ENVIRONMENTS FOR REVOKED ITEMS
        if (resyncingItem.getResyncingState() == ResyncingItemProcessingState.COMMIT_SUCCESSFUL) {
            if (resyncingItem.getItemState() == ItemState.REVOKED) {
                removeEnvironment(itemId);
            }
        }
        //SAVE ENVIRONMENTS FOR APPROVED ITEMS
        if (saveResyncedEnvironents()) {
            resyncEnded();
        } else {
            resyncer.cancel(true);
        }
    }

    onResyncSubTreeItemFinish(ri) {
        resyncingSubTreeItemsResults.put(ri.hashId, ri.getItemState());
        if (resyncingSubTreeItemsResults.size() >= resyncingSubTreeItems.size()) {
            resyncEnded();
        }
    }

    resyncEnded() {
        if (resyncingItem.getResyncingState() == ResyncingItemProcessingState.PENDING_TO_COMMIT
            || resyncingItem.getResyncingState() == ResyncingItemProcessingState.IS_COMMITTING) {

            executorService.schedule(() -> resyncEnded(), 1, TimeUnit.SECONDS);
            return;

        } else if (resyncingItem.getResyncingState() == ResyncingItemProcessingState.WAIT_FOR_VOTES) {
            executorService.schedule(() -> itemSanitationTimeout(resyncingItem.record), 0, TimeUnit.SECONDS);
        } else if (resyncingItem.getResyncingState() == ResyncingItemProcessingState.COMMIT_FAILED) {
            executorService.schedule(() -> itemSanitationFailed(resyncingItem.record), 0, TimeUnit.SECONDS);
        } else {
            executorService.schedule(() -> itemSanitationDone(resyncingItem.record), 0, TimeUnit.SECONDS);
        }
        finishEvent.fire(resyncingItem);
        stopResync();
    }

    stopResync() {
        resyncer.cancel(true);
        resyncExpirationTimer.cancel();
        resyncProcessors.remove(itemId);
    }

    saveResyncedEnvironents() {
        if(!envSources.isEmpty()) {
            HashSet<HashId> itemsToReResync = new HashSet<>();
            HashId id = itemId;
            Random random = new Random(Instant.now().toEpochMilli() * myInfo.getNumber());
            Object[] array = envSources.keySet().toArray();
            NodeInfo from = (NodeInfo) array[(int) (array.length * random.nextFloat())];
            try {
                NImmutableEnvironment environment = network.getEnvironment(id, from, config.getMaxGetItemTime());
                if (environment != null) {
                    Set<HashId> conflicts = ledger.saveEnvironment(environment);
                    if (conflicts.size() > 0) {
                        //TODO: remove in release
                        boolean resyncConflicts = true;
                        if (resyncConflicts) {
                            itemsToReResync.addAll(conflicts);
                        } else {
                            conflicts.forEach(conflict -> removeEnvironment(conflict));
                            assert ledger.saveEnvironment(environment).isEmpty();
                        }
                    }
                }
            } catch (InterruptedException e) {
                return true;
            }

            if (itemsToReResync.size() > 0) {
                resyncingSubTreeItems.clear();
                itemsToReResync.forEach(item -> {
                    //TODO: OPTIMIZE GETTING STATE RECORD
                    resyncingSubTreeItems.put(item, 0);
                });
                startResyncSubTree();
                return false;
            }
        }
        return true;
    }*/

}