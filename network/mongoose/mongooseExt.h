//
// Created by Leonid Novikov on 5/7/19.
//

#ifndef U8_MONGOOSEEXT_H
#define U8_MONGOOSEEXT_H

#include "mongoose.h"

struct mg_connection *mg_connect_http_base(
    struct mg_mgr *mgr, MG_CB(mg_event_handler_t ev_handler, void *user_data),
    struct mg_connect_opts opts, const char *scheme1, const char *scheme2,
    const char *scheme_ssl1, const char *scheme_ssl2, const char *url,
    struct mg_str *path, struct mg_str *user_info, struct mg_str *host);

struct mg_connection *mg_connect_http_opt1(
    struct mg_mgr *mgr, MG_CB(mg_event_handler_t ev_handler, void *user_data),
    struct mg_connect_opts opts, const char *url, const char *extra_headers,
    const char *post_data, const char *method);

#endif //U8_MONGOOSEEXT_H
