//
// Created by Tairov Dmitriy on 10.02.19.
//

#include "IOHandleThen.h"

namespace asyncio {

    IOHandleThen* IOHandleThen::then(result_cb callback) {
        if (!task.valid())
            throw std::logic_error("Task is not initialized.");

        task(std::move(callback));

        task = std::packaged_task<void(result_cb callback)>();

        return this;
    }

    IOHandleThen* IOHandleThen::prepareRead(size_t maxBytesToRead) {
        IOHandleThen *handle = this;

        if (readTask.valid())
            throw std::logic_error("Task already initialized.");

        std::packaged_task<void(read_cb callback)> newTask([handle, maxBytesToRead](read_cb callback) {
            handle->read(maxBytesToRead, callback);
        });

        readTask = std::move(newTask);

        return handle;
    }

    IOHandleThen* IOHandleThen::then(read_cb callback) {
        if (!readTask.valid())
            throw std::logic_error("Task is not initialized.");

        readTask(std::move(callback));

        readTask = std::packaged_task<void(read_cb callback)>();

        return this;
    }

    IOHandleThen* IOHandleThen::prepareWrite(const byte_vector& data) {
        IOHandleThen *handle = this;

        if (task.valid())
            throw std::logic_error("Task already initialized.");

        std::packaged_task<void(write_cb callback)> newTask([handle, data](write_cb callback) {
            handle->write(data, callback);
        });

        task = std::move(newTask);

        return handle;
    }

    IOHandleThen* IOHandleThen::prepareClose() {
        IOHandleThen *handle = this;

        if (task.valid())
            throw std::logic_error("Task already initialized.");

        std::packaged_task<void(close_cb callback)> newTask([handle](close_cb callback) {
            handle->close(callback);
        });

        task = std::move(newTask);

        return handle;
    }
}