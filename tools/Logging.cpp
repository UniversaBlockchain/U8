//
// Created by Sergey Chernov on 2019-01-07.
//

#include "Logging.h"

int Logging::min_log_level;
std::ostream* Logging::out;
std::ostream* Logging::err;
Logging::constructor Logging::constr; // NOLINT(cert-err58-cpp)
