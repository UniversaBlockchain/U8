/*
 * Copyright (c) 2019-present Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

const t = require("tools");

const UBotSessionState = {
    VOTING_REQUEST_ID       : {val: "VOTING_REQUEST_ID", ordinal: 0},
    COLLECTING_RANDOMS      : {val: "COLLECTING_RANDOMS", ordinal: 1},
    VOTING_SESSION_ID       : {val: "VOTING_SESSION_ID", ordinal: 2},
    OPERATIONAL             : {val: "OPERATIONAL", ordinal: 3},
    ABORTED                 : {val: "ABORTED", ordinal: 4}
};

t.addValAndOrdinalMaps(UBotSessionState);

class UBotSession {
    constructor(session, client) {
        this.client = client;
        this.state = UBotSessionState.byVal.get(session.state);
        this.pool = session.sessionPool;
        this.requestId = session.requestId;
        this.sessionId = session.sessionId;
    }

    toString() {
        return "{sessionId: " + this.sessionId +
            ", requestId: " + this.requestId +
            ", pool: " + JSON.stringify(this.pool) +
            ", state: " + this.state.val + "}";
    }
}

module.exports = {UBotSession, UBotSessionState};