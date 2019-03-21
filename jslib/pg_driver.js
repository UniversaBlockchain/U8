import * as db from 'db_driver'

function connect(connectionString, onConnected, onError, maxConnection = 100) {
    let pool = new PGPool();
    let connectRes = pool._connect(maxConnection, connectionString);
    if (connectRes == "") {
        onConnected(new PgDriverPool(pool));
    } else {
        onError(new db.DatabaseError(connectRes));
    }
}

class PgDriverPool extends db.SqlDriverPool {
    constructor(pool) {
        super();
        this.pool = pool;
    }

    withConnection(callback) {
        this.pool._withConnection((con)=>{
            callback(new PgDriverConnection(con));
        });
        //throw new db.DatabaseError("pg not implemented");
    }

    totalConnections() {
        return this.pool._totalConnections();
    }

    availableConnections() {
        return this.pool._availableConnections();
    }
}

class PgDriverConnection extends db.SqlDriverConnection {
    constructor(con) {
        super();
        this.con = con;
    }

    executeQuery(onSuccess, onError, queryString, ...params) {
        this.con._executeQuery((qr)=>{
            onSuccess(new PgDriverResultSet(qr));
        }, (errText)=>{
            onError(new db.DatabaseError(errText));
        }, queryString, []);
    }
}

class PgDriverResultSet extends db.SqlDriverResultSet {
    constructor(qr) {
        super();
        this.qr = qr;
    }

    getRowsCount() {
        return this.qr._getRowsCount();
    }

    getAffectedRows() {
        return this.qr._getAffectedRows();
    }

    getColNames() {
        return this.qr._getColNames();
    }

    close() {
        throw new db.DatabaseError("PgDriverResultSet closes automatically. Don't call close() manually.");
    }
}

module.exports = {connect};
