FROM snapcore/snapcraft

RUN apt -qq install --yes curl gnupg

RUN curl -sL https://deb.nodesource.com/setup_8.x | bash -
RUN curl -sS https://dl.yarnpkg.com/debian/pubkey.gpg | apt-key add -
RUN echo "deb https://dl.yarnpkg.com/debian/ stable main" | tee /etc/apt/sources.list.d/yarn.list

# add custom tools required for electron-packager
RUN apt -qq update
RUN apt -qq install --yes \
  apt-transport-https \
  nodejs \
  yarn \
  fakeroot \
  dpkg \
  rpm \
  xz-utils \
  xorriso \
  zsync
