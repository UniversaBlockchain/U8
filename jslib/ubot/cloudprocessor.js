const UBotConfig = require("ubot/ubot_config").UBotConfig;
const ExecutorWithFixedPeriod = require("executorservice").ExecutorWithFixedPeriod;
const ex = require("exceptions");
const t = require("tools");
const UBotCloudNotification = require("ubot/ubot_notification").UBotCloudNotification;

const UBotPoolState = {

    /**
     * At this state CloudProcessor should select ubots for new pool,
     * and send to them udp notifications with invite to download contractRequest.
     */
    SENDING_CLOUD_METHOD                       : {ordinal: 0},

    /**
     * CloudProcessor is waiting for other ubots in pool to downloads contractRequest.
     */
    WAIT_OTHER_UBOTS_DOWNLOAD_CLOUD_METHOD     : {ordinal: 1},

    /**
     * CloudProcessor is downloading contractRequest from pool starter ubot.
     */
    DOWNLOAD_CLOUD_METHOD                      : {ordinal: 2},

};

t.addValAndOrdinalMaps(UBotPoolState);


class CloudProcessor {
    constructor(initialState, contractRequest, ubot) {
        this.state = initialState;
        this.poolId = contractRequest.id;
        this.contractRequest = contractRequest;
        this.ubot = ubot;
        this.currentTask = null;
        this.pool = [];

        this.startProcessingCurrentState();
    }

    startProcessingCurrentState() {
        switch (this.state) {
            case UBotPoolState.SENDING_CLOUD_METHOD:
                this.startSendingCloudMethod();
                break;
            case UBotPoolState.WAIT_OTHER_UBOTS_DOWNLOAD_CLOUD_METHOD:
                this.waitOtherUbotsDownloadCloudMethod();
                break;
            case UBotPoolState.DOWNLOAD_CLOUD_METHOD:
                this.startDownloadCloudMethod();
                break;
        }
    }

    changeState(newState) {
        // here we can check transition from state to newState
        this.state = newState;
        this.startProcessingCurrentState();
    }

    randomChoice(list, count, safe = true) {
        if (safe)
            list = [...list];
        if (count > list.length)
            throw new ex.IllegalArgumentError("randomChoice error: count > arr.length");
        let res = [];
        while (res.length < count) {
            let pick = Math.floor(Math.random()*list.length);
            res.push(list[pick]);
            list.splice(pick, 1);
        }
        return res;
    }

    startSendingCloudMethod() {
        // select pool
        let list = this.ubot.network.netConfig.toList();
        let myIndex = 0;
        for (let i = 1; i < list.length; ++i)
            if (list[i].number == this.ubot.network.myInfo.number) {
                myIndex = i;
                break;
            }
        let me = list[myIndex];
        list.splice(myIndex, 1);
        this.pool = this.randomChoice(list, 2);
        this.pool.push(me);

        // periodically send notifications
        this.pulseSendingCloudMethod();
        this.currentTask = new ExecutorWithFixedPeriod(() => {
            this.pulseSendingCloudMethod();
        }, UBotConfig.sending_cloud_method_period).run();
    }

    pulseSendingCloudMethod() {
        for (let i = 0; i < this.pool.length; ++i)
            if (this.pool[i].number != this.ubot.network.myInfo.number)
                this.ubot.network.deliver(
                    this.pool[i],
                    new UBotCloudNotification(
                        this.ubot.network.myInfo,
                        this.poolId,
                        UBotCloudNotification.types.DOWNLOAD_CLOUD_METHOD,
                        false
                    )
                );
    }

    waitOtherUbotsDownloadCloudMethod() {
    }

    startDownloadCloudMethod() {
    }

};

module.exports = {UBotPoolState, CloudProcessor};
