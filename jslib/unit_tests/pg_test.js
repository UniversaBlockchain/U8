import {expect, unit, assert, assertSilent} from 'test'
import * as db from 'pg_driver'
import {HashId} from 'crypto'
import {randomBytes} from 'tools'

unit.test("pg_test: hello", async () => {
    try {
        let pool;

        db.connect("host=localhost port=5432 dbname=unit_tests", (dbPool) => {
            // console.log("onConnected, totalConnections=" + dbPool.totalConnections() +
            //     ", availableConnections="+dbPool.availableConnections());
            pool = dbPool;
        }, (e) => {
            throw Error("db.connect.onError: " + e);
        }, 8);

        for (let i = 0; i < 1; ++i) {
            let resolver;
            let promise = new Promise((resolve, reject) => {
                resolver = resolve;
            });
            pool.withConnection((con) => {
                // console.log("withConnection.callback: con=" + con.constructor.name + ", availableConnections=" + pool.availableConnections());
                con.executeQuery((r) => {
                    // console.log("con.executeQuery.onSuccess:");
                    // console.log("  getRowsCount: " + r.getRowsCount());
                    // console.log("  getColsCount: " + r.getColsCount());
                    // console.log("  getAffectedRows: " + r.getAffectedRows());
                    // console.log("  getColNames: " + r.getColNames());
                    // console.log("  getColTypes: " + r.getColTypes());
                    // console.log("  getRows: " + JSON.stringify(r.getRows(0), function(k,v){return (typeof v==='bigint')?v.toString()+"n":v;}));
                    resolver();
                }, (e) => {
                    console.error("con.executeQuery.onError: " + e);
                    resolver();
                }, "SELECT 1 AS one, 2::bigint AS two, 3 AS three, 'some text' AS text, $1, $2, $3, $4, $5;", 1, 2.333e+170, 3, 4.34, "ololo");
            });
            await promise;
        }

    } catch (err) {
        console.log("error: "+err.constructor.name+"('" + err.message + "')");
    }
});

async function execSync(pool, queryStr) {
    let resolver;
    let promise = new Promise((resolve, reject) => {
        resolver = resolve;
    });
    pool.withConnection(con => {
        con.executeQuery(
            r => {
                resolver();
            },
            e => {
                console.error(e);
                resolver();
            },
            queryStr);
    });
    await promise;
}

function createPool(poolSize) {
    let pool;
    db.connect("host=localhost port=5432 dbname=unit_tests", (dbPool) => {
        pool = dbPool;
    }, (e) => {
        throw Error(e);
    }, poolSize);
    return pool;
}

async function recreateTestTable() {
    //alter database unit_tests SET client_min_messages TO WARNING;

    let pool = createPool(1);

    await execSync(pool, `
        drop table if exists table1;
    `);
    await execSync(pool, `
        create table table1(
            id serial primary key,
            hash bytea not null,
            state integer,
            locked_by_id integer,
            created_at integer not null,
            expires_at bigint
        );
    `);
    await execSync(pool, `
        create unique index ix_table1_hashes on table1(hash);
    `);
    await execSync(pool, `
        create index ix_table1_expires_at on table1(expires_at);
    `);
    await execSync(pool, `
        drop table if exists table2;
    `);
    await execSync(pool, `
        create table table2(
            id serial primary key,
            text_val text not null,
            double_val double precision,
            boolean_val boolean
        );
    `);
}

unit.test("pg_test: tables", async () => {
    await recreateTestTable();
    let pool = createPool(4);

    let resolver;
    let promise = new Promise((resolve, reject) => {
        resolver = resolve;
    });
    let counter = 0;
    let counter_max = 100;

    let t0 = new Date().getTime();
    for (let i = 0; i < counter_max; ++i) {
        pool.withConnection(con => {
            con.executeUpdate(affectedRows => {
                    assertSilent(affectedRows === 1);
                    ++counter;
                    if (counter % 1000 == 0)
                        console.log("counter=" + counter);
                    if (counter >= counter_max)
                        resolver();
                }, e => {
                    throw Error(e);
                }, "INSERT INTO table1(hash,state,locked_by_id,created_at,expires_at) VALUES ($1, $2, 0, $3, $4)",
                crypto.HashId.of(randomBytes(16)).digest, 4, 5, 6,
            );
        });
    }

    await promise;
    let dt = new Date().getTime() - t0;
    //console.log("dt = " + dt + " ms");
});

unit.test("performance: insert line-by-line vs multi insert", async () => {
    let ROWS_COUNT = 1000;
    let BUF_SIZE = 20;
    let testResult = "";
    let pool = createPool(4);
    let readyCounter = 0;
    let resolver;
    let promise = new Promise((resolve, reject) => {
        resolver = resolve;
    });

    let hashes = [];
    for (let i = 0; i < ROWS_COUNT; ++i)
        hashes.push(crypto.HashId.of(randomBytes(16)).digest);

    await recreateTestTable()
    let t0 = new Date().getTime();
    for (let i = 0; i < ROWS_COUNT; ++i) {
        pool.withConnection(con => {
            con.executeUpdate(affectedRows => {
                readyCounter += 1;
                if (readyCounter >= ROWS_COUNT)
                    resolver();
            }, e => {
                throw Error(e);
            }, "INSERT INTO table1(hash,state,locked_by_id,created_at,expires_at) VALUES (?, ?, 0, ?, ?)",
            hashes[i], 4, (new Date().getTime()/1000).toFixed(0),
            (new Date().getTime()/1000 + 31536000).toFixed(0));
        });
    }
    await promise;
    let dt = new Date().getTime() - t0;
    testResult += "line by line: " + dt + " ms";

    await recreateTestTable();
    readyCounter = 0;
    promise = new Promise((resolve, reject) => {
        resolver = resolve;
    });

    let t1 = new Date().getTime();
    for (let i = 0; i < ROWS_COUNT/BUF_SIZE; ++i) {
        pool.withConnection(con => {
            let query = "INSERT INTO table1(hash,state,locked_by_id,created_at,expires_at) VALUES ";
            let params = [];
            for (let j = 0; j < BUF_SIZE; ++j) {
                let buf = "(?,?,0,?,?)";
                params.push(hashes[i*BUF_SIZE+j]);
                params.push(4);
                params.push((new Date().getTime()/1000).toFixed(0));
                params.push((new Date().getTime()/1000 + 31536000).toFixed(0));
                if (j > 0)
                    query += ",";
                query += buf;
            }
            query += " RETURNING id;";
            con.executeUpdate(affectedRows => {
                readyCounter += affectedRows;
                if (readyCounter >= ROWS_COUNT)
                    resolver();
            }, e => {
                throw Error(e);
            }, query, ...params);
        });
    }
    await promise;
    dt = new Date().getTime() - t1;
    testResult += ", multi insert: " + dt + " ms ...";

    console.logPut(testResult);
});
