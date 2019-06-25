import {VerboseLevel} from "node_consts";
import {CallbackNotification, CallbackNotificationType} from "notification";

const ItemState = require('itemstate').ItemState;
const CallbackService = require("services/callbackService").CallbackService;
const ex = require("exceptions");
const Config = require("config").Config;
const FollowerCallbackState = require("services/followerCallbackState").FollowerCallbackState;

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

        // start synchronization
        //executorService.scheduleWithFixedDelay(() => this.synchronizeFollowerCallbacks(), 60, config.followerCallbackSynchronizationInterval);
    }

    /**
     * Starts state synchronization for expired callbacks (past expiration time and state is STARTED or EXPIRED) for environment.
     * The follower contract that launched it is notified of the synchronized state of the callback.
     *
     * @param {number} environmentId - Callback processor.
     */
    synchronizeFollowerCallbacks(environmentId) {
        let nodesCount = this.network.getNodesCount();
        if (nodesCount < 2)
            return;

        let callbackRecords = this.ledger.getFollowerCallbacksToResyncByEnvId(environmentId);
        if (callbackRecords.isEmpty()) //TODO
            return;

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

    endSynchronizeFollowerCallbacks() {
        for (let record of this.callbacksToSynchronize.values()) {
            if (record.endSynchronize(ledger, node))
                this.callbacksToSynchronize.delete(record.id);
        }
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
    startCallbackProcessor(updatingItem, state, contract, me) {
        // initialize callback processor
        let callback = new CallbackProcessor(updatingItem, state, contract, me.id, this);

        // add callback record to DB
        CallbackRecord.addCallbackRecordToLedger(callback.id, me.id, this.config, this.network.getNodesCount(), this.ledger);

        // run callback processor
        let startDelay = callback.delay;
        let repeatDelay = this.config.followerCallbackDelay * 1000 * (this.network.getNodesCount() + 2); //TODO

        //callback.setExecutor(executorService.scheduleWithFixedDelay(() => callback.call(), startDelay, repeatDelay, TimeUnit.MILLISECONDS));

        //synchronized (callbackProcessors) {
            this.callbackProcessors.set(callback.id, callback);

            node.report("notifyFollowerSubscribers: put callback " + callback.id.base64, VerboseLevel.DETAILED);

            let deferredNotification = this.deferredCallbackNotifications.get(callback.id);
            if (deferredNotification != null) {
                // do deferred notification
                callback.obtainNotification(deferredNotification);

                this.deferredCallbackNotifications.delete(callback.id);

                node.report("notifyFollowerSubscribers: remove deferred notification for callback " + callback.id.base64,
                    VerboseLevel.DETAILED);
            }
        //}
    }

    /**
     * Request distant callback URL. Send new revision of following contract and signature (by node key).
     * Receive answer and return it if HTTP response code equals 200.
     *
     * @param {CallbackProcessor} callback - Callback processor.
     * @param {String} callbackURL - Callback URL.
     * @param packedData is packed new revision of following contract or identifier of revoking following contract
     *
     * @return callback receipt (signed with callback key identifier of following contract) or null (if connection error)
     *
     */
     /*requestFollowerCallback(callback, callbackURL, packedData) {
        //synchronized (this) {
            let charset = "UTF-8";

            let call;

            if (callback.state === ItemState.APPROVED)
                call = Binder.fromKeysValues(
                    "event", "new",
                    "data", packedData,
                    "signature", nodeKey.sign(packedData, HashType.SHA512),
                    "key", nodeKey.getPublicKey().pack()
                );
            else if (callback.state === ItemState.REVOKED)
                call = Binder.fromKeysValues(
                    "event", "revoke",
                    "id", packedData,
                    "signature", nodeKey.sign(packedData, HashType.SHA512),
                    "key", nodeKey.getPublicKey().pack()
                );
            else
                return null;

            byte[] data = Boss.pack(call);

            final String CRLF = "\r\n"; // Line separator required by multipart/form-data.
            String boundary = "==boundary==" + Ut.randomString(48);

            URLConnection connection = new URL(callbackURL).openConnection();

            connection.setDoOutput(true);
            connection.setConnectTimeout(2000);
            connection.setReadTimeout(5000);
            connection.setRequestProperty("Content-Type", "multipart/form-data; boundary=" + boundary);
            connection.setRequestProperty("User-Agent", "Universa Node");

            try (
                OutputStream output = connection.getOutputStream();
            PrintWriter writer = new PrintWriter(new OutputStreamWriter(output, charset), true);
        ) {
                // Send binary file.
                writer.append("--" + boundary).append(CRLF);
                writer.append("Content-Disposition: form-data; name=\"callbackData\"; filename=\"callbackData.boss\"").append(CRLF);
                writer.append("Content-Type: application/octet-stream").append(CRLF);
                writer.append("Content-Transfer-Encoding: binary").append(CRLF);
                writer.append(CRLF).flush();
                output.write(data);
                output.flush(); // Important before continuing with writer!
                writer.append(CRLF).flush(); // CRLF is important! It indicates end of boundary.

                // End of multipart/form-data.
                writer.append("--" + boundary + "--").append(CRLF).flush();
            }

            callback.setItemSended();

            HttpURLConnection httpConnection = (HttpURLConnection) connection;
            byte[] answer = null;

            if (httpConnection.getResponseCode() == 200)
                answer = Do.read(httpConnection.getInputStream());

            httpConnection.disconnect();

            // get receipt from answer
            if (answer == null)
                return null;

            Binder res = Boss.unpack(answer);
            if (!res.containsKey("receipt"))
                return null;

            return res.getBinary("receipt");
        //}
    }*/

    obtainCallbackNotification(notification) {
        let callback;

        node.report("obtainCallbackNotification: callback " +  notification.id.base64 + " type " + notification.type.val,
            VerboseLevel.DETAILED);

        if (notification.type === CallbackNotificationType.GET_STATE) {
            this.network.deliver(notification.from, new CallbackNotification(this.myInfo, notification.id,
                CallbackNotificationType.RETURN_STATE, null,
                this.ledger.getFollowerCallbackStateById(notification.id)));

        } else if (notification.type === CallbackNotificationType.RETURN_STATE) {
            //synchronized (callbackProcessors) {
                let record = this.callbacksToSynchronize.get(notification.id);

                if ((record != null) && record.synchronizeState(notification.state, this.ledger, this.node)) {
                    this.callbacksToSynchronize.delete(notification.id);

                    node.report("obtainCallbackNotification: callback " + notification.id.base64 +
                        " synchronized with state " + notification.state.val, VerboseLevel.DETAILED);
                }
            //}
        } else {
            //synchronized (callbackProcessors) {
                callback = this.callbackProcessors.get(notification.id);
                if (callback == null) {
                    node.report("obtainCallbackNotification not found callback " + notification.id.base64,
                        VerboseLevel.BASE,);

                    this.deferredCallbackNotifications.set(notification.id, notification);
                    return;
                }
            }

            callback.obtainNotification(notification);
        //}
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

        this.nodesSendCallback = new t.GenericSet();

        // calculate callback hash
        /*let digest = this.itemId.digest;
        let URL = this.callbackURL.getBytes(StandardCharsets.UTF_8);
        let concat = new byte[digest.length + URL.length + 1];
        concat[0] = state.ordinal();
        System.arraycopy(digest, 0, concat, 1, digest.length);
        System.arraycopy(URL, 0, concat, digest.length + 1, URL.length);
        this.id = HashId.of(concat);*/

        // calculate expiration time
        this.expiresAt = Date.now() + Config.followerCallbackExpiration * 1000; //TODO


        // save callback information
        this.callbackURL = follower.trackingOrigins.get(item.origin);
        this.callbackKey = follower.callbackKeys.get(this.callbackURL);
    }

    addNodeToSended(addedNodeNumber) {
        this.nodesSendCallback.add(addedNodeNumber);
    }

    checkForComplete() {
        // if some nodes (rate defined in config) also sended callback and received packed item (without answer)
        // callback is deemed complete
        //if (this.nodesSendCallback.size() >= (int) Math.floor(network.allNodes().size() * config.getRateNodesSendFollowerCallbackToComplete())) //TODO Deprecated
        this.complete();
    }

    checkCallbackSignature(signature) {
        try {
            return this.callbackKey.verify(this.itemId.digest, signature, crypto.SHA512);
        } catch (err) {
            return false;
        }
    }

    obtainNotification(notification) {
        node.report("Notify callback " + notification.id.base64 + " type " + notification.type.val,
            " from node " + notification.from.val, VerboseLevel.DETAILED);

        if (notification.type === CallbackNotificationType.COMPLETED) {
            if (this.checkCallbackSignature(notification.signature))
                this.complete();
        } else if (notification.type === CallbackNotificationType.NOT_RESPONDING) {
            this.addNodeToSended(notification.from.number);
            this.checkForComplete();
        }
    }

    complete() {
        //synchronized (callbackService) {
            // full environment
            let fullEnvironment = node.getFullEnvironment(environmentId);
            let follower =  fullEnvironment.get("follower");
            let environment = fullEnvironment.get("environment");

            callbackProcessors.delete(this.id);

            node.report("CallbackProcessor.complete: Removed callback " + this.id.base64, VerboseLevel.DETAILED);

           /* follower.onContractSubscriptionEvent(new ContractSubscription.CompletedEvent() {

                public MutableEnvironment getEnvironment() {
                    return environment;
                }
            });*/

            environment.save();
        //}

        // save new callback state in DB record
        ledger.updateFollowerCallbackState(this.id, FollowerCallbackState.COMPLETED);

        node.report("Completed callback " + this.id.base64, VerboseLevel.BASE);

        stop();
    }

    fail() {
        //synchronized (callbackService) {
            // full environment
            let fullEnvironment = node.getFullEnvironment(environmentId);
            let follower = fullEnvironment.get("follower");
            let environment = fullEnvironment.get("environment");

            callbackProcessors.delete(this.id);

            node.report("CallbackProcessor.fail: Removed callback " + this.id.base64, VerboseLevel.DETAILED);

            /*follower.onContractSubscriptionEvent(new ContractSubscription.FailedEvent() {

            @Override
                public MutableEnvironment getEnvironment() {
                    return environment;
                }
            });*/

            environment.save();
        //}

        // save new callback state in DB record
        ledger.updateFollowerCallbackState(this.id, FollowerCallbackState.EXPIRED);

        node.report("Failed callback " + this.id.base64, VerboseLevel.BASE);

        this.stop();
    }

    stop() {
        if (executor != null)
            executor.cancel(true);
    }

    call() {
        if (this.expiresAt != null && this.expiresAt.getTime() < Date.now())
            this.fail();     // callback failed (expired)
        else {
            if (this.isItemSended) {       // callback has already been called and received packed item
                // send notification to other nodes
                network.broadcast(myInfo, new CallbackNotification(myInfo, this.id,
                    CallbackNotificationType.NOT_RESPONDING, null));

                this.addNodeToSended(myInfo.number);
                this.checkForComplete();
            } else {     // callback not previously called
                // request HTTP follower callback
                let signature = null;
                try {
                    if (this.state === ItemState.APPROVED)
                        signature = requestFollowerCallback(this, this.callbackURL, this.packedItem);
                    else if (this.state === ItemState.REVOKED)
                        signature = requestFollowerCallback(this, this.callbackURL, this.itemId.digest);
                } catch (err) {
                    node.logger.log(err.stack);
                    node.logger.log("error call: request HTTP follower callback: " + err.message);
                }

                if ((signature != null) && this.checkCallbackSignature(signature)) {
                    network.broadcast(myInfo, new CallbackNotification(myInfo, this.id,
                        CallbackNotificationType.COMPLETED, signature));
                    this.complete();
                }
            }
        }
    }
}

module.exports = {NCallbackService};