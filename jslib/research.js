/*
 * Copyright (c) 2019 Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

research.MemoryUserBase = class {
    constructor(implClass) {
        this.memoryUserImpl = new implClass();
    }

    fill(minBytesToUse) {
        this.memoryUserImpl.__fill(minBytesToUse);
        return this;
    }

    fillAsync(minBytesToUse) {
        return new Promise(resolve => {
            this.memoryUserImpl.__fillAsync(minBytesToUse, async ()=>{
                await sleep(10);
                resolve(this);
            });
        });
    }

    clear() {
        this.memoryUserImpl.__clear();
    }

    check() {
        return this.memoryUserImpl.__check();
    }

    checkAsync() {
        return new Promise(resolve => {
            this.memoryUserImpl.__checkAsync(async (res)=>{
                await sleep(10);
                resolve(res);
            });
        });
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
