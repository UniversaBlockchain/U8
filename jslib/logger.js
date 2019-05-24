class Logger {

    /**
     * Create logger capable to hold in memory up to specified number of entries, the excessive records will be
     * purged automatically.
     *
     * @param {number} maxEntries - Max number of stored log records.
     */
    constructor(maxEntries) {
        this.maxEntries = maxEntries;
        this.buffer = [];
        this.nolog = false;
    }

    /**
     * Log message and save to buffer.
     *
     * @param {string} message - Message for logging.
     */
    log(message) {
        if (!this.nolog)
            console.log(message);

        this.buffer.push(message);
        while (this.buffer.length > this.maxEntries)
            this.buffer.shift();
    }

    /**
     * Return most recent record up to specified number of entries.
     *
     * @param {number} maxEntries - Must be > 0. If current number of records is less than specified, returns all.
     *
     * @return {Array<string>} Array contains recent records.
     */
    getLast(maxEntries) {
        return this.buffer.slice(this.buffer.length - maxEntries);
    }
}

///////////////////////////
//EXPORTS
///////////////////////////
module.exports = {Logger};