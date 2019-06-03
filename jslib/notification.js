/**
 * Notifications are binary-effective packable units to transfer between nodes with v2 UDP protocols.
 * Each notification should inherit from {@link Notification} and register self with uniqie integer code in static
 * constructor using {@link #registerClass(int, Class)}. It also must provide provate nonparametric constructor and
 * implement abstract methods {@link #writeTo(Boss.Writer)}, {@link #readFrom(Boss.Reader)} and {@link #getTypeCode()}.
 * Notifications could be packed together in a compact form. Use {@link #pack(Collection)} and {@link #unpack(NodeInfo,
 * byte[])}.
 */
class Notification {

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
/*

 */

}