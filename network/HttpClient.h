//
// Created by Leonid Novikov on 4/18/19.
//

#ifndef U8_HTTPCLIENT_H
#define U8_HTTPCLIENT_H

#include <memory>
#include <thread>
#include <atomic>
#include <functional>
#include <unordered_map>
#include <mutex>
#include <queue>
#include "../network/mongoose/mongoose.h"
#include "../network/mongoose/mongooseExt.h"
#include "../tools/ThreadPool.h"
#include "../crypto/PublicKey.h"
#include "../crypto/PrivateKey.h"
#include "../crypto/SymmetricKey.h"
#include "../types/UBinder.h"

namespace network {

class HttpClient;

class HttpClientWorker {
public:
    HttpClientWorker(int newId, HttpClient& parent);
    void sendGetRequest(const std::string& url, std::function<void(int,byte_vector&&)>&& callback);
    void sendRawRequest(const std::string& url, const std::string& method, const byte_vector& reqBody, std::function<void(int,byte_vector&&)>&& callback);
    int getId() {return id_;}
    void stop() {exitFlag_ = true;};
private:
    int id_;
    HttpClient& parentRef_;
    ThreadPool worker_;
    std::shared_ptr<mg_mgr> mgr_;
    std::atomic<bool> exitFlag_ = false;
    std::function<void(int,byte_vector&&)> callback_;
};

struct HttpClientSession {
    std::string connectMessage;
    shared_ptr<crypto::PrivateKey> clientPrivateKey;
    shared_ptr<crypto::SymmetricKey> sessionKey;
    long sessionId;
    shared_ptr<crypto::PublicKey> nodePublicKey;
};

class HttpClient {

public:
    HttpClient(const std::string& rootUrl, size_t poolSize);
    virtual ~HttpClient();

    void sendGetRequest(const std::string& url, const std::function<void(int,byte_vector&&)>& callback);
    void sendGetRequest(const std::string& url, std::function<void(int,byte_vector&&)>&& callback);

    void sendRawRequest(const std::string& url, const std::string& method, const byte_vector& reqBody, const std::function<void(int,byte_vector&&)>& callback);
    void sendRawRequest(const std::string& url, const std::string& method, const byte_vector& reqBody, std::function<void(int,byte_vector&&)>&& callback);

    /**
     * Authenticate self to the remote party. Blocks until the handshake is done. It is important to start() connection
     * before any use.
     */
    void start(const crypto::PrivateKey& clientKey, const crypto::PublicKey& nodeKey);

    /**
     * Execute a command over the authenticated and encrypted connection. In the case of network errors, restarts the
     * command.
     */
    void command(const std::string& name, const UBinder& params, std::function<void(UBinder&&)>&& onComplete);

    /**
     * Execute a command over the authenticated and encrypted connection. In the case of network errors, restarts the
     * command.
     */
    void command(const std::string& name, const UBinder& params, const std::function<void(UBinder&&)>& onComplete);

private:
    std::shared_ptr<HttpClientWorker> getUnusedWorker();
    void releaseWorker(int workerId);
    void execCommand(const std::string& name, const UBinder& params, std::function<void(UBinder&&)>&& onComplete);

    friend HttpClientWorker;

private:
    size_t poolSize_;
    std::queue<std::shared_ptr<HttpClientWorker>> pool_;
    std::mutex poolMutex_;
    std::condition_variable poolCV_;
    ThreadPool poolControlThread_;
    std::unordered_map<int, std::shared_ptr<HttpClientWorker>> usedWorkers_;
    std::shared_ptr<HttpClientSession> session_;
    std::string rootUrl_;

};

};

#endif //U8_HTTPCLIENT_H
