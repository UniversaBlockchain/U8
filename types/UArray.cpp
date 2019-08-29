/*
 * Copyright (c) 2018 Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

#include "UArray.h"
#include "UBinder.h"

UArray UArray::flat(int depth) const {
    auto result = UArray();

    for (auto it = cbegin(); it != cend(); it++) {

        if ((depth > 0) && UBinder::isInstance(*it)) {
            auto inside = UBinder::asInstance(*it).flat(depth - 1);

            if (!inside.empty())
                result.insert(result.end(), inside.cbegin(), inside.cend());
        } else if ((depth > 0) && UArray::isInstance(*it)) {
            auto inside = UArray::asInstance(*it).flat(depth - 1);

            if (!inside.empty())
                result.insert(result.end(), inside.begin(), inside.end());
        } else
            result.push_back(*it);
    }
    return result;
}

UArray UArray::map(std::function<const UObject(const UObject&)> transformator) const {
    auto result = UArray();

    std::transform(begin(),end(), result.endInserter(),[transformator](UArray::value_type const& value) {
        return transformator(value);
    });
    return result;
}

UArray UArray::flatMap(std::function<const UObject(const UObject&)> transformator) const {
    return map(transformator).flat(1);
}

UArray UArray::filter(std::function<bool(const UObject&)> predicate) const {
    auto result = UArray();

    std::copy_if(cbegin(),cend(),result.endInserter(),[predicate](UArray::value_type const& value) {
        return predicate(value);
    });
    return result;
}

std::insert_iterator<std::vector<UObject>> UArray::endInserter() {
    return std::inserter(data<UArrayData>().array,end());
}

void UArray::swap(UArray other) {
    data<UArrayData>().array.swap(other.data<UArrayData>().array);
}

void UArray::resize(UArray::size_type count, const UArray::value_type &value) {
    data<UArrayData>().array.resize(count,value);
}

void UArray::resize(UArray::size_type count) {
    data<UArrayData>().array.resize(count);
}

void UArray::pop_back() {
    data<UArrayData>().array.pop_back();
}

void UArray::push_back(UObject &&value) {
    data<UArrayData>().array.push_back(value);
}

void UArray::push_back(const UObject &value) {
    data<UArrayData>().array.push_back(value);
}

UArray::iterator UArray::erase(UArray::const_iterator first, UArray::const_iterator last) {
    return data<UArrayData>().array.erase(first,last);
}

UArray::iterator UArray::erase(UArray::const_iterator pos) {
    return data<UArrayData>().array.erase(pos);
}

template<class... Args>
UArray::iterator UArray::emplace(UArray::const_iterator pos, Args &&... args) {
    return data<UArrayData>().array.emplace(pos,args...);
}

template<class... Args>
void UArray::emplace_back(Args &&... args) {
    data<UArrayData>().array.emplace_back(args...);
}

void UArray::clear() noexcept {
    data<UArrayData>().array.clear();
}

void UArray::shrink_to_fit() {
    data<UArrayData>().array.shrink_to_fit();
}

UArray::size_type UArray::capacity() const noexcept {
    return data<UArrayData>().array.capacity();
}

void UArray::reserve(UArray::size_type new_cap) {
    data<UArrayData>().array.reserve(new_cap);
}

UArray::size_type UArray::max_size() const noexcept {
    return data<UArrayData>().array.max_size();
}

UArray::size_type UArray::size() const noexcept {
    return data<UArrayData>().array.size();
}

bool UArray::empty() const noexcept {
    return data<UArrayData>().array.empty();
}

UArray::const_reverse_iterator UArray::crend() const noexcept {
    return data<UArrayData>().array.crend();
}

UArray::const_reverse_iterator UArray::rend() const noexcept {
    return data<UArrayData>().array.rend();
}

UArray::reverse_iterator UArray::rend() noexcept {
    return data<UArrayData>().array.rend();
}

UArray::const_reverse_iterator UArray::crbegin() const noexcept {
    return data<UArrayData>().array.crbegin();
}

UArray::const_reverse_iterator UArray::rbegin() const noexcept {
    return data<UArrayData>().array.rbegin();
}

UArray::reverse_iterator UArray::rbegin() noexcept {
    return data<UArrayData>().array.rbegin();
}

UArray::const_iterator UArray::cend() const noexcept {
    return data<UArrayData>().array.cend();
}

UArray::const_iterator UArray::end() const noexcept {
    return data<UArrayData>().array.end();
}

UArray::iterator UArray::end() noexcept {
    return data<UArrayData>().array.end();
}

UArray::const_iterator UArray::cbegin() const noexcept {
    return data<UArrayData>().array.cbegin();
}

UArray::const_iterator UArray::begin() const noexcept {
    return data<UArrayData>().array.begin();
}

UArray::iterator UArray::begin() noexcept {
    return data<UArrayData>().array.begin();
}

const UObject &UArray::back() const {
    return data<UArrayData>().array.back();
}

UObject &UArray::back() {
    return data<UArrayData>().array.back();
}

const UObject &UArray::front() const {
    return data<UArrayData>().array.front();
}

UObject &UArray::front() {
    return data<UArrayData>().array.front();
}

const UObject &UArray::operator[](UArray::size_type pos) const {
    return data<UArrayData>().array[pos];
}

UObject &UArray::operator[](UArray::size_type pos) {
    return data<UArrayData>().array[pos];
}

const UObject &UArray::at(UArray::size_type pos) const {
    return data<UArrayData>().array.at(pos);
}

UObject &UArray::at(UArray::size_type pos) {
    return data<UArrayData>().array.at(pos);
}

UArray::iterator UArray::insert(UArray::const_iterator pos, std::initializer_list<UObject> ilist) {
    return data<UArrayData>().array.insert(pos,ilist);
}

UArray::iterator UArray::insert(UArray::const_iterator pos, const UObject &value) {
    return data<UArrayData>().array.insert(pos,value);
}

UArray::iterator UArray::insert(UArray::const_iterator pos, UObject &&value) {
    return data<UArrayData>().array.insert(pos,value);
}

UArray::iterator UArray::insert(UArray::const_iterator pos, UArray::size_type count, const UObject &value) {
    return data<UArrayData>().array.insert(pos,count, value);
}

//template<class InputIt>
//UArray::iterator UArray::insert(UArray::const_iterator pos, InputIt first, InputIt last) {
UArray::iterator UArray::insert(UArray::const_iterator pos, UArray::const_iterator first, UArray::const_iterator last) {
    return data<UArrayData>().array.insert(pos,first, last);
}

UArray::UArray(std::initializer_list<UObject> ilist) : UObject(std::make_shared<UArrayData>(ilist)) {

}

UArray::UArray() : UObject(std::make_shared<UArrayData>()) {

}

bool UArray::isInstance(const UObject &object) {
    return object.dataIsInstanceOf<UArrayData>();
}

UArray::UArrayData::UArrayData(std::initializer_list<UObject> ilist) :  array(ilist) {

}

UArray::UArrayData::UArrayData()  {

}

UArray::UArrayData::~UArrayData(){

}
