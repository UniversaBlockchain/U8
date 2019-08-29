/*
 * Copyright (c) 2019 Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

import * as db from 'db_driver'
import {MemoiseMixin} from 'tools'
import * as io from "io";
const ExecutorWithFixedPeriod = require("executorservice").ExecutorWithFixedPeriod;

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
        this.isClosed = false;
    }

    withConnection(callback) {
        this.pool._withConnection(async (con)=>{
            await callback(new PgDriverConnection(con,this));
        });
    }

    totalConnections() {
        return this.pool._totalConnections();
    }

    availableConnections() {
        return this.pool._availableConnections();
    }

    close() {
        this.isClosed = true;
        this.pool._close();
    }

    transaction(block) {
        return new Promise((resolve, reject) => {
            this.withConnection(async(con) => {
                con.executeUpdate(affectedRows => {},
                    e => {
                        con.release();
                        reject(e);
                    },
                    "BEGIN;"
                );

                let result = null;

                try {
                    result = await block(con);
                } catch (err) {

                    con.executeQuery(qr => {
                            con.release();
                            reject(err);
                        },
                        e => {
                            con.release();
                            reject(e);
                        },
                        "ROLLBACK;"
                    );

                    return;
                }

                con.executeUpdate(affectedRows => {
                        con.release();
                        resolve(result);
                    },
                    e => {
                        con.release();
                        reject(e);
                    },
                    "COMMIT;"
                );
            });
        });
    }
}

class PgDriverConnection extends db.SqlDriverConnection {
    constructor(con,pool) {
        super();
        this.con = con;
        this.pool = pool;
    }

    executeQuery(onSuccess, onError, queryString, ...params) {
        if (this.pool.isClosed)
            return;
        this.con._executeQuery(async (qr)=>{
            await onSuccess(new PgDriverResultSet(qr));
            qr._release();
        }, async (errText)=>{
            await onError(new db.DatabaseError(errText));
        }, queryString, params);
    }

    executeUpdate(onSuccess, onError, queryString, ...params) {
        if (this.pool.isClosed)
            return;
        this.con._executeUpdate(async (affectedRows)=>{
            await onSuccess(affectedRows);
        }, async (errText)=>{
            await onError(new db.DatabaseError(errText));
        }, queryString, params);
    }

    /**
     * Can execute multiple sql queries separated by semicolon.
     * Don't accepts query parameters.
     * It is used for migrations applying.
     */
    execSql(onSuccess, onError, sql) {
        if (this.pool.isClosed)
            return;
        this.con._exec(() => {
            onSuccess();
        }, (errText) => {
            onError(new db.DatabaseError(errText));
        }, sql);
    }

    release() {
        if (this.pool.isClosed)
            return;
        this.con._release();
    }

    toString() {
        return crypto.HashId.of(t.randomBytes(64));
    }

    stringId() {
        if (this.stringId_ == null)
            this.stringId_ = this.toString();

        return this.stringId_;
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

    getColNamesMap() {
        let res = {};
        let arr = this.qr._getColNames();
        arr.forEach((val, i) => {res[val] = i;});
        return res;
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

class MigrationDriver {
    constructor() {
    }

    static async createDB(pool, migrationFilesPath) {
        if (migrationFilesPath == null)
            return;
        try {
            migrationFilesPath = migrationFilesPath.endsWith("/") ? migrationFilesPath : migrationFilesPath + "/";
            let myVersion = 0;
            let resolver, rejecter;
            let promise = new Promise((resolve, reject) => {resolver = resolve; rejecter = reject;});
            pool.withConnection(con => {
                con.executeQuery(qr => {
                    if (qr.getRowsCount() > 0)
                        myVersion = parseInt(qr.getRows(1)[0]);
                    con.release();
                    resolver();
                }, e => {
                    con.release();
                    resolver();
                }, "SELECT ivalue FROM vars WHERE name = 'version'");
            });
            await promise;
            let currentDbVersion = await MigrationDriver.detectMaxMigrationVersion(migrationFilesPath);
            //console.log("My db version is " + myVersion + ", current is " + currentDbVersion);
            while (myVersion < currentDbVersion) {
                console.log("  Migrating to " + (myVersion + 1));
                let resolver;
                let promise = new Promise(resolve => resolver = resolve);
                pool.transaction(async (con) => {
                    let sql = await io.fileGetContentsAsString(migrationFilesPath + "migrate_" + myVersion + ".sql");
                    //this.preMigrate(myVersion);
                    let res = await MigrationDriver.execSqlSync(con, sql);
                    if (!res[0])
                        throw res[1];
                    //this.postMigrate(myVersion);
                    ++myVersion;
                    res = await MigrationDriver.execUpdateSync(con, "update vars set ivalue=? where name='version'", myVersion);
                    if (!res[0])
                        throw res[1];
                }).then(res => {
                    resolver([true, ""]);
                }).catch(err => {
                    resolver([false, err]);
                });
                let res = await promise;
                if (!res[0])
                    throw res[1];
            }
        } catch (e) {
            console.error("migrations failed, error: " + e);
            throw e;
        }
    }

    static async execSqlSync(con, sql) {
        let resolver;
        let promise = new Promise(resolve => resolver = resolve);
        con.execSql(() => {
            resolver([true, ""]);
        }, err => {
            resolver([false, err]);
        }, sql);
        return promise;
    }

    static async execUpdateSync(con, sql, ...params) {
        let resolver;
        let promise = new Promise(resolve => resolver = resolve);
        con.executeUpdate((affectedRows) => {
            resolver([true, ""]);
        }, err => {
            resolver([false, err]);
        }, sql, ...params);
        return promise;
    }

    static async detectMaxMigrationVersion(path) {
        let files = await io.getFilesFromDir(path);
        let res = 0;
        for (let file of files) {
            if (file.endsWith(".sql")) {
                let s = file.substr(8, file.indexOf(".sql")-8);
                let i = parseInt(s);
                if (res < i)
                    res = i;
            }
        }
        return res + 1;
    }
}

module.exports = {connect, MigrationDriver};
