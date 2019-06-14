const Notification = require('notification').Notification;

const CODE_UBOT_TEST_NOTIFICATION = 10;

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

Notification.registerClass(CODE_UBOT_TEST_NOTIFICATION, UBotTestNotification);

module.exports = {UBotTestNotification};
