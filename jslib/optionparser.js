class OptionParser {
    constructor() {
        this.rules = [];
        this.rulesMap = new Map();
        this.options = new Set();
        this.values = new Map();
    }

    option(opts, description, withValue = false) {
        this.rules.push({
            opts: opts,
            description: description,
            withValue: withValue
        });

        opts.forEach(opt => this.rulesMap.set(opt, this.rules.length - 1));

        return this;
    }

    parse(args) {
        if (!args instanceof Array)
            args = Array.from(args);

        for (let i = 0; i < args.length; i++) {
            let option;
            if (args[i].startsWith("--"))
                option = args[i].substring(2);
            else if (args[i].startsWith("-"))
                option = args[i].substring(1);
            else
                throw Error("OptionParser: can`t recognize option " + args[i]);

            let index = this.rulesMap.get(option);
            if (index === undefined)
                throw Error("OptionParser: can`t recognize option " + args[i]);

            let rule = this.rules[index];

            rule.opts.forEach(opt => this.options.add(opt));

            if (rule.withValue) {
                if (i + 1 >= args.length)
                    throw Error("OptionParser: can`t recognize value for option " + args[i]);

                let value = args[i + 1];
                if (value.startsWith("-"))
                    throw Error("OptionParser: key " + value + " instead value for option " + args[i]);

                rule.opts.forEach(opt => this.values.set(opt, value));

                i++;
            }
        }
    }
}

///////////////////////////
//EXPORTS
///////////////////////////
module.exports = {OptionParser};