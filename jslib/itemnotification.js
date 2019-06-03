const Notification = require("notification").Notification;
const ItemResult = require('itemresult').ItemResult;

/**
 * The status notification for consensus creation procedure, carries information about some node item status and update
 * request.
 */
class ItemNotification extends Notification {

    static CODE_ITEM_NOTIFICATION = 0;

    constructor(from, itemId, itemResult, requestResult) {
        super(from);
        this.itemId = itemId;
        this.itemResult = itemResult;
        this.requestResult = requestResult;

    }

    writeTo(bw) {
        bw.writeObject(this.itemId.getDigest());
        this.itemResult.writeTo(bw);
        bw.writeObject(this.requestResult);
    }

    readFrom(br) {
        this.itemId = HashId.withDigest(br.readBinary());
        this.itemResult = new ItemResult(br);
        this.requestResult = br.read();
    }

    equals(o) {
        if (this === o)
            return true;
        if (o == null || getClass() !== o.getClass()) //TODO
            return false;

        let that = o;

        let from = getFrom();

        if (this.requestResult !== that.requestResult)
            return false;
        if (!from.equals(that.getFrom()))
            return false;
        if (!this.itemId.equals(that.itemId))
            return false;

        return this.itemResult.equals(that.itemResult);
    }

    hashCode() {
        let from = getFrom();
        let result = from.hashCode(); // TODO
        result = 31 * result + this.itemId.hashCode();
        result = 31 * result + this.itemResult.hashCode();
        result = 31 * result + (this.requestResult ? 1 : 0);
        return result;
    }

    toString() {
        return "[ItemNotification from " + getFrom() + " for item: " + getItemId() +  ", item result: " + this.itemResult +
            ", is answer requested: " + answerIsRequested() + "]";
    }
}