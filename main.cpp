#include <iostream>
#include <sys/stat.h>

#include "cryptoCommon.h"
#include "PrivateKey.h"
#include "base64.h"
#include "Scripter.h"
#include "tools.h"

#include "AsyncIO.h"

using namespace std;

void usage();
void testCrypto();

#define NUM_THREADS     5
#define BUFF_SIZE       4096
#define NUM_ITERATIONS  5
#define TEST_FILE_SUMM  -2582267
#define NUM_BLOCKS      256

std::shared_ptr<asyncio::IOHandle> file[NUM_THREADS];
static uv_buf_t uvBuf[NUM_THREADS];
static char dataBuf[NUM_THREADS][BUFF_SIZE];
static uv_sem_t stop[NUM_THREADS];
size_t fileSize[NUM_THREADS];
int summ[NUM_THREADS];
int block[NUM_THREADS];
struct stat statbuf;

//Reading

static void onClose(asyncio::ioHandle *req) {
    uv_fs_req_cleanup(req);
    uv_sem_post(&stop[(long)req->data - 1]);
    printf("Close file in thread: %i\n", (long) req->data);
    delete req;
}

static void onRead(asyncio::ioHandle *req) {
    uv_fs_req_cleanup(req);
    if (req->result < 0) {
        fprintf(stderr, "error: %s\n", uv_strerror(req->result));
    } else if (req->result == 0) {
        file[(long)req->data - 1]->close(onClose, req->data);
        //closeReq[(long) req->data - 1].data = req->data;
        //uv_fs_close(asyncio::asyncLoop, &closeReq[(long) req->data - 1], openReq[(long) req->data - 1].result, onClose);
    } else {
        for (int i = 0; i < req->result; i++)
            summ[(long)req->data - 1] += dataBuf[(long)req->data - 1][i];
        //printf("Thread: %i. Readed %i bytes\nSumm = %i\n", (long) req->data, req->result, summ[(long)req->data - 1]);
        fileSize[(long)req->data - 1] += req->result;

        file[(long)req->data - 1]->read(&uvBuf[(long)req->data - 1], onRead, req->data);
        //readReq[(long) req->data - 1].data = req->data;
        //uv_fs_read(asyncio::asyncLoop, &readReq[(long) req->data - 1], openReq[(long) req->data - 1].result, &uvBuf[(long) req->data - 1], 1, -1, onRead);
    }

    delete req;
}

static void onOpen(asyncio::ioHandle *req) {
    uv_fs_req_cleanup(req);
    printf("Open file in thread %i\n", (long) req->data);
    if (req->result < 0) {
        fprintf(stderr, "error: %s\n", uv_strerror(req->result));
    } else {
        uvBuf[(long)req->data - 1] = uv_buf_init(dataBuf[(long)req->data - 1], BUFF_SIZE);

        file[(long)req->data - 1]->read(&uvBuf[(long)req->data - 1], onRead, req->data);
        //readReq[(long) req->data - 1].data = req->data;
        //uv_fs_read(asyncio::asyncLoop, &readReq[(long) req->data - 1], req->result, &uvBuf[(long) req->data - 1], 1, -1, onRead);
    }
}

void readFileCallback(void* data, size_t len, ssize_t result) {
    printf("Readed file. Size = %i. Result = %i\n", (int) len, (int) result);

    long sum = 0;
    for (int i = 0; i < len; i++)
        sum += ((char*) data)[i];

    if (sum != -BUFF_SIZE * NUM_BLOCKS / 2)
        fprintf(stderr, "mismatch test file sum in readFileCallback\n");

    free(data);

    uv_sem_post(&stop[0]);
}

//Writing

static void onWrite(asyncio::ioHandle *req) {
    uv_fs_req_cleanup(req);
    if (req->result < 0)
        fprintf(stderr, "error: %s\n", uv_strerror(req->result));

    //printf("Thread: %i. Writed %i bytes\n", (long) req->data, req->result);
    fileSize[(long)req->data - 1] += req->result;

    if (++block[(long)req->data - 1] < NUM_BLOCKS)
        file[(long)req->data - 1]->write(&uvBuf[(long)req->data - 1], onWrite, req->data);
    else
        file[(long)req->data - 1]->close(onClose, req->data);

    delete req;
}

static void onOpenWrite(asyncio::ioHandle *req) {
    uv_fs_req_cleanup(req);
    printf("Open file for writing in thread %i\n", (long) req->data);
    if (req->result < 0) {
        fprintf(stderr, "error: %s\n", uv_strerror(req->result));
    } else {
        uvBuf[(long)req->data - 1] = uv_buf_init(dataBuf[(long)req->data - 1], BUFF_SIZE);

        file[(long)req->data - 1]->write(&uvBuf[(long)req->data - 1], onWrite, req->data);
    }
}

void writeFileCallback(ssize_t result) {
    printf("Writed file. Result = %i\n", (int) result);

    uv_sem_post(&stop[0]);
}

void testAsyncFile() {
    printf("testAsyncFile()...\n");

    asyncio::initAndRunLoop();

    printf("Read test...\n");

    if (stat("./../ext/linux/libv8.7z", &statbuf) == -1)
        fprintf(stderr, "error get test file size\n");

    double fTimeStart = clock() / (double)CLOCKS_PER_SEC;

    vector<thread> ths;

    for (int t = 0; t < NUM_THREADS; t++) {
        fileSize[t] = 0;
        summ[t] = 0;

        ths.emplace_back([t](){
            for (int i = 0; i < NUM_ITERATIONS; i++) {
                uv_sem_init(&stop[t], 0);

                //asyncio::IOHandle f;
                file[t] = std::make_shared<asyncio::IOHandle>();

                file[t]->open("./../ext/linux/libv8.7z", O_RDONLY, 0, onOpen, (void *) (t + 1));

                //openReq[t].data = (void *) (t + 1);
                //uv_fs_open(asyncio::asyncLoop, &openReq[t], "./../ext/linux/libv8.7z", O_RDONLY, 0, onOpen); //code.js

                uv_sem_wait(&stop[t]);
                uv_sem_destroy(&stop[t]);
            }
        });
    }

    printf("Threads started\n");

    size_t all = 0;
    for (int t = 0; t < NUM_THREADS; t++) {
        ths[t].join();
        file[t]->free();
        if (fileSize[t] != statbuf.st_size * NUM_ITERATIONS)
            fprintf(stderr, "mismatch test file size in thread %i\n", t + 1);
        if (summ[t] != TEST_FILE_SUMM * NUM_ITERATIONS)
            fprintf(stderr, "mismatch test file sum in thread %i\n", t + 1);
        all += fileSize[t];
    }

    ths.clear();

    printf("Threads completed\n");

    double fTimeStop = clock() / (double)CLOCKS_PER_SEC;
    printf("Time of reading %i files %f sec.\nTotal files size %lld bytes\n", NUM_THREADS * NUM_ITERATIONS, fTimeStop - fTimeStart, all);

    printf("Write test...\n");

    fTimeStart = clock() / (double)CLOCKS_PER_SEC;

    for (int t = 0; t < NUM_THREADS; t++) {
        fileSize[t] = 0;

        //Init test buffer
        for (int i = 0; i < BUFF_SIZE; i++)
            dataBuf[t][i] = i % 256;

        ths.emplace_back([t](){
            for (int i = 0; i < NUM_ITERATIONS; i++) {
                uv_sem_init(&stop[t], 0);
                block[t] = 0;

                char fileName[16];
                sprintf(fileName, "TestFile%i.bin", t);

                file[t]->open(fileName, O_CREAT | O_WRONLY, S_IRWXU | S_IRWXG | S_IRWXO, onOpenWrite, (void *) (t + 1));

                uv_sem_wait(&stop[t]);
                uv_sem_destroy(&stop[t]);
            }
        });
    }

    printf("Threads started\n");

    all = 0;
    for (int t = 0; t < NUM_THREADS; t++) {
        ths[t].join();
        file[t]->free();
        if (fileSize[t] != BUFF_SIZE * NUM_BLOCKS * NUM_ITERATIONS)
            fprintf(stderr, "mismatch test file size (writing) in thread %i\n", t + 1);
        all += fileSize[t];
    }

    printf("Threads completed\n");

    fTimeStop = clock() / (double)CLOCKS_PER_SEC;
    printf("Time of writing %i files %f sec.\nTotal files size %lld bytes\n", NUM_THREADS * NUM_ITERATIONS, fTimeStop - fTimeStart, all);

    printf("Reading the entire files test...\n");

    fTimeStart = clock() / (double)CLOCKS_PER_SEC;

    uv_sem_init(&stop[0], 0);

    for (int t = 0; t < NUM_THREADS; t++) {
        char fileName[16];
        sprintf(fileName, "TestFile%i.bin", t);

        for (int i = 0; i < NUM_ITERATIONS; i++)
            asyncio::file::readFile(fileName, readFileCallback);
    }

    for (int i = 0; i < NUM_THREADS * NUM_ITERATIONS; i++)
        uv_sem_wait(&stop[0]);
    uv_sem_destroy(&stop[0]);

    fTimeStop = clock() / (double)CLOCKS_PER_SEC;
    all = NUM_THREADS * NUM_ITERATIONS * NUM_BLOCKS * BUFF_SIZE;
    printf("Time of reading (by asyncio::file::readFile) %i files %f sec.\nTotal files size %lld bytes\n", NUM_THREADS * NUM_ITERATIONS, fTimeStop - fTimeStart, all);

    printf("Writing the entire files test...\n");

    fTimeStart = clock() / (double)CLOCKS_PER_SEC;

    uv_sem_init(&stop[0], 0);

    for (int t = 0; t < NUM_THREADS; t++) {
        char fileName[16];
        sprintf(fileName, "TestEntireFile%i.bin", t);

        for (int i = 0; i < NUM_ITERATIONS; i++)
            asyncio::file::writeFile(fileName, dataBuf, BUFF_SIZE, writeFileCallback);
    }

    for (int i = 0; i < NUM_THREADS * NUM_ITERATIONS; i++)
        uv_sem_wait(&stop[0]);
    uv_sem_destroy(&stop[0]);

    fTimeStop = clock() / (double)CLOCKS_PER_SEC;
    all = NUM_THREADS * NUM_ITERATIONS * BUFF_SIZE;
    printf("Time of writing (by asyncio::file::writeFile) %i files %f sec.\nTotal files size %lld bytes\n", NUM_THREADS * NUM_ITERATIONS, fTimeStop - fTimeStart, all);

    asyncio::deinitLoop();

    printf("testAsyncFile()...done\n\n");
}

int main(int argc, const char **argv) {

    initCrypto();
    testCrypto();

    testAsyncFile();

    if (argc == 1) {
        usage();
        return 1;
    }
    else {
        return Scripter::Application(argv[0], [=](auto se) {
            vector<string> args(argv + 1, argv + argc);
            if (args[0] == "-e")
                cout << se->evaluate(args[1]) << endl;
            else {
                se->runAsMain(loadAsStringOrThrow(args[0]), vector<string>(args.begin() + 1, args.end()), args[0]);
            }
            return 0;
        });
    }
}

void testCrypto() {
    cout << "testCrypto()..." << endl;
    auto strE = string("65537");
    auto strP = string("166438984042065497734914068855004282550440498640409398677336546927308216381652973497991047247926391839370729407435808892969122519401712385345233169193805241631583305760736715545141142026706356434887369071360563025254193571054123994143642688583692644185979182810270581846072984179584787077062088254715187805453");
    auto strQ = string("132243238518154268249184631952046833494949171132278166597493094022019934205919755965484010862547916586956651043061215415694791928849764419123506916992508894879133969053226176271305106211090173517182720832250788947720397461739281147258617115635022042579209568022023702283912658756481633266987107149957718776027");
    auto body = base64_decode("cXdlcnR5MTIzNDU2");
    auto signfromJava = base64_decode("SWegggnmLTKKVqDWPdo3qVD7S1Y/VnQD1xCz70LHhg2PBksBfkGKdX4xeWUEqBl3/iq8Ketfb+3AbGYEKgBiCrhg4u3AQnKIe61F9Z3ZW7PexmK3h0cLKQ7ei2BjZXRhv839/9H7TKd5trnvZMMxAc8wmosZ96UVLBQ71F8L/74zTb+q+9ius2jb47EMqT3VOWNP/RkC5WpONj/5uBVNzNapQbCF8JrI4lBmQ9zuH+yGAp+Lm2blZYB0vkDxjRyEs38oxcHc6mW5OlTTviT0VN4AZiE7FKdRJBKR2+oigiLFyK/uvSc5UzO89JX14yWb7huMf8fvDHTB1vZOWHDyRw==");
    auto sign512fromJava = base64_decode("CXj5E9wLMKFT7qht6tODVRNFvfNExFQH7VkPeYUbt2R5cLc6d+X47+a0GOG6nQgqQOjZ93smHMeJCdTAgHw9EYftUVQf6rID0RiQ8sWSHHWD1wHmhiSRoxUjcRcKz6tvC+aQ2PS26ArS1VXqusZV9H5XbXoY+EVKHgKMhYtgJEQivqDMCmOP6YYaJhOYQX2uYZTU3fPfXW6DlqNIziMihp/wZa57qcp9b4aHhmzXypg4/kGGVhQLIwSm9qGdztw03qor1/d0McLMBzAOoJ5FIx5EndeELXcJ6SUVwt9adnDrUK5nVSZAIYBuCrAHpHw/cJwU1FeaWKDhoDJEFMJDVw==");
    auto sign3384fromJava = base64_decode("SC1Ucu2SdoIxr3aXto8qxnfpk9P71zrnawwFdSxlrKg3AwJ4a9bwPALuw0VQbiwUGjljPE61C5eVXHNpIFGpWNZrdqktodjEumR35sk0/CiOdP1sS06w5vZ0o+wfn8HSpdh4cSBePKLyhzbzqk/+Ju6fsya2wR4Q/eS5xMQqjh0QrQ3P1LM4QtRxiWwkyJAuNt2IFas2GgDTWHTWR+ZKLlKk3bZVRd7cjZPfFKof9o7MmYnvxvl08G//6nV7ZK9uwZYLLiqYOtgZ5to/g40yql+ozMrf9G+93UdB6SaxzlFT6qJKDRkOUHtd2UTNrcBdEQ+zBBzVkzItjGHThwvNGA==");
    auto bodyForSign = vector<unsigned char>(body.begin(), body.end());
    auto sigForVerify = vector<unsigned char>(signfromJava.begin(), signfromJava.end());
    auto sig512ForVerify = vector<unsigned char>(sign512fromJava.begin(), sign512fromJava.end());
    auto sig3384ForVerify = vector<unsigned char>(sign3384fromJava.begin(), sign3384fromJava.end());

    PrivateKey privateKey;
    privateKey.initForDebug_decimal(strE, strP, strQ);
    auto publicKey = privateKey.getPublicKey();

    vector<unsigned char> encrypted;
    publicKey->encrypt(bodyForSign, encrypted);
    cout << "encrypted: " << base64_encode(&encrypted[0], encrypted.size()) << endl;
    vector<unsigned char> decrypted;
    privateKey.decrypt(encrypted, decrypted);
    cout << "decrypted: " << base64_encode(&decrypted[0], decrypted.size()) << endl;

    auto verifyResult = publicKey->verify(sigForVerify, bodyForSign, SHA1);
    cout << "verifyResult: " << verifyResult << endl;

    verifyResult = publicKey->verify(sig512ForVerify, bodyForSign, SHA512);
    cout << "verify sign512fromJava (should be 1): " << verifyResult << endl;
    verifyResult = publicKey->verify(sig512ForVerify, bodyForSign, SHA3_256);
    cout << "verify sign512fromJava (should be 0): " << verifyResult << endl;
    verifyResult = publicKey->verify(sig3384ForVerify, bodyForSign, SHA3_256);
    cout << "verify sig3384ForVerify (should be 1): " << verifyResult << endl;
    verifyResult = publicKey->verify(sig3384ForVerify, bodyForSign, SHA512);
    cout << "verify sig3384ForVerify (should be 0): " << verifyResult << endl;

    vector<unsigned char> signFromCpp;
    privateKey.sign(bodyForSign, SHA1, signFromCpp);
    cout << "\nsignFromCpp: " << base64_encode(&signFromCpp[0], signFromCpp.size()) << endl;
    vector<unsigned char> sign512FromCpp;
    privateKey.sign(bodyForSign, SHA512, sign512FromCpp);
    cout << "sign512FromCpp: " << base64_encode(&sign512FromCpp[0], sign512FromCpp.size()) << endl;
    vector<unsigned char> sign3384FromCpp;
    privateKey.sign(bodyForSign, SHA3_256, sign3384FromCpp);
    cout << "sign3384FromCpp: " << base64_encode(&sign3384FromCpp[0], sign3384FromCpp.size()) << endl;
    verifyResult = publicKey->verify(signFromCpp, bodyForSign, SHA1);
    cout << "\nverify signFromCpp (should be 1): " << verifyResult << endl;
    verifyResult = publicKey->verify(signFromCpp, bodyForSign, SHA512);
    cout << "verify signFromCpp (should be 0): " << verifyResult << endl;
    verifyResult = publicKey->verify(sign512FromCpp, bodyForSign, SHA512);
    cout << "verify sign512FromCpp (should be 1): " << verifyResult << endl;
    verifyResult = publicKey->verify(sign512FromCpp, bodyForSign, SHA3_256);
    cout << "verify sign512FromCpp (should be 0): " << verifyResult << endl;
    verifyResult = publicKey->verify(sign3384FromCpp, bodyForSign, SHA3_256);
    cout << "verify sign3384FromCpp (should be 1): " << verifyResult << endl;
    verifyResult = publicKey->verify(sign3384FromCpp, bodyForSign, SHA512);
    cout << "verify sign3384FromCpp (should be 0): " << verifyResult << endl;

    cout << "testCrypto()... done!" << endl << endl;
}

void usage() {
    cout << R"End(
=== U8 Universa execution environment === (beta)

Usage:

    u8 [-e "`js code to avaulate`"] | <javascript_file_name>

if -e switch present, evaluates the second command line parameter as Javascript code and
prints out result ou stdout.

Otherwise executes sctipt fromthe given .js file specified as the first parameter.
All other parameters are passed to the main(argv) function if present in the script file or
if it is imported from it.

)End";
}

/* more specific form of Scripter application:
 *
int manual_main(int argc, char **argv) {
    auto platform = Scripter::initV8(argv[0]);
    try {
        shared_ptr<Scripter> se = Scripter::New();
        this_thread::sleep_for(4s);
    }
    catch (exception &e) {
        cerr << "uncaught error: " << e.what() << endl;
    }
    catch (...) {
        cerr << "uncaught unspecified error: " << endl;
    }
    Scripter::closeV8(platform);
    return 0;
}
*/