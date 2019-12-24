/*
 * Copyright (c) 2019-present Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

const ProcessBase = require("ubot/processes/ProcessBase").ProcessBase;
const UBotCloudNotification = require("ubot/ubot_notification").UBotCloudNotification;
const Boss = require('boss.js');
const ut = require("ubot/ubot_tools");

class ProcessDownloadRequestContract extends ProcessBase {
    constructor(processor, onReady) {
        super(processor, onReady)
    }

    start() {
        this.pr.logger.log("start ProcessDownloadRequestContract");

        // periodically try to download starting contract (retry on notify)
        this.pulse();
    }

    pulse() {
        this.pr.ubot.network.sendGetRequestToUbot(
            this.pr.respondToNotification.from,
            "/getRequestContract/" + this.pr.poolId.base64,
            async (respCode, body) => {
                if (respCode === 200) {
                    let ans = await Boss.load(body);
                    this.pr.requestContract = await Contract.fromPackedTransaction(ans.contractBin);
                    this.pr.executableContract = ut.getExecutableContract(this.pr.requestContract);
                    this.pr.initPoolAndQuorum();
                    // this.pr.pool = [];
                    // ans.selectedPool.forEach(i => this.pr.pool.push(this.pr.ubot.network.netConfig.getInfo(i)));
                    // this.pr.pool.forEach((info, i) => this.pr.poolIndexes.set(info.number, i));
                    // this.pr.selfPoolIndex = this.pr.poolIndexes.get(this.pr.ubot.network.myInfo.number);
                    this.pr.ubot.network.deliver(this.pr.respondToNotification.from,
                        new UBotCloudNotification(
                            this.pr.ubot.network.myInfo,
                            this.pr.poolId,
                            this.pr.executableContract.id,
                            UBotCloudNotification.types.DOWNLOAD_STARTING_CONTRACT,
                            true
                        )
                    );
                    this.onReady();
                } else {
                    this.pr.logger.log("warning: getRequestContract respCode = "+ respCode);
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

module.exports = {ProcessDownloadRequestContract};