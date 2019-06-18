function addValAndOrdinalMaps(en) {
    let byOrdinal = new Map();
    for (let k in en) {
        if (en.hasOwnProperty(k)) {
            en[k].val = k;
            byOrdinal.set(en[k].ordinal, en[k]);
        }
    }
    en.byOrdinal = byOrdinal;
    en.byVal = {};
    en.byVal.get = function (key) {return en[key]};
}


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

addValAndOrdinalMaps(UBotPoolState);


class CloudProcessor {
    constructor(initialState, contractRequest, ubot) {
        this.state = initialState;
        this.contractRequest = contractRequest;
        this.ubot = ubot;
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

    startSendingCloudMethod() {
    }

    waitOtherUbotsDownloadCloudMethod() {
    }

    startDownloadCloudMethod() {
    }

};

module.exports = {UBotPoolState, CloudProcessor};
