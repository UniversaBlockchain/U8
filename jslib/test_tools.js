import * as io from 'io'

const NodeInfoProvider = require("services/NSmartContract").NodeInfoProvider;
const Config = require("config").Config;
const KeyRecord = require("keyrecord").KeyRecord;
const roles = require('roles');

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

/**
 * Creates fresh contract in the first revision with "U".
 * This contract should be registered and then should be used as payment for other contract's processing.
 * U contracts signs with special Universa keys and set as owner public keys from params.
 *
 * @param {number} amount - Initial number of U that will be have an owner.
 * @param ownerKeys is public keys that will became an owner of "U"
 * @param {boolean} withTestU - If true U will be created with test "U".
 * @return sealed U contract; should be registered in the Universa by simplified procedure.
 * @throws IOException with exceptions while contract preparing
 */
 async function createFreshU(amount, ownerKeys, withTestU) {

    let manufacturePrivateKey = new crypto.PrivateKey(await (await io.openRead(Config.uKeyPath)).allBytes()); //TODO

    let u = withTestU ? Contract.fromDslFile(Config.testUTemplatePath) : Contract.fromDslFile(Config.uTemplatePath);

    let ownerRole = new roles.SimpleRole("owner");
       for (let k of ownerKeys) {
           let kr = new KeyRecord(k);
           ownerRole.addKeyRecord(kr);
    }

    u.registerRole(ownerRole);
    u.createRole("owner", ownerRole);

    u.state.data.transaction_units = amount;

    if(withTestU) {
        u.state.data.test_transaction_units = amount * 100;
    }

    await u.addSignatureToSeal(manufacturePrivateKey);

    await u.seal(true);

    return u;
}

module.exports = {createNodeInfoProvider};