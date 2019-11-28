# U8 Docker image

This is the Docker image for U8: [Universa](https://universablockchain.com)-specific JavaScript runtime engine.

For more details, see the U8 section in [Universa Knowledge Base](https://kb.universablockchain.com): [kb.universablockchain.com/u8/150](https://kb.universablockchain.com/u8/150).

Also, checkout the appropriate [Dockerfile in Github](https://github.com/UniversaBlockchain/U8/blob/master/docker/u8/Dockerfile).


## Usage

Note that if you want to execute some JavaScript file using U8, you should bind the directory to the image (as in the examples below).

### See help

~~~bash
docker run universa/u8
~~~

### Selftest

~~~bash
docker run universa/u8 --selftest
~~~

### Running `helloworld.js` app

Using the [/examples/helloworld.js](https://github.com/UniversaBlockchain/U8/blob/master/examples/helloworld.js) source from Github,
run the following command in the root directory of the U8 source codebase:

~~~bash
docker run \
    --mount type=bind,source="$(pwd)/examples",target=/src \
    universa/u8 /src/helloworld.js
~~~

It should print `Hello, world!`.

### Running `helloworld_http.js` app 

Using the [/examples/helloworld_http.js](https://github.com/UniversaBlockchain/U8/blob/master/examples/helloworld_http.js) source from Github,
run the following command in the root directory of the U8 source codebase:

~~~bash
docker run \
    --mount type=bind,source="$(pwd)/examples",target=/src \
    --publish 127.0.0.1:8180:8080/tcp \
    universa/u8 /src/helloworld_http.js
~~~

After this, the script will be available at [http://127.0.0.1:8180/hello](http://127.0.0.1:8180/hello).

### Running UBotServer

* Make a logs directory like `logs`;
* make a config directory like `ubot_config` (and put the needed data in it; see the [/test/config/ubot_config](https://github.com/UniversaBlockchain/U8/tree/master/test/config/ubot_config) examples in Github);
* then run the following command in the root directory of the U8 source taken from Github):

~~~bash
docker run \
    --mount type=bind,source="$(pwd)",target=/src \
    --mount type=bind,source="$(pwd)/logs",target=/ubot_logs \
    --mount type=bind,source="$(pwd)/ubot_config",target=/ubot_config \
    universa/u8 \
    /src/ubot.js --config /ubot_config > /ubot_logs/log.txt 2> /ubot_logs/errlog.txt
~~~
