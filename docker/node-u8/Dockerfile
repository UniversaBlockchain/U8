# To build:
#   docker build --tag universa/node-u8:latest --compress -f docker/node-u8/Dockerfile .
#   docker push universa/node-u8

FROM universa/u8

WORKDIR /code/cmake-build-release
ENTRYPOINT ["./u8", "../u8scripts/node/node.js"]
