//
// Created by Roman Uskov on 2018-12-17.
//

#ifndef UNITOOLS_UARRAY_H
#define UNITOOLS_UARRAY_H

#include <memory>
#include "UObject.h"
#include <vector>
#include <functional>

class UArray : public UObject {

private:
    class UArrayData : public UData {
        public:
            UArrayData(std::initializer_list<UObject> ilist);
            UArrayData();
            ~UArrayData();
            std::vector<UObject> array;
    };

public:

    static bool isInstance(const UObject& object);


    typedef  std::vector<UObject>::reverse_iterator reverse_iterator;
    typedef  std::vector<UObject>::const_reverse_iterator const_reverse_iterator;
    typedef  std::vector<UObject>::iterator iterator;
    typedef  std::vector<UObject>::const_iterator const_iterator;
    typedef  std::vector<UObject>::size_type size_type;
    typedef  std::vector<UObject>::reference reference;
    typedef  std::vector<UObject>::const_reference const_reference;
    typedef  std::vector<UObject>::value_type value_type;


    UArray();

    static UArray& asInstance(UObject& object) {
        if(!object.dataIsInstanceOf<UArrayData>())
            throw std::invalid_argument("object is not instance of UDouble");

        return (UArray&)object;
    }

    static const UArray& asInstance(const UObject& object) {
        if(!object.dataIsInstanceOf<UArrayData>())
            throw std::invalid_argument("object is not instance of UDouble");

        return (const UArray&)object;
    }


    UArray(std::initializer_list<UObject> ilist );


    iterator insert( const_iterator pos, const UObject& value );

    iterator insert( const_iterator pos, UObject&& value );

    iterator insert( const_iterator pos, size_type count, const UObject& value );

    template< class InputIt >
    iterator insert( const_iterator pos, InputIt first, InputIt last );

    iterator insert( const_iterator pos, std::initializer_list<UObject> ilist );

    reference at( size_type pos );

    const_reference at( size_type pos ) const;

    reference operator[]( size_type pos );

    const_reference operator[]( size_type pos ) const;

    reference front();

    const_reference front() const;

    reference back();

    const_reference back() const;

    iterator begin() noexcept;

    const_iterator begin() const noexcept;

    const_iterator cbegin() const noexcept;

    iterator end() noexcept;

    const_iterator end() const noexcept;

    const_iterator cend() const noexcept;


    reverse_iterator rbegin() noexcept;

    const_reverse_iterator rbegin() const noexcept;

    const_reverse_iterator crbegin() const noexcept;

    reverse_iterator rend() noexcept;

    const_reverse_iterator rend() const noexcept;

    const_reverse_iterator crend() const noexcept;

    bool empty() const noexcept;

    size_type size() const noexcept;

    size_type max_size() const noexcept;

    void reserve( size_type new_cap );

    size_type capacity() const noexcept;

    void shrink_to_fit();

    void clear() noexcept;

    template< class... Args >
    iterator emplace( const_iterator pos, Args&&... args );

    iterator erase( const_iterator pos );

    iterator erase( const_iterator first, const_iterator last );


    void push_back( const UObject& value );

    void push_back( UObject&& value );

    template< class... Args >
    void emplace_back( Args&&... args );

    void pop_back();

    void resize( size_type count );

    void resize( size_type count, const value_type& value );

    void swap( UArray other );

    UArray flat(int depth) const;
    UArray map(std::function<const UObject(const UObject&)> transformator) const;
    UArray flatMap(std::function<const UObject(const UObject&)> transformator) const;
    UArray filter(std::function<bool(const UObject&)> predicate) const;

    std::insert_iterator<std::vector<UObject>> endInserter();
};


#endif //UNITOOLS_UOBJECT_H
