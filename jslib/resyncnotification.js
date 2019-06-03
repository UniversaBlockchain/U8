
class ResyncNotification extends ItemNotification {

    static CODE_RESYNC_NOTIFICATION = 3;

    constructor(from, itemId, itemState, hasEnvironment, answerIsRequested) {
        super(from, itemId,  itemId, answerIsRequested);
        this.itemState = itemState;
        this.hasEnvironment = hasEnvironment;// ? true : false;

        /**
        * Code the class had registered self with using {@link #registerClass(int, Class)} in the static
        * constructor. Note that the class that did not register self can't be used by the Universa system.
        */
        this.typeCode = CODE_RESYNC_NOTIFICATION;
    }

    writeTo(bw) {
        super.writeTo(bw);
        if (!answerIsRequested()) {
            bw.write(this.itemState.ordinal());
            bw.write(this.hasEnvironment);
        }
    }

    readFrom(br) {
        super.readFrom(br);
        if (!answerIsRequested()) {
            this.itemState = ItemState.values()[br];
            this.hasEnvironment = br;
        }
    }

    toString() {
        return "[ResyncNotification from: " + getFrom() + " for item: " + getItemId() + ", is answer requested: " +
            answerIsRequested() + "]";
    }

}