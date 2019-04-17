/**
 * Service storage of a unique name (regulated by the UNS contract) for some amount of time.
 *
 * @interface NameRecord
 */
class NameRecord {

    /**
     * @return {Date} the expiration time.
     */
    expiresAt();

    /**
     * @return {string}
     */
    getName();

    /**
     * @return {string}
     */
    getNameReduced();

    /**
     * @return {string}
     */
    getDescription();

    /**
     * @return {string}
     */
    getUrl();

    /**
     * @return {[NameRecordEntry]}
     */
    getEntries();
}

module.exports = {NameRecord};