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
        this.var2 = null;
        this.output = null;
        this.commands = [];
    }

    start() {
        this.pr.logger.log("start ProcessStartExec");

        this.pr.logger.log("  methodName: " + this.pr.startingContract.state.data.methodName);
        this.pr.logger.log("  executableContractId: " + crypto.HashId.withDigest(this.pr.startingContract.state.data.executableContractId));
        this.pr.ubotAsm = this.parseUbotAsmFromString(this.pr.executableContract.state.data.cloud_methods[this.pr.methodName].ubotAsm);

        this.currentTask = new ScheduleExecutor(async () => {
            await this.evalUbotAsm();
            this.pr.logger.log("  method result: " + this.output);
            this.onReady(this.output);
        }, 0, this.pr.ubot.executorService).run();
    }

    parseUbotAsmFromString(str) {
        let res = str.replace(/\r|\n/g, "");
        res = res.split(";");
        res = res.filter(cmd => cmd !== "");
        return res;
    }

    async evalUbotAsm() {
        for (let i = 0; i < this.pr.ubotAsm.length; ++i) {
            let op = this.pr.ubotAsm[i];
            await this.evalUbotAsmOp(i, op);
        }
    }

    async evalUbotAsmOp(cmdIndex, op) {
        switch (op) {
            case "calc2x2":
                this.pr.logger.log("          op " + op);
                this.var0 = await Boss.dump({val: 4});
                break;
            case "finish":
                this.pr.logger.log("          op " + op);
                this.output = this.var0;
                break;
            case "generateRandomHash":
                this.pr.logger.log("          op " + op);
                this.var0 = crypto.HashId.of(t.randomBytes(64)).digest;
                break;
            case "writeSingleStorage":
                this.pr.logger.log("          op work in progress: " + op);
                await this.runUBotAsmCmd(cmdIndex, UBotAsmProcess_writeSingleStorage, this.var0);
                break;
            case "writeMultiStorage":
                this.pr.logger.log("          op work in progress: " + op);
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