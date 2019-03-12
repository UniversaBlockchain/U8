function Exception(message) {
    this.message = message;
    this.stack = new Error().stack;
}

function IllegalStateException(message) {
    Exception.call(this, message)
}
IllegalStateException.prototype = Object.create(Exception.prototype);


function IllegalArgumentException(message) {
    Exception.call(this, message)
}
IllegalArgumentException.prototype = Object.create(Exception.prototype);



module.exports = {Exception,IllegalStateException,IllegalArgumentException}