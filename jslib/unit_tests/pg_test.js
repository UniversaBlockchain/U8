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
                    con.release();
                    resolver();
                }, (e) => {
                    console.error("con.executeQuery.onError: " + e);
                    con.release();
                    resolver();
                }, "SELECT 1 AS one, 2::bigint AS two, 3 AS three, 'some text' AS text, $1, $2, $3, $4, $5;", 1, 2.333e+170, 3, 4.34, "ololo");
            });
            await promise;
        }

        pool.close();

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
                con.release();
                resolver();
            },
            e => {
                console.error(e);
                con.release();
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

    pool.close();
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
                    con.release();
                    if (counter >= counter_max)
                        resolver();
                }, e => {
                    con.release();
                    throw Error(e);
                }, "INSERT INTO table1(hash,state,locked_by_id,created_at,expires_at) VALUES ($1, $2, 0, $3, $4)",
                crypto.HashId.of(randomBytes(16)).digest, 4, 5, 6,
            );
        });
    }

    await promise;
    let dt = new Date().getTime() - t0;
    //console.log("dt = " + dt + " ms");
    pool.close();
});

unit.test("insert and get new id", async () => {
    await recreateTestTable();
    let pool = createPool(4);

    for (let i = 0; i < 10; ++i) {
        let resolver;
        let promise = new Promise((resolve, reject) => {
            resolver = resolve;
        });

        pool.withConnection(con => {
            con.executeQuery(r => {
                    assert(r.getRows(1)[0] == i+1);
                    resolver();
                    con.release();
                },
                e => {
                    con.release();
                    throw Error(e);
                }, "INSERT INTO table1(hash,state,locked_by_id,created_at,expires_at) VALUES ($1, $2, 0, $3, $4) RETURNING id;",
                crypto.HashId.of(randomBytes(16)).digest, 4, (new Date().getTime()/1000).toFixed(0),
                (new Date().getTime()/1000 + 31536000).toFixed(0));
        });
        await promise;
    }
    pool.close();
});

unit.test("insert, select and update bytea", async () => {
    await recreateTestTable();
    let pool = createPool(4);
    let hashId1 = crypto.HashId.of(randomBytes(16));
    let hashId2 = crypto.HashId.of(randomBytes(16));
    let rowId = 0;

    // insert hashId1
    let resolver;
    let promise = new Promise((resolve, reject) => {resolver = resolve;});
    pool.withConnection(con => {
        con.executeQuery(r => {
                rowId = parseInt(r.getRows(1)[0]);
                assert(rowId === 1);
                resolver();
                con.release();
            },
            e => {
                con.release();
                throw Error(e);
            },
            "INSERT INTO table1(hash,state,locked_by_id,created_at,expires_at) VALUES (?,?,0,?,?) RETURNING id;",
            hashId1.digest,
            4,
            (new Date().getTime()/1000).toFixed(0),
            (new Date().getTime()/1000 + 31536000).toFixed(0));
    });
    await promise;

    // select it and check
    promise = new Promise((resolve, reject) => {resolver = resolve;});
    pool.withConnection(con => {
        con.executeQuery(r => {
            assert(r.getRowsCount() === 1);
            let hashId1FromDb = crypto.HashId.withDigest(r.getRows(1)[0][0]);
            // console.log();
            // console.log(hashId1.base64);
            // console.log(hashId1FromDb.base64);
            assert(hashId1FromDb.equals(hashId1));
            resolver();
            con.release();
        },
        e => {
            con.release();
            throw Error(e);
        },
        "SELECT hash FROM table1 WHERE id=? LIMIT 1;",
        rowId);
    });
    await promise;

    // update to hashId2
    promise = new Promise((resolve, reject) => {resolver = resolve;});
    pool.withConnection(con => {
        con.executeUpdate(affectedRows => {
            assert(affectedRows === 1);
            resolver();
            con.release();
        }, e => {
            con.release();
            throw Error(e);
        },
        "UPDATE table1 SET hash=? WHERE id=?;",
        hashId2.digest, rowId);
    });
    await promise;

    // select it and check, now database should store hashId2
    promise = new Promise((resolve, reject) => {resolver = resolve;});
    pool.withConnection(con => {
        con.executeQuery(r => {
                assert(r.getRowsCount() === 1);
                let hashId2FromDb = crypto.HashId.withDigest(r.getRows(1)[0][0]);
                // console.log();
                // console.log(hashId2.base64);
                // console.log(hashId2FromDb.base64);
                assert(hashId2FromDb.equals(hashId2));
                resolver();
                con.release();
            },
            e => {
                con.release();
                throw Error(e);
            },
            "SELECT hash FROM table1 WHERE id=? LIMIT 1;",
            rowId);
    });
    await promise;
    pool.close();
});

unit.test("insert, select and update integer and bigint", async () => {
    await recreateTestTable();
    let pool = createPool(4);
    let created_at_1 = Number((new Date().getTime()/1000).toFixed(0));
    let expires_at_1 = BigInt(created_at_1) + BigInt(Number.MAX_SAFE_INTEGER)*2n;
    let created_at_2 = created_at_1 + 1000;
    let expires_at_2 = BigInt(created_at_2) + BigInt(Number.MAX_SAFE_INTEGER)*2n + 9100000000000n;
    let rowId = 0;
    assert(typeof created_at_1 === "number");
    assert(typeof expires_at_1 === "bigint");

    // insert created_at_1 and expires_at_1
    let resolver;
    let promise = new Promise((resolve, reject) => {resolver = resolve;});
    pool.withConnection(con => {
        con.executeQuery(r => {
                rowId = parseInt(r.getRows(1)[0]);
                assert(rowId === 1);
                resolver();
                con.release();
            },
            e => {
                con.release();
                throw Error(e);
            },
            "INSERT INTO table1(hash,state,locked_by_id,created_at,expires_at) VALUES (?, ?, 0, ?, ?) RETURNING id;",
            crypto.HashId.of(randomBytes(16)).digest,
            4,
            created_at_1,
            expires_at_1);
    });
    await promise;

    // select and check
    promise = new Promise((resolve, reject) => {resolver = resolve;});
    pool.withConnection(con => {
        con.executeQuery(r => {
                assert(r.getRowsCount() === 1);
                let row = r.getRows(1)[0];
                assert(row[0] === created_at_1);
                assert(row[1] === expires_at_1);
                let names = r.getColNames();
                assert(names[0] === "field1");
                assert(names[1] === "field2");
                let types = r.getColTypes();
                assert(types[0] === "int4");
                assert(types[1] === "int8");
                resolver();
                con.release();
            },
            e => {
                con.release();
                throw Error(e);
            },
            "SELECT created_at AS field1, expires_at AS field2 FROM table1 WHERE id=? LIMIT 1;",
            rowId);
    });
    await promise;

    // update to created_at_2 and expires_at_2
    promise = new Promise((resolve, reject) => {resolver = resolve;});
    pool.withConnection(con => {
        con.executeUpdate(affectedRows => {
                assert(affectedRows === 1);
                resolver();
                con.release();
            }, e => {
                con.release();
                throw Error(e);
            },
            "UPDATE table1 SET created_at=?, expires_at=? WHERE id=?;",
            created_at_2, expires_at_2, rowId);
    });
    await promise;

    // select and check
    promise = new Promise((resolve, reject) => {resolver = resolve;});
    pool.withConnection(con => {
        con.executeQuery(r => {
                assert(r.getRowsCount() === 1);
                let row = r.getRows(1)[0];
                assert(row[0] === created_at_2);
                assert(row[1] === expires_at_2);
                resolver();
                con.release();
            },
            e => {
                con.release();
                throw Error(e);
            },
            "SELECT created_at AS field1, expires_at AS field2 FROM table1 WHERE id=? LIMIT 1;",
            rowId);
    });
    await promise;
    pool.close();
});

unit.test("insert, select and update text, boolean, double", async () => {
    await recreateTestTable();
    let pool = createPool(4);
    let text1 = "text value 1";
    let text2 = "text value 222";
    let bool1 = true;
    let bool2 = false;
    let double1 = 1.23456789e+100;
    let double2 = 1.23456789e+120;
    let rowId = 0;

    // insert text1, bool1, double1
    let resolver;
    let promise = new Promise((resolve, reject) => {resolver = resolve;});
    pool.withConnection(con => {
        con.executeQuery(r => {
                rowId = parseInt(r.getRows(1)[0]);
                assert(rowId === 1);
                resolver();
                con.release();
            },
            e => {
                con.release();
                throw Error(e);
            },
            "INSERT INTO table2(text_val, boolean_val, double_val) VALUES (?,?,?) RETURNING id;",
            text1, bool1, double1
        );
    });
    await promise;

    // select and check
    promise = new Promise((resolve, reject) => {resolver = resolve;});
    pool.withConnection(con => {
        con.executeQuery(r => {
                assert(r.getRowsCount() === 1);
                let row = r.getRows(1)[0];
                assert(row[0] === text1);
                assert(row[1] === bool1);
                assert(row[2] === double1);
                let types = r.getColTypes();
                assert(types[0] === "text");
                assert(types[1] === "bool");
                assert(types[2] === "float8");
                resolver();
                con.release();
            },
            e => {
                con.release();
                throw Error(e);
            },
            "SELECT text_val, boolean_val, double_val FROM table2 WHERE id=? LIMIT 1;",
            rowId);
    });
    await promise;

    // update to text2, bool2, double2
    promise = new Promise((resolve, reject) => {resolver = resolve;});
    pool.withConnection(con => {
        con.executeUpdate(affectedRows => {
                assert(affectedRows === 1);
                resolver();
                con.release();
            }, e => {
                con.release();
                throw Error(e);
            },
            "UPDATE table2 SET text_val=?, boolean_val=?, double_val=? WHERE id=?;",
            text2, bool2, double2, rowId
        );
    });
    await promise;

    // select and check
    promise = new Promise((resolve, reject) => {resolver = resolve;});
    pool.withConnection(con => {
        con.executeQuery(r => {
                assert(r.getRowsCount() === 1);
                let row = r.getRows(1)[0];
                assert(row[0] === text2);
                assert(row[1] === bool2);
                assert(row[2] === double2);
                let types = r.getColTypes();
                assert(types[0] === "text");
                assert(types[1] === "bool");
                assert(types[2] === "float8");
                resolver();
                con.release();
            },
            e => {
                con.release();
                throw Error(e);
            },
            "SELECT text_val, boolean_val, double_val FROM table2 WHERE id=? LIMIT 1;",
            rowId);
    });
    await promise;
    pool.close();
});

unit.test("performance: insert line-by-line vs multi insert", async () => {
    let ROWS_COUNT = 400;
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
                    con.release();
                if (readyCounter >= ROWS_COUNT)
                    resolver();
            }, e => {
                    con.release();
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
                con.release();
                if (readyCounter >= ROWS_COUNT)
                    resolver();
            }, e => {
                con.release();
                throw Error(e);
            }, query, ...params);
        });
    }
    await promise;
    dt = new Date().getTime() - t1;
    testResult += ", multi insert: " + dt + " ms ...";

    console.logPut(testResult);
    pool.close();
});

unit.test("performance: select line-by-line vs array in 'where'", async () => {
    let ROWS_COUNT = 5000;
    let INSERT_BUF_SIZE = 20;
    let SELECTS_COUNT = ROWS_COUNT/10;
    let SELECTS_BUF_SIZE = 20;
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
    for (let i = 0; i < ROWS_COUNT/INSERT_BUF_SIZE; ++i) {
        pool.withConnection(con => {
            let query = "INSERT INTO table1(hash,state,locked_by_id,created_at,expires_at) VALUES ";
            let params = [];
            for (let j = 0; j < INSERT_BUF_SIZE; ++j) {
                let buf = "(?,?,0,?,?)";
                params.push(hashes[i*INSERT_BUF_SIZE+j]);
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
                con.release();
                if (readyCounter >= ROWS_COUNT)
                    resolver();
            }, e => {
                con.release();
                throw Error(e);
            }, query, ...params);
        });
    }
    await promise;

    readyCounter = 0;
    promise = new Promise((resolve, reject) => {resolver = resolve;});

    let t0 = new Date().getTime();
    for (let i = 0; i < SELECTS_COUNT; ++i) {
        pool.withConnection(con => {
            con.executeQuery(r => {
                readyCounter += 1;
                con.release();
                if (readyCounter >= SELECTS_COUNT)
                    resolver();
            }, e => {
                con.release();
                throw Error(e);
            }, "SELECT state FROM table1 WHERE hash=$1 LIMIT 1", hashes[Math.floor(Math.random() * ROWS_COUNT)]);
        });
    }
    await promise;
    let dt = new Date().getTime() - t0;
    testResult += "many single selects: " + dt + " ms";

    readyCounter = 0;
    promise = new Promise((resolve, reject) => {resolver = resolve;});
    let t1 = new Date().getTime();
    for (let i = 0; i < SELECTS_COUNT/SELECTS_BUF_SIZE; ++i) {
        pool.withConnection(con => {
            let queryArray = "(";
            let params = [];
            for (let j = 1; j <= SELECTS_BUF_SIZE; ++j) {
                params.push(hashes[Math.floor(Math.random() * ROWS_COUNT)]);
                queryArray += "?";
                if (j != SELECTS_BUF_SIZE)
                    queryArray += ",";
            }
            queryArray += ")";
            con.executeQuery(r => {
                readyCounter += SELECTS_BUF_SIZE;
                con.release();
                if (readyCounter >= SELECTS_COUNT)
                    resolver();
            }, e => {
                con.release();
                throw Error(e);
            }, "SELECT state FROM table1 WHERE hash IN "+queryArray+" LIMIT "+SELECTS_BUF_SIZE, ...params);
        });
    }
    await promise;
    dt = new Date().getTime() - t1;
    testResult += ", batch selects: " + dt + " ms ...";

    console.logPut(testResult);
    pool.close();
});

unit.test("performance: multithreading", async () => {
    let ROWS_COUNT = 1000;
    let INSERT_BUF_SIZE = 100;
    let SELECTS_COUNT = ROWS_COUNT/50;
    let SELECTS_BUF_SIZE = 2;
    let testResult = "";
    let pool = createPool(10);
    let readyCounter = 0;
    let resolver;
    let promise = new Promise((resolve, reject) => {
        resolver = resolve;
    });

    let hashes = [];
    for (let i = 0; i < ROWS_COUNT; ++i)
        hashes.push(crypto.HashId.of(randomBytes(16)).digest);
    for (let i = 0; i < ROWS_COUNT/INSERT_BUF_SIZE; ++i) {
        pool.withConnection(con => {
            let query = "INSERT INTO table1(hash,state,locked_by_id,created_at,expires_at) VALUES ";
            let params = [];
            for (let j = 0; j < INSERT_BUF_SIZE; ++j) {
                let buf = "(?,?,0,?,?)";
                params.push(hashes[i*INSERT_BUF_SIZE+j]);
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
                con.release();
                if (readyCounter >= ROWS_COUNT)
                    resolver();
            }, e => {
                con.release();
                throw Error(e);
            }, query, ...params);
        });
    }
    await promise;

    readyCounter = 0;
    promise = new Promise((resolve, reject) => {resolver = resolve;});
    let t1 = new Date().getTime();
    for (let i = 0; i < SELECTS_COUNT/SELECTS_BUF_SIZE; ++i) {
        pool.withConnection(con => {
            let queryArray = "(";
            let params = [];
            for (let j = 1; j <= SELECTS_BUF_SIZE; ++j) {
                params.push(hashes[Math.floor(Math.random() * ROWS_COUNT)]);
                queryArray += "?";
                if (j != SELECTS_BUF_SIZE)
                    queryArray += ",";
            }
            queryArray += ")";
            con.executeQuery(r => {
                readyCounter += SELECTS_BUF_SIZE;
                con.release();
                if (readyCounter >= SELECTS_COUNT)
                    resolver();
            }, e => {
                con.release();
                throw Error(e);
            }, "SELECT state FROM table1, pg_sleep(0.3) WHERE hash IN "+queryArray+" LIMIT "+SELECTS_BUF_SIZE, ...params);
        });
    }
    await promise;
    let dt = new Date().getTime() - t1;
    testResult += ", total time: " + dt + " ms ...";
    console.logPut(testResult);
    assert(dt > 300*0.8);
    assert(dt < 300*1.2);
    pool.close();
});

/*unit.test("check pg connections restore, needs to run it manually", async () => {
    // For success testing, restart pg daemon manually several times during this test running.
    // If all requests completed, the test should finish.
    // If some request have lost - the test will hangs.
    console.log();
    let ROWS_COUNT = 400;
    let INSERT_BUF_SIZE = 20;
    let SELECTS_COUNT = ROWS_COUNT;
    let testResult = "";
    let pool = createPool(10);
    let readyCounter = 0;
    let resolver;
    let promise = new Promise((resolve, reject) => {
        resolver = resolve;
    });

    let hashes = [];
    for (let i = 0; i < ROWS_COUNT; ++i)
        hashes.push(crypto.HashId.of(randomBytes(16)).digest);
    for (let i = 0; i < ROWS_COUNT/INSERT_BUF_SIZE; ++i) {
        pool.withConnection(con => {
            let query = "INSERT INTO table1(hash,state,locked_by_id,created_at,expires_at) VALUES ";
            let params = [];
            for (let j = 0; j < INSERT_BUF_SIZE; ++j) {
                let buf = "(?,?,0,?,?)";
                params.push(hashes[i*INSERT_BUF_SIZE+j]);
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
                con.release();
                if (readyCounter >= ROWS_COUNT)
                    resolver();
            }, async e => {
                con.release();
                throw Error(e);
            }, query, ...params);
        });
    }
    await promise;

    readyCounter = 0;
    promise = new Promise((resolve, reject) => {resolver = resolve;});

    let funcSelect = function(hashId) {
        pool.withConnection(async con => {
            con.executeQuery(r => {
                readyCounter += 1;
                con.release();
                console.log("readyCounter="+readyCounter+"/"+SELECTS_COUNT);
                if (readyCounter >= SELECTS_COUNT)
                    resolver();
            }, async e => {
                con.release();
                await sleep(2000);
                console.log("repeat select...")
                funcSelect(hashId);
            }, "SELECT state FROM table1, pg_sleep(1) WHERE hash=? LIMIT 1", hashId);
        });
    }

    let t0 = new Date().getTime();
    for (let i = 0; i < SELECTS_COUNT; ++i) {
        if (Math.floor(i/10) % 10 == 0) {
            while (readyCounter < i)
                await sleep(100);
            if (i % 10 == 0)
                console.log("low load period started")
            if (i % 10 == 9)
                console.log("high load period started")
        }
        funcSelect(hashes[Math.floor(Math.random() * ROWS_COUNT)]);
    }
    await promise;
    let dt = new Date().getTime() - t0;
    testResult += "many single selects: " + dt + " ms ...";

    console.logPut(testResult);
    pool.close();
});*/
