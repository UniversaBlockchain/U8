//
// Created by Dmitriy Tairov on 19.02.19.
//

#include "AsyncLoop.h"

namespace asyncio {

    AsyncLoop::AsyncLoop() {
        loop = uv_loop_new();
        loop->data = nullptr;

        thread = std::thread([&]{
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

                int result = uv_run(loop, UV_RUN_NOWAIT);

                if (!result && empty)
                    std::this_thread::sleep_for(1ms);
            }
        });
    };

    AsyncLoop::~AsyncLoop() {
        runned = false;
        uv_loop_close(loop);
        thread.join();
    };
}