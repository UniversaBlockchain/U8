//
// Created by Sergey Chernov on 2019-01-07.
//

#ifndef U8_JSPROMISE_H
#define U8_JSPROMISE_H

#include <string>
#include <vector>
/**
 * The base class for async JS-initiated C++ library functinos, sucj as encryption/decryption, signging/signature
 * checking, file IO and so on, everything than can and therefore _must_ be executed in the separated thread
 * from Javasctipt.
 */
template <typename T>
class JsPromise {
public:
    enum ErrorCode {
        IO_ERROR,
        BAD_PARAMETER
    };

    /**
     * Call it when the operation is successfully finished passing the result (should be simple or smart
     * pointer to some instance).
     *
     * @param result operation result
     */
    virtual void success(T result) = 0;

    /**
     * Call it to signal error. Error code should be from enum above, and text could be anything in utf8 or ascii.
     * It will cause Promise failure on JS side.
     *
     * @param error
     * @param text
     */
    virtual void error(ErrorCode error,const std::string& text);
};

class JsBinaryPromise : public JsPromise<std::vector<unsigned char>> {};

#endif //U8_JSPROMISE_H
