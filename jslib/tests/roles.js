let roles = require("roles");
let dbm = require("defaultbimapper");
let t = require("tools");
async function main() {

    let role = new roles.Role("name");

    assert(role.isAllowedForKeys([]));

    role.requiredAnyReferences.add("ref1");

    assert(!role.isAllowedForKeys([]));

    assert(role.isAllowedForReferences(new Set(["ref1"])));

    role.requiredAllReferences.add("ref2");
    role.requiredAllReferences.add("ref3");

    assert(!role.isAllowedForReferences(new Set(["ref1","ref2"])));
    assert(role.isAllowedForReferences(new Set(["ref1","ref2","ref3"])));


    let roleLink = new roles.RoleLink("name1","name2");

    let s1 = dbm.DefaultBiMapper.getInstance().serialize(roleLink);
    console.log(JSON.stringify(s1));


    let listRole = new roles.ListRole("list");
    listRole.mode = roles.ListRoleMode.QUORUM;
    listRole.quorumSize = 1;
    listRole.roles.push(roleLink);

    let s2 = dbm.DefaultBiMapper.getInstance().serialize(listRole);
    console.log(JSON.stringify(s2));

    let dRoleLink = dbm.DefaultBiMapper.getInstance().deserialize(s1);
    let dListRole = dbm.DefaultBiMapper.getInstance().deserialize(s2);


    assert(t.valuesEqual(roleLink,dRoleLink));
    assert(t.valuesEqual(listRole,dListRole));
}