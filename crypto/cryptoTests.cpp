//
// Created by Leonid Novikov on 2019-01-18.
//

#include "cryptoTests.h"
#include <iostream>
#include <vector>
#include <map>
#include <unordered_map>
#include <random>
#include <atomic>
#include <queue>
#include "base64.h"
#include "PrivateKey.h"
#include "PublicKey.h"
#include "HashId.h"
#include "KeyAddress.h"
#include "Safe58.h"
#include "../tools/ThreadPool.h"
#include "SymmetricKey.h"
#include "../AsyncIO/AsyncIO.h"

using namespace std;
using namespace crypto;

CryptoTestResults cryptoTestResults;
std::minstd_rand minstdRand;

CryptoTestResults::CryptoTestResults() {
    minstdRand.seed(time(0));
}

CryptoTestResults::~CryptoTestResults() {
    if (errorsCounter > 0) {
        auto os1 = (errorsCounter == 0 ? &cout : &cerr);
        *os1 << "CryptoTestResults: errors = " << errorsCounter << " (from " << checksCounter << ")" << endl;
    }
}

void CryptoTestResults::incrementErrorsCounter() {
    ++errorsCounter;
}

void CryptoTestResults::incrementChecksCounter() {
    ++checksCounter;
}

template <class T>
void checkResult(const string& msg, const T expected, const T result) {
    cryptoTestResults.incrementChecksCounter();
    bool boolRes = result == expected;
    auto os1 = boolRes ? &cout : &cerr;
    if (!boolRes) {
        *os1 << "checkResult " << msg << " (expected " << expected << "): " << result << endl;
        cryptoTestResults.incrementErrorsCounter();
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

    PrivateKey privateKey(strE, strP, strQ);
    PublicKey publicKey(privateKey);

    vector<unsigned char> encrypted;
    publicKey.encrypt(bodyForSign, encrypted);
    cout << "encrypted: " << base64_encode(&encrypted[0], encrypted.size()) << endl;
    vector<unsigned char> decrypted;
    privateKey.decrypt(encrypted, decrypted);
    cout << "decrypted: " << base64_encode(&decrypted[0], decrypted.size()) << endl;

    checkResult<bool>("sigForVerify", true, publicKey.verify(sigForVerify, bodyForSign, SHA1));
    checkResult<bool>("sigForVerify", false, publicKey.verify(sigForVerify, bodyForSign, SHA3_256));
    checkResult<bool>("sig512ForVerify", true, publicKey.verify(sig512ForVerify, bodyForSign, SHA512));
    checkResult<bool>("sig512ForVerify", false, publicKey.verify(sig512ForVerify, bodyForSign, SHA3_256));
    checkResult<bool>("sig3384ForVerify", true, publicKey.verify(sig3384ForVerify, bodyForSign, SHA3_256));
    checkResult<bool>("sig3384ForVerify", false, publicKey.verify(sig3384ForVerify, bodyForSign, SHA512));

    vector<unsigned char> signFromCpp;
    privateKey.sign(bodyForSign, SHA1, signFromCpp);
    cout << endl << "signFromCpp: " << base64_encode(&signFromCpp[0], signFromCpp.size()) << endl;
    vector<unsigned char> sign512FromCpp;
    privateKey.sign(bodyForSign, SHA512, sign512FromCpp);
    cout << "sign512FromCpp: " << base64_encode(&sign512FromCpp[0], sign512FromCpp.size()) << endl;
    vector<unsigned char> sign3384FromCpp;
    privateKey.sign(bodyForSign, SHA3_256, sign3384FromCpp);
    cout << "sign3384FromCpp: " << base64_encode(&sign3384FromCpp[0], sign3384FromCpp.size()) << endl << endl;

    checkResult<bool>("signFromCpp", true, publicKey.verify(signFromCpp, bodyForSign, SHA1));
    checkResult<bool>("signFromCpp", false, publicKey.verify(signFromCpp, bodyForSign, SHA512));
    checkResult<bool>("sign512FromCpp", true, publicKey.verify(sign512FromCpp, bodyForSign, SHA512));
    checkResult<bool>("sign512FromCpp", false, publicKey.verify(sign512FromCpp, bodyForSign, SHA3_256));
    checkResult<bool>("sign3384FromCpp", true, publicKey.verify(sign3384FromCpp, bodyForSign, SHA3_256));
    checkResult<bool>("sign3384FromCpp", false, publicKey.verify(sign3384FromCpp, bodyForSign, SHA512));

    cout << "testCrypto()... done!" << endl << endl;
}

inline vector<unsigned char> str64Tovector(const string& str) {
    auto str64 = base64_decode(str);
    return vector<unsigned char>(str64.begin(), str64.end());
}

void testHashId() {
    cout << "testHashId()..." << endl;

    // generated on Java
    checkResult<string>("hashId", "abQChMlTZ6nrby9UTNfr91MdjKjr4H5VtywvWq/K+o1mIeoJ/cNLYuoOVBtLW0eBd5OC0e7fQlMZsMcKbzBJ97uwQ7QI+jY26Jd19G4byd3ve06VY2y+t3wHj2y1hmjp", HashId::of(str64Tovector("HQ==")).toBase64());
    checkResult<string>("hashId", "187RW/C5bRW9Rov6+jLtrCOzMl5dufPu8RxRrtu4LSVBj+aXm5hYYolgnfvqjeR/pf65Z+OzkRNfhWN4AYxaO4/eA2r7vIgt8S23R0bbp+L4ivfwAzb8/2dsn9sqFQcg", HashId::of(str64Tovector("j28=")).toBase64());
    checkResult<string>("hashId", "Yk8V6UNw4Fx42ctTjI6O2bquKqhO/C2nOoHQBGtfk9J+2zp/p34hcyhjIF419QhpA5UNw3+e7Lp/8sHEar41gt+KQ1Da8gStNs8WaN9wsBPgJwys3UQCSvPUCeYaPEZy", HashId::of(str64Tovector("zsYO")).toBase64());
    checkResult<string>("hashId", "086VrKm65PpSvG+YFA6ZSWr7X+bwRAPvD0CxJ8sYvMJz/DRGxGEHTTe8hSYS3/Ya/jIo6u/8m/iqq9cYTfc5zzHVhJjYFzLnV5qJXQMXw+1+vppKMg/OVayakK2q+EAv", HashId::of(str64Tovector("dcwrTA==")).toBase64());
    checkResult<string>("hashId", "dV5Q2BLnxggASg7/5Pqt3xXBx+/EU4gJAmi7FAae0hKWUD50m2LItoPbQ21TxW6zjw7sBkqmUlPcBug5XgTCBqnKKLVopHI5w9LXLaWxbbsyICapzDKJFik/2Xjcp3/z", HashId::of(str64Tovector("J/cQk/Y=")).toBase64());
    checkResult<string>("hashId", "rg2e2sa+SaV6jj7g7QnzCHyDxlmmoxn5ag7wB+E9mpVC3NKCpRo0oDwWFDxtZwbQLFgIry4/bES4m4hvYuuajqJMKQlx84l9o5Pqp2GnZvgwx/lw7JAbc0TwOoALfEQc", HashId::of(str64Tovector("AyhCK7h8")).toBase64());
    checkResult<string>("hashId", "kIqmO0HtznUEZC3buMJhZJdOYCjRFon6BFkBH+zSDGilEBtta4qceLIyLM54/3dvaYGS3SExxGCQwRFItn6wFM4d6hAnxKMc14SqXXuFQcgYBVBloFoFlYOrwApf1y20", HashId::of(str64Tovector("1sKgWTHz4g==")).toBase64());
    checkResult<string>("hashId", "wpNTH3tH1yvrBR7PjBf9eCqapNXReYEBlDzsdEkVEpfNAJSz7mp0PQtBud06s4djxvPfYgXd0eRE9pNRztgo0WL0tS5WgrlGF2afOzEAtPGgFApWJGXdbITqxBFqDmZl", HashId::of(str64Tovector("ZW5bHTm5NMk=")).toBase64());
    checkResult<string>("hashId", "ib6VzL1pn8z71fegpyi2RRVnBKPtGQ5jii9qnRRfV4WNKbX70k7sbARrRDk/ObHlZRrHnOOsA72oZQQf1dVOggvC/xmylpoYbItcymXvtl5BdaoslezrwnSg85WrWmyA", HashId::of(str64Tovector("vMdu3jT6S5Bh")).toBase64());
    checkResult<string>("hashId", "oiANiFwv9SnQs8KfccV9qXnrq3yQZgN8dfDAr0Nx3YoWyqpXfAXGovq3zzg8dUuXlrd6X/xNPAPk0eGOT18F220CmqEXsBCMh4M3mw0SLFmnpHmK6Ic2uwe2DEibhnwO", HashId::of(str64Tovector("/k22fv67FWhqZA==")).toBase64());
    checkResult<string>("hashId", "IH+YBIBov6FAdPmqqrs3JrRGQuaER5vcoX7zixA8fPh1Y2AG4UKjtxTHAMZDMFaMaCRbSrA+nZmEtJKWOK+gilF+usmQ4ZTXfm69oUG5dEtrxNf2TdNBWyROQUMQ1i7o", HashId::of(str64Tovector("z974rC2DPiFmZNA=")).toBase64());
    checkResult<string>("hashId", "F/cj+UGAV6ZUG670UEMT6F8l7XIMmbWQeFgmIcc8nRCuRx2+R2dfDTOfL78KARbv60t7w8bOHTs67CcY19taJP/MBmzFtQ8k4e/gldRgLouo1lOXRWIGGNYLer4j3J74", HashId::of(str64Tovector("EjqKZvcxfGSiZJ4B")).toBase64());
    checkResult<string>("hashId", "l2e8P81BDrYPDNFZOhMhfpnYp5ouP1zes8xIFL4IoC3byLNrMAVRD52gHamnu786B8uZrC+7Y5uTO9H0ij+YLFCrZgnQ+FX0R3EpGafu76GfyUkpYmvupiwv0NNgvkCn", HashId::of(str64Tovector("DSkfpeeVLb1mI7ro6g==")).toBase64());
    checkResult<string>("hashId", "9XNEeraTptjbuQh+zRUgaPUWvqAicGhLi0Uctuwk/VTE0/H0qnSM0vJGm53tkhQsaT00LGGZfn8hpLfeXKNsi8I9PM3gP7L20woSZ/qr6bfZd82lYsKwU07QOiROm0Nw", HashId::of(str64Tovector("ljzvwu9bLsLherwpHQg=")).toBase64());
    checkResult<string>("hashId", "12WYiD0LNo0GAJUENnHXRv5YhnJlJVBgmbMXBHmV5knbGc036n4/X9cxjf3rdJMKzHcSXA9v+PfxnQfyVLbvKQwXnYE3CV1LkZeeBVOkP5Cq8xFqL98qcKRuhmmZxiS3", HashId::of(str64Tovector("5k0ZwN7GzwUAg1wBxkU2")).toBase64());
    checkResult<string>("hashId", "dsZQXjBx4kHETN5HZ2Cohj18h6OrqldRBiDFD1AdwF3YjQ0rErqE961/nna4JzRit1xsKvknBumrMv5UioHUVcNuNOqv0ZBUcuoyRFckZYj1kokCycN4rMrgkCuYXoMC", HashId::of(str64Tovector("QQ7Zh7Ru2NSg1yEEFU+KWQ==")).toBase64());
    checkResult<string>("hashId", "FwfGzT2077bo0m74VCjylMYXARQv5unJXb1/VY0lgHkc6ONppb4vLCVTYka20yC8QwYzeOVIu0FOQyj66EeQxtZDtXc4lW3Gx4YjSG8V4XlpN4UHyokxO2V9x7f2lS45", HashId::of(str64Tovector("BWP1D92B08/Z/r4kaqQB8Vg=")).toBase64());
    checkResult<string>("hashId", "F56K7X80S56M/XH4st0eXKiSLEXv7DGY5NvC9wYooCdOGxoUT14kpGrw/K/+KYrghOO/rU71z7qUyNTwP+X0pDcuqqc/qdE1p//c12OYdHEHqOm3C75s1h8c8/mJNIn6", HashId::of(str64Tovector("0oQ8KW2Y5xdpD3e2VsLDSOoG")).toBase64());
    checkResult<string>("hashId", "76bihW7/5+pqBwn7mWRz1mKcGuUd+5RI37BQf45LdQKvIBvBUAlZm2jwL9tPuuRCxjGLsvCIPMGK3iwQE2V5guK7/vgPxihX62Avw6Is9shPd910nIb6u9cwb/dxD1sn", HashId::of(str64Tovector("58iXCAsf6wFqSS5foBYJwF+Nyw==")).toBase64());
    checkResult<string>("hashId", "wdacSc48mGUsYb83/OhwFTKoBcH+mM25SaSwSNLRcq3fKMO50tEY3hAT/4KaFx6pWLQU+U2qRc3W+SRHsrfwZPzafJLKvZNHjSzw7b5NXnlTmINz0ZeJiAJ/OB4lp6gS", HashId::of(str64Tovector("uqQOAWTbL25940vvR8oapZ9xTBY=")).toBase64());
    checkResult<string>("hashId", "nOUU0rb9Ks6fw3S9tpsmvpYt4oyp26JuBsmKIU7UMfEOZ0G5rMbYvjUgm3Lq1iu17mVvtzLvAr1yoodZ5OZgREJrGlxAJ7RiEFscrDPeimFKjVy2i1nETFkeoseoXd4o", HashId::of(str64Tovector("WCOOADiJKa67AxDPRwENGezsZG1x")).toBase64());
    checkResult<string>("hashId", "invB6VXyeq5y/Vz04Gd7ko2EhJ+zUNDUabbFeSlZZheg3fWRW1zM0D7YNnv5WGFSeKZ193T/7AMOqwKLp0bxs7Rnm8mNannpy4s04HaK2OxptaxSTGufe6tFW0qA7uz5", HashId::of(str64Tovector("jR+uK5+Gl/1jHrztDGeStCl+IQBOPQ==")).toBase64());
    checkResult<string>("hashId", "2bPEQWvezayb13Urfv9iEg+1NCnFgejWKVON9/4pxIgP9X1SYZyBu3ei+UCHQxwBi/lQmCzqGK0MqBsFQEPeGBEMpM96HA0uV2oAQwNFJscWIV8FTlV65PA6cZbgXv8U", HashId::of(str64Tovector("4oQwIDVotJ43xgNvab3tV2SQHMzH4mo=")).toBase64());
    checkResult<string>("hashId", "nbytRPyUyFKt0JalukS75XWxD2GLrYK8fAsJ4c7DEokjL1skHRS4IYk5sNVRy49t24IWzD0NBLRZTsbZv4Ltad4PwhyXt528R9xOjb9hVIfCarloaC8H4SYCK0hEsa6c", HashId::of(str64Tovector("dTxmvpuLppjqtb7xUJhNW4AY/j56kzhE")).toBase64());
    checkResult<string>("hashId", "6naN8fO7dWocEUMkcX0aqKVb292bwnPfEmF33mkhnOsRoHVdaTBFKv39WEbN85GK3+sS5vDNv2R6X9tBf9MVkNu879UgH/JNrDiuuyUxJ4/hJsiNEFp3c1hdAIkYMff3", HashId::of(str64Tovector("wFnsep7ALWgCFohNLCU1yuArpbCjkkedaA==")).toBase64());
    checkResult<string>("hashId", "sVnFyb4xt/ionN/pOGHcwMsi3OCFvVvDyFsi1Qmdd/H93GByDXd3P5QUyfuQ1C1poeL74SOZEJYgKfDvl4ILBNMOKAl34+KqqN/kpw5U8OkO3s7iYndp5DsDO+hsC79C", HashId::of(str64Tovector("0/NqsOqF6OFxS5wbjnJV3t7HPG6Id11j/jc=")).toBase64());
    checkResult<string>("hashId", "GtPABCfCH/XxcvScFTJHrkbGzBc7GRwDsB+UFJWfdEO+85AH0IxL2qaKR6Mrt2oRiDXIH+KIbb9AsHF6RFdkL7oD5wlKf7j7r6k/6bGuJL8Xas/O0K5B71FtcoprB4w+", HashId::of(str64Tovector("EkYKAa8st0u5D1uzXWdmN4bZl258+J7IwWdr")).toBase64());
    checkResult<string>("hashId", "X4onIiHdzcUWv+rCKZjhe8MDwQEn41T8ca7ztcURvum9BgTaauy0stjGpLq8spIN28/Bh0wzHRpwDR1iji3+iCwpncGevHx6FFrF+FDH9WK9XknmU0vGjrvzroDgc/id", HashId::of(str64Tovector("wj5mvFd1QDutviLaMwG12KgIbe9Hs0+F0EIZJA==")).toBase64());
    checkResult<string>("hashId", "MPrSyj713frmX1imAAkcE/rblcDscaUksZyKxM+6XGbVEoyyD0j/CUVJ7mrwpSNeupF8QL/sF1/QcKL710HME0vs+x8SMCzS2c/beupPHycR5kXI0M1LfB/g/S+AO0T6", HashId::of(str64Tovector("6rsQ4WDjc7Oylryi0Pi5FZBOPuNFSTY0FOUI7MI=")).toBase64());
    checkResult<string>("hashId", "0bNy24C4j+PW1B+tYcFA3aoeIySp0HqyJcfP2wSJV6Lna/XLZPnjtsZbl5kPBrVt78dyPKTohhpn8RtoCdX/9zhHieL0SSpftk9RtQJzZENKQs7TK/ZgquRQykOug5bE", HashId::of(str64Tovector("nCU02spb+36ML75A9u3Nf6tusDEGhXMnlH6GBEaA")).toBase64());
    checkResult<string>("hashId", "gLuG/jsHGAyoi/8lrCcWvmOCVNcEZNT9EItKFaN3SdPCtgo051V0R65CbYMMhfAg8rW/ENPPmnuL1zZMlaW4moaaTi/yYB3xAotA9wLh3/WZMJL0MkmJu5xlpGL4RjOr", HashId::of(str64Tovector("QC7ANdVwNC2xDD8VjR7XhuJxhSUqXBUgP5s2L6tiVA==")).toBase64());
    checkResult<string>("hashId", "rTxX/1tzZfXNJMJPsIhlJRqpS3W1EtGbbOWWr/N68Fjbkjiuk3km7Bw6gZn+iGjDNn0drFga1tUnJ/MBiCBS9/nlLVwKmfMtC+vXyFnkuunO7PTBLQ9o06QIOY2Y9Y7B", HashId::of(str64Tovector("AimIPe5kSYwljcN8KAMiwtlyDkQTOUOAF0/clidDAMk=")).toBase64());
    checkResult<string>("hashId", "zVZI9Ks6eE6MN/zHWTHJdf7pZ4MevQ7R81/iT+yrZiJ0gfEyF99ZblafMvxIY4t2aC65sScKjnmf2VOPLWtJ6nLTvuosycKKJw85cpRhYB4YqUovXwEryptxfj6SbWIv", HashId::of(str64Tovector("7pv6h6iDirr2k36qgH3RgEowRWisXG+C4/+fM6ND/kxP")).toBase64());
    checkResult<string>("hashId", "EPfBprFEag04YkQWU63U1r5apsQSVi2C2iz5XQktyHY9RzzncPWfAxAkK+OIKM2J4icerfVBS9oTvw8FlpFfEZNJfDwbsY0d23PJD1X0jM7sjk+vQnG6+4eeaFWsmQIt", HashId::of(str64Tovector("Il0pQYBdb2//cY260G1w0zSHpgjQ+nFtY+w4Rhm81EOKVA==")).toBase64());
    checkResult<string>("hashId", "aG4PuHo7HoS1lItaAAvmuy5SO9eP1UhFFiSxK6/XoY8UfGLbyaos1N0N10/20v9q2rq02on4aAPFI3/vRl6IYQVZEqW10RTNqkZAYCvjD+6uXHXEea7Pout6qSz673Y4", HashId::of(str64Tovector("vHI2nz5nqjqNokVrHleS57KIvDj37nTof2om/FtcClYOnaY=")).toBase64());
    checkResult<string>("hashId", "0N7QQ9lKlj8SZ5snFw1PRPhc5aK6ml+HPQqGDI1WsMMvawveTveKcBVc4hTtjD2NyIjNCSliqDpS6hq4VCsBlMaNT5Rp5dWUmtRKgWLWJ4coTkEgJlQjh8Tbi6rPqSNx", HashId::of(str64Tovector("JAT9ygTrtfKufOx5LXcK7Iz4XTmNIUZNMTKH+brNohg2tQp/")).toBase64());
    checkResult<string>("hashId", "1lRP3PbQoG0H0cmY348D3IylvG3mNAC8ZJNXtidgV1+yhf0J3ZkXkKHogBcsZOQY+Z1gKafLj82TT5qkM5HqcykxD+yEyOPWTwEiNYGYc9WDdEmJTEg1xGhzCNx4cXfr", HashId::of(str64Tovector("ELznsDzXdK838+KL+sdIA7r/mT9N47v5T0k+D8qkSlX2sgpBqQ==")).toBase64());
    checkResult<string>("hashId", "jOX4vQomO07HE2SvBYPetZjD23RGtnMefuLg/T50KbkOKeDJw5Tzqg2+B8ZEmUyQZ1JrkPu7SfSQFxgOc+yRV3BCpAxpUOTVJhJKusf9NH2vNs9CyAARc3qAbRf35XOF", HashId::of(str64Tovector("aqu9dwqaW555k6DtGABrZ+BBxX/XSWuZA0EbWDUBy9m9hfqNcfQ=")).toBase64());
    checkResult<string>("hashId", "ygX5sKdazIaixwwsCvDO/XXkWTl+s5pqwZ6x5W1uQFmARV0PWIGLx+zbRzfNQ1FyscF/ZLGfdIDxXSRaQux9wyeA5A9FbKNDXSrAiTzKg9oMcfWVXtoJpvTXkG1Nc7BO", HashId::of(str64Tovector("pT39WERB4UljUfLGeqkh4tm2KlellyrK2T2sxaG5uB8lGVCBpuk5")).toBase64());
    checkResult<string>("hashId", "PODRfJ0BHZjANvXyKb8i4H6lZIltoRZq3bcqZIV8AJWhDEnMqvouKy+uZsFpcc/S/5OopCKji08hNUR8LMiVDwMIUlyh+8/txW4iWh2Hu/c0kCpyJoZNcyJzmSkrbXbg", HashId::of(str64Tovector("Z3eqi/zzMyBLmitFNk+sY85ujtaQ3EOnj1ZcydO4Al94NJwajpre7g==")).toBase64());
    checkResult<string>("hashId", "83Lj9MQgU8sDvIlZJtJdsrK+GhwSVjbU/ikK661PrEf+lAAGwOQy2CkLxMEF1MsEmRKlRw/QOcV3ZPl+guBLF6rxWVOsiH7DUlEUHRNTEBFtD+bqhn4We0uc+LCPdLSz", HashId::of(str64Tovector("DDOXs0aY9NMf5mhRU4760aRt6R296/djPo11wyFrtEzgX1oXyuiqYmU=")).toBase64());
    checkResult<string>("hashId", "zGy4/ncQn+2hK+3AiMmhNF6numx/IU3QdCKFp+z6lmu6D/7g+86aoN19TDTfVtM6c0B1t+GXpW7pI2/3sNDcH2NSukoSW0ZMKUpi9M98WpRarzM964Nr1SYouONFcsgH", HashId::of(str64Tovector("cjle7BMF309LpWMeKZNlXUOgS6bJJfzeFKnK3iQfB5mwDay6X3dDPOGM")).toBase64());
    checkResult<string>("hashId", "qF8sYv2ky0sKbBhL6RWlFgfAG+ya/oOOXfVTClng2mVkcsYYClsfPjulZZZM/y+TOU91C/z7zq+iQEu0n5DojCTPhC6BYVU7iQJHHAnGdDSch87KrlXv0VK+k7cDquTv", HashId::of(str64Tovector("s8RYzzRUFc94c65B3bRxhCtiGJDHl2ErttdCtsBAWcBVmq9asNtr9m8LsQ==")).toBase64());
    checkResult<string>("hashId", "jHppqFkUzc2mPA1KUi9XXf1sE2SLCiiIclBgtgPMD3kJqvU5AcBRyJlAfTDF0TvhiltJGTgGHwbXlln4VUH2dGWxKbtIAqW2lq45q2T0t/pplM2shSke17yT4jI0aI2x", HashId::of(str64Tovector("6kO/+dV2YRqtQDk7ptuEWC7Hoq9GiAAv3B6VBBUBD/wEahlVcM3gLcmGvoQ=")).toBase64());
    checkResult<string>("hashId", "wNx0Ng0ed7E4SOcFtYMj5z9q4Ylt5pnxF3++vm6UxKpXV7RzQr/Biowrj2DH4DfHjiZOdTKjme/m1SBo4Q9tgKpLBhJCEDiUPfHCNEJfHLTaA3IkEzocw8YXDoCshG78", HashId::of(str64Tovector("DjlWwvA9REmxx4bDxGph7kYJdEOoAOVZP0uQ62b09A/sxNQIeXaxi2lhWCPb")).toBase64());
    checkResult<string>("hashId", "E8JXMEHluZXu/nk04z49OpEQiS+0hZ8brY0wd30eZXnRfnp2pBL+lcPKr5rTSGlCyqR0wqwr7girykKIM2Sx344x8ozxtCixv6hTvjzQC1UqZ7lKYx3l4vCZYiuBJI74", HashId::of(str64Tovector("H/zTqwtTqb+PR5oDK+FzkK2t0v6ljGPUy8LlP2esccFiUYnY8TagUgPoAbrNlg==")).toBase64());
    checkResult<string>("hashId", "sG78FEggTZOAzmJsH+DYexliCwaogXuItcIPrFXAp3EEsl7CtPn+X9A4+VyTbJ1NRvUj9stH2TFTdO5V1tQzuHKCEmVjR0vlrII1rcXeU7Hf4vIKm9P0Hq4+8VQ+8epw", HashId::of(str64Tovector("AG3Goxqd+U4HQBx8elU3qwNQEsV6BcinXyh3bW2t1V56l1zyg4ERDCTcI63Ykak=")).toBase64());
    checkResult<string>("hashId", "rA+AR2jSHOWD61fb3rHnX7s7U5aGgV/yKRMakEGHbWEDFqeoNfLE34DuQSIGpUL+u/lgt5sI7v9Prk5h5nW4h5dJBTzbMOUdHyVI6GlPhvBo5QI/+PdrMMvaKEpe1fgc", HashId::of(str64Tovector("GbiNRX3mLwajv0y/HvPvh/A7Z+sWjhjlIxZXuEzQQGSxznUhnJfnpHJ07r2GdZWO")).toBase64());
    checkResult<string>("hashId", "RD8MkCj8Bm9JSubeXrF+6+G2oPPv3oDa/ODlP8rWDoOBA2rLSCi4fTJ33aLcN1UyNALQmWvkasCMuJhP9uyjouVHj4f4UpIjFnVgbfomVnzkUjOemGTKtHdVmFAwwgoy", HashId::of(str64Tovector("oQwIQB6KT8NfE7+6phSUqmrZbVKt+dThaxMhLVeFMplb9GugznkPNknx80Al9trpkg==")).toBase64());
    checkResult<string>("hashId", "+ITSmeVvMN89v3ip9tPZeor5po3GEoLxx4djiP13DDVDo9Qh9xX79lad39o9ojpIEKUBmHsm3tf2sRxVauAK+zGw8SAU9mT04r9/i3IkQuGWntcl0U7f2wU6UnyEhHYx", HashId::of(str64Tovector("wDl2LLM+KoqM86LFKUOdUmIpeMX9LpcuuwSsCLqNrsIP9zyuqbA1jV7NeKg0nchvUz8=")).toBase64());
    checkResult<string>("hashId", "SBw/PabvambASp/oD71X4PZ6UpCB/FAd8WVz0kZbdr9fa5RuF++bADdSHFn7tKtXF7/ENpK2Xj8XuF+1uy1rqv5xDox9339qHH+8iFJSFKDVNsb+SvxDNX7wdb+MfGDN", HashId::of(str64Tovector("rl2H9tUlX/8Wqd6coMmPoZT17GeJM0pqKgzBX0kEaqSZu+c6GmYFFclsKi+RO50aYrhf")).toBase64());
    checkResult<string>("hashId", "bpgDOslhLXhM8/c7nlNGSf83rgTqq9h9L/EMDZppu8plS35O1jhar/K/SG6/pw03j5CqT3MNBrdTQvCdcB/2FrvBEptwXVFW+qe3//rJd109dZsEyU8y9vbyaA+AOswZ", HashId::of(str64Tovector("3RiphUGSBwKBL68b7Zha9oLWxTpPSQ9ZzGRVQJ3FtErNlT5dtEFPzeqUyHbChvcvugDBuQ==")).toBase64());
    checkResult<string>("hashId", "KzOAbwGVrOLYhn2L98L6vWhwsGkxNaJflQLdrlN6t72APGKdGUpihDitxRoRMlPLiBoZccV9jEskvEWA8kpseCwpjtRDhptElAwoUOvmnSb+2rUh8uQPxzqc+TCJGhBN", HashId::of(str64Tovector("rhKgLbumA5fY1CJRs/mXwLHkQ8XH/AzvT64YtZ/mWWmDnX4Be5aROBWkZaVBAVyKjfPCxf8=")).toBase64());
    checkResult<string>("hashId", "3dZooX+kiJkbLNyTRvTv9nfi2zGrwCGJenZnuOPt3od3+umqZv2AQoWhg+vD1OYHt652J7iSbTjHs0eLMsvUdTSaakIBIzyZrHvRdkshrMM1xN6M2HsIxp0oFse4Pyp6", HashId::of(str64Tovector("EkIMA7UfAJENl4ar5FfoAWGr9uw/Be8n9on4pVbrcmjYTWFrHS2o8tUkLQFEZ5jtb9+pAfAl")).toBase64());
    checkResult<string>("hashId", "m1APE8mLqp3WeI7pkvJUAOQlGEXPtUHzh35SkUkMKQLk6uAyxxcx9K6ww4M3BC9a7Dc9LKtQ6GZJFrt0CS3IBAXnEmrbbHuoy8HSzrUVgFgU2CssFV9NLwKZaagFUq8w", HashId::of(str64Tovector("ro9g0DpjZIMfTjBBOm1+DthjC4trA4DU4Fd/kWTAz7j1xscS5qSJcpqUn/yOHZkpx9Rk3lf0og==")).toBase64());
    checkResult<string>("hashId", "LfdTZe62s+XLGUjKUP1nShUXcr3+PKsmtGWJGq+CqABaL6TbwYSd3c3Xb6Om45Q9+PabimMt4xCOEsk0iuA5CaRETCINhf3YEwKyodscgrI7K46i35aAv+VFiSlvKtkR", HashId::of(str64Tovector("v0jJOwceLnIbG9fO4UbsXLx0OqBzvzz77j8y2bXHNA+4JcyreL+PMp0UYuETdY9ELqztnBs2Txw=")).toBase64());
    checkResult<string>("hashId", "ZNrr2tOXEc7kDw07yzLU4PGRDNZlRWofiZnNbwAbQz0KZRjbz3Fl08ZaAkVeSl/k3aoZ/AQX/Fv8IMg42jcCMtr3+3KyoLNMwwnzZSs7CbmxT9wfq3oQACX1MNfyPFj/", HashId::of(str64Tovector("e14cW643oPcxbISCOaU/kceJJf84/AyQK+2PmpPdsgbrqNcMUqla8PhD/6Gr1SPZ87BvI15JVIfF")).toBase64());
    checkResult<string>("hashId", "GfbnZf9EVDLJrXiq9P1HJrJd6KdBoIqcYjzJDVQYynfwaNXe0yc1afmtfdiSIcYDcDGFpT2Q2xS8ajrRrJy6+zYK9tFc06JyW6VBhxZbrAvENaJs6sWIcL3zWTQmX+uG", HashId::of(str64Tovector("2admTadXLfoxZ6IY2taXqRfDQVQMsRcN1fAYZBaNLasGGenIk0aeLvjQRQnoyCvlR5NqwxmFYAg8uw==")).toBase64());
    checkResult<string>("hashId", "/zckWt37XCyLpEDpfcoVG/QISM1tIXdOODZRRQ1S9V65rKo5G7D4lwKg/XWVFUxRgWNzPEEjn6ugkkstAoINaoV/FbUPn2hARnOEjUXpntWxLAJ8BwFcxXvgASqGX/Qi", HashId::of(str64Tovector("NaD2ArE7C50NB6nG9UKMBZz+ntpR6jRfTUt9aGRTBtOZTnqCWRuValmt62u/uwtkW7cPqFYdxYEmS7U=")).toBase64());
    checkResult<string>("hashId", "svaCdF0Ub+Yi2aXKvx24P3a71bh3xH8VXEiM55MyGJ3jjc7n3PBdUuoy4xjCWq83bWm+wqbS+6iUwMrRpRA+3+5d4J/REa8z7g5XtO34X/ssggYF+J9dwK1yg5IoqeXI", HashId::of(str64Tovector("zO2UMKZxsuSOz2aFMv+maLWwKa0WFsgv6F8WbDqejjGzvruvi5RbTMFq53lwu2zmGL2sDRFrlHSt+DUa")).toBase64());
    checkResult<string>("hashId", "lz7CIcrCCzvOZGd3jnftf35FoyALKQclU2KeimNzqBHBHWzYjCVUYKsO9IbCkSslJBcsGr6xUFcq7qk3VTICdCSQq4m4yBLHWg/QaCqhFCR6oUeV9yhExLsdOMRHuA/+", HashId::of(str64Tovector("9RrAug9051wv4XCIDcETyoQx5iFAbo9QIf5V+0YtU7kN/O5mwNB4z3YwGcXSYdMwDF3ODlBjW4gwy+UPDw==")).toBase64());
    checkResult<string>("hashId", "S07K7aHSYx1lwHxJQAu1Z5dCXHaxNo6SDYuCQLzrlfsk8hDJg7xF0Hh3wHXF6PZfKGz5+u0KBzMi43Kd5I1LR6/Nx+fJZA+t1UhDBmBQTRXq7RI3cmyud7JHJA4F2cz+", HashId::of(str64Tovector("VaX5QNDlVW5pAj9wFS7h66NicB9evcZp+G/WuwO2vEmHb5Mykyr2xIJmdgbx0yXJtGI6LglUejjoJUrR/yg=")).toBase64());
    checkResult<string>("hashId", "KYbgYeFfbIUJJsjt4BaGruK6xSgTPTnUbrB9YOk001SLuDDwJqAOQHs6ZS+Yr/zPzwfi9dC1hO5tLY5QyJ49m2bpCjQpPQ+SC374wBlbB8nv+JIcY1fj7daPKAIoKYCC", HashId::of(str64Tovector("1p2G8xNzmzp1281QwePpwrh6I97aZIIBypjesdZ9OT9v3XogDTgf+oUG70zA8g16m6XUnkia2ggU8HWpKTj7")).toBase64());

    auto h = HashId::of(str64Tovector("dcwrTA=="));
    checkResult("", base64_encode(h.getDigest()), h.toBase64());

    cout << "testHashId()... done!" << endl << endl;
}

void testHashIdComparison() {
    cout << "testHashIdComparison()..." << endl;

    typedef unordered_map<HashId, int, HashId::UnorderedHash> HashIdUnorderedMap_t;
    typedef map<HashId, int> HashIdMap_t;

    auto body1 = str64Tovector("HQ==");
    auto body2 = str64Tovector("j28=");
    auto hash1 = HashId::of(body1);
    auto hash2 = HashId::of(body2);
    auto hash1copy = HashId(hash1);
    auto hash1of = HashId::of(body1);
    auto hash2of = HashId::of(body2);

    HashIdUnorderedMap_t um;
    HashIdMap_t m;
    um[hash1] = 33;
    um[hash2] = 44;
    m[hash1] = 331;
    m[hash2] = 441;

    checkResult<bool>("hash1 == hash2", false, hash1 == hash2);
    checkResult<bool>("hash1 == hash1copy", true, hash1 == hash1copy);
    checkResult<bool>("hash1 == hash1", true, hash1 == hash1);
    checkResult<bool>("hash1of == hash2of", false, hash1of == hash2of);
    checkResult<bool>("hash1of == hash1of", true, hash1of == hash1of);

    checkResult<bool>("hash1<hash2", true, hash1.operator<(hash2));
    checkResult<bool>("hash1>hash2", false, hash2.operator<(hash1));

    checkResult("um.find(hash1)", 33, um.find(hash1)->second);
    checkResult("um.find(hash2)", 44, um.find(hash2)->second);
    um[hash2] = 442;
    checkResult("um.find(hash2 updated value)", 442, um.find(hash2)->second);
    checkResult("m.find(hash1)", 331, m.find(hash1)->second);
    checkResult("m.find(hash2)", 441, m.find(hash2)->second);
    m[hash2] = 4421;
    checkResult("m.find(hash2 updated value)", 4421, m.find(hash2)->second);

    auto digest1 = hash1.getDigest();
    auto digest2 = hash2.getDigest();
    auto digest1copy = hash1copy.getDigest();
    checkResult("digest1 == digest2", false, digest1 == digest2);
    checkResult("digest1 == digest1copy", true, digest1 == digest1copy);
    auto hash1withDigest = HashId::withDigest(digest1);
    auto hash2withDigest = HashId::withDigest(digest2);
    auto hash1withDigestCopy = HashId::withDigest(digest1copy);
    checkResult("hash1withDigest == hash2withDigest", false, hash1withDigest == hash2withDigest);
    checkResult("hash1withDigest == hash1withDigestCopy", true, hash1withDigest == hash1withDigestCopy);

    auto hash1moved = HashId(move(hash1));
    checkResult("hash1 == hash1copy", false, hash1 == hash1copy);
    checkResult("hash1moved == hash1copy", true, hash1moved == hash1copy);

    cout << "testHashIdComparison()... done!" << endl << endl;
}

void testKeyAddress() {
    cout << "testKeyAddress()..." << endl;

    auto strE = string("65537");
    auto strP = string("166438984042065497734914068855004282550440498640409398677336546927308216381652973497991047247926391839370729407435808892969122519401712385345233169193805241631583305760736715545141142026706356434887369071360563025254193571054123994143642688583692644185979182810270581846072984179584787077062088254715187805453");
    auto strQ = string("132243238518154268249184631952046833494949171132278166597493094022019934205919755965484010862547916586956651043061215415694791928849764419123506916992508894879133969053226176271305106211090173517182720832250788947720397461739281147258617115635022042579209568022023702283912658756481633266987107149957718776027");

    PrivateKey privateKey(strE, strP, strQ);
    PublicKey publicKey(privateKey);

    KeyAddress keyAddressShort(publicKey, 0, false);
    KeyAddress keyAddressLong(publicKey, 0, true);
    checkResult("keyAddressShort", string("Z7Ui6rRxiCiuCYsTV36dDiCbMaz81ttQDb3JDFkdswsMEpWojT"), keyAddressShort.toString());
    checkResult("keyAddressLong", string("J2Rhu2e6Nvyu9DjqSxTJdDruKHc64NRAVuiawdbnorNA6a7qGq8ox2xsEgnN72WJHjK2DQy3"), keyAddressLong.toString());

    KeyAddress keyAddressShortLoaded(keyAddressShort.toString());
    KeyAddress keyAddressLongLoaded(keyAddressLong.toString());
    checkResult("operator==", true, keyAddressShortLoaded.operator==(keyAddressShort));
    checkResult("operator==", false, keyAddressShortLoaded.operator==(keyAddressLong));
    checkResult("operator==", true, keyAddressLongLoaded.operator==(keyAddressLong));
    checkResult("operator==", false, keyAddressLongLoaded.operator==(keyAddressShort));
    checkResult("keyAddress.isMatchingKeyAddress", true, keyAddressShortLoaded.isMatchingKeyAddress(keyAddressShort));
    checkResult("keyAddress.isMatchingKeyAddress", false, keyAddressShortLoaded.isMatchingKeyAddress(keyAddressLong));
    checkResult("keyAddress.isMatchingKeyAddress", true, keyAddressLongLoaded.isMatchingKeyAddress(keyAddressLong));
    checkResult("keyAddress.isMatchingKeyAddress", false, keyAddressLongLoaded.isMatchingKeyAddress(keyAddressShort));

    checkResult("", true, keyAddressShort.isMatchingKey(publicKey));
    checkResult("", true, keyAddressLong.isMatchingKey(publicKey));
    PrivateKey otherPrivateKey(2048);
    PublicKey otherPublicKey(otherPrivateKey);
    checkResult("", false, keyAddressShort.isMatchingKey(otherPublicKey));
    checkResult("", false, keyAddressLong.isMatchingKey(otherPublicKey));

    checkResult("publicKey.isMatchingKeyAddress", true, publicKey.isMatchingKeyAddress(keyAddressShort));
    checkResult("publicKey.isMatchingKeyAddress", true, publicKey.isMatchingKeyAddress(keyAddressLong));
    checkResult("publicKey.isMatchingKeyAddress", false, otherPublicKey.isMatchingKeyAddress(keyAddressShort));
    checkResult("publicKey.isMatchingKeyAddress", false, otherPublicKey.isMatchingKeyAddress(keyAddressLong));

    checkResult("publicKey->getShortAddress", string("Z7Ui6rRxiCiuCYsTV36dDiCbMaz81ttQDb3JDFkdswsMEpWojT"), publicKey.getShortAddress().toString());
    checkResult("publicKey->getLongAddress", string("J2Rhu2e6Nvyu9DjqSxTJdDruKHc64NRAVuiawdbnorNA6a7qGq8ox2xsEgnN72WJHjK2DQy3"), publicKey.getLongAddress().toString());

    cout << "testKeyAddress()... done!" << endl << endl;
}

std::vector<unsigned char> generateRandomBytes(int len) {
    std::vector<unsigned char> res(len);
    for (int i = 0; i < len; ++i)
        res[i] = static_cast<unsigned char>(minstdRand() & 0xFF);
    return res;
}

void testSafe58() {
    cout << "testSafe58()..." << endl;

    auto ok = Safe58::decode("Helloworld");
    checkResult("HellOwOr1d", true, std::equal(ok.begin(), ok.end(), Safe58::decode("HellOwOr1d").begin()));
    checkResult("He1IOw0r1d", true, std::equal(ok.begin(), ok.end(), Safe58::decode("He1IOw0r1d").begin()));
    checkResult("He!|Ow0r|d", true, std::equal(ok.begin(), ok.end(), Safe58::decode("He!|Ow0r|d").begin()));

    for (int i = 0; i < 100; ++i) {
        char iStr[16];
        snprintf(iStr, sizeof(iStr)/sizeof(iStr[0]), "%i", i);
        auto src = generateRandomBytes(256 + minstdRand()*1024/minstdRand.max());
        auto encoded = Safe58::encode(src);
        auto decoded = Safe58::decode(encoded);
        checkResult(iStr, true, std::equal(src.begin(), src.end(), decoded.begin()));
    }

    cout << "testSafe58()... done!" << endl << endl;
}

void testPackUnpackKeys() {
    cout << "testPackUnpackKeys()..." << endl;

    auto strE = string("65537");
    auto strP = string("166438984042065497734914068855004282550440498640409398677336546927308216381652973497991047247926391839370729407435808892969122519401712385345233169193805241631583305760736715545141142026706356434887369071360563025254193571054123994143642688583692644185979182810270581846072984179584787077062088254715187805453");
    auto strQ = string("132243238518154268249184631952046833494949171132278166597493094022019934205919755965484010862547916586956651043061215415694791928849764419123506916992508894879133969053226176271305106211090173517182720832250788947720397461739281147258617115635022042579209568022023702283912658756481633266987107149957718776027");

    PrivateKey privateKey(strE, strP, strQ);
    PublicKey publicKey(privateKey);
    PrivateKey copyPrivateKey = privateKey;
    PublicKey copyPublicKey = publicKey;

    auto packedPrivateKey = privateKey.pack();
    auto packedPublicKey = publicKey.pack();
    checkResult("packedPrivateKey", string("JgAcAQABvIDtBFjZyB1P7q19Ni0dCPs2ndCJrrVIXzYMbsLzVMNuRFv2NxiERGAZIolO948EGd+/E5tIv+1rAH6Oqoubqrx4MGXwpL2DJw+/No/pQQSqYCKA/v3BeADdaXo+XL12RCr3N87QGV0Ept9Q25GltgZuB75rZ4QN9NWMNa1ql929DbyAvFIUVIg6o9lT2JjnlIWNapM6rZNpo7c8SN/CfAFWxpm5qwqnIpJRrEl3fGUre2K+3psZDVIo0AKFGbuKAi+ZDAWpTAnuwT1R4pQqK/c0Z65HEbnwiAaWOn9HBAUw9c09AvgPoQvVgLS3YSA8/xBe+NeuqnIwl/Tw0m7EjVFSmNs="), base64_encode(&packedPrivateKey[0], packedPrivateKey.size()));
    checkResult("packedPublicKey", string("HggcAQABxAABrlsvdv82ZRGkQjvt9OS95cOqroMWvS4s0KlrJc+X96y41MKIyOCcvw2tu9R5uh67nHOFWLa4Gr5AMaCI/l6DvGu7JK4EIgX19f+WalCk9A0mzdyUWt/1571iZPh9cIm0O7oXPR1nhcDAApQFJfE7U20cW0OJ0EMNijB4s0tzNc+D6eqCDCnbfcASOw4JQ4MC838HJi5BeqGgoXdZI1UMh2CQ0xHKVzYY9DADzxZTu1Qz/kTbvCL3ust54KHbOh/8Y2eFpLO+waW1s6z11JLGJXERhOBzfB4tQppU+QbI0u7hTdv/GgGh6ED60Ggq7l8Rz5nU5DCHCYZmiYZcPhpyHw=="), base64_encode(&packedPublicKey[0], packedPublicKey.size()));
    PrivateKey unpackedPrivateKey(packedPrivateKey);
    PublicKey unpackedPublicKey(packedPublicKey);
    auto packedPrivateKey2 = unpackedPrivateKey.pack();
    auto packedPublicKey2 = unpackedPublicKey.pack();
    checkResult("packedPrivateKey2", string("JgAcAQABvIDtBFjZyB1P7q19Ni0dCPs2ndCJrrVIXzYMbsLzVMNuRFv2NxiERGAZIolO948EGd+/E5tIv+1rAH6Oqoubqrx4MGXwpL2DJw+/No/pQQSqYCKA/v3BeADdaXo+XL12RCr3N87QGV0Ept9Q25GltgZuB75rZ4QN9NWMNa1ql929DbyAvFIUVIg6o9lT2JjnlIWNapM6rZNpo7c8SN/CfAFWxpm5qwqnIpJRrEl3fGUre2K+3psZDVIo0AKFGbuKAi+ZDAWpTAnuwT1R4pQqK/c0Z65HEbnwiAaWOn9HBAUw9c09AvgPoQvVgLS3YSA8/xBe+NeuqnIwl/Tw0m7EjVFSmNs="), base64_encode(&packedPrivateKey2[0], packedPrivateKey2.size()));
    checkResult("packedPublicKey2", string("HggcAQABxAABrlsvdv82ZRGkQjvt9OS95cOqroMWvS4s0KlrJc+X96y41MKIyOCcvw2tu9R5uh67nHOFWLa4Gr5AMaCI/l6DvGu7JK4EIgX19f+WalCk9A0mzdyUWt/1571iZPh9cIm0O7oXPR1nhcDAApQFJfE7U20cW0OJ0EMNijB4s0tzNc+D6eqCDCnbfcASOw4JQ4MC838HJi5BeqGgoXdZI1UMh2CQ0xHKVzYY9DADzxZTu1Qz/kTbvCL3ust54KHbOh/8Y2eFpLO+waW1s6z11JLGJXERhOBzfB4tQppU+QbI0u7hTdv/GgGh6ED60Ggq7l8Rz5nU5DCHCYZmiYZcPhpyHw=="), base64_encode(&packedPublicKey2[0], packedPublicKey2.size()));
    PublicKey publicKeyFromDecimalStrings(string("65537"), string("22010430265394139613000868285025463477074223185486244499634177887580324920686226610417706744335933359652430612916358253813893261669330316543239108965341456359299406328906270703947334961348565788596306492647710105586783859797604948705827274758276000792353907279667158525579387393368160190180439522687435755014728372815408024307255185057464905470423281347241480900464128969516046770366189515668158431102639992601462764766100062644885414927549883934897542153111731636732805845904738871223796787350437197422912764815000651812110643298420118455799835223629072584676934684617765337322899072623305931528759760022883356275231"));
    auto packedPublicKey3 = publicKeyFromDecimalStrings.pack();
    checkResult("packedPublicKey3", string("HggcAQABxAABrlsvdv82ZRGkQjvt9OS95cOqroMWvS4s0KlrJc+X96y41MKIyOCcvw2tu9R5uh67nHOFWLa4Gr5AMaCI/l6DvGu7JK4EIgX19f+WalCk9A0mzdyUWt/1571iZPh9cIm0O7oXPR1nhcDAApQFJfE7U20cW0OJ0EMNijB4s0tzNc+D6eqCDCnbfcASOw4JQ4MC838HJi5BeqGgoXdZI1UMh2CQ0xHKVzYY9DADzxZTu1Qz/kTbvCL3ust54KHbOh/8Y2eFpLO+waW1s6z11JLGJXERhOBzfB4tQppU+QbI0u7hTdv/GgGh6ED60Ggq7l8Rz5nU5DCHCYZmiYZcPhpyHw=="), base64_encode(&packedPublicKey3[0], packedPublicKey3.size()));
    checkResult("copyPrivateKey", base64_encode(privateKey.pack()), base64_encode(copyPrivateKey.pack()));
    checkResult("copyPublicKey", base64_encode(publicKey.pack()), base64_encode(copyPublicKey.pack()));

    cout << "testPackUnpackKeys()... done!" << endl << endl;
}

void testAllHashTypes() {
    cout << "testAllHashTypes()..." << endl;

    auto bodyStr = base64_decode("cXdlcnR5MTIzNDU2");
    auto body = std::vector<unsigned char>(bodyStr.begin(), bodyStr.end());

    checkResult("sha1", string("87o4G2uu9Sa/cP8iCx2kkGmJIks="), base64_encode(Digest(HashType::SHA1, body).getDigest()));
    checkResult("sha256", string("OldFoF+H3e4dtoshfcBDv6IG0ceqod0KfddrhSpzNZc="), base64_encode(Digest(HashType::SHA256, body).getDigest()));
    checkResult("sha512", string("4LUOOtuFzgekEZZwm6ZCiGuoKKNUrO5C6udVm8fGI5gYl/VgIGme1h+gUvR4S/N+du/wFu4GXXe8FY3Rcuq9dg=="), base64_encode(Digest(HashType::SHA512, body).getDigest()));
    checkResult("sha3_256", string("pvZgN9IA5n4QmqvOmeXETci/nM5V5BLb/u8qexEsvYc="), base64_encode(Digest(HashType::SHA3_256, body).getDigest()));
    checkResult("sha3_384", string("4CyM0S8zbDNE7T1po05rwZnreEpE2qrIUSzqObeZ5uRJblbAeoDhVRQVfYMX6bRh"), base64_encode(Digest(HashType::SHA3_384, body).getDigest()));
    checkResult("sha3_512", string("LLgMxUrw59k3MZ3TFJiwk0o3GJ5oRiRe1N3wRhMY2PSQpEk7mbeSlCJIHJsO1s5XcS5VQeUUQEz+G473CeK9uA=="), base64_encode(Digest(HashType::SHA3_512, body).getDigest()));

    checkResult("sha1 size", 20ul, Digest(HashType::SHA1).getDigestSize());
    checkResult("sha256 size", 32ul, Digest(HashType::SHA256).getDigestSize());
    checkResult("sha512 size", 64ul, Digest(HashType::SHA512).getDigestSize());
    checkResult("sha3_256 size", 32ul, Digest(HashType::SHA3_256).getDigestSize());
    checkResult("sha3_384 size", 48ul, Digest(HashType::SHA3_384).getDigestSize());
    checkResult("sha3_512 size", 64ul, Digest(HashType::SHA3_512).getDigestSize());

    Digest digestVar(HashType::SHA3_512);
    digestVar.update(body);
    digestVar.doFinal();
    checkResult("digestVar", string("LLgMxUrw59k3MZ3TFJiwk0o3GJ5oRiRe1N3wRhMY2PSQpEk7mbeSlCJIHJsO1s5XcS5VQeUUQEz+G473CeK9uA=="), base64_encode(digestVar.getDigest()));

    cout << "testAllHashTypes()... done!" << endl << endl;
}

void testKeysConcurrency() {
    cout << "testKeysConcurrency()..." << endl;

    auto body = base64_decodeToBytes("cXdlcnR5MTIzNDU2");
    PrivateKey privateKey(base64_decodeToBytes("JgAcAQABvIDtBFjZyB1P7q19Ni0dCPs2ndCJrrVIXzYMbsLzVMNuRFv2NxiERGAZIolO948EGd+/E5tIv+1rAH6Oqoubqrx4MGXwpL2DJw+/No/pQQSqYCKA/v3BeADdaXo+XL12RCr3N87QGV0Ept9Q25GltgZuB75rZ4QN9NWMNa1ql929DbyAvFIUVIg6o9lT2JjnlIWNapM6rZNpo7c8SN/CfAFWxpm5qwqnIpJRrEl3fGUre2K+3psZDVIo0AKFGbuKAi+ZDAWpTAnuwT1R4pQqK/c0Z65HEbnwiAaWOn9HBAUw9c09AvgPoQvVgLS3YSA8/xBe+NeuqnIwl/Tw0m7EjVFSmNs="));
    PublicKey publicKey(privateKey);
    SymmetricKey symmetricKey(base64_decodeToBytes("9xZQWv3x+jq4th+llGZLJsuAc3lbYFz91LWXuHZVIkE="));
    std::atomic<long> counter(0);
    ConditionVar cv;
    long total_tasks_count = 8000;
    ThreadPool pool(50);
    for (int i = 0; i < total_tasks_count; ++i) {
        pool([&](){
            vector<unsigned char> encrypted;
            vector<unsigned char> decrypted;
            publicKey.encrypt(body, encrypted);
            privateKey.decrypt(encrypted, decrypted);
            checkResult("concurrency encrypt/decrypt", string("cXdlcnR5MTIzNDU2"), base64_encode(decrypted));
            vector<unsigned char> sig;
            privateKey.sign(body, SHA3_512, sig);
            checkResult("concurrency sign/verify", true, publicKey.verify(sig, body, SHA3_512));
            auto symmEncrypted = symmetricKey.etaEncrypt(body);
            auto symmDecrypted = symmetricKey.etaDecrypt(symmEncrypted);
            checkResult("concurrency symmetric encrypt/decrypt", string("cXdlcnR5MTIzNDU2"), base64_encode(symmDecrypted));
            ++counter;
            cv.notify();
        });
    }
    while (cv.wait(1000ms)) {
        if (counter >= total_tasks_count)
            break;
    }

    cout << "testKeysConcurrency()... done!" << endl << endl;
}

void testGenerateNewKeys() {
    cout << "testGenerateNewKeys()..." << endl;

    auto body = base64_decodeToBytes("cXdlcnR5MTIzNDU2");

    PrivateKey cpp_privateKey2048(2048);
    PrivateKey cpp_privateKey4096(4096);
    PublicKey cpp_publicKey2048(cpp_privateKey2048);
    PublicKey cpp_publicKey4096(cpp_privateKey4096);
    cout << "// Test vectors for export to java:" << endl;
    cout << "String cpp_privateKey2048_b64 = \"" << base64_encode(cpp_privateKey2048.pack()) << "\";" << endl;
    cout << "String cpp_privateKey4096_b64 = \"" << base64_encode(cpp_privateKey4096.pack()) << "\";" << endl;
    cout << "String cpp_publicKey2048_b64  = \"" << base64_encode(cpp_publicKey2048.pack()) << "\";" << endl;
    cout << "String cpp_publicKey4096_b64  = \"" << base64_encode(cpp_publicKey4096.pack()) << "\";" << endl;
    auto cpp_encrypted2048 = cpp_publicKey2048.encrypt(body);
    auto cpp_encrypted4096 = cpp_publicKey4096.encrypt(body);
    cout << "String cpp_encrypted2048 = \"" << base64_encode(cpp_encrypted2048) << "\";" << endl;
    cout << "String cpp_encrypted4096 = \"" << base64_encode(cpp_encrypted4096) << "\";" << endl;
    auto cpp_sig2048_sha1 = cpp_privateKey2048.sign(body, HashType::SHA1);
    auto cpp_sig2048_sha256 = cpp_privateKey2048.sign(body, HashType::SHA256);
    auto cpp_sig2048_sha512 = cpp_privateKey2048.sign(body, HashType::SHA512);
    auto cpp_sig2048_sha3_256 = cpp_privateKey2048.sign(body, HashType::SHA3_256);
    auto cpp_sig2048_sha3_384 = cpp_privateKey2048.sign(body, HashType::SHA3_384);
    auto cpp_sig2048_sha3_512 = cpp_privateKey2048.sign(body, HashType::SHA3_512);
    cout << "String cpp_sig2048_sha1 = \"" << base64_encode(cpp_sig2048_sha1) << "\";" << endl;
    cout << "String cpp_sig2048_sha256 = \"" << base64_encode(cpp_sig2048_sha256) << "\";" << endl;
    cout << "String cpp_sig2048_sha512 = \"" << base64_encode(cpp_sig2048_sha512) << "\";" << endl;
    cout << "String cpp_sig2048_sha3_256 = \"" << base64_encode(cpp_sig2048_sha3_256) << "\";" << endl;
    cout << "String cpp_sig2048_sha3_384 = \"" << base64_encode(cpp_sig2048_sha3_384) << "\";" << endl;
    cout << "String cpp_sig2048_sha3_512 = \"" << base64_encode(cpp_sig2048_sha3_512) << "\";" << endl;
    auto cpp_sig4096_sha1 = cpp_privateKey4096.sign(body, HashType::SHA1);
    auto cpp_sig4096_sha256 = cpp_privateKey4096.sign(body, HashType::SHA256);
    auto cpp_sig4096_sha512 = cpp_privateKey4096.sign(body, HashType::SHA512);
    auto cpp_sig4096_sha3_256 = cpp_privateKey4096.sign(body, HashType::SHA3_256);
    auto cpp_sig4096_sha3_384 = cpp_privateKey4096.sign(body, HashType::SHA3_384);
    auto cpp_sig4096_sha3_512 = cpp_privateKey4096.sign(body, HashType::SHA3_512);
    cout << "String cpp_sig4096_sha1 = \"" << base64_encode(cpp_sig4096_sha1) << "\";" << endl;
    cout << "String cpp_sig4096_sha256 = \"" << base64_encode(cpp_sig4096_sha256) << "\";" << endl;
    cout << "String cpp_sig4096_sha512 = \"" << base64_encode(cpp_sig4096_sha512) << "\";" << endl;
    cout << "String cpp_sig4096_sha3_256 = \"" << base64_encode(cpp_sig4096_sha3_256) << "\";" << endl;
    cout << "String cpp_sig4096_sha3_384 = \"" << base64_encode(cpp_sig4096_sha3_384) << "\";" << endl;
    cout << "String cpp_sig4096_sha3_512 = \"" << base64_encode(cpp_sig4096_sha3_512) << "\";" << endl;
    cout << "String cpp_fingerprint2048 = \"" << base64_encode(cpp_publicKey2048.fingerprint()) << "\";" << endl;
    cout << "String cpp_fingerprint4096 = \"" << base64_encode(cpp_publicKey4096.fingerprint()) << "\";" << endl;

    checkResult("", body, cpp_privateKey2048.decrypt(cpp_encrypted2048));
    checkResult("", body, cpp_privateKey4096.decrypt(cpp_encrypted4096));
    checkResult("", true, cpp_publicKey2048.verify(cpp_sig2048_sha1, body, HashType::SHA1));
    checkResult("", false, cpp_publicKey2048.verify(cpp_sig2048_sha1, body, HashType::SHA256));
    checkResult("", true, cpp_publicKey2048.verify(cpp_sig2048_sha256, body, HashType::SHA256));
    checkResult("", false, cpp_publicKey2048.verify(cpp_sig2048_sha256, body, HashType::SHA512));
    checkResult("", true, cpp_publicKey2048.verify(cpp_sig2048_sha512, body, HashType::SHA512));
    checkResult("", false, cpp_publicKey2048.verify(cpp_sig2048_sha512, body, HashType::SHA3_256));
    checkResult("", true, cpp_publicKey2048.verify(cpp_sig2048_sha3_256, body, HashType::SHA3_256));
    checkResult("", false, cpp_publicKey2048.verify(cpp_sig2048_sha3_256, body, HashType::SHA3_384));
    checkResult("", true, cpp_publicKey2048.verify(cpp_sig2048_sha3_384, body, HashType::SHA3_384));
    checkResult("", false, cpp_publicKey2048.verify(cpp_sig2048_sha3_384, body, HashType::SHA3_512));
    checkResult("", true, cpp_publicKey2048.verify(cpp_sig2048_sha3_512, body, HashType::SHA3_512));
    checkResult("", false, cpp_publicKey2048.verify(cpp_sig2048_sha3_512, body, HashType::SHA1));

    checkResult("", true, cpp_publicKey4096.verify(cpp_sig4096_sha1, body, HashType::SHA1));
    checkResult("", false, cpp_publicKey4096.verify(cpp_sig4096_sha1, body, HashType::SHA256));
    checkResult("", true, cpp_publicKey4096.verify(cpp_sig4096_sha256, body, HashType::SHA256));
    checkResult("", false, cpp_publicKey4096.verify(cpp_sig4096_sha256, body, HashType::SHA512));
    checkResult("", true, cpp_publicKey4096.verify(cpp_sig4096_sha512, body, HashType::SHA512));
    checkResult("", false, cpp_publicKey4096.verify(cpp_sig4096_sha512, body, HashType::SHA3_256));
    checkResult("", true, cpp_publicKey4096.verify(cpp_sig4096_sha3_256, body, HashType::SHA3_256));
    checkResult("", false, cpp_publicKey4096.verify(cpp_sig4096_sha3_256, body, HashType::SHA3_384));
    checkResult("", true, cpp_publicKey4096.verify(cpp_sig4096_sha3_384, body, HashType::SHA3_384));
    checkResult("", false, cpp_publicKey4096.verify(cpp_sig4096_sha3_384, body, HashType::SHA3_512));
    checkResult("", true, cpp_publicKey4096.verify(cpp_sig4096_sha3_512, body, HashType::SHA3_512));
    checkResult("", false, cpp_publicKey4096.verify(cpp_sig4096_sha3_512, body, HashType::SHA1));

    auto java_privateKey2048bin = base64_decodeToBytes("JgAcAQABvIDVtMRDLdcMsP5/b7haXIT5EHCTfRKVOs6/L/xBfYUDniRMyFWbHGlZGm77KxAIMRdA1VFcaaEEl2fcZlhVKEpO3lCxR9Rp6ue1MUa3gML/nxReSyPzyCdE7M4eD0QvslieYNMxAGdvug0LNNXghfZQc+3TkS/HYX+UmIEzoZYx9byAweqwrNDS5H88Dor2a3ESlzAxnqmgYapedj7IcbKH1Nz65woZ8KpikbxvTUBIJIwcLFUA/QNXWzg0ka7pIkgld5JfmNljlBWz4RpYcVHwbYbXSQQIb/7PwW7VisiW8zdCkoPKqfpSof1qsRmAk6lfvGV16M2NS96iq6MDpZcYPCc=");
    auto java_privateKey4096bin = base64_decodeToBytes("JgAcAQABxAAB1/nw2Tyss+Ey5vExAMrNKhdf+ENZn89p6E2H9K7vJk6KX1ZzDHx3oYnl9M56vtEerR91kDxNDFwRrYCEAZM+2j+BKB0I98xk8EpbwYIkJum59MwPDK1ayoPPAgWvFN6PrTGO3TTuktMbmZJPSJsIjzjOoCTmsXq1SZhtC2EhyQMm/Umz2AgVJ2TaWHJiSfH7T0y+IdhcuRCzT5MC1wg0IrS2LAvxJU3R4XY3I5SAUkNUYW7JU8RLGqJilU9rSNUDGB9bdZSSbB0HBSRs3tuKY5xBDyxqgYL9FEnOOAHnvYFofihAv59BVWCs6UYgYC8ctpdOhuBZQVhSyRqWPnHq7cQAAc2y6Vyt5B4JzBRUsCauayP9JXQQvuWoKmlY+NjsuIL4VuFmESICit8MeM5UU/pag1cqx+4olJO5ifwqrBps4atkpUVS65mVKFiugAVi8hjXPIn5YpANwUsM9ntxEYig12UsfCvjl81OL4O42tcrSqpqZQ5FduzDoT9nhewSCzzdo7qmUhMKCFKKvTBkAyxiBkY567/aeFSEH1YQW0lRoYETuWeu9CZIvwrd5eGG+qmOGFyT+NJP+yas0SmbnvumOdROQUNmjn9QDlcDGGAk95FjFcMZAUg04T9GSE9nplcLQiq1EWmDrJgGx7O6fdEqDFJafkc059qVB+QXceEB4ms=");
    auto java_publicKey2048bin = base64_decodeToBytes("HggcAQABxAABoeEyrpWsAEh40vJb06IO7JpJsfTcWNbSX9rI94V+62vOxKvX2hjQLAxbHGhNZ3uiObaVPlNQS71QgHxqW/GPKQ4hCoZ7Jo7A/ZnRvuW8LTGFn3nLN3d0wsKow325uVP0PPisMsv6RnpapQeU6H6njO6csawF1RFZWJ9qnT8ANeNd7B7XbshqVCuEnUlKEkPcm7Kzj+WAqL/A0Kn/TVjqISdjvv0LeHM1APRAcQW3habTxcyheZ7Lf2r8NbJifLoj9pFwZsK6mCBqlvAIp3jUIv3bvcYcWR8xp74tkZMf/Kg/HmO/ozYqrhNr2yf/QwY44PHLZsuYzftRDZgyA48IUw==");
    auto java_publicKey4096bin = base64_decodeToBytes("HggcAQABxAACrYoWiBlfHiBDyu7/vijSTqwj5v/7dfuU0dA54mBpFeUvzH5ovCF7Ix00GSKJT4MCkagTKosrBb3/mYuQA4TpA8hd2TwTCzLmm0C17k2sl6sDChT64wUW7K5ahHuE+1IB0pc9U0XxIxR7nrX87JCQTMttw8FGmZeo4xYSY6k7N8iFXmJgcE4SViFcCW8qtqWOS2V5AcDLoPHSJHxsKz8/wPNRa0dUdAf87shauCDmN41QAUWqaAxSvsxDNk1CM5AY/slSWVQyu/QuD/7h6AN74KVESvvKvcTTxPDNyTFOeDZMoe9Ssxp6UXDIPCtniwwUVfY7hFik5Y7oSuVc6nm9hAHDGTxzyIy7caiLgfqtuFaXuV7+f2fz02V139M18EqKoggewvCg1Wnn7wdzOkXCK4u4ZPelpqy6wfR9Lddj9LJjID+xQS0rxZpQnjpKTqJxJY/Fw9O6Q3B3THM0NkqDorgh5bYqSS3NEblNL5qxQPLZdLTQm5jBYO+YCq4uQ1czHlbhVCqO0jAl3YKcgC+UTzlcm+iThqqDAddhvQei+lzJPcq6VCIKD+N0ilFMfZkP40Rie5CrD1YMm/CPs+QZSKtj3PVBZeH+/wpx8ZgQQHQly4+JR+spPWhMoP3rp8i9UXSRaYFPZNs1F1qst6Y5Wz307lZS/ODnzXcbdeLvaw8=");
    auto java_encrypted2048 = base64_decodeToBytes("YEHeC0XkGqIE8eF1YU38RV0LKnwQDlruaxTsh3v/yanTvnmDAI5gL3zigqUUTvwmcXjxkZ1gdLZDlS2IT4iI1R4w2C1Hg7aCw8oKZDmhpggXtP9FfoE82q2nJUKNSbgTXwOM5AtlvoncxMi6n2L7KY9BlPZswgbiaTI9A/inzWNdh9TssjyOQfg/KJnDiVaOZ94bjFUCS3mvyv4B+tP1effckKzJEODmDtgQ5SGg0RBr2UXu08MV2KNy9xCYGZOkzzQO1fX5rtXyTbkI99dN9mucoidIqgGbTpiQTmwwgX0yexcwtDBU9O/M3SujldUYpj2sk7+iUxJODd/r1zRdlg==");
    auto java_encrypted4096 = base64_decodeToBytes("oCp8MV+iG8l9u2lbDXxo0gOjXCFtg0lJ3Rf9QqpsOgrkV3eAqVRaJxnFkP5avdhu2ZCw06njX13r6y/dxCdBdmMUKMzUlniIv9xfmCLqs3Em0Q7fMdJT5jKMOozaBC0TvI+Ver+Jkzdo/513ChixlBtr6iffqy8CktHOpDYa6B5GzPwxbyOHOcdtWFKAMizgw5y3MBqhyJKD99qV54bkiJFtTQiw9GdD6EFBd40eP3lOzSsKK+ycOF94u6NHPXKSSRHliPL40HSRHzzMdQkbODkCRFODNkbYB2LsL9gpdA97u0gC18heWFTlYMnwYgsb9p0UNe9uPJDqe08nuQhTjQB22KNQTqVEMRVLaWzCrlt6k4b+kxAMSdBQg8vJ7hIG2Eczxw5MEDOXwVDMuzfiW4YXrgJ01pM0E2MIxdRchNPqIXHaWJCsApdgzL0UZVDzolHRVlElO9SYf4apknZ+ecmW3X+yrksVjShH9lzae8p8H/wZYD3AnSO9aRFGA/gx/3XIVqTfb4dP+ksWhlqqfJOSJnmqFMtqq/okVceupmxat/HBMonJNo8OL3LSa4hh7GO4z7Bq3HCwsUf/06UpWB3NJcrgRFfdu6M+oZrvxgxik5rqM6mPBDM+E6mRvphAWFZfoO0DHXfJF8yoBz0nYiFZ00WgoT8Mr7PayISKYgw=");
    auto java_sig2048_sha1 = base64_decodeToBytes("JTAJm37vKgK90Q89Meh1NZa/TQjaVG4UVj/+VLvewJscUeoigeRofixl6tme1+n0kqJHSI1AVe8z/ySEPvtWJZ6swRvihQcHakd5i5VEQFeiFj9BhF0hIlMsiZJQrBs6AmzZh3W+tv2qwqeQmYiNsj+M+2c9y1E2ntZ5tSHGHkKF66WZCw1dYqRcUxclCJ1IWMTZeSDv5jCgyCE3WOqchFYhUDaqEF20CpirZ9sdLXMNogBWOrQ11S3XXFn/i84+SxWh44gxEjJca38BUL0I5nsSn/81A6vMn2ARYGCWcS/AM/VigXZGvrBuVUjW9ft1UcUezx6rpbcct8ruVZlpXw==");
    auto java_sig2048_sha256 = base64_decodeToBytes("cPYmVfwMSjhgxITlkTp1wRjfWeFwMWEDBgBHm99G9H12FbNbztz8OKGTYnjcUKmt0tpr2QWUZZiUhBRorFVnA5jLqjUgbu1O13Dd1yDYsQxDVQZx00wakJckQST+r5+PsR7lXp1W4B7uVsyKxueilNwqX6SG/kVBPlTYmdwpK3eWV1HptgtXOrJ59btCS1cxVnEkbEB11opd5k7D96VjzZHmsT2jbVxXQhHJ5TRX4FOYBoymvGoTgmQsQ5+D8ODlXndCvUuATEqsQsTcmjy25sJjC1toHeap952nTz0ye20SVrBh9MITJBMrSeqW84rFaPMo3sKilMcQuOJCN420fg==");
    auto java_sig2048_sha512 = base64_decodeToBytes("nXgeLoi3UMoh1X/qsm5fE4422s6Sp/pxPYhwHzx3AKZSpsOkDtvxiV9NvS454Fu5r7mUMSMsTJt/hmnr+YtnwiARxUiwHwqi5YcFju3WO7engGLrVSrIDVTqipIYkscGTcuO2XXZrxF1lvC3d/TEqUf7b0JrXZZBYpPj7CTNnlzWN0iPcoSs7clJYHiRJaRW+aUj9BXBLB2oZaGC3kXOc+bhyO7GPuAshwpgwoXh3GXLbPk6Rwlb1NrK0hq+MQP3OPmXyEUYZ5YVZ9Ef/V39aGwLl7b85HQYQQ42Bz9YKJmijUPiAp36oE//POyyHsuuYCR129VWcbiFlerMz9QduQ==");
    auto java_sig2048_sha3_256 = base64_decodeToBytes("hFrXgdQPNB11VkHNV3CE+RO66P6pbZ07kHh/+nRKPxihify9wsMpFToUKY7MgFnucBaKiTgburcWqe4YL0JZabrVcHE7TdfT7uSDKKOgRbYzJZslaRHtoYvdGkqSdTVUD3SyKdKQl6tqpP9DkhNTIwTrM2AZ/JUGYW9YU46h2DHuWG1iVc2H3W+blVNpQT53eUt+emwZVuzsMstzETM8v08zUn4BKQfRHG2JBFWVnCyLJrL6rUH5E69N/UOdrCpoiufuoxexykNeOriWNTghE9cpqLTSUuh1NE+gcAaa3SFL4pOES2jmALyilLdylWCvhq0LUbdzccQ9KHZ9EUT42Q==");
    auto java_sig4096_sha1 = base64_decodeToBytes("nUMUiQOIswg9Kgrj671LstoqPa+rez/iYM5Mna7tTomNSIIiQVixws5lwO+/gKcaSFvxJMa2ooejZKAO9CjLapi+jcZcaE+cVkMDCXRn96fiSM1cEsJJrKllbPhVIzIFA1RP1qgLAeRrXsJ3Fqlt5P1LBZVCe7VqeEaApe0eJtQOJ4u9m4+zvEu/yYLfhxXXQzkJ/gkYKU7ESm1ZK206+ny+O3ButznxlkvjcvT12LA9/I8tjVNTrgyeqgbTHgejEmSAUh3ARKNSfse9qBNyBKiKnBN7TikOJjeQ8bXSNN0wxtaaAZUkEKjaX9Wd6PYq5iFj/awW9hxBIrqaPWkmnpj9hmWPaJI4hBo+RTHMmu3qLSj+4tLjEix6+7SUCXZo6EwVr3p+ED7OccGCrTQCs4XRR769Bfo5EDIfA6aBr5AYMqlMR633KMaaJ7uGgM2c/tOxOnn2pih/3BsbnOAJxB8PIafh9byTeVAX/8fL1DA5E2rJrmnVNYmcAOFRYYKq0VVyFtJ6uO7CSEG5uqkEu3Jff8nw1VTWvURw1LwUoMCZgAL0jZkImyRPio89uJSl6+ImFHADOTMGb9GIMce9Mhi5qotZIqblBoD2O9bAm0jd+HqaX9kBf5+YLjL+W8B9FkE94HTOjoijoSnU/vexLBN6mlSUyZcRvjlDe+tB09I=");
    auto java_sig4096_sha256 = base64_decodeToBytes("R5MZbaJx+KQAwhAPGtUe+sgEQGXjiYSgFkwQLqk3yJ7+G/Dnzx4gORSIdWrHGzOhKIEQ2yvwYKj/C+j5fFFkk9HU7gCFz8/GV4AYeWyWBDNlBufg3FVXUqH615gDMPbkZ+lxXnDKk0KFU6phe8aPv5Ir0vvnkfC8sk8ncB6QrNE0gbjy96lVOH0DAnDySVFZtzZYNAXgkogpZc7wA/UEXjvUDvS8ZvKHWQl+cnoS5YKr6T+gdUhw0Pe0r+H8ZpsgGModJew+9TsrxQ91PN94F5B3GEqLGns6CoGWO2UKkw0rtkAmTk3cOvFf0AyTXySNgYHPR0JqqrTzlRXYPYEhkl7TUVDhcNmYtBux9dkar+CuVWdx2QLAtpRuD/Aplpxsb4F/7KPDJUvqzbbXX3pX7bwXet31+Sy5D6ioLMCz//Smh41PGkg+5eTCnP8jVuqBk4NLI7AMpZrnAGymvQjMOdOuhrLL0anA4E6yeiYmTgEviBwxUBdzgKMn30PBj5Ml56Jsr1+Hg2pYl5pbEj76BKPZc1kz9OHutT+Nm75H8J/h9UuiOZ/WL2YbTDGOrqr+BHkzx9vqPmMhD1o/C4lwD7J/V6kGEIO5+cOutIR0Y28ODUMk+I1tcF7iKBq4ygntBkZVJi+EhHraZdyt2/t7lEdAM18HDGCLKIFOaVPnrNs=");
    auto java_sig4096_sha512 = base64_decodeToBytes("paApvwratWdCK95gDUTtYJAwd9O7iCNe6GYdaYxEoPsqCoe2nARP4gghoNADtLO+omWwzWqjKxhNtzE500DnKrBpQ2Ye36TLei34ebAmaQ9wjYQA+2cFpcTIfs60roQzSzB3OnzIQ+9swExWzo2aB4fxdlq4eKyaNjxBMwrwsbsYgFsxFp0zKgxsLwyRHGxdmLcko5IMdNs6QEDzl81BEh6fQe2uEyG+S2PNqXhxJaOBsmM39iQbPsrB06G4e/XA6bNLukTyXV/NO/WzuwyOao9X5LHqUqs+eWNSqye0BhYecdcDyv1B98nRAIp90PxIo6TeIth5Rqn7cfWT5E4W8lG6OKw76xFaYaHojTrt32LCYfpsA03/sfAveasFv4v4YQS/wCz9sIiI8GqfHtNfaIyzQ/9OAGjn3AbKF5VYkg9nm8nmK514dHrXnap24tr3akZUH+dmazGkAdL08YCj8/pqAHKtbxERe0G4//j3t3SLEXAaO9xKU5mUj4YsYxNuytoUSReFwDoiUBbZr655vZBl7Q+jP6/Xh3kPtTbYI8xVz2DKJNWhi+bJM9kusl8ZaUE4jt8gxkFVzM5hT809Z478pOlJ6IEr5Nus+GuruFjvnhMjSh5czo3HwIVEio8horChscHGR9N9f7IXG3OYlHsL54cuPrp9NH4Y5rE4Kfo=");
    auto java_sig4096_sha3_256 = base64_decodeToBytes("oxSLJGRIjEPKEvQLX9Ml8alYyLfuqM/TBlQrAipVsHHg/sNCYZxhlm3KGR8YSF6oXkb3OA8XoPOqlQRJKALmxEEiwGPKSuJhS3Ot9wSKfbdNjyj4eQB6vpb/hpDmqXGWaubYcxneZGeZv+VVyoPD6GmKlu90epOLY/C2whd/2WnajetRUV9vOkFxZ83TX364RM2oeMkS7kj5y+Dz9vt4ZSbY4BUix3hx7cCWDT+MEAsk3IdQwcnsfudpQ/F7bOOQJ4hPfPdI3QDi+kLzcy5iiKIgS1r+Wqpu37ppCVShfDygfi7d3AlW/jqq47j0YNqtHHKsnBpkqEnUc+jVsOG682l9BaZ4pOLqXX9wPHyxOMzi5KlUWNZRWTkXydfTAWCqTejV1J1jmUWQNVaDOVJknSI63uQUHTdfsudu6vVeRS06ZQEtnF0tGhklYzs6jK88Z51JOoRCEzDimYZYIyJKrZdnFlX8CaJPPAaJliYzGi433RnDPYvG5TT7CsZLxYf/cu315OqWo1xmg8B9Dci5zE5DTJxbYOHBSr1NztEDxfrhDFf7ZQxVpXFq8zrZzqVMvoMSCo6E2Lt/h/LcJ4te696lAK5rsFYodkRVYmeETEz3npjTVnRwpulwU4X9VukvoEFV5F7JfrnEKEv4Nd/GopuZfm/y7yCtNrOwxpoSUJE=");
    auto java_fingerprint2048 = base64_decodeToBytes("B1Ggtv7JjfRPvBI/ZSvsxbgHVhQ5t0zTK7UIvLlGNjNu");
    auto java_fingerprint4096 = base64_decodeToBytes("B1/BKWayN9BqJK02xU6pRixIc1sKxHd7iqb2Xb3yHzVL");

    PrivateKey java_privateKey2048(java_privateKey2048bin);
    PrivateKey java_privateKey4096(java_privateKey4096bin);
    PublicKey java_publicKey2048(java_publicKey2048bin);
    PublicKey java_publicKey4096(java_publicKey4096bin);

    checkResult("", body, java_privateKey2048.decrypt(java_encrypted2048));
    checkResult("", body, java_privateKey4096.decrypt(java_encrypted4096));
    checkResult("", true, java_publicKey2048.verify(java_sig2048_sha1, body, HashType::SHA1));
    checkResult("", false, java_publicKey2048.verify(java_sig2048_sha1, body, HashType::SHA256));
    checkResult("", true, java_publicKey2048.verify(java_sig2048_sha256, body, HashType::SHA256));
    checkResult("", false, java_publicKey2048.verify(java_sig2048_sha256, body, HashType::SHA512));
    checkResult("", true, java_publicKey2048.verify(java_sig2048_sha512, body, HashType::SHA512));
    checkResult("", false, java_publicKey2048.verify(java_sig2048_sha512, body, HashType::SHA3_256));
    checkResult("", true, java_publicKey2048.verify(java_sig2048_sha3_256, body, HashType::SHA3_256));
    checkResult("", false, java_publicKey2048.verify(java_sig2048_sha3_256, body, HashType::SHA3_384));

    checkResult("", true, java_publicKey4096.verify(java_sig4096_sha1, body, HashType::SHA1));
    checkResult("", false, java_publicKey4096.verify(java_sig4096_sha1, body, HashType::SHA256));
    checkResult("", true, java_publicKey4096.verify(java_sig4096_sha256, body, HashType::SHA256));
    checkResult("", false, java_publicKey4096.verify(java_sig4096_sha256, body, HashType::SHA512));
    checkResult("", true, java_publicKey4096.verify(java_sig4096_sha512, body, HashType::SHA512));
    checkResult("", false, java_publicKey4096.verify(java_sig4096_sha512, body, HashType::SHA3_256));
    checkResult("", true, java_publicKey4096.verify(java_sig4096_sha3_256, body, HashType::SHA3_256));
    checkResult("", false, java_publicKey4096.verify(java_sig4096_sha3_256, body, HashType::SHA3_384));

    checkResult("", true, java_fingerprint2048==java_publicKey2048.fingerprint());
    checkResult("", false, java_fingerprint2048==java_publicKey4096.fingerprint());
    checkResult("", true, java_fingerprint4096==java_publicKey4096.fingerprint());
    checkResult("", false, java_fingerprint4096==java_publicKey2048.fingerprint());

    cout << "testGenerateNewKeys()... done!" << endl << endl;
}

void testSymmetricKeys() {
    cout << "testSymmetricKeys()..." << endl;

    auto body = base64_decodeToBytes("cXdlcnR5MTIzNDU2");
    body.insert(body.end(), body.begin(), body.end());
    auto javaKey = base64_decodeToBytes("9xZQWv3x+jq4th+llGZLJsuAc3lbYFz91LWXuHZVIkE=");
    auto javaEncrypted = base64_decodeToBytes("8yR802VTo0Oo68ca4Y55K2ff4PeQ9tkwlsN+HJyIeVcABoGvDVZZt44NNTfV7XAdJ1wTYUe1e7ERotKH0gLnOc7Z3lK0bTyJ");

    SymmetricKey symmetricKeyJava(javaKey);
    auto javaDecrypted = symmetricKeyJava.etaDecrypt(javaEncrypted);
    //printf("javaDecrypted: %s\n", base64_encode(javaDecrypted).c_str());
    checkResult("javaDecrypted", body, javaDecrypted);

    SymmetricKey symmetricKeyCpp;
    printf("cppKey: %s\n", base64_encode(symmetricKeyCpp.pack()).c_str());
    auto cppEncrypted = symmetricKeyCpp.etaEncrypt(body);
    printf("cppEncrypted: %s\n", base64_encode(cppEncrypted).c_str());
    auto cppDecrypted = symmetricKeyCpp.etaDecrypt(cppEncrypted);
    //printf("cppDecrypted: %s\n", base64_encode(cppDecrypted).c_str());
    checkResult("cppDecrypted", body, cppDecrypted);

    cout << "testSymmetricKeys()... done!" << endl << endl;
}

void udpAdapterHelloWorld() {
    cout << "udpAdapterHelloWorld()..." << endl;

    string body0("packet from node-0");
    string body1("some data from node-1");
    string body2("data from node-2");

    asyncio::IOHandle socket0;
    asyncio::IOHandle socket1;

    socket0.openUDP("127.0.0.1", 4040);
    socket1.openUDP("127.0.0.1", 4041);

    socket0.recv([&](ssize_t result, const asyncio::byte_vector& data, const char* IP, unsigned int port) {
        if (data.size() > 0)
            cout << "socket0 receive data, result=" << result << ", size=" << data.size() << ": " << string(data.begin(), data.end()) << endl;
    });
    socket1.recv([&](ssize_t result, const asyncio::byte_vector& data, const char* IP, unsigned int port) {
        if (data.size() > 0) {
            cout << "socket1 receive data, result=" << result << ", size=" << data.size() << ": "
                 << string(data.begin(), data.end()) << endl;
            checkResult("udp", body0, string(data.begin(), data.end()));
        }
    });

    for (int i = 0; i < 1000; ++i) {
        socket0.send(byte_vector(body0.begin(), body0.end()), "127.0.0.1", 4041, [](ssize_t result) {});
    }

    std::this_thread::sleep_for(2000ms);

    socket0.stopRecv();
    socket1.stopRecv();
    socket0.close([&](ssize_t result){});
    socket1.close([&](ssize_t result){});
    std::this_thread::sleep_for(1000ms);

    cout << "udpAdapterHelloWorld()... done!" << endl << endl;
}

void testCryptoAll() {
    testCrypto();
    testHashId();
    testHashIdComparison();
    testKeyAddress();
    testSafe58();
    testPackUnpackKeys();
    testAllHashTypes();
    testKeysConcurrency();
    testGenerateNewKeys();
    testSymmetricKeys();
    udpAdapterHelloWorld();
}
