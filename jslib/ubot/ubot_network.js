/*
 * Copyright (c) 2019-present Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

import {UDPAdapter, HttpClient} from "web";
import {VerboseLevel} from "node_consts";
import {Notification} from "notification";
import {AsyncEvent} from "executorservice";

const Boss = require("boss.js");
const BossStreams = require('boss_streams.js');
const UBotConfig = require("ubot/ubot_config").UBotConfig;

const PACKET_TYPE_NOTIFICATION = 1;
const PACKET_TYPE_PING = 2;


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
        this.httpClient = new HttpClient(this.myInfo.serverUrlString());

        this.pingWaiters = {};
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

    subscribe(notificationConsumer) {
        this.consumer = notificationConsumer;
    }



    unpack(packet) {
        let notifications = [];

        try {
            // packet type code
            let r = new BossStreams.Reader(packet);
            let packetType = r.read();
            if (packetType !== PACKET_TYPE_NOTIFICATION && packetType !== PACKET_TYPE_PING)
                throw new Error("invalid packed notification type code");

            // from node number
            let number = r.read();
            let from = this.netConfig.getInfo(number);
            if (from == null)
                throw new Error(this.myInfo.number + ": unknown node number: " + number);


            if(packetType === PACKET_TYPE_NOTIFICATION) {
                // number of notifications in the packet
                let count = r.read();
                if (count < 0 || count > 1000)
                    throw new Error("invalid packed notifications count: " + count);

                for (let i = 0; i < count; i++)
                    notifications.push(Notification.read(from, r));

                return notifications;
            } else if(packetType === PACKET_TYPE_PING) {
                let id = r.read();

                if(this.pingWaiters.hasOwnProperty(id)) {
                    this.pingWaiters[id].fire();
                    this.pingWaiters.delete(id)
                } else {
                    let w = new BossStreams.Writer();
                    w.write(PACKET_TYPE_PING);                         // packet type code
                    w.write(this.myInfo.number);               // from number
                    w.write(id);

                    if (this.adapter != null)
                        this.adapter.send(from.number, w.get());
                    else
                        this.report("UDPAdapter is null", VerboseLevel.DETAILED);
                }
                return notifications;
            }

        } catch (err) {
            this.report("failed to unpack notification: " + err.message, VerboseLevel.BASE);
            throw new Error("failed to unpack notifications" + err.message);
        }
    }

    packNotifications(from, notifications) {
        let w = new BossStreams.Writer();
        try {
            w.write(PACKET_TYPE_NOTIFICATION);                         // packet type code
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

    logNotification(notification, to, from) {
        this.report("Notification " + from.number + " -> " + to.number + ": " + notification.toString(), VerboseLevel.BASE);
    }

    deliver(toUbot, notification) {
        try {
            let data = this.packNotifications(this.myInfo, [notification]);
            this.logNotification(notification, toUbot, this.myInfo);

            if (this.adapter != null)
                this.adapter.send(toUbot.number, data);
            else
                this.report("UDPAdapter is null", VerboseLevel.DETAILED);

        } catch (err) {
            this.report("deliver exception: " + err.message, VerboseLevel.DETAILED);
        }
    }

    async pingUbot(toNumber,timeoutMills = 1000) {
        let id = Math.random().toFixed(6);
        let w = new BossStreams.Writer();
        w.write(PACKET_TYPE_PING);
        w.write(this.myInfo.number);
        w.write(id);

        if (this.adapter != null) {
            let ae = new AsyncEvent();
            this.pingWaiters[id] = ae;
            let start = Date.now();
            this.adapter.send(toNumber, w.get());
            ae.await(timeoutMills);
            let end = Date.now();
            if(ae.fired) {
                return end-start;
            } else {
                return -1;
            }
        } else
            this.report("UDPAdapter is null", VerboseLevel.DETAILED);
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

    getStorageResult(ubot, hash, pathBase, onComplete, onError) {
        this.sendGetRequestToUbot(
            ubot,
            pathBase + hash.base64,
            async (respCode, body) => {
                if (respCode === 200)
                    onComplete(body);
                else
                    onError(respCode);
            }
        );
    }

    getSingleStorageResult(ubot, hash, onComplete, onError) {
        this.getStorageResult(ubot, hash, "/getSingleStorageResult/", onComplete, onError);
    }

    getMultiStorageResult(ubot, hash, onComplete, onError) {
        this.getStorageResult(ubot, hash, "/getMultiStorageResult/", onComplete, onError);
    }

    async downloadActualStorageResult(ubot, recordId, actualHash, multi) {
        let downloadEvent = new AsyncEvent();
        let basePath = multi ? "/downloadActualMultiStorageResult/" : "/downloadActualSingleStorageResult/";

        this.sendGetRequestToUbot(
            ubot,
            basePath + recordId.base64 + "_" + actualHash.base64,
            async (respCode, body) => {
                if (respCode === 200)
                    downloadEvent.fire(body);
                else
                    downloadEvent.fire(null);
            }
        );

        return await downloadEvent.await(UBotConfig.maxDownloadActualStorageResultTime);
    }

    async searchActualStorageResult(recordId, actualHash, multi) {
        let list = this.netConfig.toList();

        while (list.length > 0) {
            let checkIndex = Math.floor(Math.random() * list.length);
            let checkUbot = list[checkIndex];
            list.splice(checkIndex, 1);

            if (checkUbot.number === this.myInfo.number)
                continue;

            let result = await this.downloadActualStorageResult(checkUbot, recordId, actualHash, multi);
            if (result != null) {
                // check result hash
                if (multi) {
                    result = await Boss.load(result);

                    let concat = new Uint8Array(result.length * 96);
                    result.forEach((item, i) => concat.set(crypto.HashId.of(item.result).digest, i * 96));
                    let resultHash = crypto.HashId.of(concat);

                    if (actualHash.equals(resultHash))
                        return result;      //return array with packed results and ubot numbers for multi

                } else if (actualHash.equals(crypto.HashId.of(result)))
                    return result;          //return packed result for single
            }
        }

        return null;
    }
}

module.exports = {UBotNetwork};
