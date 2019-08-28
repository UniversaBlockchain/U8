const ProcessSendStartingContract = require("ubot/processes/ProcessSendStartingContract").ProcessSendStartingContract;
const ProcessDownloadStartingContract = require("ubot/processes/ProcessDownloadStartingContract").ProcessDownloadStartingContract;
const ProcessStartExec = require("ubot/processes/ProcessStartExec").ProcessStartExec;
const ErrorRecord = require("errors").ErrorRecord;
const Errors = require("errors").Errors;
const UBotCloudNotification = require("ubot/ubot_notification").UBotCloudNotification;
const UBotPoolState = require("ubot/ubot_pool_state").UBotPoolState;

class CloudProcessor {
    constructor(initialState, poolId, ubot) {
        this.state = initialState;
        this.poolId = poolId;
        this.startingContract = null;
        this.executableContract = null;
        this.ubot = ubot;
        this.logger = ubot.logger;
        this.ledger = ubot.ledger;
        this.currentProcess = null;
        this.pool = [];
        this.poolIndexes = new Map();
        this.respondToNotification = null;
        this.output = null;
        this.errors = [];
        this.methodName = null;
        this.poolSize = 0;
        this.quorumSize = 0;
        this.localStorage = new Map();
        this.ProcessStartExec = ProcessStartExec;
    }

    startProcessingCurrentState() {
        switch (this.state) {
            case UBotPoolState.SEND_STARTING_CONTRACT:
                this.currentProcess = new ProcessSendStartingContract(this, ()=>{
                    this.logger.log("CloudProcessor.ProcessSendStartingContract.onReady");
                    this.changeState(UBotPoolState.START_EXEC);
                });
                break;
            case UBotPoolState.DOWNLOAD_STARTING_CONTRACT:
                this.currentProcess = new ProcessDownloadStartingContract(this, () => {
                    this.logger.log("CloudProcessor.ProcessDownloadStartingContract.onReady, poolSize = " + this.poolSize);
                    this.changeState(UBotPoolState.START_EXEC);
                });
                break;
            case UBotPoolState.START_EXEC:
                this.currentProcess = new ProcessStartExec(this, (output) => {
                    this.logger.log("CloudProcessor.ProcessStartExec.onReady, poolSize = " + this.poolSize);
                    this.output = output;
                    this.changeState(UBotPoolState.FINISHED);
                });
                break;
            case UBotPoolState.FINISHED:
            case UBotPoolState.FAILED:
                return;
        }

        this.currentProcess.start();
    }

    changeState(newState) {
        if (~this.state.nextStates.indexOf(newState.ordinal)) {
            this.state = newState;
            this.startProcessingCurrentState();
        } else
            this.logger.log("Error change state " + this.state.val + " to " + newState.val);
    }

    onNotifyInit(notification) {
        if (this.state !== UBotPoolState.INIT) {
            this.logger.log("error: CloudProcessor.onNotifyInit() -> state != INIT");
            this.errors.push(new ErrorRecord(Errors.BADSTATE, "CloudProcessor.onNotifyInit", "state != INIT"));
            this.changeState(UBotPoolState.FAILED);
            return;
        }

        this.respondToNotification = notification;
        if (notification.type === UBotCloudNotification.types.DOWNLOAD_STARTING_CONTRACT) {
            this.changeState(UBotPoolState.DOWNLOAD_STARTING_CONTRACT);
        }
    }

    async onNotify(notification) {
        if (this.currentProcess != null)
            try {
                await this.currentProcess.onNotify(notification);
            } catch (err) {
                this.logger.log(err.stack);
                this.logger.log("error CloudProcessor.onNotify: " + err.message);
                this.errors.push(new ErrorRecord(Errors.FAILURE, "CloudProcessor.onNotify", err.message));
                this.changeState(UBotPoolState.FAILED);
            }
        else {
            this.logger.log("error: CloudProcessor.onNotify -> currentProcess is null, currentProcess = " + this.currentProcess);
            this.errors.push(new ErrorRecord(Errors.BAD_VALUE, "CloudProcessor.onNotify", "currentProcess is null"));
            this.changeState(UBotPoolState.FAILED);
        }
    }

    initPoolAndQuorum() {
        this.methodName = this.startingContract.state.data.methodName;
        if (this.executableContract.state.data.cloud_methods.hasOwnProperty(this.methodName)) {
            if (this.executableContract.state.data.cloud_methods[this.methodName].hasOwnProperty("pool"))
                this.poolSize = this.executableContract.state.data.cloud_methods[this.methodName].pool.size;
            else {
                this.logger.log("Error CloudProcessor.initPoolAndQuorum undefined pool of starting method: " + this.methodName);
                this.errors.push(new ErrorRecord(Errors.BAD_VALUE, "CloudProcessor.initPoolAndQuorum",
                    "undefined pool of starting method: " + this.methodName));
                this.changeState(UBotPoolState.FAILED);
            }

            if (this.executableContract.state.data.cloud_methods[this.methodName].hasOwnProperty("quorum"))
                this.quorumSize = this.executableContract.state.data.cloud_methods[this.methodName].quorum.size;
            else {
                this.logger.log("Error CloudProcessor.initPoolAndQuorum undefined quorum of starting method: " + this.methodName);
                this.errors.push(new ErrorRecord(Errors.BAD_VALUE, "CloudProcessor.initPoolAndQuorum",
                    "undefined quorum of starting method: " + this.methodName));
                this.changeState(UBotPoolState.FAILED);
            }

        } else {
            this.logger.log("Error CloudProcessor.initPoolAndQuorum undefined starting method: " + this.methodName);
            this.errors.push(new ErrorRecord(Errors.BAD_VALUE, "CloudProcessor.initPoolAndQuorum",
                "undefined starting method: " + this.methodName));
            this.changeState(UBotPoolState.FAILED);
        }
    }

    /*deliverToOtherUBots(notification) {
        for (let i = 0; i < this.pool.length; ++i)
            if (this.pool[i].number !== this.ubot.network.myInfo.number)
                this.ubot.network.deliver(this.pool[i], notification);
    }*/
}

module.exports = {CloudProcessor};
