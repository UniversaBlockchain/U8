/*
 * Copyright (c) 2019-present Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

const ProcessBase = require("ubot/processes/ProcessBase").ProcessBase;
const UBotConfig = require("ubot/ubot_config").UBotConfig;
const ExecutorWithFixedPeriod = require("executorservice").ExecutorWithFixedPeriod;
const ErrorRecord = require("errors").ErrorRecord;
const Errors = require("errors").Errors;
const UBotPoolState = require("ubot/ubot_pool_state").UBotPoolState;
const UBotCloudNotification_asmCommand = require("ubot/ubot_notification").UBotCloudNotification_asmCommand;
const Boss = require('boss.js');
const t = require("tools");

class UBotAsmProcess_writeSingleStorage extends ProcessBase {
    constructor(processor, onReady, asmProcessor, cmdStack) {
        super(processor, onReady);
        this.asmProcessor = asmProcessor;
        this.cmdStack = cmdStack;
        this.binToWrite = null;
        this.binHashId = null;
        this.approveCounterSet = new Set();
        this.declineCounterSet = new Set();
        this.poolSize = 0;
        this.quorumSize = 0;
        this.recordId = null;
    }

    async init(binToWrite, previousRecordId, storageData) {
        this.binToWrite = await Boss.dump(binToWrite);
        this.binHashId = crypto.HashId.of(this.binToWrite);
        this.previousRecordId = previousRecordId;

        // put result to cache
        this.pr.ubot.resultCache.put(this.binHashId, this.binToWrite);

        this.storageName = storageData.storage_name;
        if (this.pr.executableContract.state.data.hasOwnProperty("cloud_storages") &&
            this.pr.executableContract.state.data.cloud_storages.hasOwnProperty(this.storageName)) {
            if (this.pr.executableContract.state.data.cloud_storages[this.storageName].hasOwnProperty("pool"))
                this.poolSize = this.pr.executableContract.state.data.cloud_storages[this.storageName].pool.size;
            else
                this.poolSize = this.pr.poolSize;

            if (this.pr.executableContract.state.data.cloud_storages[this.storageName].hasOwnProperty("quorum"))
                this.quorumSize = this.pr.executableContract.state.data.cloud_storages[this.storageName].quorum.size;
            else
                this.quorumSize = this.pr.quorumSize;

            if (this.poolSize > this.pr.poolSize || this.quorumSize > this.pr.quorumSize) {
                this.pr.logger.log("Error: insufficient pool or quorum to use storage '" + this.storageName + "'");
                this.pr.errors.push(new ErrorRecord(Errors.FAILURE, "UBotAsmProcess_writeStorage",
                    "insufficient pool or quorum to use storage '" + this.storageName + "'"));
                this.pr.changeState(UBotPoolState.FAILED);
            }

        } else {
            this.poolSize = this.pr.poolSize;
            this.quorumSize = this.pr.quorumSize;
        }
    }

    async start() {
        this.pr.logger.log("start UBotAsmProcess_writeSingleStorage");
        this.approveCounterSet.add(this.pr.ubot.network.myInfo.number); // vote for itself
        this.pulse();
        this.getHashesTask = new ExecutorWithFixedPeriod(() => this.pulse(),
            UBotConfig.single_storage_vote_period, this.pr.ubot.executorService).run();
    }

    pulse() {
        for (let i = 0; i < this.pr.pool.length; ++i)
            if (!this.approveCounterSet.has(this.pr.pool[i].number) && !this.declineCounterSet.has(this.pr.pool[i].number)) {
                this.pr.ubot.network.deliver(this.pr.pool[i],
                    new UBotCloudNotification_asmCommand(
                        this.pr.ubot.network.myInfo,
                        this.pr.poolId,
                        this.cmdStack,
                        UBotCloudNotification_asmCommand.types.SINGLE_STORAGE_GET_DATA_HASHID,
                        { isAnswer: false }
                    )
                );
            }
    }

    generateSelfRecordID() {
        if (this.previousRecordId != null && this.previousRecordId.equals(this.pr.executableContract.id))
            this.recordId = this.previousRecordId;   //executable contract id - default record id
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
        if (this.binHashId.equals(notification.params.dataHashId) &&
            t.valuesEqual(this.previousRecordId, notification.params.previousRecordId))
            this.approveCounterSet.add(notification.from.number);
        else
            this.declineCounterSet.add(notification.from.number);

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
            } catch (err) {
                this.pr.logger.log("error: UBotAsmProcess_writeSingleStorage: " + err.message);
                this.pr.errors.push(new ErrorRecord(Errors.FAILURE, "UBotAsmProcess_writeSingleStorage",
                    "error writing to single storage: " + err.message));
                this.pr.changeState(UBotPoolState.FAILED);
                return;
            }

            this.pr.logger.log("UBotAsmProcess_writeSingleStorage... ready, approved");

            this.pr.var0 = this.recordId.digest;
            this.onReady();

        } else if (this.declineCounterSet.size > this.pr.pool.length - this.quorumSize) {
            // error
            this.getHashesTask.cancel();

            this.pr.logger.log("UBotAsmProcess_writeSingleStorage... ready, declined");
            this.pr.errors.push(new ErrorRecord(Errors.FAILURE, "UBotAsmProcess_writeSingleStorage", "writing to single storage declined"));
            this.pr.changeState(UBotPoolState.FAILED);
        }
    }

    async onNotify(notification) {
        if (notification instanceof UBotCloudNotification_asmCommand) {
            if (notification.type === UBotCloudNotification_asmCommand.types.SINGLE_STORAGE_GET_DATA_HASHID) {
                if (!notification.params.isAnswer) {
                    // this.pr.logger.log("SINGLE_STORAGE_GET_DATA_HASHID req... " + notification);
                    this.pr.ubot.network.deliver(notification.from,
                        new UBotCloudNotification_asmCommand(
                            this.pr.ubot.network.myInfo,
                            this.pr.poolId,
                            this.cmdStack,
                            UBotCloudNotification_asmCommand.types.SINGLE_STORAGE_GET_DATA_HASHID,
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
            this.pr.logger.log("warning: UBotAsmProcess_writeSingleStorage - wrong notification received");
        }
    }
}

module.exports = {UBotAsmProcess_writeSingleStorage};