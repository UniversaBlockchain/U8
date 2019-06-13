const Logger = require("logger").Logger;
const OptionParser = require("optionparser").OptionParser;
const UBotHttpServer = require("ubot/ubot_http_server").UBotHttpServer;
const UBotNetwork = require("ubot/ubot_network").UBotNetwork;
const UBotLedger = require("ubot/ubot_ledger").UBotLedger;
const UBot = require("ubot/ubot").UBot;

const UBOT_VERSION = VERSION;

class UBotMain {

    static NAME_STRING = "Universa ubot server v" + UBOT_VERSION;

    constructor(...args) {
        this.logger = new Logger(4096);

        this.network = null;
        this.httpServer = null;
        this.ledger = null;
        this.ubot = null;

        this.parser = UBotMain.initOptionParser();
        this.parser.parse(args);
    }

    async start() {
        this.processOptions();

        this.logger.log("UBotMain.start()... start httpServer...");
        this.httpServer = new UBotHttpServer(await crypto.PrivateKey.generate(2048), "127.0.0.1", 18080, this.logger);

        this.logger.log("UBotMain.start()... start network...");
        this.network = new UBotNetwork(this.logger);

        this.logger.log("UBotMain.start()... start ledger...");
        this.ledger = new UBotLedger(this.logger);

        this.logger.log("UBotMain.start()... start ubot...");
        this.ubot = new UBot(this.logger);
    }

    processOptions() {
        if (this.parser.options.has("nolog"))
            this.logger.nolog = true;

        if (this.parser.options.has("version")) {
            console.log("Version " + UBOT_VERSION);
            return this;
        }

        if (this.parser.options.has("?")) {
            console.log("usage called\n");
            console.log(UBotMain.NAME_STRING);
            console.log(this.parser.help());
            return this;
        }
    }

    static initOptionParser() {
        let parser = new OptionParser();

        parser
            .option(["?", "h", "help"], 'show help')
            .option(["nolog"], "do not buffer log messages (good for testing)")
            .option(["version"], "show version");

        return parser;
    }

    async shutdown() {
        let promises = [];
        if (this.ledger != null)
            promises.push(this.ledger.close());
        if (this.network != null)
            promises.push(this.network.shutdown());
        if (this.httpServer != null)
            promises.push(this.httpServer.shutdown());
        if (this.ubot != null)
            promises.push(this.ubot.shutdown());
        return Promise.all(promises);
    }

}

module.exports = {UBotMain};
