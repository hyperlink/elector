/* eslint-env mocha */

'use strict'

const Elector = require('../')
const async = require('async')
const _ = require('lodash')
const assert = require('assert')
const uuid = require('uuid')
const zookeeper = require('node-zookeeper-client')

describe('Elector', function () {
  let electors = []

  afterEach(function () {
    for (let elector of electors) {
      elector.disconnect()
    }
  })

  it('should elect one node out of the five as leader', function (done) {
    electors = _.times(5, createElector)

    assert(electors.length, 5)

    const leaders = []
    const followers = []

    connectAndListen(electors, leaders, followers, function (error) {
      assert.equal(leaders.length, 1)
      assert.equal(followers.length, 4)
      done(error)
    })
  })

  it('should take an existing zookeeper client', function (done) {
    const electionPath = '/' + uuid.v4()
    electors = _.times(5, function () {
      const client = zookeeper.createClient('localhost:2181')
      return new Elector(client, electionPath)
    })

    const leaders = []
    const followers = []

    connectAndListen(electors, leaders, followers, function (error) {
      assert.equal(leaders.length, 1)
      assert.equal(followers.length, 4)
      for (let elector of electors) {
        assert.equal(elector.ownsClient, undefined)
      }
      done(error)
    })
  })
})

function connectAndListen (electors, leaders, followers, callback) {
  async.each(
    electors,
    function (elector, callback) {
      elector.connect()
      function cb (error) {
        if (error) {
          return callback(error)
        }
        if (this.isLeader) {
          leaders.push(this.id)
        } else {
          followers.push(this.id)
        }
        callback(null)
      }
      elector.on('leader', cb)
      elector.on('follower', cb)
      elector.on('error', callback)
    },
    callback
  )
}

function createElector () {
  return new Elector({ host: 'localhost:2181' })
}
