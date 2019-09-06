/*
 * Copyright (c) 2019-present Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

import {ScheduleExecutor, ExecutorWithFixedPeriod, ExecutorWithDynamicPeriod} from "executorservice";

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
        this.results = [];
        this.hashes = [];
        this.previous = [];
        this.cortege = new Set();
        this.excluded = new Set();
        this.hashesReady = false;
        this.otherAnswers = new Set();
        this.downloadAnswers = new Set();
        this.approveCounterFromOthersSets = [];
        this.declineCounterFromOthersSets = [];
        for (let i = 0; i < this.pr.pool.length; ++i) {
            this.approveCounterFromOthersSets.push(new Set());
            this.declineCounterFromOthersSets.push(new Set());
        }
        this.downloadAttempts = 0;
        this.commonCortegeIteration = 0;
        this.cortegeId = null;
        this.lastCortegesHash = null;
        this.getHashesTask = null;
        this.getPoolHashesTask = null;
        this.downloadTask = null;
        this.getCortegeIdTask = null;
        this.getCortegesTask = null;
        this.downloadEvent = new Promise(resolve => this.downloadFire = resolve);
        this.cortegeEvent = null;
        this.cortegeFire = null;
        this.corteges = [];
        this.iterationsCortege = [];
    }

    init(binToWrite, previousRecordId, storageData) {
        super.init(binToWrite, previousRecordId, storageData);
        this.verifyMethod = storageData.multistorage_verify_method;
    }

    async start() {
        this.pr.logger.log("start UBotAsmProcess_writeMultiStorage");

        // check self result
        if (!await this.verifyResult(this.binToWrite, this.previousRecordId, this.pr.ubot.network.myInfo.number)) {
            this.fail("failed self result verification");
            return;
        }

        // add self result and hash
        this.results[this.pr.selfPoolIndex] = this.binToWrite;
        this.hashes[this.pr.selfPoolIndex] = this.binHashId;
        this.previous[this.pr.selfPoolIndex] = this.previousRecordId;

        this.pulseGetHashes();
        this.getHashesTask = new ExecutorWithFixedPeriod(() => this.pulseGetHashes(),
            UBotConfig.multi_storage_vote_period, this.pr.ubot.executorService).run();
    }

    fail(error) {
        if (this.getHashesTask != null)
            this.getHashesTask.cancel();
        if (this.getPoolHashesTask != null)
            this.getPoolHashesTask.cancel();
        if (this.downloadTask != null)
            this.downloadTask.cancel();
        if (this.getCortegeIdTask != null)
            this.getCortegeIdTask.cancel();
        if (this.getCortegesTask != null)
            this.getCortegesTask.cancel();

        this.pr.logger.log("Error UBotAsmProcess_writeMultiStorage: " + error);
        this.pr.errors.push(new ErrorRecord(Errors.FAILURE, "UBotAsmProcess_writeMultiStorage", error));
        this.pr.changeState(UBotPoolState.FAILED);
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

    pulseGetCortegeId() {
        this.pr.logger.log("UBotAsmProcess_writeMultiStorage... pulseGetCortegeId");
        for (let i = 0; i < this.pr.pool.length; ++i)
            if (this.pr.pool[i].number !== this.pr.ubot.network.myInfo.number && !this.otherAnswers.has(this.pr.pool[i].number))
                this.pr.ubot.network.deliver(this.pr.pool[i],
                    new UBotCloudNotification_asmCommand(
                        this.pr.ubot.network.myInfo,
                        this.pr.poolId,
                        this.cmdStack,
                        UBotCloudNotification_asmCommand.types.MULTI_STORAGE_GET_CORTEGE_HASHID,
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
            this.pr.logger.log("UBotAsmProcess_writeMultiStorage... limit of attempts to download result reached");
            this.downloadTask.cancel();

            if (this.cortege.size >= this.quorumSize)
                this.downloadFire();
            else
                this.fail("consensus was broken when downloading result");
            return;
        }

        for (let i = 0; i < this.pr.pool.length; ++i)
            if (!this.downloadAnswers.has(i)) {
                this.pr.ubot.network.getMultiStorageResult(this.pr.pool[i], this.hashes[i],
                    async (result) => {
                        let resultHash = crypto.HashId.of(result);

                        if (!resultHash.equals(this.hashes[i]) || !await this.verifyResult(result, this.previousRecordId, this.pr.pool[i].number)) {
                            this.excluded.add(i);
                            if (this.excluded.size > this.pr.pool.length - this.quorumSize)
                                this.fail("consensus was broken when downloading result");
                        } else {
                            this.cortege.add(i);
                            this.results[i] = result;

                            // put downloaded result to cache
                            this.pr.ubot.resultCache.put(resultHash, result);
                        }

                        this.downloadAnswers.add(i);
                        if (this.downloadAnswers.size >= this.pr.pool.length) {
                            this.pr.logger.log("UBotAsmProcess_writeMultiStorage... results downloaded");
                            this.downloadTask.cancel();
                            this.downloadFire();
                        }
                    },
                    respCode => this.pr.logger.log("warning: pulseDownload respCode = " + respCode)
                );
            }
    }

    pulseGetCorteges() {
        this.pr.logger.log("UBotAsmProcess_writeMultiStorage... pulseGetCorteges");

        Array.from(this.cortege).filter(
            ubot => ubot !== this.pr.selfPoolIndex && !this.otherAnswers.has(this.pr.pool[ubot].number)
        ).forEach(ubot =>
            this.pr.ubot.network.deliver(this.pr.pool[ubot],
                new UBotCloudNotification_asmCommand(
                    this.pr.ubot.network.myInfo,
                    this.pr.poolId,
                    this.cmdStack,
                    UBotCloudNotification_asmCommand.types.MULTI_STORAGE_GET_CORTEGES,
                    null,
                    null,
                    false,
                    true,
                    this.commonCortegeIteration
                )
            )
        );
    }

    async verifyResult(result, previousRecordId, ubotNumber) {
        if (this.verifyMethod == null)
            return true;

        let current = await Boss.load(result);
        let previous = null;
        if (previousRecordId != null)
            previous = await this.pr.ubot.getStorageResultByRecordId(previousRecordId, true, ubotNumber);

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
        let poolId = this.pr.poolId.digest;
        let cortegeId = this.cortegeId.digest;
        let concat = new Uint8Array(poolId.length + cortegeId.length +
            (this.previousRecordId != null ? this.previousRecordId.digest.length : 0));
        concat.set(poolId, 0);
        concat.set(cortegeId, poolId.length);
        if (this.previousRecordId != null)
            concat.set(this.previousRecordId.digest, poolId.length + cortegeId.length);

        this.recordId = crypto.HashId.of(concat);
    }

    generateCortegeId() {
        let concat = new Uint8Array(this.cortege.size * this.binHashId.digest.length);

        for (let i = 0; i < this.pr.pool.length; i++)
            if (this.cortege.has(i))
                concat.set(this.hashes[i], i * this.binHashId.digest.length);

        this.cortegeId = crypto.HashId.of(concat);
    }

    getCortegesHash() {
        let cortege = Array.from(this.cortege).sort((a, b) => a - b);
        let jsonCorteges = JSON.stringify(cortege);

        cortege.filter(ubot => ubot !== this.pr.selfPoolIndex).forEach(ubot =>
            jsonCorteges += JSON.stringify(Array.from(this.corteges[ubot]).sort((a, b) => a - b))
        );

        return crypto.HashId.of(jsonCorteges);
    }

    checkCortege() {
        this.pr.logger.log("UBotAsmProcess_writeMultiStorage: check cortege");

        // generate common hash
        let concat = new Uint8Array(this.pr.pool.length * this.binHashId.digest.length);

        for (let i = 0; i < this.pr.pool.length; i++) {
            // check previous ID equals
            if (!t.valuesEqual(this.previousRecordId, this.previous[i]))
                return false;

            concat.set(this.hashes[i], i * this.binHashId.digest.length);
        }

        this.cortegeId = crypto.HashId.of(concat);

        this.otherAnswers.clear();
        this.pulseGetCortegeId();
        this.getCortegeIdTask = new ExecutorWithFixedPeriod(() => this.pulseGetCortegeId(),
            UBotConfig.multi_storage_vote_period, this.pr.ubot.executorService).run();

        return true;    // true - indicates start checking
    }

    async checkResults() {
        this.pr.logger.log("UBotAsmProcess_writeMultiStorage... wait results");

        await this.downloadEvent;
        this.pr.logger.log("UBotAsmProcess_writeMultiStorage... results received");

        if (this.cortege.size >= this.pr.pool.length)
            await this.approveCortege(true);
        else
            new ScheduleExecutor(() => this.analyzeCortege(), 0, this.pr.ubot.executorService).run();
    }

    async approveCortege(fullCortege) {
        this.pr.logger.log("UBotAsmProcess_writeMultiStorage... approve cortege");
        this.generateSelfRecordID();

        let cortege = new Map();
        if (fullCortege)
            this.results.forEach((res, i) => cortege.set(this.pr.pool[i].number, res));
        else
            this.results.filter((res, i) => this.cortege.has(i)).forEach((res, i) => cortege.set(this.pr.pool[i].number, res));

        // put result to cache
        this.pr.ubot.resultCache.put(this.recordId, cortege);

        try {
            //TODO: replace on multi-insert
            for (let i = 0; i < this.pr.pool.length; i++)
                if (fullCortege || this.cortege.has(i))
                    await this.pr.ledger.writeToMultiStorage(this.pr.executableContract.id, this.storageName, this.results[i],
                        this.hashes[i], this.recordId, this.pr.pool[i].number);
            if (this.previousRecordId != null)
                await this.pr.ledger.deleteFromMultiStorage(this.previousRecordId);
        } catch (err) {
            this.fail("error writing to multi-storage: " + err.message);
            return;
        }
        this.pr.logger.log("UBotAsmProcess_writeMultiStorage... cortege approved");

        this.asmProcessor.var0 = this.recordId.digest;
        this.onReady();
    }

    analyzeCortege() {
        this.pr.logger.log("UBotAsmProcess_writeMultiStorage: analyze cortege");

        for (let i = 0; i < this.pr.pool.length; ++i) {
            // votes for itself
            this.approveCounterFromOthersSets[i].add(this.pr.ubot.network.myInfo.number);
            this.approveCounterFromOthersSets[i].add(this.pr.pool[i].number);
        }

        this.pulseGetPoolHashes(true);
        this.getPoolHashesTask = new ExecutorWithFixedPeriod(() => this.pulseGetPoolHashes(),
            UBotConfig.multi_storage_vote_period, this.pr.ubot.executorService).run();
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
            this.approveCounterSet.has(this.pr.selfPoolIndex) &&
            this.approveCounterFromOthersSets.every((approveSet, i) =>
                approveSet.size + this.declineCounterFromOthersSets[i].size === this.pr.pool.length)) {

            // ok
            this.getPoolHashesTask.cancel();

            new ScheduleExecutor(() => this.searchCommonCortege(), 0, this.pr.ubot.executorService).run();

        } else if (this.declineCounterSet.size > this.pr.pool.length - this.quorumSize ||
            this.declineCounterSet.has(this.pr.selfPoolIndex)) {

            // error
            this.getPoolHashesTask.cancel();

            this.fail("writing cortege declined");
        }
    }

    async searchCommonCortege() {
        this.pr.logger.log("UBotAsmProcess_writeMultiStorage... searchCommonCortege wait results");

        await this.downloadEvent;
        this.pr.logger.log("UBotAsmProcess_writeMultiStorage... searchCommonCortege results received");

        // calculate intersection cortege members and downloaded results
        this.declineCounterSet.forEach(decline => this.cortege.delete(decline));

        // recursive calculate common cortege
        if (await this.calculateCommonCortege())
            await this.approveCortege(false);
        else
            this.fail("failed searching common cortege");
    }

    async calculateCommonCortege() {
        this.pr.logger.log("UBotAsmProcess_writeMultiStorage... calculateCommonCortege iteration: " + this.commonCortegeIteration);
        this.pr.logger.log("UBotAsmProcess_writeMultiStorage... self cortege = " + JSON.stringify(Array.from(this.cortege)));

        this.iterationsCortege[this.commonCortegeIteration] = new Set(this.cortege);

        this.cortegeEvent = new Promise(resolve => this.cortegeFire = resolve);

        this.otherAnswers.clear();
        this.pulseGetCorteges();
        this.getCortegesTask = new ExecutorWithFixedPeriod(() => this.pulseGetCorteges(),
            UBotConfig.multi_storage_vote_period, this.pr.ubot.executorService).run();

        // wait corteges
        await this.cortegeEvent;

        // check corteges equality
        if (Array.from(this.cortege).every(ubot =>
            ubot === this.pr.selfPoolIndex || t.valuesEqual(this.cortege, this.corteges[ubot])
        )) {
            this.generateCortegeId();
            return true;
        }

        let cortegesHash = this.getCortegesHash();
        if (this.lastCortegesHash != null) {
            if (this.lastCortegesHash.equals(cortegesHash)) {
                this.pr.logger.log("Error UBotAsmProcess_writeMultiStorage: cortege has not changed during the iteration, consensus not found");
                this.pr.errors.push(new ErrorRecord(Errors.FAILURE, "UBotAsmProcess_writeMultiStorage",
                    "cortege has not changed during the iteration, consensus not found"));
                return false;
            }
        } else
            this.lastCortegesHash = cortegesHash;

        // analyze corteges
        //this.cortege

        this.commonCortegeIteration++;
        return await this.calculateCommonCortege();
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

                        this.downloadAnswers.add(this.pr.selfPoolIndex);
                        this.cortege.add(this.pr.selfPoolIndex);

                        this.downloadTask = new ExecutorWithDynamicPeriod(() => this.pulseDownload(),
                            UBotConfig.multi_storage_download_periods, this.pr.ubot.executorService).run();

                        if (!this.checkCortege())
                            new ScheduleExecutor(() => this.analyzeCortege(), 0, this.pr.ubot.executorService).run();
                    }
                }

            } else if (notification.type === UBotCloudNotification_asmCommand.types.MULTI_STORAGE_GET_CORTEGE_HASHID) {
                if (!notification.isAnswer) {
                    if (this.cortegeId != null)
                        this.pr.ubot.network.deliver(notification.from,
                            new UBotCloudNotification_asmCommand(
                                this.pr.ubot.network.myInfo,
                                this.pr.poolId,
                                this.cmdStack,
                                UBotCloudNotification_asmCommand.types.MULTI_STORAGE_GET_CORTEGE_HASHID,
                                this.cortegeId,
                                null,
                                true,
                                true
                            )
                        );
                } else if (this.getCortegeIdTask != null && !this.getCortegeIdTask.cancelled) {
                    if (!this.cortegeId.equals(notification.dataHashId)) {
                        this.getCortegeIdTask.cancel();
                        new ScheduleExecutor(() => this.analyzeCortege(), 0, this.pr.ubot.executorService).run();
                    } else {
                        this.otherAnswers.add(notification.from.number);

                        if (this.otherAnswers.size >= this.pr.pool.length - 1) {
                            this.getCortegeIdTask.cancel();

                            new ScheduleExecutor(() => this.checkResults(), 0, this.pr.ubot.executorService).run();
                        }
                    }
                }

            } else if (notification.type === UBotCloudNotification_asmCommand.types.MULTI_STORAGE_GET_POOL_HASHES) {
                if (!notification.isAnswer) {
                    if (notification.dataUbotInPool === -1) {
                        for (let i = 0; i < this.pr.pool.length; i++)
                            if (this.pr.selfPoolIndex !== i && this.hashes[i] != null)
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
            } else if (notification.type === UBotCloudNotification_asmCommand.types.MULTI_STORAGE_GET_CORTEGES) {
                if (!notification.isAnswer) {
                    if (this.iterationsCortege[notification.dataUbotInPool] != null)
                        this.pr.ubot.network.deliver(notification.from,
                            new UBotCloudNotification_asmCommand(
                                this.pr.ubot.network.myInfo,
                                this.pr.poolId,
                                this.cmdStack,
                                UBotCloudNotification_asmCommand.types.MULTI_STORAGE_GET_CORTEGES,
                                await Boss.dump(this.iterationsCortege[notification.dataUbotInPool]),   //TODO: for > 200 ubots in pool need HTTP request
                                null,
                                true,
                                true,
                                notification.dataUbotInPool
                            )
                        );
                } else if (this.getCortegesTask != null && !this.getCortegesTask.cancelled &&
                    notification.dataUbotInPool === this.commonCortegeIteration) {

                    this.corteges[this.pr.poolIndexes.get(notification.from.number)] = await Boss.load(notification.dataHashId);
                    //TODO: for > 200 ubots in pool need HTTP request (check marker)

                    this.otherAnswers.add(notification.from.number);

                    if (this.otherAnswers.size >= this.cortege.size - 1) {
                        this.getCortegesTask.cancel();
                        this.cortegeFire();
                    }
                }
            }
        } else {
            this.pr.logger.log("warning: UBotAsmProcess_writeMultiStorage - wrong notification received");
        }
    }
}

module.exports = {UBotAsmProcess_writeMultiStorage};