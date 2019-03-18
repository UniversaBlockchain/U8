
class IllegalStateError extends Error {
    constructor(message = undefined) {
        super()
    }
}

class IllegalArgumentError extends Error {
    constructor(message = undefined) {
        super()
    }
}



module.exports = {IllegalStateError,IllegalArgumentError}