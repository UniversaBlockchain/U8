/*
 * Copyright (c) 2018-present Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

#ifndef UNIVERSA_BASESERIALIZER_H
#define UNIVERSA_BASESERIALIZER_H

#include "../types/UObject.h"
#include "../types/UBinder.h"
#include "../types/UString.h"

class BaseSerializer {

public:
    BaseSerializer() = default;

    static UObject serialize(const UObject& o);
    static UObject deserialize(const UObject& o);

protected:
    template <typename T> static UObject serializeObject(T o, std::string typeName);
    template <typename T> static T deserializeObject(const UBinder& data);

private:
    static UObject skipBaseTypes(const UObject& o);
};


#endif //UNIVERSA_BASESERIALIZER_H
