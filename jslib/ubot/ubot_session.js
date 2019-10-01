/*
 * Copyright (c) 2019-present Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

const t = require("tools");

const UBotSessionState = {
    VOTING_REQUEST_ID       : {val: "VOTING_REQUEST_ID", ordinal: 0},
    COLLECTING_RANDOMS      : {val: "COLLECTING_RANDOMS", ordinal: 1},
    VOTING_SESSION_ID       : {val: "VOTING_SESSION_ID", ordinal: 2},
    OPERATIONAL             : {val: "OPERATIONAL", ordinal: 3},
    CLOSING                 : {val: "CLOSING", ordinal: 4},
    CLOSED                  : {val: "CLOSED", ordinal: 5}
};

t.addValAndOrdinalMaps(UBotSessionState);

class UBotSession {
    constructor(session, client, executableContractId, ubot = undefined) {
        this.client = client;
        this.state = UBotSessionState.byVal.get(session.state);
        this.pool = session.sessionPool;
        this.requestId = session.requestId;
        this.sessionId = session.sessionId;
        this.closeVotes = session.closeVotes;
        this.executableContractId = executableContractId;
        this.ubot = ubot;
    }

    async updateStorage(hash, multi) {
        if (this.ubot != null)
            this.ubot.logger.log("UBotProcess_writeMultiStorage... UBotSession.updateStorage hash = " + hash);

        let storageName = multi ? "default_multi" : "default_single";
        let fromValue = null;

        if (this.ubot != null) {
            let storages = this.ubot.sessionStorageCache.get(this.executableContractId);
            if (storages != null)
                fromValue = storages[storageName];
        }

        await this.client.askSessionOnAllNodes("ubotUpdateStorage", {
            executableContractId: this.executableContractId,
            storageName: storageName,
            fromValue: fromValue,
            toValue: hash
        });

        if (this.ubot != null) {
            let storages = this.ubot.sessionStorageCache.get(this.executableContractId);
            if (storages == null)
                storages = {};

            storages[storageName] = hash;
            this.ubot.sessionStorageCache.put(this.executableContractId, storages);
        }
    }

    async getStorage(multi) {
        if (this.ubot != null)
            this.ubot.logger.log("UBotSession.getStorage");

        let storageName = multi ? "default_multi" : "default_single";
        let result = null;
        let first = true;

        do {
            if (!first)
                await sleep(100);
            else
                first = false;

            result = await this.client.askSession("ubotGetStorage", {
                executableContractId: this.executableContractId,
                storageNames: [storageName]
            });

            if (result == null || result.current == null || result.pending == null)
                throw new Error("ubotGetStorage wrong result");

        } while (result.pending[storageName] != null && Object.keys(result.pending[storageName]).length > 0);

        return result.current[storageName];
    }

    async close() {
        if (this.ubot != null)
            this.ubot.logger.log("UBotSession.close");

        await this.client.askSessionOnAllNodes("ubotCloseSession", {
            executableContractId: this.executableContractId
        });
    }

    toString() {
        return "{sessionId: " + this.sessionId +
            ", requestId: " + this.requestId +
            ", executableContractId: " + this.executableContractId +
            ", closeVotes: " + JSON.stringify(this.closeVotes) +
            ", pool: " + JSON.stringify(this.pool) +
            ", state: " + this.state.val + "}";
    }
}

module.exports = {UBotSession, UBotSessionState};