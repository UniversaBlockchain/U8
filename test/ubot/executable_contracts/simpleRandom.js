/**
 * Example demonstrates the simple pool random calculation.
 */

/**
 * Return simple pool random with given range.
 *
 * @param {number} range - range for pool random.
 * @return {Promise<number>} - pool random.
 */
async function getRandom(range) {
    return Math.floor(await poolRandom() * range);
}