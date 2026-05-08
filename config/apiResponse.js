function apiResponse( success, message, data = null ) {
    return {
        success,
        message,
        data
    }
}

module.exports = apiResponse;
