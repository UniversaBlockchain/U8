/*
 * Copyright (c) 2019-present Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

const ProcessBase = require("ubot/processes/ProcessBase").ProcessBase;
const UBotConfig = require("ubot/ubot_config").UBotConfig;
const ExecutorWithFixedPeriod = require("executorservice").ExecutorWithFixedPeriod;
const ErrorRecord = require("errors").ErrorRecord;
const Errors = require("errors").Errors;
const UBotPoolState = require("ubot/ubot_pool_state").UBotPoolState;
const UBotProcessException = require("ubot/ubot_exceptions").UBotProcessException;
const UBotCloudNotification_process = require("ubot/ubot_notification").UBotCloudNotification_process;
const BossBiMapper = require("bossbimapper").BossBiMapper;
const Boss = require('boss.js');
const t = require("tools");
const ut = require("ubot/ubot_tools");

class UBotProcess_writeSingleStorage extends ProcessBase {
    constructor(processor, onReady, onFailed, mainProcess, storageId, procIndex) {
        super(processor, onReady, onFailed);
        this.mainProcess = mainProcess;
        this.storageId = storageId;
        this.procIndex = procIndex;
        this.binToWrite = null;
        this.binHashId = null;
        this.approveCounterSet = new Set();
        this.declineCounterSet = new Set();
        this.notAnswered = new Set();
        this.poolSize = 0;
        this.quorumSize = 0;
        this.recordId = null;
    }

    log(message) {
        this.pr.logger.log("WritePoolBoundStorage " + this.storageName + ", poolID: " + this.pr.poolId + " " + message);
    }

    async init(binToWrite, previousRecordId, storageData) {
        this.binToWrite = await Boss.dump(await BossBiMapper.getInstance().serialize(binToWrite));
        this.binHashId = crypto.HashId.of(this.binToWrite);
        this.previousRecordId = previousRecordId;

        // put result to cache
        this.pr.ubot.resultCache.put(this.binHashId, this.binToWrite);

        this.storageName = storageData.storage_name;
        if (this.pr.executableContract.state.data.hasOwnProperty("cloud_storages") &&
            this.pr.executableContract.state.data.cloud_storages.hasOwnProperty(this.storageName)) {

            let storageData = this.pr.executableContract.state.data.cloud_storages[this.storageName];
            if (storageData.hasOwnProperty("pool") && storageData.hasOwnProperty("quorum")) {
                try {
                    let result = ut.getPoolAndQuorumFromMetadata(storageData, this.pr.ubot.network.netConfig.size);

                    this.poolSize = result.pool;
                    this.quorumSize = result.quorum;
                } catch (err) {
                    let message = "failed get pool and quorum of method" + this.methodName + ": " + err.message;
                    this.log("Error: " + message);
                    message += ". Storage name: " + this.storageName;
                    this.pr.errors.push(new ErrorRecord(Errors.BAD_VALUE, "WritePoolBoundStorage", message));
                    this.pr.changeState(UBotPoolState.FAILED);

                    this.onFailed(new UBotProcessException("Error WritePoolBoundStorage: " + message));
                    return;
                }

                if (this.poolSize > this.pr.poolSize || this.quorumSize > this.pr.quorumSize) {
                    let message = "Insufficient pool or quorum to use storage";
                    this.log("Error: " + message);
                    message += ". Storage name: " + this.storageName;
                    this.pr.errors.push(new ErrorRecord(Errors.FAILURE, "WritePoolBoundStorage", message));
                    this.pr.changeState(UBotPoolState.FAILED);

                    this.onFailed(new UBotProcessException("Error WritePoolBoundStorage: " + message));
                }
                return;
            }
        }

        this.poolSize = this.pr.poolSize;
        this.quorumSize = this.pr.quorumSize;
    }

    async start() {
        this.log("Start");
        this.approveCounterSet.add(this.pr.ubot.network.myInfo.number); // vote for itself

        // save first request times
        this.saveRequestTimes();

        this.pulse();
        this.getHashesTask = new ExecutorWithFixedPeriod(() => this.pulse(),
            UBotConfig.single_storage_vote_period, this.pr.ubot.executorService).run();
    }

    pulse() {
        this.log("Pulse. Not answered = " + JSON.stringify(Array.from(this.notAnswered)));

        try {
            for (let i = 0; i < this.pr.pool.length; ++i)
                if (!this.approveCounterSet.has(this.pr.pool[i].number) && !this.declineCounterSet.has(this.pr.pool[i].number) &&
                    !this.notAnswered.has(this.pr.pool[i].number)) {
                    // check max wait period
                    if (this.checkMaxWaitPeriod(i))
                        this.checkDecline();        // check consensus available
                    else {
                        this.log("Deliver notification to " + this.pr.pool[i].number);
                        this.pr.ubot.network.deliver(this.pr.pool[i],
                            new UBotCloudNotification_process(
                                this.pr.ubot.network.myInfo,
                                this.pr.poolId,
                                this.storageId,
                                this.procIndex,
                                UBotCloudNotification_process.types.SINGLE_STORAGE_GET_DATA_HASHID,
                                {isAnswer: false}
                            )
                        );
                    }
                }   
        } catch (err) {
            console.error("WritePoolBoundStorage. Pulse error: " + err.message);
            console.error(err.stack);
        }
    }

    generateSelfRecordID() {
        if (this.previousRecordId != null && this.previousRecordId.equals(this.pr.getDefaultRecordId(this.storageName, false)))
            this.recordId = this.previousRecordId;   // executable contract id - default record id
        else {
            let poolId = this.pr.poolId.digest;
            let binHashId = this.binHashId.digest;
            let concat = new Uint8Array(poolId.length + binHashId.length +
                (this.previousRecordId != null ? this.previousRecordId.digest.length : 0));
            concat.set(poolId, 0);
            concat.set(binHashId, poolId.length);
            if (this.previousRecordId != null)
                concat.set(this.previousRecordId.digest, poolId.length + binHashId.length);

            this.recordId = crypto.HashId.of(concat);
        }
    }

    async vote(notification) {
        let message = "Vote {from: " + notification.from.number + ", result: ";

        if (this.binHashId.equals(notification.params.dataHashId) &&
            t.valuesEqual(this.previousRecordId, notification.params.previousRecordId)) {
            this.approveCounterSet.add(notification.from.number);
            message += "approve";
        } else {
            this.declineCounterSet.add(notification.from.number);
            message += "decline";
        }

        message += "}";
        this.log(message);

        if (this.approveCounterSet.size >= this.quorumSize) {
            // ok
            this.getHashesTask.cancel();

            this.generateSelfRecordID();

            // put result to cache
            this.pr.ubot.resultCache.put(this.recordId, this.binToWrite);

            try {
                if (this.previousRecordId != null)
                    await this.pr.ledger.deleteFromSingleStorage(this.previousRecordId);
                await this.pr.ledger.writeToSingleStorage(this.pr.executableContract.id, this.storageName,
                    this.binToWrite, this.binHashId, this.recordId);

                await this.pr.session.updateStorage(this.storageName, this.binHashId, false);
            } catch (err) {
                this.log("Error: " + err.message);
                this.pr.errors.push(new ErrorRecord(Errors.FAILURE, "WritePoolBoundStorage",
                    "error writing to single storage: " + err.message));
                this.pr.changeState(UBotPoolState.FAILED);

                this.onFailed(new UBotProcessException("Error WritePoolBoundStorage: " + err.message));
                return;
            }

            this.log("Ready, approved");

            //this.mainProcess.var0 = this.recordId.digest;
            this.onReady();

        } else
            this.checkDecline();
    }

    async onNotify(notification) {
        if (notification instanceof UBotCloudNotification_process) {
            if (notification.type === UBotCloudNotification_process.types.SINGLE_STORAGE_GET_DATA_HASHID) {
                if (!notification.params.isAnswer) {
                    // this.log("SINGLE_STORAGE_GET_DATA_HASHID req... " + notification);
                    this.pr.ubot.network.deliver(notification.from,
                        new UBotCloudNotification_process(
                            this.pr.ubot.network.myInfo,
                            this.pr.poolId,
                            this.storageId,
                            this.procIndex,
                            UBotCloudNotification_process.types.SINGLE_STORAGE_GET_DATA_HASHID,
                            {
                                dataHashId: this.binHashId,
                                previousRecordId: this.previousRecordId,
                                isAnswer: true
                            }
                        )
                    );
                } else if (!this.getHashesTask.cancelled)
                    await this.vote(notification);
            }
        } else {
            this.log("Warning: wrong notification received");
        }
    }

    saveRequestTimes() {
        if (this.mainProcess.maxWaitUbot != null)
            for (let i = 0; i < this.pr.pool.length; ++i)
                if (!this.notAnswered.has(this.pr.pool[i].number))
                    this.mainProcess.requestTimes[i] = Date.now();
    }

    checkMaxWaitPeriod(ubotInPool) {
        if (this.mainProcess.maxWaitUbot != null &&
            Date.now() - this.mainProcess.requestTimes[ubotInPool] > this.mainProcess.maxWaitUbot) {
            this.notAnswered.add(this.pr.pool[ubotInPool].number);
            this.log(this.constructor.name + "... ubot " + this.pr.pool[ubotInPool].number +
                " did not respond to the request during the wait period");

            return true;
        }
        return false;
    }

    checkDecline() {
        if (this.declineCounterSet.size + this.notAnswered.size > this.pr.pool.length - this.quorumSize &&
            this.pr.state !== UBotPoolState.FAILED) {
            // error
            if (this.getHashesTask != null)
                this.getHashesTask.cancel();

            this.log("Ready, declined");
            this.pr.errors.push(new ErrorRecord(Errors.FAILURE, "WritePoolBoundStorage", "writing to single storage declined. Storage name: " + this.storageName));
            this.pr.changeState(UBotPoolState.FAILED);

            this.onFailed(new UBotProcessException("Error WritePoolBoundStorage: writing to single storage declined. Storage name: " + this.storageName));
        }
    }
}

module.exports = {UBotProcess_writeSingleStorage};