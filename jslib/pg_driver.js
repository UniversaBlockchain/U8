import * as db from 'db_driver'
import {MemoiseMixin} from 'tools'

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
    }

    totalConnections() {
        return this.pool._totalConnections();
    }

    availableConnections() {
        return this.pool._availableConnections();
    }

    releaseConnection(con) {
        this.pool._releaseConnection(con.con);
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
        }, queryString, params);
    }

    executeUpdate(onSuccess, onError, queryString, ...params) {
        this.con._executeUpdate((affectedRows)=>{
            onSuccess(affectedRows);
        }, (errText)=>{
            onError(new db.DatabaseError(errText));
        }, queryString, params);
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

    getColsCount() {
        return this.memoise('__qr_getColsCount', () => this.qr._getColsCount());
    }

    getAffectedRows() {
        return this.qr._getAffectedRows();
    }

    getColNames() {
        return this.qr._getColNames();
    }

    getColTypes() {
        return this.qr._getColTypes();
    }

    getRows(maxRows=1024) {
        let rowsData = this.qr._getRows(maxRows);
        let colsCount = this.getColsCount();
        let rowsCount = rowsData.length / colsCount;
        let res = [];
        for (let iRow = 0; iRow < rowsCount; ++iRow) {
            let row = [];
            for (let iCol = 0; iCol < colsCount; ++iCol)
                row.push(rowsData[iRow*colsCount+iCol]);
            res.push(row);
        }
        return res;
    }

    close() {
        throw new db.DatabaseError("PgDriverResultSet closes automatically. Don't call close() manually.");
    }
}

Object.assign(PgDriverResultSet.prototype, MemoiseMixin);

module.exports = {connect};
