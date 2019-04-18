import {expect, unit, assert, assertSilent} from 'test'
import * as tk from 'unit_tests/test_keys'
import {Ledger} from "ledger";

const NImmutableEnvironment = require("services/NImmutableEnvironment").NImmutableEnvironment;
const NMutableEnvironment = require("services/NMutableEnvironment").NMutableEnvironment;

unit.test("environment_test: getMutable", async () => {
    let ledger = await new Ledger("host=localhost port=5432 dbname=unit_tests");
    let immutable = new NImmutableEnvironment(Contract.fromPrivateKey(tk.TestKeys.getKey()), ledger);

    assert(immutable instanceof NImmutableEnvironment);

    let mutable = immutable.getMutable();

    assert(mutable instanceof NMutableEnvironment);

    await ledger.close();
});