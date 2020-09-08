#ifndef __NO_PRNG_H_
#define __NO_PRNG_H_

struct ltc_prng_descriptor* no_prng_desc_get(void);
void no_prng_desc_free(struct ltc_prng_descriptor*);

#endif // NO_PRNG
