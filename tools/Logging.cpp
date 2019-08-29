/*
 * Copyright (c) 2019 Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

#include "Logging.h"

int Logging::min_log_level;
std::ostream* Logging::out;
std::ostream* Logging::err;
Logging::constructor Logging::constr; // NOLINT(cert-err58-cpp)
