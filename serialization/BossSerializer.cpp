/*
 * Copyright (c) 2018-present Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

#include <cassert>
#include <cstring>
#include <sstream>
#include "../types/UBool.h"
#include "../types/UDateTime.h"
#include "../types/UDouble.h"
#include "../types/UInt.h"
#include "../types/UArray.h"
#include "BossSerializer.h"

UBytes BossSerializer::serialize(const UObject& o) {

    Writer writer;
    writer.writeObject(o);
    return writer.getBytes();
}

UBytes BossSerializer::dump(std::vector<UObject> objs) {

    Writer writer;
    for (int i = 0; i < objs.size(); i++)
        writer.writeObject(objs[i]);

    return writer.getBytes();
}

UObject BossSerializer::deserialize(const UBytes& data) {

    Reader reader(data);
    return reader.readObject();
}

BossSerializer::Writer::Writer()
: treeMode(true) {}

BossSerializer::Writer::Writer(bool treeMode)
: treeMode(treeMode) {}

void BossSerializer::Writer::setStreamMode() {
        cache.clear();
        treeMode = false;
        writeHeader(TYPE_EXTRA, XT_STREAM_MODE);
}

void BossSerializer::Writer::writeObject(const UObject& o) {

    if (o.isNull() || UInt::isInstance(o) || UDouble::isInstance(o) || UBool::isInstance(o) || UBytes::isInstance(o) || UString::isInstance(o))
        put(o);
    else
        put(BaseSerializer::serialize(o));
}

void BossSerializer::Writer::put(const UObject& o) {

    if (o.isNull()) {
        // Null is CREF #0
        writeHeader(TYPE_CREF, 0);

    } else if (UInt::isInstance(o)) {
        int64_t i = UInt::asInstance(o).get();

        if (i >= 0)
            writeHeader(TYPE_INT, (unsigned long) i);
        else
            writeHeader(TYPE_NINT, (unsigned long) -i);

    } else if (UDouble::isInstance(o)) {
        double d = UDouble::asInstance(o).get();

        if (d == 0)
            writeHeader(TYPE_EXTRA, XT_DZERO);
        else if (d == -1.0)
            writeHeader(TYPE_EXTRA, XT_DMINUSONE);
        else if (d == 1.0)
            writeHeader(TYPE_EXTRA, XT_DONE);
        else {
            unsigned char dbuf[8];
            if (buf.capacity() < buf.size() + 9)
                buf.reserve(buf.size()*2 + 9);

            writeHeader(TYPE_EXTRA, XT_DOUBLE);
            memcpy(dbuf, &d, 8);

            std::copy(dbuf, dbuf + 8, std::back_inserter(buf));
        }

    } else if (UBool::isInstance(o)) {
        writeHeader(TYPE_EXTRA, UBool::asInstance(o).get() ? XT_TTRUE : XT_FALSE);

    } else if (UDateTime::isInstance(o)) {
        TimePoint time = UDateTime::asInstance(o).get();

        if (buf.capacity() < buf.size() + 6)
            buf.reserve(buf.size()*2 + 6);

        writeHeader(TYPE_EXTRA, XT_TIME);
        writeEncoded((unsigned long) time.time_since_epoch().count() / std::chrono::high_resolution_clock::period::den);

    } else if (UBytes::isInstance(o)) {
        UBytes bytes = UBytes::asInstance(o);

        if (!tryWriteReference(bytes)) {
            const std::vector<unsigned char>& bb = bytes.get();

            writeHeader(TYPE_BIN, bb.size());
            if (buf.capacity() < buf.size() + bb.size())
                buf.reserve(buf.size()*2 + bb.size());

            std::copy(bb.data(), bb.data() + bb.size(), std::back_inserter(buf));
        }

    } else if (UString::isInstance(o)) {
        UString str = UString::asInstance(o);

        if (!tryWriteReference(str)) {
            const char* data = str.get().data();
            unsigned long size = str.get().size();

            writeHeader(TYPE_TEXT, size);
            if (buf.capacity() < buf.size() + size)
                buf.reserve(buf.size()*2 + size);

            std::copy(data, data + size, std::back_inserter(buf));
        }

    } else if (UArray::isInstance(o)) {
        UArray array = UArray::asInstance(o);

        if (!tryWriteReference(array)) {
            writeHeader(TYPE_LIST, array.size());

            for (unsigned long i = 0; i < array.size(); i++)
                put(array[i]);
        }

    } else if (UBinder::isInstance(o)) {
        UBinder binder = UBinder::asInstance(o);

        if (!tryWriteReference(binder)) {
            writeHeader(TYPE_DICT, binder.size());

            for (auto it = binder.cbegin(); it != binder.cend(); it++) {
                put(UString(it->first));
                put(it->second);
            }
        }

    } else
        throw std::invalid_argument(std::string("BOSS serialize error: Unknown object type: ") + typeid(o).name());
}

UBytes BossSerializer::Writer::getBytes() {
    UBytes result(buf.data(), (unsigned int) buf.size());
    return result;
}

unsigned int BossSerializer::Writer::sizeInBytes(unsigned long value) {
    unsigned int cnt = 1;
    while (value > 255) {
        cnt++;
        value >>= 8;
    }
    return cnt;
}

void BossSerializer::Writer::writeHeader(unsigned int code, unsigned long value) {
    if (code > 7)
        throw std::invalid_argument(std::string("BOSS serialize error: invalid code"));

    if (value < 23)
        buf.push_back((unsigned char) (code | ((int) value << 3)));
    else {
        if (buf.capacity() < buf.size() + 9)
            buf.reserve(buf.size()*2 + 9);

        unsigned int n = sizeInBytes(value);
        if (n < 9) {
            buf.push_back((unsigned char) (code | ((n + 22) << 3)));
        } else {
            buf.push_back((unsigned char) (code | 0xF8));
            writeEncoded(n);
        }
        while (n-- > 0) {
            buf.push_back((unsigned char) (value & 0xFF));
            value >>= 8;
        }
    }
}

void BossSerializer::Writer::writeEncoded(unsigned long value) {
    while (value > 0x7f) {
        buf.push_back((unsigned char) (value & 0x7F));
        value >>= 7;
    }
    buf.push_back((unsigned char) (value | 0x80));
}

bool BossSerializer::Writer::tryWriteReference(cachedObject &obj) {
    auto it = cache.find(obj);
    if (it != cache.end()) {
        writeHeader(TYPE_CREF, it->second);
        return true;
    }

    // Cache put depends on the streamMode
    if (treeMode)
        cache[obj] = cache.size() + 1;

    return false;
}

bool BossSerializer::Writer::tryWriteReference(UBytes bytes) {
    if (!treeMode && cache.empty())
        return false;

    binary bb;
    bb.assign(bytes.get().data(), bytes.get().data() + bytes.get().size());
    cachedObject obj(CT_BIN, bb);

    return tryWriteReference(obj);
}

bool BossSerializer::Writer::tryWriteReference(UString str) {
    if (!treeMode && cache.empty())
        return false;

    binary bb;
    bb.assign(str.get().data(), str.get().data() + str.get().size());
    cachedObject obj(CT_TEXT, bb);

    return tryWriteReference(obj);
}

bool BossSerializer::Writer::tryWriteReference(UArray array) {
    if (!treeMode && cache.empty())
        return false;

    Writer arrayWriter(false);
    arrayWriter.writeObject(array);
    UBytes bytes = arrayWriter.getBytes();

    binary bb;
    bb.assign(bytes.get().data(), bytes.get().data() + bytes.get().size());
    cachedObject obj(CT_ARRAY, bb);

    return tryWriteReference(obj);
}

bool BossSerializer::Writer::tryWriteReference(UBinder binder) {
    if (!treeMode && cache.empty())
        return false;

    Writer binderWriter(false);
    binderWriter.writeObject(binder);
    UBytes bytes = binderWriter.getBytes();

    binary bb;
    bb.assign(bytes.get().data(), bytes.get().data() + bytes.get().size());
    cachedObject obj(CT_BINDER, bb);

    return tryWriteReference(obj);
}

BossSerializer::Reader::Reader(const UBytes& data)
: treeMode(true), bin(data.get().data()), size(data.get().size()) {}

void BossSerializer::Reader::setStreamMode() {
    cache.clear();
    treeMode = false;
}

UObject BossSerializer::Reader::readObject() {

    UObject o = get();

    if (UArray::isInstance(o) || UBinder::isInstance(o))
        return (BaseSerializer::deserialize(o));
    else
        return o;
}

UObject BossSerializer::Reader::get() {

    Header h = readHeader();

    switch (h.code) {
        case TYPE_INT:
            return h.getInt(false);

        case TYPE_NINT:
            return h.getInt(true);

        case TYPE_BIN: {
            if (pos + h.value > size)
                throw std::invalid_argument(std::string("BOSS deserialize error: overflow reading binary data"));

            UBytes bb = h.value > 0 ? UBytes(&bin[pos], (unsigned int) h.value) : UBytes(nullptr, 0);
            cacheObject(bb);
            pos += h.value;
            return bb;
        }

        case TYPE_TEXT: {
            if (pos + h.value > size)
                throw std::invalid_argument(std::string("BOSS deserialize error: overflow reading string"));

            std::string s(&bin[pos], &bin[pos] + h.value);
            UString str(s);
            cacheObject(str);
            pos += h.value;
            return str;
        }

        case TYPE_LIST: {
            UArray array;
            cacheObject(array);

            recursive.push_back(cache.size());

            for (int i = 0; i < h.value; i++)
                array.push_back(get());

            recursive.pop_back();

            return array;
        }

        case TYPE_DICT:
            return readBinder(h);

        case TYPE_CREF: {
            if (h.value != 0 && h.value > cache.size())
                throw std::invalid_argument(std::string("BOSS deserialize error: overflow cache"));

            for (auto i: recursive)
                if (i == h.value)
                    throw std::invalid_argument(std::string("BOSS deserialize error: recursive reference"));

            return h.value == 0 ? nullObject : cache[h.value - 1];
        }

        case TYPE_EXTRA:
            return parseExtra((int) h.value);
    }

    throw std::invalid_argument("BOSS deserialize error: Bad BOSS header");
}

UObject BossSerializer::Reader::readBinder(Header h) {
    UBinder binder;
    cacheObject(binder);

    recursive.push_back(cache.size());

    for (int i = 0; i < h.value; i++) {
        UObject key = get();
        if (!UString::isInstance(key))
            throw std::invalid_argument("BOSS deserialize error: key must be string");

        binder.set(UString::asInstance(key).get(), get());
    }

    recursive.pop_back();

    return binder;
}

BossSerializer::Header BossSerializer::Reader::readHeader() {
    unsigned char b = readByte();
    unsigned int code = (unsigned int) b & 7;
    unsigned long value = b >> 3;

    if (value >= 31) {
        unsigned long length = readEncodedLong();
        return Header(code, readLong(length));      //TODO: replace to BigInteger
    } else if (value > 22) {
        // up to 8 bytes, e.g. long
        return Header(code, readLong(value - 22));
    }

    return Header(code, value);
}

unsigned char BossSerializer::Reader::readByte() {
    if (pos + 1 > size)
        throw std::invalid_argument(std::string("BOSS deserialize error: overflow parsing header"));

    return bin[pos++];
}

unsigned long BossSerializer::Reader::readEncodedLong() {
    unsigned long value = 0;
    int shift = 0;

    while (true) {
        int n = readByte();
        value |= ((long) n & 0x7F) << shift;
        if ((n & 0x80) != 0)
            return value;
        shift += 7;
    }
}

unsigned long BossSerializer::Reader::readLong(unsigned long length) {
    if (length > 8)
        throw std::invalid_argument(std::string("BOSS deserialize error: invalid long length"));

    unsigned long res = 0;
    int n = 0;
    while (length-- > 0) {
        res |= (((long) readByte()) << n);
        n += 8;
    }

    return res;
}

UObject BossSerializer::Reader::parseExtra(int code) {
    switch (code) {
        case XT_DZERO:
            return UDouble(0.0);

        case XT_DONE:
            return UDouble(1.0);

        case XT_DMINUSONE:
            return UDouble(-1.0);

        case XT_TTRUE:
            return UBool(true);

        case XT_FALSE:
            return UBool(false);

        case XT_TIME: {
            TimePoint tp((std::chrono::high_resolution_clock::duration) std::chrono::seconds(readEncodedLong()));
            return UDateTime(tp);
        }

        case XT_STREAM_MODE:
            setStreamMode();
            return get();

        case XT_DOUBLE:
            if (pos + 8 > size)
                throw std::invalid_argument(std::string("BOSS deserialize error: overflow reading double"));

            double d;
            memcpy(&d, &bin[pos], 8);
            pos += 8;

            return UDouble(d);
    }

    std::stringstream error;
    error << "BOSS deserialize error: unknown extra code: " << code;
    throw std::invalid_argument(error.str());
}

void BossSerializer::Reader::cacheObject(UObject obj) {
    if (treeMode)
        cache.push_back(obj);
}

BossSerializer::Header::Header(unsigned int code, unsigned long value)
: code(code), value(value) {}

UInt BossSerializer::Header::getInt(bool negative) {
    return negative ? UInt(-value) : UInt(value);
}