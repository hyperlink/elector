# Elector - simple zookeeper based leader election

[![Build Status](https://travis-ci.org/hyperlink/elector.svg?branch=master)](https://travis-ci.org/hyperlink/elector)
[![Greenkeeper badge](https://badges.greenkeeper.io/hyperlink/elector.svg)](https://greenkeeper.io/)
[![npm version](https://badge.fury.io/js/elector.svg)](https://badge.fury.io/js/elector)

## Features

* emits `leader` event when instance has been elected a leader
* emits `follower` event when instance is a follower
* check using `elector.isLeader`

## Install

```bash
npm install --save elector
```

## Usage

```javascript
const Elector = require('elector')

const elector = new Elector({host: 'localhost:2818'})

// connects to zookeeper and starts the election process
elector.connect()

elector.on('leader', function () {
	console.log('I am the supreme leader worship me!');
})

elector.on('follower', function () {
	console.log('I am but a lowly follower :(');
})

// leave the election and closes zookeeper connection
elector.leave();

```


## License
MIT

