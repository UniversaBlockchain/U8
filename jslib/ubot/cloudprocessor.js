const UBotConfig = require("ubot/ubot_config").UBotConfig;
const ScheduleExecutor = require("executorservice").ScheduleExecutor;
const ExecutorWithFixedPeriod = require("executorservice").ExecutorWithFixedPeriod;
const ex = require("exceptions");
const t = require("tools");
const UBotCloudNotification = require("ubot/ubot_notification").UBotCloudNotification;
const UBotCloudNotification_asmCommand = require("ubot/ubot_notification").UBotCloudNotification_asmCommand;
const Boss = require('boss.js');

const UBotPoolState = {

    /**
     * UBot creates new CloudProcessor with this state if it has received UBotCloudNotification, but CloudProcessor
     * with corresponding poolId not found. Then UBot calls method onNotifyInit for new CloudProcessor.
     */
    INIT                                       : {val: "INIT", ordinal: 0},

    /**
     * At this state CloudProcessor should select ubots for new pool,
     * and periodically send to them udp notifications with invite to download startingContract.
     * Meanwhile, CloudProcessor is waiting for other ubots in pool to downloads startingContract.
     */
    SEND_STARTING_CONTRACT                     : {val: "SEND_STARTING_CONTRACT", ordinal: 1},

    /**
     * CloudProcessor is downloading startingContract from pool starter ubot.
     */
    DOWNLOAD_STARTING_CONTRACT                 : {val: "DOWNLOAD_STARTING_CONTRACT", ordinal: 2},

    /**
     * CloudProcessor is executing cloud method.
     */
    START_EXEC                                 : {val: "START_EXEC", ordinal: 3},

    /**
     * CloudProcessor is finished.
     */
    FINISHED                                   : {val: "FINISHED", ordinal: 4}
};

t.addValAndOrdinalMaps(UBotPoolState);


class CloudProcessor {
    constructor(initialState, poolId, ubot) {
        this.state = initialState;
        this.poolId = poolId;
        this.startingContract = null;
        this.executableContract = null;
        this.ubot = ubot;
        this.logger = ubot.logger;
        this.ledger = ubot.ledger;
        this.currentProcess = null;
        this.pool = [];
        this.respondToNotification = null;
        this.ubotAsm = [];
    }

    startProcessingCurrentState() {
        switch (this.state) {
            case UBotPoolState.SEND_STARTING_CONTRACT:
                this.currentProcess = new ProcessSendStartingContract(this, ()=>{
                    this.logger.log("CloudProcessor.ProcessSendStartingContract.onReady");
                    this.changeState(UBotPoolState.START_EXEC);
                });
                break;
            case UBotPoolState.DOWNLOAD_STARTING_CONTRACT:
                this.currentProcess = new ProcessDownloadStartingContract(this, () => {
                    this.logger.log("CloudProcessor.ProcessDownloadStartingContract.onReady, poolSize = " + this.executableContract.state.data.poolSize);
                    this.changeState(UBotPoolState.START_EXEC);
                });
                break;
            case UBotPoolState.START_EXEC:
                this.currentProcess = new ProcessStartExec(this, () => {
                    this.logger.log("CloudProcessor.ProcessStartExec.onReady, poolSize = " + this.executableContract.state.data.poolSize);
                    this.changeState(UBotPoolState.FINISHED);
                });
                break;
            case UBotPoolState.FINISHED:
                return;
        }

        this.currentProcess.start();
    }

    changeState(newState) {
        // here we can check transition from state to newState
        this.state = newState;
        this.startProcessingCurrentState();
    }

    onNotifyInit(notification) {
        if (this.state !== UBotPoolState.INIT)
            this.logger.log("error: CloudProcessor.onNotifyInit() -> state != INIT");
        this.respondToNotification = notification;
        if (notification.type === UBotCloudNotification.types.DOWNLOAD_STARTING_CONTRACT) {
            this.changeState(UBotPoolState.DOWNLOAD_STARTING_CONTRACT);
        }
    }

    async onNotify(notification) {
        if (this.currentProcess != null)
            await this.currentProcess.onNotify(notification);
        else
            this.logger.log("error: CloudProcessor.onNotify -> currentProcess is null, currentProcess = " + this.currentProcess);
    }

    deliverToOtherUBots(notification) {
        for (let i = 0; i < this.pool.length; ++i)
            if (this.pool[i].number !== this.ubot.network.myInfo.number)
                this.ubot.network.deliver(this.pool[i], notification);
    }
}

class ProcessBase {
    constructor(processor, onReady) {
        this.pr = processor;
        this.onReady = onReady;
        this.currentTask = null;
    }

    start() {
        throw new Error("ProcessBase.start() not implemented");
    }

    onNotify(notification) {
        // silently do nothing
    }
}

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
        this.pr.pool = t.randomChoice(list, this.pr.executableContract.state.data.poolSize-1);
        this.pr.pool.push(me);
    }

    async start() {
        this.pr.logger.log("start ProcessSendStartingContract");

        this.pr.executableContract = await Contract.fromPackedTransaction(this.pr.startingContract.transactional.data.executableContract);

        this.selectPool();

        // periodically send notifications
        this.pulse();
        this.currentTask = new ExecutorWithFixedPeriod(() => {
            this.pulse();
        }, UBotConfig.send_starting_contract_period, this.pr.ubot.executorService).run();
    }

    pulse() {
        this.pr.deliverToOtherUBots(
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
            if (this.otherAnswers.size >= this.pr.pool.length-1) {
                this.currentTask.cancel();
                this.onReady();
            }
        }
    }

}

class ProcessDownloadStartingContract extends ProcessBase {
    constructor(processor, onReady) {
        super(processor, onReady)
    }

    start() {
        this.pr.logger.log("start ProcessDownloadStartingContract");

        // periodically try to download starting contract (retry on notify)
        this.pulse();
    }

    pulse() {
        this.pr.ubot.network.sendGetRequestToUbot(
            this.pr.respondToNotification.from,
            "/getStartingContract/" + this.pr.poolId.base64,
            async (respCode, body) => {
                if (respCode === 200) {
                    let ans = await Boss.load(body);
                    this.pr.startingContract = await Contract.fromPackedTransaction(ans.contractBin);
                    this.pr.executableContract = await Contract.fromPackedTransaction(this.pr.startingContract.transactional.data.executableContract);
                    this.pr.pool = [];
                    ans.selectedPool.forEach(i => this.pr.pool.push(this.pr.ubot.network.netConfig.getInfo(i)));
                    this.pr.ubot.network.deliver(this.pr.respondToNotification.from,
                        new UBotCloudNotification(
                            this.pr.ubot.network.myInfo,
                            this.pr.poolId,
                            UBotCloudNotification.types.DOWNLOAD_STARTING_CONTRACT,
                            true
                        )
                    );
                    this.onReady();
                } else {
                    this.pr.logger.log("warning: getStartingContract respCode = "+ respCode);
                }
            }
        );
    }

    onNotify(notification) {
        if (notification.type === UBotCloudNotification.types.DOWNLOAD_STARTING_CONTRACT && !notification.isAnswer) {
            this.pulse();
        }
    }
}

class ProcessStartExec extends ProcessBase {
    constructor(processor, onReady) {
        super(processor, onReady);
        this.currentTask = null;
        this.var0 = null;
        this.output = null;
        this.commands = [];
    }

    start() {
        this.pr.logger.log("start ProcessStartExec");

        this.pr.logger.log("  methodName: " + this.pr.startingContract.state.data.methodName);
        this.pr.logger.log("  executableContractId: " + crypto.HashId.withDigest(this.pr.startingContract.state.data.executableContractId));
        this.pr.ubotAsm = this.parseUbotAsmFromString(this.pr.executableContract.state.data.ubotAsm);

        this.currentTask = new ScheduleExecutor(async () => {
            await this.evalUbotAsm();
            this.pr.logger.log("  method result: " + this.output);
            this.onReady();
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
            //case "writeMultiStorage":
            //    this.pr.logger.log("          op work in progress: " + op);
            //    await this.runUBotAsmCmd(cmdIndex, UBotAsmProcess_writeMultiStorage, this.var0);
            //    break;
            default:
                this.pr.logger.log("error: ubotAsm code '" + op + "' not found");
                break;
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

class UBotAsmProcess_writeSingleStorage extends ProcessBase {
    constructor(processor, onReady, asmProcessor, cmdIndex) {
        super(processor, onReady);
        this.asmProcessor = asmProcessor;
        this.cmdIndex = cmdIndex;
        this.binToWrite = null;
        this.binHashId = null;
        this.approveCounterSet = new Set();
        this.declineCounterSet = new Set();
    }

    init(binToWrite) {
        // this.pr.logger.log("UBotAsmProcess_writeSingleStorage.init: " + binToWrite);
        this.binToWrite = binToWrite;
        this.binHashId = crypto.HashId.of(this.binToWrite);
    }

    start() {
        this.pr.logger.log("start UBotAsmProcess_writeSingleStorage");
        this.approveCounterSet.add(this.pr.ubot.network.myInfo.number); // vote for itself
        this.pulse();
        this.currentTask = new ExecutorWithFixedPeriod(() => {
            this.pulse();
        }, UBotConfig.single_storage_vote_period, this.pr.ubot.executorService).run();
    }

    pulse() {
        for (let i = 0; i < this.pr.pool.length; ++i)
            if (!this.approveCounterSet.has(this.pr.pool[i].number) && !this.declineCounterSet.has(this.pr.pool[i].number)) {
                this.pr.ubot.network.deliver(this.pr.pool[i],
                    new UBotCloudNotification_asmCommand(
                        this.pr.ubot.network.myInfo,
                        this.pr.poolId,
                        this.cmdIndex,
                        UBotCloudNotification_asmCommand.types.SINGLE_STORAGE_GET_DATA_HASHID,
                        null,
                        false
                    )
                );
            }
    }

    async onNotify(notification) {
        if (notification instanceof UBotCloudNotification_asmCommand) {
            if (notification.type === UBotCloudNotification_asmCommand.types.SINGLE_STORAGE_GET_DATA_HASHID) {
                if (!notification.isAnswer) {
                    // this.pr.logger.log("SINGLE_STORAGE_GET_DATA_HASHID req... " + notification);
                    this.pr.ubot.network.deliver(notification.from,
                        new UBotCloudNotification_asmCommand(
                            this.pr.ubot.network.myInfo,
                            this.pr.poolId,
                            this.cmdIndex,
                            UBotCloudNotification_asmCommand.types.SINGLE_STORAGE_GET_DATA_HASHID,
                            this.binHashId,
                            true
                        )
                    );
                } else if (!this.currentTask.cancelled) {
                    // this.pr.logger.log("SINGLE_STORAGE_GET_DATA_HASHID ans... " + notification);
                    if (this.binHashId.equals(notification.dataHashId))
                        this.approveCounterSet.add(notification.from.number);
                    else
                        this.declineCounterSet.add(notification.from.number);

                    if (this.approveCounterSet.size >= this.pr.executableContract.state.data.poolQuorum) {
                        // ok
                        this.currentTask.cancel();

                        await this.pr.ledger.writeToSingleStorage(this.pr.poolId, this.pr.executableContract.id, "default", this.binToWrite);
                        this.pr.logger.log("UBotAsmProcess_writeSingleStorage... ready, approved");

                        this.onReady();
                        // TODO: distribution single-storage to all ubots here or after closing pool?

                    } else if (this.declineCounterSet.size > this.pr.pool.length - this.pr.executableContract.state.data.poolQuorum) {
                        // error
                        this.currentTask.cancel();

                        this.asmProcessor.val0 = "UBotAsmProcess_writeSingleStorage declined";
                        this.pr.logger.log("UBotAsmProcess_writeSingleStorage... ready, declined");
                    }
                }
            }
        } else {
            this.pr.logger.log("warning: UBotAsmProcess_writeSingleStorage - wrong notification received");
        }
    }
}

class UBotAsmProcess_writeMultiStorage extends ProcessBase {
    constructor(processor, onReady, asmProcessor, cmdIndex) {
        super(processor, onReady);
        this.asmProcessor = asmProcessor;
        this.cmdIndex = cmdIndex;
        this.binToWrite = null;
        this.binHashId = null;
        this.approveCounterSet = new Set();
        this.declineCounterSet = new Set();
    }

    init(binToWrite) {
        this.binToWrite = binToWrite;
        this.binHashId = crypto.HashId.of(this.binToWrite);
    }

    start() {
        this.pr.logger.log("start UBotAsmProcess_writeMultiStorage");
        this.approveCounterSet.add(this.pr.ubot.network.myInfo.number); // vote for itself
        this.pulse();
        this.currentTask = new ExecutorWithFixedPeriod(() => {
            this.pulse();
        }, UBotConfig.multi_storage_vote_period, this.pr.ubot.executorService).run();
    }

    pulse() {
        for (let i = 0; i < this.pr.pool.length; ++i)
            if (!this.approveCounterSet.has(this.pr.pool[i].number) && !this.declineCounterSet.has(this.pr.pool[i].number)) {
                this.pr.ubot.network.deliver(this.pr.pool[i],
                    new UBotCloudNotification_asmCommand(
                        this.pr.ubot.network.myInfo,
                        this.pr.poolId,
                        this.cmdIndex,
                        UBotCloudNotification_asmCommand.types.MULTI_STORAGE_GET_DATA_HASHID,
                        null,
                        false
                    )
                );
            }
    }

    async onNotify(notification) {
        if (notification instanceof UBotCloudNotification_asmCommand) {
            if (notification.type === UBotCloudNotification_asmCommand.types.MULTI_STORAGE_GET_DATA_HASHID) {
                if (!notification.isAnswer) {
                    // this.pr.logger.log("SINGLE_STORAGE_GET_DATA_HASHID req... " + notification);
                    this.pr.ubot.network.deliver(notification.from,
                        new UBotCloudNotification_asmCommand(
                            this.pr.ubot.network.myInfo,
                            this.pr.poolId,
                            this.cmdIndex,
                            UBotCloudNotification_asmCommand.types.MULTI_STORAGE_GET_DATA_HASHID,
                            this.binHashId,
                            true
                        )
                    );
                } else if (!this.currentTask.cancelled) {
                    // this.pr.logger.log("SINGLE_STORAGE_GET_DATA_HASHID ans... " + notification);
                    if (this.binHashId.equals(notification.dataHashId))
                        this.approveCounterSet.add(notification.from.number);
                    else
                        this.declineCounterSet.add(notification.from.number);

                    if (this.approveCounterSet.size >= this.pr.executableContract.state.data.poolQuorum) {
                        // ok
                        this.currentTask.cancel();

                        await this.pr.ledger.writeToSingleStorage(this.pr.poolId, this.pr.executableContract.id, "default", this.binToWrite);
                        this.pr.logger.log("UBotAsmProcess_writeMultiStorage... ready, approved");

                        this.onReady();
                        // TODO: distribution multi-storage to all ubots here or after closing pool?

                    } else if (this.declineCounterSet.size > this.pr.pool.length - this.pr.executableContract.state.data.poolQuorum) {
                        // error
                        this.currentTask.cancel();

                        this.asmProcessor.val0 = "UBotAsmProcess_writeMultiStorage declined";
                        this.pr.logger.log("UBotAsmProcess_writeMultiStorage... ready, declined");
                    }
                }
            }
        } else {
            this.pr.logger.log("warning: UBotAsmProcess_writeMultiStorage - wrong notification received");
        }
    }
}

module.exports = {UBotPoolState, CloudProcessor};
