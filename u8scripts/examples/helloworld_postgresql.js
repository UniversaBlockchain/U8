/*
 * Copyright (c) 2019-present Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

import * as db from 'pg_driver'

async function main(args) {
    try {

        let pool = await new Promise((resolve,reject) =>
            db.connect("host=localhost port=5432 dbname=unit_tests", resolve, reject, 8));

        for (let i = 0; i < 1; ++i) {
            let resolver;
            let promise = new Promise((resolve, reject) => {
                resolver = resolve;
            });
            pool.withConnection((con) => {
                con.executeQuery((r) => {
                    console.log("con.executeQuery.onSuccess:");
                    console.log("  getRowsCount: " + r.getRowsCount());
                    console.log("  getColsCount: " + r.getColsCount());
                    console.log("  getAffectedRows: " + r.getAffectedRows());
                    console.log("  getColNames: " + r.getColNames());
                    console.log("  getColTypes: " + r.getColTypes());
                    console.log("  getRows: " + JSON.stringify(r.getRows(0), function(k,v){return (typeof v==='bigint')?v.toString()+"n":v;}));
                    con.release();
                    resolver();
                }, (e) => {
                    console.error("con.executeQuery.onError: " + e);
                    con.release();
                    resolver();
                }, "SELECT 1 AS one, 2::bigint AS two, 3 AS three, 'some text' AS text;");
            });
            await promise;
        }

        pool.close();

    } catch (err) {
        console.log("error: "+err.constructor.name+"('" + err.message + "')");
    }
}
