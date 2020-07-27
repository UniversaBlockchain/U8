/**
 * Example demonstrates execution of DNS-requests.
 */

const DNS_TXT = 16;

async function checkDNS() {
    // Execute DNS-request
    return await doDNSRequests("8.8.4.4", 53, [{name: "example.org", type: DNS_TXT}]);
}