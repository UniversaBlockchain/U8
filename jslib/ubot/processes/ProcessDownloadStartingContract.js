const ProcessBase = require("ubot/processes/ProcessBase").ProcessBase;
const UBotConfig = require("ubot/ubot_config").UBotConfig;
const ScheduleExecutor = require("executorservice").ScheduleExecutor;
const ExecutorWithFixedPeriod = require("executorservice").ExecutorWithFixedPeriod;
const ex = require("exceptions");
const t = require("tools");
const ErrorRecord = require("errors").ErrorRecord;
const Errors = require("errors").Errors;
const UBotCloudNotification = require("ubot/ubot_notification").UBotCloudNotification;
const UBotCloudNotification_asmCommand = require("ubot/ubot_notification").UBotCloudNotification_asmCommand;
const Boss = require('boss.js');

class ProcessDownloadStartingContract extends ProcessBase {
    constructor(processor, onReady) {
        super(processor, onReady)
    }

    start() {
        this.pr.logger.log("start ProcessDownloadStartingContract");

        // periodically try to download starting contract (retry on notify)
        this.pulse();
    }

    pulse() {
        this.pr.ubot.network.sendGetRequestToUbot(
            this.pr.respondToNotification.from,
            "/getStartingContract/" + this.pr.poolId.base64,
            async (respCode, body) => {
                if (respCode === 200) {
                    let ans = await Boss.load(body);
                    this.pr.startingContract = await Contract.fromPackedTransaction(ans.contractBin);
                    this.pr.executableContract = await Contract.fromPackedTransaction(this.pr.startingContract.transactional.data.executableContract);
                    this.pr.pool = [];
                    ans.selectedPool.forEach(i => this.pr.pool.push(this.pr.ubot.network.netConfig.getInfo(i)));
                    this.pr.pool.forEach((info, i) => this.pr.poolIndexes.set(info.number, i));
                    this.pr.ubot.network.deliver(this.pr.respondToNotification.from,
                        new UBotCloudNotification(
                            this.pr.ubot.network.myInfo,
                            this.pr.poolId,
                            UBotCloudNotification.types.DOWNLOAD_STARTING_CONTRACT,
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
        if (notification.type === UBotCloudNotification.types.DOWNLOAD_STARTING_CONTRACT && !notification.isAnswer) {
            this.pulse();
        }
    }
}

module.exports = {ProcessDownloadStartingContract};