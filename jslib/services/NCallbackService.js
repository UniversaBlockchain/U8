import {VerboseLevel} from "node_consts";
import {CallbackNotification, CallbackNotificationType} from "notification";
import {HttpServer, HttpClient} from 'web'
import {AsyncEvent} from "executorservice";

const Boss = require("boss");
const ItemState = require('itemstate').ItemState;
const CallbackService = require("services/callbackService").CallbackService;
const Config = require("config").Config;
const FollowerCallbackState = require("services/followerCallbackState").FollowerCallbackState;
const events = require("services/contractSubscription");
const t = require("tools");

/**
 * Implements CallbackService interface for Universa node.
 */
class NCallbackService extends CallbackService {

    /**
     * Initialize callback service on node and start synchronization thread.
     *
     * @param {Node} node - Universa node.
     * @param {Config} config - Node configuration.
     * @param {NodeInfo} myInfo - Node information.
     * @param {Ledger} ledger - DB ledger.
     * @param {Network} network - Universa network.
     * @param {PrivateKey} nodeKey - Public key of node.
     * @param {ExecutorService} executorService is executor service from node to run synchronization.
     */
    constructor(node, config, myInfo, ledger, network, nodeKey, executorService) {
        super();
        this.node = node;
        this.config = config;
        this.myInfo = myInfo;
        this.ledger = ledger;
        this.network = network;
        this.nodeKey = nodeKey;
        this.executorService = executorService;
        this.callbackProcessors = new t.GenericMap();
        this.deferredCallbackNotifications = new t.GenericMap();
        this.callbacksToSynchronize = new t.GenericMap();
        this.httpClient = null;

        // start synchronization
        //executorService.scheduleWithFixedDelay(() => this.synchronizeFollowerCallbacks(), 60, config.followerCallbackSynchronizationInterval);

        //this.executorService = new ExecutorWithFixedPeriod(() => this.synchronizeFollowerCallbacks(), [60000 + config.followerCallbackSynchronizationInterval]).run();
    }

    /**
     * Starts state synchronization for expired callbacks (past expiration time and state is STARTED or EXPIRED) for environment.
     * The follower contract that launched it is notified of the synchronized state of the callback.
     *
     * @param {number} environmentId - Callback processor.
     */
    async synchronizeFollowerCallbacks(environmentId = undefined) {
        let nodesCount = this.network.getNodesCount();
        if (nodesCount < 2)
            return;

        let callbackRecords;

        if (environmentId !== undefined)
            callbackRecords = await this.ledger.getFollowerCallbacksToResyncByEnvId(environmentId);
        else
            callbackRecords = await this.ledger.getFollowerCallbacksToResync();

        if (callbackRecords.length > 0)
            this.startSynchronizeFollowerCallbacks(callbackRecords, nodesCount);
    }

    startSynchronizeFollowerCallbacks(callbackRecords, nodesCount) {
        let expiresAt = new Date();
        expiresAt.setDate(expiresAt.getSeconds() + 20);

        callbackRecords.forEach(r => {
            if (!this.callbacksToSynchronize.has(r.id)) {
                // init record to synchronization
                r.setExpiresAt(expiresAt);
                r.setConsensusAndLimit(nodesCount);
                this.callbacksToSynchronize.set(r.id, r);

                // request callback state from all nodes
                this.network.broadcast(this.myInfo, new CallbackNotification(this.myInfo, r.id,
                    CallbackNotificationType.GET_STATE, null));
            }
        });

        new ScheduleExecutor(() => this.endSynchronizeFollowerCallbacks(), 20000, this.node.executorService).run(); //20 s
    }

    async endSynchronizeFollowerCallbacks() {
        await this.node.lock.synchronize(this.endSynchronizeFollowerCallbacks, async () => { //TODO
            for (let record of this.callbacksToSynchronize.values()) {
                if (await record.endSynchronize(this.ledger, this.node))
                    this.callbacksToSynchronize.delete(record.id);
            }
        });
    }

    /**
     * Runs callback processor for one callback. Adds callback record to ledger, runs callback processing thread and
     * checks and obtains deferred callback notifications.
     *
     * @param {Contract} updatingItem - New revision of following contract.
     * @param {ItemState} state - State of new revision of following contract.
     * @param {NSmartContract} contract - Contract is follower contract.
     * @param {MutableEnvironment} me is environment.
     */
    async startCallbackProcessor(updatingItem, state, contract, me) {
        // initialize callback processor
        let callback = new CallbackProcessor(updatingItem, state, contract, me.id, this);

        // add callback record to DB
        await CallbackRecord.addCallbackRecordToLedger(callback.id, me.id, this.config, this.network.getNodesCount(), this.ledger);

        // run callback processor
        let repeatDelay = this.config.followerCallbackDelay * 1000 * (this.network.getNodesCount() + 2); //TODO

        //callback.setExecutor(executorService.scheduleWithFixedDelay(() => callback.call(), callback.delay, repeatDelay, TimeUnit.MILLISECONDS));

        await this.node.lock.synchronize(this.callbackProcessors, async () => {
            this.callbackProcessors.set(callback.id, callback);

            this.node.report("notifyFollowerSubscribers: put callback " + callback.id.base64, VerboseLevel.DETAILED);

            let deferredNotification = this.deferredCallbackNotifications.get(callback.id);
            if (deferredNotification != null) {
                // do deferred notification
                await callback.obtainNotification(deferredNotification);

                this.deferredCallbackNotifications.delete(callback.id);

                this.node.report("notifyFollowerSubscribers: remove deferred notification for callback " + callback.id.base64,
                    VerboseLevel.DETAILED);
            }
        });
    }

    /**
     * Request distant callback URL. Send new revision of following contract and signature (by node key).
     * Receive answer and return it if HTTP response code equals 200.
     *
     * @param {CallbackProcessor} callback - Callback processor.
     * @param {String} callbackURL - Callback URL.
     * @param {Uint8Array} packedData - Packed new revision of following contract or identifier of revoking following contract.
     * @return {Uint8Array | null} callback receipt (signed with callback key identifier of following contract) or null (if connection error).
     */
     async requestFollowerCallback(callback, callbackURL, packedData) {
        return await this.node.lock.synchronize("requestFollowerCallback", async () => {
            let call;

            if (callback.state === ItemState.APPROVED)
                call = {
                    event : "new",
                    data : packedData,
                    signature : await this.nodeKey.sign(packedData, crypto.SHA512),
                    key : this.nodeKey.publicKey.packed
                };
            else if (callback.state === ItemState.REVOKED)
                call = {
                    event : "revoke",
                    id : packedData,
                    signature : await this.nodeKey.sign(packedData, crypto.SHA512),
                    key : this.nodeKey.publicKey.packed
                };
            else
                return null;

            let data = Boss.dump(call);

            let CRLF = "\r\n"; // Line separator required by multipart/form-data.
            let boundary = "==boundary==" + t.randomString(48);

            if (this.httpClient == null)
                this.httpClient = new HttpClient("", 4, 4096);

            let beginRequest = "";
            // Send binary file.
            beginRequest += "--" + boundary + CRLF;
            beginRequest += "Content-Disposition: form-data; name=\"callbackData\"; filename=\"callbackData.boss\"" + CRLF;
            beginRequest += "Content-Type: application/octet-stream" + CRLF;
            beginRequest += "Content-Transfer-Encoding: binary" + CRLF + CRLF;
            beginRequest = utf8Encode(beginRequest);

            // End of multipart/form-data.
            let endRequest = CRLF + "--" + boundary + "--" + CRLF;

            let request = new Uint8Array(beginRequest.length + endRequest.length + data.length);
            request.set(beginRequest);
            request.set(data, beginRequest.length);
            request.set(endRequest, beginRequest.length + data.length);

            let event = new AsyncEvent(this.node.executorService);

            //TODO: httpClient setRequestProperty/setTimeout
            //connection.setDoOutput(true);
            //connection.setConnectTimeout(2000);
            //connection.setReadTimeout(5000);
            //connection.setRequestProperty("Content-Type", "multipart/form-data; boundary=" + boundary);
            //connection.setRequestProperty("User-Agent", "Universa Node");
            this.httpClient.sendGetRequestUrl(callbackURL, (respCode, body) => {
                if (respCode === 200) {
                    if (body == null || body.length === 0) {
                        event.fire(null);
                        return;
                    }

                    // get receipt from answer
                    let res = Boss.load(body);
                    if (!res.hasOwnProperty("receipt")) {
                        event.fire(null);
                        return;
                    }

                    event.fire(res.receipt);
                } else
                    event.fire(null);
            });

            callback.isItemSended = true;

            let res = null;
            try {
                res = await event.await(5000);
            } catch (err) {
                res = null;
            }

            return res;
        });
    }

    async obtainCallbackNotification(notification) {
        let callback;

        this.node.report("obtainCallbackNotification: callback " +  notification.id.base64 + " type " + notification.type.val,
            VerboseLevel.DETAILED);

        if (notification.type === CallbackNotificationType.GET_STATE) {
            this.network.deliver(notification.from, new CallbackNotification(this.myInfo, notification.id,
                CallbackNotificationType.RETURN_STATE, null,
                this.ledger.getFollowerCallbackStateById(notification.id)));

        } else if (notification.type === CallbackNotificationType.RETURN_STATE) {
            await this.node.lock.synchronize(this.callbackProcessors, async () => {
                let record = this.callbacksToSynchronize.get(notification.id);

                if ((record != null) && await record.synchronizeState(notification.state, this.ledger, this.node)) {
                    this.callbacksToSynchronize.delete(notification.id);

                    this.node.report("obtainCallbackNotification: callback " + notification.id.base64 +
                        " synchronized with state " + notification.state.val, VerboseLevel.DETAILED);
                }
            });
        } else {
            //await this.node.lock.synchronize(this.callbackProcessors, async () => { //TODO
                callback = this.callbackProcessors.get(notification.id);
                if (callback == null) {
                    this.node.report("obtainCallbackNotification not found callback " + notification.id.base64,
                        VerboseLevel.BASE);

                    this.deferredCallbackNotifications.set(notification.id, notification);
                    return;
                }
            //});

            await callback.obtainNotification(notification);
        }
    }
}

class CallbackProcessor {
    constructor(item, state, follower, environmentId, callbackService) {
        this.itemId = item.id;
        this.state = state;
        this.environmentId = environmentId;
        this.callbackService = callbackService;
        this.delay = 1;
        this.packedItem = item.getPackedTransaction();

        this.isItemSended = false;
        this.executor = null;

        this.nodesSendCallback = new t.GenericSet();

        // calculate callback hash
        let digest = this.itemId.digest;
        let URL = utf8Encode(this.callbackURL);
        let concat = new Uint8Array(digest.length + URL.length + 1);
        concat[0] = state.ordinal;
        concat.set(digest, 1);
        concat.set(URL, digest.length + 1);

        this.id = crypto.HashId.of(concat);

        // calculate expiration time
        this.expiresAt = Date.now() + Config.followerCallbackExpiration * 1000; //TODO


        // save callback information
        this.callbackURL = follower.trackingOrigins.get(item.origin);
        this.callbackKey = follower.callbackKeys.get(this.callbackURL);
    }

    addNodeToSended(addedNodeNumber) {
        this.nodesSendCallback.add(addedNodeNumber);
    }

    async checkForComplete() {
        // if some nodes (rate defined in config) also sended callback and received packed item (without answer)
        // callback is deemed complete
        if (this.nodesSendCallback.size >= Math.floor(this.callbackService.network.allNodes().length * this.callbackService.config.ratioNodesSendFollowerCallbackToComplete))
        await this.complete();
    }

    async checkCallbackSignature(signature) {
        try {
            return await this.callbackKey.verify(this.itemId.digest, signature, crypto.SHA512);
        } catch (err) {
            return false;
        }
    }

    async obtainNotification(notification) {
        this.callbackService.node.report("Notify callback " + notification.id.base64 + " type " + notification.type.val +
            " from node " + notification.from.val, VerboseLevel.DETAILED);

        if (notification.type === CallbackNotificationType.COMPLETED) {
            if (await this.checkCallbackSignature(notification.signature))
                await this.complete();
        } else if (notification.type === CallbackNotificationType.NOT_RESPONDING) {
            this.addNodeToSended(notification.from.number);
            await this.checkForComplete();
        }
    }

    async complete() {
        await this.callbackService.node.lock.synchronize(this.callbackService, async () => {
            // full environment
            let fullEnvironment = await node.getFullEnvironment(environmentId);

            this.callbackService.callbackProcessors.delete(this.id);

            this.callbackService.node.report("CallbackProcessor.complete: Removed callback " + this.id.base64, VerboseLevel.DETAILED);

            let event = new events.CompletedEvent();
            event.getEnvironment = () => fullEnvironment.environment;
            fullEnvironment.follower.onContractSubscriptionEvent(event);

            await fullEnvironment.environment.save();
        });

        // save new callback state in DB record
        await this.callbackService.ledger.updateFollowerCallbackState(this.id, FollowerCallbackState.COMPLETED);

        this.callbackService.node.report("Completed callback " + this.id.base64, VerboseLevel.BASE);

        stop();
    }

    async fail() {
        await this.callbackService.node.lock.synchronize(this.callbackService, async () => {
            // full environment
            let fullEnvironment = node.getFullEnvironment(environmentId);

            this.callbackService.callbackProcessors.delete(this.id);

            this.callbackService.node.report("CallbackProcessor.fail: Removed callback " + this.id.base64, VerboseLevel.DETAILED);

            let event = new events.FailedEvent();
            event.getEnvironment = () => fullEnvironment.environment;
            fullEnvironment.follower.onContractSubscriptionEvent(event);

            await fullEnvironment.environment.save();
        });

        // save new callback state in DB record
        await this.callbackService.ledger.updateFollowerCallbackState(this.id, FollowerCallbackState.EXPIRED);

        this.callbackService.node.report("Failed callback " + this.id.base64, VerboseLevel.BASE);

        this.stop();
    }

    stop() {
        if (this.executor != null) {
            this.executor.cancel();
            this.executor = null;
        }
    }

    async call() {
        if (this.expiresAt != null && this.expiresAt.getTime() < Date.now())
            await this.fail();     // callback failed (expired)
        else {
            if (this.isItemSended) {       // callback has already been called and received packed item
                // send notification to other nodes
                this.callbackService.network.broadcast(this.callbackService.myInfo,
                    new CallbackNotification(this.callbackService.myInfo, this.id,
                    CallbackNotificationType.NOT_RESPONDING, null));

                this.addNodeToSended(this.callbackService.myInfo.number);
                await this.checkForComplete();
            } else {     // callback not previously called
                // request HTTP follower callback
                let signature = null;
                try {
                    if (this.state === ItemState.APPROVED)
                        signature = this.callbackService.requestFollowerCallback(this, this.callbackURL, this.packedItem);
                    else if (this.state === ItemState.REVOKED)
                        signature = this.callbackService.requestFollowerCallback(this, this.callbackURL, this.itemId.digest);
                } catch (err) {
                    node.logger.log(err.stack);
                    node.logger.log("error call: request HTTP follower callback: " + err.message);
                }

                if ((signature != null) && this.checkCallbackSignature(signature)) {
                    this.callbackService.network.broadcast(this.callbackService.myInfo,
                        new CallbackNotification(this.callbackService.myInfo, this.id,
                        CallbackNotificationType.COMPLETED, signature));
                    await this.complete();
                }
            }
        }
    }
}

module.exports = {NCallbackService};