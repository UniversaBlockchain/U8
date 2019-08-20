const ProcessBase = require("ubot/processes/ProcessBase").ProcessBase;
const UBotConfig = require("ubot/ubot_config").UBotConfig;
const ExecutorWithFixedPeriod = require("executorservice").ExecutorWithFixedPeriod;
const ErrorRecord = require("errors").ErrorRecord;
const Errors = require("errors").Errors;
const UBotPoolState = require("ubot/ubot_pool_state").UBotPoolState;
const UBotCloudNotification_asmCommand = require("ubot/ubot_notification").UBotCloudNotification_asmCommand;

class UBotAsmProcess_writeSingleStorage extends ProcessBase {
    constructor(processor, onReady, asmProcessor, cmdIndex) {
        super(processor, onReady);
        this.asmProcessor = asmProcessor;
        this.cmdIndex = cmdIndex;
        this.binToWrite = null;
        this.binHashId = null;
        this.approveCounterSet = new Set();
        this.declineCounterSet = new Set();
    }

    init(binToWrite) {
        // this.pr.logger.log("UBotAsmProcess_writeSingleStorage.init: " + binToWrite);
        this.binToWrite = binToWrite;
        this.binHashId = crypto.HashId.of(this.binToWrite);
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
                        this.cmdIndex,
                        UBotCloudNotification_asmCommand.types.SINGLE_STORAGE_GET_DATA_HASHID,
                        null,
                        false
                    )
                );
            }
    }

    async vote(notification) {
        if (this.binHashId.equals(notification.dataHashId))
            this.approveCounterSet.add(notification.from.number);
        else
            this.declineCounterSet.add(notification.from.number);

        if (this.approveCounterSet.size >= this.pr.executableContract.state.data.poolQuorum) {
            // ok
            this.currentTask.cancel();

            try {
                await this.pr.ledger.writeToSingleStorage(this.pr.poolId, this.pr.executableContract.id, "default", this.binToWrite);
            } catch (err) {
                this.pr.logger.log("error: UBotAsmProcess_writeSingleStorage");
                this.pr.errors.push(new ErrorRecord(Errors.FAILURE, "UBotAsmProcess_writeSingleStorage", "error writing to single storage"));
                this.pr.changeState(UBotPoolState.FAILED);
                return;
            }

            this.pr.logger.log("UBotAsmProcess_writeSingleStorage... ready, approved");

            this.onReady();
            // TODO: distribution single-storage to all ubots here or after closing pool?

        } else if (this.declineCounterSet.size > this.pr.pool.length - this.pr.executableContract.state.data.poolQuorum) {
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
                            this.cmdIndex,
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