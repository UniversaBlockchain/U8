//
// Created by Dmitriy Tairov on 19.02.19.
//

#include "AsyncLoop.h"

namespace asyncio {

    AsyncLoop::AsyncLoop() {
        loop = uv_loop_new();
        loop->data = nullptr;

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
                result = uv_run(loop, UV_RUN_NOWAIT);

                if ((result <= oldResult) && empty)
                    std::this_thread::sleep_for(1us);
            }
        });
    };

    AsyncLoop::~AsyncLoop() {
        runned = false;
        uv_loop_close(loop);
        thread.join();
    };
}