//
// Created by Roman Uskov on 2018-12-17.
//

#include <cstring>
#include "UBytes.h"


UBytes::UBytesData::UBytesData(const unsigned char* v, unsigned int size)   {
    value.assign(v,v+size);
}

UBytes::UBytesData::UBytesData()  {

}


bool UBytes::isInstance(const UObject &object) {
    return object.dataIsInstanceOf<UBytesData>();
}

UBytes &UBytes::asInstance(UObject &object) {
    if(!object.dataIsInstanceOf<UBytesData>())
        throw std::invalid_argument("object is not instance of UBytes");

    return (UBytes&)object;
}

const UBytes &UBytes::asInstance(const UObject &object) {
    if(!object.dataIsInstanceOf<UBytesData>())
        throw std::invalid_argument("object is not instance of UBytes");

    return (const UBytes&)object;
}


UBytes::UBytes(const unsigned char* v, unsigned int size) : UObject(std::make_shared<UBytes::UBytesData>(v,size)) {

}

UBytes::UBytes(std::vector<unsigned char>&& val) : UObject(std::make_shared<UBytes::UBytesData>()) {
    data<UBytesData>().value = std::move(val);
}

const std::vector<unsigned char>& UBytes::get() const {
    return data<UBytesData>().value;
}

