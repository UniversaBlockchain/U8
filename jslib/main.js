
const OptionParser = require("optionparser").OptionParser;

async function main(...args) {
    new Main(...args);
}

class Main {

    constructor(...args) {
        this.parser = new OptionParser();

        this.parser
            .option(["?", "h", "help"], 'show help')
            .option(["c", "config"], "configuration file for the network", true)
            .option(["d", "database"], "database connection url", true)
            .option(["test"], "intended to be used in integration tests")
            .option(["nolog"], "do not buffer log messages (good for testing)")
            .option(["verbose"], "sets verbose level to nothing, base or detail", true)
            .option(["udp-verbose"], "sets udp-verbose level to nothing, base or detail", true)
            .option(["restart-socket"], "restarts UDPAdapter: shutdown it and create new")
            .option(["shutdown"], "delicate shutdown with rollback current processing contracts")
            .option(["version"], "show version")
            .parse(args);

        if (this.parser.values.has("config"))
            this.loadNodeConfig();

        //startClientHttpServer();

        //startNode();
    }

    loadNodeConfig() {

    }
}

///////////////////////////
//EXPORTS
///////////////////////////
module.exports = {Main};