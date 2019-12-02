# node-u8 Docker image

This is the Docker image for **node-u8**: U8-based implementation of [Universa](https://universablockchain.com) node.

For more details, please see the appropriate [Dockerfile in Github](https://github.com/UniversaBlockchain/U8/blob/master/docker/node-u8/Dockerfile).

**WARNING:** the U8-based implementation of Node is provided strictly for Early Access.


## Running node-u8

Use the following command:

~~~bash
docker run universa/node-u8
~~~

Note that for proper execution, you’ll need to have PostgreSQL installed and reachable to the Docker image (you may need to add extra configuration); this may be either dedicated PostgreSQL setup or using the stock [postgres](https://hub.docker.com/_/postgres) Docker image from Docker Hub.

Also you may need to specify the node configuration directory (and mount it to the Docker image).


## Read more

All Universa-specific documentation is available in Universa Knowledge Base at [kb.universablockchain.com](https://kb.universablockchain.com).
