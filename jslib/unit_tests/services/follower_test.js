import {expect, unit, assert} from 'test'
import * as io from 'io'
import * as tk from 'unit_tests/test_keys'

const NSmartContract = require("services/NSmartContract").NSmartContract;
const NodeInfoProvider = require("services/NSmartContract").NodeInfoProvider;
const FollowerContract = require("services/followerContract").FollowerContract;
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

unit.test("follower_test: goodFollowerContract", async () => {
    let nodeInfoProvider = createNodeInfoProvider();

    let key = new crypto.PrivateKey(await (await io.openRead("../test/_xer0yfe2nn1xthc.private.unikey")).allBytes());
    let key2 = new crypto.PrivateKey(await (await io.openRead("../test/test_network_whitekey.private.unikey")).allBytes());

    let simpleContract = Contract.fromPrivateKey(key2);
    await simpleContract.seal(true);
    assert(await simpleContract.check());

    let privateKey = tk.TestKeys.getKey();
    let callbackKey = privateKey.publicKey;

    let smartContract = FollowerContract.fromPrivateKey(key);

    //assert(smartContract instanceof FollowerContract);

    /*((FollowerContract)smartContract).setNodeInfoProvider(nodeInfoProvider);
    ((FollowerContract)smartContract).putTrackingOrigin(simpleContract.getOrigin(), "http://localhost:7777/follow.callback", callbackKey);

    smartContract.seal();
    smartContract.check();
    smartContract.traceErrors();
    assertTrue(smartContract.isOk());

    assertEquals(NSmartContract.SmartContractType.FOLLOWER1.name(), smartContract.getDefinition().getExtendedType());
    assertEquals(NSmartContract.SmartContractType.FOLLOWER1.name(), smartContract.get("definition.extended_type"));

    Multimap<String, Permission> permissions = smartContract.getPermissions();
    Collection<Permission> mdp = permissions.get("modify_data");
    assertNotNull(mdp);
    assertTrue(((ModifyDataPermission)mdp.iterator().next()).getFields().containsKey("action"));

    assertEquals(((FollowerContract) smartContract).getCallbackKeys().get("http://localhost:7777/follow.callback"), callbackKey );
    assertEquals(((FollowerContract) smartContract).getTrackingOrigins().get(simpleContract.getOrigin()),
            "http://localhost:7777/follow.callback");
    assertTrue(((FollowerContract) smartContract).isOriginTracking(simpleContract.getOrigin()));
    assertTrue(((FollowerContract) smartContract).isCallbackURLUsed("http://localhost:7777/follow.callback"));

    //updateCallbackKey

    PrivateKey newCallbackKey = new PrivateKey(2048);
    assertFalse(((FollowerContract) smartContract).updateCallbackKey("http://localhost:8888/follow.callback", newCallbackKey.getPublicKey()));
    assertTrue(((FollowerContract) smartContract).updateCallbackKey("http://localhost:7777/follow.callback", newCallbackKey.getPublicKey()));

    assertEquals(((FollowerContract) smartContract).getCallbackKeys().get("http://localhost:7777/follow.callback"), newCallbackKey.getPublicKey());
    assertNotEquals(((FollowerContract) smartContract).getCallbackKeys().get("http://localhost:7777/follow.callback"), callbackKey);

    assertEquals(((FollowerContract) smartContract).getTrackingOrigins().get(simpleContract.getOrigin()),
            "http://localhost:7777/follow.callback");
    assertTrue(((FollowerContract) smartContract).isOriginTracking(simpleContract.getOrigin()));
    assertTrue(((FollowerContract) smartContract).isCallbackURLUsed("http://localhost:7777/follow.callback"));

    //removeTrackingOrigin

    ((FollowerContract)smartContract).removeTrackingOrigin(simpleContract.getOrigin());

    assertNotEquals(((FollowerContract) smartContract).getCallbackKeys().get("http://localhost:7777/follow.callback"), callbackKey );
    assertNotEquals(((FollowerContract) smartContract).getTrackingOrigins().get(simpleContract.getOrigin()),
            "http://localhost:7777/follow.callback");
    assertFalse(((FollowerContract) smartContract).isOriginTracking(simpleContract.getOrigin()));
    assertFalse(((FollowerContract) smartContract).isCallbackURLUsed("http://localhost:7777/follow.callback"));*/
});