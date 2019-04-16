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
    getLongAddress();

    /**
     * Get short address.
     *
     * @return {string} short address.
     */
    getShortAddress();

    /**
     * Get origin.
     *
     * @return {HashId} origin.
     */
    getOrigin();
}