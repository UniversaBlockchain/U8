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
const BossBiMapper = require("bossbimapper").BossBiMapper;

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
        let w = new BossStreams.Writer();
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

    //return packed result for single
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
                    result = await BossBiMapper.getInstance().deserialize(await Boss.load(result));

                    let results = [];
                    let ubots = [];
                    let concat = new Uint8Array(Object.keys(result).length * 96);

                    Object.keys(result).forEach((ubot, i) => {
                        results.push(result[ubot]);
                        ubots.push(Number(ubot));
                        concat.set(crypto.HashId.of(result[ubot]).digest, i * 96);
                    });

                    let resultHash = crypto.HashId.of(concat);

                    if (actualHash.equals(resultHash))
                        return {
                            records: results,
                            ubots: ubots
                        };

                } else if (actualHash.equals(crypto.HashId.of(result)))
                    return result;
            }
        }

        return null;
    }
}

module.exports = {UBotNetwork};
