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
            callback(con);
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

module.exports = {connect};
