const UBotAsmProcess_writeSingleStorage = require("ubot/processes/UBotAsmProcess_writeSingleStorage").UBotAsmProcess_writeSingleStorage;
const UBotConfig = require("ubot/ubot_config").UBotConfig;
const ExecutorWithFixedPeriod = require("executorservice").ExecutorWithFixedPeriod;
const ErrorRecord = require("errors").ErrorRecord;
const Errors = require("errors").Errors;
const UBotPoolState = require("ubot/ubot_pool_state").UBotPoolState;
const UBotCloudNotification_asmCommand = require("ubot/ubot_notification").UBotCloudNotification_asmCommand;

class UBotAsmProcess_writeMultiStorage extends UBotAsmProcess_writeSingleStorage {
    constructor(processor, onReady, asmProcessor, cmdIndex, storageName = "default") {
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

        this.storageName = storageName;
        if (this.pr.executableContract.state.data.cloud_storages.hasOwnProperty(this.storageName)) {
            this.poolSize = this.pr.executableContract.state.data.cloud_storages[this.storageName].pool.size;
            this.quorumSize = this.pr.executableContract.state.data.cloud_storages[this.storageName].quorum.size;
        } else {
            this.poolSize = this.pr.poolSize;
            this.quorumSize = this.pr.quorumSize;
        }
    }

    start() {
        this.pr.logger.log("start UBotAsmProcess_writeMultiStorage");
        for (let i = 0; i < this.pr.pool.length; ++i) {
            // votes for itself
            this.approveCounterFromOthersSets[i].add(this.pr.ubot.network.myInfo.number);
            this.approveCounterFromOthersSets[i].add(this.pr.pool[i].number);
        }
        // add self hash
        this.hashes[this.pr.poolIndexes.get(this.pr.ubot.network.myInfo.number)] = this.binHashId;

        this.pulseGetHashes();
        this.currentTask = new ExecutorWithFixedPeriod(() => {
            this.pulseGetHashes();
        }, UBotConfig.multi_storage_vote_period, this.pr.ubot.executorService).run();
    }

    pulseGetHashes() {
        for (let i = 0; i < this.pr.pool.length; ++i)
            if (this.pr.pool[i].number !== this.pr.ubot.network.myInfo.number && !this.otherAnswers.has(this.pr.pool[i].number))
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

    pulseGetPoolHashes(first = false) {
        for (let i = 0; i < this.pr.pool.length; ++i)
            if (this.pr.pool[i].number !== this.pr.ubot.network.myInfo.number) {
                if (first)
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
                else
                    for (let j = 0; j < this.pr.pool.length; ++j)
                        if (!this.approveCounterFromOthersSets[j].has(this.pr.pool[i].number) &&
                            !this.declineCounterFromOthersSets[j].has(this.pr.pool[i].number))
                            this.pr.ubot.network.deliver(this.pr.pool[i],
                                new UBotCloudNotification_asmCommand(
                                    this.pr.ubot.network.myInfo,
                                    this.pr.poolId,
                                    this.cmdIndex,
                                    UBotCloudNotification_asmCommand.types.MULTI_STORAGE_GET_POOL_HASHES,
                                    null,
                                    false,
                                    j
                                )
                            );
            }
    }

    generateRecordID() {
        let poolId = this.pr.poolId.digest;
        let binHashId = this.binHashId.digest;
        let ubotNumber = this.pr.ubot.network.myInfo.number;
        let concat = new Uint8Array(poolId.length + binHashId.length + 4);

        for (let i = 0 ; i < 4; i++) {
            concat[i] = ubotNumber % 256;
            ubotNumber >>= 8;
        }
        concat.set(poolId, 4);
        concat.set(binHashId, poolId.length + 4);
        //TODO: add previous_record_id

        return crypto.HashId.of(concat);
    }

    async vote(notification) {
        if (this.hashes[notification.dataUbotInPool].equals(notification.dataHashId))
            this.approveCounterFromOthersSets[notification.dataUbotInPool].add(notification.from.number);
        else
            this.declineCounterFromOthersSets[notification.dataUbotInPool].add(notification.from.number);

        if (this.approveCounterFromOthersSets[notification.dataUbotInPool].size >= this.quorumSize)
            this.approveCounterSet.add(notification.dataUbotInPool);
        else if (this.declineCounterFromOthersSets[notification.dataUbotInPool].size > this.pr.pool.length - this.quorumSize)
            this.declineCounterSet.add(notification.dataUbotInPool);

        if (this.approveCounterSet.size >= this.quorumSize &&
            this.approveCounterSet.has(this.pr.poolIndexes.get(this.pr.ubot.network.myInfo.number)) &&
            this.approveCounterFromOthersSets.every((approveSet, i) =>
                approveSet.size + this.declineCounterFromOthersSets[i].size === this.pr.pool.length)) {

            // ok
            this.currentTask.cancel();

            let recordId = this.generateRecordID();
            try {
                await this.pr.ledger.writeToMultiStorage(this.pr.executableContract.id, this.storageName, this.binToWrite,
                    recordId, this.pr.ubot.network.myInfo.number);
            } catch (err) {
                this.pr.logger.log("error: UBotAsmProcess_writeMultiStorage: " + err.message);
                this.pr.errors.push(new ErrorRecord(Errors.FAILURE, "UBotAsmProcess_writeMultiStorage",
                    "error writing to multi-storage: " + err.message));
                this.pr.changeState(UBotPoolState.FAILED);
                return;
            }
            this.pr.logger.log("UBotAsmProcess_writeMultiStorage... ready, approved");

            this.pr.var0 = recordId.digest;
            this.onReady();
            // TODO: distribution multi-storage to all ubots here or after closing pool?

        } else if (this.declineCounterSet.size > this.pr.pool.length - this.quorumSize ||
            this.declineCounterSet.has(this.pr.poolIndexes.get(this.pr.ubot.network.myInfo.number))) {

            // error
            this.currentTask.cancel();

            this.pr.logger.log("UBotAsmProcess_writeMultiStorage... ready, declined");
            this.pr.errors.push(new ErrorRecord(Errors.FAILURE, "UBotAsmProcess_writeMultiStorage", "writing to multi-storage declined"));
            this.pr.changeState(UBotPoolState.FAILED);
        }
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
                } else if (!this.hashesReady) {
                    this.otherAnswers.add(notification.from.number);
                    this.hashes[this.pr.poolIndexes.get(notification.from.number)] = notification.dataHashId;

                    if (this.otherAnswers.size >= this.pr.pool.length - 1) {
                        this.hashesReady = true;
                        this.currentTask.cancel();
                        this.pr.logger.log("UBotAsmProcess_writeMultiStorage: get pool hashes");
                        this.pulseGetPoolHashes(true);
                        this.currentTask = new ExecutorWithFixedPeriod(() => {
                            this.pulseGetPoolHashes();
                        }, UBotConfig.multi_storage_vote_period, this.pr.ubot.executorService).run();
                    }
                }

            } else if (notification.type === UBotCloudNotification_asmCommand.types.MULTI_STORAGE_GET_POOL_HASHES) {
                if (!notification.isAnswer) {
                    if (notification.dataUbotInPool === -1) {
                        for (let i = 0; i < this.pr.pool.length; i++)
                            if (this.pr.poolIndexes.get(this.pr.ubot.network.myInfo.number) !== i && this.hashes[i] != null)
                                this.pr.ubot.network.deliver(notification.from,
                                    new UBotCloudNotification_asmCommand(
                                        this.pr.ubot.network.myInfo,
                                        this.pr.poolId,
                                        this.cmdIndex,
                                        UBotCloudNotification_asmCommand.types.MULTI_STORAGE_GET_POOL_HASHES,
                                        this.hashes[i],
                                        true,
                                        i
                                    )
                                );
                    } else if (this.hashes[notification.dataUbotInPool] != null)
                        this.pr.ubot.network.deliver(notification.from,
                            new UBotCloudNotification_asmCommand(
                                this.pr.ubot.network.myInfo,
                                this.pr.poolId,
                                this.cmdIndex,
                                UBotCloudNotification_asmCommand.types.MULTI_STORAGE_GET_POOL_HASHES,
                                this.hashes[notification.dataUbotInPool],
                                true,
                                notification.dataUbotInPool
                            )
                        );

                } else if (!this.currentTask.cancelled)
                    await this.vote(notification);
            }
        } else {
            this.pr.logger.log("warning: UBotAsmProcess_writeMultiStorage - wrong notification received");
        }
    }
}

module.exports = {UBotAsmProcess_writeMultiStorage};