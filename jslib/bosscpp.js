let roles = require("roles");

function updateObjectProto(obj) {
    if (obj.constructor.name !== "Object")
        return;
    if (obj.__eval_v8ser != null) {
        eval(obj.__eval_v8ser);
        delete obj.__eval_v8ser;
    }
    for (let k in obj) {
        updateObjectProto(obj[k]);
        if (obj[k].constructor.name === "Array") {
            for (let o in obj[k])
                updateObjectProto(obj[k][o]);
        }
    }
}

module.exports = {updateObjectProto};
