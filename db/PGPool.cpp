//
// Created by Leonid Novikov on 3/4/19.
//

#include <memory>
#include "PGPool.h"

namespace db {

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

    int getIntValue(const byte_vector& val) {
        if (val.size() < sizeof(int))
            throw std::invalid_argument(
                    "QueryResult::getIntValue: data too small: " + std::to_string(val.size()) + " bytes");
        return be32toh(*(int *) &val[0]);
    }

    long long getLongValue(const byte_vector& val) {
        if (val.size() < sizeof(long long))
            throw std::invalid_argument(
                    "QueryResult::getLongValue: data too small: " + std::to_string(val.size()) + " bytes");
        return be64toh(*(long long*)&val[0]);
    }

    bool getBoolValue(const byte_vector& val) {
        return *(bool*)&val[0];
    }

    double getDoubleValue(const byte_vector& val) {
        if (val.size() < sizeof(double))
            throw std::invalid_argument(
                    "QueryResult::getDoubleValue: data too small: " + std::to_string(val.size()) + " bytes");
        long long hval = be64toh(*((long long*)&val[0]));
        return *((double*)&hval);
    }

    std::string getStringValue(const byte_vector& val) {
        return bytesToString(val);
    }

    PGPool::PGPool(int poolSize, const std::string& connectString) : threadPool_(poolSize) {
        for (int i = 0; i < poolSize; ++i) {
            std::shared_ptr<PGconn> con;
            con.reset(PQconnectdb(connectString.c_str()), &PQfinish);
            PQsetnonblocking(con.get(), 1);
            connPool_.push(con);
        }
    }

    PGPool::PGPool(int poolSize, const std::string &host, int port, const std::string &dbname, const std::string &user,
                   const std::string &pswd) : threadPool_(poolSize) {
        for (int i = 0; i < poolSize; ++i) {
            std::shared_ptr<PGconn> con;
            con.reset(PQsetdbLogin(host.c_str(), std::to_string(port).c_str(), nullptr, nullptr, dbname.c_str(),
                                   user.c_str(), pswd.c_str()), &PQfinish);
            PQsetnonblocking(con.get(), 1);
            connPool_.push(con);
        }
    }

    void PGPool::exec(const std::string &query, QueryCallback callback) {
        threadPool_.execute([callback, query, this]() {
            BusyConnection bc(*this, getUnusedConnection());
            PQsendQuery(bc.con.get(), query.c_str());
            PQflush(bc.con.get());
            QueryResultsArr results;
            while (true) {
                pg_result *r = PQgetResult(bc.con.get());
                if (r == nullptr)
                    break;
                results.push_back(QueryResult(r));
            }
            callback(results);
        });
    }

    void PGPool::execParamsArr(const std::string &query, QueryCallback callback, std::vector<std::any>& params) {
        threadPool_.execute([params,query,callback,this](){
            BusyConnection bc(*this, getUnusedConnection());
            const char *values[params.size()];
            int lengths[params.size()];
            int binaryFlags[params.size()];
            vector<shared_ptr<string>> stringHolder;
            vector<shared_ptr<byte_vector>> bytesHolder;
            auto addString = [&stringHolder,&values,&lengths,&binaryFlags](int i, std::shared_ptr<std::string> ps){
                stringHolder.push_back(ps);
                string &s = *ps;
                values[i] = &s[0];
                lengths[i] = s.length();
                binaryFlags[i] = 0;
            };
            for (int i = 0; i < params.size(); ++i) {
                auto &val = params[i];
                if (val.type() == typeid(byte_vector)) {
                    auto ps = make_shared<byte_vector>(std::any_cast<byte_vector>(val));
                    bytesHolder.push_back(ps);
                    byte_vector &bv = *ps;
                    values[i] = (char *) &bv[0];
                    lengths[i] = bv.size();
                    binaryFlags[i] = 1;
                } else if (val.type() == typeid(const char *)) {
                    auto ps = make_shared<string>(std::any_cast<const char *>(val));
                    addString(i, ps);
                } else if (val.type() == typeid(std::string)) {
                    auto ps = make_shared<string>(std::any_cast<std::string>(val));
                    addString(i, ps);
                } else if (val.type() == typeid(int)) {
                    auto ps = make_shared<string>(std::to_string(std::any_cast<int>(val)));
                    addString(i, ps);
                    stringHolder.push_back(ps);
                } else if (val.type() == typeid(long)) {
                    auto ps = make_shared<string>(std::to_string(std::any_cast<long>(val)));
                    addString(i, ps);
                    stringHolder.push_back(ps);
                } else if (val.type() == typeid(long long)) {
                    auto ps = make_shared<string>(std::to_string(std::any_cast<long long>(val)));
                    addString(i, ps);
                    stringHolder.push_back(ps);
                } else if (val.type() == typeid(bool)) {
                    auto ps = make_shared<string>(std::to_string(std::any_cast<bool>(val)));
                    addString(i, ps);
                    stringHolder.push_back(ps);
                } else if (val.type() == typeid(double)) {
                    auto ps = make_shared<string>(std::to_string(std::any_cast<double>(val)));
                    addString(i, ps);
                    stringHolder.push_back(ps);
                } else {
                    std::cerr << "PGPool.execParams error: wrong type: " << val.type().name() << std::endl;
                }
            }
            PQsendQueryParams(bc.con.get(), query.c_str(), params.size(), nullptr, values, lengths, binaryFlags, 1);
            PQflush(bc.con.get());
            QueryResultsArr results;
            while (true) {
                pg_result *r = PQgetResult(bc.con.get());
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
            std::shared_ptr<PGconn> con = connPool_.front();
            connPool_.pop();
            return con;
        }
    }

    void PGPool::releaseConnection(std::shared_ptr<PGconn> con) {
        std::lock_guard guard(poolMutex_);
        connPool_.push(con);
        poolCV_.notify_one();
    }

}
