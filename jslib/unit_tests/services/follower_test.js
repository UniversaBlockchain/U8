import {expect, unit, assert} from 'test'
import * as io from 'io'
import * as tk from 'unit_tests/test_keys'

const NSmartContract = require("services/NSmartContract").NSmartContract;
const FollowerContract = require("services/followerContract").FollowerContract;
const tt = require("test_tools");
const DefaultBiMapper = require("defaultbimapper").DefaultBiMapper;
const BossBiMapper = require("bossbimapper").BossBiMapper;
const KeyRecord = require("keyrecord").KeyRecord;
const roles = require('roles');

unit.test("follower_test: goodFollowerContract", async () => {
    let key = new crypto.PrivateKey(await (await io.openRead("../test/_xer0yfe2nn1xthc.private.unikey")).allBytes());
    let key2 = new crypto.PrivateKey(await (await io.openRead("../test/test_network_whitekey.private.unikey")).allBytes());

    let simpleContract = Contract.fromPrivateKey(key2);
    await simpleContract.seal(true);
    assert(await simpleContract.check());

    let privateKey = tk.TestKeys.getKey();
    let callbackKey = privateKey.publicKey;

    let followerContract = FollowerContract.fromPrivateKey(key);

    assert(followerContract instanceof FollowerContract);

    followerContract.nodeInfoProvider = tt.createNodeInfoProvider();
    followerContract.putTrackingOrigin(simpleContract.getOrigin(), "http://localhost:7777/follow.callback", callbackKey);

    await followerContract.seal(true);
    assert(await followerContract.check());

    assert(NSmartContract.SmartContractType.FOLLOWER1 === followerContract.definition.extendedType);

    let mdp = followerContract.definition.permissions.get("modify_data");
    assert(mdp != null);
    assert(mdp instanceof Array);
    assert(mdp[0].fields.hasOwnProperty("action"));

    assert(callbackKey.equals(followerContract.callbackKeys.get("http://localhost:7777/follow.callback")));
    assert(followerContract.trackingOrigins.get(simpleContract.getOrigin()) === "http://localhost:7777/follow.callback");
    assert(followerContract.isOriginTracking(simpleContract.getOrigin()));
    assert(followerContract.isCallbackURLUsed("http://localhost:7777/follow.callback"));

    //updateCallbackKey

    privateKey = tk.TestKeys.getKey();
    let newCallbackKey = privateKey.publicKey;
    assert(!followerContract.updateCallbackKey("http://localhost:8888/follow.callback", newCallbackKey));
    assert(followerContract.updateCallbackKey("http://localhost:7777/follow.callback", newCallbackKey));

    assert(newCallbackKey.equals(followerContract.callbackKeys.get("http://localhost:7777/follow.callback")));
    assert(!callbackKey.equals(followerContract.callbackKeys.get("http://localhost:7777/follow.callback")));

    assert(followerContract.trackingOrigins.get(simpleContract.getOrigin()) === "http://localhost:7777/follow.callback");
    assert(followerContract.isOriginTracking(simpleContract.getOrigin()));
    assert(followerContract.isCallbackURLUsed("http://localhost:7777/follow.callback"));

    //removeTrackingOrigin

    followerContract.removeTrackingOrigin(simpleContract.getOrigin());

    assert(followerContract.callbackKeys.get("http://localhost:7777/follow.callback") == null);
    assert(followerContract.trackingOrigins.get(simpleContract.getOrigin()) !== "http://localhost:7777/follow.callback");
    assert(!followerContract.isOriginTracking(simpleContract.getOrigin()));
    assert(!followerContract.isCallbackURLUsed("http://localhost:7777/follow.callback"));
});

unit.test("follower_test: goodFollowerContractFromDSL", async () => {
    let key = new crypto.PrivateKey(await (await io.openRead("../test/_xer0yfe2nn1xthc.private.unikey")).allBytes());
    let key2 = new crypto.PrivateKey(await (await io.openRead("../test/test_network_whitekey.private.unikey")).allBytes());

    let simpleContract = Contract.fromPrivateKey(key2);
    await simpleContract.seal(true);
    assert(await simpleContract.check());

    let privateKey = tk.TestKeys.getKey();
    let callbackKey = privateKey.publicKey;

    let followerContract = await FollowerContract.fromDslFile("../test/services/FollowerDSLTemplate.yml");
    followerContract.keysToSignWith.add(key);

    assert(followerContract instanceof FollowerContract);

    followerContract.nodeInfoProvider = tt.createNodeInfoProvider();
    followerContract.putTrackingOrigin(simpleContract.getOrigin(), "http://localhost:7777/follow.callback", callbackKey);

    await followerContract.seal(true);
    assert(await followerContract.check());

    assert(NSmartContract.SmartContractType.FOLLOWER1 === followerContract.definition.extendedType);

    let mdp = followerContract.definition.permissions.get("modify_data");
    assert(mdp != null);
    assert(mdp instanceof Array);
    assert(mdp[0].fields.hasOwnProperty("action"));

    assert(callbackKey.equals(followerContract.callbackKeys.get("http://localhost:7777/follow.callback")));
    assert(followerContract.trackingOrigins.get(simpleContract.getOrigin()) === "http://localhost:7777/follow.callback");
    assert(followerContract.isOriginTracking(simpleContract.getOrigin()));
    assert(followerContract.isCallbackURLUsed("http://localhost:7777/follow.callback"));
});

unit.test("follower_test: serializeFollowerContract", async () => {
    let key = new crypto.PrivateKey(await (await io.openRead("../test/_xer0yfe2nn1xthc.private.unikey")).allBytes());
    let key2 = new crypto.PrivateKey(await (await io.openRead("../test/test_network_whitekey.private.unikey")).allBytes());

    let simpleContract = Contract.fromPrivateKey(key2);
    await simpleContract.seal(true);
    assert(await simpleContract.check());

    let privateKey = tk.TestKeys.getKey();
    let callbackKey = privateKey.publicKey;

    let followerContract = FollowerContract.fromPrivateKey(key);

    assert(followerContract instanceof FollowerContract);

    followerContract.nodeInfoProvider = tt.createNodeInfoProvider();

    await followerContract.seal(true);
    assert(await followerContract.check());

    let b = BossBiMapper.getInstance().serialize(followerContract);
    let b2 = DefaultBiMapper.getInstance().serialize(followerContract);

    let desContract = BossBiMapper.getInstance().deserialize(b);
    let desContract2 = DefaultBiMapper.getInstance().deserialize(b2);

    tt.assertSameContracts(desContract, followerContract);
    tt.assertSameContracts(desContract2, followerContract);

    assert(NSmartContract.SmartContractType.FOLLOWER1 === desContract.definition.extendedType);
    assert(NSmartContract.SmartContractType.FOLLOWER1 === desContract2.definition.extendedType);

    let mdp = desContract.definition.permissions.get("modify_data");
    assert(mdp != null);
    assert(mdp instanceof Array);
    assert(mdp[0].fields.hasOwnProperty("action"));

    desContract.putTrackingOrigin(simpleContract.getOrigin(), "http://localhost:7777/follow.callback", callbackKey);

    assert(callbackKey.equals(desContract.callbackKeys.get("http://localhost:7777/follow.callback")));
    assert(desContract.trackingOrigins.get(simpleContract.getOrigin()) === "http://localhost:7777/follow.callback");
    assert(desContract.isOriginTracking(simpleContract.getOrigin()));
    assert(desContract.isCallbackURLUsed("http://localhost:7777/follow.callback"));

    mdp = desContract2.definition.permissions.get("modify_data");
    assert(mdp != null);
    assert(mdp instanceof Array);
    assert(mdp[0].fields.hasOwnProperty("action"));

    desContract2.putTrackingOrigin(simpleContract.getOrigin(), "http://localhost:7777/follow.callback", callbackKey);

    assert(callbackKey.equals(desContract2.callbackKeys.get("http://localhost:7777/follow.callback")));
    assert(desContract2.trackingOrigins.get(simpleContract.getOrigin()) === "http://localhost:7777/follow.callback");
    assert(desContract2.isOriginTracking(simpleContract.getOrigin()));
    assert(desContract2.isCallbackURLUsed("http://localhost:7777/follow.callback"));

    let copiedContract = followerContract.copy();

    tt.assertSameContracts(followerContract, copiedContract);

    assert(copiedContract instanceof FollowerContract);

    assert(NSmartContract.SmartContractType.FOLLOWER1 === copiedContract.definition.extendedType);

    mdp = copiedContract.definition.permissions.get("modify_data");
    assert(mdp != null);
    assert(mdp instanceof Array);
    assert(mdp[0].fields.hasOwnProperty("action"));

    copiedContract.putTrackingOrigin(simpleContract.getOrigin(), "http://localhost:7777/follow.callback", callbackKey);

    assert(callbackKey.equals(copiedContract.callbackKeys.get("http://localhost:7777/follow.callback")));
    assert(copiedContract.trackingOrigins.get(simpleContract.getOrigin()) === "http://localhost:7777/follow.callback");
    assert(copiedContract.isOriginTracking(simpleContract.getOrigin()));
    assert(copiedContract.isCallbackURLUsed("http://localhost:7777/follow.callback"));
});

unit.test("follower_test: followerContractNewRevision", async () => {
    let provider = tt.createNodeInfoProvider();

    let key = new crypto.PrivateKey(await (await io.openRead("../test/_xer0yfe2nn1xthc.private.unikey")).allBytes());
    let key2 = new crypto.PrivateKey(await (await io.openRead("../test/test_network_whitekey.private.unikey")).allBytes());

    let simpleContract = Contract.fromPrivateKey(key2);
    await simpleContract.seal(true);
    assert(await simpleContract.check());

    let privateKey = tk.TestKeys.getKey();
    let callbackKey = privateKey.publicKey;

    let followerContract = FollowerContract.fromPrivateKey(key);

    assert(followerContract instanceof FollowerContract);

    followerContract.nodeInfoProvider = provider;
    followerContract.putTrackingOrigin(simpleContract.getOrigin(), "http://localhost:7777/follow.callback", callbackKey);

    await followerContract.seal(true);
    assert(await followerContract.check());

    assert(NSmartContract.SmartContractType.FOLLOWER1 === followerContract.definition.extendedType);

    let mdp = followerContract.definition.permissions.get("modify_data");
    assert(mdp != null);
    assert(mdp instanceof Array);
    assert(mdp[0].fields.hasOwnProperty("action"));

    assert(callbackKey.equals(followerContract.callbackKeys.get("http://localhost:7777/follow.callback")));
    assert(followerContract.trackingOrigins.get(simpleContract.getOrigin()) === "http://localhost:7777/follow.callback");
    assert(followerContract.isOriginTracking(simpleContract.getOrigin()));
    assert(followerContract.isCallbackURLUsed("http://localhost:7777/follow.callback"));

    //create new revision

    let simpleContract2 = Contract.fromPrivateKey(key2);
    await simpleContract2.seal(true);
    assert(await simpleContract2.check());

    let newRevFollowerContract = followerContract.createRevision([key]);

    assert(newRevFollowerContract instanceof FollowerContract);

    newRevFollowerContract.nodeInfoProvider = provider;
    newRevFollowerContract.putTrackingOrigin(simpleContract2.getOrigin(), "http://localhost:7777/follow.callbackTwo", callbackKey);
    await newRevFollowerContract.seal(true);
    assert(await newRevFollowerContract.check());

    assert(NSmartContract.SmartContractType.FOLLOWER1 === newRevFollowerContract.definition.extendedType);

    mdp = newRevFollowerContract.definition.permissions.get("modify_data");
    assert(mdp != null);
    assert(mdp instanceof Array);
    assert(mdp[0].fields.hasOwnProperty("action"));

    assert(callbackKey.equals(newRevFollowerContract.callbackKeys.get("http://localhost:7777/follow.callback")));
    assert(newRevFollowerContract.trackingOrigins.get(simpleContract.getOrigin()) === "http://localhost:7777/follow.callback");
    assert(newRevFollowerContract.isOriginTracking(simpleContract.getOrigin()));
    assert(newRevFollowerContract.isCallbackURLUsed("http://localhost:7777/follow.callback"));

    assert(callbackKey.equals(newRevFollowerContract.callbackKeys.get("http://localhost:7777/follow.callbackTwo")));
    assert(newRevFollowerContract.trackingOrigins.get(simpleContract2.getOrigin()) === "http://localhost:7777/follow.callbackTwo");
    assert(newRevFollowerContract.isOriginTracking(simpleContract2.getOrigin()));
    assert(newRevFollowerContract.isCallbackURLUsed("http://localhost:7777/follow.callbackTwo"));

    //updateCallbackKey

    privateKey = tk.TestKeys.getKey();
    let newCallbackKey = privateKey.publicKey;

    assert(!newRevFollowerContract.updateCallbackKey("http://localhost:8888/follow.callback", newCallbackKey));
    assert(newRevFollowerContract.updateCallbackKey("http://localhost:7777/follow.callback", newCallbackKey));

    assert(newCallbackKey.equals(newRevFollowerContract.callbackKeys.get("http://localhost:7777/follow.callback")));
    assert(!callbackKey.equals(newRevFollowerContract.callbackKeys.get("http://localhost:7777/follow.callback")));

    assert(newRevFollowerContract.trackingOrigins.get(simpleContract.getOrigin()) === "http://localhost:7777/follow.callback");
    assert(newRevFollowerContract.isOriginTracking(simpleContract.getOrigin()));
    assert(newRevFollowerContract.isCallbackURLUsed("http://localhost:7777/follow.callback"));

    assert(callbackKey.equals(newRevFollowerContract.callbackKeys.get("http://localhost:7777/follow.callbackTwo")));
    assert(newRevFollowerContract.trackingOrigins.get(simpleContract2.getOrigin()) === "http://localhost:7777/follow.callbackTwo");
    assert(newRevFollowerContract.isOriginTracking(simpleContract2.getOrigin()));
    assert(newRevFollowerContract.isCallbackURLUsed("http://localhost:7777/follow.callbackTwo"));

    //removeTrackingOrigin

    newRevFollowerContract.removeTrackingOrigin(simpleContract.getOrigin());

    assert(newRevFollowerContract.callbackKeys.get("http://localhost:7777/follow.callback") == null);
    assert(newRevFollowerContract.trackingOrigins.get(simpleContract.getOrigin()) !== "http://localhost:7777/follow.callback");
    assert(!newRevFollowerContract.isOriginTracking(simpleContract.getOrigin()));
    assert(!newRevFollowerContract.isCallbackURLUsed("http://localhost:7777/follow.callback"));

    assert(callbackKey.equals(newRevFollowerContract.callbackKeys.get("http://localhost:7777/follow.callbackTwo")));
    assert(newRevFollowerContract.trackingOrigins.get(simpleContract2.getOrigin()) === "http://localhost:7777/follow.callbackTwo");
    assert(newRevFollowerContract.isOriginTracking(simpleContract2.getOrigin()));
    assert(newRevFollowerContract.isCallbackURLUsed("http://localhost:7777/follow.callbackTwo"));
});

unit.test("follower_test: testCanFollowContract", async () => {
    /*let key = new crypto.PrivateKey(await (await io.openRead("../test/_xer0yfe2nn1xthc.private.unikey")).allBytes());
    let key2 = new crypto.PrivateKey(await (await io.openRead("../test/test_network_whitekey.private.unikey")).allBytes());

    let simpleContract = Contract.fromPrivateKey(key2);
    await simpleContract.seal(true);
    assert(await simpleContract.check());

    let owner1 = new roles.SimpleRole("owner", KeyRecord(key.publicKey)); //todo
    let owner2 = new roles.SimpleRole("owner", KeyRecord(key2.publicKey));

    let ownerKeys = new roles.ListRole("owner", ListRole.Mode.ANY,Do.listOf(owner1, owner2)); //TODO

    let simpleContract2 = Contract.fromPrivateKey(key2);
    simpleContract2.registerRole(ownerKeys);
    await simpleContract2.seal(true);
    assert(await simpleContract2.check());

    let callbackKey = tk.TestKeys.getKey();
    let followerContract = FollowerContract.fromPrivateKey(key);
    assert(followerContract instanceof FollowerContract);

    followerContract.nodeInfoProvider = tt.createNodeInfoProvider();
    followerContract.putTrackingOrigin(simpleContract.getOrigin(), "http://localhost:7777/follow.callback", callbackKey.publicKey);
    await followerContract.seal(true);

    // check canFollowContract
    assert(followerContract.canFollowContract(simpleContract2));

    // can not follow simpleContract (owner = key2) by followerContract (signed by key)
    assert(!followerContract.canFollowContract(simpleContract));

    let newR = Do.listOf(followerContract.getRole("owner").resolve()); ///

    simpleContract.definition.data[FOLLOWER_ROLES_FIELD_NAME] =  newR;

    await simpleContract.seal(true);
    assert(await simpleContract.check());

    assert(followerContract.canFollowContract(simpleContract));

    data.remove(FOLLOWER_ROLES_FIELD_NAME);

    await simpleContract.seal(true);
    assert(await simpleContract.check());

    assert(!followerContract.canFollowContract(simpleContract));

    //state
    simpleContract.state.data[FOLLOWER_ROLES_FIELD_NAME] =  newR;

    await simpleContract.seal(true);
    assert(await simpleContract.check());

    assert(followerContract.canFollowContract(simpleContract));

    simpleContract.getStateData().remove(FOLLOWER_ROLES_FIELD_NAME);

    await simpleContract.seal(true);
    assert(await simpleContract.check());

    assert(!followerContract.canFollowContract(simpleContract));

    //transactional
    simpleContract.transactional.data[FOLLOWER_ROLES_FIELD_NAME] = newR;

    await simpleContract.seal(true);
    assert(await simpleContract.check());

    assert(followerContract.canFollowContract(simpleContract));

    simpleContract.getTransactionalData().remove(FOLLOWER_ROLES_FIELD_NAME);

    await simpleContract.seal(true);
    assert(await simpleContract.check());

    assert(!followerContract.canFollowContract(simpleContract));*/
});

unit.test("follower_test: testAllCanFollowContract", async () => {
    /*let key = new crypto.PrivateKey(await (await io.openRead("../test/_xer0yfe2nn1xthc.private.unikey")).allBytes());
    let followerKey = tk.TestKeys.getKey();

    let simpleContract = Contract.fromPrivateKey(key);
    await simpleContract.seal(true);
    assert(await simpleContract.check());

    let callbackKey = tk.TestKeys.getKey();

    let followerContract = FollowerContract.fromPrivateKey(followerKey);

    followerContract.nodeInfoProvider = tt.createNodeInfoProvider();
    followerContract.putTrackingOrigin(simpleContract.getOrigin(), "http://localhost:7777/follow.callback", callbackKey.publicKey);
    await followerContract.seal(true);

    // can not follow simpleContract (owner = key2) by smartContract (signed by key)
    assert(!followerContract.canFollowContract(simpleContract));

    //ListRole followerAllRole = new ListRole("all", 0, new ArrayList<>()); //TODO
    //List<Role> followerAllRoles = Do.listOf(followerAllRole);

    simpleContract.definition.data[FOLLOWER_ROLES_FIELD_NAME] =  followerAllRoles;

    await simpleContract.seal(true);
    assert(await simpleContract.check());

    assert(followerContract.canFollowContract(simpleContract));

    data.remove(FOLLOWER_ROLES_FIELD_NAME);

    await simpleContract.seal(true);
    assert(await simpleContract.check());

    assert(!followerContract.canFollowContract(simpleContract));

    //state
    simpleContract.state.data[FOLLOWER_ROLES_FIELD_NAME] = followerAllRoles;

    await simpleContract.seal(true);
    assert(await simpleContract.check());

    assert(followerContract.canFollowContract(simpleContract));

    simpleContract.getStateData().remove(FOLLOWER_ROLES_FIELD_NAME);

    await simpleContract.seal(true);
    assert(await simpleContract.check());

    assert(!followerContract.canFollowContract(simpleContract));

    //transactional
    simpleContract.transactional.data[FOLLOWER_ROLES_FIELD_NAME] =  followerAllRoles;

    await simpleContract.seal(true);
    assert(await simpleContract.check());

    assert(followerContract.canFollowContract(simpleContract));

    simpleContract.getTransactionalData().remove(FOLLOWER_ROLES_FIELD_NAME);

    await simpleContract.seal(true);
    assert(await simpleContract.check());

    assert(!followerContract.canFollowContract(simpleContract));*/
});