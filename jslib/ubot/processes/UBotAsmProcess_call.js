/*
 * Copyright (c) 2019-present Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

const ProcessBase = require("ubot/processes/ProcessBase").ProcessBase;
const UBotCloudNotification_asmCommand = require("ubot/ubot_notification").UBotCloudNotification_asmCommand;
const ErrorRecord = require("errors").ErrorRecord;
const Errors = require("errors").Errors;
const UBotPoolState = require("ubot/ubot_pool_state").UBotPoolState;

class UBotAsmProcess_call extends ProcessBase {
    constructor(processor, onReady, asmProcessor, cmdStack) {
        super(processor, onReady);
        this.asmProcessor = asmProcessor;
        this.cmdStack = cmdStack;
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
                this.pr.logger.log("Error UBotAsmProcess_call: insufficient pool or quorum to call method '" + this.methodName + "'");
                this.pr.errors.push(new ErrorRecord(Errors.FAILURE, "UBotAsmProcess_call",
                    "insufficient pool or quorum to call method '" + this.methodName + "'"));
                this.pr.changeState(UBotPoolState.FAILED);
            }

        } else {
            this.poolSize = this.pr.poolSize;
            this.quorumSize = this.pr.quorumSize;
        }
    }

    start() {
        this.pr.logger.log("start UBotAsmProcess_call " + this.methodName);

        this.process = new this.pr.ProcessStartExec(this.pr, (output) => {
            this.pr.logger.log("UBotAsmProcess_call.onReady, method: " + this.methodName + ", result: " + output);
            this.onReady(output);
        }, this.cmdStack);

        // transfer arguments
        let argNum = 0;
        while (this.asmProcessor.hasOwnProperty("var" + argNum) && this.asmProcessor["var" + argNum] !== undefined) {
            this.process["var" + argNum] = this.asmProcessor["var" + argNum];
            argNum++;
        }

        this.process.start(this.methodName, false);
    }

    async onNotify(notification) {
        if (notification instanceof UBotCloudNotification_asmCommand) {
            if (this.process != null)
                // transfer notification
                await this.process.onNotify(notification);
        } else {
            this.pr.logger.log("warning: UBotAsmProcess_call - wrong notification received");
        }
    }
}

module.exports = {UBotAsmProcess_call};