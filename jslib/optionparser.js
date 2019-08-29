/*
 * Copyright (c) 2019 Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

class OptionParser {
    constructor() {
        this.rules = [];
        this.rulesMap = new Map();
        this.options = new Set();
        this.values = new Map();
    }

    option(opts, description, withValue = false, valueName = undefined) {
        this.rules.push({
            opts: opts,
            description: description,
            withValue: withValue,
            valueName: valueName
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

    help() {
        let rules = [];
        let descriptions = [];
        let max = 3;

        this.rules.forEach(rule => {
            let ruleString = "";
            rule.opts.forEach((opt, i) => ruleString += "-" + opt + (i !== rule.opts.length - 1 ? ", " : " "));

            if (rule.withValue)
                ruleString += "<" + rule.valueName + ">";

            if (ruleString.length > max)
                max = ruleString.length;

            rules.push(ruleString);
            descriptions.push(rule.description);
        });

        max++;
        if (max > 40)
            max = 40;

        let help = "Option" + " ".repeat(max - 6) + "Description\n";
        help += "------" + " ".repeat(max - 6) + "-----------\n";

        rules.forEach((rule, i) => help += rule + " ".repeat(max - rule.length) + descriptions[i] + "\n");

        return help;
    }
}

///////////////////////////
//EXPORTS
///////////////////////////
module.exports = {OptionParser};