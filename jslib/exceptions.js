function Exception(message) {
    this.message = message;
}

function IllegalStateException(message) {
    Exception.call(message)
}
IllegalStateException.prototype = Object.create(Exception.prototype);


function IllegalArgumentException(message) {
    Exception.call(message)
}
IllegalArgumentException.prototype = Object.create(Exception.prototype);



module.exports = {Exception,IllegalStateException,IllegalArgumentException}