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

const notSupportedCommandsInMultiVerify = ["call", "writeSingleStorage", "writeMultiStorage", "replaceSingleStorage", "replaceMultiStorage"];

class ProcessStartExec extends ProcessBase {
    constructor(processor, onReady) {
        super(processor, onReady);
        this.var0 = null;
        this.var1 = null;
        this.output = null;
        this.commands = [];
        this.cmdIndex = 0;
        this.readsFrom = new Map();
        this.writesTo = new Map();
    }

    start(methodName = null, multiVerifyMethod = false) {
        if (methodName == null)
            methodName = this.pr.methodName;
        this.multiVerifyMethod = multiVerifyMethod;

        this.pr.logger.log("start ProcessStartExec");

        this.pr.logger.log("  methodName: " + methodName);
        this.pr.logger.log("  executableContractId: " + crypto.HashId.withDigest(this.pr.startingContract.state.data.executableContractId));

        this.initStorages(this.pr.executableContract.state.data.cloud_methods[methodName]);

        this.pr.ubotAsm = ProcessStartExec.parseUbotAsmFromString(this.pr.executableContract.state.data.cloud_methods[methodName].ubotAsm);

        new ScheduleExecutor(async () => {
            await this.evalUbotAsm();
            this.pr.logger.log("  method result: " + this.output);
            this.onReady(this.output);
        }, 0, this.pr.ubot.executorService).run();
    }

    initStorages(methodData) {
        if (methodData.readsFrom != null && methodData.readsFrom instanceof Array)
            for (let rf of methodData.readsFrom)
                this.readsFrom.set(rf.storage_name, rf);

        if (methodData.writesTo != null && methodData.writesTo instanceof Array)
            for (let wt of methodData.writesTo)
                this.writesTo.set(wt.storage_name, wt);
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
        let storageName;
        let storageData;

        if (this.multiVerifyMethod && ~notSupportedCommandsInMultiVerify.indexOf(ops[0])) {
            this.pr.logger.log("Error: don`t support command in multi-verify method: " + ops[0]);
            this.pr.errors.push(new ErrorRecord(Errors.NOT_SUPPORTED, "multi-verify method",
                "Error: don`t support command in multi-verify method: " + ops[0]));
            this.pr.changeState(UBotPoolState.FAILED);
        }

        switch (ops[0]) {
            case "calc2x2":
                this.var0 = await Boss.dump({val: 4});
                break;
            case "null":
                this.var0 = null;
                break;
            case "ifTrue":
                if (this.var0)
                    this.cmdIndex += Number(param);
                break;
            case "ifFalse":
                if (!this.var0)
                    this.cmdIndex += Number(param);
                break;
            case "equal":
                this.var0 = t.valuesEqual(this.var0, this.var1);
                break;
            case "finish":
                this.output = this.var0;
                this.cmdIndex = this.pr.ubotAsm.length;
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
                    this.pr.logger.log("Error: this.var0 is not an Object class");
                    this.pr.errors.push(new ErrorRecord(Errors.BAD_VALUE, "insertObj", "Error: this.var0 is not an Object class"));
                    this.pr.changeState(UBotPoolState.FAILED);
                }
                break;
            case "getObj":
                if(this.var0 instanceof Object)
                    this.var0 = this.var0[param];
                else {
                    this.pr.logger.log("Error: this.var0 is not an Object class");
                    this.pr.errors.push(new ErrorRecord(Errors.BAD_VALUE, "getObj", "Error: this.var0 is not an Object class"));
                    this.pr.changeState(UBotPoolState.FAILED);
                }
                break;
            case "hasOwnProperty":
                if(this.var0 instanceof Object)
                    this.var0 = this.var0.hasOwnProperty(param);
                else {
                    this.pr.logger.log("Error: this.var0 is not an Object class");
                    this.pr.errors.push(new ErrorRecord(Errors.BAD_VALUE, "hasOwnProperty", "Error: this.var0 is not an Object class"));
                    this.pr.changeState(UBotPoolState.FAILED);
                }
                break;
            case "getHash":
                this.var0 = crypto.HashId.of(this.var0).digest;
                break;
            case "aggregateRandom":
                if (this.var0 instanceof Map) {
                    let concat = new Uint8Array(this.var0.size * 96);
                    let offset = 0;
                    for (let value of this.var0.values()) {
                        concat.set(value, offset);
                        offset += value.length;
                    }
                    this.var0 = crypto.HashId.of(concat).digest;
                } else {
                    this.pr.logger.log("Error: this.var0 is not an Map class");
                    this.pr.errors.push(new ErrorRecord(Errors.BAD_VALUE, "aggregateRandom", "Error: this.var0 is not an Map class"));
                    this.pr.changeState(UBotPoolState.FAILED);
                }
                break;
            case "putLocalStorage":
                this.pr.localStorage.set(param, this.var0);
                break;
            case "getLocalStorage":
                this.var0 = this.pr.localStorage.get(param);
                if (this.var0 === undefined)
                     this.var0 = null;
                break;
            case "generateRandomHash":
                this.var0 = crypto.HashId.of(t.randomBytes(64)).digest;
                break;
            case "writeSingleStorage":
                storageName = (param != null) ? param : "default";
                storageData = this.writesTo.get(storageName);
                if (storageData != null)
                    await this.runUBotAsmCmd(cmdIndex, UBotAsmProcess_writeSingleStorage, await Boss.dump(this.var0), storageData);
                else {
                    this.pr.logger.log("Can`t write to single-storage: " + storageName);
                    this.pr.errors.push(new ErrorRecord(Errors.FORBIDDEN, "writeSingleStorage",
                        "Can`t write to single-storage: " + storageName));
                    this.pr.changeState(UBotPoolState.FAILED);
                }
                break;
            case "writeMultiStorage":
                storageName = (param != null) ? param : "default";
                storageData = this.writesTo.get(storageName);
                if (storageData != null)
                    await this.runUBotAsmCmd(cmdIndex, UBotAsmProcess_writeMultiStorage, await Boss.dump(this.var0), storageData);
                else {
                    this.pr.logger.log("Can`t write to multi-storage: " + storageName);
                    this.pr.errors.push(new ErrorRecord(Errors.FORBIDDEN, "writeMultiStorage",
                        "Can`t write to multi-storage: " + storageName));
                    this.pr.changeState(UBotPoolState.FAILED);
                }
                break;
            default:
                this.pr.logger.log("error: ubotAsm code '" + op + "' not found");
                this.pr.errors.push(new ErrorRecord(Errors.UNKNOWN_COMMAND, "ubotAsm", "ubotAsm code '" + op + "' not found"));
                this.pr.changeState(UBotPoolState.FAILED);
        }
    }

    async runUBotAsmCmd(cmdIndex, cmdClass, ...params) {
        return new Promise(async (resolve) => {
            let cmd = new cmdClass(this.pr, ()=>{
                resolve();
            }, this, cmdIndex);
            this.commands[cmdIndex] = cmd;
            cmd.init(...params);
            await cmd.start();
        });
    }

    async onNotify(notification) {
        if (notification instanceof UBotCloudNotification_asmCommand)
            if (this.commands[notification.cmdIndex] != null)
                await this.commands[notification.cmdIndex].onNotify(notification);
    }
}

module.exports = {ProcessStartExec};