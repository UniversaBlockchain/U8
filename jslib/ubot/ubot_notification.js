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
        MULTI_STORAGE_GET_POOL_HASHES:   {ordinal: 2}
    };

    constructor(from, poolId, cmdIndex, type, dataHashId, isAnswer) {
        super(from);
        this.poolId = poolId;
        this.cmdIndex = cmdIndex;
        this.type = type;
        this.dataHashId = dataHashId;
        this.isAnswer = isAnswer;
        this.typeCode = CODE_UBOT_CLOUD_NOTIFICATION_ASM_CMD;
    }

    writeTo(bw) {
        bw.write(this.poolId.digest);
        bw.write(this.cmdIndex);
        bw.write(this.type.ordinal);
        bw.write(this.isAnswer);
        switch (this.type) {
            case UBotCloudNotification_asmCommand.types.SINGLE_STORAGE_GET_DATA_HASHID:
                if (this.isAnswer)
                    bw.write(this.dataHashId.digest);
                break;
        }
    }

    readFrom(br) {
        this.poolId = crypto.HashId.withDigest(br.read());
        this.cmdIndex = br.read();
        this.type = UBotCloudNotification_asmCommand.types.byOrdinal.get(br.read());
        this.isAnswer = br.read();
        switch (this.type) {
            case UBotCloudNotification_asmCommand.types.SINGLE_STORAGE_GET_DATA_HASHID:
                if (this.isAnswer)
                    this.dataHashId = crypto.HashId.withDigest(br.read());
                break;
        }
    }

    equals(o) {
        if(this === o)
            return true;

        if(Object.getPrototypeOf(this) !== Object.getPrototypeOf(o))
            return false;

        if (this.type.poolId !== o.type.poolId)
            return false;

        if (this.cmdIndex !== o.cmdIndex)
            return false;

        if (this.type.ordinal !== o.type.ordinal)
            return false;

        if (this.isAnswer !== o.isAnswer)
            return false;

        if (this.dataHashId.poolId !== o.dataHashId.poolId)
            return false;

        if (!t.valuesEqual(this.from, o.from))
            return false;
    }

    toString() {
        return "[UBotCloudNotification_asmCommand from node: " + this.from.number +
            ", poolId: " + this.poolId +
            ", cmdIndex: " + this.cmdIndex +
            ", type: " + this.type.val +
            ", isAnswer: " + this.isAnswer + "]";
    }
}
t.addValAndOrdinalMaps(UBotCloudNotification_asmCommand.types);

Notification.registerClass(CODE_UBOT_TEST_NOTIFICATION, UBotTestNotification);
Notification.registerClass(CODE_UBOT_CLOUD_NOTIFICATION, UBotCloudNotification);
Notification.registerClass(CODE_UBOT_CLOUD_NOTIFICATION_ASM_CMD, UBotCloudNotification_asmCommand);

module.exports = {UBotTestNotification, UBotCloudNotification, UBotCloudNotification_asmCommand};
