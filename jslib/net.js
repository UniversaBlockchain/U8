import {VerboseLevel} from "node_consts";
import {UDPAdapter, HttpClient} from 'web'
import {Notification, ItemNotification, ResyncNotification, ParcelNotification} from "notification";
import {ExecutorService, AsyncEvent} from "executorservice";

const Boss = require('boss.js');
const ItemResult = require('itemresult').ItemResult;
const Lock = require("lock").Lock;

class Network {
    /**
     * Initialize the network of nodes with the specified {@link NetConfig}.
     *
     * @param {network.NetConfig} netConfig - Network configuration.
     * @constructor
     */
    constructor(netConfig) {
        this.netConfig = netConfig;
    }

    /**
     * Put the notification to the delivery queue. Must not block the calling thread.
     *
     * @param {network.NodeInfo} toNode - {@link NodeInfo} of node for sending.
     * @param {Notification} notification - Sending {@link Notification}.
     */
    deliver(toNode, notification) {
        throw new Error("not implemented");
    }

    /**
     * Subscribe to incoming notifications. Old subscriber must be discarded. New subscriber should receive notifications
     * received from the moment it is registered. The method must not block.
     *
     * @param {network.NodeInfo} forNode - The node that receives the notification.
     * @param {function(network.NodeInfo)} notificationConsumer - The consumer that process incoming notifications in non-blocking manner, e.g.
     *                             it should return without waiting.
     */
    subscribe(forNode, notificationConsumer) {
        throw new Error("not implemented");
    }

    /**
     * Get the item from the specified node.
     * Block until the item will be available from a specified node, not exceeding the specified timeout.
     *
     * @param {crypto.HashId} itemId - ID of item do load.
     * @param {network.NodeInfo} node - Node where the item should be loaded from.
     * @param {number} maxTimeout - Maximum timeout in milliseconds.
     * @return {Contract} the downloaded item, null if the node can't provide it or network error has occurred.
     */
    getItem(itemId, node, maxTimeout) {
        throw new Error("not implemented");
    }

    /**
     * Get the environment from the specified node.
     * Block until the environment will be available from a specified node, not exceeding the specified timeout.
     *
     * @param {crypto.HashId} itemId - ID of environment do load.
     * @param {network.NodeInfo} node - Node where the environment should be loaded from.
     * @param {number} maxTimeout - Maximum timeout in milliseconds.
     * @return {NImmutableEnvironment} the downloaded environment, null if the node can't provide it or network error has occurred.
     */
    getEnvironment(itemId, node, maxTimeout) {
        throw new Error("not implemented");
    }

    /**
     * Get the parcel from the specified node.
     * Block until the parcel will be available from a specified node, not exceeding the specified timeout.
     *
     * @param {crypto.HashId} itemId - ID of parcel do load.
     * @param {network.NodeInfo} node - Node where the parcel should be loaded from.
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
     * @param {network.NodeInfo} nodeInfo - Node where the item state should be loaded from.
     * @param {crypto.HashId} id - ID of item.
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
     * @return {network.NodeInfo} node information.
     */
    getInfo(number) {
        return this.netConfig.getInfo(number);
    }

    /**
     * Deliver notification to all nodes except one.
     *
     * @param {network.NodeInfo} exceptNode - If not null, do not deliver to it.
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
     * @param {function(network.NodeInfo)} consumer - Function with {@link NodeInfo} parameter.
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
     * @return {Array<network.NodeInfo>} array of {@link NodeInfo}.
     */
    allNodes() {
        return this.netConfig.toList();
    }

    /**
     * Add {@link NodeInfo} to network configuration.
     *
     * @param {network.NodeInfo} nodeInfo - {@link NodeInfo} for add.
     */
    addNode(nodeInfo) {
        this.netConfig.addNode(nodeInfo);
    }
}

class NetworkV2 extends Network {

    /**
     * Initialize network of nodes.
     *
     * @param {network.NetConfig} netConfig - Network configuration.
     * @param {network.NodeInfo} myInfo - {@link NodeInfo} of current node.
     * @param {crypto.PrivateKey} myKey - Private key of current node.
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
        this.cachedClients = new t.GenericMap();
        this.lock = new Lock();
        this.executorService = new ExecutorService();

        this.adapter = new UDPAdapter(this.myKey, this.myInfo.number, this.netConfig);
        this.adapter.setReceiveCallback((packet, fromNode) => this.onReceived(packet, fromNode));
    }

    async shutdown() {
        if (this.adapter != null)
            this.adapter.close();

        if (this.httpClient != null)
            await this.httpClient.stop();

        for (let client of this.cachedClients.values())
            await client.stop();
    }

    /**
     * Callback to receive notifications.
     *
     * @param {Uint8Array} packet - Packed notifications.
     * @param {network.NodeInfo} fromNode - {@link NodeInfo} of distant node.
     */
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
        else if (notification instanceof ResyncNotification)
            this.report(from.number + "->" + to.number + " RN " + notification.itemState.val, VerboseLevel.DETAILED);
        else if (notification instanceof ItemNotification)
            this.report(from.number + "->" + to.number + " IN " + notification.itemId.toString(), VerboseLevel.DETAILED);
        else
            this.report("unknown notification", VerboseLevel.DETAILED);
    }

    unpack(packet) {
        let notifications = [];

        try {
            // packet type code
            let r = new Boss.Reader(packet);
            if (r.read() !== 1)
                throw new Error("invalid packed notification type code");

            // from node number
            let number = r.read();
            let from = this.getInfo(number);
            if (from == null)
                throw new Error(this.myInfo.number + ": unknown node number: " + number);

            // number of notifications in the packet
            let count = r.read();
            if (count < 0 || count > 1000)
                throw new Error("invalid packed notifications count: " + count);

            for (let i = 0; i < count; i++)
                notifications.push(Notification.read(from, r));

            return notifications;

        } catch (err) {
            this.report("failed to unpack notification: " + err.message, VerboseLevel.BASE);
            throw new Error("failed to unpack notifications" + err.message);
        }
    }

    packNotifications(from, notifications) {
        let w = new Boss.Writer();
        try {
            w.write(1);                         // packet type code
            w.write(from.number);               // from number
            w.write(notifications.length);      // count notifications

            notifications.forEach(n => {
                try {
                    Notification.write(w, n);
                } catch (err) {
                    throw new Error("notification pack failure" + err.message);
                }
            });

            return w.get();

        } catch (err) {
            throw new Error("notification pack failure" + err.message);
        }
    }

    /**
     * Deliver notification to network node.
     *
     * @param {network.NodeInfo} toNode - {@link NodeInfo} of destination node.
     * @param {Notification} notification - Delivered notification.
     */
    deliver(toNode, notification) {
        try {
            let data = this.packNotifications(this.myInfo, [notification]);
            this.logNotification(notification, toNode, this.myInfo);

            if (this.adapter != null)
                this.adapter.send(toNode.number, data);
            else
                this.report("UDPAdapter is null", VerboseLevel.DETAILED);

        } catch (err) {
            this.report("deliver exception: " + err.message, VerboseLevel.DETAILED);
        }
    }

    subscribe(info, notificationConsumer) {
        this.consumer = notificationConsumer;
    }

    /**
     * Get item from network node.
     *
     * @param {crypto.HashId} itemId - ID of the requested item.
     * @param {network.NodeInfo} nodeInfo - {@link NodeInfo} of distant node.
     * @param {number} maxTimeout - Connection timeout in milliseconds.
     * @return {Contract} requested item.
     */
    async getItem(itemId, nodeInfo, maxTimeout) {
        try {
            let URL = nodeInfo.serverUrlString() + "/contracts/" + itemId.base64;

            if (this.httpClient == null)
                this.httpClient = new HttpClient("", 4, 4096);

            let event = new AsyncEvent(this.executorService);

            //TODO: httpClient setRequestProperty/setTimeout
            //connection.setRequestProperty("User-Agent", "Universa JAVA API Client");
            //connection.setRequestProperty("Connection", "close");
            //connection.setConnectTimeout(4000);
            //connection.setReadTimeout(maxTimeout);
            this.httpClient.sendGetRequestUrl(URL, (respCode, body) => {
                let item = (respCode === 200) ? TransactionPack.unpack(body, true).contract : null;
                event.fire(item);
            });

            return await event.await(maxTimeout);

        } catch (err) {
            this.report("download failure. from: " + nodeInfo.number + " by: " + this.myInfo.number +
                " reason: " + err.message, VerboseLevel.BASE);
            return null;
        }
    }

    /**
     * Get environment from network node.
     *
     * @param {crypto.HashId} itemId - ID of the requested environment.
     * @param {network.NodeInfo} nodeInfo - {@link NodeInfo} of distant node.
     * @param {number} maxTimeout - Connection timeout in milliseconds.
     * @return {NImmutableEnvironment} requested environment.
     */
    async getEnvironment(itemId, nodeInfo, maxTimeout) {
        try {
            let URL = nodeInfo.serverUrlString() + "/environments/" + itemId.base64;

            if (this.httpClient == null)
                this.httpClient = new HttpClient("", 4, 4096);

            let event = new AsyncEvent(this.executorService);

            //TODO: httpClient setRequestProperty/setTimeout
            //connection.setRequestProperty("User-Agent", "Universa JAVA API Client");
            //connection.setRequestProperty("Connection", "close");
            //connection.setConnectTimeout(4000);
            //connection.setReadTimeout(maxTimeout);
            this.httpClient.sendGetRequestUrl(URL, (respCode, body) => {
                let env = (respCode === 200) ? Boss.load(body) : null;
                event.fire(env);
            });

            return await event.await(maxTimeout);

        } catch (err) {
            this.report("download failure. from: " + nodeInfo.number + " by: " + this.myInfo.number +
                " reason: " + err.message, VerboseLevel.BASE);
            return null;
        }
    }

    /**
     * Get parcel from network node.
     *
     * @param {crypto.HashId} itemId - ID of the requested parcel.
     * @param {network.NodeInfo} nodeInfo - {@link NodeInfo} of distant node.
     * @param {number} maxTimeout - Connection timeout in milliseconds.
     * @return {Parcel} requested parcel.
     */
    async getParcel(itemId, nodeInfo, maxTimeout) {
        try {
            let URL = nodeInfo.serverUrlString() + "/parcels/" + itemId.base64;

            if (this.httpClient == null)
                this.httpClient = new HttpClient("", 4, 4096);

            let event = new AsyncEvent(this.executorService);

            //TODO: httpClient setRequestProperty/setTimeout
            //connection.setRequestProperty("User-Agent", "Universa JAVA API Client");
            //connection.setRequestProperty("Connection", "close");
            //connection.setConnectTimeout(4000);
            //connection.setReadTimeout(maxTimeout);
            this.httpClient.sendGetRequestUrl(URL, (respCode, body) => {
                let parcel = (respCode === 200) ? Parcel.unpack(body) : null;
                event.fire(parcel);
            });

            return await event.await(maxTimeout);

        } catch (err) {
            this.report("download failure. from: " + nodeInfo.number + " by: " + this.myInfo.number +
                " reason: " + err.message, VerboseLevel.BASE);
            return null;
        }
    }

    /**
     * Get item state from network node.
     *
     * @param {network.NodeInfo} nodeInfo - {@link NodeInfo} of distant node.
     * @param {crypto.HashId} id - ID of the requested item.
     * @return {ItemResult} result containing state of the requested item.
     */
    async getItemState(nodeInfo, id) {
        let client;
        await this.lock.synchronize("cachedClients", async () => {
            client = this.cachedClients.get(nodeInfo);
            if (client == null) {
                client = new HttpClient(nodeInfo.publicUrlString(), 4, 256);
                await client.start(this.myKey, nodeInfo.publicKey, null);

                this.cachedClients.set(nodeInfo, client);
            }
        });

        //TODO: replace to Client
        //return client.getState(id);

        let fire = null;
        let event = new Promise((resolve) => {fire = resolve});

        client.command("getState", {itemId: id}, (result) => fire(result), () => fire(null));

        let result = await event;
        if (result == null || result.itemResult == null)
            this.report("getItemState failure. from: " + nodeInfo.number + " command error occurred", VerboseLevel.BASE);
        else if (result.itemResult instanceof ItemResult)
            return result.itemResult;
        else if (typeof result.itemResult === "string")
            this.report("getItemState failure. from: " + nodeInfo.number + " result: " + result.itemResult, VerboseLevel.BASE);
        else
            this.report("getItemState failure. from: " + nodeInfo.number + " unknown result type", VerboseLevel.BASE);

        return ItemResult.UNDEFINED;
    }

    restartUDPAdapter() {
        if (this.adapter != null)
            this.adapter.close();

        this.adapter = new UDPAdapter(this.myKey, this.myInfo.number, this.netConfig);
        this.adapter.setReceiveCallback(this.onReceived);
    }

    //TODO: pingNodeUDP
    //TODO: pingNodeTCP
}

module.exports = {Network, NetworkV2};