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

    //await smartContract.seal(true);
    //assert(await smartContract.check());

    /*
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