/*
 * Copyright (c) 2019-present Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

import * as io from 'io'
import {assert, assertSilent} from 'test'

const DefaultBiMapper = require("defaultbimapper").DefaultBiMapper;
const BossBiMapper = require("bossbimapper").BossBiMapper;
const NodeInfoProvider = require("services/NSmartContract").NodeInfoProvider;
const Config = require("config").Config;
const KeyRecord = require("keyrecord").KeyRecord;
const roles = require('roles');

const uTemplatePath = "../test/UTemplate.yml";
const testUTemplatePath = "../test/TestUTemplate.yml";
const uKeyPath = "../test/keys/u_key.private.unikey";

class TestNodeInfoProvider extends NodeInfoProvider {

    constructor() {
        super();
        this.config = new Config();
    }

    getUIssuerKeys() {
        return this.config.uIssuerKeys;
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
 * @param {Array<crypto.PublicKey>} ownerKeys - Public keys that will became an owner of "U".
 * @param {boolean} withTestU - If true U will be created with test "U". Optional. False by default.
 * @return sealed U contract; should be registered in the Universa by simplified procedure.
 */
async function createFreshU(amount, ownerKeys, withTestU = false) {
    let manufacturePrivateKey = new crypto.PrivateKey(await io.fileGetContentsAsBytes(uKeyPath));

    let u = await Contract.fromDslFile(withTestU ? testUTemplatePath : uTemplatePath);

    let ownerRole = new roles.SimpleRole("owner", ownerKeys);
    u.registerRole(ownerRole);

    u.state.data.transaction_units = amount;

    if(withTestU)
        u.state.data.test_transaction_units = amount * 100;

    await u.seal();
    await u.addSignatureToSeal(manufacturePrivateKey);

    return u;
}

async function assertSameContracts(c1, c2) {
    // check issuer
    assertSilent(c1.roles.issuer != null);
    assertSilent(c2.roles.issuer != null);
    assertSilent(c1.roles.issuer.equals(c2.roles.issuer));

    // check creator
    assertSilent(c1.roles.creator != null);
    assertSilent(c2.roles.creator != null);
    assertSilent(c1.roles.creator.equals(c2.roles.creator));

    // check owner
    assertSilent(c1.roles.owner != null);
    assertSilent(c2.roles.owner != null);
    assertSilent(c1.roles.owner.equals(c2.roles.owner));

    // check times
    assertSilent(c1.definition.createdAt.getTime() === c2.definition.createdAt.getTime());
    if (c1.definition.expiresAt != null)
        assertSilent(c1.definition.expiresAt.getTime() === c2.definition.expiresAt.getTime());
    else
        assertSilent(c1.definition.expiresAt === c2.definition.expiresAt);
    assertSilent(c1.state.createdAt.getTime() === c2.state.createdAt.getTime());
    if (c1.state.expiresAt != null)
        assertSilent(c1.state.expiresAt.getTime() === c2.state.expiresAt.getTime());
    else
        assertSilent(c1.state.expiresAt === c2.state.expiresAt);

    // check definition
    assertSilent(c1.definition.extendedType === c2.definition.extendedType);

    assertSilent(c1.definition.data.equals(c2.definition.data));

    // check state
    assertSilent(c1.state.revision === c2.state.revision);
    assertSilent(c1.state.branchId === c2.state.branchId);
    assertSilent(c1.state.getBranchRevision() === c2.state.getBranchRevision());

    assertSilent(c1.state.data.equals(c2.state.data) ||
        (await BossBiMapper.getInstance().serialize(c1.state.data)).equals(await BossBiMapper.getInstance().serialize(c2.state.data)) ||
        (await DefaultBiMapper.getInstance().serialize(c1.state.data)).equals(await DefaultBiMapper.getInstance().serialize(c2.state.data)));

    // check constraints
    assertSilent(Array.from(c1.constraints.values()).every(c => c.equals(c2.findConstraintByName(c.name))));
}

module.exports = {createNodeInfoProvider, createFreshU, assertSameContracts};