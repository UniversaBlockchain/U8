/*
 * Copyright (c) 2019-present Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

import {getWorker, consoleWrapper, farcallWrapper} from 'worker'

const ProcessBase = require("ubot/processes/ProcessBase").ProcessBase;
const UBotProcess_writeSingleStorage = require("ubot/processes/UBotProcess_writeSingleStorage").UBotProcess_writeSingleStorage;
const UBotProcess_writeMultiStorage = require("ubot/processes/UBotProcess_writeMultiStorage").UBotProcess_writeMultiStorage;
const UBotProcess_call = require("ubot/processes/UBotProcess_call").UBotProcess_call;
const ScheduleExecutor = require("executorservice").ScheduleExecutor;
const t = require("tools");
const ErrorRecord = require("errors").ErrorRecord;
const Errors = require("errors").Errors;
const UBotPoolState = require("ubot/ubot_pool_state").UBotPoolState;
const UBotCloudNotification_process = require("ubot/ubot_notification").UBotCloudNotification_process;
const Boss = require('boss.js');

const notSupportedCommandsInMultiVerify = ["call", "writeSingleStorage", "writeMultiStorage", "replaceSingleStorage", "replaceMultiStorage"];

class ProcessStartExec extends ProcessBase {

    static workerSrc = consoleWrapper + farcallWrapper + `
    function writeSingleStorage(data) {
        return new Promise(resolve => wrkInner.farcall("writeSingleStorage", [data], {}, ans => {
            resolve(ans);
        }));
    }
    
    function writeMultiStorage(data) {
        return new Promise(resolve => wrkInner.farcall("writeMultiStorage", [data], {}, ans => {
            resolve(ans);
        }));
    }
    
    function getSingleStorage() {
        return new Promise(resolve => wrkInner.farcall("getSingleStorage", [], {}, ans => {
            resolve(ans);
        }));
    }
    
    function getMultiStorage() {
        return new Promise(resolve => wrkInner.farcall("getMultiStorage", [], {}, ans => {
            resolve(ans);
        }));
    }
    `;

    constructor(processor, onReady, cmdStack = []) {
        super(processor, onReady);
        this.ubotAsm = [];
        this.var0 = null;
        this.var1 = null;
        this.output = null;
        this.commands = [];
        this.processes = [];
        this.cmdIndex = 0;
        this.procIndex = 0;
        this.readsFrom = new Map();
        this.writesTo = new Map();
        this.cmdStack = cmdStack;
    }

    start(methodName = null, methodArgs = null, multiVerifyMethod = false) {
        if (methodName == null)
            methodName = this.pr.methodName;
        if (methodArgs == null)
            methodArgs = this.pr.methodArgs;
        this.multiVerifyMethod = multiVerifyMethod;

        this.pr.logger.log("start ProcessStartExec");

        this.pr.logger.log("  method name: " + methodName);
        this.pr.logger.log("  executable contract: " + this.pr.requestContract.state.data.executable_contract_id);

        this.initStorages(this.pr.executableContract.state.data.cloud_methods[methodName]);

        if (this.pr.executableContract.state.data.hasOwnProperty("js")) {
            if (this.pr.worker != null) {
                this.pr.logger.log("Error: worker is already running");
                return;
            }

            new ScheduleExecutor(async () => {
                //let methodExport = "wrkInner.export." + methodName + " = " + methodName + ";";
                let methodExport = "wrkInner.export." + methodName + " = async(params) => {" +
                    "   try {" +
                    "      return await " + methodName + "(...params);" +
                    "   } catch (err) {" +
                    "       console.error(err.message);" +
                    "   }" +
                    "};";

                this.pr.worker = await getWorker(1,
                    ProcessStartExec.workerSrc + this.pr.executableContract.state.data.js + methodExport);
                this.pr.worker.startFarcallCallbacks();

                this.pr.worker.export["writeSingleStorage"] = async (args, kwargs) => {
                    return await this.writeSingleStorage(args[0]);
                };

                this.pr.worker.export["writeMultiStorage"] = async (args, kwargs) => {
                    return await this.writeMultiStorage(args[0]);
                };

                this.pr.worker.export["getSingleStorage"] = async (args, kwargs) => {
                    return await this.getSingleStorage();
                };

                this.pr.worker.export["getMultiStorage"] = async (args, kwargs) => {
                    return await this.getMultiStorage();
                };

                this.pr.worker.export["__worker_bios_print"] = async (args, kwargs) => {
                    let out = args[0] === true ? console.error : console.logPut;
                    out("worker debug console:", ...args[1], args[2]);
                };

                let result = await new Promise(resolve => this.pr.worker.farcall(methodName, methodArgs, {}, ans => resolve(ans)));

                await this.pr.session.close();

                this.pr.worker.release();
                this.pr.worker = null;

                this.pr.logger.log("  method result: " + result);
                this.onReady(result);
            }, 0, this.pr.ubot.executorService).run();

        } else if (this.pr.executableContract.state.data.cloud_methods[methodName].hasOwnProperty("ubotAsm")) {
            this.ubotAsm = ProcessStartExec.parseUbotAsmFromString(this.pr.executableContract.state.data.cloud_methods[methodName].ubotAsm);

            new ScheduleExecutor(async () => {
                await this.evalUbotAsm();
                this.pr.logger.log("  method result: " + this.output);
                this.onReady(this.output);
            }, 0, this.pr.ubot.executorService).run();
        }
    }

    initStorages(methodData) {
        if (methodData.readsFrom != null && methodData.readsFrom instanceof Array)
            methodData.readsFrom.forEach(rf => this.readsFrom.set(rf.storage_name, rf));

        if (methodData.writesTo != null && methodData.writesTo instanceof Array)
            methodData.writesTo.forEach(wt => this.writesTo.set(wt.storage_name, wt));
    }

    static parseUbotAsmFromString(str) {
        let res = str.replace(/\r|\n/g, "");
        res = res.split(";");
        res = res.filter(cmd => cmd !== "");
        return res;
    }

    async evalUbotAsm() {
        while (this.cmdIndex < this.ubotAsm.length) {
            await this.evalUbotAsmOp(this.cmdIndex, this.ubotAsm[this.cmdIndex]);
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
                this.cmdIndex = this.ubotAsm.length;
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
            case "call":
                this.var0 = await this.runUBotAsmCmd(cmdIndex, UBotProcess_call, param);
                break;
            case "aggregateRandom":
                if (this.var0 instanceof Array) {
                    let concat = new Uint8Array(this.var0.length * 96);
                    let offset = 0;
                    for (let value of this.var0) {
                        concat.set(value.random, offset);
                        offset += value.random.length;
                    }
                    this.var0 = crypto.HashId.of(concat).digest;
                } else {
                    this.pr.logger.log("Error: this.var0 is not array");
                    this.pr.errors.push(new ErrorRecord(Errors.BAD_VALUE, "aggregateRandom", "Error: this.var0 is not array"));
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
            case "getRecords":
                storageName = (param != null) ? param : "default";
                if (this.readsFrom.get(storageName) != null)
                    this.var0 = await this.pr.ubot.getAllRecordsFromMultiStorage(this.pr.executableContract.id, storageName);
                else {
                    this.pr.logger.log("Can`t read from multi-storage: " + storageName);
                    this.pr.errors.push(new ErrorRecord(Errors.FORBIDDEN, "getRecords",
                        "Can`t read from multi-storage: " + storageName));
                    this.pr.changeState(UBotPoolState.FAILED);
                }
                break;
            case "writeSingleStorage":
                storageName = (param != null) ? param : "default";
                storageData = this.writesTo.get(storageName);
                if (storageData != null)
                    await this.runUBotAsmCmd(cmdIndex, UBotProcess_writeSingleStorage, this.var0, null, storageData);
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
                    await this.runUBotAsmCmd(cmdIndex, UBotProcess_writeMultiStorage, this.var0, null, storageData);
                else {
                    this.pr.logger.log("Can`t write to multi-storage: " + storageName);
                    this.pr.errors.push(new ErrorRecord(Errors.FORBIDDEN, "writeMultiStorage",
                        "Can`t write to multi-storage: " + storageName));
                    this.pr.changeState(UBotPoolState.FAILED);
                }
                break;
            case "replaceSingleStorage":
                storageName = (param != null) ? param : "default";
                storageData = this.writesTo.get(storageName);
                if (storageData != null)
                    await this.runUBotAsmCmd(cmdIndex, UBotProcess_writeSingleStorage, this.var1,
                        crypto.HashId.withDigest(this.var0), storageData);
                else {
                    this.pr.logger.log("Can`t write to single-storage: " + storageName);
                    this.pr.errors.push(new ErrorRecord(Errors.FORBIDDEN, "replaceSingleStorage",
                        "Can`t write to single-storage: " + storageName));
                    this.pr.changeState(UBotPoolState.FAILED);
                }
                break;
            case "replaceMultiStorage":
                storageName = (param != null) ? param : "default";
                storageData = this.writesTo.get(storageName);
                if (storageData != null)
                    await this.runUBotAsmCmd(cmdIndex, UBotProcess_writeMultiStorage, this.var1,
                        crypto.HashId.withDigest(this.var0), storageData);
                else {
                    this.pr.logger.log("Can`t write to multi-storage: " + storageName);
                    this.pr.errors.push(new ErrorRecord(Errors.FORBIDDEN, "replaceMultiStorage",
                        "Can`t write to multi-storage: " + storageName));
                    this.pr.changeState(UBotPoolState.FAILED);
                }
                break;
            case "getSingleDataByRecordId":
                if (this.var0 instanceof Uint8Array)
                    this.var0 = await this.pr.ubot.getStorageResultByRecordId(crypto.HashId.withDigest(this.var0), false);
                else {
                    this.pr.logger.log("Error: this.var0 is not hash digest");
                    this.pr.errors.push(new ErrorRecord(Errors.BAD_VALUE, "getSingleDataByRecordId",
                        "Error: this.var0 is not hash digest"));
                    this.pr.changeState(UBotPoolState.FAILED);
                }
                break;
            case "getMultiDataByRecordId":
                if (this.var0 instanceof Uint8Array)
                    this.var0 = await this.pr.ubot.getStorageResultByRecordId(crypto.HashId.withDigest(this.var0), true,
                        this.pr.ubot.network.myInfo.number);
                else {
                    this.pr.logger.log("Error: this.var0 is not hash digest");
                    this.pr.errors.push(new ErrorRecord(Errors.BAD_VALUE, "getMultiDataByRecordId",
                        "Error: this.var0 is not hash digest"));
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
        let newStack = this.cmdStack.slice();
        newStack.push(cmdIndex);

        return new Promise(async (resolve) => {
            let cmd = new cmdClass(this.pr, (result) => {
                resolve(result);
            }, this, newStack);
            this.commands[cmdIndex] = cmd;
            await cmd.init(...params);
            await cmd.start();
        });
    }

    async onNotify(notification) {
        if (notification instanceof UBotCloudNotification_process) {
            if (notification.procIndex instanceof Array) {
                if (notification.procIndex.length > 0 && this.commands[notification.procIndex[0]] != null) {
                    // shift command index from stack
                    let cmdIndex = notification.procIndex.shift();

                    await this.commands[cmdIndex].onNotify(notification);
                }
            } else if (typeof notification.procIndex === "number" && this.processes[notification.procIndex] != null)
                await this.processes[notification.procIndex].onNotify(notification);
        }
    }

    async writeSingleStorage(data) {
        if (data != null) {
            return new Promise(async (resolve) => {
                let proc = new UBotProcess_writeSingleStorage(this.pr, (result) => {
                    resolve(result);
                }, this, this.procIndex);
                this.processes[this.procIndex] = proc;
                this.procIndex++;

                await proc.init(data, this.pr.getDefaultRecordId(false), {storage_name : "default"});
                await proc.start();
            });
        } else {
            this.pr.logger.log("Can`t write empty data to single-storage");
            this.pr.errors.push(new ErrorRecord(Errors.FORBIDDEN, "writeSingleStorage",
                "Can`t write empty data to single-storage"));
            this.pr.changeState(UBotPoolState.FAILED);
        }
    }

    async writeMultiStorage(data) {
        if (data != null) {
            return new Promise(async (resolve) => {
                let proc = new UBotProcess_writeMultiStorage(this.pr, (result) => {
                    resolve(result);
                }, this, this.procIndex);
                this.processes[this.procIndex] = proc;
                this.procIndex++;

                await proc.init(data, this.pr.getDefaultRecordId(true), {storage_name : "default"});
                await proc.start();
            });
        } else {
            this.pr.logger.log("Can`t write empty data to multi-storage");
            this.pr.errors.push(new ErrorRecord(Errors.FORBIDDEN, "writeMultiStorage",
                "Can`t write empty data to multi-storage"));
            this.pr.changeState(UBotPoolState.FAILED);
        }
    }

    async getSingleStorage() {
        try {
            let recordId = this.pr.getDefaultRecordId(false);

            // get actual hash from MainNet by this.executableContract.id (further recordId)
            let actualHash = await this.pr.session.getStorage(false);

            let result = await this.pr.ubot.getStoragePackedResultByRecordId(recordId, false);

            if (result != null && actualHash.equals(crypto.HashId.of(result)))
                return await Boss.load(result);

            return await this.pr.ubot.network.searchActualStorageResult(recordId, actualHash, false);

        } catch (err) {
            this.pr.logger.log("Error get data from single-storage: " + err.message);
            this.pr.errors.push(new ErrorRecord(Errors.FAILURE, "getSingleStorage",
                "Error get data from single-storage: " + err.message));
            this.pr.changeState(UBotPoolState.FAILED);

            throw err;
        }
    }

    async getMultiStorage() {
        try {
            let recordId = this.pr.getDefaultRecordId(true);

            // get actual hash from MainNet by this.executableContract.id (further recordId)
            let actualHash = await this.pr.session.getStorage(true);

            let result = await this.pr.ubot.getRecordsFromMultiStorageByRecordId(recordId);

            if (result != null && result.cortegeId.equals(actualHash))
                return result.records;

            result = await this.pr.ubot.network.searchActualStorageResult(recordId, actualHash, true);

            if (result != null)
                return result.records;
            else
                return [];

        } catch (err) {
            this.pr.logger.log("Error get data from multi-storage: " + err.message);
            this.pr.errors.push(new ErrorRecord(Errors.FAILURE, "getMultiStorage",
                "Error get data from multi-storage: " + err.message));
            this.pr.changeState(UBotPoolState.FAILED);

            throw err;
        }

    }
}

module.exports = {ProcessStartExec};