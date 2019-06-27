const Notification = require('notification').Notification;
const t = require("tools");

const CODE_UBOT_TEST_NOTIFICATION = 10;
const CODE_UBOT_CLOUD_NOTIFICATION = 11;

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

Notification.registerClass(CODE_UBOT_TEST_NOTIFICATION, UBotTestNotification);
Notification.registerClass(CODE_UBOT_CLOUD_NOTIFICATION, UBotCloudNotification);

module.exports = {UBotTestNotification, UBotCloudNotification};
