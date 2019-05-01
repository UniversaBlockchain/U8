const CallbackService = require("services/callbackService").CallbackService;
const ex = require("exceptions");

/**
 * Implements {@see CallbackService} interface for Universa node.
 */
class NCallbackService extends CallbackService {

    static FollowerCallbackState = {
        UNDEFINED : {val:"UNDEFINED", ordinal:0},
        STARTED : {val:"STARTED", ordinal:1},
        EXPIRED : {val:"EXPIRED", ordinal:2},    // not commited failed
        COMPLETED : {val:"COMPLETED", ordinal:3},
        FAILED : {val:"FAILED", ordinal:4}
    };

    /**
     * Initialize callback service on node and start synchronization thread.
     *
     * @param {Node} node is Universa node
     * @param {Config} config is node configuration
     * @param {NodeInfo} myInfo is node information
     * @param {Ledger} ledger is DB ledger
     * @param {Network} network is Universa network
     * @param {PrivateKey} nodeKey is public key of node
     * @param {ScheduledExecutorService} executorService is executor service from node to run synchronization
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
        this.callbackProcessors = new Map();
        this.deferredCallbackNotifications = new Map();
        this.callbacksToSynchronize = new Map();

        // start synchronization
        //executorService.scheduleWithFixedDelay(() => this.synchronizeFollowerCallbacks(), 60, config.followerCallbackSynchronizationInterval);
    }
}

module.exports = {NCallbackService};