//
// Created by Leonid Novikov on 5/7/19.
//

#include "mongooseExt.h"

#ifndef MG_FREE
#define MG_FREE free
#endif

#define MG_SET_PTRPTR(_ptr, _v) \
  do {                          \
    if (_ptr) *(_ptr) = _v;     \
  } while (0)

struct mg_connection *mg_connect_http_base(
    struct mg_mgr *mgr, MG_CB(mg_event_handler_t ev_handler, void *user_data),
    struct mg_connect_opts opts, const char *scheme1, const char *scheme2,
    const char *scheme_ssl1, const char *scheme_ssl2, const char *url,
    struct mg_str *path, struct mg_str *user_info, struct mg_str *host) {
    struct mg_connection *nc = NULL;
    unsigned int port_i = 0;
    int use_ssl = 0;
    struct mg_str scheme, query, fragment;
    char conn_addr_buf[2];
    char *conn_addr = conn_addr_buf;

    if (mg_parse_uri(mg_mk_str(url), &scheme, user_info, host, &port_i, path,
                     &query, &fragment) != 0) {
        MG_SET_PTRPTR(opts.error_string, "cannot parse url");
        goto out;
    }

/* If query is present, do not strip it. Pass to the caller. */
    if (query.len > 0) path->len += query.len + 1;

    if (scheme.len == 0 || mg_vcmp(&scheme, scheme1) == 0 ||
        (scheme2 != NULL && mg_vcmp(&scheme, scheme2) == 0)) {
        use_ssl = 0;
        if (port_i == 0) port_i = 80;
    } else if (mg_vcmp(&scheme, scheme_ssl1) == 0 ||
               (scheme2 != NULL && mg_vcmp(&scheme, scheme_ssl2) == 0)) {
        use_ssl = 1;
        if (port_i == 0) port_i = 443;
    } else {
        goto out;
    }

    mg_asprintf(&conn_addr, sizeof(conn_addr_buf), "tcp://%.*s:%u",
                (int) host->len, host->p, port_i);
    if (conn_addr == NULL) goto out;

    //LOG(LL_DEBUG, ("%s use_ssl? %d %s", url, use_ssl, conn_addr));
    if (use_ssl) {
#if MG_ENABLE_SSL
        /*
             * Schema requires SSL, but no SSL parameters were provided in opts.
             * In order to maintain backward compatibility, use a faux-SSL with no
             * verification.
             */
            if (opts.ssl_ca_cert == NULL) {
              opts.ssl_ca_cert = "*";
            }
#else
        MG_SET_PTRPTR(opts.error_string, "ssl is disabled");
        goto out;
#endif
    }

    if ((nc = mg_connect_opt(mgr, conn_addr, MG_CB(ev_handler, user_data),
                             opts)) != NULL) {
        mg_set_protocol_http_websocket(nc);
    }

    out:
    if (conn_addr != NULL && conn_addr != conn_addr_buf) MG_FREE(conn_addr);
    return nc;
}

struct mg_connection *mg_connect_http_opt1(
    struct mg_mgr *mgr, MG_CB(mg_event_handler_t ev_handler, void *user_data),
    struct mg_connect_opts opts, const char *url, const char *extra_headers,
    const char *post_data, int post_data_len, const char *method) {
    struct mg_str user = MG_NULL_STR, null_str = MG_NULL_STR;
    struct mg_str host = MG_NULL_STR, path = MG_NULL_STR;
    struct mbuf auth;
    struct mg_connection *nc =
            mg_connect_http_base(mgr, MG_CB(ev_handler, user_data), opts, "http",
                                 NULL, "https", NULL, url, &path, &user, &host);

    if (nc == NULL) {
        return NULL;
    }

    mbuf_init(&auth, 0);
    if (user.len > 0) {
        mg_basic_auth_header(user, null_str, &auth);
    }

    if (post_data == NULL) {
        post_data_len = 0;
    }
    if (extra_headers == NULL) extra_headers = "";
    if (path.len == 0) path = mg_mk_str("/");
    if (host.len == 0) host = mg_mk_str("");

    mg_printf(nc, "%s %.*s HTTP/1.1\r\nHost: %.*s\r\nContent-Length: %" SIZE_T_FMT
                  "\r\n%.*s%s\r\n",
              method, (int) path.len, path.p,
              (int) (path.p - host.p), host.p, (size_t)post_data_len, (int) auth.len,
              (auth.buf == NULL ? "" : auth.buf), extra_headers);
    if (post_data_len > 0)
        mg_send(nc, post_data, post_data_len);

    mbuf_free(&auth);
    return nc;
}

mg_dns_resource_record_mem::mg_dns_resource_record_mem(mg_dns_resource_record *msg) {
    name = std::make_shared<byte_vector>();
    name->resize(msg->name.len);
    memset(&(*name)[0], 0, name->size());
    memcpy(&(*name)[0], msg->name.p, msg->name.len);

    rdata = std::make_shared<byte_vector>();
    rdata->resize(msg->rdata.len);
    memset(&(*rdata)[0], 0, rdata->size());
    memcpy(&(*rdata)[0], msg->rdata.p, msg->rdata.len);

    mdrr.name = mg_mk_str_n((char*)&(*name)[0], name->size());
    if (msg->rdata.p == nullptr)
        mdrr.rdata = msg->rdata;
    else
        mdrr.rdata = mg_mk_str_n((char*)&(*rdata)[0], rdata->size());
    mdrr.kind = msg->kind;
    mdrr.ttl = msg->ttl;
    mdrr.rclass = msg->rclass;
    mdrr.rtype = msg->rtype;
}

mg_dns_message_mem::mg_dns_message_mem(mg_dns_message *m) {
    pkt = std::make_shared<byte_vector>();
    pkt->resize(m->pkt.len);
    memset(&(*pkt)[0], 0, pkt->size());
    memcpy(&(*pkt)[0], m->pkt.p, m->pkt.len);
    for (int i = 0; i < MG_MAX_DNS_QUESTIONS; ++i) {
        questions.emplace_back(mg_dns_resource_record_mem(&m->questions[i]));
    }
    for (int i = 0; i < MG_MAX_DNS_ANSWERS; ++i) {
        answers.emplace_back(mg_dns_resource_record_mem(&m->answers[i]));
    }
    msg.flags = m->flags;
    msg.num_answers = m->num_answers;
    msg.num_questions = m->num_questions;
    msg.transaction_id = m->transaction_id;
    msg.pkt = mg_mk_str_n((char*)&(*pkt)[0], pkt->size());
    for (int i = 0; i < MG_MAX_DNS_QUESTIONS; ++i) {
        msg.questions[i] = questions[i].mdrr;
    }
    for (int i = 0; i < MG_MAX_DNS_ANSWERS; ++i) {
        msg.answers[i] = answers[i].mdrr;
    }
}
