import {UDPAdapter, HttpClient} from "web";
import {VerboseLevel} from "node_consts";
import {Notification} from "notification";

const Boss = require("boss.js");

class UBotNetwork {

    constructor(netConfig, myInfo, myKey, logger) {
        this.netConfig = netConfig;
        this.myInfo = myInfo;
        this.myKey = myKey;
        this.logger = logger;

        this.verboseLevel = VerboseLevel.NOTHING;
        this.label = "UBot" + this.myInfo.number + ": ";

        this.adapter = new UDPAdapter(this.myKey, this.myInfo.number, this.netConfig);
        this.adapter.setReceiveCallback((packet, fromNode) => this.onReceived(packet, fromNode));

        // this.httpClient is used for connection to all other ubots, so it's does not matter which rootUrl we use
        this.httpClient = new HttpClient(this.myInfo.serverUrlString(), 20, 20);
    }

    async shutdown() {
        //this.report("UBotNetwork.shutdown()...", VerboseLevel.BASE);
        if (this.adapter != null) {
            this.adapter.close();
            this.adapter = null;
        }
        if (this.httpClient != null) {
            await this.httpClient.stop();
            this.httpClient = null;
        }
    }

    onReceived(packet, fromNode) {
        try {
            if (this.consumer != null) {
                let notifications = this.unpack(packet);
                notifications.forEach(notification => {
                    if (notification == null) {
                        this.report("bad notification skipped", VerboseLevel.BASE);
                    } else {
                        //this.logNotification(notification, this.myInfo, fromNode);
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

    subscribe(notificationConsumer) {
        this.consumer = notificationConsumer;
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
            let from = this.netConfig.getInfo(number);
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

    deliver(toUbot, notification) {
        try {
            let data = this.packNotifications(this.myInfo, [notification]);
            //this.logNotification(notification, toUbot, this.myInfo);

            if (this.adapter != null)
                this.adapter.send(toUbot.number, data);
            else
                this.report("UDPAdapter is null", VerboseLevel.DETAILED);

        } catch (err) {
            this.report("deliver exception: " + err.message, VerboseLevel.DETAILED);
        }
    }

    broadcast(exceptNode, notification) {
        this.netConfig.toList().forEach(node => {
            if (exceptNode == null || !exceptNode.equals(node))
                this.deliver(node, notification);
        });
    }

    sendGetRequestToUbot(toUbot, path, onComplete) {
        this.httpClient.sendGetRequestUrl(toUbot.serverUrlString()+path, async (respCode, body) => {
            onComplete(respCode, body);
        });
    }

}

module.exports = {UBotNetwork};
