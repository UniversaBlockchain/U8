import {expect, unit, assert} from 'test'

import  * as deltas from 'deltas'

unit.test("map", () => {
    let a1 = {a:1,b:2,c:3};
    let b1 = {a:2,d:4};
    let d1 = deltas.Delta.between(null,a1,b1);

    assert(d1 instanceof deltas.MapDelta);
    assert(d1.changes.a instanceof deltas.ChangedItem);
    assert(d1.changes.b instanceof deltas.RemovedItem);
    assert(d1.changes.c instanceof deltas.RemovedItem);
    assert(d1.changes.d instanceof deltas.CreatedItem);
});


unit.test("list", () => {
    let a2 = [1,2,3];
    let b2 = [2,4,3,2,1];
    let d2 = deltas.Delta.between(null,a2,b2);
    assert(d2 instanceof deltas.ListDelta);
    assert(d2.changes[0] instanceof deltas.ChangedItem);
    assert(d2.changes[1] instanceof deltas.ChangedItem);
    assert(d2.changes[3] instanceof deltas.CreatedItem);
    assert(d2.changes[4] instanceof deltas.CreatedItem);

    let a3 = [1,2,3,2,1];
    let b3 = [2,4,3];
    let d3 = deltas.Delta.between(null,a3,b3);
    assert(d3 instanceof deltas.ListDelta);
    assert(d3.changes[0] instanceof deltas.ChangedItem);
    assert(d3.changes[1] instanceof deltas.ChangedItem);
    assert(d3.changes[3] instanceof deltas.RemovedItem);
    assert(d3.changes[4] instanceof deltas.RemovedItem);
});


unit.test("list with subitems", () => {
    let a4 = [1,{a:2,b:1},3,2,1];
    let b4 = [2,{a:2,b:3},3];
    let d4 = deltas.Delta.between(null,a4,b4);
    assert(d4 instanceof deltas.ListDelta);
    assert(d4.changes[0] instanceof deltas.ChangedItem);
    assert(d4.changes[1] instanceof deltas.MapDelta);
    assert(Object.keys(d4.changes[1].changes).length == 1);
    assert(d4.changes[1].changes.b instanceof deltas.ChangedItem);
    assert(d4.changes[3] instanceof deltas.RemovedItem);
    assert(d4.changes[4] instanceof deltas.RemovedItem);
});


unit.test("map with subitems", () => {
    let a5 = {a:1,b:2,c:3,e:[2,2]};
    let b5 = {a:2,d:4,e:[1,2]};
    let d5 = deltas.Delta.between(null,a5,b5);
    assert(d5 instanceof deltas.MapDelta);
    assert(d5.changes.a instanceof deltas.ChangedItem);
    assert(d5.changes.b instanceof deltas.RemovedItem);
    assert(d5.changes.c instanceof deltas.RemovedItem);
    assert(d5.changes.d instanceof deltas.CreatedItem);
    assert(d5.changes.e instanceof deltas.ListDelta);
    assert(Object.keys(d5.changes.e.changes).length == 1);
    assert(d5.changes.e.changes[0] instanceof deltas.ChangedItem);


    let a6 = {role:new roles.Role("role1")};
    let b6 = {role:new roles.Role("role2")};
    let d6 = deltas.Delta.between(null,a6,b6);

    assert(d6 instanceof deltas.MapDelta);
    assert(d6.changes.role instanceof deltas.ChangedItem);


    let a7 = {role:new roles.Role("role1")};
    let b7 = {role:new roles.Role("role1")};
    let d7 = deltas.Delta.between(null,a7,b7);
    a7.role.requiredAnyConstraints.add("ref1");
    b7.role.requiredAnyConstraints.add("ref1");

    assert(d7==null);

    a7.role.requiredAnyConstraints.add("ref2");
    b7.role.requiredAnyConstraints.add("ref3");

    let d8 = deltas.Delta.between(null,a7,b7);

    assert(d8 instanceof deltas.MapDelta);
    assert(d8.changes.role instanceof deltas.ChangedItem);
});