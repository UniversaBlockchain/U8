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
        SINGLE_STORAGE_GET_DATA_HASHID:   {ordinal: 0},
        MULTI_STORAGE_GET_DATA_HASHID:   {ordinal: 1},
        MULTI_STORAGE_GET_CORTEGE_HASHID:   {ordinal: 2},
        MULTI_STORAGE_GET_POOL_HASHES:   {ordinal: 3}
    };

    constructor(from, poolId, cmdStack, type, dataHashId, previousRecordId, isAnswer, isFirstRecord, dataUbotInPool = -1) {
        super(from);
        this.poolId = poolId;
        this.cmdStack = cmdStack;
        this.type = type;
        this.dataHashId = dataHashId;
        this.dataUbotInPool = dataUbotInPool;
        this.previousRecordId = previousRecordId;
        this.isAnswer = isAnswer;
        this.isFirstRecord = isFirstRecord;
        this.typeCode = CODE_UBOT_CLOUD_NOTIFICATION_ASM_CMD;
    }

    writeTo(bw) {
        bw.write(this.poolId.digest);

        bw.write(this.cmdStack.length);
        this.cmdStack.forEach(cmd => bw.write(cmd));

        bw.write(this.type.ordinal);
        bw.write(this.isAnswer);
        bw.write(this.isFirstRecord);
        switch (this.type) {
            case UBotCloudNotification_asmCommand.types.SINGLE_STORAGE_GET_DATA_HASHID:
            case UBotCloudNotification_asmCommand.types.MULTI_STORAGE_GET_DATA_HASHID:
            case UBotCloudNotification_asmCommand.types.MULTI_STORAGE_GET_CORTEGE_HASHID:
                if (this.isAnswer) {
                    bw.write(this.dataHashId.digest);
                    if (!this.isFirstRecord)
                        bw.write(this.previousRecordId.digest);
                }
                break;
            case UBotCloudNotification_asmCommand.types.MULTI_STORAGE_GET_POOL_HASHES:
                bw.write(this.dataUbotInPool);

                if (this.isAnswer) {
                    bw.write(this.dataHashId.digest);
                    if (!this.isFirstRecord)
                        bw.write(this.previousRecordId.digest);
                }
        }
    }

    readFrom(br) {
        this.poolId = crypto.HashId.withDigest(br.read());

        this.cmdStack = [];
        let cmdStackLen = br.read();
        for (let i = 0; i < cmdStackLen; i++)
            this.cmdStack.push(br.read());

        this.type = UBotCloudNotification_asmCommand.types.byOrdinal.get(br.read());
        this.isAnswer = br.read();
        this.isFirstRecord = br.read();
        switch (this.type) {
            case UBotCloudNotification_asmCommand.types.SINGLE_STORAGE_GET_DATA_HASHID:
            case UBotCloudNotification_asmCommand.types.MULTI_STORAGE_GET_DATA_HASHID:
            case UBotCloudNotification_asmCommand.types.MULTI_STORAGE_GET_CORTEGE_HASHID:
                if (this.isAnswer) {
                    this.dataHashId = crypto.HashId.withDigest(br.read());
                    if (!this.isFirstRecord)
                        this.previousRecordId = crypto.HashId.withDigest(br.read());
                    else
                        this.previousRecordId = null;
                }
                break;
            case UBotCloudNotification_asmCommand.types.MULTI_STORAGE_GET_POOL_HASHES:
                this.dataUbotInPool = br.read();

                if (this.isAnswer) {
                    this.dataHashId = crypto.HashId.withDigest(br.read());
                    if (!this.isFirstRecord)
                        this.previousRecordId = crypto.HashId.withDigest(br.read());
                    else
                        this.previousRecordId = null;
                }
        }
    }

    equals(o) {
        if(this === o)
            return true;

        if(Object.getPrototypeOf(this) !== Object.getPrototypeOf(o))
            return false;

        if (this.type.poolId !== o.type.poolId)
            return false;

        if (!t.valuesEqual(this.cmdStack, o.cmdStack))
            return false;

        if (this.type.ordinal !== o.type.ordinal)
            return false;

        if (this.isAnswer !== o.isAnswer)
            return false;

        if (this.isFirstRecord !== o.isFirstRecord)
            return false;

        if (!t.valuesEqual(this.dataHashId, o.dataHashId))
            return false;

        if (!t.valuesEqual(this.previousRecordId, o.previousRecordId))
            return false;

        if (!t.valuesEqual(this.from, o.from))
            return false;
    }

    toString() {
        return "[UBotCloudNotification_asmCommand from node: " + this.from.number +
            ", poolId: " + this.poolId +
            ", cmdStack: " + JSON.stringify(this.cmdStack) +
            ", type: " + this.type.val +
            ", isAnswer: " + this.isAnswer +
            ", isFirstRecord: " + this.isFirstRecord + "]";
    }
}
t.addValAndOrdinalMaps(UBotCloudNotification_asmCommand.types);

Notification.registerClass(CODE_UBOT_TEST_NOTIFICATION, UBotTestNotification);
Notification.registerClass(CODE_UBOT_CLOUD_NOTIFICATION, UBotCloudNotification);
Notification.registerClass(CODE_UBOT_CLOUD_NOTIFICATION_ASM_CMD, UBotCloudNotification_asmCommand);

module.exports = {UBotTestNotification, UBotCloudNotification, UBotCloudNotification_asmCommand};
