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
     * Each broken connection tries to reconnect to db server after this delay time.
     */
    const int BROKEN_CONNECTION_RESET_DELAY_MILLIS = 5000;

    class PGPool;

    /**
     * Resulting object for sql queries, uses in callback functions.
     */
    class QueryResult {
    public:
        QueryResult();
        QueryResult(PGPool* new_parent, pg_result *pgRes);
        void moveFrom(QueryResult&& other);
        bool isError();
        char* getErrorText();
        int getErrorCode();
        byte_vector getValueByIndex(int rowNum, int colIndex);
        byte_vector getValueByName(int rowNum, const std::string& colName);

        /**
         * Get vector of rows. Each row is a vector of byte_vector with binary representation of resulting value.
         * If there are less rows than requested, returns all remaining rows. Return empty array when there are
         * no more rows. If maxRows is 0, returns all resulting data anyway.
         */
        std::vector<std::vector<byte_vector>> getRows(int maxRows = 0);

        /**
         * Return total number of rows in the set (does not change when {#getRows} calls)
         */
        int getRowsCount();

        /**
         * Return total number of columns in the set.
         */
        int getColsCount();

        /**
         * Useful for UPDATE queries.
         */
        int getAffectedRows();

        /**
         * Return vector of column names, in the same order as in resulting rows.
         */
        std::vector<std::string> getColNames();

        /**
         * Return vector of column types as OIDs.
         */
        std::vector<string> getColTypes();

    private:
        std::shared_ptr<pg_result> pgRes_;
        int nextRowIndex_ = 0;
        PGPool* parent_;
    };

    short getInt16Value(const byte_vector& val);
    int getIntValue(const byte_vector& val);
    long long getLongValue(const byte_vector& val);
    bool getBoolValue(const byte_vector& val);
    double getDoubleValue(const byte_vector& val);
    std::string getStringValue(const byte_vector& val);

    class BusyConnection;

    typedef std::vector<QueryResult> QueryResultsArr;
    typedef const std::function<void(QueryResultsArr&)>& QueryCallback;
    typedef const std::function<void(shared_ptr<db::BusyConnection>)>& WithConnectionCallbackJs;
    typedef const std::function<void(db::BusyConnection&)>& WithConnectionCallback;
    typedef const std::function<void(QueryResult&&)>& ExecuteSuccessCallback;
    typedef const std::function<void(const std::string& errText)>& ExecuteErrorCallback;
    typedef const std::function<void(int affectedRows)>& UpdateSuccessCallback;
    typedef const std::function<void(const std::string& errText)>& UpdateErrorCallback;

    /**
     * Automatically release connection back to the pool.
     */
    class BusyConnection: Nonmovable, Noncopyable {
    public:

        /**
         * For js bindings.
         */
        BusyConnection(): parent_(nullptr), worker_(1) {}

        /**
         * By design it should be used from PGPool only.
         */
        BusyConnection(PGPool* new_parent, std::shared_ptr<PGconn> new_con, int newId): parent_(new_parent), con_(new_con), worker_(1), conId_(newId) {}

        /**
         * Accessor for libpq PGconn*
         */
        PGconn* conPtr() {return con_.get();}

        /**
         * Execute
         * @param onSuccess callback that is called when statement is executed with {QueryResult} instance as a single object.
         * @param onError callback that is called with some error text
         * @param queryString the SQL statement where possible parameters (to use for prepared statement if any) are replaced with '?' characters.
         * @param args optional parameters. If any, the prepared statement should be used.
         */
        template<typename... Args>
        void executeQuery(ExecuteSuccessCallback onSuccess, ExecuteErrorCallback onError, const std::string& queryString, Args ...args) {
            std::vector<std::any> params;
            prepareParams(params, args...);
            executeQueryArr(onSuccess, onError, queryString, params);
        }

        /**
         * Query parameters passes through vector<any>. Useful for big queries, e.g. multi insert; /see {executeQuery}
         */
        void executeQueryArr(ExecuteSuccessCallback onSuccess, ExecuteErrorCallback onError, const std::string& queryString, std::vector<std::any>& params);

        /**
         * Query parameters passes through vector<any>; byte_vector in binary mode, all other types as text
         */
        void executeQueryArrStr(ExecuteSuccessCallback onSuccess, ExecuteErrorCallback onError, const std::string& queryString, std::vector<std::any>& params);

        /**
         * Execute non-query statement, e.g. data modification or table structure modification statement.
         * @param onSuccess callback that is called when statement is executed with an integer parameter containing number of affected strings.
         * @param onError callback that is called
         * @param queryString the SQL statement where possible parameters (to use for prepared statement if any) are replaced with '?' characters.
         * @param args optional parameters. If any, the prepared statement should be used.
         */
        template<typename... Args>
        void executeUpdate(UpdateSuccessCallback onSuccess, UpdateErrorCallback onError, const std::string& queryString, Args ...args) {
            std::vector<std::any> params;
            prepareParams(params, args...);
            executeUpdateArr(onSuccess, onError, queryString, params);
        }

        /**
         * Query parameters passes through vector<any>. Useful for big queries, e.g. multi insert; /see {executeUpdate}
         */
        void executeUpdateArr(UpdateSuccessCallback onSuccess, UpdateErrorCallback onError, const std::string& queryString, std::vector<std::any>& params);

        /**
         * Query parameters passes through vector<any>; byte_vector in binary mode, all other types as text
         */
        void executeUpdateArrStr(UpdateSuccessCallback onSuccess, UpdateErrorCallback onError, const std::string& queryString, std::vector<std::any>& params);

        /**
         * Release the connection. Call it after pgPool.withConnection().
         */
        void release();

    public:
        // internal, but should be public

        int getId() {return conId_;}

        void exec(std::function<void()> f) {worker_(f);}

        void goResetCon();

    private:

        void prepareParams(std::vector<std::any>& params) {
        }

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
        std::shared_ptr<PGconn> con_;
        PGPool* parent_;
        ThreadPool worker_;
        int conId_;
    };

    /**
     * Implementation of async connections pool for postgres database.
     */
    class PGPool : Noncopyable, Nonmovable {

    public:

        PGPool();

        PGPool(int poolSize, const std::string& connectString);

        PGPool(int poolSize, const std::string &host, int port, const std::string &dbname, const std::string &user,
               const std::string &pswd);

        /**
         * For js bindings.
         * @return pair with error status and error text. If res.first is true, then db connected correctly. Else see res.second for error text.
         */
        std::pair<bool,std::string> connect(int poolSize, const std::string& connectString);

        /**
         * Get connection from the pool, pass it to the callback and return it to the pool.
         * The call itself never blocks while the callback could be called in some moment in future.
         * <p>
         * Releases automatically.
         * @param callback shared_ptr<db::PGPool::BusyConnection>
         */
        void withConnection(WithConnectionCallback callback);

        /**
         * Need to be released by connection.release()
         * @param callback db::PGPool::BusyConnection
         */
        void withConnection(WithConnectionCallbackJs callback);

        /**
         * Return number of connections in the pool.
         */
        size_t totalConnections();

        /**
         * Return number of available connections in the pool.
         */
        size_t availableConnections();

        /**
         * Executes string sql command. All query parameters should be inside string.
         * You can concatenate several sql commands in one string. Callback receives vecror<QueryResult> parameter,
         * one result for each sql command.
         */
        void exec(const std::string &query, QueryCallback callback);

        /**
         * Uses from class BusyConnection.
         */
        void releaseConnection(std::shared_ptr<BusyConnection> con);

        /**
         * Uses from JS bindings.
         */
        void releaseConnection(int conId);

        /**
         * Returns pg type name by its oid. Oids list are loaded on connection step.
         */
        string getType(int oid) {return pgTypes_[oid];};

        /**
         * Calls automatically from BusyConnection in error cases.
         */
        void checkAndResetAllConnections();

        /**
         * Releases all connections to database. Uses in JS if we don't want to wait for GC.
         */
        void close();

    private:
        std::shared_ptr<BusyConnection> getUnusedConnection();
        std::string loadOids();

    private:
        std::queue<std::shared_ptr<BusyConnection>> connPool_;
        std::mutex poolMutex_;
        std::condition_variable poolCV_;
        ThreadPool poolControlThread_;
        //std::atomic<size_t> usedConnectionsCount_;
        std::unordered_map<int, std::shared_ptr<BusyConnection>> usedConnections_;
        std::unordered_map<int, string> pgTypes_;

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

    std::string replacePlaceholders(const std::string& s);

}

#endif //U8_PGPOOL_H
