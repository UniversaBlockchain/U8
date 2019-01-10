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

/**
 * Sorted array with comparator function, by default, numeric sort order. Allow more or less efficient
 * access to first and last (e.g. minimum and maximum) items and enoubn efficient items addition. Being an array
 * it is better to extract last items with {SortedArray#removeLast}.
 */
class SortedArray {
    constructor(iterable = [], comparator = (a, b) => a - b) {
        this.comparator = comparator;
        this.data = [...iterable].sort(this.comparator);
    }

    /**
     * Get first element (smallest) without deleting it
     * @returns {T | undefined}
     */
    get first() {
        return this.data[0];
    }

    /**
     * Extract and return first (smallest) element
     * @returns {T | undefined}
     */
    removeFirst() {
        return this.data.shift();
    }

    /**
     * Extract and return last (greatest) element
     * @returns {T | undefined}
     */
    removeLast() {
        return this.data.pop();
    }

    /**
     * Get the last (greates) element without extracting
     * @returns {T|undefined}
     */
    get last() {
        return this.data.slice(-1)[0];
    }

    /**
     * Add item in the proper place.
     * @param newItem item to add. If there are items equal to it. it will be inserted at some random place among them.
     */
    add(newItem) {
        this.data.push(newItem);
        this.data.sort(this.comparator);
    }

    /**
     * map all contained items, much like Array.map, and return results as Array.
     * @param callback to apply to each element.
     * @returns {any[]}
     */
    map(callback) {
        return this.data.map(callback);
    }

    forEach(callback) {
        this.data.forEach(callback);
    }

    /**
     * Add all items from some iterable source (e.g. Array). See {#add()}
     * @param iterable items to add.
     */
    addAll(iterable) {
        this.data = [...this.data, ...iterable]
        this.data.sort(this.comparator);
    }

    /**
     * Remove specified item. Item equality is used as in Array.indexOf().
     *
     * @param item to remove
     * @returns {boolean} true if item was found and removed, false otherwise.
     */
    remove(item) {
        let index = this.data.indexOf(item);
        if (index >= 0) {
            this.data.splice(index, 1);
            return true;
        }
        return false;
    }

    /**
     * Return contained items in form of the array (shallow copy of contained data)
     * @returns {Array}
     */
    toArray() {
        return [...this.data];
    }

    /**
     * Iterate over all containing items
     * @returns {*}
     */
    [Symbol.iterator]() {
        return this.data[Symbol.iterator]();
    }
}

// let x = new SortedArray();
// // for( i of [2, 4, 0, 5, 1]) x.add(i);
// x.addAll([2, 4, 0, 5, 1]);
// x.addAll([9,8,7,11,22]);
// console.log(x.data)
// x.remove(7)
// console.log(x.data)
// console.log(x.last)
//
// console.log("--------------------")
// // console.log("-- ex 0 - "+x.removeFirst())
// // console.log("-- ex 0 - "+x.removeLast())
// for( i of x ) { console.log(i); }
// // console.log(x.first);
// // console.log(x.last);
// console.log("--------------------")
// console.log("--------------------"+(new Date() < new Date()))

exports.binarySearch = binarySearch;
exports.SortedArray = SortedArray;
