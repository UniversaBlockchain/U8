mkdir -p ./u8-deb/usr/bin
cp ./cmake-build-monolith-release/u8 ./u8-deb/usr/bin/u8
fakeroot dpkg-deb --build u8-deb
rm ./u8-deb/usr/bin/u8

# check package: lintian u8-deb.deb
# install package: sudo apt -f install ./u8-deb.deb
