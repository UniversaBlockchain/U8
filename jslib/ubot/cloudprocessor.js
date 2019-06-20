const UBotConfig = require("ubot/ubot_config").UBotConfig;
const ExecutorWithFixedPeriod = require("executorservice").ExecutorWithFixedPeriod;
const ex = require("exceptions");
const t = require("tools");
const UBotCloudNotification = require("ubot/ubot_notification").UBotCloudNotification;

const UBotPoolState = {

    /**
     * UBot creates new CloudProcessor with this state if it has received UBotCloudNotification, but CloudProcessor
     * with corresponding poolId not found. Then UBot calls method onNotifyInit for new CloudProcessor.
     */
    INIT                                       : {ordinal: 0},

    /**
     * At this state CloudProcessor should select ubots for new pool,
     * and periodically send to them udp notifications with invite to download startingContract.
     * Meanwhile, CloudProcessor is waiting for other ubots in pool to downloads startingContract.
     */
    SENDING_CLOUD_METHOD                       : {ordinal: 1},

    /**
     * CloudProcessor is downloading startingContract from pool starter ubot.
     */
    DOWNLOAD_CLOUD_METHOD                      : {ordinal: 2},

};

t.addValAndOrdinalMaps(UBotPoolState);


class CloudProcessor {
    constructor(initialState, poolId, ubot) {
        this.state = initialState;
        this.poolId = poolId;
        this.startingContract = null;
        this.ubot = ubot;
        this.logger = ubot.logger;
        this.currentProcess = null;
        this.pool = [];
        this.respondToNotification = null;
    }

    startProcessingCurrentState() {
        switch (this.state) {
            case UBotPoolState.SENDING_CLOUD_METHOD:
                this.currentProcess = new ProcessSendingCloudMethod(this, ()=>{
                    this.logger.log("CloudProcessor.ProcessSendingCloudMethod.onReady");
                    //this.changeState(SOME_NEW_STATE);
                });
                this.currentProcess.start();
                break;
            case UBotPoolState.DOWNLOAD_CLOUD_METHOD:
                this.currentProcess = new ProcessDownloadCloudMethod(this, () => {
                    this.logger.log("CloudProcessor.ProcessDownloadCloudMethod.onReady, poolSize = " + this.startingContract.state.data.poolSize);
                    //this.changeState(SOME_NEW_STATE);
                });
                this.currentProcess.start();
                break;
        }
    }

    changeState(newState) {
        // here we can check transition from state to newState
        this.state = newState;
        this.startProcessingCurrentState();
    }

    onNotifyInit(notification) {
        if (this.state != UBotPoolState.INIT)
            this.logger.log("error: CloudProcessor.onNotifyInit() -> state != INIT");
        this.respondToNotification = notification;
        if (notification.type == UBotCloudNotification.types.DOWNLOAD_CLOUD_METHOD) {
            this.changeState(UBotPoolState.DOWNLOAD_CLOUD_METHOD);
        }
    }

    onNotify(notification) {
        if (this.currentProcess != null)
            this.currentProcess.onNotify(notification);
        else
            this.logger.log("error: CloudProcessor.onNotify -> currentProcess is null, currentProcess = " + this.currentProcess);
    }

    deliverToOtherUBots(notify) {
        for (let i = 0; i < this.pool.length; ++i)
            if (this.pool[i].number != this.ubot.network.myInfo.number)
                this.ubot.network.deliver(this.pool[i], notify);
    }
}

class ProcessBase {
    constructor(processor, onReady) {
        this.pr = processor;
        this.onReady = onReady;
        this.currentTask = null;
    }

    start() {
        throw new Error("ProcessBase.start() not implemented");
    }

    onNotify(notification) {
        // silently do nothing
    }
}

class ProcessSendingCloudMethod extends ProcessBase {
    constructor(processor, onReady) {
        super(processor, onReady);
        this.currentTask = null;
        this.otherAnswers = new Map();
    }

    selectPool() {
        let list = this.pr.ubot.network.netConfig.toList();
        let myIndex = 0;
        for (let i = 1; i < list.length; ++i)
            if (list[i].number == this.pr.ubot.network.myInfo.number) {
                myIndex = i;
                break;
            }
        let me = list[myIndex];
        list.splice(myIndex, 1);
        this.pr.pool = t.randomChoice(list, this.pr.startingContract.state.data.poolSize-1);
        this.pr.pool.push(me);
    }

    start() {
        this.selectPool();

        // periodically send notifications
        this.pulse();
        this.currentTask = new ExecutorWithFixedPeriod(() => {
            this.pulse();
        }, UBotConfig.sending_cloud_method_period).run();
    }

    pulse() {
        this.pr.deliverToOtherUBots(
            new UBotCloudNotification(
                this.pr.ubot.network.myInfo,
                this.pr.poolId,
                UBotCloudNotification.types.DOWNLOAD_CLOUD_METHOD,
                false
            )
        );
    }

    onNotify(notification) {
        if (notification.type == UBotCloudNotification.types.DOWNLOAD_CLOUD_METHOD && notification.isAnswer) {
            this.otherAnswers.set(notification.from.number, 1);
            if (this.otherAnswers.size >= this.pr.pool.length-1) {
                this.currentTask.cancel();
                this.onReady();
            }
        }
    }

}

class ProcessDownloadCloudMethod extends ProcessBase {
    constructor(processor, onReady) {
        super(processor, onReady)
    }

    start() {
        this.pr.logger.log("startDownloadCloudMethod");

        // periodically try to download starting contract (retry on notify)
        this.pulse();
    }

    pulse() {
        this.pr.ubot.network.sendGetRequestToUbot(
            this.pr.respondToNotification.from,
            "/getStartingContract/" + this.pr.poolId.base64,
            (respCode, body) => {
                if (respCode == 200) {
                    this.pr.startingContract = Contract.fromPackedTransaction(body);
                    this.pr.ubot.network.deliver(this.pr.respondToNotification.from,
                        new UBotCloudNotification(
                            this.pr.ubot.network.myInfo,
                            this.pr.poolId,
                            UBotCloudNotification.types.DOWNLOAD_CLOUD_METHOD,
                            true
                        )
                    );
                    this.onReady();
                } else {
                    this.pr.logger.log("warning: getStartingContract respCode = "+ respCode);
                }
            }
        );
    }

    onNotify(notification) {
        if (notification.type == UBotCloudNotification.types.DOWNLOAD_CLOUD_METHOD && !notification.isAnswer) {
            this.pulse();
        }
    }
}

module.exports = {UBotPoolState, CloudProcessor};
