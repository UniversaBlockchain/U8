class UbotDebugger {
    constructor(ubotMains) {
        this.ubotMains = ubotMains;
        this.httpServer = new network.HttpServer("0.0.0.0", 48080, 1);
        this.httpServer.addRawEndpoint("/ubots", req => this.endpoint_ubots(req));
    }

    setMains(ubotMains) {
        this.ubotMains = ubotMains;
    }

    start() {
        this.httpServer.startServer();
    }

    async stop() {
        await this.httpServer.stopServer();
    }

    endpoint_ubots(req) {
        req.setHeader("Content-Type", "text/html");
        try {
            let ansBody = "<pre>";
            ansBody += "ubots count: " + this.ubotMains.length + "<br>";
            for (let i = 0; i < this.ubotMains.length; ++i) {
                let u = this.ubotMains[i];
                ansBody += (i<10?" ":"") + i + ": processors=" + u.ubot.processors.size + "";
                for (let proc of u.ubot.processors.values()) {
                    ansBody += "<br>    " + proc.constructor.name + "(poolId = " + proc.poolId + ", currentProcess = "+proc.currentProcess.constructor.name+")";
                    if (proc.currentProcess.constructor.name === "ProcessStartExec") {
                        ansBody += ", currentProcess.processes: " + proc.currentProcess.processes.length;
                        for (let pr of proc.currentProcess.processes) {
                            ansBody += "<br>        " + pr.constructor.name;
                            if (pr.constructor.name === "UBotProcess_writeSingleStorage") {
                                ansBody += "<br>            poolSize = " + pr.poolSize;
                                ansBody += "<br>            quorumSize = " + pr.quorumSize;
                                ansBody += "<br>            approveCounterSet.size = " + pr.approveCounterSet.size;
                                ansBody += "<br>            declineCounterSet.size = " + pr.declineCounterSet.size;
                            } else if (pr.constructor.name === "UBotProcess_writeMultiStorage") {
                                ansBody += "<br>            state = " + pr.state.ordinal;
                                ansBody += "<br>            leaveCounterSet.length = " + pr.leaveCounterSet.length;
                                ansBody += "<br>            removeCounterSet.length = " + pr.removeCounterSet.length;
                            }
                        }
                    }
                }
                ansBody += "<br>";
            }
            ansBody += "</pre>";
            req.setAnswerBody(ansBody);
        } catch (e) {
            req.setAnswerBody("error: " + e);
        }
        req.sendAnswer();
    }
}

let ubotDebugger = null;

// enable or disable ubot debugger here
let ubotDebuggerEnabled = false;

if (ubotDebuggerEnabled) {
    if (ubotDebugger === null) {
        ubotDebugger = new UbotDebugger(null);
        ubotDebugger.start();
    }
}

function ubotDebugger_setMains(ubotMains) {
    if (ubotDebugger !== null)
        ubotDebugger.setMains(ubotMains);
}

module.exports = {ubotDebugger_setMains};
