//
// Created by Leonid Novikov on 3/4/19.
//

#include <memory>

#ifdef __APPLE__

#include <libkern/OSByteOrder.h>

#define htobe16(x) OSSwapHostToBigInt16(x)
#define htole16(x) OSSwapHostToLittleInt16(x)
#define be16toh(x) OSSwapBigToHostInt16(x)
#define le16toh(x) OSSwapLittleToHostInt16(x)

#define htobe32(x) OSSwapHostToBigInt32(x)
#define htole32(x) OSSwapHostToLittleInt32(x)
#define be32toh(x) OSSwapBigToHostInt32(x)
#define le32toh(x) OSSwapLittleToHostInt32(x)

#define htobe64(x) OSSwapHostToBigInt64(x)
#define htole64(x) OSSwapHostToLittleInt64(x)
#define be64toh(x) OSSwapBigToHostInt64(x)
#define le64toh(x) OSSwapLittleToHostInt64(x)

#endif

#include "PGPool.h"



namespace db {

    QueryResult::QueryResult() {
    }

    void QueryResult::moveFrom(QueryResult&& other) {
        pgRes_ = std::move(other.pgRes_);
        nextRowIndex_ = other.nextRowIndex_;
    }

    QueryResult::QueryResult(pg_result *pgRes) {
        pgRes_.reset(pgRes, &PQclear);
    }

    bool QueryResult::isError() {
        return (PQresultStatus(pgRes_.get()) > PGRES_TUPLES_OK);
    }

    char* QueryResult::getErrorText() {
        return PQresultErrorMessage(pgRes_.get());
    }

    int QueryResult::getErrorCode() {
        return PQresultStatus(pgRes_.get());
    }

    int QueryResult::getRowsCount() {
        return PQntuples(pgRes_.get());
    }

    int QueryResult::getAffectedRows() {
        return std::stoi(PQcmdTuples(pgRes_.get()));
    }

    byte_vector QueryResult::getValueByIndex(int rowNum, int colIndex) {
        char* p = PQgetvalue(pgRes_.get(), rowNum, colIndex);
        int len = PQgetlength(pgRes_.get(), rowNum, colIndex);
        byte_vector res(len);
        memcpy(&res[0], p, len);
        return res;
    }

    byte_vector QueryResult::getValueByName(int rowNum, const std::string& colName) {
        int colIndex = PQfnumber(pgRes_.get(), colName.c_str());
        if (colIndex == -1)
            throw std::invalid_argument("QueryResult::getValueByName error: column not found: " + colName);
        return getValueByIndex(rowNum, colIndex);
    }

    std::vector<std::vector<byte_vector>> QueryResult::getRows(int maxRows) {
        int nRows = PQntuples(pgRes_.get());
        int nCols = PQnfields(pgRes_.get());
        if (maxRows == 0) {
            std::vector<std::vector<byte_vector>> res(nRows);
            for (int iRow = 0; iRow < nRows; ++iRow) {
                res[iRow].resize(nCols);
                for (int iCol = 0; iCol < nCols; ++iCol)
                    res[iRow][iCol] = getValueByIndex(iRow, iCol);
            }
            return res;
        } else {
            int rowsToFetch = min(nRows-nextRowIndex_, maxRows);
            if (rowsToFetch == 0)
                return std::vector<std::vector<byte_vector>>();
            std::vector<std::vector<byte_vector>> res(rowsToFetch);
            for (int iRow = nextRowIndex_; iRow < nextRowIndex_+rowsToFetch; ++iRow) {
                res[iRow-nextRowIndex_].resize(nCols);
                for (int iCol = 0; iCol < nCols; ++iCol)
                    res[iRow-nextRowIndex_][iCol] = getValueByIndex(iRow, iCol);
            }
            nextRowIndex_ += rowsToFetch;
            return res;
        }
    }

    std::vector<std::string> QueryResult::getColNames() {
        int nCols = PQnfields(pgRes_.get());
        std::vector<std::string> res(nCols);
        for (int iCol = 0; iCol < nCols; ++iCol)
            res[iCol] = std::string(PQfname(pgRes_.get(), iCol));
        return res;
    }

    int getIntValue(const byte_vector& val) {
        auto sz = sizeof(int);
        if (val.size() != sz)
            throw std::invalid_argument(
                    "QueryResult::getIntValue: wrong data size: " + std::to_string(val.size()) + " bytes received, required " + std::to_string(sz));
        return be32toh(*(int *) &val[0]);
    }

    long long getLongValue(const byte_vector& val) {
        auto sz = sizeof(long long);
        if (val.size() < sz)
            throw std::invalid_argument(
                    "QueryResult::getLongValue: wrong data size: " + std::to_string(val.size()) + " bytes received, required " + std::to_string(sz));
        return be64toh(*(long long*)&val[0]);
    }

    bool getBoolValue(const byte_vector& val) {
        return *(bool*)&val[0];
    }

    double getDoubleValue(const byte_vector& val) {
        auto sz = sizeof(double);
        if (val.size() < sz)
            throw std::invalid_argument(
                    "QueryResult::getDoubleValue: wrong data size: " + std::to_string(val.size()) + " bytes received, required " + std::to_string(sz));
        long long hval = be64toh(*((long long*)&val[0]));
        return *((double*)&hval);
    }

    std::string getStringValue(const byte_vector& val) {
        return bytesToString(val);
    }

    BusyConnection::~BusyConnection() {
        if (parent_ != nullptr)
            parent_->releaseConnection(con_);
    }

    void BusyConnection::moveFrom(BusyConnection&& other) {
        parent_ = std::move(other.parent_);
        con_ = other.con_;
        other.parent_ = nullptr;
    }

    void BusyConnection::executeQueryArr(ExecuteSuccessCallback onSuccess, ExecuteErrorCallback onError, const std::string& queryString, std::vector<std::any>& params) {
        const char *values[params.size()];
        int lengths[params.size()];
        int binaryFlags[params.size()];
        vector<shared_ptr<byte_vector>> bytesHolder;
        auto addByteVector = [&bytesHolder,&values,&lengths,&binaryFlags](int i, std::shared_ptr<byte_vector> ps) {
            bytesHolder.push_back(ps);
            byte_vector &bv = *ps;
            values[i] = (char *) &bv[0];
            lengths[i] = bv.size();
            binaryFlags[i] = 1;
        };
        for (int i = 0; i < params.size(); ++i) {
            auto &val = params[i];
            if (val.type() == typeid(byte_vector)) {
                auto ps = make_shared<byte_vector>(std::any_cast<byte_vector>(val));
                addByteVector(i, ps);
            } else if (val.type() == typeid(const char *)) {
                auto v = std::any_cast<const char *>(val);
                auto ps = make_shared<byte_vector>(v, v+strlen(v));
                addByteVector(i, ps);
            } else if (val.type() == typeid(std::string)) {
                auto v = std::any_cast<std::string>(val);
                auto ps = make_shared<byte_vector>(v.begin(), v.end());
                addByteVector(i, ps);
            } else if (val.type() == typeid(int)) {
                auto v = std::any_cast<int>(val);
                v = htobe32(v);
                addByteVector(i, make_shared<byte_vector>((char*)&v, ((char*)&v)+sizeof(int)));
            } else if (val.type() == typeid(long)) {
                auto v = std::any_cast<long>(val);
                v = htobe64(v);
                addByteVector(i, make_shared<byte_vector>((char*)&v, ((char*)&v)+sizeof(long)));
            } else if (val.type() == typeid(long long)) {
                auto v = std::any_cast<long long>(val);
                v = htobe64(v);
                addByteVector(i, make_shared<byte_vector>((char*)&v, ((char*)&v)+sizeof(long long)));
            } else if (val.type() == typeid(bool)) {
                auto v = std::any_cast<bool>(val);
                addByteVector(i, make_shared<byte_vector>((char*)&v, ((char*)&v)+sizeof(bool)));
            } else if (val.type() == typeid(double)) {
                auto v = std::any_cast<double>(val);
                long long lv = htobe64(*(long long*)&v);
                v = *(double*)&lv;
                addByteVector(i, make_shared<byte_vector>((char*)&v, ((char*)&v)+sizeof(double)));
            } else {
                std::cerr << "PGPool.execParams error: wrong type: " << val.type().name() << std::endl;
            }
        }
        PQsendQueryParams(conPtr(), queryString.c_str(), params.size(), nullptr, values, lengths, binaryFlags, 1);
        PQflush(conPtr());
        QueryResultsArr results;
        while (true) {
            pg_result *r = PQgetResult(conPtr());
            if (r == nullptr)
                break;
            results.push_back(QueryResult(r));
        }
        if (results.size() == 0) {
            onError("PGPool.executeQuery error: your sql query returns no result, use updateQuery instead.");
            return;
        }
        if (results.size() > 1) {
            onError("PGPool.executeQuery error: your sql query returns "+std::to_string(results.size())+" results, bun only 1 is supported.");
            return;
        }
        if (results[0].isError()) {
            onError("PGPool.executeQuery error: postgres error: " + std::string(results[0].getErrorText()));
            return;
        }
        onSuccess(std::move(results[0]));
    }

    void BusyConnection::updateQueryArr(UpdateSuccessCallback onSuccess, UpdateErrorCallback onError, const std::string& queryString, std::vector<std::any>& params) {
        executeQueryArr(
            [&onSuccess](QueryResult&& qr){onSuccess(qr.getAffectedRows());},
            [&onError](const string& errText){onError(errText);},
            queryString,
            params
        );
    }

    PGPool::PGPool(): threadPool_(1), usedConnectionsCount_(0) {
    }

    PGPool::PGPool(int poolSize, const std::string& connectString) : threadPool_(poolSize), usedConnectionsCount_(0) {
        for (int i = 0; i < poolSize; ++i) {
            std::shared_ptr<PGconn> con;
            con.reset(PQconnectdb(connectString.c_str()), &PQfinish);
            connPool_.push(con);
        }
    }

    PGPool::PGPool(int poolSize, const std::string &host, int port, const std::string &dbname, const std::string &user,
                   const std::string &pswd) : threadPool_(poolSize) {
        for (int i = 0; i < poolSize; ++i) {
            std::shared_ptr<PGconn> con;
            con.reset(PQsetdbLogin(host.c_str(), std::to_string(port).c_str(), nullptr, nullptr, dbname.c_str(),
                                   user.c_str(), pswd.c_str()), &PQfinish);
            connPool_.push(con);
        }
    }

    std::pair<bool,std::string> PGPool::connect(int poolSize, const std::string& connectString) {
        if (poolSize < 1l)
            return make_pair(false, "poolSize must be at least 1");
        if (connPool_.size() > 0)
            return make_pair(false, "pgPool is already connected");
        threadPool_.addWorkers(poolSize-threadPool_.countThreads());
        for (int i = 0; i < poolSize; ++i) {
            std::shared_ptr<PGconn> con;
            pg_conn* pCon = PQconnectdb(connectString.c_str());
            if (PQstatus(pCon) == CONNECTION_OK) {
                con.reset(pCon, &PQfinish);
                connPool_.push(con);
            } else {
                return make_pair(false, "unable to connect db");
            }
        }
        return make_pair(true, "");
    }

    void PGPool::withConnection(WithConnectionCallback callback) {
        threadPool_.execute([callback, this]() {
            callback(BusyConnection(this, getUnusedConnection()));
        });
    }

    size_t PGPool::totalConnections() {
        return threadPool_.countThreads();
    }

    size_t PGPool::availableConnections() {
        return totalConnections() - usedConnectionsCount_;
    }

    void PGPool::exec(const std::string &query, QueryCallback callback) {
        threadPool_.execute([callback, query, this]() {
            BusyConnection bc(this, getUnusedConnection());
            PQsendQuery(bc.conPtr(), query.c_str());
            PQflush(bc.conPtr());
            QueryResultsArr results;
            while (true) {
                pg_result *r = PQgetResult(bc.conPtr());
                if (r == nullptr)
                    break;
                results.push_back(QueryResult(r));
            }
            callback(results);
        });
    }

    std::shared_ptr<PGconn> PGPool::getUnusedConnection() {
        {
            std::unique_lock lock(poolMutex_);
            while (connPool_.empty())
                poolCV_.wait(lock);
        }
        {
            std::unique_lock lock(poolMutex_);
            ++usedConnectionsCount_;
            std::shared_ptr<PGconn> con = connPool_.front();
            connPool_.pop();
            return con;
        }
    }

    void PGPool::releaseConnection(std::shared_ptr<PGconn> con) {
        std::lock_guard guard(poolMutex_);
        connPool_.push(con);
        poolCV_.notify_one();
        --usedConnectionsCount_;
    }

}
