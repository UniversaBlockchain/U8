# U8 Docker image

This is the Docker image for U8: [Universa](https://universablockchain.com)-specific JavaScript runtime engine.

For more details, see the U8 section in [Universa Knowledge Base](https://kb.universablockchain.com): [kb.universablockchain.com/u8/150](https://kb.universablockchain.com/u8/150).

Also, checkout the appropriate [Dockerfile in Github](https://github.com/UniversaBlockchain/U8/blob/master/docker/u8/Dockerfile).


## Usage

Note that if you want to execute some external JavaScript file using U8, you should bind the directory to the image (as in the examples below).

### See help

~~~bash
docker run universa/u8
~~~

### Selftest

~~~bash
docker run universa/u8 --selftest
~~~

### Running some custom `mytest.js` app

Assuming the `mytest.js` file is present in the current directory, you need to run the image while mounting the directory, for the image to see it. In the example below, the current directory (`$(pwd)`) is mounted to the `/src` directory for the image, and the image is executed using the mounted path.

~~~bash
docker run \
    --mount type=bind,source="$(pwd)",target=/src \
    universa/u8 /src/mytest.js
~~~


### Running the prepackaged apps

Some U8 JavaScript apps are available in the `/u8scripts` directory. They are prepackaged into the Docker image, too. 

#### Running `helloworld.js` app

~~~bash
docker run universa/u8 /code/u8scripts/examples/helloworld.js
~~~

It should print `Hello, world!`.

#### Running `helloworld_http.js` app

To use some port-listening app (like `helloworld_http.js`), you need to expose/publish the port being listened

~~~bash
docker run \
    --publish 127.0.0.1:8180:8080/tcp \
    universa/u8 /code/u8scripts/examples/helloworld_http.js
~~~

After this, the script will be available at [http://127.0.0.1:8180/hello](http://127.0.0.1:8180/hello).

#### Running **UBotServer**

**UBotServer** is available as a separate Docker image, [universa/ubotserver](https://hub.docker.com/repository/docker/universa/ubotserver/). Please see the description of the image in [appropriate Github section](https://github.com/UniversaBlockchain/U8/tree/master/docker/ubotserver).

#### Running **node-u8**

**node-u8** is available as a separate Docker image, [universa/node-u8](https://hub.docker.com/repository/docker/universa/node-u8/). Please see the description of the image in [appropriate Github section](https://github.com/UniversaBlockchain/U8/tree/master/docker/node-u8).


## Directory structure

Here is a map of source directories, and their in-image counterparts:

| Source path               | Image-mapped path  |
| ------------------------- | ------------------ |
| [/jslib](/jslib)          | `/code/jslib`      |
| [/u8scripts](/u8scripts)  | `/code/u8scripts`  |


## Read more

All Universa-specific documentation is available in Universa Knowledge Base at [kb.universablockchain.com](https://kb.universablockchain.com).
