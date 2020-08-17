/**
 * Example demonstrates local storage
 */

async function check() {
    await writeLocalStorage({info: 777});
    return (await getLocalStorage()).info;
}