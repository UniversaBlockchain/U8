const ProcessBase = require("ubot/processes/ProcessBase").ProcessBase;
const UBotAsmProcess_writeSingleStorage = require("ubot/processes/UBotAsmProcess_writeSingleStorage").UBotAsmProcess_writeSingleStorage;
const UBotAsmProcess_writeMultiStorage = require("ubot/processes/UBotAsmProcess_writeMultiStorage").UBotAsmProcess_writeMultiStorage;
const ScheduleExecutor = require("executorservice").ScheduleExecutor;
const t = require("tools");
const ErrorRecord = require("errors").ErrorRecord;
const Errors = require("errors").Errors;
const UBotPoolState = require("ubot/ubot_pool_state").UBotPoolState;
const UBotCloudNotification_asmCommand = require("ubot/ubot_notification").UBotCloudNotification_asmCommand;
const Boss = require('boss.js');

class ProcessStartExec extends ProcessBase {
    constructor(processor, onReady) {
        super(processor, onReady);
        this.currentTask = null;
        this.var0 = null;
        this.var1 = null;
        this.output = null;
        this.commands = [];
        this.cmdIndex = 0;
    }

    start() {
        this.pr.logger.log("start ProcessStartExec");

        this.pr.logger.log("  methodName: " + this.pr.startingContract.state.data.methodName);
        this.pr.logger.log("  executableContractId: " + crypto.HashId.withDigest(this.pr.startingContract.state.data.executableContractId));
        this.pr.ubotAsm = ProcessStartExec.parseUbotAsmFromString(this.pr.executableContract.state.data.cloud_methods[this.pr.methodName].ubotAsm);

        this.currentTask = new ScheduleExecutor(async () => {
            await this.evalUbotAsm();
            this.pr.logger.log("  method result: " + this.output);
            this.onReady(this.output);
        }, 0, this.pr.ubot.executorService).run();
    }

    static parseUbotAsmFromString(str) {
        let res = str.replace(/\r|\n/g, "");
        res = res.split(";");
        res = res.filter(cmd => cmd !== "");
        return res;
    }

    async evalUbotAsm() {
        while (this.cmdIndex < this.pr.ubotAsm.length) {
            await this.evalUbotAsmOp(this.cmdIndex, this.pr.ubotAsm[this.cmdIndex]);
            this.cmdIndex++;
        }
    }

    async evalUbotAsmOp(cmdIndex, op) {
        this.pr.logger.log("          op " + op);

        let ops = op.split(' ');
        let param = (ops.length > 1) ? ops[1] : null;

        switch (ops[0]) {
            case "calc2x2":
                this.var0 = await Boss.dump({val: 4});
                break;
            case "null":
                this.var0 = null;
                break;
            case "ifTrue":
                if (this.var0)
                    this.cmdIndex += param;
                break;
            case "ifFalse":
                if (!this.var0)
                    this.cmdIndex += param;
                break;
            case "equal":
                this.var0 = t.valuesEqual(this.var0, this.var1);
                break;
            case "finish":
                this.output = this.var0;
                break;
            case "moveTo":
                this[param] = this.var0;
                break;
            case "moveFrom":
                this.var0 = this[param];
                break;
            case "newObj":
                this.var0 = {};
                break;
            case "insertObj":
                if(this.var0 instanceof Object)
                    this.var0[param] = this.var1;
                else {
                    this.pr.logger.log("Error: this.var0 is not an Object class " + this.var0);
                    throw new ex.IllegalArgumentError("Error: this.var0 is not an Object class " + this.var0);
                }
                break;
            case "getObj":
                if(this.var0 instanceof Object)
                    this.var0 = this.var0[param];
                else {
                    this.pr.logger.log("Error: this.var0 is not an Object class " + this.var0);
                    throw new ex.IllegalArgumentError("Error: this.var0 is not an Object class " + this.var0);
                }
                break;
            case "hasOwnProperty":
                if(this.var0 instanceof Object)
                    this.var0 = this.var0.hasOwnProperty(param);
                else {
                    this.pr.logger.log("Error: this.var0 is not an Object class " + this.var0);
                    throw new ex.IllegalArgumentError("Error: this.var0 is not an Object class " + this.var0);
                }
                break;
            case "getHash":
                this.var0 = crypto.HashId.of(this.var0).digest;
                break;
            case "generateRandomHash":
                this.var0 = crypto.HashId.of(t.randomBytes(64)).digest;
                break;
            case "writeSingleStorage":
                await this.runUBotAsmCmd(cmdIndex, UBotAsmProcess_writeSingleStorage, this.var0);
                break;
            case "writeMultiStorage":
                await this.runUBotAsmCmd(cmdIndex, UBotAsmProcess_writeMultiStorage, this.var0);
                break;
            default:
                this.pr.logger.log("error: ubotAsm code '" + op + "' not found");
                this.pr.errors.push(new ErrorRecord(Errors.UNKNOWN_COMMAND, "ubotAsm", "ubotAsm code '" + op + "' not found"));
                this.pr.changeState(UBotPoolState.FAILED);
        }
    }

    async runUBotAsmCmd(cmdIndex, cmdClass, ...params) {
        return new Promise(resolve => {
            let cmd = new cmdClass(this.pr, ()=>{
                resolve();
            }, this, cmdIndex);
            this.commands[cmdIndex] = cmd;
            cmd.init(...params);
            cmd.start();
        });
    }

    async onNotify(notification) {
        if (notification instanceof UBotCloudNotification_asmCommand)
            if (this.commands[notification.cmdIndex] != null)
                await this.commands[notification.cmdIndex].onNotify(notification);
    }
}

module.exports = {ProcessStartExec};