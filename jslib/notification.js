const ItemResult = require('itemresult').ItemResult;
const StateRecord = require('staterecord').StateRecord;

/**
 * Notifications are binary-effective packable units to transfer between nodes with v2 UDP protocols.
 * Each notification should inherit from {@link Notification} and register self with uniqie integer code in static
 * constructor using {@link #registerClass(int, Class)}. It also must provide provate nonparametric constructor and
 * implement abstract methods {@link #writeTo(Boss.Writer)}, {@link #readFrom(Boss.Reader)}.
 * Notifications could be packed together in a compact form. Use {@link #pack(Collection)} and {@link #unpack(NodeInfo,
 * byte[])}.
 */
class Notification {

    constructor(from) {
        this.from = from;
        this.classes = new Map();
    }

    /**
     * Register class with a type code (same as its instace must return with typeCode to use with UDP
     * notifications.
     *
     * @param {number} code - Unique type code (per class).
     * @param {} klass - Inherited Notification class.
     */
    registerClass(code, klass) {
        this.classes.set(code, klass);
    }

    /**
    * Write self to boss writer.
    */
    writeTo() {
        throw new Error("not implemented");
    }

    /**
     * Read self from boss reader.
     */
    readFrom() {
        throw new Error("not implemented");
    }

    pack(notifications) {
        let writer = new Boss.Writer;
        try {
            for (let n of notifications) {
                this.write(writer, n);
            }

            return writer.toByteArray();

        } catch (e) {
            throw new Error("failed to pack notification");
        }
    }

    write(writer, n) {
        writer.write(n.typeCode);
        n.writeTo(writer);
    }

    unpack(from, packed) {
        let notifications = [];
        let r = new Boss.Reader(packed);
        try {
            while (true) {
                // boss reader throws EOFException
                let n = read(from, r);
                if( n != null )
                    notifications.push(n);
            }
        } catch (x) { //TODO
            // normal, all data decoded
        //} catch (e) {
        //    throw new Error("Failed to decoded notification");
        }
        return notifications;
    }

    read(from, r) {
        let code = r.readInt();
        let nclass = classes.get(code);
        if( nclass != null ) {
            let c = nclass.getDeclaredConstructor();
            c.setAccessible(true);
            let n =  c.newInstance();
            n.readFrom(r);
            n.from = from;
            return n;
        }
        else {
            console.log("*** unknown notification class code: " + code);
            return null;
        }
    }
}

/**
 * The status notification for consensus creation procedure, carries information about some node item status and update
 * request.
 */
class ItemNotification extends Notification {
    /**
     * If true, sending node asks receiving node to sent its status of this item back to sender. This overrides default
     * logic of sending only one broadcast about item status.
     */
    static CODE_ITEM_NOTIFICATION = 0;

    constructor(from, itemId, itemResult, requestResult) {
        super(from);
        this.itemId = itemId;
        this.itemResult = itemResult;
        this.requestResult = requestResult;
    }

    writeTo(bw) {
        bw.writeObject(this.itemId.digest);
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

        let from = this.from;

        if (this.requestResult !== that.requestResult)
            return false;
        if (!from.equals(that.from))
            return false;
        if (!this.itemId.equals(that.itemId))
            return false;

        return this.itemResult.equals(that.itemResult);
    }

    toString() {
        return "[ItemNotification from " + this.from + " for item: " + this.itemId +  ", item result: " + this.itemResult +
            ", is answer requested: " + this.requestResult + "]";
    }
}

class ResyncNotification extends ItemNotification {

    static CODE_RESYNC_NOTIFICATION = 3;

    constructor(from, itemId, itemState, hasEnvironment, requestResult) {
        super(from, itemId,  ItemResult(new StateRecord(itemId)), requestResult);

        this.itemState = itemState;
        this.hasEnvironment = hasEnvironment;

        /**
         * Code the class had registered self with using {@link #registerClass(int, Class)} in the static
         * constructor. Note that the class that did not register self can't be used by the Universa system.
         */
        this.typeCode = ResyncNotification.CODE_RESYNC_NOTIFICATION;
    }

    writeTo(bw) {
        super.writeTo(bw);
        if (!this.requestResult) {
            bw.write(this.itemState.ordinal());
            bw.write(this.hasEnvironment);
        }
    }

    readFrom(br) {
        super.readFrom(br);
        if (!this.requestResult) {
            this.itemState = ItemState.values()[br];
            this.hasEnvironment = br;
        }
    }

    toString() {
        return "[ResyncNotification from: " + this.from + " for item: " + this.itemId + ", is answer requested: " +
            this.requestResult + "]";
    }

}

module.exports = {Notification, ItemNotification, ResyncNotification};