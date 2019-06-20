let t = require("tools");

//Delta/////////////////

class Delta {
    constructor(parent, oldValue, newValue) {
        this.parent = parent;
        this.oldValue = oldValue;
        this.newValue = newValue;
        this.children = new Array();
    }

    registerInParent() {
        if(this.parent && !this.isEmpty()) {
            this.parent.children.push(this);
        }
    }

    isEmpty() {
        return false;
    }

    toString() {
        return "Delta";
    }

    static between(parent, oldValue, newValue) {
        if (oldValue == null && newValue == null)
            return null;
        if (oldValue == null || newValue == null)
            return new ChangedItem(parent, oldValue, newValue);

        if (oldValue instanceof Array && newValue instanceof Array)
            return ListDelta.compare(parent, oldValue, newValue);

        if (Object.getPrototypeOf(oldValue) === Object.prototype && Object.getPrototypeOf(newValue) === Object.prototype)
            return MapDelta.compare(parent, oldValue, newValue);

        return t.valuesEqual(oldValue,newValue) ? null : new ChangedItem(parent, oldValue, newValue);
    }
}


//ChangedItem/////////////////

class ChangedItem extends Delta {
    constructor(parent, oldValue, newValue) {
        super(parent, oldValue, newValue);
    }

    isEmpty() {
        return false;
    }

    toString() {
        return "ChangedItem";
    }
}


//CreatedItem/////////////////

class CreatedItem extends Delta {
    constructor(parent, oldValue, newValue) {
        super(parent, oldValue, newValue);
    }

    isEmpty() {
        return false;
    }

    toString() {
        return "CreatedItem";
    }
}


//RemovedItem/////////////////

class RemovedItem extends Delta {
    constructor(parent, oldValue, newValue) {
        super(parent, oldValue, newValue);
    }

    isEmpty() {
        return false;
    }

    toString() {
        return "RemovedItem";
    }
}


//MapDelta/////////////////

class MapDelta extends Delta {
    constructor(parent, oldMap, newMap) {
        super(parent, oldMap, newMap);
        this.changes = {};

        for (let key in oldMap) {
            if (key === "equals" || key === "stringId")
                continue;

            if(newMap.hasOwnProperty(key)) {
                let d = Delta.between(this, oldMap[key], newMap[key]);
                if(d != null)
                    this.changes[key] = d;
            } else {
                this.changes[key] = new RemovedItem(this, oldMap[key]);
            }
        }

        // detecting new items
        for (let key in newMap) {
            if (key === "equals" || key === "stringId")
                continue;

            if (!oldMap.hasOwnProperty(key) ) {
                this.changes[key] = new CreatedItem(this, newMap[key]);
            }
        }
        this.registerInParent();
    }

    isEmpty() {
        return Object.keys(this.changes).length == 0;
    }

    toString() {
        return "MapDelta";
    }

    static compare(parent, oldMap, newMap) {
        let md = new MapDelta(parent,oldMap,newMap);
        if(md.isEmpty())
            return null;
        else
            return md;
    }
}


//ListDelta/////////////////

class ListDelta extends Delta {
    constructor(parent, tt, uu) {
        super(parent, tt, uu);
        this.changes = {};
        for (let i = 0; i < tt.length; i++) {
            if (i < uu.length) {
                let d = Delta.between(this, tt[i], uu[i]);
                if(d != null)
                    this.changes[i] = d;
            } else {
                this.changes[i] = new RemovedItem(this, tt[i]);
            }
        }
        for (let i = tt.length; i < uu.length; i++) {
            this.changes[i] = new CreatedItem(this, uu[i]);
        }

        this.registerInParent();
    }

    isEmpty() {
        return Object.keys(this.changes).length == 0;
    }

    toString() {
        return "ListDelta";
    }

    static compare(parent, oldValue, newValue) {
        let ld = new ListDelta(parent,oldValue,newValue);
        if(ld.isEmpty())
            return null;
        else
            return ld;
    }
}


module.exports = {ListDelta,MapDelta,Delta,CreatedItem,ChangedItem,RemovedItem};