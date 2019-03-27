/*
 * This is a low-level interface that any database driver should implement.
 */

/**
 * General database error object to be used in all
 *
 * Note on error reporting from the driver using the callback.
 * DB driver implementations.
 *
 * The drived code should create instance of the {}DatabaseError} or its descendant, like {SqlStatementError}
 * or {InvalidParameterError}. the driver implementor could and should extend {DatabaseError} to add more error
 * classes for missing cases.
 *
 * Then, the driver could should pass the created instance to the `onError` callback.
 */
class DatabaseError extends Error {
    constructor(message = undefined) {
        super();
        this.message = message;
    }
}

class SqlStatementError extends DatabaseError {
}

class InvalidParameterError extends DatabaseError {
}

/**
 * Create pooled connection with specified connection string (use database-specific format).
 *
 * @param connectionString
 *
 * @param onConnected callback to be called with SqlDriverPool - descendant object on success
 * @param onError error callback
 * @param maxConnection desired maximum number of connections in the pool. Actual number of coonnections could differ.
 */
function connect(connectionString, onConnected, onError, maxConnection = 100) {
    throw new DatabaseError("not implemented");
}

/**
 * Pool of sql connections: any database driver should implent it.
 */
class SqlDriverPool {
    /**
     * Driver implements. Get connection from the pool, pass it to the callback and return it to the pool.
     * The call itself never blocks while the callback could be called in some moment in future. See SqlConnection.
     *
     * @param callback that takes single argument of type {SqlDriverConnection}, The connection should be used
     *        only inside the callback, it must not be stored and used outside of it.
     */
    withConnection(callback) {
        throw new DatabaseError("not implemented");
    }

    /**
     * Driver implements. Return number of connections in the pool.
     *
     * @return {number}
     */
    totalConnections() {
        return 0;
    }

    /**
     * Driver implements. Return number of available connections in the pool.
     *
     * @return {number}
     */
    availableConnections() {
        return 0;
    }
}

/**
 * Database driver implements it
 *
 * Note about parameter types that connection should support out of the box:
 *
 * _numbers_: automatically convert to/from database column. If database column holds wide integers (more than 32 bits)
 * it should automatically use Javascript long integers. If database column contains big decimals, it should return th
 * {big} number too. In reverse, it should properly handle javascript {number}, {big integers} and {big} decimals.
 * Assigning impoper values (too big, with precision loss, etc. should throw some kind of the {DatabaseError}. That means
 * that at least INTEGER, BIGINT, FLOAT and DECIMAL columns must be supported.
 *
 * _big decimals are stage 2 task while bing integers we need since the beginning!_
 *
 * _strings_: should be supported for CHAR, VARCHAR, TEXT, CITEXT and whatever else capable of carrying text data. Always
 * use utf-8 encoding in the table columns. If the javascript input parameters is not a string, must throw {DatabaseError}
 *
 * _date_: should convert to and from {Date} class for TIMESTAMP and DATE columns at least.
 *
 * _boolean_: should convert to and for BOOLEAN columns and javascript boolean. Accept javascript boolean values only.
 *
 * _binary_: required conversion between {Uint8Array} and BYTEA. BLOB support will be added later.
 *
 * Exotics like arrays, jsons and more will wait until this interface will be implemented.
 *
 */
class SqlDriverConnection {
    /**
     * Execute
     * @param onSuccess callback that is called when statement is executed with {SqlDriverResultSet} instance as a single object.
     * @param onError callback that is called with some error code (TBD)
     * @param queryString the SQL statement where possible parameters (to use for prepared statement if any) are
     *        replaced with '?' characters.
     * @param params optional parameters. If any, the prepared statement should be used.
     * @return [SqlDriverResultSet] query result.
     */
    executeQuery(onSuccess, onError, queryString, ...params) {
        throw new DatabaseError("not implemented");
    }

    /**
     * Execute non-query statement, e.g. data modification or table structure modification statement.
     *
     * @param onSuccess callback that is called when statement is executed with an integer parameter containing
     *        number of affected strings.
     * @param onError callback that is called
     * @param queryString
     * @param params
     * @return {number} number of rows affected (as database reports}
     */
    executeUpdate(onSuccess, onError, queryString, ...params) {
        throw new DatabaseError("not implemented");
    }

    /**
     * Each connection received with withConnection() pool method, should be released.
     */
    release() {
        throw new DatabaseError("not implemented");
    }
}

/**
 * Results of the query.
 */
class SqlDriverResultSet {
    /**
     * Get {Array} of rows. each row is a plain 0-based javascript array of converted javascript values.
     * If there are less rows than requested, returns all remaining rows. Return empty array when there are
     * no more rows. If maxRows is 0, returns all resulting data anyway.
     *
     * @param maxRows max number of rows to return
     * @return [Array(Array())] results, could be empty array.
     */
    getRows(maxRows=1024) {
        throw new DatabaseError("not implemented");
    }

    /**
     * Return total number of rows in the set (does not change when {#getRows} calls
     */
    getRowsCount() {
        throw new DatabaseError("not implemented");
    }

    /**
     * Return total number of columns in the set.
     */
    getColsCount() {
        throw new DatabaseError("not implemented");
    }

    /**
     * Return count of rows updated by UPDATE sql query
     */
    getAffectedRows() {
        throw new DatabaseError("not implemented");
    }

    /**
     * Return {Array} of strings with names of selected columns.
     */
    getColNames() {
        throw new DatabaseError("not implemented");
    }

    /**
     * Return {Array} with info about types of selected columns. For pg it is an array of Oid.
     */
    getColTypes() {
        throw new DatabaseError("not implemented");
    }

    /**
     * Optinally close the resultset. If not called explicitly, driver
     */
    close() {
        throw new DatabaseError("not implemented");
    }

}


module.exports = {DatabaseError,SqlStatementError,InvalidParameterError,SqlDriverPool,SqlDriverConnection,SqlDriverResultSet};
