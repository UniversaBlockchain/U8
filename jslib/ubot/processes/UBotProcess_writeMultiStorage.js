/*
 * Copyright (c) 2019-present Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

import {ScheduleExecutor, ExecutorWithFixedPeriod, ExecutorWithDynamicPeriod} from "executorservice";

const UBotProcess_writeSingleStorage = require("ubot/processes/UBotProcess_writeSingleStorage").UBotProcess_writeSingleStorage;
const UBotConfig = require("ubot/ubot_config").UBotConfig;
const ErrorRecord = require("errors").ErrorRecord;
const Errors = require("errors").Errors;
const UBotPoolState = require("ubot/ubot_pool_state").UBotPoolState;
const UBotCloudNotification_process = require("ubot/ubot_notification").UBotCloudNotification_process;
const Boss = require('boss.js');
const t = require("tools");

const ACCURACY = 0.000001;

class UBotProcess_writeMultiStorage extends UBotProcess_writeSingleStorage {
    static states = {
        CHECKING:       {ordinal: 0},
        SELF_APPROVED:  {ordinal: 1},
        VOTE_APPROVED:  {ordinal: 2},
        VOTE_DECLINED:  {ordinal: 3},
        APPROVED:       {ordinal: 4},
        ANALYSIS:       {ordinal: 5}
    };

    constructor(processor, onReady, mainProcess, procIndex) {
        super(processor, onReady, mainProcess, procIndex);
        this.results = [];
        this.hashes = [];
        this.previous = [];
        this.cortege = new Set();
        this.excluded = new Set();
        this.otherAnswers = new Set();
        this.parallelAnswers = [];
        this.downloadAnswers = new Set();
        this.approveCounterFromOthersSets = [];
        this.declineCounterFromOthersSets = [];
        this.downloadAttempts = 0;
        this.commonCortegeIteration = 0;
        this.cortegeId = null;
        this.lastCortegesHash = null;
        this.getHashesTask = null;
        this.getPoolHashesTask = null;
        this.downloadTask = null;
        this.getCortegeIdTask = null;
        this.getCortegesTask = null;
        this.getCortegeIdsTask = null;
        this.getDecisionsTask = null;
        this.votingDecisionTask = null;
        this.votingExclusionSuspiciousTasks = [];
        this.downloadEvent = new Promise(resolve => this.downloadFire = resolve);
        this.cortegeEvent = null;
        this.cortegeFire = null;
        this.decisionsEvent = null;
        this.decisionsFire = null;
        this.votingExclusionSuspiciousEvents = [];
        this.votingExclusionSuspiciousFires = [];
        this.corteges = [];
        this.iterationsCortege = [];
        this.iterationsCortegesIds = [];
        this.iterationState = [];
        this.iterationsVoteLeave = [];
        this.suspicious = new Set();
        this.suspiciousRemovalCoefficients = [];
        this.leaveCounterSet = [];
        this.removeCounterSet = [];
        this.state = UBotProcess_writeMultiStorage.states.CHECKING;
    }

    async init(binToWrite, previousRecordId, storageData) {
        await super.init(binToWrite, previousRecordId, storageData);
        this.verifyMethod = storageData.multistorage_verify_method;
    }

    async start() {
        this.pr.logger.log("start UBotProcess_writeMultiStorage");

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
        if (this.getCortegeIdsTask != null)
            this.getCortegeIdsTask.cancel();
        if (this.getDecisionsTask != null)
            this.getDecisionsTask.cancel();
        if (this.votingDecisionTask != null)
            this.votingDecisionTask.cancel();
        for (let i = 0; i < this.pr.pool.length; ++i)
            if (this.votingExclusionSuspiciousTasks[i] != null)
                this.votingExclusionSuspiciousTasks[i].cancel();

        this.pr.logger.log("Error UBotProcess_writeMultiStorage: " + error);
        this.pr.errors.push(new ErrorRecord(Errors.FAILURE, "UBotProcess_writeMultiStorage", error));
        this.pr.changeState(UBotPoolState.FAILED);
    }

    pulseGetHashes() {
        this.pr.logger.log("UBotProcess_writeMultiStorage... pulseGetHashes. Answers = " + JSON.stringify(Array.from(this.otherAnswers)));
        for (let i = 0; i < this.pr.pool.length; ++i)
            if (this.pr.pool[i].number !== this.pr.ubot.network.myInfo.number && !this.otherAnswers.has(this.pr.pool[i].number))
                this.pr.ubot.network.deliver(this.pr.pool[i],
                    new UBotCloudNotification_process(
                        this.pr.ubot.network.myInfo,
                        this.pr.poolId,
                        this.procIndex,
                        UBotCloudNotification_process.types.MULTI_STORAGE_GET_DATA_HASHID,
                        { isAnswer: false }
                    )
                );
    }

    pulseGetCortegeId() {
        this.pr.logger.log("UBotProcess_writeMultiStorage... pulseGetCortegeId");
        for (let i = 0; i < this.pr.pool.length; ++i)
            if (this.pr.pool[i].number !== this.pr.ubot.network.myInfo.number && !this.otherAnswers.has(this.pr.pool[i].number))
                this.pr.ubot.network.deliver(this.pr.pool[i],
                    new UBotCloudNotification_process(
                        this.pr.ubot.network.myInfo,
                        this.pr.poolId,
                        this.procIndex,
                        UBotCloudNotification_process.types.MULTI_STORAGE_GET_CORTEGE_HASHID,
                        { isAnswer: false }
                    )
                );
    }

    pulseGetPoolHashes(first = false) {
        this.pr.logger.log("UBotProcess_writeMultiStorage... pulseGetPoolHashes");
        for (let i = 0; i < this.pr.pool.length; ++i)
            if (this.pr.pool[i].number !== this.pr.ubot.network.myInfo.number) {
                if (first)
                    this.pr.ubot.network.deliver(this.pr.pool[i],
                        new UBotCloudNotification_process(
                            this.pr.ubot.network.myInfo,
                            this.pr.poolId,
                            this.procIndex,
                            UBotCloudNotification_process.types.MULTI_STORAGE_GET_POOL_HASHES,
                            {
                                dataUbotInPool: -1,
                                isAnswer: false
                            }
                        )
                    );
                else
                    for (let j = 0; j < this.pr.pool.length; ++j)
                        if (!this.approveCounterFromOthersSets[j].has(this.pr.pool[i].number) &&
                            !this.declineCounterFromOthersSets[j].has(this.pr.pool[i].number))
                            this.pr.ubot.network.deliver(this.pr.pool[i],
                                new UBotCloudNotification_process(
                                    this.pr.ubot.network.myInfo,
                                    this.pr.poolId,
                                    this.procIndex,
                                    UBotCloudNotification_process.types.MULTI_STORAGE_GET_POOL_HASHES,
                                    {
                                        dataUbotInPool: j,
                                        isAnswer: false
                                    }
                                )
                            );
            }
    }

    pulseDownload() {
        this.downloadAttempts++;
        if (this.downloadAttempts > UBotConfig.maxResultDownloadAttempts) {
            this.pr.logger.log("UBotProcess_writeMultiStorage... limit of attempts to download result reached");
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
                            this.pr.logger.log("UBotProcess_writeMultiStorage... results downloaded");
                            this.downloadTask.cancel();
                            this.downloadFire();
                        }
                    },
                    respCode => this.pr.logger.log("warning: pulseDownload respCode = " + respCode)
                );
            }
    }

    pulseGetCorteges() {
        this.pr.logger.log("UBotProcess_writeMultiStorage... pulseGetCorteges");

        Array.from(this.cortege).filter(
            ubot => ubot !== this.pr.selfPoolIndex && !this.otherAnswers.has(this.pr.pool[ubot].number)
        ).forEach(ubot =>
            this.pr.ubot.network.deliver(this.pr.pool[ubot],
                new UBotCloudNotification_process(
                    this.pr.ubot.network.myInfo,
                    this.pr.poolId,
                    this.procIndex,
                    UBotCloudNotification_process.types.MULTI_STORAGE_GET_CORTEGES,
                    {
                        isAnswer: false,
                        commonCortegeIteration: this.commonCortegeIteration
                    }
                )
            )
        );
    }

    pulseGetCortegeIds() {
        this.pr.logger.log("UBotProcess_writeMultiStorage... pulseGetCortegeIds");

        Array.from(this.suspicious).filter(su => !this.approveCounterSet.has(su) && !this.declineCounterSet.has(su)).forEach(su => {
            Array.from(this.cortege).filter(u => u !== this.pr.selfPoolIndex && u !== su &&
                !this.approveCounterFromOthersSets[su].has(u) && !this.declineCounterFromOthersSets[su].has(u)).forEach(u =>

                this.pr.ubot.network.deliver(this.pr.pool[u],
                    new UBotCloudNotification_process(
                        this.pr.ubot.network.myInfo,
                        this.pr.poolId,
                        this.procIndex,
                        UBotCloudNotification_process.types.MULTI_STORAGE_GET_SUSPICIOUS_CORTEGE_HASHID,
                        {
                            isAnswer: false,
                            dataUbotInPool: su,
                            commonCortegeIteration: this.commonCortegeIteration
                        }
                    )
                )
            );
        });
    }

    pulseGetDecisions(iteration = -1) {
        this.pr.logger.log("UBotProcess_writeMultiStorage... pulseGetDecisions" + (iteration !== -1 ? ", iteration: " + iteration : ""));

        Array.from(this.cortege).filter(
            ubot => ubot !== this.pr.selfPoolIndex && !this.otherAnswers.has(this.pr.pool[ubot].number)
        ).forEach(ubot =>
            this.pr.ubot.network.deliver(this.pr.pool[ubot],
                new UBotCloudNotification_process(
                    this.pr.ubot.network.myInfo,
                    this.pr.poolId,
                    this.procIndex,
                    UBotCloudNotification_process.types.MULTI_STORAGE_GET_DECISIONS,
                    {
                        isAnswer: false,
                        commonCortegeIteration: iteration
                    }
                )
            )
        );
    }

    pulseVotingDecision(iteration = -1) {
        this.pr.logger.log("UBotProcess_writeMultiStorage... pulseVotingDecision" + (iteration !== -1 ? ", iteration: " + iteration : ""));

        Array.from(this.cortege).filter(
            ubot => ubot !== this.pr.selfPoolIndex && !this.otherAnswers.has(this.pr.pool[ubot].number)
        ).forEach(ubot =>
            this.pr.ubot.network.deliver(this.pr.pool[ubot],
                new UBotCloudNotification_process(
                    this.pr.ubot.network.myInfo,
                    this.pr.poolId,
                    this.procIndex,
                    UBotCloudNotification_process.types.MULTI_STORAGE_VOTE_DECISION,
                    {
                        isAnswer: false,
                        commonCortegeIteration: iteration
                    }
                )
            )
        );
    }

    pulseVotingExclusionSuspicious(suspect) {
        this.pr.logger.log("UBotProcess_writeMultiStorage... pulseVotingExclusionSuspicious, iteration: " +
            this.commonCortegeIteration + ", suspect: " + suspect);

        Array.from(this.cortege).filter(
            ubot => ubot !== this.pr.selfPoolIndex && !this.parallelAnswers[suspect].has(this.pr.pool[ubot].number)
        ).forEach(ubot =>
            this.pr.ubot.network.deliver(this.pr.pool[ubot],
                new UBotCloudNotification_process(
                    this.pr.ubot.network.myInfo,
                    this.pr.poolId,
                    this.procIndex,
                    UBotCloudNotification_process.types.MULTI_STORAGE_VOTE_EXCLUSION_SUSPICIOUS,
                    {
                        isAnswer: false,
                        commonCortegeIteration: this.commonCortegeIteration,
                        suspect: suspect
                    }
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
        if (this.previousRecordId != null && this.previousRecordId.equals(this.pr.getDefaultRecordId(true)))
            this.recordId = this.previousRecordId;   //executable contract id - default record id
        else {
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
    }

    generateCortegeId(full) {
        let concat = new Uint8Array((full ? this.pr.pool.length : this.cortege.size) * this.binHashId.digest.length);
        let sorted = [];

        if (full) {
            for (let i = 0; i < this.pr.pool.length; i++)
                sorted.push({
                    ubot_number: this.pr.pool[i].number,
                    hash: this.hashes[i]
                });
        } else
            this.cortege.forEach(ubot => sorted.push({
                ubot_number: this.pr.pool[ubot].number,
                hash: this.hashes[ubot]
            }));

        sorted.sort((a, b) => a.ubot_number - b.ubot_number);

        sorted.forEach((ubot, i) => concat.set(ubot.hash.digest, i * this.binHashId.digest.length));

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
        this.pr.logger.log("UBotProcess_writeMultiStorage: check cortege");

        for (let i = 0; i < this.pr.pool.length; i++)
            // check previous ID equals
            if (!t.valuesEqual(this.previousRecordId, this.previous[i]))
                return false;

        this.generateCortegeId(true);

        this.otherAnswers.clear();
        this.pulseGetCortegeId();
        this.getCortegeIdTask = new ExecutorWithFixedPeriod(() => this.pulseGetCortegeId(),
            UBotConfig.multi_storage_vote_period, this.pr.ubot.executorService).run();

        return true;    // true - indicates start checking
    }

    async checkResults() {
        this.pr.logger.log("UBotProcess_writeMultiStorage... wait results");

        await this.downloadEvent;
        this.pr.logger.log("UBotProcess_writeMultiStorage... results received");

        if (this.cortege.size >= this.pr.pool.length && await this.getDecision())
            await this.approveCortege(true);
        else
            new ScheduleExecutor(() => this.analyzeCortege(), 0, this.pr.ubot.executorService).run();
    }

    async getDecision() {
        if (this.state === UBotProcess_writeMultiStorage.states.ANALYSIS)
            this.pr.logger.log("UBotProcess_writeMultiStorage... get decision after analysis, iteration: " + this.commonCortegeIteration);
        else
            this.pr.logger.log("UBotProcess_writeMultiStorage... get decision");

        let iteration = -1;
        if (this.state === UBotProcess_writeMultiStorage.states.ANALYSIS) {
            this.iterationState[this.commonCortegeIteration] = UBotProcess_writeMultiStorage.states.SELF_APPROVED;
            iteration = this.commonCortegeIteration;
        } else
            this.state = UBotProcess_writeMultiStorage.states.SELF_APPROVED;

        this.decisionsEvent = new Promise(resolve => this.decisionsFire = resolve);

        this.otherAnswers.clear();
        this.pulseGetDecisions(iteration);
        this.getDecisionsTask = new ExecutorWithFixedPeriod(() => this.pulseGetDecisions(iteration),
            UBotConfig.multi_storage_vote_period, this.pr.ubot.executorService).run();

        // wait decision
        await this.decisionsEvent;

        this.decisionsEvent = new Promise(resolve => this.decisionsFire = resolve);

        this.otherAnswers.clear();
        this.approveCounterSet.clear();
        this.declineCounterSet.clear();
        this.approveCounterSet.add(this.pr.ubot.network.myInfo.number); // self vote
        this.pulseVotingDecision(iteration);
        this.votingDecisionTask = new ExecutorWithFixedPeriod(() => this.pulseVotingDecision(iteration),
            UBotConfig.multi_storage_vote_period, this.pr.ubot.executorService).run();

        // wait consensus decision
        return await this.decisionsEvent;
    }

    async approveCortege(fullCortege) {
        this.pr.logger.log("UBotProcess_writeMultiStorage... approve cortege");

        this.state = UBotProcess_writeMultiStorage.states.APPROVED;

        this.generateSelfRecordID();

        let cortege = new Map();
        if (fullCortege)
            this.results.forEach((res, i) => cortege.set(this.pr.pool[i].number, res));
        else
            this.results.filter((res, i) => this.cortege.has(i)).forEach((res, i) => cortege.set(this.pr.pool[i].number, res));

        // put result to cache
        this.pr.ubot.resultCache.put(this.recordId, cortege);

        try {
            if (this.previousRecordId != null)
                await this.pr.ledger.deleteFromMultiStorage(this.previousRecordId);
            //TODO: replace on multi-insert
            for (let i = 0; i < this.pr.pool.length; i++)
                if (fullCortege || this.cortege.has(i))
                    await this.pr.ledger.writeToMultiStorage(this.pr.executableContract.id, this.storageName, this.results[i],
                        this.hashes[i], this.recordId, this.pr.pool[i].number);

            await this.pr.session.updateStorage(this.cortegeId, true);
        } catch (err) {
            this.fail("error writing to multi-storage: " + err.message);
            return;
        }

        this.pr.logger.log("UBotProcess_writeMultiStorage... cortege approved");

        this.mainProcess.var0 = this.recordId.digest;
        this.onReady();
    }

    analyzeCortege() {
        this.pr.logger.log("UBotProcess_writeMultiStorage: analyze cortege");

        this.state = UBotProcess_writeMultiStorage.states.ANALYSIS;

        this.approveCounterSet.clear();
        this.declineCounterSet.clear();
        for (let i = 0; i < this.pr.pool.length; ++i) {
            // votes for itself
            this.approveCounterFromOthersSets.push(new Set([this.pr.ubot.network.myInfo.number, this.pr.pool[i].number]));
            this.declineCounterFromOthersSets.push(new Set());
        }

        this.pulseGetPoolHashes(true);
        this.getPoolHashesTask = new ExecutorWithFixedPeriod(() => this.pulseGetPoolHashes(),
            UBotConfig.multi_storage_vote_period, this.pr.ubot.executorService).run();
    }

    vote(notification) {
        let message = "UBotProcess_writeMultiStorage... vote {from: " + notification.from.number +
            ", ubot: " + this.pr.pool[notification.params.dataUbotInPool].number + ", result: ";

        if (this.hashes[notification.params.dataUbotInPool].equals(notification.params.dataHashId) &&
            t.valuesEqual(this.previous[notification.params.dataUbotInPool], notification.params.previousRecordId)) {
            this.approveCounterFromOthersSets[notification.params.dataUbotInPool].add(notification.from.number);
            message += "approve";
        } else {
            this.declineCounterFromOthersSets[notification.params.dataUbotInPool].add(notification.from.number);
            message += "decline";
        }

        message += "}";
        this.pr.logger.log(message);

        if (this.approveCounterFromOthersSets[notification.params.dataUbotInPool].size >= this.quorumSize)
            this.approveCounterSet.add(notification.params.dataUbotInPool);
        else if (this.declineCounterFromOthersSets[notification.params.dataUbotInPool].size > this.pr.pool.length - this.quorumSize)
            this.declineCounterSet.add(notification.params.dataUbotInPool);

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

    voteSuspiciousCortegeId(notification) {
        let message = "UBotProcess_writeMultiStorage... voteSuspiciousCortegeId {from: " + notification.from.number +
            ", ubot: " + this.pr.pool[notification.params.dataUbotInPool].number + ", result: ";

        if (this.iterationsCortegesIds[this.commonCortegeIteration][notification.params.dataUbotInPool].equals(notification.params.cortegeId)) {
            this.approveCounterFromOthersSets[notification.params.dataUbotInPool].add(notification.from.number);
            message += "approve";
        } else {
            this.declineCounterFromOthersSets[notification.params.dataUbotInPool].add(notification.from.number);
            message += "decline";
        }

        message += "}";
        this.pr.logger.log(message);

        if (this.approveCounterFromOthersSets[notification.params.dataUbotInPool].size >= this.quorumSize)
            this.approveCounterSet.add(notification.params.dataUbotInPool);
        else if (this.declineCounterFromOthersSets[notification.params.dataUbotInPool].size > this.cortege.size - this.quorumSize)
            this.declineCounterSet.add(notification.params.dataUbotInPool);

        // decision on all suspicious ubots complete
        if (this.approveCounterSet.size + this.declineCounterSet.size >= this.suspicious.size) {
            this.getCortegeIdsTask.cancel();
            this.cortegeFire();
        }
    }

    voteDecision(notification) {
        let res = notification.params.decision ? "approve" : "decline";

        if (notification.params.commonCortegeIteration === -1)
            this.pr.logger.log("UBotProcess_writeMultiStorage... voteDecision {from: " + notification.from.number +
                ", result: " + res + "}");
        else
            this.pr.logger.log("UBotProcess_writeMultiStorage... voteDecision {from: " + notification.from.number +
                ", iteration: " + this.commonCortegeIteration + ", result: " + res + "}");

        if (notification.params.decision) {
            this.approveCounterSet.add(notification.from.number);

            if (this.approveCounterSet.size >= this.quorumSize) {
                this.votingDecisionTask.cancel();

                if (notification.params.commonCortegeIteration === -1)
                    this.state = UBotProcess_writeMultiStorage.states.APPROVED;
                else
                    this.iterationState[this.commonCortegeIteration] = UBotProcess_writeMultiStorage.states.APPROVED;

                this.decisionsFire(true);
            }
        } else {
            this.declineCounterSet.add(notification.from.number);

            if (this.declineCounterSet.size > this.pr.pool.length - this.quorumSize) {
                this.votingDecisionTask.cancel();

                if (notification.params.commonCortegeIteration === -1)
                    this.state = UBotProcess_writeMultiStorage.states.ANALYSIS;
                else
                    this.iterationState[this.commonCortegeIteration] = UBotProcess_writeMultiStorage.states.ANALYSIS;

                this.decisionsFire(false);
            }
        }
    }

    voteExclusionSuspect(notification) {
        let res = notification.params.decision ? "remove" : "leave";

        this.pr.logger.log("UBotProcess_writeMultiStorage... voteExclusionSuspect {from: " + notification.from.number +
            ", iteration: " + this.commonCortegeIteration + ", suspect: " + notification.params.suspect + ", result: " + res + "}");

        if (notification.params.decision) {
            this.removeCounterSet[notification.params.suspect].add(notification.from.number);

            if (this.removeCounterSet[notification.params.suspect].size >= this.quorumSize) {
                this.votingExclusionSuspiciousTasks[notification.params.suspect].cancel();
                this.votingExclusionSuspiciousFires[notification.params.suspect](true);
            }
        } else {
            this.leaveCounterSet[notification.params.suspect].add(notification.from.number);

            if (this.leaveCounterSet[notification.params.suspect].size > this.pr.pool.length - this.quorumSize) {
                this.votingExclusionSuspiciousTasks[notification.params.suspect].cancel();
                this.votingExclusionSuspiciousFires[notification.params.suspect](false);
            }
        }
    }

    async searchCommonCortege() {
        this.pr.logger.log("UBotProcess_writeMultiStorage... searchCommonCortege wait results");

        await this.downloadEvent;
        this.pr.logger.log("UBotProcess_writeMultiStorage... searchCommonCortege results received");

        // calculate intersection cortege members and downloaded results
        this.declineCounterSet.forEach(decline => this.cortege.delete(decline));

        for (let i = 0; i < this.pr.pool.length; ++i)
            this.suspiciousRemovalCoefficients[i] = 0;

        // recursive calculate common cortege
        if (await this.calculateCommonCortege())
            await this.approveCortege(false);
        else
            this.fail("failed searching common cortege");
    }

    async calculateCommonCortege() {
        this.pr.logger.log("UBotProcess_writeMultiStorage... calculateCommonCortege iteration: " + this.commonCortegeIteration);
        this.pr.logger.log("UBotProcess_writeMultiStorage... self cortege = " + JSON.stringify(Array.from(this.cortege)));

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
        ) && await this.getDecision()) {
            this.generateCortegeId(false);
            return true;
        }

        let cortegesHash = this.getCortegesHash();
        if (this.lastCortegesHash != null) {
            if (this.lastCortegesHash.equals(cortegesHash)) {
                this.pr.logger.log("Error UBotProcess_writeMultiStorage: cortege has not changed during the iteration, consensus not found");
                this.pr.errors.push(new ErrorRecord(Errors.FAILURE, "UBotProcess_writeMultiStorage",
                    "cortege has not changed during the iteration, consensus not found"));
                return false;
            }
        } else
            this.lastCortegesHash = cortegesHash;

        // analyze corteges
        if (!await this.crossAnalyzeCorteges()) {
            this.pr.logger.log("Error UBotProcess_writeMultiStorage: consensus not found");
            this.pr.errors.push(new ErrorRecord(Errors.FAILURE, "UBotProcess_writeMultiStorage", "consensus not found"));
            return false;
        }

        this.commonCortegeIteration++;
        return await this.calculateCommonCortege();
    }

    async crossAnalyzeCorteges() {
        // remove ubots without quorum or without self ubot
        let removed = new Set();
        while (true) {
            for (let ubot of this.cortege) {
                if (!this.corteges[ubot].has(this.pr.selfPoolIndex) ||
                    Array.from(this.corteges[ubot]).filter(u => this.cortege.has(u)).length < this.quorumSize)
                    removed.add(ubot);
                else {
                    let votes = 1;  // vote from self cortege
                    Array.from(this.cortege).filter(u => u !== this.pr.selfPoolIndex).forEach(u => {
                        if (this.corteges[u].has(ubot))
                            votes++;
                    });

                    if (votes < this.quorumSize)
                        removed.add(ubot);
                }
            }

            if (removed.size === 0)
                break;

            removed.forEach(rem => this.cortege.delete(rem));

            // check consensus possibility
            if (this.cortege.size < this.quorumSize)
                return false;

            removed.clear();
        }

        // check suspicious corteges on other ubots
        this.suspicious.clear();
        for (let ubot of this.cortege) {
            if (ubot !== this.pr.selfPoolIndex &&
                (!Array.from(this.cortege).every(u => this.corteges[ubot].has(u)) ||
                 !Array.from(this.cortege).filter(u => u !== this.pr.selfPoolIndex).every(u => this.corteges[u].has(ubot))))

                this.suspicious.add(ubot);
        }

        this.cortegeEvent = new Promise(resolve => this.cortegeFire = resolve);

        this.approveCounterSet.clear();
        this.declineCounterSet.clear();
        this.approveCounterFromOthersSets = [];
        this.declineCounterFromOthersSets = [];
        this.suspicious.forEach(su => {
            this.approveCounterFromOthersSets[su] = new Set([this.pr.selfPoolIndex, su]);
            this.declineCounterFromOthersSets[su] = new Set();
        });

        this.pulseGetCortegeIds();
        this.getCortegeIdsTask = new ExecutorWithFixedPeriod(() => this.pulseGetCortegeIds(),
            UBotConfig.multi_storage_vote_period, this.pr.ubot.executorService).run();

        // wait results
        await this.cortegeEvent;

        this.declineCounterSet.forEach(declined => {
            this.cortege.delete(declined);
            this.suspicious.delete(declined);
        });

        // check consensus possibility
        if (this.cortege.size < this.quorumSize)
            return false;

        // selection most suspicious ubots
        let mostSuspicious = new Set();
        let removalEfficiency = 0;
        let intersection = this.calculateCortegesIntersection().size;
        this.suspicious.forEach(su => {
            let intersectionWithoutSu = this.calculateCortegesIntersection(su);

            if (intersectionWithoutSu - intersection > removalEfficiency) {
                removalEfficiency = intersectionWithoutSu - intersection;
                mostSuspicious = new Set([su]);
            } else
                mostSuspicious.add(su);
        });

        this.suspicious = mostSuspicious;

        let removingUbots = [];     //array of removing ubots containing sets of suspicious removed by them
        let iterationRemovalCoefficients = [];
        for (let i = 0; i < this.pr.pool.length; ++i) {
            iterationRemovalCoefficients[i] = 0;
            removingUbots[i] = new Set();
        }

        // checking suspicious for deleting others in previous iterations
        this.suspicious.forEach(su => {
            let removing = new Set(Array.from(this.cortege).filter(u => u !== this.pr.selfPoolIndex &&
                (!this.corteges[su].has(u)) || !this.corteges[u].has(su)));

            removing.forEach(rem => {
                iterationRemovalCoefficients[rem] += 1 / removing.size;
                removingUbots[rem].add(su);
                removingUbots[su].add(rem);
            });
        });

        let candidatesLiftingSuspicion = new Set();
        let confirmedSuspicious = new Set();

        Array.from(this.cortege).filter(u => u !== this.pr.selfPoolIndex).forEach(u => {
            let newRemovalCoefficient = this.suspiciousRemovalCoefficients[u] + iterationRemovalCoefficients[u];

            if (newRemovalCoefficient >= 1 - ACCURACY) {
                // add removing ubots to suspicious
                this.suspicious.add(u);

                if (newRemovalCoefficient > 1 + ACCURACY)
                    // delete removal ubots from suspicious
                    // (first placed in candidates, removed only if all removing ubots have a coefficient > 1)
                    removingUbots[u].forEach(su => candidatesLiftingSuspicion.add(su));
                else
                    removingUbots[u].forEach(su => confirmedSuspicious.add(su));
            } else
                removingUbots[u].forEach(su => confirmedSuspicious.add(su));
        });

        // remove remaining candidates from suspicious
        Array.from(candidatesLiftingSuspicion).filter(
            cand => !confirmedSuspicious.has(cand)).forEach(
                cand => this.suspicious.delete(cand));

        let voteApprove = this.cortege;
        this.suspicious.forEach(su => voteApprove.delete(su));
        this.iterationsVoteLeave[this.commonCortegeIteration] = voteApprove;

        // voting for the exclusion of the most suspicious ubots
        await Promise.all(Array.from(this.suspicious).map(async(su) => {
            if (await this.votingExclusionSuspicious(su)) {
                // increase removal coefficiens
                removingUbots[su].forEach(rem => this.suspiciousRemovalCoefficients[rem] + 1 / removingUbots[su].size);

                this.cortege.delete(su);
            }
        }));

        // check consensus possibility (and return result)
        return this.cortege.size >= this.quorumSize;
    }

    calculateCortegesIntersection(without = null) {
        let baseCortege = new Set(this.cortege);
        if (without != null)
            baseCortege.delete(without);

        return new Set(Array.from(baseCortege).filter(ubot =>
            Array.from(baseCortege).filter(u => u !== this.pr.selfPoolIndex).every(u => this.corteges[u].has(ubot)) &&
            (ubot === this.pr.selfPoolIndex || Array.from(baseCortege).every(u => this.corteges[ubot].has(u)))
        ));
    }

    async votingExclusionSuspicious(suspect) {
        this.votingExclusionSuspiciousEvents[suspect] = new Promise(resolve => this.votingExclusionSuspiciousFires[suspect] = resolve);

        if (this.parallelAnswers[suspect] != null)
            this.parallelAnswers[suspect].clear();
        else
            this.parallelAnswers[suspect] = new Set();
        if (this.leaveCounterSet[suspect] != null)
            this.leaveCounterSet[suspect].clear();
        else
            this.leaveCounterSet[suspect] = new Set();
        if (this.removeCounterSet[suspect] != null)
            this.removeCounterSet[suspect].clear();
        else
            this.removeCounterSet[suspect] = new Set();

        this.pulseVotingExclusionSuspicious(suspect);
        this.votingExclusionSuspiciousTasks[suspect] = new ExecutorWithFixedPeriod(() => this.pulseVotingExclusionSuspicious(suspect),
            UBotConfig.multi_storage_vote_period, this.pr.ubot.executorService).run();

        // wait and return voting result
        return await this.votingExclusionSuspiciousEvents[suspect];
    }

    async onNotify(notification) {
        if (notification instanceof UBotCloudNotification_process) {
            if (notification.type === UBotCloudNotification_process.types.MULTI_STORAGE_GET_DATA_HASHID) {
                if (!notification.params.isAnswer) {
                    this.pr.ubot.network.deliver(notification.from,
                        new UBotCloudNotification_process(
                            this.pr.ubot.network.myInfo,
                            this.pr.poolId,
                            this.procIndex,
                            UBotCloudNotification_process.types.MULTI_STORAGE_GET_DATA_HASHID,
                            {
                                dataHashId: this.binHashId,
                                previousRecordId: this.previousRecordId,
                                isAnswer: true
                            }
                        )
                    );
                } else if (this.getHashesTask != null && !this.getHashesTask.cancelled) {
                    this.otherAnswers.add(notification.from.number);
                    this.pr.logger.log("UBotProcess_writeMultiStorage... hash received. Answers = " + JSON.stringify(Array.from(this.otherAnswers)));
                    this.hashes[this.pr.poolIndexes.get(notification.from.number)] = notification.params.dataHashId;
                    this.previous[this.pr.poolIndexes.get(notification.from.number)] = notification.params.previousRecordId;

                    if (this.otherAnswers.size >= this.pr.pool.length - 1) {
                        this.getHashesTask.cancel();

                        this.downloadAnswers.add(this.pr.selfPoolIndex);
                        this.cortege.add(this.pr.selfPoolIndex);

                        this.downloadTask = new ExecutorWithDynamicPeriod(() => this.pulseDownload(),
                            UBotConfig.multi_storage_download_periods, this.pr.ubot.executorService).run();

                        if (!this.checkCortege())
                            new ScheduleExecutor(() => this.analyzeCortege(), 0, this.pr.ubot.executorService).run();
                    }
                }

            } else if (notification.type === UBotCloudNotification_process.types.MULTI_STORAGE_GET_CORTEGE_HASHID) {
                if (!notification.params.isAnswer) {
                    if (this.cortegeId != null)
                        this.pr.ubot.network.deliver(notification.from,
                            new UBotCloudNotification_process(
                                this.pr.ubot.network.myInfo,
                                this.pr.poolId,
                                this.procIndex,
                                UBotCloudNotification_process.types.MULTI_STORAGE_GET_CORTEGE_HASHID,
                                {
                                    cortegeId: this.cortegeId,
                                    isAnswer: true
                                }
                            )
                        );
                } else if (this.getCortegeIdTask != null && !this.getCortegeIdTask.cancelled) {
                    if (!this.cortegeId.equals(notification.params.cortegeId)) {
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

            } else if (notification.type === UBotCloudNotification_process.types.MULTI_STORAGE_GET_POOL_HASHES) {
                if (!notification.params.isAnswer) {
                    if (notification.params.dataUbotInPool === -1) {
                        for (let i = 0; i < this.pr.pool.length; i++)
                            if (this.pr.selfPoolIndex !== i && this.hashes[i] != null)
                                this.pr.ubot.network.deliver(notification.from,
                                    new UBotCloudNotification_process(
                                        this.pr.ubot.network.myInfo,
                                        this.pr.poolId,
                                        this.procIndex,
                                        UBotCloudNotification_process.types.MULTI_STORAGE_GET_POOL_HASHES,
                                        {
                                            dataHashId: this.hashes[i],
                                            dataUbotInPool: i,
                                            previousRecordId: this.previous[i],
                                            isAnswer: true
                                        }
                                    )
                                );
                    } else if (this.hashes[notification.params.dataUbotInPool] != null)
                        this.pr.ubot.network.deliver(notification.from,
                            new UBotCloudNotification_process(
                                this.pr.ubot.network.myInfo,
                                this.pr.poolId,
                                this.procIndex,
                                UBotCloudNotification_process.types.MULTI_STORAGE_GET_POOL_HASHES,
                                {
                                    dataHashId: this.hashes[notification.params.dataUbotInPool],
                                    dataUbotInPool: notification.params.dataUbotInPool,
                                    previousRecordId: this.previous[notification.params.dataUbotInPool],
                                    isAnswer: true
                                }
                            )
                        );

                } else if (this.getPoolHashesTask != null && !this.getPoolHashesTask.cancelled)
                    this.vote(notification);

            } else if (notification.type === UBotCloudNotification_process.types.MULTI_STORAGE_GET_CORTEGES) {
                if (!notification.params.isAnswer) {
                    if (this.iterationsCortege[notification.params.commonCortegeIteration] != null)
                        this.pr.ubot.network.deliver(notification.from,
                            new UBotCloudNotification_process(
                                this.pr.ubot.network.myInfo,
                                this.pr.poolId,
                                this.procIndex,
                                UBotCloudNotification_process.types.MULTI_STORAGE_GET_CORTEGES,
                                {
                                    //TODO: for > 200 ubots in pool need HTTP request
                                    cortege: await Boss.dump(Array.from(this.iterationsCortege[notification.params.commonCortegeIteration])),
                                    commonCortegeIteration: notification.params.commonCortegeIteration,
                                    isAnswer: true
                                }
                            )
                        );
                } else if (this.getCortegesTask != null && !this.getCortegesTask.cancelled &&
                    notification.params.commonCortegeIteration === this.commonCortegeIteration) {

                    let receivedCortege = new Set(await Boss.load(notification.params.cortege));
                    this.corteges[this.pr.poolIndexes.get(notification.from.number)] = receivedCortege;
                    //TODO: for > 200 ubots in pool need HTTP request (check marker)

                    if (this.iterationsCortegesIds[this.commonCortegeIteration] == null)
                        this.iterationsCortegesIds[this.commonCortegeIteration] = [];
                    this.iterationsCortegesIds[this.commonCortegeIteration][this.pr.poolIndexes.get(notification.from.number)] =
                        crypto.HashId.of(JSON.stringify(Array.from(receivedCortege).sort((a, b) => a - b)));

                    this.otherAnswers.add(notification.from.number);

                    if (this.otherAnswers.size >= this.cortege.size - 1) {
                        this.getCortegesTask.cancel();
                        this.cortegeFire();
                    }
                }

            } else if (notification.type === UBotCloudNotification_process.types.MULTI_STORAGE_GET_SUSPICIOUS_CORTEGE_HASHID) {
                if (!notification.params.isAnswer) {
                    if (this.iterationsCortegesIds[notification.params.commonCortegeIteration][notification.params.dataUbotInPool] != null)
                        this.pr.ubot.network.deliver(notification.from,
                            new UBotCloudNotification_process(
                                this.pr.ubot.network.myInfo,
                                this.pr.poolId,
                                this.procIndex,
                                UBotCloudNotification_process.types.MULTI_STORAGE_GET_SUSPICIOUS_CORTEGE_HASHID,
                                {
                                    cortegeId: this.iterationsCortegesIds[notification.params.commonCortegeIteration][notification.params.dataUbotInPool],
                                    dataUbotInPool: notification.params.dataUbotInPool,
                                    commonCortegeIteration: notification.params.commonCortegeIteration,
                                    isAnswer: true
                                }
                            )
                        );
                } else if (this.getCortegeIdsTask != null && !this.getCortegeIdsTask.cancelled &&
                    notification.params.commonCortegeIteration === this.commonCortegeIteration)
                    this.voteSuspiciousCortegeId(notification);

            } else if (notification.type === UBotCloudNotification_process.types.MULTI_STORAGE_GET_DECISIONS) {
                if (!notification.params.isAnswer) {
                    let state = this.state;
                    if (notification.params.commonCortegeIteration !== -1)
                        state = this.iterationState[notification.params.commonCortegeIteration];

                    if (state != null && state !== UBotProcess_writeMultiStorage.states.CHECKING)
                        this.pr.ubot.network.deliver(notification.from,
                            new UBotCloudNotification_process(
                                this.pr.ubot.network.myInfo,
                                this.pr.poolId,
                                this.procIndex,
                                UBotCloudNotification_process.types.MULTI_STORAGE_GET_DECISIONS,
                                {
                                    decision: state !== UBotProcess_writeMultiStorage.states.ANALYSIS,
                                    commonCortegeIteration: notification.params.commonCortegeIteration,
                                    isAnswer: true
                                }
                            )
                        );
                } else if (this.getDecisionsTask != null && !this.getDecisionsTask.cancelled &&
                    (notification.params.commonCortegeIteration === -1 ||
                     notification.params.commonCortegeIteration === this.commonCortegeIteration)) {

                    if (notification.params.decision) {
                        this.otherAnswers.add(notification.from.number);

                        if (this.otherAnswers.size >= this.pr.pool.length - 1) {
                            this.getDecisionsTask.cancel();

                            if (notification.params.commonCortegeIteration === -1)
                                this.state = UBotProcess_writeMultiStorage.states.VOTE_APPROVED;
                            else
                                this.iterationState[this.commonCortegeIteration] = UBotProcess_writeMultiStorage.states.VOTE_APPROVED;

                            this.decisionsFire();
                        }
                    } else {
                        this.getDecisionsTask.cancel();

                        if (notification.params.commonCortegeIteration === -1)
                            this.state = UBotProcess_writeMultiStorage.states.VOTE_DECLINED;
                        else
                            this.iterationState[this.commonCortegeIteration] = UBotProcess_writeMultiStorage.states.VOTE_DECLINED;

                        this.decisionsFire();
                    }
                }

            } else if (notification.type === UBotCloudNotification_process.types.MULTI_STORAGE_VOTE_DECISION) {
                if (!notification.params.isAnswer) {
                    let state = this.state;
                    if (notification.params.commonCortegeIteration !== -1)
                        state = this.iterationState[notification.params.commonCortegeIteration];

                    if (state != null && state !== UBotProcess_writeMultiStorage.states.CHECKING &&
                        state !== UBotProcess_writeMultiStorage.states.SELF_APPROVED)

                        this.pr.ubot.network.deliver(notification.from,
                            new UBotCloudNotification_process(
                                this.pr.ubot.network.myInfo,
                                this.pr.poolId,
                                this.procIndex,
                                UBotCloudNotification_process.types.MULTI_STORAGE_VOTE_DECISION,
                                {
                                    decision: state !== UBotProcess_writeMultiStorage.states.ANALYSIS &&
                                              state !== UBotProcess_writeMultiStorage.states.VOTE_DECLINED,
                                    commonCortegeIteration: notification.params.commonCortegeIteration,
                                    isAnswer: true
                                }
                            )
                        );
                } else if (this.votingDecisionTask != null && !this.votingDecisionTask.cancelled &&
                    (notification.params.commonCortegeIteration === -1 ||
                     notification.params.commonCortegeIteration === this.commonCortegeIteration)) {
                    this.otherAnswers.add(notification.from.number);
                    this.voteDecision(notification);
                }

            } else if (notification.type === UBotCloudNotification_process.types.MULTI_STORAGE_VOTE_EXCLUSION_SUSPICIOUS) {
                if (!notification.params.isAnswer) {
                    if (this.iterationsVoteLeave[notification.params.commonCortegeIteration] != null)
                        this.pr.ubot.network.deliver(notification.from,
                            new UBotCloudNotification_process(
                                this.pr.ubot.network.myInfo,
                                this.pr.poolId,
                                this.procIndex,
                                UBotCloudNotification_process.types.MULTI_STORAGE_VOTE_EXCLUSION_SUSPICIOUS,
                                {
                                    decision: !this.iterationsVoteLeave[notification.params.commonCortegeIteration].has(notification.params.suspect),
                                    commonCortegeIteration: notification.params.commonCortegeIteration,
                                    suspect: notification.params.suspect,
                                    isAnswer: true
                                }
                            )
                        );
                } else if (this.votingExclusionSuspiciousTasks[notification.params.suspect] != null &&
                    !this.votingExclusionSuspiciousTasks[notification.params.suspect].cancelled &&
                    notification.params.commonCortegeIteration === this.commonCortegeIteration) {

                    this.parallelAnswers[notification.params.suspect].add(notification.from.number);
                    this.voteExclusionSuspect(notification);
                }
            }
        } else {
            this.pr.logger.log("warning: UBotProcess_writeMultiStorage - wrong notification received");
        }
    }
}

module.exports = {UBotProcess_writeMultiStorage};