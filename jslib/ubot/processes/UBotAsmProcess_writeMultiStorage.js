import {ExecutorWithFixedPeriod, ExecutorWithDynamicPeriod} from "executorservice";

const UBotAsmProcess_writeSingleStorage = require("ubot/processes/UBotAsmProcess_writeSingleStorage").UBotAsmProcess_writeSingleStorage;
const UBotConfig = require("ubot/ubot_config").UBotConfig;
const ErrorRecord = require("errors").ErrorRecord;
const Errors = require("errors").Errors;
const UBotPoolState = require("ubot/ubot_pool_state").UBotPoolState;
const UBotCloudNotification_asmCommand = require("ubot/ubot_notification").UBotCloudNotification_asmCommand;
const Boss = require('boss.js');

class UBotAsmProcess_writeMultiStorage extends UBotAsmProcess_writeSingleStorage {
    constructor(processor, onReady, asmProcessor, cmdStack) {
        super(processor, onReady, asmProcessor, cmdStack);
        this.hashes = [];
        this.hashesReady = false;
        this.otherAnswers = new Set();
        this.approveCounterFromOthersSets = [];
        this.declineCounterFromOthersSets = [];
        for (let i = 0; i < this.pr.pool.length; ++i) {
            this.approveCounterFromOthersSets.push(new Set());
            this.declineCounterFromOthersSets.push(new Set());
        }
        this.downloadAttempts = 0;
    }

    init(binToWrite, storageData) {
        super.init(binToWrite, storageData);
        this.verifyMethod = storageData.multistorage_verify_method;
    }

    async start() {
        this.pr.logger.log("start UBotAsmProcess_writeMultiStorage");

        // check self result
        if (!await this.verifyResult(this.binToWrite)) {
            this.pr.logger.log("Error UBotAsmProcess_writeMultiStorage: failed self result verification");
            this.pr.errors.push(new ErrorRecord(Errors.FAILURE, "UBotAsmProcess_writeMultiStorage",
                "failed self result verification"));
            this.pr.changeState(UBotPoolState.FAILED);
            return;
        }

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
                        this.cmdStack,
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
                            this.cmdStack,
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
                                    this.cmdStack,
                                    UBotCloudNotification_asmCommand.types.MULTI_STORAGE_GET_POOL_HASHES,
                                    null,
                                    false,
                                    j
                                )
                            );
            }
    }

    pulseDownload() {
        this.downloadAttempts++;
        if (this.downloadAttempts > UBotConfig.maxResultDownloadAttempts) {
            this.pr.logger.log("Error UBotAsmProcess_writeMultiStorage: limit of attempts to download result reached");
            this.pr.errors.push(new ErrorRecord(Errors.FAILURE, "UBotAsmProcess_writeMultiStorage",
                "limit of attempts to download result reached"));
            this.pr.changeState(UBotPoolState.FAILED);
            return;
        }

        for (let i = 0; i < this.pr.pool.length; ++i)
            if (this.approveCounterSet.has(i) && !this.otherAnswers.has(this.pr.pool[i].number))
                this.pr.ubot.network.sendGetRequestToUbot(
                    this.pr.pool[i],
                    "/getMultiStorageResult/" + this.hashes[i].base64,
                    async (respCode, body) => {
                        if (respCode === 200) {
                            let resultHash = crypto.HashId.of(body);
                            let error = false;
                            if (!resultHash.equals(this.hashes[i]))  {
                                this.pr.logger.log("Error UBotAsmProcess_writeMultiStorage: download result checking failed");
                                this.pr.errors.push(new ErrorRecord(Errors.FAILURE, "UBotAsmProcess_writeMultiStorage",
                                    "download result checking failed"));
                                error = true;

                            } else if (!await this.verifyResult(body)) {
                                this.pr.logger.log("Error UBotAsmProcess_writeMultiStorage: failed result verification");
                                this.pr.errors.push(new ErrorRecord(Errors.FAILURE, "UBotAsmProcess_writeMultiStorage",
                                    "failed result verification"));
                                error = true;
                            }

                            if (error) {
                                this.otherAnswers.add(this.pr.pool[i].number);
                                this.approveCounterSet.delete(i);
                                if (this.approveCounterSet.size < this.quorumSize) {
                                    this.pr.logger.log("Error UBotAsmProcess_writeMultiStorage: consensus was broken when downloading result");
                                    this.pr.errors.push(new ErrorRecord(Errors.FAILURE, "UBotAsmProcess_writeMultiStorage",
                                        "consensus was broken when downloading result"));
                                    this.pr.changeState(UBotPoolState.FAILED);
                                }
                            } else {
                                let recordId = this.generateRecordID(resultHash, this.pr.pool[i].number);
                                try {
                                    await this.pr.ledger.writeToMultiStorage(this.pr.executableContract.id, this.storageName,
                                        body, resultHash, recordId, this.pr.pool[i].number);
                                } catch (err) {
                                    this.pr.logger.log("error: UBotAsmProcess_writeMultiStorage: " + err.message);
                                    this.pr.errors.push(new ErrorRecord(Errors.FAILURE, "UBotAsmProcess_writeMultiStorage",
                                        "error writing to multi-storage: " + err.message));
                                    this.pr.changeState(UBotPoolState.FAILED);
                                    return;
                                }
                                this.pr.logger.log("UBotAsmProcess_writeMultiStorage... write downloaded result");

                                this.otherAnswers.add(this.pr.pool[i].number);
                                if (this.otherAnswers.size >= this.approveCounterSet.size) {
                                    this.pr.logger.log("UBotAsmProcess_writeMultiStorage... all results wrote");
                                    this.currentTask.cancel();
                                    this.onReady();
                                    // TODO: distribution multi-storage to all ubots after closing pool...
                                }
                            }

                        } else {
                            this.pr.logger.log("warning: pulseDownload respCode = " + respCode);
                        }
                    }
                );
    }

    async verifyResult(result) {
        if (this.verifyMethod == null)
            return true;

        let current = await Boss.load(result);

        return new Promise(resolve => {
            let verifyProcess = new this.pr.ProcessStartExec(this.pr, (output) => {
                this.pr.logger.log("verifyResult onReady, verifyMethod: " + this.verifyMethod + ", verifyResult: " + output);
                resolve(output);
            });

            verifyProcess.var0 = current;   // current record
            verifyProcess.var1 = null;      // previous record

            verifyProcess.start(this.verifyMethod, true);
        });
    }

    generateRecordID(hash, ubotNumber) {
        let poolId = this.pr.poolId.digest;
        let binHashId = hash.digest;
        let concat = new Uint8Array(poolId.length + binHashId.length + 4);

        for (let i = 0 ; i < 4; i++) {
            concat[i] = ubotNumber % 256;
            ubotNumber >>= 8;
        }
        concat.set(poolId, 4);
        concat.set(binHashId, poolId.length + 4);

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

            let recordId = this.generateRecordID(this.binHashId, this.pr.ubot.network.myInfo.number);
            try {
                await this.pr.ledger.writeToMultiStorage(this.pr.executableContract.id, this.storageName, this.binToWrite,
                    this.binHashId, recordId, this.pr.ubot.network.myInfo.number);
            } catch (err) {
                this.pr.logger.log("error: UBotAsmProcess_writeMultiStorage: " + err.message);
                this.pr.errors.push(new ErrorRecord(Errors.FAILURE, "UBotAsmProcess_writeMultiStorage",
                    "error writing to multi-storage: " + err.message));
                this.pr.changeState(UBotPoolState.FAILED);
                return;
            }
            this.pr.logger.log("UBotAsmProcess_writeMultiStorage... hashes approved");

            this.asmProcessor.var0 = recordId.digest;

            // distribution multi-storage in pool
            this.otherAnswers.clear();
            this.otherAnswers.add(this.pr.ubot.network.myInfo.number);

            this.currentTask = new ExecutorWithDynamicPeriod(
                () => this.pulseDownload(), UBotConfig.multi_storage_download_periods, this.pr.ubot.executorService).run();

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
                            this.cmdStack,
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
                                        this.cmdStack,
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
                                this.cmdStack,
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