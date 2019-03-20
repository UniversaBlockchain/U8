import {expect, unit, assert} from 'test'
import * as db from 'pg_driver'

unit.test("pg_test: hello", async () => {
    try {
        let a = 1;
        let b = 2;
        let c = a + b;
        assert(c == 3);

        let pool;

        db.connect("host=localhost port=5432 dbname=unit_tests", (dbPool) => {
            // console.log("onConnected, totalConnections=" + dbPool.totalConnections() +
            //     ", availableConnections="+dbPool.availableConnections());
            pool = dbPool;
        }, (e) => {
            throw Error("db.connect.onError: " + e);
        }, 8);

        for (let i = 0; i < 1000; ++i) {
            let resolver;
            let promise = new Promise((resolve, reject) => {
                resolver = resolve;
            });
            pool.withConnection((con) => {
                //console.log("withConnection.callback: con=" + con + ", availableConnections=" + pool.availableConnections());
                resolver();
            });
            await promise;
        }

    } catch (err) {
        console.log("error: "+err.constructor.name+"('" + err.message + "')");
    }
});
