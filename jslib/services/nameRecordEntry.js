/**
 * Service for receiving data on the unique name record, regulated by the UNS contract.
 *
 * @interface NameRecordEntry
 */
class NameRecordEntry {

    /**
     * Get long address.
     *
     * @return {string} long address.
     */
    getLongAddress() {
        throw new Error("not implemented");
    }

    /**
     * Get short address.
     *
     * @return {string} short address.
     */
    getShortAddress() {
        throw new Error("not implemented");
    }

    /**
     * Get origin.
     *
     * @return {HashId} origin.
     */
    getOrigin() {
        throw new Error("not implemented");
    }
}

module.exports = {NameRecordEntry};