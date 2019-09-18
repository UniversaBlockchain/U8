/*
 * Copyright (c) 2019-present Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

const ProcessBase = require("ubot/processes/ProcessBase").ProcessBase;
const UBotCloudNotification_process = require("ubot/ubot_notification").UBotCloudNotification_process;
const ErrorRecord = require("errors").ErrorRecord;
const Errors = require("errors").Errors;
const UBotPoolState = require("ubot/ubot_pool_state").UBotPoolState;

class UBotProcess_call extends ProcessBase {
    constructor(processor, onReady, mainProcess, procIndex) {
        super(processor, onReady);
        this.mainProcess = mainProcess;
        this.procIndex = procIndex;
        this.process = null;
        this.poolSize = 0;
        this.quorumSize = 0;
    }

    init(methodName) {
        this.methodName = methodName;

        if (this.pr.executableContract.state.data.cloud_methods.hasOwnProperty(this.methodName)) {
            if (this.pr.executableContract.state.data.cloud_methods[this.methodName].hasOwnProperty("pool"))
                this.poolSize = this.pr.executableContract.state.data.cloud_methods[this.methodName].pool.size;
            else
                this.poolSize = this.pr.poolSize;

            if (this.pr.executableContract.state.data.cloud_methods[this.methodName].hasOwnProperty("quorum"))
                this.quorumSize = this.pr.executableContract.state.data.cloud_methods[this.methodName].quorum.size;
            else
                this.quorumSize = this.pr.quorumSize;

            if (this.poolSize > this.pr.poolSize || this.quorumSize > this.pr.quorumSize) {
                this.pr.logger.log("Error UBotProcess_call: insufficient pool or quorum to call method '" + this.methodName + "'");
                this.pr.errors.push(new ErrorRecord(Errors.FAILURE, "UBotProcess_call",
                    "insufficient pool or quorum to call method '" + this.methodName + "'"));
                this.pr.changeState(UBotPoolState.FAILED);
            }

        } else {
            this.poolSize = this.pr.poolSize;
            this.quorumSize = this.pr.quorumSize;
        }
    }

    start() {
        this.pr.logger.log("start UBotProcess_call " + this.methodName);

        this.process = new this.pr.ProcessStartExec(this.pr, (output) => {
            this.pr.logger.log("UBotProcess_call.onReady, method: " + this.methodName + ", result: " + output);
            this.onReady(output);
        }, this.procIndex);

        // transfer arguments
        let argNum = 0;
        while (this.mainProcess.hasOwnProperty("var" + argNum) && this.mainProcess["var" + argNum] !== undefined) {
            this.process["var" + argNum] = this.mainProcess["var" + argNum];
            argNum++;
        }

        this.process.start(this.methodName, false);
    }

    async onNotify(notification) {
        if (notification instanceof UBotCloudNotification_process) {
            if (this.process != null)
                // transfer notification
                await this.process.onNotify(notification);
        } else {
            this.pr.logger.log("warning: UBotProcess_call - wrong notification received");
        }
    }
}

module.exports = {UBotProcess_call};