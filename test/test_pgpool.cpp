//
// Created by Leonid Novikov on 3/4/19.
//

#include <iostream>
#include <postgresql/libpq-fe.h>
#include <atomic>
#include <tomcrypt.h>
#include "catch2.h"
#include "../db/PGPool.h"
#include "../tools/Semaphore.h"
#include "../crypto/base64.h"
#include "../crypto/HashId.h"

using namespace std;
using namespace crypto;

void recreateTestTable() {
    //alter database unit_tests SET client_min_messages TO WARNING;
    db::PGPool pgPool(1, "host=localhost port=5432 dbname=unit_tests");
    Semaphore sem;
    pgPool.exec("drop table if exists table1;"
                "create table table1("
                "    id serial primary key,"
                "    hash bytea not null,"
                "    state integer,"
                "    locked_by_id integer,"
                "    created_at integer not null,"
                "    expires_at bigint"
                ");"
                ""
                "create unique index ix_table1_hashes on table1(hash);"
                "create index ix_table1_expires_at on table1(expires_at);"
                ""
                "drop table if exists table2;"
                "create table table2("
                "    id serial primary key,"
                "    text_val text not null,"
                "    double_val double precision,"
                "    boolean_val boolean"
                ");"
                ,[&sem](db::QueryResultsArr &qra) {
        for (auto &qr : qra)
            if (qr.isError())
                cout << "error(" << qr.getErrorCode() << "): " << qr.getErrorText() << endl;
        sem.notify();
    });
    sem.wait();
}

TEST_CASE("PGPool") {
    recreateTestTable();
    db::PGPool pgPool(4, "host=localhost port=5432 dbname=unit_tests");

    SECTION("hello world") {
        const int TEST_QUERIES_COUNT = 100;
        Semaphore sem;
        atomic<int> readyCounter(0);
        for (int i = 0; i < TEST_QUERIES_COUNT; ++i) {
            // insert with pgPool.exec()
            vector<unsigned char> rndBytes(16);
            sprng_read(&rndBytes[0], 16, NULL);
            auto b64 = base64_encode(rndBytes);
            pgPool.exec(
                    string("INSERT INTO table1(hash,state,locked_by_id,created_at,expires_at) VALUES (decode('") + b64 +
                    string("', 'base64'), 4, 0, 33, 44);"), [&sem, &readyCounter](db::QueryResultsArr &qra) {
                        if (qra[0].isError())
                            throw std::runtime_error("error: " + string(qra[0].getErrorText()));
                        ++readyCounter;
                        sem.notify();
                    });

            // insert with pgPool.execParams()
            pgPool.execParams(
                    "INSERT INTO table1(hash,state,locked_by_id,created_at,expires_at) VALUES ($1, $2, 0, $3, $4)",
                    [&sem, &readyCounter](db::QueryResultsArr &qra) {
                        if (qra[0].isError())
                            throw std::runtime_error("error: " + string(qra[0].getErrorText()));
                        ++readyCounter;
                        sem.notify();
                    }, HashId::createRandom().getDigest(), "4", getCurrentTimeMillis() / 1000,
                    getCurrentTimeMillis() / 1000 + 31536000);

            // insert with pgPool.execParamsArr()
            vector<any> params(
                    {HashId::createRandom().getDigest(), "4", getCurrentTimeMillis() / 1000,
                     getCurrentTimeMillis() / 1000 + 31536000});
            pgPool.execParamsArr(
                    "INSERT INTO table1(hash,state,locked_by_id,created_at,expires_at) VALUES ($1, $2, 0, $3, $4)",
                    [&sem, &readyCounter](db::QueryResultsArr &qra) {
                        if (qra[0].isError())
                            throw std::runtime_error("error: " + string(qra[0].getErrorText()));
                        ++readyCounter;
                        sem.notify();
                    }, params);
        }

        do {
            sem.wait();
            int counterState = int(readyCounter);
            if (counterState % 100 == 0)
                cout << "readyCounter: " << counterState << endl;
        } while (readyCounter < TEST_QUERIES_COUNT * 3);
        REQUIRE(readyCounter == TEST_QUERIES_COUNT * 3);

        Semaphore sem2;
        pgPool.execParams("SELECT id, state FROM table1 WHERE id>$1 ORDER BY id ASC LIMIT 3;",
                          [&sem2](db::QueryResultsArr &qra) {
                              if (qra[0].isError())
                                  throw std::runtime_error("error: " + string(qra[0].getErrorText()));
                              REQUIRE(qra[0].getRowsCount() == 3);
                              REQUIRE(bytesToString(qra[0].getValueByIndex(0, 0)) == to_string(8));
                              REQUIRE(bytesToString(qra[0].getValueByIndex(1, 0)) == to_string(9));
                              REQUIRE(bytesToString(qra[0].getValueByIndex(2, 0)) == to_string(10));
                              sem2.notify();
                          }, "7");

        sem2.wait();
    }

    SECTION("insert and get new id") {
        Semaphore sem;
        for (int i = 0; i < 10; ++i) {
            pgPool.execParams(
                    "INSERT INTO table1(hash,state,locked_by_id,created_at,expires_at) VALUES ($1, $2, 0, $3, $4) RETURNING id;",
                    [&sem,i](db::QueryResultsArr &qra) {
                        if (qra[0].isError())
                            throw std::runtime_error("error: " + string(qra[0].getErrorText()));
                        int newId = stoi(bytesToString(qra[0].getValueByIndex(0, 0)));
                        REQUIRE(newId == i+1);
                        sem.notify();
                    }, HashId::createRandom().getDigest(), "4", getCurrentTimeMillis() / 1000,
                    getCurrentTimeMillis() / 1000 + 31536000);
            sem.wait();
        }
    }

    SECTION("insert, select and update bytea") {
        Semaphore sem;
        HashId hashId1 = HashId::createRandom();
        HashId hashId2 = HashId::createRandom();
        int rowId = 0;

        // insert hashId1
        pgPool.execParams(
                "INSERT INTO table1(hash,state,locked_by_id,created_at,expires_at) VALUES ($1, $2, 0, $3, $4) RETURNING id;",
                [&sem,&rowId](db::QueryResultsArr &qra) {
                    if (qra[0].isError())
                        throw std::runtime_error("error: " + string(qra[0].getErrorText()));
                    int newId = stoi(bytesToString(qra[0].getValueByIndex(0, 0)));
                    rowId = newId;
                    REQUIRE(rowId == 1);
                    sem.notify();
                }, hashId1.getDigest(), "4", getCurrentTimeMillis() / 1000,
                getCurrentTimeMillis() / 1000 + 31536000);
        sem.wait();

        // select it and check
        pgPool.execParams(
                "SELECT encode(hash,'base64') FROM table1 WHERE id=$1 LIMIT 1;",
                [&sem,rowId,hashId1](db::QueryResultsArr &qra) {
                    if (qra[0].isError())
                        throw std::runtime_error("error: " + string(qra[0].getErrorText()));
                    REQUIRE(qra[0].getRowsCount() == 1);
                    auto hashId1FromDb = HashId::withDigest(base64_decodeToBytes(db::bytesToStringLine(qra[0].getValueByIndex(0, 0))));
                    REQUIRE(hashId1 == hashId1FromDb);
                    sem.notify();
                }, rowId);
        sem.wait();

        // update to hashId2
        pgPool.execParams(
                "UPDATE table1 SET hash=$1 WHERE id=$2;",
                [&sem](db::QueryResultsArr &qra) {
                    if (qra[0].isError())
                        throw std::runtime_error("error: " + string(qra[0].getErrorText()));
                    REQUIRE(qra[0].getRowsCount() == 0);
                    sem.notify();
                }, hashId2.getDigest(), rowId);
        sem.wait();

        // select it and check, now database should store hashId2
        pgPool.execParams(
                "SELECT encode(hash,'base64') FROM table1 WHERE id=$1 LIMIT 1;",
                [&sem,rowId,hashId2](db::QueryResultsArr &qra) {
                    if (qra[0].isError())
                        throw std::runtime_error("error: " + string(qra[0].getErrorText()));
                    REQUIRE(qra[0].getRowsCount() == 1);
                    auto hashId2FromDb = HashId::withDigest(base64_decodeToBytes(db::bytesToStringLine(qra[0].getValueByIndex(0, 0))));
                    REQUIRE(hashId2 == hashId2FromDb);
                    sem.notify();
                }, rowId);
        sem.wait();
    }

    SECTION("insert, select and update integer and bigint") {
        Semaphore sem;
        int created_at_1 = getCurrentTimeMillis()/1000;
        long expires_at_1 = long(created_at_1) + 9000000000000l;
        int created_at_2 = created_at_1 + 1000;
        long expires_at_2 = long(created_at_2) + 9100000000000l;
        int rowId = 0;

        // insert created_at_1 and expires_at_1
        pgPool.execParams(
                "INSERT INTO table1(hash,state,locked_by_id,created_at,expires_at) VALUES ($1, $2, 0, $3, $4) RETURNING id;",
                [&sem,&rowId](db::QueryResultsArr &qra) {
                    if (qra[0].isError())
                        throw std::runtime_error("error: " + string(qra[0].getErrorText()));
                    int newId = stoi(bytesToString(qra[0].getValueByIndex(0, 0)));
                    rowId = newId;
                    REQUIRE(rowId == 1);
                    sem.notify();
                }, HashId::createRandom().getDigest(), "4", created_at_1, expires_at_1);
        sem.wait();

        // select and check
        pgPool.execParams(
                "SELECT created_at AS field1, expires_at AS field2 FROM table1 WHERE id=$1 LIMIT 1;",
                [&sem,rowId,created_at_1,expires_at_1](db::QueryResultsArr &qra) {
                    if (qra[0].isError())
                        throw std::runtime_error("error: " + string(qra[0].getErrorText()));
                    REQUIRE(qra[0].getRowsCount() == 1);
                    auto field1 = stoi(bytesToString(qra[0].getValueByName(0, "field1")));
                    auto field2 = stol(bytesToString(qra[0].getValueByName(0, "field2")));
                    REQUIRE(field1 == created_at_1);
                    REQUIRE(field2 == expires_at_1);
                    sem.notify();
                }, rowId);
        sem.wait();

        // update to created_at_2 and expires_at_2
        pgPool.execParams(
                "UPDATE table1 SET created_at=$1, expires_at=$2 WHERE id=$3;",
                [&sem](db::QueryResultsArr &qra) {
                    if (qra[0].isError())
                        throw std::runtime_error("error: " + string(qra[0].getErrorText()));
                    REQUIRE(qra[0].getRowsCount() == 0);
                    sem.notify();
                }, created_at_2, expires_at_2, rowId);
        sem.wait();

        // select and check
        pgPool.execParams(
                "SELECT created_at AS field1, expires_at AS field2 FROM table1 WHERE id=$1 LIMIT 1;",
                [&sem,rowId,created_at_2,expires_at_2](db::QueryResultsArr &qra) {
                    if (qra[0].isError())
                        throw std::runtime_error("error: " + string(qra[0].getErrorText()));
                    REQUIRE(qra[0].getRowsCount() == 1);
                    auto field1 = stoi(bytesToString(qra[0].getValueByName(0, "field1")));
                    auto field2 = stol(bytesToString(qra[0].getValueByName(0, "field2")));
                    REQUIRE(field1 == created_at_2);
                    REQUIRE(field2 == expires_at_2);
                    sem.notify();
                }, rowId);
        sem.wait();
    }

    SECTION("insert, select and update text, boolean, double") {
        Semaphore sem;
        string text1 = "text value 1";
        string text2 = "text value 222";
        bool bool1 = true;
        bool bool2 = false;
        double double1 = 1.23456789e+100;
        double double2 = 1.23456789e+120;
        int rowId = 0;

        // insert text1, bool1, double1
        pgPool.execParams(
                "INSERT INTO table2(text_val, boolean_val, double_val) VALUES ($1, $2, $3) RETURNING id;",
                [&sem,&rowId](db::QueryResultsArr &qra) {
                    if (qra[0].isError())
                        throw std::runtime_error("error: " + string(qra[0].getErrorText()));
                    int newId = stoi(bytesToString(qra[0].getValueByIndex(0, 0)));
                    rowId = newId;
                    REQUIRE(rowId == 1);
                    sem.notify();
                }, text1, bool1, double1);
        sem.wait();

        // select and check
        pgPool.execParams(
                "SELECT text_val, boolean_val, double_val FROM table2 WHERE id=$1 LIMIT 1;",
                [&sem,rowId,text1,bool1,double1](db::QueryResultsArr &qra) {
                    if (qra[0].isError())
                        throw std::runtime_error("error: " + string(qra[0].getErrorText()));
                    REQUIRE(qra[0].getRowsCount() == 1);
                    auto db_text_val = bytesToString(qra[0].getValueByIndex(0, 0));
                    auto db_boolean_val = bytesToString(qra[0].getValueByIndex(0, 1))=="t" ? true : false;
                    auto db_double_val = atof(bytesToString(qra[0].getValueByIndex(0, 2)).c_str());
                    REQUIRE(db_text_val == text1);
                    REQUIRE(db_boolean_val == bool1);
                    REQUIRE(db_double_val == double1);
                    sem.notify();
                }, rowId);
        sem.wait();

        // update to text2, bool2, double2
        pgPool.execParams(
                "UPDATE table2 SET text_val=$1, boolean_val=$2, double_val=$3 WHERE id=$4;",
                [&sem](db::QueryResultsArr &qra) {
                    if (qra[0].isError())
                        throw std::runtime_error("error: " + string(qra[0].getErrorText()));
                    REQUIRE(qra[0].getRowsCount() == 0);
                    sem.notify();
                }, text2, bool2, double2, rowId);
        sem.wait();

        // select and check
        pgPool.execParams(
                "SELECT text_val, boolean_val, double_val FROM table2 WHERE id=$1 LIMIT 1;",
                [&sem,rowId,text2,bool2,double2](db::QueryResultsArr &qra) {
                    if (qra[0].isError())
                        throw std::runtime_error("error: " + string(qra[0].getErrorText()));
                    REQUIRE(qra[0].getRowsCount() == 1);
                    auto db_text_val = bytesToString(qra[0].getValueByIndex(0, 0));
                    auto db_boolean_val = bytesToString(qra[0].getValueByIndex(0, 1))=="t" ? true : false;
                    auto db_double_val = atof(bytesToString(qra[0].getValueByIndex(0, 2)).c_str());
                    REQUIRE(db_text_val == text2);
                    REQUIRE(db_boolean_val == bool2);
                    REQUIRE(db_double_val == double2);
                    sem.notify();
                }, rowId);
        sem.wait();
    }

    SECTION("performance: insert line-by-line vs multi insert") {
        const int ROWS_COUNT = 10000;
        const int BUF_SIZE = 20;
        Semaphore sem;
        atomic<int> readyCounter(0);
        long t0 = getCurrentTimeMillis();
        for (int i = 0; i < ROWS_COUNT; ++i) {
            pgPool.execParams(
                    "INSERT INTO table1(hash,state,locked_by_id,created_at,expires_at) VALUES ($1, $2, 0, $3, $4)",
                    [&sem, &readyCounter](db::QueryResultsArr &qra) {
                        if (qra[0].isError())
                            throw std::runtime_error("error: " + string(qra[0].getErrorText()));
                        ++readyCounter;
                        sem.notify();
                    }, HashId::createRandom().getDigest(), "4", getCurrentTimeMillis() / 1000,
                    getCurrentTimeMillis() / 1000 + 31536000);
        }
        do {
            sem.wait();
            int counterState = int(readyCounter);
        } while (readyCounter < ROWS_COUNT);
        REQUIRE(readyCounter == ROWS_COUNT);
        cout << "insert line by line: " << getCurrentTimeMillis()-t0 << " ms" << endl;

        recreateTestTable();
        readyCounter = 0;

        long t1 = getCurrentTimeMillis();
        for (int i = 0; i < ROWS_COUNT/BUF_SIZE; ++i) {
            string query = "INSERT INTO table1(hash,state,locked_by_id,created_at,expires_at) VALUES ";
            vector<any> params;
            for (int j = 0; j < BUF_SIZE; ++j) {
                char buf[64];
                snprintf(buf, sizeof(buf), "($%i,$%i,0,$%i,$%i)", j*4+1, j*4+2, j*4+3, j*4+4);
                params.push_back(HashId::createRandom().getDigest());
                params.push_back("4");
                params.push_back(getCurrentTimeMillis() / 1000);
                params.push_back(getCurrentTimeMillis() / 1000 + 31536000);
                if (j > 0)
                    query += ",";
                query += buf;
            }
            query += " RETURNING id;";
            pgPool.execParamsArr(
                    query,
                    [&sem, &readyCounter, i](db::QueryResultsArr &qra) {
                        if (qra[0].isError())
                            throw std::runtime_error("error: " + string(qra[0].getErrorText()));
                        for (int k = 0; k < qra[0].getRowsCount(); ++k) {
                            int id = stoi(bytesToString(qra[0].getValueByIndex(k,0)));
                            //cout << "inserted id: " << id << endl;
                            ++readyCounter;
                        }
                        sem.notify();
                    }, params);
        }
        do {
            sem.wait();
            int counterState = int(readyCounter);
        } while (readyCounter < ROWS_COUNT);
        REQUIRE(readyCounter == ROWS_COUNT);
        cout << "multi insert: " << getCurrentTimeMillis()-t1 << " ms" << endl;
    }
}
