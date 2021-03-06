//
//  base64 encoding and decoding with C++.
//  Version: 1.01.00
//

#ifndef BASE64_H_C0CE2A47_D10E_42C9_A27C_C883944E704A
#define BASE64_H_C0CE2A47_D10E_42C9_A27C_C883944E704A

#include <string>
#include <vector>

std::string base64_encode(unsigned char const* , unsigned int len);
std::string base64_decode(std::string const& s);

std::string base64_encode(std::vector<unsigned char> const& v);
inline
std::string base64_encode(std::vector<unsigned char>&& v) {
    return base64_encode(&v[0], v.size());
}
std::vector<unsigned char> base64_decodeToBytes(std::string const& s);

#endif /* BASE64_H_C0CE2A47_D10E_42C9_A27C_C883944E704A */
