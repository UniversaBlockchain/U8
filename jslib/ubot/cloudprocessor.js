/*
 * Copyright (c) 2019-present Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

import {UBotQuantiser, UBotQuantiserProcesses, UBotQuantiserException} from "ubot/ubot_quantiser";

const ProcessSendRequestContract = require("ubot/processes/ProcessSendRequestContract").ProcessSendRequestContract;
const ProcessDownloadRequestContract = require("ubot/processes/ProcessDownloadRequestContract").ProcessDownloadRequestContract;
const ProcessStartExec = require("ubot/processes/ProcessStartExec").ProcessStartExec;
const ErrorRecord = require("errors").ErrorRecord;
const Errors = require("errors").Errors;
const UBotCloudNotification = require("ubot/ubot_notification").UBotCloudNotification;
const UBotPoolState = require("ubot/ubot_pool_state").UBotPoolState;
const PseudoRandom = require("pseudo_random").PseudoRandom;
const ut = require("ubot/ubot_tools");

class CloudProcessor {
    constructor(initialState, poolId, ubot, session) {
        this.state = initialState;
        this.poolId = poolId;
        this.requestContract = null;
        this.executableContract = null;
        this.ubot = ubot;
        this.session = session;
        this.logger = ubot.logger;
        this.ledger = ubot.ledger;
        this.currentProcess = null;
        this.selfPoolIndex = null;
        this.respondToNotification = null;
        this.output = null;
        this.errors = [];
        this.methodName = null;
        this.methodArgs = [];
        this.poolSize = 0;
        this.quorumSize = 0;
        this.worker = null;
        this.userHttpClient = null;

        this.quantiser = new UBotQuantiser();
        this.quantiser.reset(700);      // TODO: get limit from session

        try {
            this.quantiser.addWorkCost(UBotQuantiserProcesses.PRICE_START_CLOUD_METHOD);
        } catch (err) {
            let message = "Failed initialize cloud processor poolId: " + this.poolId + ", error: " + err.message;
            this.logger.log(message);
            this.errors.push(new ErrorRecord(Errors.FAILURE, "CloudProcessor.constructor", message));
            this.changeState(UBotPoolState.FAILED);
            return;
        }

        this.pool = [];
        this.poolIndexes = new Map();
        this.ProcessStartExec = ProcessStartExec;
        this.prng = new PseudoRandom(poolId);
        this.selectPool();

        // this.localStorage = new Map();
    }

    selectPool() {
        let pool = this.session.pool;
        this.ubot.network.netConfig.toList().forEach(ubot => {
            if (~pool.indexOf(ubot.number))
                this.pool.push(ubot);
        });

        this.pool.forEach((info, i) => this.poolIndexes.set(info.number, i));
        this.selfPoolIndex = this.poolIndexes.get(this.ubot.network.myInfo.number);
    }

    startProcessingCurrentState() {
        switch (this.state) {
            case UBotPoolState.SEND_STARTING_CONTRACT:
                this.currentProcess = new ProcessSendRequestContract(this, ()=>{
                    this.logger.log("CloudProcessor.ProcessSendRequestContract.onReady");
                    this.changeState(UBotPoolState.START_EXEC);
                });
                break;
            case UBotPoolState.DOWNLOAD_STARTING_CONTRACT:
                this.currentProcess = new ProcessDownloadRequestContract(this, () => {
                    this.logger.log("CloudProcessor.ProcessDownloadRequestContract.onReady, poolSize = " + this.poolSize);
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
                this.ubot.cloudProcessorsCache.put(this.poolId.base64);
                this.ProcessStartExec = null;
                return;
        }

        this.currentProcess.start();
    }

    changeState(newState) {
        if (~this.state.nextStates.indexOf(newState.ordinal)) {
            this.state = newState;
            this.startProcessingCurrentState();
        } else if (this.state !== newState)
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
        this.methodName = this.requestContract.state.data.method_name;

        if (this.requestContract.state.data.hasOwnProperty("method_args"))
            this.methodArgs = this.requestContract.state.data.method_args;

        if (this.executableContract.state.data.cloud_methods.hasOwnProperty(this.methodName)) {
            try {
                let result = ut.getPoolAndQuorumFromMetadata(
                    this.executableContract.state.data.cloud_methods[this.methodName],
                    this.ubot.network.netConfig.size);

                this.poolSize = result.pool;
                this.quorumSize = result.quorum;
            } catch (err) {
                let message = "Failed get pool and quorum of method \"" + this.methodName + "\": " + err.message;
                this.logger.log("Error CloudProcessor.initPoolAndQuorum. " + message);
                this.errors.push(new ErrorRecord(Errors.BAD_VALUE, "CloudProcessor.initPoolAndQuorum", message));
                this.changeState(UBotPoolState.FAILED);
            }

        } else {
            this.logger.log("Error CloudProcessor.initPoolAndQuorum undefined starting method: " + this.methodName);
            this.errors.push(new ErrorRecord(Errors.BAD_VALUE, "CloudProcessor.initPoolAndQuorum",
                "undefined starting method: " + this.methodName));
            this.changeState(UBotPoolState.FAILED);
        }
    }

    getDefaultRecordId(multi) {
        let concat = new Uint8Array(this.executableContract.id.digest.length + 1);
        concat[0] = multi ? 1 : 0;
        concat.set(this.executableContract.id.digest, 1);

        return crypto.HashId.of(concat);
    }

    /*deliverToOtherUBots(notification) {
        for (let i = 0; i < this.pool.length; ++i)
            if (this.pool[i].number !== this.ubot.network.myInfo.number)
                this.ubot.network.deliver(this.pool[i], notification);
    }*/
}

module.exports = {CloudProcessor};
