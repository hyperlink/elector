/* eslint-env mocha */

'use strict'

const Elector = require('../')
const async = require('async')
const _ = require('lodash')
const assert = require('assert')

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
      function (error) {
        assert.equal(leaders.length, 1)
        assert.equal(followers.length, 4)
        done(error)
      }
    )
  })
})

function createElector () {
  return new Elector({ host: 'localhost:2181' })
}
