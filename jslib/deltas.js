let t = require("tools");

//Delta/////////////////

function Delta(parent, oldValue, newValue) {
    this.parent = parent;
    this.oldValue = oldValue;
    this.newValue = newValue;
    this.children = new Array();
}

Delta.prototype.registerInParent = function () {
    if(this.parent && !this.isEmpty()) {
        this.parent.children.push(this);
    }
};

Delta.prototype.isEmpty = function() {
    return false;
};

Delta.between = function (parent, oldValue, newValue) {
    if (oldValue == null && newValue == null)
        return null;
    if (oldValue == null || newValue == null)
        return new ChangedItem(parent, oldValue, newValue);

    if (oldValue instanceof Array && newValue instanceof Array)
        return ListDelta.compare(parent, oldValue, newValue);

    if (Object.getPrototypeOf(oldValue) === Object.prototype && Object.getPrototypeOf(newValue) === Object.prototype)
        return MapDelta.compare(parent, oldValue, newValue);

    return t.valuesEqual(oldValue,newValue) ? null : new ChangedItem(parent, oldValue, newValue);
};

Delta.prototype.toString = function () {
    return "Delta";
};


//ChangedItem/////////////////

function ChangedItem(parent, oldValue, newValue) {
    Delta.call(this,parent,oldValue,newValue);
}
ChangedItem.prototype = Object.create(Delta.prototype);

ChangedItem.prototype.isEmpty = function() {
    return false;
};


ChangedItem.prototype.toString = function () {
    return "ChangedItem";
};

//CreatedItem/////////////////

function CreatedItem(parent, oldValue, newValue) {
    Delta.call(this,parent,oldValue,newValue);
}
CreatedItem.prototype = Object.create(Delta.prototype);

CreatedItem.prototype.isEmpty = function() {
    return false;
};


CreatedItem.prototype.toString = function () {
    return "CreatedItem";
};
//RemovedItem/////////////////

function RemovedItem(parent, oldValue, newValue) {
    Delta.call(this,parent,oldValue,newValue);
}
RemovedItem.prototype = Object.create(Delta.prototype);

RemovedItem.prototype.isEmpty = function() {
    return false;
};


RemovedItem.prototype.toString = function () {
    return "RemovedItem";
};

//MapDelta/////////////////

function MapDelta(parent, oldMap, newMap) {
    Delta.call(this,parent,oldMap,newMap);
    this.changes = {};

    for (let key in oldMap) {
        if(key === "equals")
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
        if(key === "equals")
            continue;

        if (!oldMap.hasOwnProperty(key) ) {
            this.changes[key] = new CreatedItem(this, newMap[key]);
        }
    }
    this.registerInParent();
}

MapDelta.prototype = Object.create(Delta.prototype);

MapDelta.prototype.isEmpty = function() {
    return Object.keys(this.changes).length == 0;
};

MapDelta.compare = function(parent, oldMap, newMap) {
    let md = new MapDelta(parent,oldMap,newMap);
    if(md.isEmpty())
        return null;
    else
        return md;
};


MapDelta.prototype.toString = function () {
    return "MapDelta";
};


//ListDelta/////////////////

function ListDelta(parent, tt, uu) {
    Delta.call(this,parent,tt,uu);
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

ListDelta.prototype = Object.create(Delta.prototype);

ListDelta.prototype.isEmpty = function() {
    return Object.keys(this.changes).length == 0;
}


ListDelta.compare = function(parent, oldValue, newValue) {
    let ld = new ListDelta(parent,oldValue,newValue);
    if(ld.isEmpty())
        return null;
    else
        return ld;
};



ListDelta.prototype.toString = function () {
    return "ListDelta";
};

module.exports = {ListDelta,MapDelta,Delta,CreatedItem,ChangedItem,RemovedItem};