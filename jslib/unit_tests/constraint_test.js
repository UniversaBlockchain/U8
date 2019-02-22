import {expect, unit, assert} from 'test'

import * as dbm from 'defaultbimapper'
import * as bbm from 'bossbimapper'
import * as constr from 'constraint'
import * as t from 'tools'
import * as d from 'deltas'

unit.test("constraint copy test", () => {

    let c1 = new constr.Constraint(null);
    c1.name = "c1";
    c1.comment = "c1_comment";
    let conds = {};
    conds[constr.Constraint.conditionsModeType.all_of] = ["this.state.data.n1 == 1", "ref.definition.data.s1 == \"string1\""];
    c1.setConditions(conds);

    let c2 = c1.copy();

    c2.baseContract = null;

    let s1 = bbm.BossBiMapper.getInstance().serialize(c1);
    let s2 = bbm.BossBiMapper.getInstance().serialize(c2);

    assert(t.valuesEqual(s1,s2));
    assert(d.Delta.between(null,s1,s2) == null);

    let ds1 = dbm.DefaultBiMapper.getInstance().serialize(c1);
    let ds2 = dbm.DefaultBiMapper.getInstance().serialize(c2);

    assert(t.valuesEqual(ds1,ds2));
    assert(d.Delta.between(null,ds1,ds2) == null);
});

