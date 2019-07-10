research.MemoryUserBase = class {
    constructor(implClass) {
        this.memoryUser1Impl = new implClass();
    }

    fill(minBytesToUse) {
        this.memoryUser1Impl.__fill(minBytesToUse);
        return this;
    }

    fillAsync(minBytesToUse) {
        return new Promise(resolve => {
            this.memoryUser1Impl.__fillAsync(minBytesToUse, ()=>{resolve(this);});
        });
    }

    clear() {
        this.memoryUser1Impl.__clear();
    }

    check() {
        return this.memoryUser1Impl.__check();
    }
};

research.MemoryUser1 = class extends research.MemoryUserBase {
    constructor() {
        super(research.MemoryUser1Impl);
    }
};

research.MemoryUser2 = class extends research.MemoryUserBase {
    constructor() {
        super(research.MemoryUser2Impl);
    }
};

research.MemoryUser3 = class extends research.MemoryUserBase {
    constructor() {
        super(research.MemoryUser3Impl);
    }
};

module.exports = research;
