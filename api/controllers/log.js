// Used for proper documantation
// eslint-disable-next-line no-unused-vars
const express = require('express');

const fs = require('fs');
const logger = require('../../logger');

const logFileStream = fs.createWriteStream('./logs/mobile.log', {
  flags: 'a',
  autoClose: true,
});

process.on('exit', code => {
  logger.debug('Closing mobile log handler');
  logFileStream.end();
});

/** @namespace */
class LogController {
  // this class depends on log stream
  constructor(stream) {
    this.logStream = stream || logFileStream;
  }

  /**
   * Saves logs coming from mobile app.
   * @param {express.request} req incoming request
   * @param {express.response} res response object
   */
  log(req, res) {
    const timestamp = new Date().toISOString();
    const level = 'debug';
    let message = '';

    req.on('data', chunk => {
      message += chunk;
    });

    req.on('end', () => {
      logger.debug(message);
      this.logStream.write(`${timestamp} [${level}]: ${message}\n`);
      res.status(200).end();
    });
  }

  /**
   * Setup routes for log controller
   * @param {express.application} app application to setup
   */
  setupRoutes(app) {
    // logging for mobile application
    app.post('/api/:token/log', this.log.bind(this));
  }
}

module.exports = LogController;
