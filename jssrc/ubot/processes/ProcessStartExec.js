/*
 * Copyright (c) 2019-present Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

import {getWorker, consoleWrapper, farcallWrapper} from 'worker'
import {HttpClient, DnsResolver} from 'web'
import {UBotQuantiserProcesses} from "ubot/ubot_quantiser";

const ProcessBase = require("ubot/processes/ProcessBase").ProcessBase;
const UBotProcess_writeSingleStorage = require("ubot/processes/UBotProcess_writeSingleStorage").UBotProcess_writeSingleStorage;
const UBotProcess_writeMultiStorage = require("ubot/processes/UBotProcess_writeMultiStorage").UBotProcess_writeMultiStorage;
const UBotStorageType = require("ubot/ubot_ledger").UBotStorageType;
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
const Lock = require("lock").Lock;

// const UBotProcess_call = require("ubot/processes/UBotProcess_call").UBotProcess_call;
// const notSupportedCommandsInMultiVerify = ["call", "writeSingleStorage", "writeMultiStorage", "replaceSingleStorage", "replaceMultiStorage"];

class ProcessStartExec extends ProcessBase {

    static workerSrc = consoleWrapper + farcallWrapper + `
    const Contract = require("contract").Contract;
    const UnsContract = require('services/unsContract').UnsContract;
    
    function writeSingleStorage(data, storageName = "default") {
        return new Promise((resolve, reject) => wrkInner.farcall("writeSingleStorage", [data, storageName], {},
            ans => resolve(ans), err => reject(err)
        ));
    }
    
    function writeMultiStorage(data, storageName = "default") {
        return new Promise((resolve, reject) => wrkInner.farcall("writeMultiStorage", [data, storageName], {},
            ans => resolve(ans), err => reject(err)
        ));
    }
    
    function getSingleStorage(storageName = "default") {
        return new Promise((resolve, reject) => wrkInner.farcall("getSingleStorage", [storageName], {},
            ans => resolve(ans), err => reject(err)
        ));
    }
    
    function getMultiStorage(storageName = "default") {
        return new Promise((resolve, reject) => wrkInner.farcall("getMultiStorage", [storageName], {},
            ans => resolve(ans), err => reject(err)
        ));
    }
    
    function writePoolBoundStorage(data, storageName = "default") {
        return new Promise((resolve, reject) => wrkInner.farcall("writeSingleStorage", [data, storageName], {},
            ans => resolve(ans), err => reject(err)
        ));
    }
    
    function writeWorkerBoundStorage(data, storageName = "default") {
        return new Promise((resolve, reject) => wrkInner.farcall("writeMultiStorage", [data, storageName], {},
            ans => resolve(ans), err => reject(err)
        ));
    }
    
    function getPoolBoundStorage(storageName = "default") {
        return new Promise((resolve, reject) => wrkInner.farcall("getSingleStorage", [storageName], {},
            ans => resolve(ans), err => reject(err)
        ));
    }
    
    function getWorkerBoundStorage(storageName = "default") {
        return new Promise((resolve, reject) => wrkInner.farcall("getMultiStorage", [storageName], {},
            ans => resolve(ans), err => reject(err)
        ));
    }
    
    function writeLocalStorage(data, storageName = "default") {
        return new Promise((resolve, reject) => wrkInner.farcall("writeLocalStorage", [data, storageName], {},
            ans => resolve(ans), err => reject(err)
        ));
    }
    
    function getLocalStorage(storageName = "default") {
        return new Promise((resolve, reject) => wrkInner.farcall("getLocalStorage", [storageName], {},
            ans => resolve(ans), err => reject(err)
        ));
    }
    
    function registerContract(packedTransaction, contractIdsForPoolSign = null) {
        return new Promise((resolve, reject) => wrkInner.farcall("registerContract", [packedTransaction, contractIdsForPoolSign], {},
            ans => resolve(ans), err => reject(err)
        ));
    }
    
    function registerTransaction(packedTransaction, contractIdsForPoolSign = null) {
        return new Promise((resolve, reject) => wrkInner.farcall("registerContract", [packedTransaction, contractIdsForPoolSign], {},
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
    
    function doHTTPRequest(url, method = undefined, headers = undefined, body = undefined, timeout = 5000) {
        return new Promise((resolve, reject) => wrkInner.farcall("doHTTPRequest", [url, method, headers, body, timeout], {},
            ans => resolve(ans), err => reject(err)
        ));
    }
    
    function doHTTPRequestWithCallback(url, onComplete, onError = (err) => {}, method = undefined, headers = undefined, body = undefined, timeout = 5000) {
        doHTTPRequest(url, method, headers, body, timeout).then(onComplete, onError);
    }
    
    function doDNSRequests(host, port, requests, timeout = 5000) {
        return new Promise((resolve, reject) => wrkInner.farcall("doDNSRequests", [host, port, requests, timeout], {},
            ans => resolve(ans), err => reject(err)
        ));
    }
    
    function doDNSRequestsWithCallback(host, port, requests, onComplete, onError = (err) => {}, timeout = 5000) {
        doDNSRequests(host, port, requests, timeout).then(onComplete, onError);
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
    
    function poolRandom() {
        return new Promise((resolve, reject) => wrkInner.farcall("poolRandom", [], {},
            ans => resolve(ans), err => reject(err)
        ));
    }
    
    function errorFail(methodName, err) {
        return new Promise(resolve => wrkInner.farcall("errorFail", [methodName, err], {}, ans => resolve(ans)));
    }
    
    function startTransaction(name, waitMillis = 0) {
        return new Promise((resolve, reject) => wrkInner.farcall("startTransaction", [name, waitMillis], {},
            ans => resolve(ans), err => reject(err)
        ));
    }
    
    function finishTransaction(name, waitMillis = 0) {
        return new Promise((resolve, reject) => wrkInner.farcall("finishTransaction", [name, waitMillis], {},
            ans => resolve(ans), err => reject(err)
        ));
    }
    `;

    constructor(processor, onReady) {
        super(processor, onReady);
        this.output = null;
        this.processes = new Map();
        this.readsFrom = null;
        this.writesTo = null;
        this.lock = new Lock();

        this.trustLevel = ut.getRequestStorageReadTrustLevel(this.pr.requestContract);
        if (this.trustLevel == null)
            this.trustLevel = UBotConfig.storageReadTrustLevel;

        this.requestTimes = [];
        this.maxWaitUbot = ut.getRequestMaxWaitUbot(this.pr.requestContract);
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

        let methodData = this.pr.executableContract.state.data.cloud_methods[methodName];
        this.initStorages(methodData);

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

                let modules = [];
                let signers = [];

                if (this.pr.executableContract.state.data.hasOwnProperty("modules") &&
                    methodData.hasOwnProperty("modules") && methodData.modules instanceof Array) {
                    methodData.modules.forEach(module => {
                        let moduleData = this.pr.executableContract.state.data.modules[module];
                        if (moduleData.hasOwnProperty("URL") && moduleData.hasOwnProperty("signer")) {
                            modules.push(moduleData.URL);
                            signers.push(moduleData.signer);
                        } else
                            this.pr.logger.log("Error: loading module '" + module + "' failed. Check 'URL' and 'signer' fields");
                    });
                }

                this.pr.worker = await getWorker(1,
                    ProcessStartExec.workerSrc + this.pr.executableContract.state.data.js + methodExport, {});

                this.pr.logger.log("worker initialized");

                let terminate = false;
                let result = null;

                if (modules.length > 0) {
                    if (await this.pr.worker.preloadModules(modules, signers))
                        this.pr.logger.log("modules pre-loaded");
                    else {
                        result = new UBotProcessException("Error pre-loading modules");
                        this.pr.changeState(UBotPoolState.FAILED);
                    }
                }

                if (result == null) {
                    this.pr.worker.startFarcallCallbacks();

                    this.pr.logger.log("start worker");

                    this.pr.worker.export["writeSingleStorage"] = async (args, kwargs) => {
                        return await this.writeSingleStorage(args[0], args[1]);
                    };

                    this.pr.worker.export["writeMultiStorage"] = async (args, kwargs) => {
                        return await this.writeMultiStorage(args[0], args[1]);
                    };

                    this.pr.worker.export["getSingleStorage"] = async (args, kwargs) => {
                        return await this.getSingleStorage(args[0]);
                    };

                    this.pr.worker.export["getMultiStorage"] = async (args, kwargs) => {
                        return await this.getMultiStorage(args[0]);
                    };

                    this.pr.worker.export["writeLocalStorage"] = async (args, kwargs) => {
                        return await this.writeLocalStorage(args[0], args[1]);
                    };

                    this.pr.worker.export["getLocalStorage"] = async (args, kwargs) => {
                        return await this.getLocalStorage(args[0]);
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
                        return await this.doHTTPRequest(args[0], args[1], args[2], args[3], args[4]);
                    };

                    this.pr.worker.export["doDNSRequests"] = async (args, kwargs) => {
                        return await this.doDNSRequests(args[0], args[1], args[2], args[3]);
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

                    this.pr.worker.export["poolRandom"] = async (args, kwargs) => {
                        return this.poolRandom();
                    };

                    this.pr.worker.export["startTransaction"] = async (args, kwargs) => {
                        return await this.startTransaction(args[0], args[1]);
                    };

                    this.pr.worker.export["finishTransaction"] = async (args, kwargs) => {
                        return await this.finishTransaction(args[0], args[1]);
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
                            }),
                            new Promise(async resolve => {
                                await this.pr.worker.waitForOnLowMemory();
                                if (this.pr.worker != null && !terminate) {
                                    terminate = true;
                                    resolve(new UBotProcessException("Executable contract uses too more memory"));
                                }
                            })
                        ]);
                    } else {
                        terminate = true;
                        result = new UBotProcessException("Executable contract or request is expired");
                    }

                    this.pr.logger.log("QuantaSum of " + methodName + ": " + this.pr.quantiser.quantaSum_);
                }

                try {
                    await this.pr.session.close(this.pr.state !== UBotPoolState.FAILED && !terminate,
                        this.pr.quantiser.quantasLeft());
                    this.pr.session = null;

                    if (this.pr.userHttpClient != null) {
                        await this.pr.userHttpClient.stop();
                        this.pr.userHttpClient = null;
                    }

                    await this.pr.worker.release(terminate);
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
    }

    initStorages(methodData) {
        if (methodData.readsFrom != null && methodData.readsFrom instanceof Array) {
            this.readsFrom = new Map();
            methodData.readsFrom.forEach(rf => this.readsFrom.set(rf.storage_name, rf));
        }

        if (methodData.writesTo != null && methodData.writesTo instanceof Array) {
            this.writesTo = new Map();
            methodData.writesTo.forEach(wt => this.writesTo.set(wt.storage_name, wt));
        }
    }

    async onNotify(notification) {
        if (notification instanceof UBotCloudNotification_process) {
            if (typeof notification.procIndex === "number" && notification.storageId instanceof crypto.HashId &&
                this.processes.has(notification.storageId.base64)) {
                let process = this.processes.get(notification.storageId.base64)[notification.procIndex];
                if (process != null)
                    await process.onNotify(notification);
            }
        }
    }

    static getStorageId(storageName, type) {
        let storageId = crypto.HashId.of(storageName);
        let concat = new Uint8Array(storageId.digest.length + 1);
        concat[0] = type.ordinal;
        concat.set(storageId.digest, 1);

        return crypto.HashId.of(concat);
    }

    checkStorageAccessibly(storageName, write, type) {
        if ((write && this.writesTo != null && !this.writesTo.has(storageName)) ||
            (!write && this.readsFrom != null && !this.readsFrom.has(storageName))) {

            let message = "Can`t " + (write ? "write data to " : "read data from ") + type.description + " \"" + storageName + "\"";

            this.pr.logger.log(message);
            this.pr.errors.push(new ErrorRecord(Errors.FORBIDDEN, "checkStorageAccessibly", message));
            //this.pr.changeState(UBotPoolState.FAILED);

            throw new UBotProcessException("Error checkStorageAccessibly: " + message);
        }
    }

    /**
     * Write data to pool-bound storage.
     *
     * @param {*} data - Data to write to pool-bound storage. Data can be primitive JS types or
     * special U8 types that are may be packed by the Boss.
     * @param {string} storageName - Storage name. Optional, if undefined - using default storage.
     * @return {Promise<void>}
     * @throws {UBotQuantiserException} quantiser limit is reached.
     * @throws {UBotProcessException} process exception if can`t write empty data to pool-bound storage.

     */
    async writeSingleStorage(data, storageName = "default") {
        if (data == null) {
            this.pr.logger.log("Can`t write empty data to pool-bound storage \"" + storageName + "\"");
            this.pr.errors.push(new ErrorRecord(Errors.FORBIDDEN, "writePoolBoundStorage",
                "Can`t write empty data to pool-bound storage \"" + storageName + "\""));
            //this.pr.changeState(UBotPoolState.FAILED);

            throw new UBotProcessException("Error writePoolBoundStorage: Can`t write empty data to pool-bound storage \"" + storageName + "\"");
        }

        this.checkStorageAccessibly(storageName, true, UBotStorageType.SINGLE);

        try {
            this.pr.quantiser.addWorkCost(UBotQuantiserProcesses.PRICE_WRITE_SINGLE_STORAGE);
        } catch (err) {
            this.pr.logger.log("Error write data to pool-bound storage \"" + storageName + "\": " + err.message);
            this.pr.logger.log(err.stack);
            this.pr.errors.push(new ErrorRecord(Errors.FAILURE, "writePoolBoundStorage",
                "Error write data to pool-bound storage \"" + storageName + "\": " + err.message));
            //this.pr.changeState(UBotPoolState.FAILED);

            throw err;
        }

        return new Promise(async (resolve, reject) => {
            let storageId = ProcessStartExec.getStorageId(storageName, UBotStorageType.SINGLE);
            let proc = await this.lock.synchronize("processes", async () => {
                if (!this.processes.has(storageId.base64))
                    this.processes.set(storageId.base64, []);

                let storageProcesses = this.processes.get(storageId.base64);
                let procIndex = storageProcesses.length;

                let process = new UBotProcess_writeSingleStorage(this.pr,
                    result => resolve(result),
                    error => reject(error),
                    this, storageId, procIndex);

                storageProcesses.push(process);

                return process;
            });

            await proc.init(data, this.pr.getDefaultRecordId(storageName, UBotStorageType.SINGLE), {storage_name: storageName});
            await proc.start();
        });
    }

    /**
     * Write data to worker-bound storage.
     *
     * @param {*} data - Data to write to worker-bound storage.Data can be primitive JS types or
     * special U8 types that are may be packed by the Boss.
     * @param {string} storageName - Storage name. Optional, if undefined - using default storage.
     * @return {Promise<void>}
     * @throws {UBotQuantiserException} quantiser limit is reached.
     * @throws {UBotProcessException} process exception if can`t write empty data to worker-bound storage.
     */
    async writeMultiStorage(data, storageName = "default") {
        if (data == null) {
            this.pr.logger.log("Can`t write empty data to worker-bound storage \"" + storageName + "\"");
            this.pr.errors.push(new ErrorRecord(Errors.FORBIDDEN, "writeWorkerBoundStorage",
                "Can`t write empty data to worker-bound storage \"" + storageName + "\""));
            //this.pr.changeState(UBotPoolState.FAILED);

            throw new UBotProcessException("Error writeWorkerBoundStorage: Can`t write empty data to worker-bound storage \"" + storageName + "\"");
        }

        this.checkStorageAccessibly(storageName, true, UBotStorageType.MULTI);

        try {
            this.pr.quantiser.addWorkCost(UBotQuantiserProcesses.PRICE_WRITE_MULTI_STORAGE);
        } catch (err) {
            this.pr.logger.log("Error write data to worker-bound storage \"" + storageName + "\": " + err.message);
            this.pr.logger.log(err.stack);
            this.pr.errors.push(new ErrorRecord(Errors.FAILURE, "writeWorkerBoundStorage",
                "Error write data to worker-bound storage \"" + storageName + "\": " + err.message));
            //this.pr.changeState(UBotPoolState.FAILED);

            throw err;
        }

        return new Promise(async (resolve, reject) => {
            let storageId = ProcessStartExec.getStorageId(storageName, UBotStorageType.MULTI);
            let proc = await this.lock.synchronize("processes", async () => {
                if (!this.processes.has(storageId.base64))
                    this.processes.set(storageId.base64, []);

                let storageProcesses = this.processes.get(storageId.base64);
                let procIndex = storageProcesses.length;

                let process = new UBotProcess_writeMultiStorage(this.pr,
                    result => resolve(result),
                    error => reject(error),
                    this, storageId, procIndex);

                storageProcesses.push(process);

                return process;
            });

            await proc.init(data, this.pr.getDefaultRecordId(storageName, UBotStorageType.MULTI), {storage_name: storageName});
            await proc.start();
        });
    }

    /**
     * Get data from pool-bound storage.
     *
     * @param {string} storageName - Storage name. Optional, if undefined - using default storage.
     * @return {Promise<null|*>} data from pool-bound storage or null if storage is empty.
     * @throws {UBotQuantiserException} quantiser limit is reached.
     * @throws {UBotClientException} UBot client error.
     */
    async getSingleStorage(storageName = "default") {
        this.checkStorageAccessibly(storageName, false, UBotStorageType.SINGLE);

        try {
            this.pr.quantiser.addWorkCost(UBotQuantiserProcesses.PRICE_GET_STORAGE);
            
            let recordId = this.pr.getDefaultRecordId(storageName, UBotStorageType.SINGLE);

            // get actual hash from MainNet by this.executableContract.id (further recordId)
            let actualHash = await this.pr.session.getStorage(storageName, false, this.trustLevel, this.pr.requestContract);
            if (actualHash == null) {
                this.pr.logger.log("getPoolBoundStorage: getStorage return null");
                return null;
            } else
                this.pr.logger.log("getPoolBoundStorage: actual hash = " + actualHash);

            let result = await this.pr.ubot.getStoragePackedResultByRecordId(recordId, UBotStorageType.SINGLE);

            if (result != null)
                this.pr.logger.log("getPoolBoundStorage: current result hash = " + crypto.HashId.of(result));
            else
                this.pr.logger.log("getPoolBoundStorage: current result is null");

            if (result == null || !actualHash.equals(crypto.HashId.of(result))) {
                this.pr.logger.log("getPoolBoundStorage: searchActualStorageResult...");
                result = await this.pr.ubot.network.searchActualStorageResult(recordId, actualHash, false);

                if (result == null) {
                    this.pr.logger.log("getPoolBoundStorage: searchActualStorageResult return null");
                    return null;
                }

                this.pr.ubot.resultCache.put(recordId, result);

                await this.pr.ledger.deleteFromSingleStorage(recordId);
                await this.pr.ledger.writeToSingleStorage(this.pr.executableContract.id, storageName,
                    result, crypto.HashId.of(result), recordId);
            }

            return await BossBiMapper.getInstance().deserialize(await Boss.load(result));

        } catch (err) {
            this.pr.logger.log("Error get data from pool-bound storage \"" + storageName + "\": " + err.message);
            this.pr.logger.log(err.stack);
            this.pr.errors.push(new ErrorRecord(Errors.FAILURE, "getPoolBoundStorage",
                "Error get data from pool-bound storage \"" + storageName + "\": " + err.message));
            //this.pr.changeState(UBotPoolState.FAILED);

            throw err;
        }
    }

    /**
     * Get data from worker-bound storage.
     *
     * @param {string} storageName - Storage name. Optional, if undefined - using default storage.
     * @return {Promise<null|*>} data from worker-bound storage or null if storage is empty.
     * @throws {UBotQuantiserException} quantiser limit is reached.
     * @throws {UBotClientException} UBot client error.
     */
    async getMultiStorage(storageName = "default") {
        this.checkStorageAccessibly(storageName, false, UBotStorageType.MULTI);

        try {
            this.pr.quantiser.addWorkCost(UBotQuantiserProcesses.PRICE_GET_STORAGE);
            
            let recordId = this.pr.getDefaultRecordId(storageName, UBotStorageType.MULTI);

            // get actual hash from MainNet by this.executableContract.id (further recordId)
            let actualHash = await this.pr.session.getStorage(storageName, true, this.trustLevel, this.pr.requestContract);
            if (actualHash == null) {
                this.pr.logger.log("getWorkerBoundStorage: getStorage return null");
                return null;
            } else
                this.pr.logger.log("getWorkerBoundStorage: actual hash = " + actualHash);

            let result = await this.pr.ubot.getRecordsFromMultiStorageByRecordId(recordId);

            if (result != null) {
                this.pr.logger.log("getWorkerBoundStorage: current result hash = " + result.cortegeId);
                if (result.cortegeId.equals(actualHash))
                    return result.records;
            } else
                this.pr.logger.log("getWorkerBoundStorage: current result is null");

            this.pr.logger.log("getWorkerBoundStorage: searchActualStorageResult...");
            result = await this.pr.ubot.network.searchActualStorageResult(recordId, actualHash, true);

            if (result == null) {
                this.pr.logger.log("getWorkerBoundStorage: searchActualStorageResult return null");
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

                await this.pr.ledger.writeToMultiStorage(this.pr.executableContract.id, storageName, item.result,
                    crypto.HashId.of(item.result), recordId, item.ubot_number);
            }

            return records;

        } catch (err) {
            this.pr.logger.log("Error get data from worker-bound storage \"" + storageName + "\": " + err.message);
            this.pr.logger.log(err.stack);
            this.pr.errors.push(new ErrorRecord(Errors.FAILURE, "getWorkerBoundStorage",
                "Error get data from worker-bound storage \"" + storageName + "\": " + err.message));
            //this.pr.changeState(UBotPoolState.FAILED);

            throw err;
        }
    }

    /**
     * Get data from local UBot-server storage.
     *
     * @param {string} storageName - Storage name. Optional, if undefined - using default storage.
     * @return {Promise<null|*>} data from local UBot-server storage or null if storage is empty.
     * @throws {UBotClientException} UBot client error.
     */
    async getLocalStorage(storageName = "default") {
        this.checkStorageAccessibly(storageName, false, UBotStorageType.LOCAL);

        try {
            let recordId = this.pr.getDefaultRecordId(storageName, UBotStorageType.LOCAL);

            let result = await this.pr.ubot.getStoragePackedResultByRecordId(recordId, UBotStorageType.LOCAL);

            if (result == null) {
                this.pr.logger.log("getLocalStorage: current result is null");
                return null;
            }

            return await BossBiMapper.getInstance().deserialize(await Boss.load(result));

        } catch (err) {
            this.pr.logger.log("Error get data from local storage \"" + storageName + "\": " + err.message);
            this.pr.logger.log(err.stack);
            this.pr.errors.push(new ErrorRecord(Errors.FAILURE, "getLocalStorage",
                "Error get data from local storage \"" + storageName + "\": " + err.message));

            throw err;
        }
    }

    /**
     * Write data to local UBot-server storage.
     *
     * @param {*} data - Data to write to local UBot-server storage. Data can be primitive JS types or
     * special U8 types that are may be packed by the Boss.
     * @param {string} storageName - Storage name. Optional, if undefined - using default storage.
     * @return {Promise<void>}
     * @throws {UBotProcessException} process exception if can`t write empty data to pool-bound storage.
     */
    async writeLocalStorage(data, storageName = "default") {
        if (data == null) {
            this.pr.logger.log("Can`t write empty data to local storage \"" + storageName + "\"");
            this.pr.errors.push(new ErrorRecord(Errors.FORBIDDEN, "writeLocalStorage",
                "Can`t write empty data to local storage \"" + storageName + "\""));

            throw new UBotProcessException("Error writeLocalStorage: Can`t write empty data to local storage \"" + storageName + "\"");
        }

        this.checkStorageAccessibly(storageName, true, UBotStorageType.LOCAL);

        try {
            let packedData = await Boss.dump(await BossBiMapper.getInstance().serialize(data));
            let recordId = this.pr.getDefaultRecordId(storageName, UBotStorageType.LOCAL);

            // put result to cache
            this.pr.ubot.resultCache.put(recordId, packedData);

            await this.pr.ledger.writeToLocalStorage(this.pr.executableContract.id, storageName, packedData, recordId);

        } catch (err) {
            this.pr.logger.log("Error writing data to local storage \"" + storageName + "\": " + err.message);
            this.pr.logger.log(err.stack);
            this.pr.errors.push(new ErrorRecord(Errors.FAILURE, "writeLocalStorage",
                "Error writing data to local storage \"" + storageName + "\": " + err.message));

            throw err;
        }
    }

    /**
     * Register a contract transferred as part of a packed transaction.
     *
     * @param {Uint8Array} packedTransaction - Packed transaction for registration.
     * @param {Array<string>} contractIdsForPoolSign - IDs (as BASE64 string) of contracts for sign with pool.
     * @return {Promise<ItemResult>} - Result of registration or current state of registration (if wasn't finished yet).
     * @throws {UBotQuantiserException} quantiser limit is reached.
     * @throws {UBotClientException} client exception if error register contract.
     */
    async registerContract(packedTransaction, contractIdsForPoolSign = null) {
        try {
            let contract = await Contract.fromPackedTransaction(packedTransaction);
            await contract.check();

            let cost = Math.ceil(contract.quantiser.getQuantaSum() / this.pr.poolSize);
            this.pr.quantiser.addWorkCost(cost);

            return await this.pr.session.registerContract(packedTransaction, contractIdsForPoolSign, this.pr.requestContract);

        } catch (err) {
            this.pr.logger.log("Error register contract: " + err.message);
            this.pr.logger.log(err.stack);
            this.pr.errors.push(new ErrorRecord(Errors.FAILURE, "registerContract",
                "Error register contract: " + err.message));
            //this.pr.changeState(UBotPoolState.FAILED);

            throw err;
        }
    }

    //registerTransaction(packedTransaction, contractIdsForPoolSign)

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

            // constraint for UBotNet registry contract
            let constrReg = new Constraint(c);
            constrReg.name = "refUbotRegistry";
            constrReg.type = Constraint.TYPE_EXISTING_DEFINITION;
            let conditionsReg = {};
            conditionsReg[Constraint.conditionsModeType.all_of] = ["ref.tag == \"universa:ubot_registry_contract\""];
            constrReg.setConditions(conditionsReg);
            c.addConstraint(constrReg);

            // constraint for this UBot
            let constr = new Constraint(c);
            constr.name = "refUbot";
            constr.type = Constraint.TYPE_EXISTING_DEFINITION;
            let conditions = {};
            conditions[Constraint.conditionsModeType.all_of] = [
                "this.ubot == \"" + this.pr.executableContract.getOrigin().base64 + "\""
            ];
            constr.setConditions(conditions);
            c.addConstraint(constr);

            // quorum vote role
            let issuer = new roles.QuorumVoteRole(
                "issuer",
                "refUbotRegistry.state.roles.ubots",
                this.pr.quorumSize.toString(),
                c
            );
            issuer.requiredAllConstraints.add("refUbot");
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

            // random salt for seal (common for pool)
            c.state.data.ubot_pool_random_salt = this.pr.prng.randomBytes(12);

            return c;

        } catch (err) {
            this.pr.logger.log("Error create pool contract: " + err.message);
            this.pr.logger.log(err.stack);
            this.pr.errors.push(new ErrorRecord(Errors.FAILURE, "createPoolContract",
                "Error create pool contract: " + err.message));
            //this.pr.changeState(UBotPoolState.FAILED);

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

        await Promise.all(Array.from(contract.newItems).map(async (ni) => {
            ni.ubot_pool_random_salt = contract.ubot_pool_random_salt;
            await ni.seal(false);
            delete ni.ubot_pool_random_salt;
        }));

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
            let mainContract = await Contract.fromPackedTransaction(packedTransaction);

            let created = this.pr.requestContract.definition.createdAt;
            created.setMilliseconds(0);

            let preparePool = (contract) => {
                contract.state.createdAt = created;

                // constraint for UBotNet registry contract
                contract.createTransactionalSection();
                let constrReg = new Constraint(contract);
                constrReg.name = "refUbotRegistry";
                constrReg.type = Constraint.TYPE_TRANSACTIONAL;
                let conditionsReg = {};
                conditionsReg[Constraint.conditionsModeType.all_of] = ["ref.tag == \"universa:ubot_registry_contract\""];
                constrReg.setConditions(conditionsReg);
                contract.addConstraint(constrReg);

                // constraint for this UBot
                let constr = new Constraint(contract);
                constr.name = "refUbot";
                constr.type = Constraint.TYPE_TRANSACTIONAL;
                let conditions = {};
                conditions[Constraint.conditionsModeType.all_of] = [
                    "this.ubot == \"" + this.pr.executableContract.getOrigin().base64 + "\""
                ];
                constr.setConditions(conditions);
                contract.addConstraint(constr);

                let creator = new roles.QuorumVoteRole(
                    "creator",
                    "refUbotRegistry.state.roles.ubots",
                    this.pr.quorumSize.toString(),
                    contract
                );
                creator.requiredAllConstraints.add("refUbot");
                contract.registerRole(creator);
            };

            preparePool(mainContract);
            mainContract.newItems.forEach(ni => preparePool(ni));

            return await this.sealPoolContract(mainContract);

        } catch (err) {
            this.pr.logger.log("Error prepare contract revision to pool registration: " + err.message);
            this.pr.logger.log(err.stack);
            this.pr.errors.push(new ErrorRecord(Errors.FAILURE, "preparePoolRevision",
                "Error prepare contract revision to pool registration: " + err.message));
            //this.pr.changeState(UBotPoolState.FAILED);

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
            //this.pr.changeState(UBotPoolState.FAILED);

            throw err;
        }
    }

    /**
     * Executes an HTTP request to an external service by URL.
     *
     * @param {string} url - URL of the external service.
     * @param {string} method - HTTP method (GET, POST, ...). Optional (GET by default).
     * @param {string} headers - HTTP headers. Optional.
     * @param {string} body - HTTP request body. Optional.
     * @param {number} timeout - HTTP request timeout in milliseconds. Optional. Default 5000.
     * @return {Promise<Object>} body: HTTP response body, response_code: HTTP response code.
     * @throws {UBotQuantiserException} quantiser limit is reached.
     */
    async doHTTPRequest(url, method = undefined, headers = undefined, body = undefined, timeout = 5000) {
        try {
            this.pr.quantiser.addWorkCost(UBotQuantiserProcesses.PRICE_HTTP_REQUEST);

            if (this.pr.userHttpClient == null)
                this.pr.userHttpClient = new HttpClient();

            return await new Promise(async(resolve, reject) => {
                try {
                    setTimeout(() => reject(new UBotProcessException("HTTP request timeout reached")), timeout);

                    if (method == null || headers == null || body == null)
                        this.pr.userHttpClient.sendGetRequestUrl(url, (respCode, body) => {
                            resolve({
                                response_code: respCode,
                                body: body
                            });
                        });
                    else {
                        this.pr.userHttpClient.sendRequestUrl(url, method, headers, body, (respCode, body) => {
                            resolve({
                                response_code: respCode,
                                body: body
                            });
                        });
                    }
                } catch (err) {
                    reject(err);
                }
            });

        } catch (err) {
            this.pr.logger.log("Error HTTP request: " + err.message);
            this.pr.logger.log(err.stack);
            this.pr.errors.push(new ErrorRecord(Errors.FAILURE, "doHTTPRequest", "Error HTTP request: " + err.message));
            //this.pr.changeState(UBotPoolState.FAILED);

            throw err;
        }
    }

    /**
     * Executes an DNS requests to an external host.
     *
     * @param {string} host - Host for send DNS request.
     * @param {number} port - Port for send DNS request.
     * @param {Array<Object>} requests - Array with DNS requests {name: string, type: number}.
     * @param {number} timeout - HTTP request timeout in milliseconds. Optional. Default 5000.
     * @return {Array<Object>} Array with DNS answers {type: number, value: string}.
     *
     * @throws {UBotQuantiserException} quantiser limit is reached.
     * @throws {UBotProcessException} requests error.
     */
    async doDNSRequests(host, port, requests, timeout = 5000) {
        if (!requests instanceof Array || requests.length === 0) {
            let message = "Error DNS requests: requests must be not empty array";
            this.pr.logger.log(message);
            this.pr.errors.push(new ErrorRecord(Errors.BAD_VALUE, "doDNSRequests", message));

            throw new UBotProcessException(message);
        }

        try {
            this.pr.quantiser.addWorkCost(UBotQuantiserProcesses.PRICE_DNS_REQUEST * requests.length);

            return await new Promise(async(resolve, reject) => {
                try {
                    setTimeout(() => reject(new UBotProcessException("DNS requests timeout reached")), timeout);

                    let dnsResolver = new DnsResolver();
                    dnsResolver.start(host, port);

                    let answers = [];
                    for (let request of requests)
                        answers.push(await dnsResolver.resolve(request.name, request.type));

                    await dnsResolver.stop();

                    resolve(answers);
                } catch (err) {
                    reject(err);
                }
            });
        } catch (err) {
            this.pr.logger.log("Error DNS requests: " + err.message);
            this.pr.logger.log(err.stack);
            this.pr.errors.push(new ErrorRecord(Errors.FAILURE, "doDNSRequests", "Error DNS requests: " + err.message));

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

    /**
     * Get pool random (value between 0 and 1).
     *
     * @return {number} UBot pool random.
     */
    poolRandom() {
        return this.pr.prng.rand();
    }

    /**
     * Start named transaction.
     *
     * @param {string} name - Transaction name.
     * @param {number} waitMillis - Waiting transaction time in milliseconds. 0 - indefinitely. By default is 0.
     * @return {Promise<boolean>} true if started.
     * @throws {UBotClientException} UBot client error.
     */
    async startTransaction(name, waitMillis = 0) {
        try {
            return await this.pr.session.startTransaction(name, waitMillis);

        } catch (err) {
            this.pr.logger.log("Error start transaction: " + err.message);
            this.pr.logger.log(err.stack);
            this.pr.errors.push(new ErrorRecord(Errors.FAILURE, "startTransaction", "Error start transaction: " + err.message));
            //this.pr.changeState(UBotPoolState.FAILED);

            throw err;
        }
    }

    /**
     * End named transaction.
     *
     * @param {string} name - Transaction name.
     * @param {number} waitMillis - Waiting transaction time in milliseconds. 0 - indefinitely. By default is 0.
     * @return {Promise<boolean>} true if finished successful.
     * @throws {UBotClientException} UBot client error.
     */
    async finishTransaction(name, waitMillis = 0) {
        try {
            return await this.pr.session.finishTransaction(name, waitMillis);

        } catch (err) {
            this.pr.logger.log("Error finish transaction: " + err.message);
            this.pr.logger.log(err.stack);
            this.pr.errors.push(new ErrorRecord(Errors.FAILURE, "finishTransaction", "Error finish transaction: " + err.message));
            //this.pr.changeState(UBotPoolState.FAILED);

            throw err;
        }
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