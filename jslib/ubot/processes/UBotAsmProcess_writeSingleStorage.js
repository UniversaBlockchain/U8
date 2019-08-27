const ProcessBase = require("ubot/processes/ProcessBase").ProcessBase;
const UBotConfig = require("ubot/ubot_config").UBotConfig;
const ExecutorWithFixedPeriod = require("executorservice").ExecutorWithFixedPeriod;
const ErrorRecord = require("errors").ErrorRecord;
const Errors = require("errors").Errors;
const UBotPoolState = require("ubot/ubot_pool_state").UBotPoolState;
const UBotCloudNotification_asmCommand = require("ubot/ubot_notification").UBotCloudNotification_asmCommand;

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
    }

    init(binToWrite, storageData) {
        this.binToWrite = binToWrite;
        this.binHashId = crypto.HashId.of(this.binToWrite);

        // put result to cache
        this.pr.ubot.resultCache.put(this.binHashId, this.binToWrite);

        this.storageName = storageData.storage_name;
        if (this.pr.executableContract.state.data.cloud_storages.hasOwnProperty(this.storageName)) {
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

    start() {
        this.pr.logger.log("start UBotAsmProcess_writeSingleStorage");
        this.approveCounterSet.add(this.pr.ubot.network.myInfo.number); // vote for itself
        this.pulse();
        this.currentTask = new ExecutorWithFixedPeriod(() => {
            this.pulse();
        }, UBotConfig.single_storage_vote_period, this.pr.ubot.executorService).run();
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
                        null,
                        false
                    )
                );
            }
    }

    generateRecordID() {
        let poolId = this.pr.poolId.digest;
        let binHashId = this.binHashId.digest;
        let concat = new Uint8Array(poolId.length + binHashId.length);
        concat.set(poolId, 0);
        concat.set(binHashId, poolId.length);
        //TODO: add previous_record_id

        return crypto.HashId.of(concat);
    }

    async vote(notification) {
        if (this.binHashId.equals(notification.dataHashId))
            this.approveCounterSet.add(notification.from.number);
        else
            this.declineCounterSet.add(notification.from.number);

        if (this.approveCounterSet.size >= this.quorumSize) {
            // ok
            this.currentTask.cancel();

            let recordId = this.generateRecordID();
            try {
                await this.pr.ledger.writeToSingleStorage(this.pr.executableContract.id, this.storageName,
                    this.binToWrite, this.binHashId, recordId);
            } catch (err) {
                this.pr.logger.log("error: UBotAsmProcess_writeSingleStorage: " + err.message);
                this.pr.errors.push(new ErrorRecord(Errors.FAILURE, "UBotAsmProcess_writeSingleStorage",
                    "error writing to single storage: " + err.message));
                this.pr.changeState(UBotPoolState.FAILED);
                return;
            }

            this.pr.logger.log("UBotAsmProcess_writeSingleStorage... ready, approved");

            this.pr.var0 = recordId.digest;
            this.onReady();
            // TODO: distribution single-storage to all ubots after closing pool...

        } else if (this.declineCounterSet.size > this.pr.pool.length - this.quorumSize) {
            // error
            this.currentTask.cancel();

            this.pr.logger.log("UBotAsmProcess_writeSingleStorage... ready, declined");
            this.pr.errors.push(new ErrorRecord(Errors.FAILURE, "UBotAsmProcess_writeSingleStorage", "writing to single storage declined"));
            this.pr.changeState(UBotPoolState.FAILED);
        }
    }

    async onNotify(notification) {
        if (notification instanceof UBotCloudNotification_asmCommand) {
            if (notification.type === UBotCloudNotification_asmCommand.types.SINGLE_STORAGE_GET_DATA_HASHID) {
                if (!notification.isAnswer) {
                    // this.pr.logger.log("SINGLE_STORAGE_GET_DATA_HASHID req... " + notification);
                    this.pr.ubot.network.deliver(notification.from,
                        new UBotCloudNotification_asmCommand(
                            this.pr.ubot.network.myInfo,
                            this.pr.poolId,
                            this.cmdStack,
                            UBotCloudNotification_asmCommand.types.SINGLE_STORAGE_GET_DATA_HASHID,
                            this.binHashId,
                            true
                        )
                    );
                } else if (!this.currentTask.cancelled)
                    await this.vote(notification);
            }
        } else {
            this.pr.logger.log("warning: UBotAsmProcess_writeSingleStorage - wrong notification received");
        }
    }
}

module.exports = {UBotAsmProcess_writeSingleStorage};