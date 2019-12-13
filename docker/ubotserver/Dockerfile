# To build:
#   docker build --tag universa/ubotserver:latest --compress -f docker/ubotserver/Dockerfile .
#   docker push universa/ubotserver

FROM universa/u8

WORKDIR /code/cmake-build-release
ENTRYPOINT ["./u8", "../u8scripts/ubotserver/ubotserver.js"]
