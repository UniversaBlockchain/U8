import {expect, unit, assert, assertSilent} from 'test'
import * as tk from 'unit_tests/test_keys'
import {Ledger} from "ledger";

const NSmartContract = require("services/NSmartContract").NSmartContract;
const NImmutableEnvironment = require("services/NImmutableEnvironment").NImmutableEnvironment;
const NMutableEnvironment = require("services/NMutableEnvironment").NMutableEnvironment;
const NameCache = require("namecache").NameCache;

async function createTestLedger() {
    return new Ledger("host=localhost port=5432 dbname=unit_tests");
}

unit.test("environment_test: getMutable", async () => {
    let ledger = await createTestLedger();
    let immutable = new NImmutableEnvironment(NSmartContract.fromPrivateKey(tk.TestKeys.getKey()), ledger);
    immutable.id = 123;

    assert(immutable instanceof NImmutableEnvironment);

    let mutable = immutable.getMutable();

    assert(mutable instanceof NMutableEnvironment);
    assert(mutable.id === immutable.id);

    await ledger.close();
});

unit.test("environment_test: saveAndGet", async () => {
    let ledger = await createTestLedger();
    let contract = NSmartContract.fromPrivateKey(tk.TestKeys.getKey());
    await contract.seal();

    let immutable = new NImmutableEnvironment(contract, ledger);

    assert(immutable.id === 0);
    assert(immutable.contract.sealedBinary === contract.sealedBinary);
    assert(immutable.ledger === ledger);
    assert(immutable.createdAt.getTime() <= Date.now());

    await ledger.saveEnvironment(immutable);
    let env = await ledger.getEnvironmentByContractID(contract.id);

    assert(env.contract.sealedBinary.equals(immutable.contract.sealedBinary));
    assert(env.ledger === immutable.ledger);

    let env2 = await ledger.getEnvironment(env.id);

    assert(env.id === env2.id);
    assert(env.contract.sealedBinary.equals(env2.contract.sealedBinary));
    assert(env.ledger === env2.ledger);

    await ledger.close();
});

unit.test("environment_test: kvStorage", async () => {
    let ledger = await createTestLedger();
    let contract = NSmartContract.fromPrivateKey(tk.TestKeys.getKey());
    await contract.seal();

    let immutable = await ledger.getEnvironmentByContract(contract);
    immutable.nameCache = new NameCache(10000);

    let mutable = immutable.getMutable();

    assert(immutable.contract instanceof NSmartContract);
    assert(mutable.contract instanceof NSmartContract);

    mutable.set("key", "value");

    await mutable.save();

    assert(immutable.get("key") === "value");
    assert(mutable.get("key") === "value");

    let env = await ledger.getEnvironmentByContract(contract);

    assert(immutable.id === env.id);
    assert(mutable.id === env.id);
    assert(env.get("key") === "value");

    await ledger.close();
});