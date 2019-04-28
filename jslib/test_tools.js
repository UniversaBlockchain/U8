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
        if (extendedType === NSmartContract.SmartContractType.UNS1)
            return [Config.authorizedNameServiceCenterKey];

        return [];
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
 * @param ownerKeys is public keys that will became an owner of "U".
 * @param {boolean} withTestU - If true U will be created with test "U". Optional. False by default.
 * @return sealed U contract; should be registered in the Universa by simplified procedure.
 */
 async function createFreshU(amount, ownerKeys, withTestU = false) {

    let manufacturePrivateKey = new crypto.PrivateKey(await (await io.openRead(Config.uKeyPath)).allBytes()); //TODO

    let u = await Contract.fromDslFile(withTestU ? Config.testUTemplatePath : Config.uTemplatePath);

    let ownerRole = new roles.SimpleRole("owner", ownerKeys);
    u.registerRole(ownerRole);

    u.state.data.transaction_units = amount;

    if(withTestU)
        u.state.data.test_transaction_units = amount * 100;

    await u.seal();
    await u.addSignatureToSeal(manufacturePrivateKey);

    return u;
}

module.exports = {createNodeInfoProvider, createFreshU};