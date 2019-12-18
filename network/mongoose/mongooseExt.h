//
// Created by Leonid Novikov on 5/7/19.
//

#ifndef U8_MONGOOSEEXT_H
#define U8_MONGOOSEEXT_H

#include "mongoose.h"

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

struct mg_connection *mg_connect_http_base(
    struct mg_mgr *mgr, MG_CB(mg_event_handler_t ev_handler, void *user_data),
    struct mg_connect_opts opts, const char *scheme1, const char *scheme2,
    const char *scheme_ssl1, const char *scheme_ssl2, const char *url,
    struct mg_str *path, struct mg_str *user_info, struct mg_str *host);

struct mg_connection *mg_connect_http_opt1(
    struct mg_mgr *mgr, MG_CB(mg_event_handler_t ev_handler, void *user_data),
    struct mg_connect_opts opts, const char *url, const char *extra_headers,
    const char *post_data, int post_data_len, const char *method);

#endif //U8_MONGOOSEEXT_H
