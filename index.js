'use strict'

const debug = require('debug')('elector')
const zookeeper = require('node-zookeeper-client')
const async = require('async')
const _ = require('lodash')
const EventEmitter = require('events')

class Elector extends EventEmitter {
  constructor (zkOptions, electionPath = '/election') {
    super()
    this.id = null
    this.electionPath = electionPath

    if (this._isZkClient(zkOptions)) {
      this.client = zkOptions
    } else {
      this.client = zookeeper.createClient(zkOptions.host)
      this.ownsClient = true
    }
    this.client.once('connected', () => this._onConnect())
  }

  connect () {
    this.client.connect()
  }

  _isZkClient (client) {
    return (
      _.isObject(client) && 'connectionManager' in client && 'close' in client
    )
  }

  _onConnect () {
    debug('connected!')
    async.waterfall(
      [
        callback => {
          debug('creating election path "%s"', this.electionPath)
          this.client.mkdirp(this.electionPath, callback)
        },

        (path, callback) => {
          debug('created path: "%s"', path)
          debug('creating EPHEMERAL_SEQUENTIAL node')
          this.client.create(
            `${this.electionPath}/p_`,
            zookeeper.CreateMode.EPHEMERAL_SEQUENTIAL,
            callback
          )
        },

        (path, callback) => {
          debug('newly created znode is "%s"', path)
          this.id = _.last(path.split('/'))
          debug('my candidateId is', this.id)
          this.emit('candidateId', this.id)
          this._listCandidates(callback)
        },

        (candidates, callback) =>
          this._watchSiblingCandidateIf(candidates, callback)
      ],
      (error, candidates) => {
        if (error) {
          return console.error(error)
        }
        debug('%s received candidates %j', this.id, candidates)
        this._pickLeader(candidates)
      }
    )
  }

  _watchSiblingCandidateIf (candidates, callback) {
    this.candidates = candidates.sort()
    this.watchingCandidate = candidates[candidates.indexOf(this.id) - 1]

    if (this.watchingCandidate) {
      const watchPath = `${this.electionPath}/${this.watchingCandidate}`

      debug(`${this.id} watching for changes to "${watchPath}"`)

      this.client.exists(
        watchPath,
        event => this._onCandidateChange(event),
        (error, stat) => {
          if (error) {
            return callback(error)
          }
          if (!stat) {
            return callback(
              new Error(
                `${this.id} sibling node "${watchPath}" does not exist!`
              )
            )
          }
          callback(null, this.candidates)
        }
      )
      return
    }
    debug('%s I got no sibling candidates to watch. Am I the leader?', this.id)
    callback(null, this.candidates)
  }

  _pickLeader (candidates) {
    const previousLeadershipState = this.isLeader
    this.isLeader = _.first(candidates) === this.id

    if (previousLeadershipState !== this.isLeader) {
      if (this.isLeader) {
        debug('%s I am the leader!', this.id)
        this.emit('leader')
      } else {
        this.emit('follower')
        debug('%s I am a follower', this.id)
      }
    } else {
      debug('%s state is the same', this.id)
    }
  }

  _onCandidateChange (event) {
    if (this.disconnecting) {
      debug(
        '%s is disconnecting ignoring watch event from %s',
        this.id,
        this.watchingCandidate
      )
      return
    }
    debug('%s received change event %j', this.id, event)

    this._listCandidates((error, candidates) => {
      if (this.disconnecting) {
        debug('%s in disconnecting state after _listCandidates', this.id)
        return
      }

      if (error) {
        debug(error)
        this.emit('error', error)
        return
      }

      debug('%s received new candidates %j', this.id, candidates)

      this._watchSiblingCandidateIf(candidates, (error, candidates) => {
        if (this.disconnecting) {
          debug(
            '%s in disconnecting state after _watchSiblingCandidateIf',
            this.id
          )
          return
        }
        if (error) {
          debug(error)
          return this.emit(error)
        }
        this._pickLeader(candidates)
      })
    })
  }

  _listCandidates (callback) {
    this.client.getChildren(this.electionPath, function (
      error,
      candidates,
      stats
    ) {
      if (error) {
        return callback(error)
      }
      callback(null, candidates)
    })
  }

  disconnect (callback) {
    debug('%s disconnecting', this.id)
    this.disconnecting = true
    this.client.remove(`${this.electionPath}/${this.id}`, error => {
      if (this.ownsClient) {
        this.client.close()
      }
      if (error) {
        debug(error)
        return callback(error)
      }
      callback(null)
    })
  }
}

module.exports = Elector
