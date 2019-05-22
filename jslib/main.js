const NODE_VERSION = VERSION;
const OptionParser = require("optionparser").OptionParser;

async function main(...args) {
    new Main(...args);
}

class Main {

    static NAME_STRING = "Universa node server v" + NODE_VERSION + "\n";

    constructor(...args) {
        this.parser = Main.initOptionParser();

        this.parser.parse(args);

        if (this.parser.options.has("version")) {
            console.log("Version " + NODE_VERSION);
            return;
        }

        if (this.parser.options.has("?")) {
            console.log("usage called\n");
            console.log(Main.NAME_STRING);
            console.log(this.parser.help());
            return;
        }

        if (this.parser.values.has("config")) {
            this.loadNodeConfig();
            this.loadNetConfig();

            //await this.ledger.saveConfig(this.myInfo, this.netConfig, this.nodeKey);

        } else if (this.parser.values.has("database")) {

        } else if (this.parser.values.has("restart-socket")) {
            this.restartUDPAdapter();

        } else if (this.parser.values.has("shutdown")) {
            this.shutdown();

        } else {
            console.error("Neither config no database option passed, leaving");
            return;
        }

        if (this.parser.values.has("verbose")) {

        }

        if (this.parser.values.has("udp-verbose")) {

        }

        //startClientHttpServer();

        //startNode();
    }

    static initOptionParser() {
        let parser = new OptionParser();

        parser
            .option(["?", "h", "help"], 'show help')
            .option(["c", "config"], "configuration file for the network", true, "config_file")
            .option(["d", "database"], "database connection url", true, "db_url")
            .option(["test"], "intended to be used in integration tests")
            .option(["nolog"], "do not buffer log messages (good for testing)")
            .option(["verbose"], "sets verbose level to nothing, base or detail", true, "level")
            .option(["udp-verbose"], "sets udp-verbose level to nothing, base or detail", true, "level")
            .option(["restart-socket"], "restarts UDPAdapter: shutdown it and create new")
            .option(["shutdown"], "delicate shutdown with rollback current processing contracts")
            .option(["version"], "show version");

        return parser;
    }

    loadNodeConfig() {
        this.configRoot = this.parser.values.get("config");


    }

    loadNetConfig() {

    }

    restartUDPAdapter() {

    }

    shutdown() {

    }
}

///////////////////////////
//EXPORTS
///////////////////////////
module.exports = {Main};