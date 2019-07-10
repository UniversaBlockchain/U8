//
// Created by flint on 7/10/19.
//

#ifndef U8_STRESSTESTTOOLS_H
#define U8_STRESSTESTTOOLS_H

#include "../tools/Queue.h"
#include "../crypto/cryptoCommon.h"
#include "../tools/ThreadPool.h"
#include <random>
#include <iomanip>
#include <cstring>
#include <atomic>
#include <chrono>

class RandomByteVectorGenerator {
public:
    RandomByteVectorGenerator() : minstdRand_(std::chrono::duration_cast<std::chrono::nanoseconds>(
            std::chrono::high_resolution_clock::now().time_since_epoch()).count()) {
    }
    byte_vector get(size_t size) {
        byte_vector res(size);
        size_t i = 0;
        while (i < size) {
            auto rnd = minstdRand_();
            memcpy(&res[i], &rnd, std::min(size - i, 4ul));
            i += 4;
        }
        return res;
    }
    size_t getRandomSize(size_t min, size_t max) {
        return minstdRand_() % (max - min + 1) + min;
    }

private:
    std::minstd_rand minstdRand_;
};

class QueueGrinder {
public:
    QueueGrinder(size_t queueCapacity, size_t minBufSize, size_t maxBufSize, size_t stepSize) {
        queueCapacity_ = queueCapacity;
        minBufSize_ = minBufSize;
        maxBufSize_ = maxBufSize;
        stepSize_ = stepSize;
    }
    byte_vector genPayload(RandomByteVectorGenerator& rg) {
        crypto::Digest digest(crypto::HashType::SHA256);
        size_t size = rg.getRandomSize(minBufSize_, maxBufSize_) + digest.getDigestSize();
        byte_vector payload = rg.get(size);
        digest.update(&payload[0], payload.size() - digest.getDigestSize());
        digest.doFinal();
        byte_vector hash = digest.getDigest();
        memcpy(&payload[payload.size() - digest.getDigestSize()], &hash[0], digest.getDigestSize());
        return payload;
    }
    void assertValidPayload(const byte_vector& payload) {
        crypto::Digest digest(crypto::HashType::SHA256);
        digest.update((void*)&payload[0], payload.size() - digest.getDigestSize());
        digest.doFinal();
        byte_vector hash = digest.getDigest();
        byte_vector savedHash(digest.getDigestSize());
        memcpy(&savedHash[0], &payload[payload.size() - digest.getDigestSize()], digest.getDigestSize());
        assert(hash == savedHash);
    }
    void fillStep(RandomByteVectorGenerator& rg) {
        size_t stepSize = rg.getRandomSize(1, stepSize_*2); // x2 for filling queue to its maximum size
        for (size_t i = 0; i < stepSize; ++i) {
            try {
                // manually control queue capacity because we want to have more queues than writer threads
                if (queue_.size() >= queueCapacity_) {
                    this_thread::sleep_for(1ms);
                    break;
                }
                queue_.put(genPayload(rg));
            } catch (const QueueClosedException& x) {
                break;
            }
        }
    }
    void takeStep(RandomByteVectorGenerator& rg) {
        size_t stepSize = rg.getRandomSize(1, stepSize_);
        for (size_t i = 0; i < stepSize; ++i) {
            try {
                byte_vector payload = queue_.get();
                assertValidPayload(payload);
                bytesTaken_ += payload.size();
            } catch (const QueueClosedException& x) {
                break;
            }
        }
    }
    size_t getQueueSize() {
        return queue_.size();
    }
    size_t getBytesTaken() {
        return bytesTaken_;
    }
    void closeQueue() {
        queue_.close();
    }
private:
    Queue<byte_vector> queue_;
    size_t queueCapacity_;
    size_t minBufSize_;
    size_t maxBufSize_;
    size_t stepSize_;
    std::atomic<size_t> bytesTaken_ = 0;
};

class QueueMultiGrinder {
public:
    QueueMultiGrinder(size_t writerThreadsCount, size_t readerThreadsCount, size_t queuesCount, size_t eachQueueCapacity) {
        for (size_t i = 0; i < queuesCount; ++i) {
            qgArr_.emplace_back(std::make_shared<QueueGrinder>(eachQueueCapacity, 270, 24*1024, ceil(eachQueueCapacity/10)));
        }
        for (size_t i = 0; i < readerThreadsCount; ++i) {
            readers_.emplace_back(std::make_shared<std::thread>([this,queuesCount](){
                RandomByteVectorGenerator rg;
                while(true) {
                    size_t queueToTake = rg.getRandomSize(0, queuesCount-1);
                    qgArr_[queueToTake]->takeStep(rg);
                    if (exitFlag_)
                        break;
                }
            }));
        }
        for (size_t i = 0; i < writerThreadsCount; ++i) {
            writers_.emplace_back(std::make_shared<std::thread>([this,queuesCount](){
                RandomByteVectorGenerator rg;
                while(true) {
                    size_t queueToFill = rg.getRandomSize(0, queuesCount-1);
                    qgArr_[queueToFill]->fillStep(rg);
                    if (exitFlag_)
                        break;
                }
            }));
        }
    }
    size_t getBytesTaken() {
        size_t sum = 0;
        for (auto it = qgArr_.begin(), itEnd = qgArr_.end(); it != itEnd; ++it)
            sum += it->get()->getBytesTaken();
        return sum;
    }
    size_t getSummaryQueuesSize() {
        size_t sum = 0;
        for (auto it = qgArr_.begin(), itEnd = qgArr_.end(); it != itEnd; ++it)
            sum += it->get()->getQueueSize();
        return sum;
    }
    void stopAndJoin() {
        exitFlag_ = true;
        for (auto it = qgArr_.begin(), itEnd = qgArr_.end(); it != itEnd; ++it)
            it->get()->closeQueue();
        for (auto it = writers_.begin(), itEnd = writers_.end(); it != itEnd; ++it)
            it->get()->join();
        for (auto it = readers_.begin(), itEnd = readers_.end(); it != itEnd; ++it)
            it->get()->join();
    }
private:
    std::vector<std::shared_ptr<QueueGrinder>> qgArr_;
    std::vector<std::shared_ptr<std::thread>> writers_;
    std::vector<std::shared_ptr<std::thread>> readers_;
    atomic<bool> exitFlag_ = false;
};

class QueuePoolGrinder {
public:
    QueuePoolGrinder(size_t writerThreadsCount, size_t readerThreadsCount, size_t queuesCount, size_t eachQueueCapacity)
            : writerPool_(writerThreadsCount), readerPool_(readerThreadsCount) {
        for (size_t i = 0; i < queuesCount; ++i) {
            qgArr_.emplace_back(std::make_shared<QueueGrinder>(eachQueueCapacity, 270, 24*1024, ceil(eachQueueCapacity/10)));
        }
        controlThread_ = std::make_shared<std::thread>([this,queuesCount]() {
            while (true) {
                readerPool_.execute([this,queuesCount](){
                    RandomByteVectorGenerator rg;
                    size_t queueToTake = rg.getRandomSize(0, queuesCount-1);
                    qgArr_[queueToTake]->takeStep(rg);
                });
                writerPool_.execute([this,queuesCount](){
                    RandomByteVectorGenerator rg;
                    size_t queueToFill = rg.getRandomSize(0, queuesCount-1);
                    qgArr_[queueToFill]->fillStep(rg);
                });
                if (exitFlag_)
                    break;
                if ((readerPool_.queueSize() > readerPool_.countThreads()*10) &&
                    (writerPool_.queueSize() > writerPool_.countThreads()*10)) {
                    this_thread::sleep_for(1ms);
                }
            }
        });
    }
    size_t getBytesTaken() {
        size_t sum = 0;
        for (auto it = qgArr_.begin(), itEnd = qgArr_.end(); it != itEnd; ++it)
            sum += it->get()->getBytesTaken();
        return sum;
    }
    size_t getSummaryQueuesSize() {
        size_t sum = 0;
        for (auto it = qgArr_.begin(), itEnd = qgArr_.end(); it != itEnd; ++it)
            sum += it->get()->getQueueSize();
        return sum;
    }
    void stopAndJoin() {
        exitFlag_ = true;
        for (auto it = qgArr_.begin(), itEnd = qgArr_.end(); it != itEnd; ++it)
            it->get()->closeQueue();
        controlThread_->join();
    }
private:
    std::vector<std::shared_ptr<QueueGrinder>> qgArr_;
    ThreadPool writerPool_;
    ThreadPool readerPool_;
    std::shared_ptr<std::thread> controlThread_;
    atomic<bool> exitFlag_ = false;
};

template<class GrinderClass>
void stressQueueTest() {
    long testDuration         = 135; // sec
    long recreateQueuesPeriod = 30; // sec
    size_t writerThreadsCount = 100;
    size_t readerThreadsCount = 100;
    size_t queuesCount        = 1000;
    size_t eachQueueCapacity  = 100;
    long startTime = getCurrentTimeMillis();
    long createQueuesTime = startTime;
    auto qmg = std::make_shared<GrinderClass>(writerThreadsCount, readerThreadsCount, queuesCount, eachQueueCapacity);
    size_t bytesCounter = 0;
    while (true) {
        this_thread::sleep_for(1s);
        long dt = getCurrentTimeMillis() - startTime;
        if (dt > testDuration*1000l)
            break;
        size_t bytesCount = bytesCounter + qmg->getBytesTaken();
        cout << "[test progress: " << dt/10/testDuration << "%] total memory processed: ";
        if (bytesCount > 1024*1024*1024)
            cout << bytesCount/1024/1024/1024 << " Gb";
        else
            cout << bytesCount/1024/1024 << " Mb";
        cout << ", avg speed: " << bytesCount*1000/dt/1024/1024 << " Mb/sec";
        cout << ", summary queues size: " << qmg->getSummaryQueuesSize() << endl;
        long dtRecreate = getCurrentTimeMillis() - createQueuesTime;
        if (dtRecreate > recreateQueuesPeriod*1000l) {
            cout << "recreate all queues and threads..." << endl;
            bytesCounter += qmg->getBytesTaken();
            qmg->stopAndJoin();
            qmg = std::make_shared<GrinderClass>(writerThreadsCount, readerThreadsCount, queuesCount, eachQueueCapacity);
            cout << "recreate all queues and threads... done" << endl;
            createQueuesTime = getCurrentTimeMillis();
        }
    }
    qmg->stopAndJoin();
}

#endif //U8_STRESSTESTTOOLS_H
