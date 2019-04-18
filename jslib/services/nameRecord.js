/**
 * Service storage of a unique name (regulated by the UNS contract) for some amount of time.
 *
 * @interface NameRecord
 */
class NameRecord {

    /**
     * @return {Date} the expiration time.
     */
    getExpiresAt() {
        throw new Error("not implemented");
    }

    /**
     * @return {string}
     */
    getName() {
        throw new Error("not implemented");
    }

    /**
     * @return {string}
     */
    getNameReduced() {
        throw new Error("not implemented");
    }

    /**
     * @return {string}
     */
    getDescription() {
        throw new Error("not implemented");
    }

    /**
     * @return {string}
     */
    getUrl() {
        throw new Error("not implemented");
    }

    /**
     * @return {[NameRecordEntry]}
     */
    getEntries() {
        throw new Error("not implemented");
    }
}

module.exports = {NameRecord};