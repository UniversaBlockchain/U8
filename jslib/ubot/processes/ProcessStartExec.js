/*
 * Copyright (c) 2019-present Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

import {getWorker, consoleWrapper, farcallWrapper} from 'worker'
import {HttpClient} from 'web'
import {UBotQuantiserProcesses} from "ubot/ubot_quantiser";

const ProcessBase = require("ubot/processes/ProcessBase").ProcessBase;
const UBotProcess_writeSingleStorage = require("ubot/processes/UBotProcess_writeSingleStorage").UBotProcess_writeSingleStorage;
const UBotProcess_writeMultiStorage = require("ubot/processes/UBotProcess_writeMultiStorage").UBotProcess_writeMultiStorage;
const ScheduleExecutor = require("executorservice").ScheduleExecutor;
const BossBiMapper = require("bossbimapper").BossBiMapper;
const UBotConfig = require("ubot/ubot_config").UBotConfig;
const t = require("tools");
const ut = require("ubot/ubot_tools");
const ErrorRecord = require("errors").ErrorRecord;
const Errors = require("errors").Errors;
const UBotProcessException = require("ubot/ubot_exceptions").UBotProcessException;
const UBotPoolState = require("ubot/ubot_pool_state").UBotPoolState;
const UBotCloudNotification_process = require("ubot/ubot_notification").UBotCloudNotification_process;
const Boss = require('boss.js');
const roles = require('roles');
const Constraint = require('constraint').Constraint;
const permissions = require('permissions');

// const UBotProcess_call = require("ubot/processes/UBotProcess_call").UBotProcess_call;
// const notSupportedCommandsInMultiVerify = ["call", "writeSingleStorage", "writeMultiStorage", "replaceSingleStorage", "replaceMultiStorage"];

class ProcessStartExec extends ProcessBase {

    static workerSrc = consoleWrapper + farcallWrapper + `
    const Contract = require("contract").Contract;
    
    function writeSingleStorage(data) {
        return new Promise((resolve, reject) => wrkInner.farcall("writeSingleStorage", [data], {},
            ans => resolve(ans), err => reject(err)
        ));
    }
    
    function writeMultiStorage(data) {
        return new Promise((resolve, reject) => wrkInner.farcall("writeMultiStorage", [data], {},
            ans => resolve(ans), err => reject(err)
        ));
    }
    
    function getSingleStorage() {
        return new Promise((resolve, reject) => wrkInner.farcall("getSingleStorage", [], {},
            ans => resolve(ans), err => reject(err)
        ));
    }
    
    function getMultiStorage() {
        return new Promise((resolve, reject) => wrkInner.farcall("getMultiStorage", [], {},
            ans => resolve(ans), err => reject(err)
        ));
    }
    
    function registerContract(contract) {
        return new Promise((resolve, reject) => wrkInner.farcall("registerContract", [contract], {},
            ans => resolve(ans), err => reject(err)
        ));
    }
    
    function createPoolContract() {
        return new Promise((resolve, reject) => wrkInner.farcall("createPoolContract", [], {},
            ans => resolve(ans), err => reject(err)
        ));
    }
    
    function preparePoolRevision(contract) {
        return new Promise((resolve, reject) => wrkInner.farcall("preparePoolRevision", [contract], {},
            ans => resolve(ans), err => reject(err)
        ));
    }
    
    function sealAndGetPackedTransactionByPool(contract) {
        return new Promise((resolve, reject) => wrkInner.farcall("sealAndGetPackedTransactionByPool", [contract], {},
            ans => resolve(ans), err => reject(err)
        ));
    }
    
    function doHTTPRequest(url) {
        return new Promise((resolve, reject) => wrkInner.farcall("doHTTPRequest", [url], {},
            ans => resolve(ans), err => reject(err)
        ));
    }
    
    function doHTTPRequestWithCallback(url, onComplete, onError = (err) => {}) {
        doHTTPRequest(url).then(onComplete, onError);
    }
    
    function getRequestContract() {
        return new Promise((resolve, reject) => wrkInner.farcall("getRequestContract", [], {},
            ans => resolve(ans), err => reject(err)
        ));
    }
    
    function getUBotRegistryContract() {
        return new Promise((resolve, reject) => wrkInner.farcall("getUBotRegistryContract", [], {},
            ans => resolve(ans), err => reject(err)
        ));
    }
    
    function getUBotNumber() {
        return new Promise((resolve, reject) => wrkInner.farcall("getUBotNumber", [], {},
            ans => resolve(ans), err => reject(err)
        ));
    }
    
    function getUBotNumberInPool() {
        return new Promise((resolve, reject) => wrkInner.farcall("getUBotNumberInPool", [], {},
            ans => resolve(ans), err => reject(err)
        ));
    }
    
    function errorFail(methodName, err) {
        return new Promise(resolve => wrkInner.farcall("errorFail", [methodName, err], {}, ans => resolve(ans)));
    }
    
    function startTransaction(string) {
        return new Promise((resolve, reject) => resolve());
    }
    
    function finishTransaction(string) {
        return new Promise((resolve, reject) => resolve());
    }
    `;

    constructor(processor, onReady /*, cmdStack = []*/) {
        super(processor, onReady);
        this.output = null;
        this.processes = [];
        this.procIndex = 0;
        this.readsFrom = new Map();
        this.writesTo = new Map();

        this.trustLevel = ut.getRequestStorageReadTrustLevel(this.pr.requestContract);
        if (this.trustLevel == null)
            this.trustLevel = UBotConfig.storageReadTrustLevel;

        this.requestTimes = [];
        this.maxWaitUbot = ut.getRequestMaxWaitUbot(this.pr.requestContract);

        // this.ubotAsm = [];
        // this.var0 = null;
        // this.var1 = null;
        // this.commands = [];
        // this.cmdIndex = 0;
        // this.cmdStack = cmdStack;
    }

    start(methodName = null, methodArgs = null, multiVerifyMethod = false) {
        if (methodName == null)
            methodName = this.pr.methodName;
        if (methodArgs == null)
            methodArgs = this.pr.methodArgs;
        //this.multiVerifyMethod = multiVerifyMethod;

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
                let methodExport = "wrkInner.export." + methodName + " = async(params) => {" +
                    "   try {" +
                    "       return await " + methodName + "(...params);" +
                    "   } catch (err) {" +
                    "       if (err.message != null)" +
                    "           console.error(\"Error in cloud method " + methodName + ": \" + err.message);" +
                    "       if (err.text != null)" +
                    "           console.error(\"Error in cloud method " + methodName + ": \" + err.text);" +
                    "       if (err.stack != null)" +
                    "           console.error(err.stack);" +
                    "       await errorFail(\"" + methodName + "\", err);" +
                    "   }" +
                    "};";

                this.pr.worker = await getWorker(1,
                    ProcessStartExec.workerSrc + this.pr.executableContract.state.data.js + methodExport);

                this.pr.logger.log("worker initialized");

                this.pr.worker.startFarcallCallbacks();

                this.pr.logger.log("start worker");

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

                this.pr.worker.export["registerContract"] = async (args, kwargs) => {
                    return await this.registerContract(args[0]);
                };

                this.pr.worker.export["createPoolContract"] = async (args, kwargs) => {
                    return await this.createPoolContract();
                };

                this.pr.worker.export["preparePoolRevision"] = async (args, kwargs) => {
                    return await this.preparePoolRevision(args[0]);
                };

                this.pr.worker.export["sealAndGetPackedTransactionByPool"] = async (args, kwargs) => {
                    return await this.sealAndGetPackedTransactionByPool(args[0]);
                };

                this.pr.worker.export["doHTTPRequest"] = async (args, kwargs) => {
                    return await this.doHTTPRequest(args[0]);
                };

                this.pr.worker.export["getRequestContract"] = async (args, kwargs) => {
                    return await this.getRequestContract();
                };

                this.pr.worker.export["getUBotRegistryContract"] = async (args, kwargs) => {
                    return await this.getUBotRegistryContract();
                };

                this.pr.worker.export["getUBotNumber"] = async (args, kwargs) => {
                    return this.getUBotNumber();
                };

                this.pr.worker.export["getUBotNumberInPool"] = async (args, kwargs) => {
                    return this.getUBotNumberInPool();
                };

                this.pr.worker.export["errorFail"] = (args, kwargs) => {
                    this.errorFail(args[0], args[1]);
                };

                this.pr.worker.export["__worker_bios_print"] = async (args, kwargs) => {
                    let out = args[0] === true ? console.error : console.logPut;
                    out("worker debug console:", ...args[1], args[2]);
                };

                let expired = Math.min(
                    this.pr.executableContract.getExpiresAt().getTime(),
                    this.pr.requestContract.getExpiresAt().getTime(),
                    Date.now() + UBotConfig.requestExpiredTime
                );

                let terminate = false;
                let result = null;

                if (Date.now() <= expired) {
                    let startProcessorTime = this.pr.worker.getProcessorTime();
                    let startAbsoluteTime = Date.now();
                    result = await Promise.race([
                        new Promise(async (resolve) =>
                            await this.pr.worker.farcall(methodName, methodArgs, {}, ans => resolve(ans))
                        ),
                        new Promise(async (resolve) => {
                            do {
                                await sleep(UBotConfig.checkQuantiserPeriod);

                                if (this.pr.worker != null) {
                                    if (Date.now() > expired) {
                                        terminate = true;
                                        resolve(new UBotProcessException("Executable contract or request is expired"));
                                    }

                                    let endProcessorTime = this.pr.worker.getProcessorTime();
                                    let endAbsoluteTime = Date.now();
                                    let processorTime = endProcessorTime - startProcessorTime;
                                    let waitingTime = (endAbsoluteTime - startAbsoluteTime) / 1000 - processorTime;
                                    if (waitingTime < 0)
                                        waitingTime = 0;
                                    let cost = (UBotQuantiserProcesses.PRICE_WORK_MINUTE * processorTime +
                                        UBotQuantiserProcesses.PRICE_WAITING_MINUTE * waitingTime) / 60;

                                    try {
                                        this.pr.quantiser.addWorkCost(cost);
                                    } catch (err) {
                                        terminate = true;
                                        resolve(err);
                                    }

                                    startProcessorTime = endProcessorTime;
                                    startAbsoluteTime = endAbsoluteTime;
                                }
                            } while (this.pr.worker != null && !terminate);
                        })
                    ]);
                } else {
                    terminate = true;
                    result = new UBotProcessException("Executable contract or request is expired");
                }

                this.pr.logger.log("QuantaSum of " + methodName + ": " + this.pr.quantiser.quantaSum_);

                try {
                    await this.pr.session.close(this.pr.state !== UBotPoolState.FAILED && !terminate);
                    this.pr.session = null;

                    if (this.pr.userHttpClient != null) {
                        await this.pr.userHttpClient.stop();
                        this.pr.userHttpClient = null;
                    }

                    this.pr.worker.release(terminate);
                    this.pr.worker = null;
                } catch (err) {
                    console.error(err.stack);
                    console.error("Error closing session or worker: " + err.message);
                }


                if (terminate) {
                    this.pr.logger.log("Cloud method return error: " + result.message);
                    this.pr.errors.push(new ErrorRecord(Errors.FAILURE, methodName,
                        "Cloud method return error: " + result.message));
                    if (this.pr.state !== UBotPoolState.FAILED)
                        this.pr.changeState(UBotPoolState.FAILED);
                }

                if (this.pr.state !== UBotPoolState.FAILED) {
                    this.pr.logger.log("  method result: " + t.secureStringify(result, 1000));
                    this.onReady(result);
                } else
                    this.pr.logger.log("  method failed.");

            }, 0, this.pr.ubot.executorService).run();

        }
        // else if (this.pr.executableContract.state.data.cloud_methods[methodName].hasOwnProperty("ubotAsm")) {
        //     this.ubotAsm = ProcessStartExec.parseUbotAsmFromString(this.pr.executableContract.state.data.cloud_methods[methodName].ubotAsm);
        //
        //     new ScheduleExecutor(async () => {
        //         await this.evalUbotAsm();
        //         this.pr.logger.log("  method result: " + this.output);
        //         this.onReady(this.output);
        //     }, 0, this.pr.ubot.executorService).run();
        // }
    }

    initStorages(methodData) {
        if (methodData.readsFrom != null && methodData.readsFrom instanceof Array)
            methodData.readsFrom.forEach(rf => this.readsFrom.set(rf.storage_name, rf));

        if (methodData.writesTo != null && methodData.writesTo instanceof Array)
            methodData.writesTo.forEach(wt => this.writesTo.set(wt.storage_name, wt));
    }

    // static parseUbotAsmFromString(str) {
    //     let res = str.replace(/\r|\n/g, "");
    //     res = res.split(";");
    //     res = res.filter(cmd => cmd !== "");
    //     return res;
    // }
    //
    // async evalUbotAsm() {
    //     while (this.cmdIndex < this.ubotAsm.length) {
    //         await this.evalUbotAsmOp(this.cmdIndex, this.ubotAsm[this.cmdIndex]);
    //         this.cmdIndex++;
    //     }
    // }
    //
    // async evalUbotAsmOp(cmdIndex, op) {
    //     this.pr.logger.log("          op " + op);
    //
    //     let ops = op.split(' ');
    //     let param = (ops.length > 1) ? ops[1] : null;
    //     let storageName;
    //     let storageData;
    //
    //     if (this.multiVerifyMethod && ~notSupportedCommandsInMultiVerify.indexOf(ops[0])) {
    //         this.pr.logger.log("Error: don`t support command in multi-verify method: " + ops[0]);
    //         this.pr.errors.push(new ErrorRecord(Errors.NOT_SUPPORTED, "multi-verify method",
    //             "Error: don`t support command in multi-verify method: " + ops[0]));
    //         this.pr.changeState(UBotPoolState.FAILED);
    //     }
    //
    //     switch (ops[0]) {
    //         case "calc2x2":
    //             this.var0 = await Boss.dump({val: 4});
    //             break;
    //         case "null":
    //             this.var0 = null;
    //             break;
    //         case "ifTrue":
    //             if (this.var0)
    //                 this.cmdIndex += Number(param);
    //             break;
    //         case "ifFalse":
    //             if (!this.var0)
    //                 this.cmdIndex += Number(param);
    //             break;
    //         case "equal":
    //             this.var0 = t.valuesEqual(this.var0, this.var1);
    //             break;
    //         case "finish":
    //             this.output = this.var0;
    //             this.cmdIndex = this.ubotAsm.length;
    //             break;
    //         case "moveTo":
    //             this[param] = this.var0;
    //             break;
    //         case "moveFrom":
    //             this.var0 = this[param];
    //             break;
    //         case "newObj":
    //             this.var0 = {};
    //             break;
    //         case "insertObj":
    //             if(this.var0 instanceof Object)
    //                 this.var0[param] = this.var1;
    //             else {
    //                 this.pr.logger.log("Error: this.var0 is not an Object class");
    //                 this.pr.errors.push(new ErrorRecord(Errors.BAD_VALUE, "insertObj", "Error: this.var0 is not an Object class"));
    //                 this.pr.changeState(UBotPoolState.FAILED);
    //             }
    //             break;
    //         case "getObj":
    //             if(this.var0 instanceof Object)
    //                 this.var0 = this.var0[param];
    //             else {
    //                 this.pr.logger.log("Error: this.var0 is not an Object class");
    //                 this.pr.errors.push(new ErrorRecord(Errors.BAD_VALUE, "getObj", "Error: this.var0 is not an Object class"));
    //                 this.pr.changeState(UBotPoolState.FAILED);
    //             }
    //             break;
    //         case "hasOwnProperty":
    //             if(this.var0 instanceof Object)
    //                 this.var0 = this.var0.hasOwnProperty(param);
    //             else {
    //                 this.pr.logger.log("Error: this.var0 is not an Object class");
    //                 this.pr.errors.push(new ErrorRecord(Errors.BAD_VALUE, "hasOwnProperty", "Error: this.var0 is not an Object class"));
    //                 this.pr.changeState(UBotPoolState.FAILED);
    //             }
    //             break;
    //         case "getHash":
    //             this.var0 = crypto.HashId.of(this.var0).digest;
    //             break;
    //         case "call":
    //             this.var0 = await this.runUBotAsmCmd(cmdIndex, UBotProcess_call, param);
    //             break;
    //         case "aggregateRandom":
    //             if (this.var0 instanceof Array) {
    //                 let concat = new Uint8Array(this.var0.length * 96);
    //                 let offset = 0;
    //                 for (let value of this.var0) {
    //                     concat.set(value.random, offset);
    //                     offset += value.random.length;
    //                 }
    //                 this.var0 = crypto.HashId.of(concat).digest;
    //             } else {
    //                 this.pr.logger.log("Error: this.var0 is not array");
    //                 this.pr.errors.push(new ErrorRecord(Errors.BAD_VALUE, "aggregateRandom", "Error: this.var0 is not array"));
    //                 this.pr.changeState(UBotPoolState.FAILED);
    //             }
    //             break;
    //         case "putLocalStorage":
    //             this.pr.localStorage.set(param, this.var0);
    //             break;
    //         case "getLocalStorage":
    //             this.var0 = this.pr.localStorage.get(param);
    //             if (this.var0 === undefined)
    //                  this.var0 = null;
    //             break;
    //         case "generateRandomHash":
    //             this.var0 = crypto.HashId.of(t.randomBytes(64)).digest;
    //             break;
    //         case "getRecords":
    //             storageName = (param != null) ? param : "default";
    //             if (this.readsFrom.get(storageName) != null)
    //                 this.var0 = await this.pr.ubot.getAllRecordsFromMultiStorage(this.pr.executableContract.id, storageName);
    //             else {
    //                 this.pr.logger.log("Can`t read from multi-storage: " + storageName);
    //                 this.pr.errors.push(new ErrorRecord(Errors.FORBIDDEN, "getRecords",
    //                     "Can`t read from multi-storage: " + storageName));
    //                 this.pr.changeState(UBotPoolState.FAILED);
    //             }
    //             break;
    //         case "writeSingleStorage":
    //             storageName = (param != null) ? param : "default";
    //             storageData = this.writesTo.get(storageName);
    //             if (storageData != null)
    //                 await this.runUBotAsmCmd(cmdIndex, UBotProcess_writeSingleStorage, this.var0, null, storageData);
    //             else {
    //                 this.pr.logger.log("Can`t write to single-storage: " + storageName);
    //                 this.pr.errors.push(new ErrorRecord(Errors.FORBIDDEN, "writeSingleStorage",
    //                     "Can`t write to single-storage: " + storageName));
    //                 this.pr.changeState(UBotPoolState.FAILED);
    //             }
    //             break;
    //         case "writeMultiStorage":
    //             storageName = (param != null) ? param : "default";
    //             storageData = this.writesTo.get(storageName);
    //             if (storageData != null)
    //                 await this.runUBotAsmCmd(cmdIndex, UBotProcess_writeMultiStorage, this.var0, null, storageData);
    //             else {
    //                 this.pr.logger.log("Can`t write to multi-storage: " + storageName);
    //                 this.pr.errors.push(new ErrorRecord(Errors.FORBIDDEN, "writeMultiStorage",
    //                     "Can`t write to multi-storage: " + storageName));
    //                 this.pr.changeState(UBotPoolState.FAILED);
    //             }
    //             break;
    //         case "replaceSingleStorage":
    //             storageName = (param != null) ? param : "default";
    //             storageData = this.writesTo.get(storageName);
    //             if (storageData != null)
    //                 await this.runUBotAsmCmd(cmdIndex, UBotProcess_writeSingleStorage, this.var1,
    //                     crypto.HashId.withDigest(this.var0), storageData);
    //             else {
    //                 this.pr.logger.log("Can`t write to single-storage: " + storageName);
    //                 this.pr.errors.push(new ErrorRecord(Errors.FORBIDDEN, "replaceSingleStorage",
    //                     "Can`t write to single-storage: " + storageName));
    //                 this.pr.changeState(UBotPoolState.FAILED);
    //             }
    //             break;
    //         case "replaceMultiStorage":
    //             storageName = (param != null) ? param : "default";
    //             storageData = this.writesTo.get(storageName);
    //             if (storageData != null)
    //                 await this.runUBotAsmCmd(cmdIndex, UBotProcess_writeMultiStorage, this.var1,
    //                     crypto.HashId.withDigest(this.var0), storageData);
    //             else {
    //                 this.pr.logger.log("Can`t write to multi-storage: " + storageName);
    //                 this.pr.errors.push(new ErrorRecord(Errors.FORBIDDEN, "replaceMultiStorage",
    //                     "Can`t write to multi-storage: " + storageName));
    //                 this.pr.changeState(UBotPoolState.FAILED);
    //             }
    //             break;
    //         case "getSingleDataByRecordId":
    //             if (this.var0 instanceof Uint8Array)
    //                 this.var0 = await this.pr.ubot.getStorageResultByRecordId(crypto.HashId.withDigest(this.var0), false);
    //             else {
    //                 this.pr.logger.log("Error: this.var0 is not hash digest");
    //                 this.pr.errors.push(new ErrorRecord(Errors.BAD_VALUE, "getSingleDataByRecordId",
    //                     "Error: this.var0 is not hash digest"));
    //                 this.pr.changeState(UBotPoolState.FAILED);
    //             }
    //             break;
    //         case "getMultiDataByRecordId":
    //             if (this.var0 instanceof Uint8Array)
    //                 this.var0 = await this.pr.ubot.getStorageResultByRecordId(crypto.HashId.withDigest(this.var0), true,
    //                     this.pr.ubot.network.myInfo.number);
    //             else {
    //                 this.pr.logger.log("Error: this.var0 is not hash digest");
    //                 this.pr.errors.push(new ErrorRecord(Errors.BAD_VALUE, "getMultiDataByRecordId",
    //                     "Error: this.var0 is not hash digest"));
    //                 this.pr.changeState(UBotPoolState.FAILED);
    //             }
    //             break;
    //         default:
    //             this.pr.logger.log("error: ubotAsm code '" + op + "' not found");
    //             this.pr.errors.push(new ErrorRecord(Errors.UNKNOWN_COMMAND, "ubotAsm", "ubotAsm code '" + op + "' not found"));
    //             this.pr.changeState(UBotPoolState.FAILED);
    //     }
    // }
    //
    // async runUBotAsmCmd(cmdIndex, cmdClass, ...params) {
    //     let newStack = this.cmdStack.slice();
    //     newStack.push(cmdIndex);
    //
    //     return new Promise(async (resolve) => {
    //         let cmd = new cmdClass(this.pr, (result) => {
    //             resolve(result);
    //         }, this, newStack);
    //         this.commands[cmdIndex] = cmd;
    //         await cmd.init(...params);
    //         await cmd.start();
    //     });
    // }

    async onNotify(notification) {
        if (notification instanceof UBotCloudNotification_process) {
            // if (notification.procIndex instanceof Array) {
            //     if (notification.procIndex.length > 0 && this.commands[notification.procIndex[0]] != null) {
            //         // shift command index from stack
            //         let cmdIndex = notification.procIndex.shift();
            //
            //         await this.commands[cmdIndex].onNotify(notification);
            //     }
            // } else

            if (typeof notification.procIndex === "number" && this.processes[notification.procIndex] != null)
                await this.processes[notification.procIndex].onNotify(notification);
        }
    }

    /**
     * Write data to single storage.
     *
     * @param {*} data - Data to write to single storage. Data can be primitive JS types or
     * special U8 types that are may be packed by the Boss.
     * @return {Promise<void>}
     * @throws {UBotProcessException} process exception if can`t write empty data to single-storage.
     */
    async writeSingleStorage(data) {
        if (data != null) {
            try {
                this.pr.quantiser.addWorkCost(UBotQuantiserProcesses.PRICE_WRITE_SINGLE_STORAGE);
            } catch (err) {
                this.pr.logger.log("Error write data to single-storage: " + err.message);
                this.pr.logger.log(err.stack);
                this.pr.errors.push(new ErrorRecord(Errors.FAILURE, "writeSingleStorage",
                    "Error write data to single-storage: " + err.message));
                this.pr.changeState(UBotPoolState.FAILED);

                throw err;
            }

            return new Promise(async (resolve, reject) => {
                let proc = new UBotProcess_writeSingleStorage(this.pr,
                    result => resolve(result),
                    error => reject(error),
                    this, this.procIndex);
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

            throw new UBotProcessException("Error writeSingleStorage: Can`t write empty data to single-storage");
        }
    }

    /**
     * Write data to multi storage.
     *
     * @param {*} data - Data to write to multi storage.Data can be primitive JS types or
     * special U8 types that are may be packed by the Boss.
     * @return {Promise<void>}
     * @throws {UBotProcessException} process exception if can`t write empty data to multi-storage.
     */
    async writeMultiStorage(data) {
        if (data != null) {
            try {
                this.pr.quantiser.addWorkCost(UBotQuantiserProcesses.PRICE_WRITE_MULTI_STORAGE);
            } catch (err) {
                this.pr.logger.log("Error write data to multi-storage: " + err.message);
                this.pr.logger.log(err.stack);
                this.pr.errors.push(new ErrorRecord(Errors.FAILURE, "writeMultiStorage",
                    "Error write data to multi-storage: " + err.message));
                this.pr.changeState(UBotPoolState.FAILED);

                throw err;
            }
            
            return new Promise(async (resolve, reject) => {
                let proc = new UBotProcess_writeMultiStorage(this.pr,
                    result => resolve(result),
                    error => reject(error),
                    this, this.procIndex);
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

            throw new UBotProcessException("Error writeMultiStorage: Can`t write empty data to multi-storage");
        }
    }

    /**
     * Get data from single storage.
     *
     * @return {Promise<null|*>} data from single storage or null if storage is empty.
     */
    async getSingleStorage() {
        try {
            this.pr.quantiser.addWorkCost(UBotQuantiserProcesses.PRICE_GET_STORAGE);
            
            let recordId = this.pr.getDefaultRecordId(false);

            // get actual hash from MainNet by this.executableContract.id (further recordId)
            let actualHash = await this.pr.session.getStorage(false, this.trustLevel, this.pr.requestContract);
            if (actualHash == null) {
                this.pr.logger.log("getSingleStorage: getStorage return null");
                return null;
            } else
                this.pr.logger.log("getSingleStorage: actual hash = " + actualHash);

            let result = await this.pr.ubot.getStoragePackedResultByRecordId(recordId, false);

            if (result != null)
                this.pr.logger.log("getSingleStorage: current result hash = " + crypto.HashId.of(result));
            else
                this.pr.logger.log("getSingleStorage: current result is null");

            if (result == null || !actualHash.equals(crypto.HashId.of(result))) {
                this.pr.logger.log("getSingleStorage: searchActualStorageResult...");
                result = await this.pr.ubot.network.searchActualStorageResult(recordId, actualHash, false);

                if (result == null) {
                    this.pr.logger.log("getSingleStorage: searchActualStorageResult return null");
                    return null;
                }

                this.pr.ubot.resultCache.put(recordId, result);

                await this.pr.ledger.deleteFromSingleStorage(recordId);
                await this.pr.ledger.writeToSingleStorage(this.pr.executableContract.id, "default",
                    result, crypto.HashId.of(result), recordId);
            }

            return await BossBiMapper.getInstance().deserialize(await Boss.load(result));

        } catch (err) {
            this.pr.logger.log("Error get data from single-storage: " + err.message);
            this.pr.logger.log(err.stack);
            this.pr.errors.push(new ErrorRecord(Errors.FAILURE, "getSingleStorage",
                "Error get data from single-storage: " + err.message));
            this.pr.changeState(UBotPoolState.FAILED);

            throw err;
        }
    }

    /**
     * Get data from multi storage.
     *
     * @return {Promise<null|[*]>} data from multi storage or null if storage is empty.
     */
    async getMultiStorage() {
        try {
            this.pr.quantiser.addWorkCost(UBotQuantiserProcesses.PRICE_GET_STORAGE);
            
            let recordId = this.pr.getDefaultRecordId(true);

            // get actual hash from MainNet by this.executableContract.id (further recordId)
            let actualHash = await this.pr.session.getStorage(true, this.trustLevel, this.pr.requestContract);
            if (actualHash == null) {
                this.pr.logger.log("getMultiStorage: getStorage return null");
                return null;
            } else
                this.pr.logger.log("getMultiStorage: actual hash = " + actualHash);

            let result = await this.pr.ubot.getRecordsFromMultiStorageByRecordId(recordId);

            if (result != null) {
                this.pr.logger.log("getMultiStorage: current result hash = " + result.cortegeId);
                if (result.cortegeId.equals(actualHash))
                    return result.records;
            } else
                this.pr.logger.log("getMultiStorage: current result is null");

            this.pr.logger.log("getMultiStorage: searchActualStorageResult...");
            result = await this.pr.ubot.network.searchActualStorageResult(recordId, actualHash, true);

            if (result == null) {
                this.pr.logger.log("getMultiStorage: searchActualStorageResult return null");
                return null;
            }

            let cortege = new Map();
            let records = [];
            result.forEach(item => cortege.set(item.ubot_number, item.result));

            // put result to cache
            this.pr.ubot.resultCache.put(recordId, cortege);

            await this.pr.ledger.deleteFromMultiStorage(recordId);
            //TODO: replace on multi-insert
            for (let item of result) {
                records.push(await BossBiMapper.getInstance().deserialize(await Boss.load(item.result)));

                await this.pr.ledger.writeToMultiStorage(this.pr.executableContract.id, "default", item.result,
                    crypto.HashId.of(item.result), recordId, item.ubot_number);
            }

            return records;

        } catch (err) {
            this.pr.logger.log("Error get data from multi-storage: " + err.message);
            this.pr.logger.log(err.stack);
            this.pr.errors.push(new ErrorRecord(Errors.FAILURE, "getMultiStorage",
                "Error get data from multi-storage: " + err.message));
            this.pr.changeState(UBotPoolState.FAILED);

            throw err;
        }
    }

    /**
     * Register a contract (with transaction).
     *
     * @param {Uint8Array} packedTransaction - Packed transaction for registration.
     * @return {Promise<ItemResult>} - Result of registration or current state of registration (if wasn't finished yet).
     * @throws {UBotClientException} client exception if error register contract.
     */
    async registerContract(packedTransaction) {
        try {
            let contract = await Contract.fromPackedTransaction(packedTransaction);
            await contract.check();
            this.pr.quantiser.addWorkCostFrom(contract.quantiser);

            return await this.pr.session.registerContract(packedTransaction, this.pr.requestContract);

        } catch (err) {
            this.pr.logger.log("Error register contract: " + err.message);
            this.pr.logger.log(err.stack);
            this.pr.errors.push(new ErrorRecord(Errors.FAILURE, "registerContract",
                "Error register contract: " + err.message));
            this.pr.changeState(UBotPoolState.FAILED);

            throw err;
        }
    }

    /**
     * Create a pool contract. Pool contract a special contract for the formation and registration of the pool.
     *
     * @return {Promise<Contract>} pool contract.
     */
    async createPoolContract() {
        try {
            let c = new Contract();

            let created = this.pr.requestContract.definition.createdAt;
            created.setMilliseconds(0);
            c.definition.createdAt = created;
            c.state.createdAt = created;

            let expires = new Date(created);
            expires.setDate(expires.getDate() + 90);
            c.state.expiresAt = expires;

            // quorum vote role
            let issuer = new roles.QuorumVoteRole(
                "issuer",
                "refUbotRegistry.state.roles.ubots",
                this.pr.quorumSize.toString(),
                c
            );
            c.registerRole(issuer);
            let owner = new roles.RoleLink("owner", "issuer");
            c.registerRole(owner);
            let creator = new roles.RoleLink("creator", "issuer");
            c.registerRole(creator);

            // change owner permission
            let chown = new roles.RoleLink("@change_owner_role", "owner", c);
            let chownPerm = new permissions.ChangeOwnerPermission(chown);
            chownPerm.id = this.pr.prng.randomString(6);
            c.definition.addPermission(chownPerm);

            // constraint for UBotNet registry contract
            let constr = new Constraint(c);
            constr.name = "refUbotRegistry";
            constr.type = Constraint.TYPE_EXISTING_DEFINITION;
            let conditions = {};
            conditions[Constraint.conditionsModeType.all_of] = ["ref.tag == \"universa:ubot_registry_contract\""];
            constr.setConditions(conditions);
            c.addConstraint(constr);

            // random salt for seal (common for pool)
            c.state.data.ubot_pool_random_salt = this.pr.prng.randomBytes(12);

            return c;

        } catch (err) {
            this.pr.logger.log("Error create pool contract: " + err.message);
            this.pr.logger.log(err.stack);
            this.pr.errors.push(new ErrorRecord(Errors.FAILURE, "createPoolContract",
                "Error create pool contract: " + err.message));
            this.pr.changeState(UBotPoolState.FAILED);

            throw err;
        }
    }

    /**
     * Seal pool contract.
     *
     * @param {Contract} contract - Pool contract.
     * @return {Promise<Uint8Array>} packed transaction with sealed pool contract.
     */
    async sealPoolContract(contract) {
        // random salt for seal (common for pool)
        contract.ubot_pool_random_salt = this.pr.prng.randomBytes(12);

        await contract.seal(true);
        delete contract.ubot_pool_random_salt;

        return await contract.getPackedTransaction();
    }

    /**
     * Creation and preparation of a new contract revision for registration by the pool.
     *
     * @param {Uint8Array} packedTransaction - Packed transaction with pool contract.
     * @return {Promise<Uint8Array>} packed transaction with new revision of pool contract.
     */
    async preparePoolRevision(packedTransaction) {
        try {
            let contract = await Contract.fromPackedTransaction(packedTransaction);

            let created = this.pr.requestContract.definition.createdAt;
            created.setMilliseconds(0);
            contract.state.createdAt = created;

            contract.registerRole(new roles.QuorumVoteRole(
                "creator",
                "refUbotRegistry.state.roles.ubots",
                this.pr.quorumSize.toString(),
                contract
            ));

            // constraint for UBotNet registry contract
            contract.createTransactionalSection();
            let constr = new Constraint(contract);
            constr.name = "refUbotRegistry";
            constr.type = Constraint.TYPE_TRANSACTIONAL;
            let conditions = {};
            conditions[Constraint.conditionsModeType.all_of] = ["ref.tag == \"universa:ubot_registry_contract\""];
            constr.setConditions(conditions);
            contract.addConstraint(constr);

            return await this.sealPoolContract(contract);

        } catch (err) {
            this.pr.logger.log("Error prepare contract revision to pool registration: " + err.message);
            this.pr.logger.log(err.stack);
            this.pr.errors.push(new ErrorRecord(Errors.FAILURE, "preparePoolRevision",
                "Error prepare contract revision to pool registration: " + err.message));
            this.pr.changeState(UBotPoolState.FAILED);

            throw err;
        }
    }

    /**
     * Seal pool contract.
     *
     * @param {Uint8Array} packedTransaction - Packed transaction with pool contract.
     * @return {Promise<Uint8Array>} packed transaction with sealed pool contract.
     */
    async sealAndGetPackedTransactionByPool(packedTransaction) {
        try {
            let contract = await Contract.fromPackedTransaction(packedTransaction);
            return await this.sealPoolContract(contract);

        } catch (err) {
            this.pr.logger.log("Error seal contract by pool: " + err.message);
            this.pr.logger.log(err.stack);
            this.pr.errors.push(new ErrorRecord(Errors.FAILURE, "sealByPool",
                "Error seal contract by pool: " + err.message));
            this.pr.changeState(UBotPoolState.FAILED);

            throw err;
        }
    }

    /**
     * Executes an HTTP request to an external service by URL.
     *
     * @param {string} url - URL of the external service.
     * @return {Promise<{body: HTTP response body, response_code: HTTP response code}>} HTTP response.
     */
    async doHTTPRequest(url) {
        try {
            this.pr.quantiser.addWorkCost(UBotQuantiserProcesses.PRICE_HTTP_REQUEST);

            if (this.pr.userHttpClient == null)
                this.pr.userHttpClient = new HttpClient();

            return await new Promise(async(resolve, reject) => {
                try {
                    this.pr.userHttpClient.sendGetRequestUrl(url, (respCode, body) => {
                        resolve({
                            response_code: respCode,
                            body: body
                        });
                    });
                } catch (err) {
                    reject(err);
                }
            });

        } catch (err) {
            this.pr.logger.log("Error HTTP request: " + err.message);
            this.pr.logger.log(err.stack);
            this.pr.errors.push(new ErrorRecord(Errors.FAILURE, "doHTTPRequest", "Error HTTP request: " + err.message));
            this.pr.changeState(UBotPoolState.FAILED);

            throw err;
        }
    }

    /**
     * Get request contract (with TransactionPack).
     *
     * @return {Promise<Uint8Array>} packed transaction with request contract.
     */
    async getRequestContract() {
        return await this.pr.requestContract.getPackedTransaction();
    }

    /**
     * Get UBot registry contract (with TransactionPack).
     *
     * @return {Promise<Uint8Array>} packed transaction with UBot registry contract.
     */
    async getUBotRegistryContract() {
        return await this.pr.ubot.client.getUBotRegistryContract();
    }

    /**
     * Get number of UBot server.
     *
     * @return {number} number of UBot server.
     */
    getUBotNumber() {
        return this.pr.ubot.network.myInfo.number;
    }

    /**
     * Get UBot index in pool.
     *
     * @return {number} UBot index in pool.
     */
    getUBotNumberInPool() {
        return this.pr.selfPoolIndex;
    }

    errorFail(methodName, err) {
        let message = null;
        if (err != null) {
            if (err.message != null)
                message = err.message;
            else if (err.text != null)
                message = err.text;
        }

        this.pr.logger.log("Error in cloud method " + methodName + ": " + message);
        this.pr.errors.push(new ErrorRecord(Errors.FAILURE, methodName,
            "Error in cloud method " + methodName + ": " + message));
        if (this.pr.state !== UBotPoolState.FAILED)
            this.pr.changeState(UBotPoolState.FAILED);
    }
}

module.exports = {ProcessStartExec};