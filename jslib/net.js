import {VerboseLevel} from "node_consts";
import {Notification, ItemNotification, ResyncNotification, ParcelNotification} from "notification";

const UDPAdapter = require('web').UDPAdapter;

class Network {
    /**
     * Initialize network of nodes by specified {@link NetConfig}.
     *
     * @param {NetConfig} netConfig - Network configuration.
     * @constructor
     */
    constructor(netConfig) {
        this.netConfig = netConfig;
    }

    /**
     * Put the notification to the delivery queue. Must not block the calling thread.
     *
     * @param {NodeInfo} toNode - {@link NodeInfo} of node for sending.
     * @param {Notification} notification - Sending {@link Notification}.
     */
    deliver(toNode, notification) {
        throw new Error("not implemented");
    }

    /**
     * Subscribe ot incoming norifications. Old subscriber must be discarded. New consumer should receive notifications
     * received from the moment it is registered. The method must not block.
     *
     * @param {NodeInfo} forNode - Node to which receive notifications.
     * @param {function(NodeInfo)} notificationConsumer - The consumer that process incoming notifications in non-blocking manner, e.g.
     *                             it should return without waiting.
     */
    subscribe(forNode, notificationConsumer) {
        throw new Error("not implemented");
    }

    /**
     * Block until the item will be available from a specified node, not exceeding the specified timeout.
     *
     * @param {HashId} itemId - ID of item do load.
     * @param {NodeInfo} node - Node where the item should be loaded from.
     * @param {number} maxTimeout - Maximum timeout in milliseconds.
     * @return {Contract} the downloaded item, null if the node can't provide it or network error has occurred.
     */
    getItem(itemId, node, maxTimeout) {
        throw new Error("not implemented");
    }

    /**
     * Block until the environment will be available from a specified node, not exceeding the specified timeout.
     *
     * @param {HashId} itemId - ID of environment do load.
     * @param {NodeInfo} node - Node where the environment should be loaded from.
     * @param {number} maxTimeout - Maximum timeout in milliseconds.
     * @return {NImmutableEnvironment} the downloaded environment, null if the node can't provide it or network error has occurred.
     */
    getEnvironment(itemId, node, maxTimeout) {
        throw new Error("not implemented");
    }

    /**
     * Block until the parcel will be available from a specified node, not exceeding the specified timeout.
     *
     * @param {HashId} itemId - ID of parcel do load.
     * @param {NodeInfo} node - Node where the parcel should be loaded from.
     * @param {number} maxTimeout - Maximum timeout in milliseconds.
     * @return {Parcel} the downloaded parcel, null if the node can't provide it or network error has occurred.
     */
    getParcel(itemId, node, maxTimeout) {
        throw new Error("not implemented");
    }

    /**
     * Shutdown network UDP adapter.
     */
    shutdown() {
        throw new Error("not implemented");
    }

    /**
     * Get item state from a specified node.
     *
     * @param {NodeInfo} nodeInfo - Node where the item state should be loaded from.
     * @param {HashId} id - ID of item.
     * @return {ItemResult} the downloaded {@link ItemResult}.
     */
    getItemState(nodeInfo, id) {
        throw new Error("not implemented");
    }

    /**
     * Ping specified node by UDP.
     *
     * @param {number} nodeNumber - Number of node in network.
     * @param {number} timeoutMillis - Maximum timeout in milliseconds.
     * @return {number} ping time in milliseconds.
     */
    pingNodeUDP(nodeNumber, timeoutMillis) {
        throw new Error("not implemented");
    }

    /**
     * Ping specified node by TCP.
     *
     * @param {number} nodeNumber - Number of node in network.
     * @param {number} timeoutMillis - Maximum timeout in milliseconds.
     * @return {number} ping time in milliseconds.
     */
    pingNodeTCP(nodeNumber, timeoutMillis) {
        throw new Error("not implemented");
    }

    /**
     * Get {@link NodeInfo} of node by his network number.
     *
     * @param {number} number - Number of node in network.
     * @return {NodeInfo} node information.
     */
    getInfo(number) {
        return this.netConfig.getInfo(number);
    }

    /**
     * Deliver notification to all nodes except one.
     *
     * @param {NodeInfo} exceptNode - If not null, do not deliver to it.
     * @param {Notification} notification - Notification fo deliver.
     */
    broadcast(exceptNode, notification) {
        this.netConfig.toList().forEach(node => {
            if (exceptNode != null && !exceptNode.equals(node))
                this.deliver(node, notification);
        });
    }

    /**
     * Enumerate all nodes passing them to the consumer.
     *
     * @param {function(NodeInfo)} consumer - Function with {@link NodeInfo} parameter.
     */
    eachNode(consumer) {
        this.netConfig.toList().forEach(n => consumer(n));
    }

    /**
     * Get count of nodes in network.
     *
     * @return {number} nodes count.
     */
    getNodesCount() {
        return this.netConfig.size;
    }

    /**
     * Get {@link NodeInfo} from all network nodes.
     *
     * @return {Array<NodeInfo>} array of {@link NodeInfo}.
     */
    allNodes() {
        return this.netConfig.toList();
    }

    /**
     * Add {@link NodeInfo} to network configuration.
     *
     * @param {NodeInfo} nodeInfo - {@link NodeInfo} for add.
     */
    addNode(nodeInfo) {
        this.netConfig.addNode(nodeInfo);
    }
}

class NetworkV2 extends Network {

    /**
     * Initialize network of nodes.
     *
     * @param {NetConfig} netConfig - Network configuration.
     * @param {NodeInfo} myInfo - {@link NodeInfo} of current node.
     * @param {PrivateKey} myKey - Private key of current node.
     * @param {Logger} logger - Current node logger.
     * @constructor
     */
    constructor(netConfig, myInfo, myKey, logger) {
        super(netConfig);
        this.netConfig = netConfig;
        this.myInfo = myInfo;
        this.myKey = myKey;
        this.logger = logger;
        this.verboseLevel = VerboseLevel.NOTHING;
        this.label = "Network Node " + this.myInfo.number + ": ";
        this.consumer = null;

        this.adapter = new UDPAdapter(this.myKey, this.myInfo.number, this.netConfig);
        this.adapter.setReceiveCallback(this.onReceived);
    }

    shutdown() {
        if (this.adapter != null)
            this.adapter.close();
    }

    onReceived(packet, fromNode) {
        try {
            if (this.consumer != null) {
                let notifications = this.unpack(packet);
                notifications.forEach(notification => {
                    if (notification == null)
                        this.report("bad notification skipped", VerboseLevel.BASE);
                    else {
                        this.logNotification(notification, this.myInfo, fromNode);
                        this.consumer(notification);
                    }
                });
            }
        } catch (err) {
            this.report("ignoring notification, " + err.message, VerboseLevel.BASE);
        }
    }

    report(message, level) {
        if (level <= this.verboseLevel)
            this.logger.log(this.label + message);
    }

    logNotification(notification, to, from) {
        if (notification instanceof ParcelNotification && notification.parcelId != null)
            this.report(from.number + "->" + to.number + " PN " + notification.parcelId.toString() + " " +
                notification.type == null ? "NULL" : notification.type, VerboseLevel.DETAILED);
        else if (notification instanceof ItemNotification)
            this.report(from.number + "->" + to.number + " IN " + notification.itemId.toString(), VerboseLevel.DETAILED);
        else if (notification instanceof ResyncNotification)
            this.report(from.number + "->" + to.number + " RN " + notification.itemState.val, VerboseLevel.DETAILED);
        else
            this.report("unknown notification", VerboseLevel.DETAILED);
    }

    unpack(packet) {
        let notifications = [];

        try {
            // packet type code
            /*Boss.Reader r = new Boss.Reader(packedNotifications);
            if (r.readInt() != 1)
                throw new IOException("invalid packed notification type code");

            // from node number
            int number = r.readInt();
            NodeInfo from = getInfo(number);
            if (from == null)
                throw new IOException(myInfo.getNumber()+": unknown node number: " + number);

            // number of notifications in the packet
            int count = r.readInt();
            if (count < 0 || count > 1000)
                throw new IOException("unvalid packed notifications count: " + count);

            for (int i = 0; i < count; i++) {
                nn.add(Notification.read(from, r));
            }*/
            return notifications;

        } catch (err) {
            this.report("failed to unpack notification: " + err.message, VerboseLevel.BASE);
            throw new Error("failed to unpack notifications" + err.message);
        }
    }
}

module.exports = {Network, NetworkV2};