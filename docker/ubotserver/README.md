# UBotServer Docker image

This is the Docker image for **UBotServer**: [Universa](https://universablockchain.com)-specific server for running [UBots](https://kb.universablockchain.com/ubots_overview/207).

For more details, please see the appropriate [Dockerfile in Github](https://github.com/UniversaBlockchain/U8/blob/master/docker/ubotserver/Dockerfile).


## Running UBotServer

* Make a logs directory like `logs` (note it won’t be mounted to the image).
* Make a config directory like `ubot_config` (and put the needed data in it, so it will be mountable into the image as `/ubot_config`; see the [/test/config/ubot_config](/test/config/ubot_config) examples in Github); the `ubot_config` directory should contain subdirectories `config` and `tmp`.
* Then run the following command:

~~~bash
docker run \
    --mount type=bind,source="$(pwd)/ubot_config",target=/ubot_config \
    universa/ubotserver \
    --config /ubot_config > logs/log.txt 2> logs/errlog.txt
~~~

Note that for proper execution, you’ll need to have PostgreSQL installed and reachable to the Docker image (you may need to add extra configuration); this may be either dedicated PostgreSQL setup or using the stock [postgres](https://hub.docker.com/_/postgres) Docker image from Docker Hub.


## Read more

All Universa-specific documentation is available in Universa Knowledge Base at [kb.universablockchain.com](https://kb.universablockchain.com).
