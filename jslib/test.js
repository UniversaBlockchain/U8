/*
 * Copyright (c) 2019-present Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

let currentTest = undefined;
let currentSection = undefined;
let passedTestsCount = 0;
let passedChecksCount = 0;
let failedCheckssCount = 0;
let failedTestsCount = 0;

const allTests = [];


function checkPassed() {
    passedChecksCount++;
    console.logPut('.');
}

function checkPassedSilent() {
    passedChecksCount++;
}

function checkFailed(message) {
    failedCheckssCount++;
    throw new unit.TestFailed("failed: " + message);
}

function check(condition, message) {
    if (!condition)
        checkFailed(message);
    else
        checkPassed();
}

const expect = {
    equal(a, b) {
        if (typeof (a.equals) == 'function') check(a.equals(b), `'${a}' equals '${b}'`);
        else if (typeof (b.equals) == 'function') check(a.equals(b), `''${b}' equals ${a}'`);
        else check(a === b, `'${a}' == '${b}'`);
    },
    equalArrays(a, b) {
        check(equalArrays(a, b), `arrays should be equal:\n1: ${a}\n2: ${b}`);
    },
    notEqualArrays(a, b) {
        check(!equalArrays(a, b), `arrays should not be equal:\n> 1/2 ${a}`);
    },
    notEqual(a, b) {
        if (typeof a.equals === 'function') return check(!a.equals(b), `'${a}' != '${b}'`);
        if (typeof b.equals === 'function') return check(!a.equals(b), `'${a}' != '${b}'`);
        return check(a === b, `'${a}' ≠ '${b}'`);
    },
    async throws(p1, p2) {
        let [errorClass, block] = p2 !== undefined ? [p1, p2] : [undefined, p1];
        try {
            await block();
        } catch (e) {
            if (errorClass && !(e instanceof errorClass))
                checkFailed(`expected exception ${errorClass.name} but ${e.constructor.name} was thrown:\n${e.stack}\n`);
            checkPassed();
            return;
        }
        checkFailed("expected exception was not raised");
    },
    that(condition, message) {
        if (!condition)
            checkFailed(message || "condition failed");
        else
            checkPassed();
    },
    silentThat(condition, message) {
        if (!condition)
            checkFailed(message || "condition failed");
        else
            checkPassedSilent();
    }
};

const unit = {
    test(name, block) {
        allTests.push([name, block]);
    },
    TestFailed: class extends Error {
    },
    async perform() {
        for (let [name, block] of allTests) {
            try {
                console.logPut(`[${name}]`);
                currentTest = name;
                await block();
                passedTestsCount++;
                console.log("ok");
            } catch (e) {
                console.log("FAILED!");
                console.error(e.message);
                console.error(e.stack);
                failedTestsCount++;
            }
        }
        let totalTests = failedTestsCount + passedTestsCount;
        if( failedTestsCount > 0) {
            console.error(`----- TESTS FAILED: ${failedTestsCount} of ${totalTests}, ${failedTestsCount/totalTests*100}% ------`);
        }
        else
            console.log(`all tests passed: ${totalTests} test(s), ${passedChecksCount} check(s).`);
        return failedTestsCount > 0 ? 1000 : 0;
    },
    fail(message) {
        checkFailed(message);
    }
};

// shortcuts
expect.eq = expect.equal;
expect.ne = expect.notEqual;

let assert = expect.that;
let assertSilent = expect.silentThat;

module.exports = {unit, expect, assert, assertSilent};
