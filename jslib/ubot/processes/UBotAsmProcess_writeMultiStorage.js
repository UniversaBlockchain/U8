const UBotAsmProcess_writeSingleStorage = require("ubot/processes/UBotAsmProcess_writeSingleStorage").UBotAsmProcess_writeSingleStorage;
const UBotConfig = require("ubot/ubot_config").UBotConfig;
const ExecutorWithFixedPeriod = require("executorservice").ExecutorWithFixedPeriod;
const ErrorRecord = require("errors").ErrorRecord;
const Errors = require("errors").Errors;
const UBotPoolState = require("ubot/ubot_pool_state").UBotPoolState;
const UBotCloudNotification_asmCommand = require("ubot/ubot_notification").UBotCloudNotification_asmCommand;

class UBotAsmProcess_writeMultiStorage extends UBotAsmProcess_writeSingleStorage {
    constructor(processor, onReady, asmProcessor, cmdIndex) {
        super(processor, onReady, asmProcessor, cmdIndex);
        this.hashes = [];
        this.hashesReady = false;
        this.otherAnswers = new Set();
        this.approveCounterFromOthersSets = [];
        this.declineCounterFromOthersSets = [];
        for (let i = 0; i < this.pr.pool.length; ++i) {
            this.approveCounterFromOthersSets.push(new Set());
            this.declineCounterFromOthersSets.push(new Set());
        }
    }

    start() {
        this.pr.logger.log("start UBotAsmProcess_writeMultiStorage");
        for (let i = 0; i < this.pr.pool.length; ++i)
            this.approveCounterFromOthersSets[i].add(this.pr.ubot.network.myInfo.number); // vote for itself
        this.hashes[this.pr.poolIndexes.get(this.pr.ubot.network.myInfo.number)] = this.binHashId;  // add self hash

        this.pulseGetHashes();
        this.currentTask = new ExecutorWithFixedPeriod(() => {
            this.pulseGetHashes();
        }, UBotConfig.multi_storage_vote_period, this.pr.ubot.executorService).run();
    }

    pulseGetHashes() {
        for (let i = 0; i < this.pr.pool.length; ++i)
            if (!this.otherAnswers.has(this.pr.pool[i].number) && this.pr.pool[i].number !== this.pr.ubot.network.myInfo.number)
                this.pr.ubot.network.deliver(this.pr.pool[i],
                    new UBotCloudNotification_asmCommand(
                        this.pr.ubot.network.myInfo,
                        this.pr.poolId,
                        this.cmdIndex,
                        UBotCloudNotification_asmCommand.types.MULTI_STORAGE_GET_DATA_HASHID,
                        null,
                        false
                    )
                );
    }

    pulseGetPoolHashes() {
        for (let i = 0; i < this.pr.pool.length; ++i)
            if (!this.otherAnswers.has(this.pr.pool[i].number) && this.pr.pool[i].number !== this.pr.ubot.network.myInfo.number)
                this.pr.ubot.network.deliver(this.pr.pool[i],
                    new UBotCloudNotification_asmCommand(
                        this.pr.ubot.network.myInfo,
                        this.pr.poolId,
                        this.cmdIndex,
                        UBotCloudNotification_asmCommand.types.MULTI_STORAGE_GET_POOL_HASHES,
                        null,
                        false
                    )
                );
    }

    async onNotify(notification) {
        if (notification instanceof UBotCloudNotification_asmCommand) {
            if (notification.type === UBotCloudNotification_asmCommand.types.MULTI_STORAGE_GET_DATA_HASHID) {
                if (!notification.isAnswer) {
                    this.pr.ubot.network.deliver(notification.from,
                        new UBotCloudNotification_asmCommand(
                            this.pr.ubot.network.myInfo,
                            this.pr.poolId,
                            this.cmdIndex,
                            UBotCloudNotification_asmCommand.types.MULTI_STORAGE_GET_DATA_HASHID,
                            this.binHashId,
                            true
                        )
                    );
                } else {
                    this.otherAnswers.add(notification.from.number);
                    this.hashes[this.pr.poolIndexes.get(notification.from.number)] = notification.dataHashId;

                    if (this.otherAnswers.size >= this.pr.pool.length - 1) {
                        this.hashesReady = true;
                        this.currentTask.cancel();
                        this.otherAnswers.clear();
                        this.pr.logger.log("UBotAsmProcess_writeMultiStorage: get pool hashes");
                        this.pulseGetPoolHashes();
                        this.currentTask = new ExecutorWithFixedPeriod(() => {
                            this.pulseGetPoolHashes();
                        }, UBotConfig.multi_storage_vote_period, this.pr.ubot.executorService).run();
                    }
                }

            } else if (notification.type === UBotCloudNotification_asmCommand.types.MULTI_STORAGE_GET_POOL_HASHES) {
                if (!notification.isAnswer) {
                    if (this.hashesReady)
                        this.pr.ubot.network.deliver(notification.from,
                            new UBotCloudNotification_asmCommand(
                                this.pr.ubot.network.myInfo,
                                this.pr.poolId,
                                this.cmdIndex,
                                UBotCloudNotification_asmCommand.types.MULTI_STORAGE_GET_POOL_HASHES,
                                this.hashes,
                                true
                            )
                        );
                } else if (!this.currentTask.cancelled) {
                    for (let i = 0; i < this.pr.pool.length; i++) {
                        if (this.hashes[i].equals(notification.dataHashId[i]))
                            this.approveCounterFromOthersSets[i].add(notification.from.number);
                        else
                            this.declineCounterFromOthersSets[i].add(notification.from.number);

                        if (this.approveCounterFromOthersSets[i].size >= this.pr.executableContract.state.data.poolQuorum)
                            this.approveCounterSet.add(i);
                        else if (this.declineCounterFromOthersSets[i].size > this.pr.pool.length - this.pr.executableContract.state.data.poolQuorum)
                            this.declineCounterSet.add(i);
                    }

                    if (this.approveCounterSet.size >= this.pr.executableContract.state.data.poolQuorum &&
                        this.approveCounterSet.has(this.pr.poolIndexes.get(this.pr.ubot.network.myInfo.number)) &&
                        this.approveCounterFromOthersSets[0].size + this.declineCounterFromOthersSets[0].size === this.pr.pool.length) {

                        // ok
                        this.currentTask.cancel();

                        try {
                            await this.pr.ledger.writeToMultiStorage(this.pr.poolId, this.pr.executableContract.id,
                                "default", this.binToWrite, this.pr.ubot.network.myInfo.number);
                        } catch (err) {
                            this.pr.logger.log("error: UBotAsmProcess_writeMultiStorage");
                            this.pr.errors.push(new ErrorRecord(Errors.FAILURE, "UBotAsmProcess_writeMultiStorage", "error writing to multi-storage"));
                            this.pr.changeState(UBotPoolState.FAILED);
                            return;
                        }
                        this.pr.logger.log("UBotAsmProcess_writeMultiStorage... ready, approved");

                        this.onReady();
                        // TODO: distribution multi-storage to all ubots here or after closing pool?

                    } else if (this.declineCounterSet.size > this.pr.pool.length - this.pr.executableContract.state.data.poolQuorum ||
                        this.declineCounterSet.has(this.pr.poolIndexes.get(this.pr.ubot.network.myInfo.number))) {

                        // error
                        this.currentTask.cancel();

                        this.pr.logger.log("UBotAsmProcess_writeMultiStorage... ready, declined");
                        this.pr.errors.push(new ErrorRecord(Errors.FAILURE, "UBotAsmProcess_writeMultiStorage", "writing to multi-storage declined"));
                        this.pr.changeState(UBotPoolState.FAILED);
                    }
                }
            }
        } else {
            this.pr.logger.log("warning: UBotAsmProcess_writeMultiStorage - wrong notification received");
        }
    }
}

module.exports = {UBotAsmProcess_writeMultiStorage};