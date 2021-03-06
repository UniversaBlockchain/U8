/*
 * Copyright (c) 2019-present Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

const ItemState = require('itemstate').ItemState;
const t = require("tools");

class NodeStats {

    constructor() {}

    async init(ledger, config) {
        this.ledgerStatsHistory = [];
        this.ledgerHistoryTimestamps = [];

        this.smallIntervalApproved = 0;
        this.bigIntervalApproved = 0;
        this.uptimeApproved = 0;

        this.bigInterval = config.statsIntervalBig;
        this.smallInterval = config.statsIntervalSmall;
        this.nodeStartTime = Math.floor(Date.now() / 1000);
        this.lastStatsBuildTime = this.nodeStartTime;
        this.ledgerSize = await ledger.getLedgerSize();
    }

    async collect(ledger, config) {
        if (config.statsIntervalSmall !== this.smallInterval || config.statsIntervalBig !== this.bigInterval) {
            //intervals changed. need to reset node
            await this.init(ledger, config);
            return false;
        }

        let now = Math.floor(Date.now() / 1000);
        let lastIntervalStats = ledger.getLedgerSize(this.lastStatsBuildTime);
        this.ledgerStatsHistory.push(lastIntervalStats);
        this.ledgerHistoryTimestamps.push(this.lastStatsBuildTime);

        this.smallIntervalApproved = t.getOrDefault(lastIntervalStats, ItemState.APPROVED.ordinal,0) +
            t.getOrDefault(lastIntervalStats, ItemState.REVOKED.ordinal,0);
        this.bigIntervalApproved += this.smallIntervalApproved;
        this.uptimeApproved += this.smallIntervalApproved;

        Object.keys(lastIntervalStats).forEach(is =>
            this.ledgerSize[is] = t.getOrDefault(this.ledgerSize, is,0) + lastIntervalStats[is]);

        while (this.ledgerHistoryTimestamps[0] + this.bigInterval < now) {
            this.ledgerHistoryTimestamps.shift();
            this.bigIntervalApproved -= this.ledgerStatsHistory.shift()[ItemState.APPROVED.ordinal] +
                t.getOrDefault(lastIntervalStats, ItemState.REVOKED.ordinal,0);
        }

        this.lastStatsBuildTime = now;

        return true;
    }

    static async getPaymentStats(ledger, daysNum) {
        let result = [];
        let from = new Date();
        from.setDate(from.getDate() - daysNum);

        let payments = await ledger.getPayments(from);

        for (let [day, pays] of payments) {
            let date = new Date(day * 1000);
            let days = date.getDate();
            let month = date.getMonth();
            let formatted = (days < 10 ? "0": "") + days + "/" + (month + 1 < 10 ? "0": "") + (month + 1) + "/" + date.getFullYear();
            result.push({
                date: formatted,
                units: pays
            });
        }
        return result;
    }
}

module.exports = {NodeStats};