/*
 * Copyright (c) 2019-present Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

const Notification = require('notification').Notification;
const t = require("tools");

const CODE_UBOT_TEST_NOTIFICATION                   = 10;
const CODE_UBOT_CLOUD_NOTIFICATION                  = 11;
const CODE_UBOT_CLOUD_NOTIFICATION_ASM_CMD          = 12;

class UBotTestNotification extends Notification {
    constructor(from, textValue, requestResult) {
        super(from);
        this.textValue = textValue;
        this.requestResult = requestResult;
        this.typeCode = CODE_UBOT_TEST_NOTIFICATION;
    }

    writeTo(bw) {
        bw.write(this.textValue);
        bw.write(this.requestResult);
    }

    readFrom(br) {
        this.textValue = br.read();
        this.requestResult = br.read();
    }

    equals(o) {
        if(this === o)
            return true;

        if(Object.getPrototypeOf(this) !== Object.getPrototypeOf(o))
            return false;

        if (this.requestResult !== o.requestResult)
            return false;

        if (!t.valuesEqual(this.from, o.from))
            return false;

        if (!t.valuesEqual(this.textValue, o.textValue))
            return false;
    }

    toString() {
        return "[UBotTestNotification from node: " + this.from.number +
            ", textValue: " + this.textValue +
            ", requestResult: " + this.requestResult + "]";
    }
}

class UBotCloudNotification extends Notification {

    static types = {
        DOWNLOAD_STARTING_CONTRACT:   {ordinal: 0},
    };

    constructor(from, poolId, type, isAnswer) {
        super(from);
        this.poolId = poolId;
        this.type = type;
        this.isAnswer = isAnswer;
        this.typeCode = CODE_UBOT_CLOUD_NOTIFICATION;
    }

    writeTo(bw) {
        bw.write(this.poolId.digest);
        bw.write(this.type.ordinal);
        bw.write(this.isAnswer);
    }

    readFrom(br) {
        this.poolId = crypto.HashId.withDigest(br.read());
        this.type = UBotCloudNotification.types.byOrdinal.get(br.read());
        this.isAnswer = br.read();
    }

    equals(o) {
        if(this === o)
            return true;

        if(Object.getPrototypeOf(this) !== Object.getPrototypeOf(o))
            return false;

        if (this.type.poolId !== o.type.poolId)
            return false;

        if (this.type.ordinal !== o.type.ordinal)
            return false;

        if (this.isAnswer !== o.isAnswer)
            return false;

        if (!t.valuesEqual(this.from, o.from))
            return false;
    }

    toString() {
        return "[UBotCloudNotification from node: " + this.from.number +
            ", poolId: " + this.poolId +
            ", type: " + this.type.val +
            ", isAnswer: " + this.isAnswer + "]";
    }
}
t.addValAndOrdinalMaps(UBotCloudNotification.types);

class UBotCloudNotification_asmCommand extends Notification {

    static types = {
        SINGLE_STORAGE_GET_DATA_HASHID:                 {ordinal: 0},
        MULTI_STORAGE_GET_DATA_HASHID:                  {ordinal: 1},
        MULTI_STORAGE_GET_CORTEGE_HASHID:               {ordinal: 2},
        MULTI_STORAGE_GET_POOL_HASHES:                  {ordinal: 3},
        MULTI_STORAGE_GET_CORTEGES:                     {ordinal: 4},
        MULTI_STORAGE_GET_SUSPICIOUS_CORTEGE_HASHID:    {ordinal: 5},
        MULTI_STORAGE_GET_DECISIONS:                    {ordinal: 6},
        MULTI_STORAGE_VOTE_DECISION:                    {ordinal: 7},
        MULTI_STORAGE_VOTE_EXCLUSION_SUSPICIOUS:        {ordinal: 8}
    };

    constructor(from, poolId, procIndex, type, params) {
        super(from);
        this.poolId = poolId;
        this.procIndex = procIndex;
        this.type = type;
        this.params = params;
        this.typeCode = CODE_UBOT_CLOUD_NOTIFICATION_ASM_CMD;
    }

    writeTo(bw) {
        bw.write(this.poolId.digest);

        if (this.procIndex instanceof Array) {
            bw.write(this.procIndex.length);
            this.procIndex.forEach(cmd => bw.write(cmd));
        } else {
            bw.write(0);
            bw.write(this.procIndex);
        }

        let isFirstRecord = this.params.previousRecordId == null;

        bw.write(this.type.ordinal);
        bw.write(this.params.isAnswer);
        bw.write(isFirstRecord);
        switch (this.type) {
            case UBotCloudNotification_asmCommand.types.SINGLE_STORAGE_GET_DATA_HASHID:
            case UBotCloudNotification_asmCommand.types.MULTI_STORAGE_GET_DATA_HASHID:
                if (this.params.isAnswer) {
                    bw.write(this.params.dataHashId.digest);
                    if (!isFirstRecord)
                        bw.write(this.params.previousRecordId.digest);
                }
                break;
            case UBotCloudNotification_asmCommand.types.MULTI_STORAGE_GET_CORTEGE_HASHID:
                if (this.params.isAnswer)
                    bw.write(this.params.cortegeId.digest);
                break;
            case UBotCloudNotification_asmCommand.types.MULTI_STORAGE_GET_POOL_HASHES:
                bw.write(this.params.dataUbotInPool);

                if (this.params.isAnswer) {
                    bw.write(this.params.dataHashId.digest);
                    if (!isFirstRecord)
                        bw.write(this.params.previousRecordId.digest);
                }
                break;
            case UBotCloudNotification_asmCommand.types.MULTI_STORAGE_GET_CORTEGES:
                bw.write(this.params.commonCortegeIteration);
                if (this.params.isAnswer)
                    bw.write(this.params.cortege);
                break;
            case UBotCloudNotification_asmCommand.types.MULTI_STORAGE_GET_SUSPICIOUS_CORTEGE_HASHID:
                bw.write(this.params.commonCortegeIteration);
                bw.write(this.params.dataUbotInPool);
                if (this.params.isAnswer)
                    bw.write(this.params.cortegeId.digest);
                break;
            case UBotCloudNotification_asmCommand.types.MULTI_STORAGE_GET_DECISIONS:
            case UBotCloudNotification_asmCommand.types.MULTI_STORAGE_VOTE_DECISION:
                bw.write(this.params.commonCortegeIteration);
                if (this.params.isAnswer)
                    bw.write(this.params.decision);
                break;
            case UBotCloudNotification_asmCommand.types.MULTI_STORAGE_VOTE_EXCLUSION_SUSPICIOUS:
                bw.write(this.params.commonCortegeIteration);
                bw.write(this.params.suspect);
                if (this.params.isAnswer)
                    bw.write(this.params.decision);
        }
    }

    readFrom(br) {
        this.poolId = crypto.HashId.withDigest(br.read());
        this.params = {};

        let procIndexLen = br.read();
        if (procIndexLen !== 0) {
            this.procIndex = [];
            for (let i = 0; i < procIndexLen; i++)
                this.procIndex.push(br.read());
        } else
            this.procIndex = br.read();

        this.type = UBotCloudNotification_asmCommand.types.byOrdinal.get(br.read());
        this.params.isAnswer = br.read();
        let isFirstRecord = br.read();
        switch (this.type) {
            case UBotCloudNotification_asmCommand.types.SINGLE_STORAGE_GET_DATA_HASHID:
            case UBotCloudNotification_asmCommand.types.MULTI_STORAGE_GET_DATA_HASHID:
                if (this.params.isAnswer) {
                    this.params.dataHashId = crypto.HashId.withDigest(br.read());
                    if (!isFirstRecord)
                        this.params.previousRecordId = crypto.HashId.withDigest(br.read());
                    else
                        this.params.previousRecordId = null;
                }
                break;
            case UBotCloudNotification_asmCommand.types.MULTI_STORAGE_GET_CORTEGE_HASHID:
                if (this.params.isAnswer)
                    this.params.cortegeId = crypto.HashId.withDigest(br.read());
                break;
            case UBotCloudNotification_asmCommand.types.MULTI_STORAGE_GET_POOL_HASHES:
                this.params.dataUbotInPool = br.read();

                if (this.params.isAnswer) {
                    this.params.dataHashId = crypto.HashId.withDigest(br.read());
                    if (!isFirstRecord)
                        this.params.previousRecordId = crypto.HashId.withDigest(br.read());
                    else
                        this.params.previousRecordId = null;
                }
                break;
            case UBotCloudNotification_asmCommand.types.MULTI_STORAGE_GET_CORTEGES:
                this.params.commonCortegeIteration = br.read();
                if (this.params.isAnswer)
                    this.params.cortege = br.read();
                break;
            case UBotCloudNotification_asmCommand.types.MULTI_STORAGE_GET_SUSPICIOUS_CORTEGE_HASHID:
                this.params.commonCortegeIteration = br.read();
                this.params.dataUbotInPool = br.read();
                if (this.params.isAnswer)
                    this.params.cortegeId = crypto.HashId.withDigest(br.read());
                break;
            case UBotCloudNotification_asmCommand.types.MULTI_STORAGE_GET_DECISIONS:
            case UBotCloudNotification_asmCommand.types.MULTI_STORAGE_VOTE_DECISION:
                this.params.commonCortegeIteration = br.read();
                if (this.params.isAnswer)
                    this.params.decision = br.read();
                break;
            case UBotCloudNotification_asmCommand.types.MULTI_STORAGE_VOTE_EXCLUSION_SUSPICIOUS:
                this.params.commonCortegeIteration = br.read();
                this.params.suspect = br.read();
                if (this.params.isAnswer)
                    this.params.decision = br.read();
        }
    }

    equals(o) {
        if(this === o)
            return true;

        if(Object.getPrototypeOf(this) !== Object.getPrototypeOf(o))
            return false;

        if (this.type.poolId !== o.type.poolId)
            return false;

        if (!t.valuesEqual(this.procIndex, o.procIndex))
            return false;

        if (this.type.ordinal !== o.type.ordinal)
            return false;

        if (!t.valuesEqual(this.params, o.params))
            return false;

        if (!t.valuesEqual(this.from, o.from))
            return false;
    }

    toString() {
        return "[UBotCloudNotification_asmCommand from node: " + this.from.number +
            ", poolId: " + this.poolId +
            ", procIndex: " + JSON.stringify(this.procIndex) +
            ", type: " + this.type.val +
            ", isAnswer: " + this.params.isAnswer + "]";
    }
}
t.addValAndOrdinalMaps(UBotCloudNotification_asmCommand.types);

Notification.registerClass(CODE_UBOT_TEST_NOTIFICATION, UBotTestNotification);
Notification.registerClass(CODE_UBOT_CLOUD_NOTIFICATION, UBotCloudNotification);
Notification.registerClass(CODE_UBOT_CLOUD_NOTIFICATION_ASM_CMD, UBotCloudNotification_asmCommand);

module.exports = {UBotTestNotification, UBotCloudNotification, UBotCloudNotification_asmCommand};
