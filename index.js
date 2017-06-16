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
        }
      ],
      (error, candidates) => {
        if (error) {
          return console.error(error)
        }
        debug('received candidates', candidates)
        this._pickLeader(candidates)
      }
    )
  }

  _pickLeader (candidates) {
    const previousLeadershipState = this.isLeader
    this.isLeader = _.first(candidates.sort()) === this.id

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
      return
    }

    this._listCandidates((error, candidates) => {
      if (error) {
        debug(error)
        this.emit('error', error)
        return
      }
      debug('new candidates', candidates)
      this._pickLeader(candidates)
    })
  }

  _listCandidates (callback) {
    this.client.getChildren(
      this.electionPath,
      event => this._onCandidateChange(event),
      (error, candidates, stats) => {
        if (error) {
          return callback(error)
        }
        callback(null, candidates)
      }
    )
  }

  disconnect () {
    debug('disconnecting')
    this.disconnecting = true
    this.client.remove(`${this.electionPath}/${this.id}`, error => {
      if (this.ownsClient) {
        this.client.close()
      }
      if (error) {
        return debug(error)
      }
    })
  }
}

module.exports = Elector
