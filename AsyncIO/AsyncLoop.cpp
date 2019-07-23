//
// Created by Dmitriy Tairov on 19.02.19.
//

#include "AsyncLoop.h"

namespace asyncio {

    AsyncLoop::AsyncLoop() {
        uv_loop_init(&loop);
        loop.data = nullptr;

        thread = std::thread([&]{
            int result = 0;
            int oldResult = 0;

            while (runned) {
                bool empty = queue.empty();
                if (!empty) {
                    try {
                        queue.get()();
                    }
                    catch (const QueueClosedException& x) {
                        break;
                    }
                    catch (const exception &e) {
                        cerr << "error in async loop thread: " << e.what() << endl;
                    }
                    catch (...) {
                        cerr << "unknown error in async loop thread" << endl;
                    };
                }

                oldResult = result;
                result = uv_run(&loop, UV_RUN_NOWAIT);

                if ((result <= oldResult) && empty)
                    std::this_thread::sleep_for(5ms);
            }
        });
    };

    AsyncLoop::~AsyncLoop() {
        if (runned)
            runned = false;

        uv_loop_close(&loop);
        thread.join();
    };

    void AsyncLoop::stop() {
        runned = false;
    };
}