//
// Created by Leonid Novikov on 3/4/19.
//

#ifndef U8_PGPOOL_H
#define U8_PGPOOL_H

#include <functional>
#include <postgresql/libpq-fe.h>
#include <queue>
#include <any>
#include <string.h>
#include <atomic>
#include "../crypto/base64.h"
#include "../tools/tools.h"
#include "../tools/ThreadPool.h"
#include <unordered_map>

namespace db {

    /**
     * Resulting object for sql queries, uses in callback functions.
     */
    class QueryResult {
    public:
        QueryResult(pg_result *pgRes);
        bool isError();
        char* getErrorText();
        int getErrorCode();
        int getRowsCount();
        byte_vector getValueByIndex(int rowNum, int colIndex);
        byte_vector getValueByName(int rowNum, const std::string& colName);
        void cacheResults();
        byte_vector getCachedValueByIndex(int rowNum, int colIndex);
        byte_vector getCachedValueByName(int rowNum, const std::string& colName);
        int getCachedColsCount();
        int getCachedRowsCount();
    private:
        std::shared_ptr<pg_result> pgRes_;
        std::vector<byte_vector> cache_;
        int cacheColsCount_ = 0;
        int cacheRowsCount_ = 0;
        std::unordered_map<string, int> cacheColNames_;
    };

    int getIntValue(const byte_vector& val);
    long long getLongValue(const byte_vector& val);
    bool getBoolValue(const byte_vector& val);
    double getDoubleValue(const byte_vector& val);
    std::string getStringValue(const byte_vector& val);

    typedef std::vector<QueryResult> QueryResultsArr;
    typedef const std::function<void(QueryResultsArr&)>& QueryCallback;

    /**
     * Implementation of async connections pool for postgres database.
     */
    class PGPool : Noncopyable, Nonmovable {

    public:

        PGPool(int poolSize, const std::string& connectString);

        PGPool(int poolSize, const std::string &host, int port, const std::string &dbname, const std::string &user,
               const std::string &pswd);

        /**
         * Executes string sql command. All query parameters should be inside string.
         * You can concatenate several sql commands in one string. Callback receives vecror<QueryResult> parameter,
         * one result for each sql command.
         */
        void exec(const std::string &query, QueryCallback callback);

        /**
         * Only one sql command in query string allowed here.
         * Query parameters passes through vector<any>. Useful for big queries, e.g. multi insert.
         * <p>
         * Valid params types: byte_vector, string, const char*, int, long, bool, double.
         */
        void execParamsArr(const std::string &query, QueryCallback callback, std::vector<std::any>& params);

        /**
         * Only one sql command in query string allowed here.
         * Query parameters passes through variadic arguments.
         * <p>
         * Valid params types: byte_vector, string, const char*, int, long, bool, double.
         */
        template<typename... Args>
        void execParams(const std::string &query, QueryCallback callback, Args ...args) {
            std::vector<std::any> params;
            prepareParams(params, args...);
            execParamsArr(query, callback, params);
        }

    private:
        /**
         * Internal class for automatic release connection back to pool.
         */
        class BusyConnection {
        public:
            BusyConnection(PGPool& new_parent, std::shared_ptr<PGconn> new_con): parent_(new_parent), con(new_con) {}
            ~BusyConnection() {parent_.releaseConnection(con);}
            std::shared_ptr<PGconn> con;
        private:
            PGPool& parent_;
        };

    private:
        std::shared_ptr<PGconn> getUnusedConnection();

        void releaseConnection(std::shared_ptr<PGconn> con);

        template<typename T>
        void prepareParams(std::vector<std::any>& params, T t) {
            params.push_back(t);
        }

        template<typename T, typename... Args>
        void prepareParams(std::vector<std::any>& params, T t, Args... args) {
            params.push_back(t);
            prepareParams(params, args...);
        }


    private:
        std::queue<std::shared_ptr<PGconn>> connPool_;
        std::mutex poolMutex_;
        std::condition_variable poolCV_;
        ThreadPool threadPool_;

    };

    /**
     * Postgres encode(val,'base64') returns string divided into several separate lines.
     * For process this base64, we should remove &#92;r and &#92;n symbols.
     */
    inline std::string bytesToStringLine(const byte_vector& bv) {
        std::string s = bytesToString(bv);
        s.erase(std::remove(s.begin(), s.end(), '\r'), s.end());
        s.erase(std::remove(s.begin(), s.end(), '\n'), s.end());
        return s;
    }

}

#endif //U8_PGPOOL_H
