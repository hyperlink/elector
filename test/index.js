/* eslint-env mocha */

'use strict'

const Elector = require('../')
const async = require('async')
const _ = require('lodash')
const assert = require('assert')
const uuid = require('uuid')
const zookeeper = require('node-zookeeper-client')
const listeners = ['leader', 'follower']

describe('Elector', function () {
  let electors = []

  afterEach(function (done) {
    async.each(
      electors,
      function (elector, callback) {
        elector.removeAllListeners(listeners)
        if (elector.disconnecting) {
          return callback(null)
        }

        elector.disconnect(callback)
        if (!elector.ownsClient) {
          elector.client.close()
        }
      },
      done
    )
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

  it('should still have one leader after some nodes leave', function (done) {
    electors = _.times(5, createElector)

    assert(electors.length, 5)

    const leaders = []
    const followers = []

    async.series(
      [
        function (callback) {
          connectAndListen(electors, leaders, followers, function (error) {
            assert.equal(leaders.length, 1)
            assert.equal(followers.length, 4)
            callback(error)
          })
        },

        function (callback) {
          const disconnectNodes = _.sampleSize(electors, 2)
          async.each(
            disconnectNodes,
            function (elector, callback) {
              elector.removeAllListeners(listeners)
              elector.disconnect(callback)
            },
            callback
          )
        }
      ],
      function () {
        let leaders = 0
        let followers = 0
        let disconnected = 0
        for (let elector of electors) {
          if (elector.isLeader) {
            leaders++
          } else {
            followers++
          }
          if (elector.disconnecting) {
            disconnected++
          }
        }

        assert.equal(leaders, 1)
        assert.equal(followers, 4)
        assert.equal(disconnected, 2)
        done()
      }
    )
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
      elector.once('leader', cb)
      elector.once('follower', cb)
      elector.on('error', callback)
    },
    callback
  )
}

function createElector () {
  return new Elector({ host: 'localhost:2181' })
}
