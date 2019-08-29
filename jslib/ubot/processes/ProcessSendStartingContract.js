/*
 * Copyright (c) 2019 Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

const ProcessBase = require("ubot/processes/ProcessBase").ProcessBase;
const UBotConfig = require("ubot/ubot_config").UBotConfig;
const ExecutorWithFixedPeriod = require("executorservice").ExecutorWithFixedPeriod;
const t = require("tools");
const UBotCloudNotification = require("ubot/ubot_notification").UBotCloudNotification;

class ProcessSendStartingContract extends ProcessBase {
    constructor(processor, onReady) {
        super(processor, onReady);
        this.currentTask = null;
        this.otherAnswers = new Set();
    }

    selectPool() {
        let list = this.pr.ubot.network.netConfig.toList();
        let myIndex = 0;
        for (let i = 1; i < list.length; ++i)
            if (list[i].number === this.pr.ubot.network.myInfo.number) {
                myIndex = i;
                break;
            }
        let me = list[myIndex];
        list.splice(myIndex, 1);
        this.pr.pool = t.randomChoice(list, this.pr.poolSize - 1);
        this.pr.pool.push(me);
        this.pr.pool.forEach((info, i) => this.pr.poolIndexes.set(info.number, i));
    }

    async start() {
        this.pr.logger.log("start ProcessSendStartingContract");

        this.pr.executableContract = await Contract.fromPackedTransaction(this.pr.startingContract.transactional.data.executableContract);

        this.pr.initPoolAndQuorum();
        this.selectPool();

        // periodically send notifications
        this.pulse();
        this.currentTask = new ExecutorWithFixedPeriod(() => {
            this.pulse();
        }, UBotConfig.send_starting_contract_period, this.pr.ubot.executorService).run();
    }

    pulse() {
        for (let i = 0; i < this.pr.pool.length; ++i)
            if (!this.otherAnswers.has(this.pr.pool[i].number) && this.pr.pool[i].number !== this.pr.ubot.network.myInfo.number)
                this.pr.ubot.network.deliver(this.pr.pool[i],
                    new UBotCloudNotification(
                        this.pr.ubot.network.myInfo,
                        this.pr.poolId,
                        UBotCloudNotification.types.DOWNLOAD_STARTING_CONTRACT,
                        false
                    )
                );
    }

    onNotify(notification) {
        if (notification.type === UBotCloudNotification.types.DOWNLOAD_STARTING_CONTRACT && notification.isAnswer) {
            this.otherAnswers.add(notification.from.number);
            if (this.otherAnswers.size >= this.pr.pool.length - 1) {
                this.currentTask.cancel();
                this.onReady();
            }
        }
    }

}

module.exports = {ProcessSendStartingContract};