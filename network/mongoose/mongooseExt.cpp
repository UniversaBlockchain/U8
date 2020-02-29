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

int mg_dns_reply_record_mx(struct mg_dns_reply *reply,
                           struct mg_dns_resource_record *question,
                           const char *name, int rtype, int ttl, const void *rdata,
                           size_t rdata_len, uint16_t preference) {
  struct mg_dns_message *msg = (struct mg_dns_message *) reply->msg;
  char rname[512];
  struct mg_dns_resource_record *ans = &msg->answers[msg->num_answers];
  if (msg->num_answers >= MG_MAX_DNS_ANSWERS) {
    return -1; /* LCOV_EXCL_LINE */
  }

  if (name == NULL) {
    name = rname;
    rname[511] = 0;
    mg_dns_uncompress_name(msg, &question->name, rname, sizeof(rname) - 1);
  }

  *ans = *question;
  ans->kind = MG_DNS_ANSWER;
  ans->rtype = rtype;
  ans->ttl = ttl;

  if (mg_dns_encode_record_mx(reply->io, ans, name, strlen(name), rdata,
                           rdata_len, preference) == -1) {
    return -1; /* LCOV_EXCL_LINE */
  };

  msg->num_answers++;
  return 0;
}

int mg_dns_encode_record_mx(struct mbuf *io, struct mg_dns_resource_record *rr,
                            const char *name, size_t nlen, const void *rdata,
                            size_t rlen, uint16_t preference) {
  size_t pos = io->len;
  uint16_t u16;
  uint32_t u32;

  if (rr->kind == MG_DNS_INVALID_RECORD) {
    return -1; /* LCOV_EXCL_LINE */
  }

  if (mg_dns_encode_name(io, name, nlen) == -1) {
    return -1;
  }

  u16 = htons(rr->rtype);
  mbuf_append(io, &u16, 2);
  u16 = htons(rr->rclass);
  mbuf_append(io, &u16, 2);

  if (rr->kind == MG_DNS_ANSWER) {
    u32 = htonl(rr->ttl);
    mbuf_append(io, &u32, 4);

    if (rr->rtype == MG_DNS_MX_RECORD) {
      int clen;
      /* fill size after encoding */
      size_t off = io->len;
      mbuf_append(io, &u16, 2);
      u16 = htons(preference);
      mbuf_append(io, &u16, 2);
      if ((clen = mg_dns_encode_name(io, (const char *) rdata, rlen)) == -1) {
        return -1;
      }
      u16 = clen+2;
      io->buf[off] = u16 >> 8;
      io->buf[off + 1] = u16 & 0xff;
    } else {
      u16 = htons((uint16_t) rlen);
      mbuf_append(io, &u16, 2);
      mbuf_append(io, rdata, rlen);
    }
  }

  return io->len - pos;
}
