//
// Created by Leonid Novikov on 5/7/19.
//

#ifndef U8_MONGOOSEEXT_H
#define U8_MONGOOSEEXT_H

#include "mongoose.h"
#include "../../tools/tools.h"
#include <memory>

//////////////////////////////////////////////////////////
//// for IPv6 support, do manually fix in mongoose.c
//// (still not fixed in in 6.16)
/*

in mg_socket_if_connect_tcp
-- nc->sock = socket(AF_INET; SOCK_STREAM, proto);
...
-- rc = connect(nc->sock, &sa->sa,(sizeof) sa->sa.sin);

++ socklen_t sa_len = (sa->sa.sa_family ==AF_INET) ? sizeof(sa->sin) : sizeof(sa->sin6);
++ nc->sock = socket(sa->sa.sa_family;SOCK_STREAM, proto);
...
++  rc = connect(nc->sock, &sa->sa, sa_len);

*/
//// for IPv6 support, do manually fix in mongoose.c
//////////////////////////////////////////////////////////

//////////////////////////////////////////////////////////
//// for DNS support, do manually fix in mongoose.c
/*

added parameter 'port' to  function mg_resolve_async_opt

*/
//// for DNS support, do manually fix in mongoose.c
//////////////////////////////////////////////////////////

struct mg_connection *mg_connect_http_base(
    struct mg_mgr *mgr, MG_CB(mg_event_handler_t ev_handler, void *user_data),
    struct mg_connect_opts opts, const char *scheme1, const char *scheme2,
    const char *scheme_ssl1, const char *scheme_ssl2, const char *url,
    struct mg_str *path, struct mg_str *user_info, struct mg_str *host);

struct mg_connection *mg_connect_http_opt1(
    struct mg_mgr *mgr, MG_CB(mg_event_handler_t ev_handler, void *user_data),
    struct mg_connect_opts opts, const char *url, const char *extra_headers,
    const char *post_data, int post_data_len, const char *method);

int mg_dns_reply_record_mx(struct mg_dns_reply *reply,
                        struct mg_dns_resource_record *question,
                        const char *name, int rtype, int ttl, const void *rdata,
                        size_t rdata_len, uint16_t preference);

int mg_dns_encode_record_mx(struct mbuf *io, struct mg_dns_resource_record *rr,
                         const char *name, size_t nlen, const void *rdata,
                         size_t rlen, uint16_t preference);

#endif //U8_MONGOOSEEXT_H
