/*
 * Copyright (c) 2019 Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

import {ExecutorWithFixedPeriod, ExecutorWithDynamicPeriod} from "executorservice";

const UBotAsmProcess_writeSingleStorage = require("ubot/processes/UBotAsmProcess_writeSingleStorage").UBotAsmProcess_writeSingleStorage;
const UBotConfig = require("ubot/ubot_config").UBotConfig;
const ErrorRecord = require("errors").ErrorRecord;
const Errors = require("errors").Errors;
const UBotPoolState = require("ubot/ubot_pool_state").UBotPoolState;
const UBotCloudNotification_asmCommand = require("ubot/ubot_notification").UBotCloudNotification_asmCommand;
const Boss = require('boss.js');
const t = require("tools");

class UBotAsmProcess_writeMultiStorage extends UBotAsmProcess_writeSingleStorage {
    constructor(processor, onReady, asmProcessor, cmdStack) {
        super(processor, onReady, asmProcessor, cmdStack);
        this.hashes = [];
        this.previous = [];
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

    init(binToWrite, previousRecordId, storageData) {
        super.init(binToWrite, previousRecordId, storageData);
        this.verifyMethod = storageData.multistorage_verify_method;
    }

    async start() {
        this.pr.logger.log("start UBotAsmProcess_writeMultiStorage");

        // check self result
        if (!await this.verifyResult(this.binToWrite, this.previousRecordId)) {
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
        // add self hash and previousRecordId
        this.hashes[this.pr.poolIndexes.get(this.pr.ubot.network.myInfo.number)] = this.binHashId;
        this.previous[this.pr.poolIndexes.get(this.pr.ubot.network.myInfo.number)] = this.previousRecordId;

        this.pulseGetHashes();
        this.getHashesTask = new ExecutorWithFixedPeriod(() => this.pulseGetHashes(),
            UBotConfig.multi_storage_vote_period, this.pr.ubot.executorService).run();
    }

    pulseGetHashes() {
        this.pr.logger.log("UBotAsmProcess_writeMultiStorage... pulseGetHashes");
        for (let i = 0; i < this.pr.pool.length; ++i)
            if (this.pr.pool[i].number !== this.pr.ubot.network.myInfo.number && !this.otherAnswers.has(this.pr.pool[i].number))
                this.pr.ubot.network.deliver(this.pr.pool[i],
                    new UBotCloudNotification_asmCommand(
                        this.pr.ubot.network.myInfo,
                        this.pr.poolId,
                        this.cmdStack,
                        UBotCloudNotification_asmCommand.types.MULTI_STORAGE_GET_DATA_HASHID,
                        null,
                        null,
                        false,
                        true
                    )
                );
    }

    pulseGetPoolHashes(first = false) {
        this.pr.logger.log("UBotAsmProcess_writeMultiStorage... pulseGetPoolHashes");
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
                            null,
                            false,
                            true
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
                                    null,
                                    false,
                                    true,
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
            if (this.approveCounterSet.has(i) && !this.otherAnswers.has(this.pr.pool[i].number)) {
                let recordId = this.generateRecordID(this.hashes[i], this.pr.pool[i].number, this.previous[i]);

                this.pr.ubot.network.getMultiStorageResult(this.pr.pool[i], recordId,
                    async (result) => {
                        let resultHash = crypto.HashId.of(result);
                        let error = false;
                        if (!resultHash.equals(this.hashes[i]))  {
                            this.pr.logger.log("Error UBotAsmProcess_writeMultiStorage: download result checking failed");
                            this.pr.errors.push(new ErrorRecord(Errors.FAILURE, "UBotAsmProcess_writeMultiStorage",
                                "download result checking failed"));
                            error = true;

                        } else if (!await this.verifyResult(result, this.previous[i])) {
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
                            // put downloaded result to cache
                            this.pr.ubot.resultCache.put(recordId, result);

                            try {
                                await this.pr.ledger.writeToMultiStorage(this.pr.executableContract.id, this.storageName,
                                    result, resultHash, recordId, this.pr.pool[i].number);
                                if (this.previous[i] != null)
                                    await this.pr.ledger.deleteFromMultiStorage(this.previous[i]);
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
                                this.downloadTask.cancel();
                                this.onReady();
                                // TODO: distribution multi-storage to all ubots after closing pool...
                            }
                        }
                    },
                    respCode => this.pr.logger.log("warning: pulseDownload respCode = " + respCode)
                );
            }
    }

    async verifyResult(result, previousRecordId) {
        if (this.verifyMethod == null)
            return true;

        let current = await Boss.load(result);
        let previous = null;
        if (previousRecordId != null)
            previous = await Boss.load(await this.pr.ubot.getStorageResult(previousRecordId));

        return new Promise(resolve => {
            let verifyProcess = new this.pr.ProcessStartExec(this.pr, (output) => {
                this.pr.logger.log("verifyResult onReady, verifyMethod: " + this.verifyMethod + ", verifyResult: " + output);
                resolve(output);
            });

            verifyProcess.var0 = current;   // current record
            verifyProcess.var1 = previous;  // previous record

            verifyProcess.start(this.verifyMethod, true);
        });
    }

    generateSelfRecordID() {
        this.recordId = this.generateRecordID(this.binHashId, this.pr.ubot.network.myInfo.number, this.previousRecordId);
    }

    generateRecordID(hash, ubotNumber, previousRecordId) {
        let poolId = this.pr.poolId.digest;
        let binHashId = hash.digest;
        let concat = new Uint8Array(poolId.length + binHashId.length + 4 +
            ((previousRecordId != null) ? previousRecordId.digest.length : 0));

        for (let i = 0 ; i < 4; i++) {
            concat[i] = ubotNumber % 256;
            ubotNumber >>= 8;
        }
        concat.set(poolId, 4);
        concat.set(binHashId, poolId.length + 4);
        if (previousRecordId != null)
            concat.set(previousRecordId.digest, poolId.length + binHashId.length + 4);

        return crypto.HashId.of(concat);
    }

    async vote(notification) {
        let message = "UBotAsmProcess_writeMultiStorage... vote {from: " + notification.from.number +
            ", ubot: " + this.pr.pool[notification.dataUbotInPool].number + ", result: ";

        if (this.hashes[notification.dataUbotInPool].equals(notification.dataHashId) &&
            t.valuesEqual(this.previous[notification.dataUbotInPool], notification.previousRecordId)) {
            this.approveCounterFromOthersSets[notification.dataUbotInPool].add(notification.from.number);
            message += "approve";
        } else {
            this.declineCounterFromOthersSets[notification.dataUbotInPool].add(notification.from.number);
            message += "decline";
        }

        message += "}";
        this.pr.logger.log(message);

        if (this.approveCounterFromOthersSets[notification.dataUbotInPool].size >= this.quorumSize)
            this.approveCounterSet.add(notification.dataUbotInPool);
        else if (this.declineCounterFromOthersSets[notification.dataUbotInPool].size > this.pr.pool.length - this.quorumSize)
            this.declineCounterSet.add(notification.dataUbotInPool);

        if (this.approveCounterSet.size >= this.quorumSize &&
            this.approveCounterSet.has(this.pr.poolIndexes.get(this.pr.ubot.network.myInfo.number)) &&
            this.approveCounterFromOthersSets.every((approveSet, i) =>
                approveSet.size + this.declineCounterFromOthersSets[i].size === this.pr.pool.length)) {

            // ok
            this.getPoolHashesTask.cancel();

            try {
                await this.pr.ledger.writeToMultiStorage(this.pr.executableContract.id, this.storageName, this.binToWrite,
                    this.binHashId, this.recordId, this.pr.ubot.network.myInfo.number);
                if (this.previousRecordId != null)
                    await this.pr.ledger.deleteFromMultiStorage(this.previousRecordId);
            } catch (err) {
                this.pr.logger.log("error: UBotAsmProcess_writeMultiStorage: " + err.message);
                this.pr.errors.push(new ErrorRecord(Errors.FAILURE, "UBotAsmProcess_writeMultiStorage",
                    "error writing to multi-storage: " + err.message));
                this.pr.changeState(UBotPoolState.FAILED);
                return;
            }
            this.pr.logger.log("UBotAsmProcess_writeMultiStorage... hashes approved");

            this.asmProcessor.var0 = this.recordId.digest;

            // distribution multi-storage in pool
            this.otherAnswers.clear();
            this.otherAnswers.add(this.pr.ubot.network.myInfo.number);

            this.downloadTask = new ExecutorWithDynamicPeriod(() => this.pulseDownload(),
                UBotConfig.multi_storage_download_periods, this.pr.ubot.executorService).run();

        } else if (this.declineCounterSet.size > this.pr.pool.length - this.quorumSize ||
            this.declineCounterSet.has(this.pr.poolIndexes.get(this.pr.ubot.network.myInfo.number))) {

            // error
            this.getPoolHashesTask.cancel();

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
                            this.previousRecordId,
                            true,
                            this.previousRecordId == null
                        )
                    );
                } else if (!this.hashesReady) {
                    this.otherAnswers.add(notification.from.number);
                    this.hashes[this.pr.poolIndexes.get(notification.from.number)] = notification.dataHashId;
                    this.previous[this.pr.poolIndexes.get(notification.from.number)] = notification.previousRecordId;

                    if (this.otherAnswers.size >= this.pr.pool.length - 1) {
                        this.hashesReady = true;
                        this.getHashesTask.cancel();
                        this.pr.logger.log("UBotAsmProcess_writeMultiStorage: get pool hashes");
                        this.pulseGetPoolHashes(true);
                        this.getPoolHashesTask = new ExecutorWithFixedPeriod(() => this.pulseGetPoolHashes(),
                            UBotConfig.multi_storage_vote_period, this.pr.ubot.executorService).run();
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
                                        this.previous[i],
                                        true,
                                        this.previous[i] == null,
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
                                this.previous[notification.dataUbotInPool],
                                true,
                                this.previous[notification.dataUbotInPool] == null,
                                notification.dataUbotInPool
                            )
                        );

                } else if (this.getPoolHashesTask != null && !this.getPoolHashesTask.cancelled)
                    await this.vote(notification);
            }
        } else {
            this.pr.logger.log("warning: UBotAsmProcess_writeMultiStorage - wrong notification received");
        }
    }
}

module.exports = {UBotAsmProcess_writeMultiStorage};