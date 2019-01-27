//
// Created by Roman Uskov on 2018-12-17.
//

#include <cstring>
#include "UBytes.h"

UBytes::UBytesData::UBytesData(const unsigned char *v, unsigned int size)  {
    value.first = new unsigned char[size];
    value.second = size;
    memcpy(value.first,v,size*sizeof(unsigned char));
}

UBytes::UBytesData::UBytesData(const std::pair<unsigned char*, unsigned int>& val)  {
    value.first = new unsigned char[val.second];
    value.second = val.second;
    memcpy(value.first,val.first,val.second*sizeof(unsigned char));
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


UBytes::UBytes(const unsigned char * value, unsigned int size) : UObject(std::make_shared<UBytesData>(value,size)) {

}

UBytes::UBytes(const std::pair<unsigned char*, unsigned int>& val) : UObject(std::make_shared<UBytesData>(val)) {

}

const std::pair<unsigned char*, unsigned int>& UBytes::get() const {
    return data<UBytesData>().value;
}

