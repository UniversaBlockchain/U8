import * as io from 'io'
import {assert} from 'test'

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

function assertSameContracts(c1, c2) {
    // check issuer
    assert(c1.roles.issuer != null);
    assert(c2.roles.issuer != null);
    assert(c1.roles.issuer.equals(c2.roles.issuer));

    // check creator
    assert(c1.roles.creator != null);
    assert(c2.roles.creator != null);
    assert(c1.roles.creator.equals(c2.roles.creator));

    // check owner
    assert(c1.roles.owner != null);
    assert(c2.roles.owner != null);
    assert(c1.roles.owner.equals(c2.roles.owner));

    // check times
    assert(c1.definition.createdAt.getTime() === c2.definition.createdAt.getTime());
    if (c1.definition.expiresAt != null)
        assert(c1.definition.expiresAt.getTime() === c2.definition.expiresAt.getTime());
    else
        assert(c1.definition.expiresAt === c2.definition.expiresAt);
    assert(c1.state.createdAt.getTime() === c2.state.createdAt.getTime());
    if (c1.state.expiresAt != null)
        assert(c1.state.expiresAt.getTime() === c2.state.expiresAt.getTime());
    else
        assert(c1.state.expiresAt === c2.state.expiresAt);

    // check data
    assert(c1.definition.data.equals(c2.definition.data));
    assert(c1.state.data.equals(c2.state.data));

    // check definition
    assert(c1.definition.extendedType === c2.definition.extendedType);

    // check state
    assert(c1.state.revision === c2.state.revision);
    assert(c1.state.branchId === c2.state.branchId);
    assert(c1.state.getBranchRevision() === c2.state.getBranchRevision());

    // check constraints
    assert(Array.from(c1.constraints.values()).every(c => c.equals(c2.findConstraintByName(c.name))));
}

module.exports = {createNodeInfoProvider, createFreshU, assertSameContracts};