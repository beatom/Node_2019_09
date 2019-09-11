// Used for proper documantation
// eslint-disable-next-line no-unused-vars
const express = require('express');

const crypto = require('crypto');
// @ts-ignore
const chargifyConfig = require('../../lib/chargify-module/config');

class WebhooksController {
  constructor(model) {
    this.webhooksModel = model;
  }

  /**
   * Handles customer_create webhook type.
   * @param {express.request} req incoming request
   * @param {express.response} res response object
   */
  customerCreate(req, res) {
    this.webhooksModel.customerCreate(req.body.id, req.body.payload, res);
  }

  /**
   * Handles signup_success webhook type.
   * @param {express.request} req incoming request
   * @param {express.response} res response object
   */
  signUpSuccess(req, res) {
    this.webhooksModel.signUpSuccess(req.body.id, req.body.payload, res);
  }

  /**
   * Handles renewal_success webhook type.
   * @param {express.request} req incoming request
   * @param {express.response} res response object
   */
  renewalSuccess(req, res) {
    this.webhooksModel.renewalSuccess(req.body.id, req.body.payload, res);
  }

  /**
   * Middleware to validate incoming webhook request.
   * [Webhook verification]{@link
   * https://help.chargify.com/webhooks/webhooks-reference.html}
   * in Chargify docs.
   * @param {express.request} req incoming request
   * @param {express.response} res response object
   * @param {Function} next next route to call
   */
  verifyRequest(req, res, next) {
    const hmac = crypto.createHmac('sha256', chargifyConfig.shared_key);

    const signature = req.query.signature_hmac_sha_256 ||
        req.get('X-Chargify-Webhook-Signature-Hmac-Sha-256');

    // to prevent error ERR_INVALID_ARG_TYPE for function hmac.update
    // rawBody property is added in main server.js
    // @ts-ignore
    hmac.update(req.rawBody || '');

    if (signature === hmac.digest('hex')) {
      next();
    } else {
      res.status(403).send('Rejected');
    }
  }

  /**
   * Setup routes for webhooks controller
   * @param {express.application} app application to setup
   */
  setupRoutes(app) {
    // verify all chargify webhooks first
    app.use(/\/api\/webhooks\/.*/, this.verifyRequest.bind(this));

    // actual logic lives here
    app.post('/api/webhooks/customer_create', this.customerCreate.bind(this));
    app.post('/api/webhooks/signup_success', this.signUpSuccess.bind(this));
    app.post('/api/webhooks/renewal_success', this.renewalSuccess.bind(this));
  }
}

module.exports = WebhooksController;
