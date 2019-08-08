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
    for (let k in obj)
        updateObjectProto(obj[k]);
}

module.exports = {updateObjectProto};
