// U8 CJS module


/**
 * Return 0 <= i <= array.length such that !pred(array[i - 1]) && pred(array[i]).
 */
function binarySearch(array, pred) {
    let lo = -1, hi = array.length;
    while (1 + lo < hi) {
        const mi = lo + ((hi - lo) >> 1);
        if (pred(array[mi])) {
            hi = mi;
        } else {
            lo = mi;
        }
    }
    return hi;
}


class SortedSet {
    constructor(iterable=[], comparator = (a, b) => b - a) {
        this.comparator = comparator;
        this.data = [...iterable].sort(this.comparator);
    }

    get first() {
        return this.data[0];
    }

    removeFirst() {
        return this.data.shift();
    }

    removeLast() {
        return this.data.pop();
    }

    get last() {
        return this.data.slice(-1);
    }

    add(newItem) {
        this.data.push(newItem);
        this.data.sort(this.comparator);
    }

    addAll(iterable) {
        this.data = [...this.data,...iterable]
        this.data.sort(this.comparator);
    }

    [Symbol.iterator]() {
        return this.data[Symbol.iterator]();
    }
}

// let x = new SortedSet();
// // for( i of [2, 4, 0, 5, 1]) x.add(i);
// x.addAll([2, 4, 0, 5, 1]);
// x.addAll([9,8,7,11,22]);
//
// console.log("--------------------")
// // console.log("-- ex 0 - "+x.removeFirst())
// // console.log("-- ex 0 - "+x.removeLast())
// for( i of x ) { console.log(i); }
// // console.log(x.first);
// // console.log(x.last);
// console.log("--------------------")
// console.log("--------------------"+(new Date() < new Date()))

module.exports = {binarySearch: binarySearch, SortedSet: SortedSet}