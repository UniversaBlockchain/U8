import {expect, unit, assert} from 'test'
import * as io from 'io'
import * as tk from 'unit_tests/test_keys'

const NSmartContract = require("services/NSmartContract").NSmartContract;
const FollowerContract = require("services/followerContract").FollowerContract;
const tt = require("test_tools");

unit.test("follower_test: goodFollowerContract", async () => {
    let nodeInfoProvider = tt.createNodeInfoProvider();

    let key = new crypto.PrivateKey(await (await io.openRead("../test/_xer0yfe2nn1xthc.private.unikey")).allBytes());
    let key2 = new crypto.PrivateKey(await (await io.openRead("../test/test_network_whitekey.private.unikey")).allBytes());

    let simpleContract = Contract.fromPrivateKey(key2);
    await simpleContract.seal(true);
    assert(await simpleContract.check());

    let privateKey = tk.TestKeys.getKey();
    let callbackKey = privateKey.publicKey;

    let smartContract = FollowerContract.fromPrivateKey(key);

    assert(smartContract instanceof FollowerContract);

    smartContract.nodeInfoProvider = nodeInfoProvider;
    smartContract.putTrackingOrigin(simpleContract.getOrigin(), "http://localhost:7777/follow.callback", callbackKey);

    await smartContract.seal(true);
    assert(await smartContract.check());

    assert(NSmartContract.SmartContractType.FOLLOWER1 === smartContract.definition.extendedType);

    let mdp = smartContract.definition.permissions.get("modify_data");
    assert(mdp != null);
    assert(mdp instanceof Array);
    assert(mdp[0].fields.hasOwnProperty("action"));

    assert(callbackKey.equals(smartContract.callbackKeys.get("http://localhost:7777/follow.callback")));
    assert(smartContract.trackingOrigins.get(simpleContract.getOrigin()) === "http://localhost:7777/follow.callback");
    assert(smartContract.isOriginTracking(simpleContract.getOrigin()));
    assert(smartContract.isCallbackURLUsed("http://localhost:7777/follow.callback"));

    //updateCallbackKey

    privateKey = tk.TestKeys.getKey();
    let newCallbackKey = privateKey.publicKey;
    assert(!smartContract.updateCallbackKey("http://localhost:8888/follow.callback", newCallbackKey));
    assert(smartContract.updateCallbackKey("http://localhost:7777/follow.callback", newCallbackKey));

    assert(newCallbackKey.equals(smartContract.callbackKeys.get("http://localhost:7777/follow.callback")));
    assert(!callbackKey.equals(smartContract.callbackKeys.get("http://localhost:7777/follow.callback")));

    assert(smartContract.trackingOrigins.get(simpleContract.getOrigin()) === "http://localhost:7777/follow.callback");
    assert(smartContract.isOriginTracking(simpleContract.getOrigin()));
    assert(smartContract.isCallbackURLUsed("http://localhost:7777/follow.callback"));

    //removeTrackingOrigin

    smartContract.removeTrackingOrigin(simpleContract.getOrigin());

    assert(smartContract.callbackKeys.get("http://localhost:7777/follow.callback") == null);
    assert(smartContract.trackingOrigins.get(simpleContract.getOrigin()) !== "http://localhost:7777/follow.callback");
    assert(!smartContract.isOriginTracking(simpleContract.getOrigin()));
    assert(!smartContract.isCallbackURLUsed("http://localhost:7777/follow.callback"));
});