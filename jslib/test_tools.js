const NodeInfoProvider = require("services/NSmartContract").NodeInfoProvider;
const Config = require("config").Config;

class TestNodeInfoProvider extends NodeInfoProvider {

    constructor() {
        super();
    }

    getUIssuerKeys() {
        return Config.uIssuerKeys;
    }

    getUIssuerName() {
        return Config.uIssuerName;
    }

    getMinPayment(extendedType) {
        return Config.minPayment[extendedType];
    }

    getServiceRate(extendedType) {
        return Config.rate[extendedType];
    }

    getAdditionalKeysToSignWith(extendedType) {
        let set = new Set();
        if (extendedType === NSmartContract.SmartContractType.UNS1)
            set.add(Config.authorizedNameServiceCenterKey);

        return set;
    }
}

function createNodeInfoProvider() {
    return new TestNodeInfoProvider();
}

module.exports = {createNodeInfoProvider};