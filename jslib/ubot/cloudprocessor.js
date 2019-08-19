const UBotConfig = require("ubot/ubot_config").UBotConfig;
const ProcessSendStartingContract = require("ubot/processes/ProcessSendStartingContract").ProcessSendStartingContract;
const ProcessDownloadStartingContract = require("ubot/processes/ProcessDownloadStartingContract").ProcessDownloadStartingContract;
const ProcessStartExec = require("ubot/processes/ProcessStartExec").ProcessStartExec;
const ScheduleExecutor = require("executorservice").ScheduleExecutor;
const ExecutorWithFixedPeriod = require("executorservice").ExecutorWithFixedPeriod;
const ex = require("exceptions");
const t = require("tools");
const ErrorRecord = require("errors").ErrorRecord;
const Errors = require("errors").Errors;
const UBotCloudNotification = require("ubot/ubot_notification").UBotCloudNotification;
const UBotCloudNotification_asmCommand = require("ubot/ubot_notification").UBotCloudNotification_asmCommand;
const Boss = require('boss.js');

const UBotPoolState = {

    /**
     * UBot creates new CloudProcessor with this state if it has received UBotCloudNotification, but CloudProcessor
     * with corresponding poolId not found. Then UBot calls method onNotifyInit for new CloudProcessor.
     */
    INIT                                       : {val: "INIT", canContinue: true, ordinal: 0},

    /**
     * At this state CloudProcessor should select ubots for new pool,
     * and periodically send to them udp notifications with invite to download startingContract.
     * Meanwhile, CloudProcessor is waiting for other ubots in pool to downloads startingContract.
     */
    SEND_STARTING_CONTRACT                     : {val: "SEND_STARTING_CONTRACT", canContinue: true, ordinal: 1},

    /**
     * CloudProcessor is downloading startingContract from pool starter ubot.
     */
    DOWNLOAD_STARTING_CONTRACT                 : {val: "DOWNLOAD_STARTING_CONTRACT", canContinue: true, ordinal: 2},

    /**
     * CloudProcessor is executing cloud method.
     */
    START_EXEC                                 : {val: "START_EXEC", canContinue: true, ordinal: 3},

    /**
     * CloudProcessor is finished.
     */
    FINISHED                                   : {val: "FINISHED", canContinue: false, ordinal: 4, nextStates: []},

    /**
     * CloudProcessor is failed.
     */
    FAILED                                     : {val: "FAILED", canContinue: false, ordinal: 5, nextStates: []}
};

/**
 * CloudProcessor available next states
 */
UBotPoolState.INIT.nextStates = [
    UBotPoolState.SEND_STARTING_CONTRACT.ordinal,
    UBotPoolState.DOWNLOAD_STARTING_CONTRACT.ordinal,
    UBotPoolState.FAILED.ordinal,
];

UBotPoolState.SEND_STARTING_CONTRACT.nextStates = [
    UBotPoolState.START_EXEC.ordinal,
    UBotPoolState.FAILED.ordinal,
];

UBotPoolState.DOWNLOAD_STARTING_CONTRACT.nextStates = [
    UBotPoolState.START_EXEC.ordinal,
    UBotPoolState.FAILED.ordinal,
];

UBotPoolState.START_EXEC.nextStates = [
    UBotPoolState.FINISHED.ordinal,
    UBotPoolState.FAILED.ordinal,
];

t.addValAndOrdinalMaps(UBotPoolState);


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
        this.ubotAsm = [];
        this.output = null;
        this.errors = [];
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
                    this.logger.log("CloudProcessor.ProcessDownloadStartingContract.onReady, poolSize = " + this.executableContract.state.data.poolSize);
                    this.changeState(UBotPoolState.START_EXEC);
                });
                break;
            case UBotPoolState.START_EXEC:
                this.currentProcess = new ProcessStartExec(this, (output) => {
                    this.logger.log("CloudProcessor.ProcessStartExec.onReady, poolSize = " + this.executableContract.state.data.poolSize);
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

    /*deliverToOtherUBots(notification) {
        for (let i = 0; i < this.pool.length; ++i)
            if (this.pool[i].number !== this.ubot.network.myInfo.number)
                this.ubot.network.deliver(this.pool[i], notification);
    }*/
}

module.exports = {UBotPoolState, CloudProcessor};
