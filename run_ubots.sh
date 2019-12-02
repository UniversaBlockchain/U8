#!/bin/bash
./stop_ubots.sh
mkdir ubot_logs
cd build-ubot
for i in `seq 0 29`
do
    nohup ./u8 ../u8scripts/ubotserver/ubotserver.js --config ../test/config/ubot_config/ubot$i/ > ../ubot_logs/log$i.txt 2> ../ubot_logs/err.$i.txt  &
done