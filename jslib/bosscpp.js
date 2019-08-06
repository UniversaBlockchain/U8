let roles = require("roles");

function updateObjectProto(obj) {
    switch (obj.constructor.name) {
        case "HashIdImpl":
            obj.__proto__ = crypto.HashId.prototype;
            return;
        case "PublicKeyImpl":
            obj.__proto__ = crypto.PublicKey.prototype;
            return;
    }

    if (obj.constructor.name !== "Object" && obj.constructor.name !== "Array")
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
