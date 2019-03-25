//
// Created by Leonid Novikov on 3/4/19.
//

#include <iostream>
#include <postgresql/libpq-fe.h>
#include <atomic>
#include <tomcrypt.h>
#include <random>
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
    db::PGPool pgPool;
    auto res = pgPool.connect(4, "host=localhost port=5432 dbname=unit_tests");
    if (!res.first)
        throw std::runtime_error(res.second);

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
            pgPool.withConnection([&sem,&readyCounter](db::BusyConnection&& con1) {
                db::BusyConnection con;
                con.moveFrom(move(con1));
                con.executeQuery(
                        [&sem, &readyCounter](db::QueryResult &&qr) {
                            ++readyCounter;
                            sem.notify();
                        },
                        [](const string &errText) {
                            throw std::runtime_error(errText);
                        },
                        "INSERT INTO table1(hash,state,locked_by_id,created_at,expires_at) VALUES ($1, $2, 0, $3, $4)",
                        HashId::createRandom().getDigest(), 4, (int) getCurrentTimeMillis() / 1000,
                        getCurrentTimeMillis() / 1000l + 31536000l);
            });

            // insert with pgPool.execParamsArr()
            pgPool.withConnection([&sem,&readyCounter](db::BusyConnection&& con) {
                vector<any> params(
                        {HashId::createRandom().getDigest(), 4, (int)getCurrentTimeMillis() / 1000,
                         getCurrentTimeMillis() / 1000l + 31536000l});
                con.executeQueryArr(
                        [&sem, &readyCounter](db::QueryResult &&qr) {
                            ++readyCounter;
                            sem.notify();
                        },
                        [](const string &errText) {
                            throw std::runtime_error(errText);
                        },
                        "INSERT INTO table1(hash,state,locked_by_id,created_at,expires_at) VALUES ($1, $2, 0, $3, $4)",
                        params);
            });
        }

        do {
            sem.wait();
            int counterState = int(readyCounter);
            if (counterState % 100 == 0)
                cout << "readyCounter: " << counterState << endl;
        } while (readyCounter < TEST_QUERIES_COUNT * 3);
        REQUIRE(readyCounter == TEST_QUERIES_COUNT * 3);

        Semaphore sem2;
        pgPool.withConnection([&sem2](db::BusyConnection&& con){
            con.executeQuery(
                    [&sem2](db::QueryResult &&qr) {
                        REQUIRE(qr.getRowsCount() == 3);
                        REQUIRE(db::getIntValue(qr.getValueByIndex(0, 0)) == 8);
                        REQUIRE(db::getIntValue(qr.getValueByIndex(1, 0)) == 9);
                        REQUIRE(db::getIntValue(qr.getValueByIndex(2, 0)) == 10);
                        int i = 0;
                        while(true) {
                            auto row = qr.getRows(1);
                            if (row.size() == 0)
                                break;
                            REQUIRE(db::getIntValue(row[0][0]) == 8+i);
                            ++i;
                        }
                        auto allRows = qr.getRows();
                        REQUIRE(db::getIntValue(allRows[0][0]) == 8);
                        REQUIRE(db::getIntValue(allRows[1][0]) == 9);
                        REQUIRE(db::getIntValue(allRows[2][0]) == 10);
                        sem2.notify();
                        auto colNames = qr.getColNames();
                        REQUIRE(colNames.size() == 2);
                        REQUIRE(colNames[0] == "id");
                        REQUIRE(colNames[1] == "state");
                    },
                    [](const string &errText) {
                        throw std::runtime_error(errText);
                    },
                    "SELECT id, state FROM table1 WHERE id>$1 ORDER BY id ASC LIMIT 3;",
                    7);
        });
        sem2.wait();
    }

    SECTION("insert and get new id") {
        Semaphore sem;
        for (int i = 0; i < 10; ++i) {
            pgPool.withConnection([&sem,i](db::BusyConnection&& con){
               con.executeQuery(
                       [&sem,i](db::QueryResult &&qr) {
                           int newId = db::getIntValue(qr.getValueByIndex(0, 0));
                           REQUIRE(newId == i+1);
                           sem.notify();
                       },
                       [](const string &errText) {
                           throw std::runtime_error(errText);
                       },
                       "INSERT INTO table1(hash,state,locked_by_id,created_at,expires_at) VALUES ($1, $2, 0, $3, $4) RETURNING id;",
                       HashId::createRandom().getDigest(),
                       4,
                       (int)getCurrentTimeMillis() / 1000,
                       getCurrentTimeMillis() / 1000l + 31536000l
               );
            });
            sem.wait();
        }
    }

    SECTION("insert, select and update bytea") {
        Semaphore sem;
        HashId hashId1 = HashId::createRandom();
        HashId hashId2 = HashId::createRandom();
        int rowId = 0;

        // insert hashId1
        pgPool.withConnection([&sem,&rowId,&hashId1](db::BusyConnection&& con){
           con.executeQuery(
               [&sem,&rowId](db::QueryResult &&qr) {
                   int newId = db::getIntValue(qr.getValueByIndex(0, 0));
                   rowId = newId;
                   REQUIRE(rowId == 1);
                   sem.notify();
               },
               [](const string &errText) {
                   throw std::runtime_error(errText);
               },
               "INSERT INTO table1(hash,state,locked_by_id,created_at,expires_at) VALUES ($1, $2, 0, $3, $4) RETURNING id;",
               hashId1.getDigest(),
               4,
               (int)getCurrentTimeMillis() / 1000,
               getCurrentTimeMillis() / 1000l + 31536000l
           );
        });
        sem.wait();

        // select it and check
        pgPool.withConnection([&sem,&hashId1,rowId](db::BusyConnection&& con) {
            con.executeQuery(
                    [&sem,&hashId1](db::QueryResult &&qr) {
                        REQUIRE(qr.getRowsCount() == 1);
                        auto hashId1FromDb = HashId::withDigest(qr.getValueByIndex(0, 0));
                        REQUIRE(hashId1 == hashId1FromDb);
                        sem.notify();
                    },
                    [](const string &errText) {
                        throw std::runtime_error(errText);
                    },
                    "SELECT hash FROM table1 WHERE id=$1 LIMIT 1;",
                    rowId
            );
        });
        sem.wait();

        // update to hashId2
        pgPool.withConnection([&sem,&hashId2,rowId](db::BusyConnection&& con) {
            con.executeUpdate(
                    [&sem](int affectedRows) {
                        REQUIRE(affectedRows == 1);
                        sem.notify();
                    },
                    [](const string &errText) {
                        throw std::runtime_error(errText);
                    },
                    "UPDATE table1 SET hash=$1 WHERE id=$2;",
                    hashId2.getDigest(), rowId
            );
        });
        sem.wait();

        // select it and check, now database should store hashId2
        pgPool.withConnection([&sem,&hashId2,rowId](db::BusyConnection&& con) {
            con.executeQuery(
                    [&sem,&hashId2](db::QueryResult &&qr) {
                        REQUIRE(qr.getRowsCount() == 1);
                        auto hashId2FromDb = HashId::withDigest(qr.getValueByIndex(0, 0));
                        REQUIRE(hashId2 == hashId2FromDb);
                        sem.notify();
                    },
                    [](const string &errText) {
                        throw std::runtime_error(errText);
                    },
                    "SELECT hash FROM table1 WHERE id=$1 LIMIT 1;",
                    rowId
            );
        });
        sem.wait();
    }

    SECTION("insert, select and update integer and bigint") {
        Semaphore sem;
        int created_at_1 = getCurrentTimeMillis()/1000;
        long long expires_at_1 = (long long)(created_at_1) + 9000000000000l;
        int created_at_2 = created_at_1 + 1000;
        long long expires_at_2 = (long long)(created_at_2) + 9100000000000l;
        int rowId = 0;

        // insert created_at_1 and expires_at_1
        pgPool.withConnection([&sem,&rowId,created_at_1,expires_at_1](db::BusyConnection&& con){
            con.executeQuery(
                    [&sem,&rowId](db::QueryResult &&qr) {
                        int newId = db::getIntValue(qr.getValueByIndex(0, 0));
                        rowId = newId;
                        REQUIRE(rowId == 1);
                        sem.notify();
                    },
                    [](const string &errText) {
                        throw std::runtime_error(errText);
                    },
                    "INSERT INTO table1(hash,state,locked_by_id,created_at,expires_at) VALUES ($1, $2, 0, $3, $4) RETURNING id;",
                    HashId::createRandom().getDigest(), 4, created_at_1, expires_at_1
            );
        });
        sem.wait();

        // select and check
        pgPool.withConnection([&sem,created_at_1,expires_at_1,rowId](db::BusyConnection&& con) {
            con.executeQuery(
                    [&sem,created_at_1,expires_at_1](db::QueryResult &&qr) {
                        REQUIRE(qr.getRowsCount() == 1);
                        auto field1 = db::getIntValue(qr.getValueByName(0, "field1"));
                        auto field2 = db::getLongValue(qr.getValueByName(0, "field2"));
                        REQUIRE(field1 == created_at_1);
                        REQUIRE(field2 == expires_at_1);
                        sem.notify();
                    },
                    [](const string &errText) {
                        throw std::runtime_error(errText);
                    },
                    "SELECT created_at AS field1, expires_at AS field2 FROM table1 WHERE id=$1 LIMIT 1;",
                    rowId
            );
        });
        sem.wait();

        // update to created_at_2 and expires_at_2
        pgPool.withConnection([&sem,created_at_2,expires_at_2,rowId](db::BusyConnection&& con) {
            con.executeUpdate(
                    [&sem](int affectedRows) {
                        REQUIRE(affectedRows == 1);
                        sem.notify();
                    },
                    [](const string &errText) {
                        throw std::runtime_error(errText);
                    },
                    "UPDATE table1 SET created_at=$1, expires_at=$2 WHERE id=$3;",
                    created_at_2, expires_at_2, rowId
            );
        });
        sem.wait();

        // select and check
        pgPool.withConnection([&sem,created_at_2,expires_at_2,rowId](db::BusyConnection&& con) {
            con.executeQuery(
                    [&sem,created_at_2,expires_at_2](db::QueryResult &&qr) {
                        REQUIRE(qr.getRowsCount() == 1);
                        auto field1 = db::getIntValue(qr.getValueByName(0, "field1"));
                        auto field2 = db::getLongValue(qr.getValueByName(0, "field2"));
                        REQUIRE(field1 == created_at_2);
                        REQUIRE(field2 == expires_at_2);
                        sem.notify();
                    },
                    [](const string &errText) {
                        throw std::runtime_error(errText);
                    },
                    "SELECT created_at AS field1, expires_at AS field2 FROM table1 WHERE id=$1 LIMIT 1;",
                    rowId
            );
        });
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
        pgPool.withConnection([&sem,&rowId,text1,bool1,double1](db::BusyConnection&& con) {
            con.executeQuery(
                    [&sem,&rowId](db::QueryResult &&qr) {
                        int newId = db::getIntValue(qr.getValueByIndex(0, 0));
                        rowId = newId;
                        REQUIRE(rowId == 1);
                        sem.notify();
                    },
                    [](const string &errText) {
                        throw std::runtime_error(errText);
                    },
                    "INSERT INTO table2(text_val, boolean_val, double_val) VALUES ($1, $2, $3) RETURNING id;",
                    text1, bool1, double1
            );
        });
        sem.wait();

        // select and check
        pgPool.withConnection([&sem,&rowId,text1,bool1,double1](db::BusyConnection&& con) {
            con.executeQuery(
                    [&sem,&rowId,text1,bool1,double1](db::QueryResult &&qr) {
                        REQUIRE(qr.getRowsCount() == 1);
                        auto db_text_val = db::getStringValue(qr.getValueByIndex(0, 0));
                        auto db_boolean_val = db::getBoolValue(qr.getValueByIndex(0, 1));;
                        auto db_double_val = db::getDoubleValue(qr.getValueByIndex(0, 2));
                        REQUIRE(db_text_val == text1);
                        REQUIRE(db_boolean_val == bool1);
                        REQUIRE(db_double_val == double1);
                        sem.notify();
                    },
                    [](const string &errText) {
                        throw std::runtime_error(errText);
                    },
                    "SELECT text_val, boolean_val, double_val FROM table2 WHERE id=$1 LIMIT 1;",
                    rowId
            );
        });
        sem.wait();

        // update to text2, bool2, double2
        pgPool.withConnection([&sem,&rowId,text2,bool2,double2](db::BusyConnection&& con) {
            con.executeUpdate(
                    [&sem](int affectedRows) {
                        REQUIRE(affectedRows == 1);
                        sem.notify();
                    },
                    [](const string &errText) {
                        throw std::runtime_error(errText);
                    },
                    "UPDATE table2 SET text_val=$1, boolean_val=$2, double_val=$3 WHERE id=$4;",
                    text2, bool2, double2, rowId
            );
        });
        sem.wait();

        // select and check
        pgPool.withConnection([&sem,&rowId,text2,bool2,double2](db::BusyConnection&& con) {
            con.executeQuery(
                    [&sem,&rowId,text2,bool2,double2](db::QueryResult &&qr) {
                        REQUIRE(qr.getRowsCount() == 1);
                        auto db_text_val = db::getStringValue(qr.getValueByIndex(0, 0));
                        auto db_boolean_val = db::getBoolValue(qr.getValueByIndex(0, 1));
                        auto db_double_val = db::getDoubleValue(qr.getValueByIndex(0, 2));
                        REQUIRE(db_text_val == text2);
                        REQUIRE(db_boolean_val == bool2);
                        REQUIRE(db_double_val == double2);
                        sem.notify();
                    },
                    [](const string &errText) {
                        throw std::runtime_error(errText);
                    },
                    "SELECT text_val, boolean_val, double_val FROM table2 WHERE id=$1 LIMIT 1;",
                    rowId
            );
        });
        sem.wait();
    }

    SECTION("performance: insert line-by-line vs multi insert") {
        const int ROWS_COUNT = 1000;
        const int BUF_SIZE = 20;
        Semaphore sem;
        atomic<int> readyCounter(0);
        long long t0 = getCurrentTimeMillis();
        for (int i = 0; i < ROWS_COUNT; ++i) {
            pgPool.withConnection([&sem,&readyCounter](db::BusyConnection&& con){
                vector<any> params({HashId::createRandom().getDigest(), 4, (int)getCurrentTimeMillis() / 1000,
                                    getCurrentTimeMillis() / 1000l + 31536000l});
                con.executeUpdateArr(
                        [&sem,&readyCounter](int affectedRows) {
                            ++readyCounter;
                            sem.notify();
                        },
                        [](const string &errText) {
                            throw std::runtime_error(errText);
                        },
                        "INSERT INTO table1(hash,state,locked_by_id,created_at,expires_at) VALUES ($1, $2, 0, $3, $4)",
                        params
                );
            });
        }
        do {
            sem.wait();
            int counterState = int(readyCounter);
        } while (readyCounter < ROWS_COUNT);
        REQUIRE(readyCounter == ROWS_COUNT);
        cout << "insert line by line: " << getCurrentTimeMillis()-t0 << " ms" << endl;

        recreateTestTable();
        readyCounter = 0;

        long long t1 = getCurrentTimeMillis();
        for (int i = 0; i < ROWS_COUNT/BUF_SIZE; ++i) {
            pgPool.withConnection([&readyCounter,&sem](db::BusyConnection&& con){
                string query = "INSERT INTO table1(hash,state,locked_by_id,created_at,expires_at) VALUES ";
                vector<any> params;
                for (int j = 0; j < BUF_SIZE; ++j) {
                    char buf[64];
                    snprintf(buf, sizeof(buf), "($%i,$%i,0,$%i,$%i)", j*4+1, j*4+2, j*4+3, j*4+4);
                    params.push_back(HashId::createRandom().getDigest());
                    params.push_back(4);
                    params.push_back((int)getCurrentTimeMillis() / 1000);
                    params.push_back(getCurrentTimeMillis() / 1000l + 31536000l);
                    if (j > 0)
                        query += ",";
                    query += buf;
                }
                query += " RETURNING id;";
                con.executeQueryArr(
                        [&readyCounter,&sem](db::QueryResult &&qr) {
                            for (int k = 0; k < qr.getRowsCount(); ++k) {
                                int id = db::getIntValue(qr.getValueByIndex(k,0));
                                //cout << "inserted id: " << id << endl;
                                ++readyCounter;
                            }
                            sem.notify();
                        },
                        [](const string &errText) {
                            throw std::runtime_error(errText);
                        },
                        query,
                        params
                );
            });
        }
        do {
            sem.wait();
            int counterState = int(readyCounter);
        } while (readyCounter < ROWS_COUNT);
        REQUIRE(readyCounter == ROWS_COUNT);
        cout << "multi insert: " << getCurrentTimeMillis()-t1 << " ms" << endl;
    }

    SECTION("performance: select line-by-line vs array in 'where'") {
        const int ROWS_COUNT = 50000;
        const int INSERT_BUF_SIZE = 20;
        const int SELECTS_COUNT = ROWS_COUNT/10;
        const int SELECTS_BUF_SIZE = 20;
        Semaphore sem;
        atomic<int> readyCounter(0);
        std::minstd_rand  minstdRand(std::chrono::duration_cast<std::chrono::nanoseconds>(std::chrono::high_resolution_clock::now().time_since_epoch()).count());

        vector<HashId> hashes;
        for (int i = 0; i < ROWS_COUNT; ++i)
            hashes.push_back(HashId::createRandom());
        for (int i = 0; i < ROWS_COUNT/INSERT_BUF_SIZE; ++i) {
            pgPool.withConnection([&hashes,i,&sem,&readyCounter](db::BusyConnection&& con1){
                db::BusyConnection con;
                con.moveFrom(move(con1));
                string query = "INSERT INTO table1(hash,state,locked_by_id,created_at,expires_at) VALUES ";
                vector<any> params;
                for (int j = 0; j < INSERT_BUF_SIZE; ++j) {
                    char buf[64];
                    snprintf(buf, sizeof(buf), "($%i,$%i,0,$%i,$%i)", j*4+1, j*4+2, j*4+3, j*4+4);
                    params.push_back(hashes.at(i*INSERT_BUF_SIZE+j).getDigest());
                    params.push_back(i*INSERT_BUF_SIZE+j);
                    params.push_back((int)getCurrentTimeMillis() / 1000);
                    params.push_back(getCurrentTimeMillis() / 1000l + 31536000l);
                    if (j > 0)
                        query += ",";
                    query += buf;
                }
                query += " RETURNING id;";
                con.executeQueryArr(
                        [&sem,&readyCounter](db::QueryResult&& qr) {
                            for (int k = 0; k < qr.getRowsCount(); ++k) {
                                ++readyCounter;
                            }
                            sem.notify();
                        },
                        [](const string &errText) {
                            throw std::runtime_error(errText);
                        },
                        query,
                        params
                );
            });
        }
        do {
            sem.wait();
            int counterState = int(readyCounter);
        } while (readyCounter < ROWS_COUNT);
        REQUIRE(readyCounter == ROWS_COUNT);

        long long t0 = getCurrentTimeMillis();
        Semaphore sem2;
        for (int i = 0; i < SELECTS_COUNT; ++i) {
            pgPool.withConnection([&hashes,&minstdRand,&sem2](db::BusyConnection&& con1){
                db::BusyConnection con;
                con.moveFrom(move(con1));
                vector<any> params({hashes[minstdRand()%ROWS_COUNT].getDigest()});
                con.executeQueryArr(
                        [&sem2](db::QueryResult&& qr) {
                            sem2.notify();
                        },
                        [](const string &errText) {
                            throw std::runtime_error(errText);
                        },
                        "SELECT state FROM table1 WHERE hash=$1 LIMIT 1",
                        params
                );
            });
        }
        for (int i = 0; i < SELECTS_COUNT; ++i)
            sem2.wait();
        cout << "many single selects: " << getCurrentTimeMillis()-t0 << " ms" << endl;

        long long t1 = getCurrentTimeMillis();
        for (int i = 0; i < SELECTS_COUNT/SELECTS_BUF_SIZE; ++i) {
            pgPool.withConnection([&hashes,&minstdRand,&sem2](db::BusyConnection&& con1){
                db::BusyConnection con;
                con.moveFrom(move(con1));
                string queryArray = "(";
                vector<any> params;
                for (int j = 1; j <= SELECTS_BUF_SIZE; ++j) {
                    params.push_back(hashes[minstdRand()%ROWS_COUNT].getDigest());
                    queryArray += "$" + to_string(j);
                    if (j != SELECTS_BUF_SIZE)
                        queryArray += ",";
                }
                queryArray += ")";
                con.executeQueryArr(
                        [&sem2](db::QueryResult&& qr) {
                            for (int j = 0; j < SELECTS_BUF_SIZE; ++j)
                                sem2.notify();
                        },
                        [](const string &errText) {
                            throw std::runtime_error(errText);
                        },
                        "SELECT state FROM table1 WHERE hash IN "+queryArray+" LIMIT "+to_string(SELECTS_BUF_SIZE),
                        params
                );
            });
        }
        for (int i = 0; i < SELECTS_COUNT; ++i)
            sem2.wait();
        cout << "batch selects: " << getCurrentTimeMillis()-t1 << " ms" << endl;
    }

    SECTION("withConnection") {
        Semaphore sem;
        const int count = 100;
        for (int i = 0; i < count; ++i) {
            pgPool.withConnection([i,&pgPool,&sem](db::BusyConnection &&con) {
                this_thread::sleep_for(10ms);
                sem.notify();
            });
        }
        for (int i = 0; i < count; ++i)
            sem.wait();
    }

}
